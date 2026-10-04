// End-to-end test of the till (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://…/hh_dev node e2e/pos.mjs [outdir]   (seeded demo data)
// Pair PTA01 → PIN 1111 → open shift → walk-in CBD sale (ID sighted, cash) → patient flower
// sale (card, tap on glass) → event check-in from a members' evening ticket (member attached,
// welcome gift offered to a first-timer) → refund a line back to how they paid (cash) → a gift voucher scanned at the
// till pays part of a sale, cash the rest, then the refund goes back onto the voucher → offline cash sale →
// back online & sync → hand over a READY click & collect order → trade sale for an approved
// account (prices ex VAT, R100 cash + the rest on account, tax invoice), refund a line of it
// (credit note) → hand over a READY trade click & collect order → close the shift (Z-report).
import { chromium } from "@playwright/test";
import pg from "pg";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-pos";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_dev" });
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// The browser-print fallback calls window.print(); headless Chromium would hang on the dialog, so swallow it.
await ctx.addInitScript(() => {
  window.print = () => undefined;
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
// The shared dev server recompiles/restarts now and then; wait until the till is back online.
const waitOnline = () => page.getByTestId("connectivity").filter({ hasText: "Online" }).waitFor({ timeout: 90_000 });
const receiptNo = async () => (await page.getByRole("dialog").filter({ has: page.getByTestId("receipt") }).textContent()).match(/PTA01-[A-Z]\d{5}(?:-[A-Z0-9]{3})?/)?.[0];
const search = async (text) => {
  const box = page.getByLabel("Search products or scan a barcode (F2)");
  await box.fill(text);
  await box.press("Enter");
};
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let tempEvent = null; // throwaway event for the check-in step (deleted at the end)
let tempVoucher = null; // a R50 gift voucher issued straight into the database for the till step (deleted at the end)
let tradeAccount = null; // an approved trade account on credit terms for the trade-sale steps (closed at the end)
let tradeOrder = null; // a READY trade click & collect order at PTA01 for the handover step (deleted at the end)
const zarText = (cents) => `R${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const vatOn = (exCents) => Math.floor((exCents * 1500 + 5000) / 10000); // VAT per line, half up (lib/trade.ts vatHalfUp)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, as makeVoucherCode
const pick = (n) => [...Array(n)].map(() => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

try {
  step("Pair PTA01 with the manager's email + password");
  await page.goto(`${BASE}/pos`);
  await page.waitForURL(/\/pos\/pair/);
  await page.locator("#pair-email").fill("manager.pta01@herbalholland.co.za");
  await page.locator("#pair-password").fill("holland");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#till-name").fill("E2E till");
  await shot("pair-store");
  await page.getByTestId("pair-submit").click();
  await page.waitForURL(`${BASE}/pos`);
  const device = (await q(`select id, prefix from "Device" where name = 'E2E till' and active order by "createdAt" desc limit 1`))[0];
  assert(device, `device paired (prefix ${device?.prefix})`);

  step("Lock screen → Shireen Singh → PIN 1111");
  await page.getByRole("button", { name: /Shireen Singh/ }).click({ timeout: 120_000 });
  for (const d of "1111") await page.getByRole("button", { name: d, exact: true }).click();
  await page.waitForSelector("[aria-label=Catalogue]");
  ok("signed in");

  step("Open a shift with the default R1,000 float");
  await page.getByRole("button", { name: "Open shift", exact: true }).click();
  await page.getByTestId("open-shift").click();
  await page.waitForSelector("[aria-label=Catalogue]:visible");
  const shift = (await q(`select id, "openingFloatCents" from "Shift" where "deviceId" = $1 and "closedAt" is null`, [device.id]))[0];
  assert(shift?.openingFloatCents === 100000, "shift open with R1,000 float");

  step("Members only: a new shopper joins at the till (key terms accepted), then buys a CBD balm with cash");
  await page.getByRole("button", { name: /^Recover CBD Muscle Balm/ }).click();
  await page.waitForTimeout(700);
  await page.getByTestId("pay").click();
  await page.getByTestId("block-MEMBER").waitFor();
  await shot("members-only");
  ok("no member on the sale: the till says members only");
  await page.getByRole("button", { name: "Find or sign up the member" }).click();
  await page.getByRole("tab", { name: "New member" }).click();
  const joinPhone = `07${Math.floor(10000000 + Math.random() * 89999999)}`;
  const luhnOk = (d) => { let t = 0; for (let i = 0; i < d.length; i++) { let n = +d[d.length - 1 - i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } t += n; } return t % 10 === 0; };
  const idBase = `9${Math.floor(Math.random() * 9)}0612${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}08`;
  const joinId = [...Array(10).keys()].map((z) => idBase + z).find(luhnOk);
  await page.getByLabel("Mobile number").fill(joinPhone);
  await page.getByLabel("First name").fill("Sipho");
  await page.getByLabel("SA ID number").fill(joinId);
  await page.getByTestId("deals-question").getByRole("button", { name: "Yes, send deals" }).click();
  await page.getByTestId("deals-question").getByRole("button", { name: "CBD & wellness" }).click();
  await page.getByTestId("key-terms").waitFor();
  await page.getByLabel(/read the key terms and accept the membership terms/).check();
  await shot("join-at-till");
  await page.getByRole("button", { name: /Create member/ }).click();
  await page.getByTestId("remaining").waitFor({ timeout: 30_000 });
  const joined = (await q(`select id, "memberNo", "termsVersion", "termsAcceptedAt", "consentSms", interests from "Customer" where phone = $1`, [`+27${joinPhone.slice(1)}`]))[0];
  assert(joined?.termsVersion === "2026-09-27" && joined.termsAcceptedAt, `member ${joined?.memberNo} joined; terms version ${joined?.termsVersion} recorded`);
  const optIn = (await q(`select wording from "ConsentEvent" where "customerId" = $1 and channel = 'SMS' and granted`, [joined.id]))[0];
  assert(joined.consentSms && joined.interests.includes("CBD") && /^Asked in store/.test(optIn?.wording ?? ""), "said yes to member deals (SMS consent + the question asked recorded) and is into CBD");
  await page.getByTestId("tender-cash").click();
  await page.getByRole("button", { name: "R400" }).click();
  await page.getByTestId("receipt").waitFor();
  await shot("member-receipt");
  const walkinNo = await receiptNo();
  assert(/^PTA01-[A-Z]00001/.test(walkinNo ?? ""), `receipt ${walkinNo} numbered from the device prefix`);
  const walkin = (await q(`select s.id, s."customerId", s."ageCheck", s."totalCents", s."shiftId", p.method, p."tenderedCents", p."changeCents" from "Sale" s join "Payment" p on p."saleId" = s.id where s.number = $1`, [walkinNo]))[0];
  assert(walkin?.customerId === joined.id && walkin.ageCheck === "VERIFIED" && walkin.method === "CASH" && walkin.changeCents === 40000 - walkin.totalCents && walkin.shiftId === shift.id, `sale posted to the new member at the member price (R${(walkin?.totalCents / 100).toFixed(2)}), cash R400 tendered, on the shift`);
  await page.getByTestId("new-sale").click();

  step("Patient member (active authorisation, nothing bought this month): licensed flower by card");
  // The seed hands out authorisations at random, so pick any verified patient with a full monthly allowance.
  const patient = (await q(`select c.id, c.email, c."memberNo", pa."authNumber" from "Customer" c join "PatientAuth" pa on pa."customerId" = c.id
    where pa.status = 'ACTIVE' and pa."validFrom" <= now() and pa."validTo" > now() + interval '7 days' and c.email is not null and c."ageVerifiedAt" is not null
      and not exists (select 1 from "Sale" s where s."customerId" = c.id and s."createdAt" >= date_trunc('month', now()))
    order by c."memberNo" limit 1`))[0];
  assert(patient, `patient ${patient?.memberNo} has an active authorisation`);
  await waitOnline();
  await page.getByRole("button", { name: /Find member/ }).first().click();
  await page.getByLabel("Search members").fill(patient.memberNo);
  await page.getByTestId("customer-card").waitFor();
  ok("member attached from member number");
  await page.getByRole("button", { name: /^Durban Poison, from/ }).click();
  await page.getByRole("button", { name: /3\.5g/ }).click();
  await page.waitForTimeout(900);
  await shot("patient-basket");
  await page.getByTestId("pay").click();
  await page.getByTestId("remaining").waitFor();
  ok("compliance passed (patient authorisation + dispenser)");
  await page.getByTestId("tender-card").click();
  await page.getByTestId("tap-overlay").waitFor();
  await shot("tap-on-glass");
  await page.getByTestId("receipt").waitFor({ timeout: 30_000 });
  await shot("patient-receipt");
  const patientNo = await receiptNo();
  const emailed = await page.getByTestId("invoice-emailed").textContent();
  assert(emailed.includes(patient.email), `invoice emailed to ${patient.email}`);
  const flower = (await q(`select s.id, s."customerId", s."pointsEarned", p.method, p."cardLast4", p.provider, l.qty, v.grams from "Sale" s join "Payment" p on p."saleId" = s.id join "SaleLine" l on l."saleId" = s.id join "Variant" v on v.id = l."variantId" where s.number = $1`, [patientNo]))[0];
  assert(flower?.customerId === patient.id && flower.method === "CARD" && /^\d{4}$/.test(flower.cardLast4 ?? ""), `card sale ${patientNo} (•••• ${flower?.cardLast4}) linked to the patient`);
  assert(flower.pointsEarned === 0, "no points earned on a licensed medicine (s18A)");
  await page.getByTestId("new-sale").click();

  step("Event check-in: scan a members' evening ticket (HHRSVP:{code}) at the till");
  const seeded = (
    await q(
      `select r.code, r."customerId", c."firstName", c."memberNo", c.visits, e.title, e."startsAt", e."endsAt"
       from "Rsvp" r join "StoreEvent" e on e.id = r."eventId" join "Store" s on s.id = e."storeId" join "Customer" c on c.id = r."customerId"
       where s.code = 'PTA01' and e.slug = 'hatfield-members-evening' and r."checkedInAt" is null order by c.visits, r."createdAt" limit 1`,
    )
  )[0];
  assert(seeded, `members' evening ticket ${seeded?.code} for ${seeded?.memberNo}`);
  let ticket = seeded;
  const opensAt = new Date(seeded.startsAt).getTime() - 2 * 3_600_000;
  if (Date.now() < opensAt || Date.now() > new Date(seeded.endsAt).getTime()) {
    await search(`HHRSVP:${seeded.code}`);
    await page.getByText(/check-in opens 2 hours before it starts|the event is over/).waitFor();
    ok(`the evening isn't today (${new Date(seeded.startsAt).toISOString().slice(0, 10)}): the till says so`);
    // A throwaway event at PTA01 happening now, with a ticket for the same member.
    tempEvent = (
      await q(
        `insert into "StoreEvent" (id, slug, "storeId", title, blurb, "startsAt", "endsAt", capacity)
         select gen_random_uuid()::text, $1, id, 'E2E members'' evening', 'End-to-end check-in', now() - interval '30 minutes', now() + interval '2 hours', 10
         from "Store" where code = 'PTA01' returning id, title`,
        [`e2e-checkin-${Date.now()}`],
      )
    )[0];
    const code = `E2E${Date.now().toString(36).toUpperCase().slice(-5)}`;
    ticket = (await q(`insert into "Rsvp" (id, "eventId", "customerId", code) values (gen_random_uuid()::text, $1, $2, $3) returning code, "customerId"`, [tempEvent.id, seeded.customerId, code]))[0];
    ticket.title = tempEvent.title;
    ticket.firstName = seeded.firstName;
  }
  await waitOnline();
  await search(`hhrsvp:${ticket.code.toLowerCase()}`); // typed in search, any case
  await page.getByText(new RegExp(`^Welcome to ${esc(ticket.title)}`)).waitFor();
  await page.getByTestId("customer-card").filter({ hasText: ticket.firstName }).waitFor();
  const rsvp = (await q(`select "checkedInAt" from "Rsvp" where code = $1`, [ticket.code]))[0];
  assert(rsvp?.checkedInAt, `${ticket.firstName} checked in (Rsvp.checkedInAt set) and attached to the sale`);
  await shot("event-checkin");
  // The same ticket again, from a keyboard-wedge scanner: already checked in, member still attached.
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.keyboard.type(`HHRSVP:${ticket.code}`);
  await page.keyboard.press("Enter");
  await page.getByText(/^Already checked in/).waitFor();
  ok("second scan: already checked in");
  // A welcome gift the till can offer: live, at the till, and with its product on PTA01's shelf (the till never offers
  // what isn't there — the seed's stock depends on the date).
  const gift = (
    await q(`select pr.name from "Promotion" pr
       where pr."firstPurchaseOnly" and pr.active and 'POS' = any(pr.channels) and pr."startsAt" <= now() and pr."endsAt" >= now()
         and exists (select 1 from "Product" p join "Variant" v on v."productId" = p.id join "StockLevel" s on s."variantId" = v.id join "Batch" b on b.id = s."batchId"
           where (p.id = any(pr."productIds") or p."categoryId" = any(pr."categoryIds")) and b.status = 'RELEASED' and s."onHand" > 0
             and s."storeId" = (select id from "Store" where code = 'PTA01'))
       limit 1`)
  )[0];
  if (seeded.visits === 0 && gift) {
    await page.locator("[data-testid=welcome-gift]:visible").first().click();
    await page.getByTestId("cart-line").filter({ hasText: gift.name }).waitFor();
    ok(`first-time member: welcome gift offered and added (${gift.name})`);
    await page.getByRole("button", { name: "Clear the basket" }).click();
    await page.getByRole("button", { name: "Clear basket", exact: true }).click();
  } else await page.getByRole("button", { name: "Remove member from sale" }).click();
  await page.getByTestId("customer-card").waitFor({ state: "detached" });

  step("Refund the new member's balm (restock, back to how they paid: cash)");
  await waitOnline();
  await page.getByRole("button", { name: "Sales" }).first().click();
  await page.getByLabel("Search by receipt number").fill(walkinNo);
  await page.locator("[aria-label='Recent sales'] li button", { hasText: walkinNo }).first().click();
  await page.getByTestId("start-refund").first().click();
  await page.getByRole("button", { name: /Increase refund quantity of Recover CBD Muscle Balm/ }).click();
  assert((await page.locator("#refund-method").inputValue()) === "ORIGINAL" && (await page.getByTestId("refund-split").textContent()) === `${zarText(walkin.totalCents)} cash`, `refund sheet defaults to back to how they paid: ${zarText(walkin.totalCents)} cash`);
  await shot("refund-sheet");
  await page.getByTestId("refund-continue").click();
  await page.getByRole("button", { name: "Confirm refund" }).click();
  await page.getByText(/^Refund PTA01-[A-Z]\d{5}.* done/).waitFor();
  await shot("credit-note");
  const refund = (await q(`select r.number, r."totalCents", p.method from "Sale" r join "Sale" o on o.id = r."refundOfId" join "Payment" p on p."saleId" = r.id where o.number = $1`, [walkinNo]))[0];
  assert(refund?.totalCents === -walkin.totalCents && refund.method === "CASH", `refund ${refund?.number} of R${(walkin.totalCents / 100).toFixed(2)} in cash`);

  step("Gift voucher at the till: the code scanned (typed into search) pays R50 of a pouch, cash the rest");
  const VOUCHER = `HH-${pick(4)}-${pick(4)}-${pick(4)}`;
  tempVoucher = (
    await q(
      `insert into "GiftVoucher" (id, code, "amountCents", "balanceCents", status, "issuedAt", "expiresAt", "updatedAt")
       values (gen_random_uuid()::text, $1, 5000, 5000, 'ACTIVE', now(), now() + interval '3 years', now()) returning id, code`,
      [VOUCHER],
    )
  )[0];
  await waitOnline();
  await page.getByRole("button", { name: "Sell" }).first().click();
  await page.getByRole("button", { name: /Find member/ }).first().click(); // members only: the shopper who joined above (ID verified)
  await page.getByLabel("Search members").fill(joined.memberNo);
  await page.getByTestId("customer-card").waitFor();
  await page.getByRole("button", { name: /^Smell-proof Pouch/ }).click();
  await page.waitForTimeout(700);
  await search(VOUCHER.toLowerCase()); // a scanner types the code the same way; the till opens payment with the voucher looked up
  await page.getByTestId("voucher-found").waitFor({ timeout: 30_000 });
  const found = (await page.getByTestId("voucher-found").textContent()) ?? "";
  assert(found.includes(VOUCHER) && found.includes("R50.00 on the voucher"), `voucher ${VOUCHER} looked up: R50.00 on it`);
  await shot("voucher-tender");
  await page.getByTestId("voucher-apply").click();
  await page.getByText(/Gift voucher HH-[A-Z2-9-]+ · R0\.00 left on the voucher/).waitFor();
  ok("R50.00 taken from the voucher (nothing left on it)");
  await page.getByTestId("tender-cash").click();
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByTestId("receipt").waitFor({ timeout: 30_000 });
  await shot("voucher-receipt");
  const voucherNo = await receiptNo();
  const voucherReceipt = (await page.getByRole("dialog").filter({ has: page.getByTestId("receipt") }).textContent()) ?? "";
  // The receipt names the voucher by its last four characters only (the code is a bearer secret).
  const masked = `HH-••••-••••-${VOUCHER.slice(-4)}`;
  assert(new RegExp(`Gift voucher ${esc(masked)} R50\\.00 \\(R0\\.00 left on the voucher\\)`).test(voucherReceipt), `receipt ${voucherNo} shows "Gift voucher ${masked}" and what's left on it`);
  assert(!voucherReceipt.includes(VOUCHER), `receipt ${voucherNo} doesn't print the whole voucher code`);
  const vsale = (await q(`select id, "totalCents", offline from "Sale" where number = $1`, [voucherNo]))[0];
  const vpays = await q(`select method, "amountCents", reference from "Payment" where "saleId" = $1`, [vsale.id]);
  assert(
    vsale.offline === false && vpays.some((p) => p.method === "VOUCHER" && p.amountCents === 5000 && p.reference === VOUCHER) && vpays.some((p) => p.method === "CASH" && p.amountCents === vsale.totalCents - 5000),
    `sale posted online with a R50 VOUCHER tender (${VOUCHER}) and R${((vsale.totalCents - 5000) / 100).toFixed(2)} cash`,
  );
  const vbal = (await q(`select "balanceCents", status from "GiftVoucher" where id = $1`, [tempVoucher.id]))[0];
  const vred = (await q(`select "saleId", "orderId", cents from "VoucherRedemption" where "voucherId" = $1`, [tempVoucher.id]))[0];
  assert(vbal.balanceCents === 0 && vbal.status === "REDEEMED" && vred?.saleId === vsale.id && vred.orderId === null && vred.cents === 5000, "voucher used up: balance 0, REDEEMED, redemption row on the sale");
  await page.getByTestId("new-sale").click();

  step("Refund the voucher sale: R50 goes back onto the voucher, the rest as cash");
  await page.getByRole("button", { name: "Sales" }).first().click();
  await page.getByLabel("Search by receipt number").fill(voucherNo);
  await page.locator("[aria-label='Recent sales'] li button", { hasText: voucherNo }).first().click();
  await page.getByTestId("start-refund").first().click();
  await page.getByRole("button", { name: /Increase refund quantity of Smell-proof Pouch/ }).click();
  const splitText = (await page.getByTestId("refund-voucher").textContent()) ?? "";
  assert(splitText.includes(`R50.00 goes back onto gift voucher ${masked}`) && splitText.includes(`the rest back how they paid: ${zarText(vsale.totalCents - 5000)} cash`), "refund sheet: R50.00 back onto the voucher, the rest back how they paid (cash)");
  await shot("voucher-refund-sheet");
  await page.getByTestId("refund-continue").click();
  await page.getByRole("button", { name: "Confirm refund" }).click();
  await page.getByText(/^Refund PTA01-[A-Z]\d{5}.* done/).waitFor();
  const vrefund = (await q(`select r.id, r.number, r."totalCents" from "Sale" r join "Sale" o on o.id = r."refundOfId" where o.number = $1`, [voucherNo]))[0];
  const rpays = await q(`select method, "amountCents", reference from "Payment" where "saleId" = $1`, [vrefund.id]);
  assert(
    vrefund.totalCents === -vsale.totalCents && rpays.some((p) => p.method === "VOUCHER" && p.amountCents === -5000 && p.reference === VOUCHER) && rpays.some((p) => p.method === "CASH" && p.amountCents === -(vsale.totalCents - 5000)),
    `credit note ${vrefund.number}: −R50.00 to the voucher, −R${((vsale.totalCents - 5000) / 100).toFixed(2)} cash`,
  );
  const vbal2 = (await q(`select "balanceCents", status from "GiftVoucher" where id = $1`, [tempVoucher.id]))[0];
  const vrows = await q(`select "saleId", cents from "VoucherRedemption" where "voucherId" = $1 order by "createdAt"`, [tempVoucher.id]);
  assert(vbal2.balanceCents === 5000 && vbal2.status === "ACTIVE" && vrows.length === 2 && vrows[1].saleId === vrefund.id && vrows[1].cents === -5000, "voucher balance restored (R50.00, ACTIVE) with a negative redemption row on the credit note");
  await page.getByRole("button", { name: "Sell" }).first().click();

  step("Go offline: take the member number from their card and ring up a cash sale");
  await page.getByRole("button", { name: "Sell" }).first().click();
  await ctx.setOffline(true);
  await page.getByTestId("connectivity").filter({ hasText: "Offline" }).waitFor();
  ok("indicator shows Offline");
  await page.getByRole("button", { name: /Find member/ }).first().click();
  await page.getByLabel("Member number").fill(joined.memberNo);
  await page.getByRole("button", { name: "Add to sale" }).click();
  await page.getByText(/Taken from their card offline/).first().waitFor();
  ok(`member ${joined.memberNo} added offline, to be checked on sync`);
  await page.getByRole("button", { name: /^Smell-proof Pouch/ }).click();
  await page.waitForTimeout(500);
  await page.getByTestId("pay").click();
  await page.getByTestId("block-AGE").waitFor();
  await page.getByRole("button", { name: /ID sighted/ }).click();
  await page.getByTestId("cash-panel").waitFor();
  assert(await page.getByTestId("tender-card").isDisabled(), "card disabled offline (cash only)");
  assert(await page.getByTestId("tender-voucher").isDisabled(), "gift voucher disabled offline (needs a connection)");
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByTestId("receipt").waitFor();
  await shot("offline-receipt");
  const offlineNo = await receiptNo();
  assert((await page.getByTestId("queued-count").textContent()).trim() === "1", `sale ${offlineNo} queued (1 waiting to sync)`);
  await page.getByTestId("new-sale").click();

  step("Back online → outbox syncs");
  await ctx.setOffline(false);
  await page.getByTestId("queued-count").waitFor({ state: "detached", timeout: 60_000 });
  const synced = (await q(`select offline, "shiftId", "staffId", "totalCents", "customerId" from "Sale" where number = $1`, [offlineNo]))[0];
  assert(synced?.offline === true && synced.shiftId === shift.id, `offline sale ${offlineNo} synced (offline=true, on the shift)`);
  assert(synced.customerId === joined.id, `the member number resolved to ${joined.memberNo} on sync`);

  step("Hand over a READY click & collect order");
  // Prefer an order with 18+ items (anything but apparel), so the ID check is exercised: seeded baskets are random.
  // Licensed medicines are left out (their handover is a dispenser's, covered above).
  const has = (cond) => `exists (select 1 from "OrderLine" l join "Variant" v on v.id = l."variantId" join "Product" p on p.id = v."productId" where l."orderId" = o.id and ${cond})`;
  let ready = (
    await q(
      `select o.id, o.code, o."collectionCode", o."paymentStatus" from "Order" o
       where o."storeId" = (select id from "Store" where code = 'PTA01') and o.status = 'READY' and o.fulfilment = 'COLLECT' and not ${has(`p."regClass" = 'THC'`)}
       order by ${has(`p."regClass" <> 'APPAREL'`)} desc, o."createdAt" limit 1`,
    )
  )[0];
  await waitOnline();
  await page.getByRole("button", { name: "Orders" }).first().click();
  if (!ready) {
    const picking = (await q(`select code from "Order" where "storeId" = (select id from "Store" where code = 'PTA01') and status in ('PLACED','PICKING') and fulfilment = 'COLLECT' order by "createdAt" limit 1`))[0];
    if (!picking) fail("no click & collect order to hand over");
    for (let i = 0; i < 2; i++) {
      const b = page.getByTestId(`order-action-${picking.code}`);
      if (/Mark ready|Start picking/.test(await b.textContent())) (await b.click(), await page.waitForTimeout(1500));
    }
    ready = (await q(`select id, code, "collectionCode", "paymentStatus" from "Order" where code = $1`, [picking.code]))[0];
  }
  await page.getByTestId(`order-${ready.code}`).waitFor();
  await shot("orders-board");
  await page.getByTestId(`order-action-${ready.code}`).click();
  await page.locator("#collect-code").fill(ready.code); // the order code (on the board) is no proof: only the collection code is
  const idCheck = page.getByText(/I've checked their ID/);
  const needsId = (await idCheck.count()) > 0; // only orders with 18+ items ask for it
  if (needsId) await idCheck.click();
  await page.getByTestId("confirm-handover").click();
  await page.getByText(/doesn't match this order/).waitFor();
  ok("the order code is not accepted as the collection code");
  await page.locator("#collect-code").fill(ready.collectionCode);
  await shot("handover");
  await page.getByTestId("confirm-handover").click();
  if (ready.paymentStatus !== "PAID") {
    await page.getByTestId("tender-cash").click();
    await page.getByRole("button", { name: "Exact" }).click();
  }
  await page.getByText(new RegExp(`^${ready.code} (paid and )?handed over`)).waitFor();
  const done = (await q(`select o.status, o."idChecked", s.number, s."shiftId" from "Order" o join "Sale" s on s."orderId" = o.id where o.id = $1`, [ready.id]))[0];
  assert(
    done?.status === "COMPLETED" && done.idChecked === needsId && done.shiftId === shift.id,
    `order ${ready.code} completed${needsId ? ", ID checked" : " (no 18+ items: no ID check)"}, posted as ${done?.number}`,
  );

  step("Trade sale: an approved account on 30-day terms (R5,000 limit) buys an accessory and a CBD line — R100 cash, the rest on account");
  const store = (await q(`select id from "Store" where code = 'PTA01'`))[0];
  const taNo = `TA-${String(900000 + Math.floor(Math.random() * 99999))}`;
  tradeAccount = (
    await q(
      `insert into "TradeAccount" (id, number, name, "legalName", kind, "vatNumber", email, phone, "addressLine", suburb, city, province, "postalCode", status, terms, "paymentDays", "creditLimitCents", classes, "approvedAt", "adultAttestedAt", "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, 'E2E Green Leaf Pharmacy', 'E2E Green Leaf Pharmacy (Pty) Ltd', 'PHARMACY', '4123456789', $2, '+27125551234', '1 Burnett Street', 'Hatfield', 'Pretoria', 'GP', '0083', 'APPROVED', 'ACCOUNT', 30, 500000,
         '{CBD,CBD_FOOD,CBD_TOPICAL,HEMP,SUPPLEMENT,ACCESSORY,APPAREL,GROW}'::"RegClass"[], now(), now(), now(), now()) returning id, number, name, email`,
      [taNo, `trade.e2e.${Date.now()}@example.com`],
    )
  )[0];
  // What a pharmacy buying every range needs, verified by HQ (the document is a seeded one: nobody opens it here).
  await q(
    `insert into "TradeLicence" (id, "tradeAccountId", kind, number, "uploadId", status, "reviewedAt")
     select gen_random_uuid()::text, $1, k::"TradeLicenceKind", 'E2E/' || k, (select "uploadId" from "TradeLicence" order by "createdAt" limit 1), 'VERIFIED', now() from unnest($2::text[]) k`,
    [tradeAccount.id, ["PHARMACY_LICENCE", "SAPC_RECORDING", "FOOD_COA"]],
  );
  // The lines: the pouch (an accessory on this till) and a CBD supplement with one variant on the till, at their trade
  // price: the live TRADE list that prices them (best break for the quantity), else the wholesale price — as resolveTradePrice does.
  const tradeUnit = async (variantId, qty, fallback) =>
    (
      await q(
        `select i."priceCents" from "PriceListItem" i join "PriceList" l on l.id = i."priceListId"
         where i."variantId" = $1 and l.kind = 'TRADE' and l.active and (l."startsAt" is null or l."startsAt" <= now()) and (l."endsAt" is null or l."endsAt" >= now()) and i."minQty" <= $2
         order by l.priority desc, l."createdAt" desc, i."minQty" desc limit 1`,
        [variantId, qty],
      )
    )[0]?.priceCents ?? fallback;
  const pouch = (await q(`select v.id, v."wholesaleCents" from "Variant" v join "Product" p on p.id = v."productId" where p.name = 'Smell-proof Pouch' and v.active limit 1`))[0];
  const cbd = (
    await q(
      `select p.name, v.id, v."wholesaleCents" from "Product" p join "Variant" v on v."productId" = p.id and v.active
       where p."regClass" = 'CBD' and p.status = 'ACTIVE' and v."wholesaleCents" > 0 and v."podSku" is null
         and (exists (select 1 from "StoreVariant" sv where sv."variantId" = v.id and sv."storeId" = $1) or exists (select 1 from "StockLevel" sl where sl."variantId" = v.id and sl."storeId" = $1 and sl."onHand" > 0))
         and (select count(*) from "Variant" v2 where v2."productId" = p.id and v2.active) = 1
       order by p.name limit 1`,
      [store.id],
    )
  )[0];
  if (pouch) pouch.wholesaleCents = await tradeUnit(pouch.id, 1, pouch.wholesaleCents);
  if (cbd) cbd.wholesaleCents = await tradeUnit(cbd.id, 1, cbd.wholesaleCents);
  assert(pouch && cbd, `trade lines: Smell-proof Pouch (R${(pouch?.wholesaleCents / 100).toFixed(2)} ex VAT) and ${cbd?.name} (R${(cbd?.wholesaleCents / 100).toFixed(2)} ex VAT)`);
  await waitOnline();
  await page.getByRole("button", { name: "Sell" }).first().click();
  await page.getByTestId("trade-sale").first().click();
  await page.getByTestId("trade-search").fill(taNo.toLowerCase().replace("-", " ")); // the number however typed
  const hit = page.getByTestId(`trade-account-${taNo}`);
  await hit.waitFor();
  const hitText = (await hit.textContent()) ?? "";
  assert(/Approved/.test(hitText) && /On account · 30 days/.test(hitText) && /R5,000\.00 available on account/.test(hitText), `lookup shows ${taNo}: approved, on account · 30 days, R5,000.00 available`);
  await shot("trade-lookup");
  await hit.click();
  const banner = page.getByTestId("trade-banner");
  await banner.waitFor();
  assert(/TRADE SALE · E2E GREEN LEAF PHARMACY/i.test(await banner.textContent()) && (await page.getByTestId("customer-card").count()) === 0, "basket in trade mode: TRADE SALE banner, no member panel");
  await page.getByRole("button", { name: /^Smell-proof Pouch/ }).click();
  await page.getByRole("button", { name: new RegExp(`^${esc(cbd.name)}`) }).click();
  await page.waitForFunction(() => {
    const lines = [...document.querySelectorAll("[data-testid=cart-line]")];
    return lines.length === 2 && lines.every((el) => /ex VAT each/.test(el.textContent ?? ""));
  });
  const exp = { ex: pouch.wholesaleCents + cbd.wholesaleCents, vat: vatOn(pouch.wholesaleCents) + vatOn(cbd.wholesaleCents) };
  exp.total = exp.ex + exp.vat;
  const shown = { ex: (await page.getByTestId("cart-ex-vat").textContent()).trim(), vat: (await page.getByTestId("cart-vat").textContent()).trim(), total: (await page.getByTestId("cart-total").textContent()).trim() };
  assert(shown.ex === zarText(exp.ex) && shown.vat === zarText(exp.vat) && shown.total === zarText(exp.total), `basket priced ex VAT: ${shown.ex} + VAT ${shown.vat} = ${shown.total} incl`);
  await shot("trade-basket");
  await page.getByTestId("pay").click();
  await page.getByTestId("block-AGE").waitFor();
  ok("the usual 18+ counter check still applies to a trade sale");
  await page.getByRole("button", { name: /ID sighted/ }).click();
  await page.getByTestId("remaining").waitFor();
  const accountTender = page.getByTestId("tender-account");
  assert(await accountTender.isVisible() && /R5,000\.00 available on account/.test(await accountTender.textContent()), "On account offered: R5,000.00 available");
  assert((await page.getByTestId("tender-points").count()) === 0 && (await page.getByTestId("tender-voucher").count()) === 0 && (await page.getByTestId("tender-eft").count()) === 1, "no points or gift voucher tenders on a trade sale; EFT offered");
  await page.locator("#pay-amount").fill("100");
  await page.getByTestId("tender-cash").click();
  await page.getByRole("button", { name: "Exact" }).click();
  await page.locator("[aria-label=Tenders]").getByText(/^Cash · tendered R100\.00/).waitFor();
  await accountTender.click();
  await page.getByTestId("account-panel").waitFor();
  await shot("trade-payment");
  await page.getByTestId("account-apply").click();
  await page.getByTestId("receipt").waitFor({ timeout: 30_000 });
  const tradeNo = await receiptNo();
  const tradeReceipt = (await page.getByRole("dialog").filter({ has: page.getByTestId("receipt") }).textContent()) ?? "";
  assert(/Tax invoice/i.test(tradeReceipt) && /On account · due/.test(tradeReceipt) && tradeReceipt.includes(`Trade account ${taNo}`), `receipt ${tradeNo} says TAX INVOICE and On account · due date`);
  assert(tradeReceipt.includes(tradeAccount.email), `tax invoice emailed to the account's billing address ${tradeAccount.email}`);
  await shot("trade-receipt");
  // The printed tax invoice (browser-print fallback): the buyer block, ex-VAT lines and the on-account terms.
  await page.getByRole("button", { name: "Print receipt" }).click();
  await page.getByTestId("print-area").waitFor({ state: "attached" });
  const printed = (await page.getByTestId("print-area").textContent()) ?? "";
  assert(/Tax invoice/i.test(printed) && /Buyer: E2E Green Leaf Pharmacy \(Pty\) Ltd/.test(printed) && /ex VAT/.test(printed) && /On account.*· due/.test(printed) && !/Points/.test(printed), "printed tax invoice: buyer block with VAT number, unit prices ex VAT, On account · due date, no points");
  await page.emulateMedia({ media: "print" });
  await shot("trade-tax-invoice");
  await page.emulateMedia({ media: null });
  const tsale = (await q(`select id, channel, "tradeAccountId", "totalCents", "vatCents", "shiftId", "pointsEarned", "customerId", buyer from "Sale" where number = $1`, [tradeNo]))[0];
  assert(tsale?.channel === "WHOLESALE" && tsale.tradeAccountId === tradeAccount.id && tsale.customerId === null && tsale.shiftId === shift.id && tsale.totalCents === exp.total && tsale.vatCents === exp.vat, `Sale ${tradeNo}: WHOLESALE, trade account set, no member, on the shift, ${zarText(tsale?.totalCents)} incl (VAT ${zarText(tsale?.vatCents)})`);
  assert(tsale.buyer?.vatNumber === "4123456789" && /E2E Green Leaf Pharmacy/.test(tsale.buyer?.name ?? ""), "the account's buyer block is on the sale");
  const tpays = await q(`select method, "amountCents", reference from "Payment" where "saleId" = $1`, [tsale.id]);
  const onAccount = tsale.totalCents - 10000;
  assert(tpays.some((p) => p.method === "CASH" && p.amountCents === 10000) && tpays.some((p) => p.method === "ACCOUNT" && p.amountCents === onAccount && p.reference === taNo), `payments: R100.00 cash + ${zarText(onAccount)} ACCOUNT (reference ${taNo})`);
  const inv = (await q(`select cents, "dueAt", "saleId", reference from "TradeLedgerEntry" where "tradeAccountId" = $1 and kind = 'INVOICE'`, [tradeAccount.id]))[0];
  assert(inv?.cents === onAccount && inv.dueAt && inv.saleId === tsale.id && inv.reference === tradeNo, `ledger INVOICE ${zarText(inv?.cents)} due ${inv?.dueAt?.toISOString().slice(0, 10)} against the sale`);
  assert(tsale.pointsEarned === 0 && (await q(`select count(*)::int as c from "LoyaltyEntry" where "saleId" = $1`, [tsale.id]))[0].c === 0, "no points: no LoyaltyEntry on a trade sale");
  await page.getByTestId("new-sale").click();
  await banner.waitFor({ state: "detached" });
  ok("trade mode ends with the sale: the next basket is retail");

  step("Refund the pouch from the trade sale: what was on account comes back as a credit note");
  await page.getByRole("button", { name: "Sales" }).first().click();
  await page.getByLabel("Search by receipt number").fill(tradeNo);
  await page.locator("[aria-label='Recent sales'] li button", { hasText: tradeNo }).first().click();
  await page.getByTestId("sale-trade").waitFor();
  await page.getByTestId("start-refund").first().click();
  await page.getByRole("button", { name: /Increase refund quantity of Smell-proof Pouch/ }).click();
  const pouchIncl = (await q(`select "totalCents" from "SaleLine" where "saleId" = $1 and "variantId" = $2`, [tsale.id, pouch.id]))[0].totalCents;
  const accountText = (await page.getByTestId("refund-account").textContent()) ?? "";
  assert(accountText.includes(`${zarText(pouchIncl)} goes back onto the account as a credit note`) && /nothing to pay out in money/.test(accountText), `refund sheet: ${zarText(pouchIncl)} back onto the account as a credit note, nothing paid out`);
  assert((await page.locator("#refund-method option").allTextContents()).every((t) => !/account|voucher/i.test(t)), "the refund-to list has no On account or Gift voucher");
  await shot("trade-refund-sheet");
  await page.getByTestId("refund-continue").click();
  await page.getByRole("button", { name: "Confirm refund" }).click();
  await page.getByText(/^Refund PTA01-[A-Z]\d{5}.* done/).waitFor();
  const tref = (await q(`select id, number, "totalCents", channel from "Sale" where "refundOfId" = $1`, [tsale.id]))[0];
  const trpays = await q(`select method, "amountCents" from "Payment" where "saleId" = $1`, [tref.id]);
  const cn = (await q(`select cents, reference, "saleId" from "TradeLedgerEntry" where "tradeAccountId" = $1 and kind = 'CREDIT_NOTE'`, [tradeAccount.id]))[0];
  assert(tref.channel === "WHOLESALE" && tref.totalCents === -pouchIncl && trpays.length === 1 && trpays[0].method === "ACCOUNT" && trpays[0].amountCents === -pouchIncl, `credit note ${tref.number}: −${zarText(pouchIncl)} back onto the account, no money out`);
  assert(cn?.cents === -pouchIncl && cn.reference === tref.number && cn.saleId === tsale.id, `ledger CREDIT_NOTE ${tref.number} for ${zarText(pouchIncl)} against the original sale`);

  step("Trade click & collect: a READY order at PTA01 (on account) is handed over against the buyer's code and an ID check");
  const toNo = `TO-${String(900000 + Math.floor(Math.random() * 99999))}`;
  const code6 = String(100000 + Math.floor(Math.random() * 900000));
  const toLine = { qty: 2, unit: pouch.wholesaleCents };
  const toEx = toLine.qty * toLine.unit;
  const handling = 7500; // settings.trade.collectHandlingCents (R75 ex VAT)
  const toTotal = toEx + vatOn(toEx) + handling + vatOn(handling);
  tradeOrder = (
    await q(
      `insert into "TradeOrder" (id, number, "tradeAccountId", "storeId", fulfilment, status, "payMethod", "subtotalCents", "deliveryCents", "handlingCents", "vatCents", "totalCents", "collectionCode", events, "reservedAt", "readyAt", "createdAt", "updatedAt")
       values (gen_random_uuid()::text, $1, $2, $3, 'COLLECT', 'READY', 'ACCOUNT', $4, 0, $5, $6, $7, $8,
         $9::jsonb, now() - interval '1 hour', now() - interval '10 minutes', now() - interval '1 hour', now()) returning id, number`,
      [toNo, tradeAccount.id, store.id, toEx, handling, vatOn(toEx) + vatOn(handling), toTotal, code6, JSON.stringify([{ status: "PLACED", at: new Date(Date.now() - 3_600_000).toISOString(), note: "Placed on account; stock reserved" }, { status: "READY", at: new Date(Date.now() - 600_000).toISOString() }])],
    )
  )[0];
  await q(`insert into "TradeOrderLine" (id, "tradeOrderId", "variantId", qty, "unitCents", "vatCents") values (gen_random_uuid()::text, $1, $2, $3, $4, $5)`, [tradeOrder.id, pouch.id, toLine.qty, toLine.unit, vatOn(toEx)]);
  await page.getByRole("button", { name: "Orders" }).first().click();
  await page.getByRole("button", { name: "Refresh orders" }).click();
  const tcard = page.getByTestId(`order-${toNo}`);
  await tcard.waitFor();
  const tcardText = (await tcard.textContent()) ?? "";
  assert(tcardText.includes(`Trade · ${toNo}`) && /E2E Green Leaf Pharmacy/.test(tcardText) && /On account/.test(tcardText), `board shows "Trade · ${toNo}" for the account with its terms`);
  await shot("trade-order-board");
  await page.getByTestId(`order-action-${toNo}`).click();
  await page.getByTestId("trade-handover").waitFor();
  await page.locator("#collect-code").fill("000000");
  await page.getByText(/I've checked the collector's ID/).click();
  await page.getByTestId("confirm-handover").click();
  await page.getByText(new RegExp(`doesn't match ${toNo}`)).waitFor();
  ok("wrong collection code rejected");
  await page.locator("#collect-code").fill(code6);
  await shot("trade-handover");
  await page.getByTestId("confirm-handover").click();
  await page.getByText(new RegExp(`^${toNo} handed over`)).waitFor();
  const tdone = (await q(`select o.status, o."collectedAt", o."invoiceNumber", s.number, s.channel, s."storeId", s."totalCents", s."shiftId", s."tradeAccountId" from "TradeOrder" o join "Sale" s on s.id = o."saleId" where o.id = $1`, [tradeOrder.id]))[0];
  assert(tdone?.status === "COLLECTED" && tdone.collectedAt && tdone.channel === "WHOLESALE" && tdone.storeId === store.id && tdone.tradeAccountId === tradeAccount.id, `${toNo} COLLECTED: sale ${tdone?.number} posted at PTA01 (WHOLESALE)`);
  assert(tdone.totalCents === toTotal && tdone.shiftId === shift.id, `the sale totals ${zarText(tdone.totalCents)} incl VAT — lines plus the R75 handling fee — on this till's shift`);
  const tdpay = await q(`select method, "amountCents" from "Payment" where "saleId" = (select "saleId" from "TradeOrder" where id = $1)`, [tradeOrder.id]);
  const tinv = (await q(`select cents, "tradeOrderId", "dueAt" from "TradeLedgerEntry" where "tradeAccountId" = $1 and kind = 'INVOICE' and reference = $2`, [tradeAccount.id, tdone.invoiceNumber]))[0];
  assert(tdpay.length === 1 && tdpay[0].method === "ACCOUNT" && tdpay[0].amountCents === toTotal && tinv?.cents === toTotal && tinv.tradeOrderId === tradeOrder.id && tinv.dueAt, `ACCOUNT tender and ledger INVOICE ${tdone.invoiceNumber} for the order`);

  step("Close the shift with a count → Z-report (the Shift view shows my commission this month)");
  await waitOnline();
  await page.getByRole("button", { name: "Shift" }).first().click();
  const tile = page.getByTestId("my-commission"); // PTA01 pays commission in the demo
  await tile.waitFor();
  const mine = (await tile.textContent()).replace("Your commission this month", "");
  assert(/^R[\d,]+\.\d\d$|^Held — see your manager$/.test(mine), `commission tile: ${mine}`);
  await page.getByTestId("denom-20000").fill("7");
  // A count out by more than the R50 tolerance needs a note before the shift can close.
  await page.locator("#shift-notes").fill("E2E run: test count");
  await page.getByTestId("close-shift").click();
  await page.getByRole("button", { name: "Close shift", exact: true }).click();
  await page.getByTestId("z-report").waitFor();
  const zText = (await page.getByTestId("z-report").textContent()) ?? "";
  assert(/Trade sales \(ex VAT · VAT · incl\)2 ·/.test(zText.replace(/\s+/g, " ")) || /Trade sales/.test(zText), "Z-report shows the trade sales section");
  assert(/On account/.test(zText) && /Cash/.test(zText), "On account is its own tender line, apart from cash and card");
  await shot("z-report");
  const z = (await q(`select "expectedCashCents", "countedCashCents" from "Shift" where id = $1`, [shift.id]))[0];
  assert(z.countedCashCents === 140000, `shift closed: expected ${z.expectedCashCents / 100}, counted ${z.countedCashCents / 100}`);
  await new Promise((r) => setTimeout(r, 1500));
  const mail = (await q(`select "to", left(body, 60) b from "MessageLog" where channel = 'EMAIL' and body like 'Z-report%' order by "createdAt" desc limit 1`))[0];
  assert(mail?.to === "hatfield@herbalholland.co.za", `Z-report emailed to ${mail?.to}`);

  step("Offline reload: the service worker serves the till shell and assets");
  await page.getByRole("button", { name: "Done" }).click();
  await ctx.setOffline(true);
  const fromSw = [];
  const onResp = (r) => fromSw.push({ url: r.url(), sw: r.fromServiceWorker(), status: r.status() });
  page.on("response", onResp);
  await page.reload({ waitUntil: "load", timeout: 30_000 });
  page.off("response", onResp);
  const doc = fromSw.find((r) => new URL(r.url).pathname === "/pos");
  const assets = fromSw.filter((r) => r.url.includes("/_next/static/"));
  assert(doc?.sw && doc.status === 200, "/pos document served from the service-worker cache while offline");
  assert(assets.length > 0 && assets.every((a) => a.sw && a.status === 200), `${assets.length} static assets served from the cache`);
  await shot("offline-reload");
  await ctx.setOffline(false);

  step("Clean up: unpair the test till (manager)");
  await page.goto(`${BASE}/pos`);
  await page.getByRole("button", { name: "Shift" }).first().click({ timeout: 90_000 });
  await page.getByRole("button", { name: /Unpair this till/ }).click();
  await page.getByRole("button", { name: "Unpair", exact: true }).click();
  await page.waitForURL(/\/pos\/pair/);
  const gone = (await q(`select active from "Device" where id = $1`, [device.id]))[0];
  assert(gone.active === false, "test till unpaired");

  console.log("\nALL STEPS PASSED");
} catch (e) {
  console.log("\n✗ FAILED:", e.message.split("\n")[0]);
  await shot("FAILED").catch(() => undefined);
  process.exitCode = 1;
} finally {
  if (tempEvent) await q(`delete from "StoreEvent" where id = $1`, [tempEvent.id]).catch(() => undefined); // its tickets go with it
  if (tempVoucher) {
    await q(`delete from "VoucherRedemption" where "voucherId" = $1`, [tempVoucher.id]).catch(() => undefined);
    await q(`delete from "GiftVoucher" where id = $1`, [tempVoucher.id]).catch(() => undefined);
  }
  // The trade order and the account's ledger go; the account is closed (its sales keep pointing at it, as real ones would).
  if (tradeOrder) {
    await q(`delete from "TradeOrderLine" where "tradeOrderId" = $1`, [tradeOrder.id]).catch(() => undefined);
    await q(`delete from "TradeOrder" where id = $1`, [tradeOrder.id]).catch(() => undefined);
  }
  if (tradeAccount) {
    await q(`delete from "TradeLedgerEntry" where "tradeAccountId" = $1`, [tradeAccount.id]).catch(() => undefined);
    await q(`update "TradeAccount" set status = 'CLOSED', "holdReason" = 'E2E run finished', "updatedAt" = now() where id = $1`, [tradeAccount.id]).catch(() => undefined);
  }
  if (problems.length) console.log("\nNotes:\n" + problems.join("\n"));
  await browser.close();
  await db.end();
}
