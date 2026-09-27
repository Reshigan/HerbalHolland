// End-to-end test of the till (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgresql://…/hh_dev node e2e/pos.mjs [outdir]   (seeded demo data)
// Pair PTA01 → PIN 1111 → open shift → walk-in CBD sale (ID sighted, cash) → patient flower
// sale (card, tap on glass) → event check-in from a members' evening ticket (member attached,
// welcome gift offered to a first-timer) → refund a line → offline cash sale → back online &
// sync → hand over a READY click & collect order → close the shift (Z-report).
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

  step("Walk-in: CBD balm, ID sighted, cash");
  await page.getByRole("button", { name: /^Recover CBD Muscle Balm/ }).click();
  await page.waitForTimeout(700);
  await page.getByTestId("pay").click();
  await page.getByTestId("block-AGE").waitFor();
  await shot("walkin-compliance");
  await page.getByRole("button", { name: /ID sighted/ }).click();
  await page.getByTestId("remaining").waitFor();
  await page.getByTestId("tender-cash").click();
  await page.getByRole("button", { name: "R400" }).click();
  await page.getByTestId("receipt").waitFor();
  await shot("walkin-receipt");
  const walkinNo = await receiptNo();
  assert(/^PTA01-[A-Z]00001/.test(walkinNo ?? ""), `receipt ${walkinNo} numbered from the device prefix`);
  assert((await page.getByTestId("change-due").textContent()).includes("R15.00"), "change due R15.00");
  const walkin = (await q(`select s.id, s."ageCheck", s."totalCents", s."shiftId", p.method, p."tenderedCents", p."changeCents" from "Sale" s join "Payment" p on p."saleId" = s.id where s.number = $1`, [walkinNo]))[0];
  assert(walkin?.ageCheck === "ID_SIGHTED" && walkin.method === "CASH" && walkin.changeCents === 1500 && walkin.shiftId === shift.id, "sale posted: ID_SIGHTED, cash R400 tendered, R15 change, on the shift");
  await page.getByTestId("new-sale").click();

  step("Patient member (HH0100002, active authorisation, home store PTA01): licensed flower by card");
  const patient = (await q(`select c.id, c.email, pa."authNumber" from "Customer" c join "PatientAuth" pa on pa."customerId" = c.id where c."memberNo" = 'HH0100002' and pa.status = 'ACTIVE' and pa."validTo" > now()`))[0];
  assert(patient, `patient ${patient?.authNumber} has an active authorisation`);
  await waitOnline();
  await page.getByRole("button", { name: /Find member/ }).first().click();
  await page.getByLabel("Search members").fill("HH0100002");
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
  const gift = (await q(`select name from "Promotion" where "firstPurchaseOnly" and active and 'POS' = any(channels) and "startsAt" <= now() and "endsAt" >= now() limit 1`))[0];
  if (seeded.visits === 0 && gift) {
    await page.locator("[data-testid=welcome-gift]:visible").first().click();
    await page.getByTestId("cart-line").filter({ hasText: gift.name }).waitFor();
    ok(`first-time member: welcome gift offered and added (${gift.name})`);
    await page.getByRole("button", { name: "Clear the basket" }).click();
    await page.getByRole("button", { name: "Clear basket", exact: true }).click();
  } else await page.getByRole("button", { name: "Remove customer from sale" }).click();
  await page.getByTestId("customer-card").waitFor({ state: "detached" });

  step("Refund the walk-in's balm (restock, cash)");
  await waitOnline();
  await page.getByRole("button", { name: "Sales" }).first().click();
  await page.getByLabel("Search by receipt number").fill(walkinNo);
  await page.locator("[aria-label='Recent sales'] li button", { hasText: walkinNo }).first().click();
  await page.getByTestId("start-refund").first().click();
  await page.getByRole("button", { name: /Increase refund quantity of Recover CBD Muscle Balm/ }).click();
  await shot("refund-sheet");
  await page.getByTestId("refund-continue").click();
  await page.getByRole("button", { name: "Confirm refund" }).click();
  await page.getByText(/^Refund PTA01-[A-Z]\d{5}.* done/).waitFor();
  await shot("credit-note");
  const refund = (await q(`select r.number, r."totalCents", p.method from "Sale" r join "Sale" o on o.id = r."refundOfId" join "Payment" p on p."saleId" = r.id where o.number = $1`, [walkinNo]))[0];
  assert(refund?.totalCents === -38500 && refund.method === "CASH", `refund ${refund?.number} of R385 in cash`);

  step("Go offline and ring up a cash sale");
  await page.getByRole("button", { name: "Sell" }).first().click();
  await ctx.setOffline(true);
  await page.getByTestId("connectivity").filter({ hasText: "Offline" }).waitFor();
  ok("indicator shows Offline");
  await page.getByRole("button", { name: /^Smell-proof Pouch/ }).click();
  await page.waitForTimeout(500);
  await page.getByTestId("pay").click();
  await page.getByTestId("block-AGE").waitFor();
  await page.getByRole("button", { name: /ID sighted/ }).click();
  await page.getByTestId("cash-panel").waitFor();
  assert(await page.getByTestId("tender-card").isDisabled(), "card disabled offline (cash only)");
  await page.getByRole("button", { name: "Exact" }).click();
  await page.getByTestId("receipt").waitFor();
  await shot("offline-receipt");
  const offlineNo = await receiptNo();
  assert((await page.getByTestId("queued-count").textContent()).trim() === "1", `sale ${offlineNo} queued (1 waiting to sync)`);
  await page.getByTestId("new-sale").click();

  step("Back online → outbox syncs");
  await ctx.setOffline(false);
  await page.getByTestId("queued-count").waitFor({ state: "detached", timeout: 60_000 });
  const synced = (await q(`select offline, "shiftId", "staffId", "totalCents" from "Sale" where number = $1`, [offlineNo]))[0];
  assert(synced?.offline === true && synced.shiftId === shift.id, `offline sale ${offlineNo} synced (offline=true, on the shift)`);

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
  await page.locator("#collect-code").fill("000000");
  const idCheck = page.getByText(/I've checked their ID/);
  const needsId = (await idCheck.count()) > 0; // only orders with 18+ items ask for it
  if (needsId) await idCheck.click();
  await page.getByTestId("confirm-handover").click();
  await page.getByText(/doesn't match this order/).waitFor();
  ok("wrong collection code rejected");
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

  step("Close the shift with a count → Z-report");
  await waitOnline();
  await page.getByRole("button", { name: "Shift" }).first().click();
  await page.getByTestId("denom-20000").fill("7");
  await page.getByTestId("close-shift").click();
  await page.getByRole("button", { name: "Close shift", exact: true }).click();
  await page.getByTestId("z-report").waitFor();
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
  if (problems.length) console.log("\nNotes:\n" + problems.join("\n"));
  await browser.close();
  await db.end();
}
