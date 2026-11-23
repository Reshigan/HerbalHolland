// End-to-end test of a trade account's own page, /trade/account (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/trade-account.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// Signed out, the page sends you to sign in. A buyer sees the account but can't change it or who orders for it. The owner:
// a bad VAT number is refused with nothing saved; a new trading name and phone are saved and audited; a buyer with a bad
// email, or an email that already signs in elsewhere, is refused with nothing created; a new buyer is added and audited;
// "Keep" cancels a removal and "Yes, remove" deactivates the buyer, signs them out and audits it.
// Re-runnable: the account's details are put back and the test buyer is deleted at the end.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-trade-account";
mkdirSync(out, { recursive: true });
const db = createDb();
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const problems = [];
let current = "";
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => { throw new Error(msg); };
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => ((current = s), console.log(`\n▸ ${s}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const shot = (page, name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` }).catch(() => undefined);
async function hydrated(locator) {
  const el = locator.first();
  await el.waitFor();
  for (let i = 0; i < 600; i++) {
    if (await el.evaluate((e) => Object.keys(e).some((k) => k.startsWith("__reactProps"))).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`never hydrated: ${el}`);
}
async function until(fn, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(150);
  }
}

const account = await one(`SELECT * FROM "TradeAccount" WHERE number = 'TA-000001'`);
if (!account) fail("no TA-000001: seed the demo data");
const OWNER = "trade@greenleafpharmacy.co.za";
const BUYER = "dispensary@greenleafpharmacy.co.za";
const TAKEN = "amina@bokaapapothecary.co.za";
const run = Date.now().toString(36);
const NEW_EMAIL = `e2e-${run}@greenleafpharmacy.co.za`;
const NEW_NAME = `Test Buyer ${run}`;
const audits = async (action) => Number((await one(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = $1 AND "entityId" = $2`, [action, account.id])).n);
const acct = () => one(`SELECT * FROM "TradeAccount" WHERE id = $1`, [account.id]);
const baseline = { update: await audits("trade.account.update"), add: await audits("trade.buyer.add"), remove: await audits("trade.buyer.remove") };

async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
  ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`pageerror during “${current}”: ${e.message}`)));
  const page = await ctx.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  return page;
}
async function signIn(page, email) {
  await page.goto(`${BASE}/trade/login`);
  await hydrated(page.getByRole("button", { name: "Send my code" }));
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send my code" }).click();
  await page.getByText("Demo mode").waitFor();
  await page.getByRole("button", { name: "Fill it in" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/trade/range", { timeout: 60_000 });
}

let page = await context();
try {
  step("Signed out, the page sends you to sign in");
  await page.goto(`${BASE}/trade/account`);
  await page.waitForURL((u) => u.pathname === "/trade/login", { timeout: 30_000 });
  ok(`redirected to ${new URL(page.url()).pathname}${new URL(page.url()).search}`);

  step("A buyer sees the account but can't change it or its buyers");
  await signIn(page, BUYER);
  await page.goto(`${BASE}/trade/account`);
  await page.getByText(/signed in as .* \(buyer\)/).waitFor();
  await page.getByText("The account's owner can change these details.").waitFor();
  assert(!(await page.getByRole("button", { name: "Edit details" }).count()), "no Edit details");
  assert(!(await page.getByRole("heading", { name: "Add a buyer" }).count()), "no Add a buyer");
  assert(!(await page.getByRole("button", { name: /^Remove / }).count()), "no Remove buttons");
  await page.getByTestId("account-figures").waitFor();
  ok("account figures shown");
  await shot(page, "buyer");
  await page.context().close();

  step("The owner signs in");
  page = await context();
  await signIn(page, OWNER);
  await page.goto(`${BASE}/trade/account`);
  await page.getByText(/signed in as .* \(owner\)/).waitFor();
  ok("owner view");

  step("A bad VAT number is refused; nothing is saved");
  await hydrated(page.getByRole("button", { name: "Edit details" }));
  await page.getByRole("button", { name: "Edit details" }).click();
  await hydrated(page.getByRole("button", { name: "Save details" }));
  await page.getByLabel("VAT number").fill("12345");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.getByRole("alert").getByText("VAT numbers are ten digits starting with 4").waitFor();
  const a1 = await acct();
  assert(a1.vatNumber === account.vatNumber && a1.name === account.name, "account unchanged");
  assert((await audits("trade.account.update")) === baseline.update, "no audit row");
  await shot(page, "vat-refused");

  step("A new trading name and phone are saved and audited");
  const newName = `Greenleaf ${run}`;
  await page.getByLabel("VAT number").fill(account.vatNumber ?? "");
  await page.getByLabel("Trading name").fill(newName);
  await page.getByLabel("Business phone").fill("021 555 0199");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.getByRole("status").getByText("Saved").waitFor();
  const a2 = await until(async () => { const a = await acct(); return a.name === newName && a; });
  assert(a2, "trading name saved");
  assert(a2.phone && a2.phone.replace(/\D/g, "").endsWith("215550199"), `phone saved (${a2.phone})`);
  assert(await until(async () => (await audits("trade.account.update")) === baseline.update + 1), "trade.account.update audited");
  await page.getByRole("heading", { name: newName, level: 1 }).waitFor();
  ok("the page shows the new name");
  await shot(page, "saved");

  const form = () => page.locator("form").filter({ has: page.getByRole("button", { name: "Add buyer" }) });
  const buyerCount = async () => Number((await one(`SELECT COUNT(*) AS n FROM "TradeBuyer" WHERE "tradeAccountId" = $1`, [account.id])).n);
  const buyersBefore = await buyerCount();

  step("A bad email and an email that signs in elsewhere are refused; nothing is created");
  await hydrated(form().getByRole("button", { name: "Add buyer" }));
  await form().getByLabel("Name").fill(NEW_NAME);
  await form().getByLabel("Email").fill("not-an-email");
  await form().getByRole("button", { name: "Add buyer" }).click();
  await form().getByRole("alert").getByText("Enter the buyer's email address").waitFor();
  ok("bad email refused");
  await form().getByLabel("Email").fill(TAKEN);
  await form().getByRole("button", { name: "Add buyer" }).click();
  await form().getByRole("alert").getByText("That email address already signs in to a trade account").waitFor();
  ok("taken email refused");
  assert((await buyerCount()) === buyersBefore, "no buyer created");
  assert((await audits("trade.buyer.add")) === baseline.add, "no audit row");

  step("A new buyer is added and audited");
  await form().getByLabel("Email").fill(NEW_EMAIL);
  await form().getByRole("button", { name: "Add buyer" }).click();
  await page.getByRole("status").getByText("Buyer added. They can sign in now.").waitFor();
  const added = await until(() => one(`SELECT * FROM "TradeBuyer" WHERE email = $1`, [NEW_EMAIL]));
  assert(added && added.tradeAccountId === account.id && added.role === "BUYER" && Number(added.active) === 1, "buyer row: this account, BUYER, active");
  assert(await until(async () => (await audits("trade.buyer.add")) === baseline.add + 1), "trade.buyer.add audited");
  await page.getByText(NEW_EMAIL).first().waitFor();
  ok("listed on the page");
  await shot(page, "added");

  step("Keep cancels a removal; Yes, remove deactivates and audits");
  const removeBtn = page.getByRole("button", { name: `Remove ${NEW_NAME}` });
  await hydrated(removeBtn);
  await removeBtn.click();
  await page.getByText(`Remove ${NEW_NAME}?`).waitFor();
  await page.getByRole("button", { name: "Keep" }).click();
  await removeBtn.waitFor();
  assert(Number((await one(`SELECT active FROM "TradeBuyer" WHERE id = $1`, [added.id])).active) === 1, "Keep: still active");
  await removeBtn.click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  assert(await until(async () => Number((await one(`SELECT active FROM "TradeBuyer" WHERE id = $1`, [added.id])).active) === 0), "Yes, remove: deactivated");
  assert(await until(async () => (await audits("trade.buyer.remove")) === baseline.remove + 1), "trade.buyer.remove audited");
  await page.getByText("Removed", { exact: true }).first().waitFor();
  ok("the row shows Removed");
  await shot(page, "removed");

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  await shot(page, "failed");
  process.exitCode = 1;
} finally {
  await db.query(`UPDATE "TradeAccount" SET name = $1, phone = $2, "vatNumber" = $3 WHERE id = $4`, [account.name, account.phone, account.vatNumber, account.id])
    .then(() => console.log("  ↺ account details restored"), (e) => console.error(`  ✗ cleanup: ${e.message}`));
  await db.query(`DELETE FROM "Session" WHERE "tradeBuyerId" IN (SELECT id FROM "TradeBuyer" WHERE email = $1)`, [NEW_EMAIL]).catch(() => undefined);
  await db.query(`DELETE FROM "TradeBuyer" WHERE email = $1`, [NEW_EMAIL])
    .then(() => console.log("  ↺ test buyer removed"), (e) => console.error(`  ✗ cleanup: ${e.message}`));
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
