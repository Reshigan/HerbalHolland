// End-to-end test of HQ review moderation (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/reviews.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// An area manager sees the reviews but can't hide or show them. The HQ team finds a review by its headline; hiding it
// without a reason is refused; with a reason it is hidden (on record, audited, the reason shown to the team) and gone from
// the product page; "Show again" puts it back on the product page. Re-runnable: the review is left showing at the end.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-reviews";
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

// The newest showing review whose headline no other showing review on that product shares (the seed reuses headlines,
// so a twin would stay on the page), on a product that shows reviews (not a licensed medicine) and all of them (≤ 60).
const review = await one(`SELECT r.id, r.title, p.slug FROM "Review" r JOIN "Product" p ON p.id = r."productId"
  WHERE r.hidden = 0 AND r.verified = 1 AND r.title IS NOT NULL AND p."regClass" <> 'THC' AND p.status = 'ACTIVE'
  AND NOT EXISTS (SELECT 1 FROM "Review" y WHERE y."productId" = r."productId" AND y.title = r.title AND y.id <> r.id AND y.hidden = 0 AND y.verified = 1)
  AND (SELECT COUNT(*) FROM "Review" x WHERE x."productId" = r."productId" AND x.hidden = 0 AND x.verified = 1) <= 60
  ORDER BY r."createdAt" DESC LIMIT 1`);
if (!review) fail("no showing review: seed the demo data");
const row = () => one(`SELECT hidden, "hiddenReason", "moderatedById" FROM "Review" WHERE id = $1`, [review.id]);
const audits = async (action) => Number((await one(`SELECT COUNT(*) AS n FROM "AuditLog" WHERE action = $1 AND "entityId" = $2`, [action, review.id])).n);
const audits0 = { "review.hide": await audits("review.hide"), "review.show": await audits("review.show") };
console.log(`review “${review.title}” on /p/${review.slug}`);

async function signIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
  ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`pageerror during “${current}”: ${e.message}`)));
  const page = await ctx.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${BASE}/api/auth/demo?email=${email}&next=/hq/reviews`);
  await page.waitForURL((u) => u.pathname === "/hq/reviews");
  return page;
}
const onProductPage = async (page) => {
  await page.goto(`${BASE}/p/${review.slug}?reviews=all`);
  await page.locator("h1").first().waitFor();
  return page.getByText(review.title, { exact: true }).count();
};
let page;

try {
  step("An area manager sees the reviews but can't moderate them");
  {
    const p = await signIn("area.gpn@herbalholland.com");
    await p.getByText("View only: the HQ team hides and shows reviews.").waitFor();
    assert(await p.getByRole("button", { name: "Hide", exact: true }).count() === 0, "no Hide buttons");
    await p.context().close();
  }

  step("The HQ team finds the review by its headline");
  page = await signIn("merch@herbalholland.com");
  assert(await onProductPage(page) > 0, "showing on the product page before");
  await page.goto(`${BASE}/hq/reviews?q=${encodeURIComponent(review.title)}`);
  const item = page.locator("li").filter({ hasText: review.title }).first();
  await item.waitFor();
  ok("found by search");
  await shot(page, "found");

  step("Hiding without a reason is refused");
  await hydrated(item.getByRole("button", { name: "Hide", exact: true }));
  await item.getByRole("button", { name: "Hide", exact: true }).click();
  const panel = item.getByRole("group", { name: "Hide this review?" });
  await panel.getByRole("button", { name: "Hide review" }).click();
  await panel.getByText("Say why it's hidden").first().waitFor();
  assert(Number((await row()).hidden) === 0, "still showing");

  step("With a reason it is hidden, audited and off the product page");
  await panel.getByLabel("Why (the team sees this)").fill("Names a medical condition");
  await panel.getByRole("button", { name: "Hide review" }).click();
  assert(await until(async () => Number((await row()).hidden) === 1), "hidden in the database");
  const r = await row();
  assert(r.hiddenReason === "Names a medical condition" && r.moderatedById, "reason and moderator recorded");
  assert(await until(async () => (await audits("review.hide")) > audits0["review.hide"]), "audited");
  await item.getByText("Hidden", { exact: true }).waitFor();
  await item.getByText(/hidden by .*Names a medical condition/).waitFor();
  ok("Hidden badge and reason shown to the team");
  await shot(page, "hidden");
  assert(await onProductPage(page) === 0, "gone from the product page");

  step("Show again puts it back");
  await page.goto(`${BASE}/hq/reviews?view=hidden&q=${encodeURIComponent(review.title)}`);
  const hiddenItem = page.locator("li").filter({ hasText: review.title }).first();
  await hydrated(hiddenItem.getByRole("button", { name: "Show again" }));
  await hiddenItem.getByRole("button", { name: "Show again" }).click();
  assert(await until(async () => Number((await row()).hidden) === 0), "showing in the database");
  assert((await row()).hiddenReason === null, "reason cleared");
  assert(await until(async () => (await audits("review.show")) > audits0["review.show"]), "audited");
  assert(await onProductPage(page) > 0, "back on the product page");

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  if (page) await shot(page, "failed");
  process.exitCode = 1;
} finally {
  await db.query(`UPDATE "Review" SET hidden = 0, "hiddenReason" = NULL WHERE id = $1`, [review.id]).catch((e) => console.error(`  ✗ cleanup: ${e.message}`));
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
