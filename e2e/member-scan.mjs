// End-to-end test of scanning a member's card at the till, and of finding a member by search.
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/member-scan.mjs [outdir]   (seeded demo data)
// A members-only sale needs the member's Rewards QR scanned (a keyboard-wedge burst or the tablet camera); a member
// number typed by hand attaches the member but leaves the sale blocked until it is scanned or a manager approves.
// Covers: wedge with nothing focused, wedge into the search box, typed number, a scan while the till asks for one,
// manager approval (audited), unknown numbers, lowercase and URL QR text, trade mode, scans during other sheets,
// a second card, short or slow key runs, offline scans and reconnect, the camera (hit, blocked, unsupported) and
// member search (surname, full name, last digits, phone, email, no match, sign up from search).
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-member-scan";
mkdirSync(out, { recursive: true });
const db = createDb();
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const args = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ args, executablePath: "/opt/pw-browsers/chromium" }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera"] });
await ctx.addInitScript(() => {
  window.print = () => undefined;
  // Headless Chromium has no BarcodeDetector: a stand-in that "sees" whatever the test puts in window.__qr.
  class FakeDetector {
    static async getSupportedFormats() {
      return ["qr_code"];
    }
    async detect() {
      const v = window.__qr;
      window.__qr = undefined;
      return v ? [{ rawValue: v }] : [];
    }
  }
  window.BarcodeDetector = FakeDetector;
  window.__FakeDetector = FakeDetector;
});
const page = await ctx.newPage();
page.setDefaultTimeout(45_000);
const problems = [];
page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
let n = 0;
const shot = (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` });
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => {
  throw new Error(msg);
};
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => console.log(`\n▸ ${s}`);
const waitOnline = () => page.getByTestId("connectivity").filter({ hasText: "Online" }).waitFor({ timeout: 90_000 });

// A keyboard-wedge scanner: a fast burst of keys then Enter, with nothing focused (or into whatever has the focus).
const wedge = async (text, { blur = true } = {}) => {
  await page.waitForTimeout(400); // a new sale focuses the search box a moment later
  if (blur) await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
};
const card = page.getByTestId("customer-card");
const hasMember = async (memberNo) => {
  await card.filter({ hasText: memberNo }).waitFor({ timeout: 15_000 });
  return true;
};
const noMember = async () => {
  await page.waitForTimeout(800);
  return (await card.count()) === 0;
};
const detach = async () => {
  if (await card.count()) await page.getByRole("button", { name: "Remove member from sale" }).first().click();
  await card.waitFor({ state: "detached" });
};
// Charge: "remaining" = the payment sheet (the sale may go ahead); "block-MEMBER" = the till still wants the QR.
const charge = async () => {
  await page.getByTestId("pay").click();
  const r = await Promise.race([
    page.getByTestId("remaining").waitFor().then(() => "pay"),
    page.getByTestId("block-MEMBER").waitFor().then(() => "blocked"),
    // Offline the till can't see a verified age, so it asks for ID; the member check is what we test.
    page.getByText("Check ID: adults 18+ only").waitFor().then(async () => ((await page.getByTestId("block-MEMBER").count()) ? "blocked" : "pay")),
  ]);
  return r;
};
const back = async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
};
const toast = (text) => page.getByText(text).first().waitFor({ timeout: 15_000 });
const searchBox = () => page.getByLabel("Search products or scan a barcode (F2)");
const memberSearch = () => page.getByLabel("Search members");
const found = () => page.getByRole("list", { name: "Members found" });

let device = null;
let shiftOpen = false;
let tradeAccount = null;
const started = new Date(Date.now() - 1000).toISOString();

try {
  // Two verified adults with a phone, an email and a surname; the first with a name and last four digits few others share.
  const pickSql = `select c.id, c."memberNo", c."firstName", c."lastName", c.phone, c.email,
      (select count(*) from "Customer" c2 where c2."firstName" like c."lastName" || '%' or c2."lastName" like c."lastName" || '%') as "surnameHits",
      (select count(*) from "Customer" c3 where substr(c3.phone, length(c3.phone) - 3) = substr(c.phone, length(c.phone) - 3)) as "last4Hits"
    from "Customer" c where c."ageVerifiedAt" is not null and c.phone is not null and c.email is not null and c."lastName" is not null and c."memberNo" is not null
      and c."lastName" not like '% %' and c."firstName" not like '% %' and c."firstName" <> 'E2E'
    order by "surnameHits" + "last4Hits", c."memberNo" limit 2`;
  const [A, B] = await q(pickSql);
  assert(A && B, `members ${A?.memberNo} (${A?.firstName} ${A?.lastName}) and ${B?.memberNo}`);
  const unknownNo = "HH9999999";
  assert(!(await q(`select 1 from "Customer" where "memberNo" = $1`, [unknownNo])).length, `${unknownNo} is no one's number`);

  step("Pair PTA01, sign in (PIN 1111), open a shift, put a CBD balm in the basket");
  await page.goto(`${BASE}/pos`);
  await page.waitForURL(/\/pos\/pair/);
  await page.locator("#pair-email").fill("manager.pta01@herbalholland.com");
  await page.locator("#pair-password").fill("holland");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#till-name").fill("E2E scan till");
  await page.getByTestId("pair-submit").click();
  await page.waitForURL(`${BASE}/pos`);
  device = (await q(`select id from "Device" where name = 'E2E scan till' and active order by "createdAt" desc limit 1`))[0];
  assert(device, "till paired");
  await page.getByRole("button", { name: /Shireen Singh/ }).click({ timeout: 120_000 });
  for (const d of "1111") await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForSelector("[aria-label=Catalogue]");
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await page.getByTestId("open-shift").click();
  await page.waitForSelector("[aria-label=Catalogue]:visible");
  shiftOpen = true;
  await page.getByRole("button", { name: /^Recover CBD Muscle Balm/ }).click();
  await page.waitForTimeout(700);
  assert((await charge()) === "blocked", "no member: the sale is members only");
  await back();
  await waitOnline();

  step("1. Wedge scan with nothing focused");
  await wedge(A.memberNo);
  await toast(`${A.firstName} added to the sale`);
  assert(await hasMember(A.memberNo), `${A.memberNo} attached from the scan`);
  assert((await charge()) === "pay", "a scanned card lets the sale go ahead");
  await back();
  await shot("scanned");

  step("10. The same card again, then a second member's card");
  await wedge(A.memberNo);
  await page.waitForTimeout(800);
  assert((await card.count()) === 1 && (await card.filter({ hasText: A.memberNo }).count()) === 1, "scanning the same card again keeps one member on the sale");
  await wedge(B.memberNo);
  await hasMember(B.memberNo);
  assert((await card.filter({ hasText: A.memberNo }).count()) === 0, `${B.memberNo} replaces ${A.memberNo}`);
  assert((await charge()) === "pay", "the second member's scan counts too");
  await back();
  await detach();

  step("2. Wedge into the focused search box");
  await searchBox().click();
  await page.keyboard.type(A.memberNo);
  await page.keyboard.press("Enter");
  await hasMember(A.memberNo);
  assert((await searchBox().inputValue()) === "", "the search box is cleared after the scan");
  assert((await charge()) === "pay", "a scan into the search box counts as a scan");
  await back();
  await detach();

  step("3. A member number typed by hand: attached, but the sale stays blocked");
  await searchBox().click();
  await searchBox().pressSequentially(A.memberNo, { delay: 150 });
  await searchBox().press("Enter");
  await hasMember(A.memberNo);
  assert((await charge()) === "blocked", "a typed number does not unlock a members-only sale");
  await shot("typed-blocked");

  step("4. Scanning the card while the till asks for it resumes the checkout");
  await wedge(A.memberNo, { blur: false });
  await page.getByTestId("remaining").waitFor();
  ok("the scan goes straight on to payment");
  await back();
  await detach();

  step("5. Manager approval instead of the QR (audited)");
  await searchBox().click();
  await searchBox().pressSequentially(A.memberNo, { delay: 150 });
  await searchBox().press("Enter");
  await hasMember(A.memberNo);
  assert((await charge()) === "blocked", "typed again: blocked");
  await page.getByRole("button", { name: "Manager approval" }).click();
  await toast("Approved without the QR: charge the sale");
  assert((await charge()) === "pay", "after the manager approves, the sale can be charged");
  await back();
  let audit = 0;
  for (let i = 0; i < 40 && !audit; i++, await page.waitForTimeout(250))
    audit = (await q(`select count(*)::int as c from "AuditLog" where action = 'pos.member_qr_override' and at >= $1 and data like $2`, [started, `%${A.memberNo}%`]))[0].c;
  assert(audit === 1, "the override is audited with the member number");
  await detach();

  step("6. An unknown member number opens Find a member with no match");
  await wedge(unknownNo);
  await page.getByText(`No members match “${unknownNo}”`).waitFor();
  assert((await memberSearch().inputValue()) === unknownNo, "the find sheet opens on the scanned number");
  await shot("unknown");
  await back();
  assert(await noMember(), "no one is attached");

  step("7. Lowercase and URL QR text");
  await wedge(A.memberNo.toLowerCase());
  await hasMember(A.memberNo);
  ok("lowercase member number read");
  await detach();
  await wedge(`https://shop.herbalholland.com/club?m=${B.memberNo}`);
  await hasMember(B.memberNo);
  ok("member number read out of a URL");
  await detach();

  step("11. Short or slow key runs are not scans");
  await wedge("HH1");
  assert(await noMember(), "three keys and Enter: ignored");
  await page.waitForTimeout(400);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.keyboard.type(A.memberNo, { delay: 150 });
  await page.keyboard.press("Enter");
  assert(await noMember(), "a member number keyed slowly with nothing focused: ignored");
  assert((await page.getByText(/Nothing on this till matches/).count()) === 0, "no 'nothing matches' toast for keys that weren't a scan");

  step("9. A scan during an unrelated sheet is ignored (camera unsupported)");
  await page.evaluate(() => delete window.BarcodeDetector);
  await page.getByRole("button", { name: "Scan member card or event ticket" }).first().click();
  await page.getByTestId("scan-unsupported").waitFor();
  assert(/Camera scanning isn't supported on this browser/.test(await page.getByTestId("scan-unsupported").textContent()), "no BarcodeDetector: the unsupported message");
  await shot("camera-unsupported");
  await wedge(A.memberNo);
  await back();
  assert(await noMember(), "a scan while the sheet was open did nothing");
  await page.evaluate(() => (window.BarcodeDetector = window.__FakeDetector));

  step("13. Tablet camera: a card read, then camera access blocked");
  await page.evaluate((no) => (window.__qr = no), A.memberNo);
  await page.getByRole("button", { name: "Scan member card or event ticket" }).first().click();
  await hasMember(A.memberNo);
  assert((await charge()) === "pay", "a camera scan counts as a scan");
  await back();
  await detach();
  await page.evaluate(() => {
    window.__gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.getByRole("button", { name: "Scan member card or event ticket" }).first().click();
  await page.getByText("Camera access was blocked. Allow it for this site in the browser settings, then try again.").waitFor();
  ok("camera blocked: the till says how to allow it");
  await back();
  await page.evaluate(() => (navigator.mediaDevices.getUserMedia = window.__gum));
  // The camera from the compliance sheet: Scan QR, read the card, back to payment.
  await searchBox().click();
  await searchBox().pressSequentially(A.memberNo, { delay: 150 });
  await searchBox().press("Enter");
  await hasMember(A.memberNo);
  assert((await charge()) === "blocked", "typed: blocked");
  await page.evaluate((no) => (window.__qr = no), A.memberNo);
  await page.getByRole("button", { name: "Scan QR" }).click();
  await page.getByTestId("remaining").waitFor();
  ok("Scan QR on the compliance sheet reads the card and resumes payment");
  await back();
  await detach();

  step("14. Member search");
  await page.getByRole("button", { name: "Find member" }).first().click();
  const lookFor = async (term, expectHit = true) => {
    await memberSearch().fill(term);
    if (!expectHit) return;
    await found().filter({ hasText: A.memberNo }).waitFor();
  };
  await lookFor(A.lastName, A.surnameHits <= 8);
  if (A.surnameHits <= 8) ok(`surname "${A.lastName}" finds ${A.memberNo}`);
  await lookFor(`${A.firstName} ${A.lastName}`);
  ok("full name finds the member");
  const last4 = A.phone.slice(-4);
  await lookFor(last4, A.last4Hits <= 8);
  if (A.last4Hits <= 8) ok(`last four digits ${last4} find the member`);
  // A surname with a space in it ("van der Merwe"), on its own and after the first name.
  const C = (await q(`select "memberNo", "firstName", "lastName" from "Customer" where "lastName" like '% %' and "memberNo" is not null order by "memberNo" limit 1`))[0];
  if (C) {
    await memberSearch().fill(C.lastName);
    await found().filter({ hasText: C.lastName }).first().waitFor();
    await memberSearch().fill(`${C.firstName} ${C.lastName}`);
    await found().filter({ hasText: C.memberNo }).waitFor();
    ok(`surname with a space ("${C.lastName}") finds ${C.memberNo}, alone and with the first name`);
  }
  await lookFor(A.email.toUpperCase());
  ok("email (any case) finds the member");
  await memberSearch().fill("Z");
  await page.waitForTimeout(600);
  assert((await found().count()) === 0 || (await found().getByRole("listitem").count()) === 0, "one character: no lookup");
  // A full phone number is a single sure hit: it opens straight onto the sale, but typed, so still not scanned.
  await memberSearch().fill(`0${A.phone.slice(3)}`);
  await hasMember(A.memberNo);
  ok("full mobile number opens the member");
  assert((await charge()) === "blocked", "a member found by search still needs their QR");
  await back();
  await detach();
  // No match on a phone: sign them up with the number filled in.
  const freshPhone = `0719${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  await page.getByRole("button", { name: "Find member" }).first().click();
  await memberSearch().fill(freshPhone);
  await page.getByText(`No members match “${freshPhone}”`).waitFor();
  const signUp = page.getByTestId("sign-up-from-search");
  assert(new RegExp(`Sign up ${freshPhone}`).test(await signUp.textContent()), "no match on a phone: Sign up offers that number");
  await signUp.click();
  assert((await page.getByLabel("Mobile number").inputValue()).replace(/\D/g, "") === freshPhone, "the new-member form starts with the phone filled in");
  await shot("sign-up-from-search");
  await page.getByRole("tab", { name: "Find member" }).click();
  // A scan into the search field (it has the focus) counts as a scan.
  await memberSearch().fill("");
  await memberSearch().focus();
  await page.keyboard.type(B.memberNo);
  await page.keyboard.press("Enter");
  await hasMember(B.memberNo);
  assert((await charge()) === "pay", "a wedge scan into Search members counts as a scan");
  await back();
  await detach();

  step("12. Offline: a scanned card, then the till reconnects");
  await ctx.setOffline(true);
  await page.getByTestId("connectivity").filter({ hasNotText: "Online" }).waitFor({ timeout: 30_000 });
  await wedge(A.memberNo);
  await toast(`${A.memberNo} added (checked when the till reconnects)`);
  await page.getByText(/Taken from their card offline/).first().waitFor();
  assert((await charge()) === "pay", "offline: a scanned card lets the cash sale go ahead");
  await back();
  await ctx.setOffline(false);
  await waitOnline();
  await page.getByText(/Taken from their card offline/).first().waitFor({ state: "detached", timeout: 30_000 });
  await hasMember(A.memberNo);
  assert((await charge()) === "pay", "back online: the member is looked up and keeps the scan");
  await back();
  await detach();
  // Offline, an unknown number can't be checked; on reconnect the till asks for the member.
  await ctx.setOffline(true);
  await page.getByTestId("connectivity").filter({ hasNotText: "Online" }).waitFor({ timeout: 30_000 });
  await wedge(unknownNo);
  await toast(`${unknownNo} added (checked when the till reconnects)`);
  await ctx.setOffline(false);
  await waitOnline();
  await page.getByText(`No members match “${unknownNo}”`).waitFor({ timeout: 30_000 });
  ok("back online: an unknown number from offline opens Find a member");
  await back();
  await detach();
  // Offline member field: a wedge scan into it counts as a scan; typed doesn't.
  await ctx.setOffline(true);
  await page.getByTestId("connectivity").filter({ hasNotText: "Online" }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Find member" }).first().click();
  await page.locator("#off-member").waitFor();
  await page.locator("#off-member").focus();
  await page.keyboard.type(B.memberNo);
  await page.keyboard.press("Enter");
  await page.getByText(/Taken from their card offline/).first().waitFor();
  assert((await charge()) === "pay", "offline member field: a scan counts");
  await back();
  await detach();
  await page.getByRole("button", { name: "Find member" }).first().click();
  await page.locator("#off-member").pressSequentially(B.memberNo, { delay: 150 });
  await page.getByRole("button", { name: "Add to sale" }).click();
  await page.getByText(/Taken from their card offline/).first().waitFor();
  assert((await charge()) === "blocked", "offline member field: typed by hand stays blocked");
  await back();
  await detach();
  await ctx.setOffline(false);
  await waitOnline();

  step("8. Trade mode: a member card is refused");
  const taNo = `TA-${String(900000 + Math.floor(Math.random() * 99999))}`;
  tradeAccount = (
    await q(
      `insert into "TradeAccount" (id, number, name, "legalName", kind, "vatNumber", email, phone, "addressLine", suburb, city, province, "postalCode", status, terms, "paymentDays", "creditLimitCents", classes, "approvedAt", "adultAttestedAt", "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, 'E2E Scan Pharmacy', 'E2E Scan Pharmacy (Pty) Ltd', 'PHARMACY', '4123456789', $2, '+27125551234', '1 Burnett Street', 'Hatfield', 'Pretoria', 'GP', '0083', 'APPROVED', 'ACCOUNT', 30, 500000,
         '{CBD,CBD_FOOD,CBD_TOPICAL,HEMP,SUPPLEMENT,ACCESSORY,APPAREL,GROW}'::"RegClass"[], now(), now(), now(), now()) returning id`,
      [taNo, `trade.scan.${Date.now()}@example.com`],
    )
  )[0];
  await q(
    `insert into "TradeLicence" (id, "tradeAccountId", kind, number, "uploadId", status, "reviewedAt")
     select gen_random_uuid()::text, $1, k::"TradeLicenceKind", 'E2E/' || k, (select "uploadId" from "TradeLicence" order by "createdAt" limit 1), 'VERIFIED', now() from unnest($2::text[]) k`,
    [tradeAccount.id, ["PHARMACY_LICENCE", "SAPC_RECORDING", "FOOD_COA"]],
  );
  await page.getByTestId("trade-sale").first().click();
  await page.getByTestId("trade-search").fill(taNo);
  await page.getByTestId(`trade-account-${taNo}`).click();
  await page.getByTestId("trade-banner").waitFor();
  await wedge(A.memberNo);
  await toast("Leave trade mode to add a member. A sale is retail or trade, never both.");
  assert((await card.count()) === 0 && (await page.getByTestId("trade-banner").count()) === 1, "still a trade sale, no member added");
  await shot("trade-refused");
  await page.getByRole("button", { name: "Leave trade mode" }).first().click();
  await page.getByTestId("trade-banner").waitFor({ state: "detached" });

  step("Clean up: clear the basket, close the shift, unpair the till");
  if (await page.getByRole("button", { name: "Clear the basket" }).count()) {
    await page.getByRole("button", { name: "Clear the basket" }).click();
    await page.getByRole("button", { name: "Clear basket" }).click();
  }
  await page.getByRole("button", { name: "Shift" }).first().click();
  await page.getByTestId("denom-20000").fill("5");
  await page.getByTestId("close-shift").click();
  await page.getByRole("button", { name: "Close shift", exact: true }).click();
  await page.getByTestId("z-report").waitFor();
  shiftOpen = false;
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Shift" }).first().click();
  await page.getByRole("button", { name: /Unpair this till/ }).click();
  await page.getByRole("button", { name: "Unpair", exact: true }).click();
  await page.waitForURL(/\/pos\/pair/);
  assert((await q(`select active from "Device" where id = $1`, [device.id]))[0].active === false, "test till unpaired");
  device = null;

  console.log("\nALL STEPS PASSED");
} catch (e) {
  console.log("\n✗ FAILED:", e.message.split("\n")[0]);
  await shot("FAILED").catch(() => undefined);
  process.exitCode = 1;
} finally {
  // A failed run leaves the till paired with a shift open: close both in the database so the next run starts clean.
  if (device) {
    if (shiftOpen) await q(`update "Shift" set "closedAt" = now(), notes = 'E2E run failed' where "deviceId" = $1 and "closedAt" is null`, [device.id]).catch(() => undefined);
    await q(`update "Device" set active = false where id = $1`, [device.id]).catch(() => undefined);
  }
  if (tradeAccount) {
    await q(`delete from "TradeLedgerEntry" where "tradeAccountId" = $1`, [tradeAccount.id]).catch(() => undefined);
    await q(`update "TradeAccount" set status = 'CLOSED', "holdReason" = 'E2E run finished', "updatedAt" = now() where id = $1`, [tradeAccount.id]).catch(() => undefined);
  }
  if (problems.length) console.log("\nNotes:\n" + problems.join("\n"));
  await browser.close();
  await db.end?.();
}
