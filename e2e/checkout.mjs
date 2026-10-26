// E2E: add to bag → checkout as a NEW member (phone OTP + one-step registration) → a gift voucher redeemed on the
// order → simulated payment of the rest → order tracking. Needs DEMO_MODE=true (the OTP is shown on screen) and
// DATABASE_URL (the voucher is issued straight into the database, as a paid purchase would).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/checkout.mjs [outdir] [width] [height] [COLLECT|SAME_DAY|COURIER]
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const [, , outdir = "test-results/e2e-checkout", w = "390", h = "844", fulfil = "COLLECT"] = process.argv;
mkdirSync(outdir, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3000";
const db = createDb(); // DATABASE_FILE, or the local D1 file (e2e/_db.mjs)
await db.connect();
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
// A R100 gift voucher, issued as a paid purchase would issue it (three years' validity, CPA s63).
const pick = (n) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
const VOUCHER = `HH-${pick(4)}-${pick(4)}-${pick(4)}`;
await db.query(
  `insert into "GiftVoucher" (id, code, "amountCents", "balanceCents", status, "issuedAt", "expiresAt", "updatedAt") values (gen_random_uuid()::text, $1, 10000, 10000, 'ACTIVE', now(), now() + interval '3 years', now())`,
  [VOUCHER],
);
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); }
const ctx = await browser.newContext({ viewport: { width: +w, height: +h } });
await ctx.addCookies([{ name: "hh_age", value: "1", url: base }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !/favicon|404/.test(m.text()) && errors.push(m.text()));
let n = 0;
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${outdir}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true }); console.log("shot", name, page.url()); };

// 1. Add two products to the bag
await page.goto(`${base}/p/calm-cbd-oil-600`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Add to bag" }).click();
await page.getByText("View bag").waitFor();
await page.goto(`${base}/p/sunset-grinder`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Add to bag" }).click();
await page.getByText("View bag").waitFor();
await shot("added");
await page.goto(`${base}/cart`, { waitUntil: "networkidle" });
await shot("cart");
await page.getByRole("link", { name: /Checkout/ }).click();
await page.waitForURL("**/checkout");
await page.waitForLoadState("networkidle");
await shot("checkout-signin");

// 2. New phone number → OTP (demo code) → register
const phone = `08${Math.floor(10000000 + Math.random() * 89999999)}`;
const luhnOk = (d) => { let s = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; };
const pad = (n, l) => String(n).padStart(l, "0");
const idBase = `${pad(70 + Math.floor(Math.random() * 30), 2)}${pad(1 + Math.floor(Math.random() * 12), 2)}${pad(1 + Math.floor(Math.random() * 28), 2)}${pad(Math.floor(Math.random() * 10000), 4)}08`;
const saId = [...Array(10).keys()].map((z) => idBase + z).find(luhnOk);
await page.getByLabel("Mobile number").fill(phone);
await page.getByRole("button", { name: /Send my code/ }).click();
await page.getByText("Demo mode").waitFor();
await shot("checkout-code");
await page.getByRole("button", { name: "Fill it in" }).click();
await page.getByRole("button", { name: "Verify" }).click();
await page.getByText("Welcome: one quick step").waitFor();
await page.getByLabel("First name").fill("Lindiwe");
await page.getByLabel("Surname").fill("Dlamini");
await page.getByLabel(/Email for invoices/).fill(`lindiwe.${phone}@example.co.za`);
await page.getByLabel("Day").selectOption("12");
await page.getByLabel("Month").selectOption({ label: "June" });
await page.getByLabel("Year").selectOption("1990");
await page.getByLabel("Home store").selectOption({ label: "Hatfield" });
await page.getByLabel("SMS").check();
await page.getByLabel("CBD & wellness").check();
await shot("checkout-register");
await page.getByLabel(/I'm 18 or older and I accept/).check();
await page.getByRole("button", { name: /Join and continue/ }).click();
await page.getByText("Signed in as").waitFor({ timeout: 30000 });
await page.waitForLoadState("networkidle");
await shot("checkout-signed-in");
console.log("welcome callout:", await page.getByText(/Welcome to Herbal Holland Rewards/).count(), "| url:", page.url());
// Joined with a date of birth: the SA ID is checked once, before the first online order of age-restricted items.
if (await page.getByText("Confirm your age to order online").count()) {
  await page.getByLabel("SA ID number").fill(saId);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.getByText(/you're verified/).waitFor({ timeout: 30000 });
  await page.reload({ waitUntil: "networkidle" });
}

// 3. Fulfilment + payment
if (fulfil !== "COLLECT") {
  await page.getByRole("radio", { name: fulfil === "COURIER" ? /Courier delivery/ : /(Same|Next)-day delivery/ }).click();
  await page.getByLabel("Street address").fill("14 Jacaranda Street");
  await page.getByLabel("Suburb").fill("Hatfield");
  await page.getByLabel("Town or city").fill("Pretoria");
  await page.getByLabel("Province").selectOption("GP");
  await page.getByLabel("Postal code").fill("0083");
}
// 3b. A gift voucher pays R100 of it, before online payment
await page.getByLabel("Gift voucher code").fill(VOUCHER.toLowerCase());
await page.getByRole("button", { name: "Redeem" }).click();
await page.getByText(/will come off this order/).waitFor({ timeout: 30000 });
await page.getByText(`Gift voucher ${VOUCHER}`).first().waitFor();
console.log("voucher applied:", VOUCHER);
await shot("checkout-filled");
await page.getByRole("button", { name: /Continue to payment|Place order/ }).click();
await page.waitForURL(/\/checkout\/pay\/|\/orders\//, { timeout: 30000 });
await page.waitForLoadState("networkidle");
await shot("pay");
if (page.url().includes("/checkout/pay/")) {
  await page.getByText(/Gift voucher HH-/).first().waitFor();
  await page.getByRole("radio", { name: /PayShap/ }).click();
  await page.getByRole("button", { name: /^Pay R/ }).click();
  await page.waitForURL(/\/orders\//, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}
await shot("order");
console.log("ORDER URL", page.url(), "phone", phone);
const orderCode = page.url().split("/orders/")[1]?.split("?")[0];
const redeemed = await one(`select v."balanceCents", v.status, r.cents from "GiftVoucher" v join "VoucherRedemption" r on r."voucherId" = v.id and not r.reversed where v.code = $1`, [VOUCHER]);
const paid = await one(`select "paymentStatus", status, "totalCents" from "Order" where code = $1`, [orderCode]);
if (!redeemed || redeemed.cents !== 10000 || redeemed.balanceCents !== 0 || redeemed.status !== "REDEEMED") {
  console.log("VOUCHER NOT REDEEMED AS EXPECTED", redeemed);
  process.exitCode = 1;
} else console.log("voucher redeemed on", orderCode, "→ balance 0, order", paid?.status, paid?.paymentStatus, "total", paid?.totalCents);
await page.getByText(/Gift voucher HH-/).first().waitFor();
if (errors.length) {
  console.log("PAGE ERRORS:\n" + [...new Set(errors)].slice(0, 15).join("\n"));
  process.exitCode = 1;
}
await browser.close();
await db.end();
