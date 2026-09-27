// E2E: add to bag → checkout as a NEW member (phone OTP + one-step registration) →
// simulated payment → order tracking. Needs DEMO_MODE=true (the OTP is shown on screen).
//   BASE_URL=http://localhost:3000 node e2e/checkout.mjs [outdir] [width] [height] [COLLECT|SAME_DAY|COURIER]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [, , outdir = "test-results/e2e-checkout", w = "390", h = "844", fulfil = "COLLECT"] = process.argv;
mkdirSync(outdir, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3000";
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
await page.getByText("Welcome — one quick step").waitFor();
await page.getByLabel("First name").fill("Lindiwe");
await page.getByLabel(/Email for invoices/).fill(`lindiwe.${phone}@example.co.za`);
await page.getByLabel("SA ID number").fill(saId);
await page.getByLabel("Home store").selectOption({ label: "Hatfield" });
await page.getByLabel("SMS").check();
await shot("checkout-register");
await page.getByLabel(/I'm 18 or older and I accept/).check();
await page.getByRole("button", { name: /Join and continue/ }).click();
await page.getByText("Signed in as").waitFor({ timeout: 30000 });
await page.waitForLoadState("networkidle");
await shot("checkout-signed-in");
console.log("welcome callout:", await page.getByText(/Welcome to Herbal Holland Rewards/).count(), "| url:", page.url());

// 3. Fulfilment + payment
if (fulfil !== "COLLECT") {
  await page.getByRole("radio", { name: fulfil === "COURIER" ? /Courier delivery/ : /Same-day delivery/ }).click();
  await page.getByLabel("Street address").fill("14 Jacaranda Street");
  await page.getByLabel("Suburb").fill("Hatfield");
  await page.getByLabel("Town or city").fill("Pretoria");
  await page.getByLabel("Province").selectOption("GP");
  await page.getByLabel("Postal code").fill("0083");
}
await shot("checkout-filled");
await page.getByRole("button", { name: /Continue to payment|Place order/ }).click();
await page.waitForURL(/\/checkout\/pay\/|\/orders\//, { timeout: 30000 });
await page.waitForLoadState("networkidle");
await shot("pay");
if (page.url().includes("/checkout/pay/")) {
  await page.getByRole("radio", { name: /PayShap/ }).click();
  await page.getByRole("button", { name: /^Pay R/ }).click();
  await page.waitForURL(/\/orders\//, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}
await shot("order");
console.log("ORDER URL", page.url(), "phone", phone);
if (errors.length) {
  console.log("PAGE ERRORS:\n" + [...new Set(errors)].slice(0, 15).join("\n"));
  process.exitCode = 1;
}
await browser.close();
