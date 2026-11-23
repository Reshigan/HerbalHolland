// End-to-end test of buying a gift voucher (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/gift.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// Signed out, /gift asks you to sign in and brings you back. An unknown code is not recognised; a bad recipient email is
// refused by the server with nothing created; R200 bought for a friend goes to the pay page as an unpaid order with a
// pending voucher, and paying it issues the voucher (active, full balance, three years). Its balance check, the member's
// voucher list and the order page all show it. The paid voucher is left in place, like any other order a journey places.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-gift";
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

const member = await one(`SELECT id, phone FROM "Customer" WHERE phone IS NOT NULL AND "memberNo" IS NOT NULL ORDER BY "memberNo" DESC LIMIT 1`);
if (!member) fail("no member with a phone: seed the demo data");
const vouchers = () => q(`SELECT * FROM "GiftVoucher" WHERE "purchasedByCustomerId" = $1 ORDER BY "createdAt"`, [member.id]);
const before = (await vouchers()).length;
const ordersBefore = Number((await one(`SELECT COUNT(*) AS n FROM "Order" WHERE "customerId" = $1`, [member.id])).n);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`pageerror during “${current}”: ${e.message}`)));
const page = await ctx.newPage();
page.setDefaultTimeout(45_000);
page.setDefaultNavigationTimeout(120_000);
const buyButton = () => page.getByRole("button", { name: /^Buy R/ });

try {
  step("Signed out, /gift asks you to sign in and brings you back");
  await page.goto(`${BASE}/gift`);
  await page.getByText("Sign in to buy a voucher").waitFor();
  await hydrated(page.getByLabel("Mobile number"));
  await page.getByLabel("Mobile number").fill(`0${member.phone.slice(3)}`);
  await page.getByRole("button", { name: /Send my code/ }).click();
  await page.getByRole("button", { name: "Fill it in" }).click();
  await page.getByRole("button", { name: "Verify" }).click();
  await hydrated(buyButton());
  assert(new URL(page.url()).pathname === "/gift", "signed in, back on /gift with the voucher form");
  await shot(page, "signed-in");

  step("An unknown code is not recognised");
  await page.locator("#check").fill("HH-ZZZZ-ZZZZ-ZZZZ");
  await page.getByRole("button", { name: "Check balance" }).click();
  await page.getByRole("status").getByText("We don't recognise that code").waitFor();
  ok("unknown code: not recognised");

  step("A bad recipient email is refused by the server; nothing is created");
  await hydrated(buyButton());
  await page.locator("form").filter({ has: buyButton() }).evaluate((f) => { f.noValidate = true; });
  await page.getByRole("radio", { name: /R200/ }).click();
  await page.getByLabel("Their email (optional)").fill("not-an-email");
  await buyButton().click();
  await page.getByRole("alert").getByText("That email address doesn't look right").waitFor();
  assert((await vouchers()).length === before, "no voucher created");
  assert(Number((await one(`SELECT COUNT(*) AS n FROM "Order" WHERE "customerId" = $1`, [member.id])).n) === ordersBefore, "no order created");
  await shot(page, "refused");

  step("R200 for a friend goes to the pay page as an unpaid order with a pending voucher");
  await page.getByRole("radio", { name: /R200/ }).click();
  assert(await page.getByRole("radio", { name: /R200/ }).getAttribute("aria-checked") === "true", "R200 picked");
  await page.getByLabel("Their name (optional)").fill("Thandi");
  await page.getByLabel("Their email (optional)").fill("thandi@example.com");
  await page.getByLabel("Your message (optional)").fill("Happy birthday!");
  await buyButton().click();
  await page.waitForURL(/\/checkout\/pay\//, { timeout: 60_000 });
  const orderId = new URL(page.url()).pathname.split("/").pop();
  const v = (await vouchers()).at(-1);
  assert((await vouchers()).length === before + 1 && v.purchaseOrderId === orderId, "one voucher, tied to the order");
  assert(v.status === "PENDING" && Number(v.amountCents) === 20000 && Number(v.balanceCents) === 20000, "pending, R200, full balance");
  assert(v.recipientName === "Thandi" && v.recipientEmail === "thandi@example.com" && v.message === "Happy birthday!", "recipient and message saved");
  const order = await one(`SELECT * FROM "Order" WHERE id = $1`, [orderId]);
  assert(order.status === "PENDING_PAYMENT" && order.paymentStatus === "UNPAID" && Number(order.totalCents) === 20000 && Number(order.vatCents) === 0, "order unpaid, R200, no VAT at issue");
  await page.getByText(/Gift voucher/).first().waitFor();
  await shot(page, "pay");

  step("Paying issues the voucher");
  await hydrated(page.getByRole("button", { name: /^Pay R/ }));
  await page.getByRole("radio", { name: /PayShap/ }).click();
  await page.getByRole("button", { name: /^Pay R/ }).click();
  await page.waitForURL(/\/orders\//, { timeout: 60_000 });
  assert(page.url().includes(`/orders/${order.code}`), `on the order page ${order.code}`);
  const paid = await one(`SELECT * FROM "GiftVoucher" WHERE id = $1`, [v.id]);
  const o2 = await one(`SELECT status, "paymentStatus" FROM "Order" WHERE id = $1`, [orderId]);
  assert(o2.status === "COMPLETED" && o2.paymentStatus === "PAID", "order completed and paid");
  assert(paid.status === "ACTIVE" && paid.issuedAt, "voucher active and issued");
  const years = (new Date(paid.expiresAt) - Date.now()) / (365.25 * 86_400_000);
  assert(years > 2.9 && years < 3.1, `valid for three years (${years.toFixed(2)})`);
  await shot(page, "order");

  step("The balance check and the member's voucher list show it");
  await page.goto(`${BASE}/gift?check=${encodeURIComponent(paid.code)}`);
  await page.getByRole("status").getByText("R200.00 of R200.00 left").waitFor();
  ok("balance check: R200.00 of R200.00 left");
  await page.goto(`${BASE}/club/vouchers`);
  await page.getByText(paid.code).first().waitFor();
  ok("listed on /club/vouchers");
  await shot(page, "vouchers");

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  await shot(page, "failed");
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
