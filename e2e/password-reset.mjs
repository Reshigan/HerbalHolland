// End-to-end test of the staff "forgot password" flow (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/password-reset.mjs [outdir]   (seeded demo data)
// The link is emailed, so the test signs one itself with the app's key (SESSION_SECRET from the environment or .dev.vars),
// the same way src/server/password-reset.ts does. Checks: the forgot form answers the same for a real and an unknown email;
// a forged, tampered or expired link lands on "expired"; a weak or mismatched password is refused; a good one is saved,
// signs out every other session, writes the audit row, and the old password stops working; the used link stops working.
// Re-runnable: the account's password hash, flags and sessions are put back at the end.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-password-reset";
mkdirSync(out, { recursive: true });
const db = createDb();
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const vars = existsSync(".dev.vars") ? Object.fromEntries(readFileSync(".dev.vars", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])) : {};
const SECRET = process.env.SESSION_SECRET || vars.SESSION_SECRET || "dev";
const mac = (body) => createHmac("sha256", SECRET).update(`password-reset:${body}`).digest("base64url");
const fingerprint = (hash) => createHash("sha256").update(hash ?? "").digest("hex").slice(0, 16);
const sign = (u, exp = Date.now() + 30 * 60_000) => { const body = `${u.id}.${exp}.${fingerprint(u.passwordHash)}`; return `${body}.${mac(body)}`; };

const EMAIL = "manager.pta01@herbalholland.com";
const NEW_PASSWORD = `Quiet river ${Date.now().toString(36)} stones`;

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const problems = [];
let current = "";
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => { throw new Error(msg); };
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => ((current = s), console.log(`\n▸ ${s}`));
let n = 0;
const shot = (page, name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` }).catch(() => undefined);
async function session(who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`[${who}] pageerror during “${current}”: ${e.message}`)));
  const page = await ctx.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  return { ctx, page };
}
async function hydrated(locator) {
  const el = locator.first();
  await el.waitFor();
  for (let i = 0; i < 600; i++) {
    if (await el.evaluate((e) => Object.keys(e).some((k) => k.startsWith("__reactProps"))).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`never hydrated: ${el}`);
}
const expiredNotice = (page) => page.getByText("That link has expired or was already used").first();

const user = await one(`SELECT id, name, "passwordHash", "mustChangePassword", "tempPasswordUntil", "passwordFails", "passwordLockedAt" FROM "User" WHERE email = $1`, [EMAIL]);
if (!user?.passwordHash) fail(`${EMAIL} has no password: seed the demo data`);
const started = new Date(Date.now() - 1000);
const sessionsBefore = (await q(`SELECT id FROM "Session" WHERE "userId" = $1`, [user.id])).map((r) => r.id);

try {
  step("The forgot form answers the same for a real and an unknown email");
  {
    const { ctx, page } = await session("forgot");
    for (const email of [EMAIL, `nobody-${Date.now()}@example.com`]) {
      await page.goto(`${BASE}/login/forgot`);
      await hydrated(page.getByRole("button", { name: "Email me a reset link" }));
      await page.getByLabel("Work email").fill(email);
      await page.getByRole("button", { name: "Email me a reset link" }).click();
      await page.getByText("If that email belongs to a staff account").first().waitFor();
      ok(`same notice for ${email.startsWith("nobody") ? "an unknown" : "a real"} email`);
    }
    await shot(page, "forgot-sent");
    await ctx.close();
  }

  step("A forged, tampered or expired link is refused");
  {
    const { ctx, page } = await session("bad links");
    const good = sign(user);
    const bad = {
      "no token": "",
      "garbage": "abc",
      "wrong signature": `${good.slice(0, good.lastIndexOf("."))}.${mac("other")}`,
      "tampered user id": `nobody${good.slice(good.indexOf("."))}`,
      "expired": sign(user, Date.now() - 1000),
      "issued for an older password": (() => { const body = `${user.id}.${Date.now() + 60_000}.${fingerprint("old")}`; return `${body}.${mac(body)}`; })(),
    };
    for (const [what, t] of Object.entries(bad)) {
      await page.goto(`${BASE}/login/reset?t=${encodeURIComponent(t)}`);
      await expiredNotice(page).waitFor();
      assert(page.url().includes("/login/forgot?expired=1"), `${what}: sent to "expired"`);
    }
    await ctx.close();
  }

  // A second signed-in session, which the reset must end.
  const other = await session("other device");
  await other.page.goto(`${BASE}/api/auth/demo?email=${encodeURIComponent(EMAIL)}&next=/store/PTA01`);
  await other.page.waitForURL(/\/store\/PTA01/);
  ok("signed in on another device");

  step("A weak or mismatched password is refused; a good one is saved");
  const token = sign(user);
  {
    const { ctx, page } = await session("reset");
    await page.goto(`${BASE}/login/reset?t=${encodeURIComponent(token)}`);
    const save = page.getByRole("button", { name: "Save password and sign in" });
    await hydrated(save);
    assert(await page.getByText(EMAIL).first().isVisible(), "the page names the account");
    // The browser refuses a short password first (minLength); switch that off so the server's own check is tested too.
    assert(await page.locator("#next").getAttribute("minlength") === "10", "the browser asks for at least 10 characters");
    await page.locator("form").first().evaluate((f) => { f.noValidate = true; });
    const tries = [
      ["short", "short", "Use at least 10 characters."],
      ["password123", "password123", "That's one of the most common passwords"],
      ["manager.pta01 is me", "manager.pta01 is me", "Leave the email address out of the password."],
      [NEW_PASSWORD, `${NEW_PASSWORD}x`, "The two passwords don't match."],
    ];
    for (const [pw, confirm, error] of tries) {
      await page.getByLabel("New password", { exact: true }).fill(pw);
      await page.getByLabel("Confirm new password").fill(confirm);
      await save.click();
      await page.getByText(error).first().waitFor();
      ok(`refused: ${error}`);
    }
    const still = await one(`SELECT "passwordHash" FROM "User" WHERE id = $1`, [user.id]);
    assert(still.passwordHash === user.passwordHash, "nothing was saved by the refused tries");
    await shot(page, "reset-refused");

    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await save.click();
    await page.waitForURL(/\/login\?reset=1/);
    await page.getByText("Your password is saved").first().waitFor();
    ok("saved, back on sign in with the notice");
    await shot(page, "reset-saved");

    const after = await one(`SELECT "passwordHash", "mustChangePassword", "passwordFails" FROM "User" WHERE id = $1`, [user.id]);
    assert(after.passwordHash && after.passwordHash !== user.passwordHash && after.passwordHash.startsWith("scrypt$"), "a new scrypt hash is stored");
    assert(!Number(after.mustChangePassword) && !Number(after.passwordFails), "change-password and failure flags are cleared");
    const sessions = await one(`SELECT COUNT(*) AS c FROM "Session" WHERE "userId" = $1`, [user.id]);
    assert(Number(sessions.c) === 0, "every session of the account is signed out");
    const audits = await q(`SELECT action FROM "AuditLog" WHERE "entityId" = $1 AND action = 'auth.password_reset' AND at >= $2`, [user.id, started]);
    assert(audits.length === 1, "one auth.password_reset audit row");

    await other.page.goto(`${BASE}/store/PTA01`);
    assert(/\/login/.test(other.page.url()), "the other device is sent to sign in");
    await other.ctx.close();

    step("The used link no longer works");
    await page.goto(`${BASE}/login/reset?t=${encodeURIComponent(token)}`);
    await expiredNotice(page).waitFor();
    ok("the same link now lands on \"expired\"");

    step("The old password fails and the new one signs in");
    await page.goto(`${BASE}/login`);
    const signIn = page.getByRole("button", { name: "Sign in", exact: true });
    await hydrated(signIn);
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill("holland");
    await signIn.click();
    await page.getByText("That email and password don't match.").first().waitFor();
    ok("the old password is refused");
    await page.locator("#password").fill(NEW_PASSWORD);
    await signIn.click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    ok(`the new password signs in (to ${new URL(page.url()).pathname})`);
    await ctx.close();
  }

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  process.exitCode = 1;
} finally {
  // Put the account back as the seed left it, so the other journeys sign in with the demo password.
  await db.query(`UPDATE "User" SET "passwordHash" = $1, "mustChangePassword" = $2, "tempPasswordUntil" = $3, "passwordFails" = $4, "passwordLockedAt" = $5 WHERE id = $6`,
    [user.passwordHash, user.mustChangePassword, user.tempPasswordUntil, user.passwordFails, user.passwordLockedAt, user.id]).then(() => console.log("  ↺ password restored"), (e) => console.error(`  ✗ restore password: ${e.message}`));
  await db.query(`DELETE FROM "Session" WHERE "userId" = $1 AND id NOT IN (${sessionsBefore.map((_, i) => `$${i + 2}`).join(",") || "''"})`, [user.id, ...sessionsBefore]).catch(() => {});
  await db.query(`DELETE FROM "AuditLog" WHERE "entityId" = $1 AND action IN ('auth.password_reset','auth.reset_requested','auth.failed') AND at >= $2`, [user.id, started]).catch(() => {});
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
