// End-to-end check of the till's hardware & workflow features (Playwright + direct DB checks), against a seeded database.
//   BASE_URL=http://127.0.0.1:3600 DATABASE_URL=postgresql://…/hh_ci node e2e/till-hardware.mjs [outdir]
// Pair PTA01 → manager PIN → open shift → printer set-up screen (browser-print fallback shows the receipt view with the
// masked member number, invoice QR and 18+ footer) → customer display mirrors the sale over BroadcastChannel (second
// page, same context) and over the polling feed (a fresh context with no cookies) → training mode: tour, a practice
// sale that creates no Sale row, exit with the manager PIN → quiet-hours dashboard after the (shortened) idle timeout
// → camera scanner state on this browser → close the shift and unpair.
import { chromium } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/till-shots";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_dev" });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.setDefaultTimeout(45_000);
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
// The browser-print fallback calls window.print(); headless Chromium would hang on the dialog, so record the calls instead.
await ctx.addInitScript(() => {
  window.__prints = 0;
  window.print = () => void window.__prints++;
});
let n = 0;
const shot = (name, p = page) => p.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` });
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => {
  throw new Error(msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => console.log(`\n▸ ${s}`);
const waitOnline = () => page.getByTestId("connectivity").filter({ hasText: "Online" }).waitFor({ timeout: 90_000 });
const pin = async (digits) => {
  for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click();
};
let device = null;

try {
  step("Pair PTA01 and sign in as the manager (Shireen Singh, PIN 1111)");
  await page.goto(`${BASE}/pos`);
  await page.waitForURL(/\/pos\/pair/);
  await page.locator("#pair-email").fill("manager.pta01@herbalholland.co.za");
  await page.locator("#pair-password").fill("holland");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#till-name").fill("E2E hardware till");
  await page.getByTestId("pair-submit").click();
  await page.waitForURL(`${BASE}/pos`);
  device = (await q(`select id, prefix from "Device" where name = 'E2E hardware till' and active order by "createdAt" desc limit 1`))[0];
  assert(device, `device paired (prefix ${device?.prefix})`);
  await page.getByRole("button", { name: /Shireen Singh/ }).click({ timeout: 120_000 });
  await pin("1111");
  await page.waitForSelector("[aria-label=Catalogue]");
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await page.getByTestId("open-shift").click();
  await page.waitForSelector("[aria-label=Catalogue]:visible");
  ok("shift open");

  step("Printer set-up under Shift → This till, and the browser-print fallback");
  await page.getByRole("button", { name: "Shift" }).first().click();
  const printerCard = page.getByTestId("printer-card");
  await printerCard.waitFor();
  await printerCard.scrollIntoViewIfNeeded();
  await shot("printer-setup");
  assert(await printerCard.getByText(/No printer paired/).isVisible(), "no printer paired: the till says receipts use the browser print dialog");
  const bt = printerCard.getByTestId("pair-bluetooth");
  ok(`Pair Bluetooth printer is ${(await bt.isDisabled()) ? "disabled on this browser (no Web Bluetooth)" : "enabled"}`);
  await printerCard.getByRole("tab", { name: /58 mm/ }).click();
  assert(await printerCard.getByRole("tab", { name: /58 mm/ }).getAttribute("aria-selected") === "true", "paper width switches to 58 mm");
  await printerCard.getByTestId("test-print").click();
  await page.waitForFunction(() => window.__prints > 0);
  const testArea = await page.getByTestId("print-area").innerText();
  assert(/TEST PAGE|Printer test/i.test(testArea) && /Adults 18\+/.test(testArea), "test print without a printer opened the browser print dialog with the receipt view");
  assert(await page.getByTestId("display-card").isVisible() && (await page.getByTestId("training-card").isVisible()), "customer display and training cards render");

  step("A member's cash sale, then the printed receipt view");
  await page.getByRole("button", { name: "Sell" }).first().click();
  await waitOnline();
  const member = (await q(`select c.id, c."memberNo", c."firstName" from "Customer" c where c."ageVerifiedAt" is not null and c."dob" < now() - interval '21 years' order by c."memberNo" limit 1`))[0];
  await page.getByRole("button", { name: /Find member/ }).first().click();
  await page.getByLabel("Search members").fill(member.memberNo);
  await page.getByTestId("customer-card").waitFor();
  await page.getByRole("button", { name: /^Smell-proof Pouch/ }).click();
  await page.waitForTimeout(700);
  await page.getByTestId("pay").click();
  await page.getByTestId("remaining").waitFor();
  await page.getByTestId("tender-cash").click();
  await page.getByRole("button", { name: "R200", exact: true }).click();
  await page.getByTestId("receipt").waitFor();
  const receiptNo = (await page.getByRole("dialog").filter({ has: page.getByTestId("receipt") }).textContent()).match(/PTA01-[A-Z]\d{5}/)?.[0];
  ok(`sale ${receiptNo} complete (cash, R200 tendered)`);
  const printsBefore = await page.evaluate(() => window.__prints);
  await page.getByRole("button", { name: "Print receipt" }).click();
  await page.waitForFunction((b) => window.__prints > b, printsBefore);
  const area = page.getByTestId("print-area");
  const printed = await area.innerText();
  assert(printed.includes(receiptNo), "print area holds the receipt");
  const masked = await area.getByTestId("print-member").innerText();
  assert(!masked.includes(member.memberNo) && /HH•+\d{3}\)/.test(masked), `member number masked on the receipt (${masked.match(/\(.*\)/)?.[0]})`);
  assert((await area.getByTestId("print-qr").count()) === 1 && printed.includes("Scan for your invoice"), "invoice QR + short link printed");
  assert(/Adults 18\+ only/.test(printed) && /VAT included/.test(printed) && /Cash/.test(printed) && /CHANGE/.test(printed), "VAT, tender, change and the 18+ footer are on the receipt");
  await page.getByTestId("new-sale").click();

  step("Customer display: a second page in the same context mirrors the sale over BroadcastChannel");
  const display = await ctx.newPage();
  await display.goto(`${BASE}/pos/display`);
  await display.getByTestId("display").waitFor();
  await display.waitForFunction(() => document.querySelector("[data-testid=display]")?.getAttribute("data-state") === "idle");
  await display.getByTestId("display-idle-message").waitFor();
  await shot("display-idle", display);
  await page.bringToFront();
  await page.getByRole("button", { name: /Find member/ }).first().click();
  await page.getByLabel("Search members").fill(member.memberNo);
  await page.getByTestId("customer-card").waitFor();
  await page.getByRole("button", { name: /^Smell-proof Pouch/ }).click();
  await page.waitForTimeout(900);
  const total = (await page.getByTestId("cart-total").innerText()).trim();
  await display.waitForFunction(() => document.querySelector("[data-testid=display]")?.getAttribute("data-state") === "sale");
  await display.getByTestId("display-lines").getByText("Smell-proof Pouch").waitFor();
  assert((await display.getByTestId("display-total").innerText()).trim() === total, `display shows the basket and total ${total}`);
  assert((await display.getByTestId("display-member").innerText()).includes(`Hi ${member.firstName}`), "display greets the member by first name");
  await shot("display-sale", display);
  await page.getByTestId("pay").click();
  await page.getByTestId("remaining").waitFor();
  await display.waitForFunction(() => document.querySelector("[data-testid=display]")?.getAttribute("data-state") === "pay");
  await display.getByTestId("display-pay").waitFor();
  ok("display moved to the pay state");
  await shot("display-pay", display);
  await page.getByTestId("tender-cash").click();
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByTestId("receipt").waitFor();
  await display.waitForFunction(() => document.querySelector("[data-testid=display]")?.getAttribute("data-state") === "done");
  assert(await display.getByText(/Thank you/).isVisible(), "display shows the thank-you");
  const displayText = await display.innerText("body");
  assert(!/\+27|0\d{2} •••|HH\d{7}/.test(displayText), "display never shows a phone or member number");
  await shot("display-done", display);
  await page.getByTestId("new-sale").click();
  await display.waitForFunction(() => document.querySelector("[data-testid=display]")?.getAttribute("data-state") === "idle");
  ok("display back to idle after New sale");

  step("Customer display on a separate device: the polling feed keyed by the paired till");
  await page.getByRole("button", { name: "Shift" }).first().click();
  const dc = page.getByTestId("display-card");
  await dc.scrollIntoViewIfNeeded();
  await dc.getByText("Send to a separate screen").click();
  const link = (await dc.getByTestId("display-link").innerText()).trim();
  assert(link.includes(`/pos/display?d=${device.id}&k=`), `separate-screen link issued: ${link}`);
  await shot("display-link");
  await page.getByRole("button", { name: "Sell" }).first().click();
  await page.getByRole("button", { name: /^Smell-proof Pouch/ }).click();
  await page.waitForTimeout(900);
  const remoteCtx = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  const remote = await remoteCtx.newPage();
  await remote.goto(link);
  await remote.waitForFunction(() => document.querySelector("[data-testid=display]")?.getAttribute("data-state") === "sale", null, { timeout: 20_000 });
  assert(await remote.getByTestId("display-lines").getByText("Smell-proof Pouch").isVisible(), "a cookie-less browser shows the sale through the feed");
  await shot("display-remote", remote);
  await remoteCtx.close();
  await page.getByRole("button", { name: "Clear the basket" }).click();
  await page.getByRole("button", { name: "Clear basket", exact: true }).click();
  await display.close();

  step("Training mode: manager starts it, the tour shows, a practice sale posts nothing");
  // Scoped to this till and the product sold: the CI database is shared with other test runs.
  const salesOf = async () => Number((await q(`select count(*)::int as c from "Sale" where "deviceId" = $1`, [device.id]))[0].c);
  const stockOf = async () => (await q(`select coalesce(sum(sl."onHand"),0)::int as s from "StockLevel" sl join "Store" st on st.id = sl."storeId" join "Variant" v on v.id = sl."variantId" join "Product" p on p.id = v."productId" where st.code = 'PTA01' and p.name = 'Smell-proof Pouch'`))[0].s;
  const salesBefore = await salesOf();
  const stockBefore = await stockOf();
  await page.getByRole("button", { name: "Shift" }).first().click();
  await page.getByTestId("start-training").click();
  await page.getByTestId("training-banner").waitFor();
  await page.getByTestId("tour-step").waitFor();
  assert((await page.getByTestId("tour-step").getAttribute("data-step")) === "1", "guided tour opens at step 1");
  await shot("training-tour");
  for (let i = 0; i < 4; i++) await page.getByTestId("tour-next").click();
  assert((await page.getByTestId("tour-step").getAttribute("data-step")) === "5", "five steps");
  await page.getByTestId("tour-next").click();
  await page.getByTestId("tour-step").waitFor({ state: "detached" });
  assert(await page.getByTestId("training-outline").isVisible(), "orange outline on");
  await page.waitForSelector("[aria-label=Catalogue]:visible");
  await page.getByRole("button", { name: /Find member/ }).first().click();
  await page.getByLabel("Search members").fill(member.memberNo);
  await page.getByTestId("customer-card").waitFor();
  await page.getByRole("button", { name: /^Smell-proof Pouch/ }).click();
  await page.waitForTimeout(700);
  await page.getByTestId("pay").click();
  await page.getByTestId("remaining").waitFor();
  await page.getByTestId("tender-cash").click();
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByTestId("receipt").waitFor();
  await page.getByText(/Training mode: this sale was not posted/).waitFor();
  const trainingNo = (await page.getByRole("dialog").filter({ has: page.getByTestId("receipt") }).textContent()).match(/TRAINING \d{4}/)?.[0];
  assert(trainingNo, `practice receipt ${trainingNo}`);
  await shot("training-receipt");
  const pb = await page.evaluate(() => window.__prints);
  await page.getByRole("button", { name: "Print receipt" }).click();
  await page.waitForFunction((b) => window.__prints > b, pb);
  assert((await page.getByTestId("print-area").getByTestId("print-training").count()) === 2, "printed practice receipt carries the TRAINING watermark");
  await page.getByTestId("new-sale").click();
  await page.waitForTimeout(1500);
  const salesAfter = await salesOf();
  const stockAfter = await stockOf();
  assert(salesAfter === salesBefore, `no Sale row created by this till in training (${salesBefore} before, ${salesAfter} after)`);
  assert(stockAfter === stockBefore, `stock of the product sold in training unchanged (${stockBefore})`);
  assert((await q(`select count(*)::int as c from "Sale" where number like 'TRAINING%'`))[0].c === 0, "no training-numbered sale exists");
  const audit = (await q(`select action from "AuditLog" where entity = 'Device' and "entityId" = $1 and action = 'pos.training_start'`, [device.id]))[0];
  assert(audit, "training start audited (pos.training_start)");
  await page.getByRole("button", { name: "Sales" }).first().click();
  await page.getByTestId("training-sales").getByText(trainingNo).waitFor();
  ok("practice sale listed under Sales → Training mode");
  await page.getByRole("button", { name: "Sell" }).first().click();
  await page.getByTestId("banner-exit-training").click();
  await page.getByRole("button", { name: /Shireen Singh/ }).click();
  await pin("1111");
  await page.getByTestId("training-banner").waitFor({ state: "detached" });
  ok("exited training with the manager PIN");
  assert((await q(`select count(*)::int as c from "AuditLog" where entity = 'Device' and "entityId" = $1 and action = 'pos.training_end'`, [device.id]))[0].c === 1, "training end audited");

  step("Quiet hours: the calm dashboard appears after the idle timeout (shortened with ?idleMs=)");
  await page.goto(`${BASE}/pos?idleMs=3000`);
  await page.waitForSelector("[aria-label=Catalogue]:visible", { timeout: 90_000 });
  await page.getByTestId("quiet-screen").waitFor({ timeout: 15_000 });
  await shot("quiet-hours");
  const quiet = await page.getByTestId("quiet-screen").innerText();
  // Tile headings are upper-cased by CSS, and innerText reports the rendered text.
  assert(/takings so far/i.test(quiet) && /online orders to hand over/i.test(quiet) && /low stock/i.test(quiet) && /waiting on this till/i.test(quiet) && /next event/i.test(quiet), "dashboard tiles present");
  await page.getByTestId("quiet-takings").getByText(/R[\d,]+\.\d\d/).waitFor({ timeout: 15_000 });
  ok("takings so far loaded from the shift");
  await page.getByTestId("quiet-screen").click({ position: { x: 640, y: 30 } });
  await page.getByTestId("quiet-screen").waitFor({ state: "detached" });
  ok("a tap returns to selling");
  await page.evaluate(() => localStorage.removeItem("hh-pos:v1:idle-ms"));

  step("Camera scanning: the scanner sheet states support on this browser");
  await page.getByRole("button", { name: "Scan with the camera" }).click();
  const unsupported = page.getByTestId("scan-unsupported");
  const viewfinder = page.getByTestId("viewfinder");
  await Promise.race([unsupported.waitFor(), viewfinder.waitFor()]);
  await shot("camera-scanner");
  ok((await unsupported.count()) ? "headless Chromium on Linux: clear 'not supported on this browser' state with the alternatives" : "camera viewfinder shown");
  await page.keyboard.press("Escape");
  // Keyboard-wedge scan still works: a fast-typed barcode + Enter adds the product.
  const v = (await q(`select v.barcode, p.name from "Variant" v join "Product" p on p.id = v."productId" join "StoreVariant" sv on sv."variantId" = v.id join "Store" s on s.id = sv."storeId" where s.code = 'PTA01' and v.barcode is not null and p."regClass" = 'ACCESSORY' limit 1`))[0];
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.keyboard.type(v.barcode, { delay: 10 });
  await page.keyboard.press("Enter");
  await page.getByTestId("cart-line").filter({ hasText: v.name }).waitFor();
  ok(`keyboard-wedge scan of ${v.barcode} added ${v.name}`);
  await page.getByRole("button", { name: "Clear the basket" }).click();
  await page.getByRole("button", { name: "Clear basket", exact: true }).click();

  step("Close the shift and unpair");
  await waitOnline();
  await page.getByRole("button", { name: "Shift" }).first().click();
  await page.getByTestId("close-shift").click();
  await page.getByRole("button", { name: "Close shift", exact: true }).click();
  await page.getByTestId("z-report").waitFor();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: /Unpair this till/ }).click();
  await page.getByRole("button", { name: "Unpair", exact: true }).click();
  await page.waitForURL(/\/pos\/pair/);
  ok("shift closed, till unpaired");

  console.log("\nALL STEPS PASSED");
} catch (e) {
  console.log("\n✗ FAILED:", e.message.split("\n")[0]);
  await shot("FAILED").catch(() => undefined);
  process.exitCode = 1;
} finally {
  if (device) await q(`update "Device" set active = false where id = $1`, [device.id]).catch(() => undefined);
  if (problems.length) console.log("\nNotes:\n" + problems.join("\n"));
  await browser.close();
  await db.end();
}
