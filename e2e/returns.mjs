// End-to-end test of returns (Playwright + direct DB checks).
//   BASE_URL=http://localhost:3000 DATABASE_FILE=<the local D1 file> node e2e/returns.mjs [outdir]   (seeded demo data, DEMO_MODE=true)
// Two members each open a return on a completed PTA01 click & collect order through the club page (phone code sign-in).
// The PTA01 manager declines one (an empty reason is refused first) and takes the other all the way: approve → book the
// courier collection → parcel received → refund by hand (EFT) with the item back on the shelf. Checks the status, the
// audit trail, the refund amount, the credit-note sale, the restock and that a second click on a finished step is refused.
// HQ sees both on its returns list. Re-runnable: the return requests and their audit rows are deleted at the end; the
// credit-note sale and its stock move stay, like real trading records.
import { chromium } from "@playwright/test";
import { createDb } from "./_db.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.argv[2] ?? "test-results/e2e-returns";
mkdirSync(out, { recursive: true });
const db = createDb();
await db.connect();
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

const CODE = "PTA01";
const MANAGER = "manager.pta01@herbalholland.com";
const HQ = "hq@herbalholland.com";
const run = Date.now().toString(36).slice(-5).toUpperCase();

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }));
const problems = [];
let current = "";
async function session(who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addCookies([{ name: "hh_age", value: "1", url: BASE }]);
  ctx.on("page", (p) => p.on("pageerror", (e) => problems.push(`[${who}] pageerror during “${current}”: ${e.message}`)));
  const page = await ctx.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  return { ctx, page };
}
const signIn = (page, email, next) => page.goto(`${BASE}/api/auth/demo?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
async function hydrated(locator) {
  const el = locator.first();
  await el.waitFor();
  for (let i = 0; i < 600; i++) {
    if (await el.evaluate((e) => Object.keys(e).some((k) => k.startsWith("__reactProps"))).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`never hydrated: ${el}`);
}
async function visit(p, path, ready) {
  await p.goto(`${BASE}${path}`);
  await hydrated(ready);
}
let n = 0;
const shot = (page, name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` }).catch(() => undefined);
const ok = (msg) => console.log("  ✓", msg);
const fail = (msg) => { throw new Error(msg); };
const assert = (cond, msg) => (cond ? ok(msg) : fail(msg));
const step = (s) => ((current = s), console.log(`\n▸ ${s}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20_000, every = 150) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}
const timings = [];
const isAction = (r) => r.request().method() === "POST" && !!r.request().headers()["next-action"];
async function act(page, label, trigger, done) {
  const resp = page.waitForResponse(isAction, { timeout: 90_000 });
  resp.catch(() => undefined);
  const t0 = performance.now();
  await trigger();
  await resp;
  await done();
  const ms = Math.round(performance.now() - t0);
  timings.push({ label, ms });
  console.log(`    ⏱ ${label}: ${ms} ms`);
}
const audits = async (action, entityId) => Number((await one(`SELECT count(*) AS n FROM "AuditLog" WHERE action = $1 AND entityId = $2`, [action, entityId])).n);
const statusOf = async (id) => (await one(`SELECT status FROM "ReturnRequest" WHERE id = $1`, [id]))?.status;

const cleanup = [];
const later = (label, fn) => cleanup.push({ label, fn });

// A member signs in with their phone and the demo code, landing on the order's return page.
async function memberSignIn(page, phone, next) {
  await page.goto(`${BASE}/club/join?next=${encodeURIComponent(next)}`);
  await hydrated(page.getByLabel("Mobile number"));
  await page.getByLabel("Mobile number").fill(`0${phone.slice(3)}`);
  await page.getByRole("button", { name: /Send my code/ }).click();
  await page.getByRole("button", { name: "Fill it in" }).click();
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((u) => u.pathname === next, { timeout: 60_000 });
}

// The member opens a return of one unit of the first returnable line for `reason`; returns the new ReturnRequest row.
async function requestReturn(order, reasonLabel, note) {
  const { ctx, page } = await session(`member ${order.code}`);
  try {
    const path = `/club/orders/${order.code}/return`;
    await memberSignIn(page, order.phone, path);
    const form = page.getByRole("form", { name: "Return or report a problem" });
    await hydrated(form.locator('input[name="reason"]'));
    await form.locator("label").filter({ hasText: reasonLabel }).first().click();
    const qty = form.locator('select[name^="qty:"]:not([disabled])').first();
    await qty.waitFor();
    const variantId = (await qty.getAttribute("name")).slice(4);
    await qty.selectOption("1");
    await form.locator("#rt-note").fill(note);
    const sealed = form.getByLabel(/unopened, sealed/);
    if (await sealed.isVisible().catch(() => false)) await sealed.check();
    await shot(page, `member-${order.code}-form`);
    await act(page, `member requests a return (${reasonLabel})`, () => form.getByRole("button", { name: "Send return request" }).click(), () => page.waitForURL(/[?&]done=RT-/));
    const number = new URL(page.url()).searchParams.get("done");
    await page.getByText(`Thanks. Your return request is ${number}.`).waitFor();
    await shot(page, `member-${order.code}-done`);
    const r = await one(`SELECT * FROM "ReturnRequest" WHERE number = $1`, [number]);
    assert(r && r.status === "REQUESTED" && r.orderId === order.id, `${number} saved as REQUESTED on order ${order.code}`);
    later(`delete ${number}`, async () => {
      await q(`DELETE FROM "AuditLog" WHERE entityId = $1`, [r.id]);
      await q(`DELETE FROM "MessageLog" WHERE id LIKE $1`, [`return-${r.id}-%`]);
      await q(`DELETE FROM "ReturnRequest" WHERE id = $1`, [r.id]);
    });
    const items = typeof r.items === "string" ? JSON.parse(r.items) : r.items;
    assert(items.length === 1 && items[0].variantId === variantId && items[0].qty === 1, "the request holds the one unit chosen");
    assert((await audits("return.request", r.id)) === 1, "return.request audited once");
    return { ...r, variantId };
  } finally {
    await ctx.close();
  }
}

try {
  step("Setup: two completed PTA01 click & collect orders inside the return windows, with no open returns");
  // Picked by what they are, not by code, so any seed works: completed and paid in the last 150 days (inside the
  // six-month defect window), with lines, never returned before, from two different members with phones. The refund
  // order was not paid online, so it is refunded by hand. Each has its online sale, never refunded, so a credit note posts.
  const orders = await q(
    `SELECT o.id, o.code, o.payMethod, o.paymentRef, o.customerId, c.phone FROM "Order" o JOIN "Customer" c ON c.id = o.customerId JOIN "Store" s ON s.id = o.storeId
     WHERE s.code = $1 AND o.status = 'COMPLETED' AND o.paymentStatus = 'PAID' AND o.fulfilment = 'COLLECT' AND c.phone IS NOT NULL
       AND o.completedAt > datetime('now', '-150 days')
       AND EXISTS (SELECT 1 FROM "OrderLine" l WHERE l.orderId = o.id)
       AND NOT EXISTS (SELECT 1 FROM "ReturnRequest" r WHERE r.orderId = o.id)
       AND NOT EXISTS (SELECT 1 FROM "GiftVoucher" g WHERE g.purchaseOrderId = o.id)
       AND EXISTS (SELECT 1 FROM "Sale" s1 WHERE s1.orderId = o.id)
       AND NOT EXISTS (SELECT 1 FROM "Sale" s1 JOIN "Sale" x ON x.refundOfId = s1.id WHERE s1.orderId = o.id)
     ORDER BY o.completedAt DESC LIMIT 200`, [CODE]);
  const refundOrder = orders.find((o) => o.payMethod !== "ONLINE");
  const declineOrder = refundOrder && orders.find((o) => o.customerId !== refundOrder.customerId);
  assert(refundOrder && declineOrder, `two unreturned orders from two members (${refundOrder?.code} ${refundOrder?.payMethod}, ${declineOrder?.code})`);

  step("Signed out, the return page sends the member to sign in first");
  {
    const { ctx, page } = await session("anon");
    await page.goto(`${BASE}/club/orders/${refundOrder.code}/return`);
    // The redirect streams after the loading shell (a meta refresh), so wait for it rather than reading the URL at once.
    await page.waitForURL((u) => u.pathname === "/club/join", { timeout: 30_000 });
    assert(new URL(page.url()).searchParams.get("next") === `/club/orders/${refundOrder.code}/return`, "redirected to /club/join with next set");
    await ctx.close();
  }

  step("Members request two returns");
  const wrong = await requestReturn(refundOrder, "It's not what I ordered", `E2E ${run}: wrong flavour in the bag`);
  const faulty = await requestReturn(declineOrder, "It's faulty", `E2E ${run}: the pump doesn't work`);

  step("Manager declines one: an empty reason is refused, then a real one goes through");
  const { ctx: mctx, page: mp } = await session("manager");
  await signIn(mp, MANAGER, `/store/${CODE}/returns`);
  await mp.waitForURL(new RegExp(`/store/${CODE}/returns`));
  for (const r of [wrong, faulty]) assert(await mp.getByText(r.number).first().isVisible(), `${r.number} on the store's returns list`);
  await shot(mp, "store-returns-list");
  {
    await visit(mp, `/store/${CODE}/returns/${faulty.id}`, mp.getByRole("button", { name: "Decline" }));
    await mp.getByRole("button", { name: "Decline" }).click();
    const dlg = mp.getByRole("group", { name: "Decline this return?" });
    await dlg.waitFor();
    await act(mp, "decline with no reason (refused)", () => dlg.getByRole("button", { name: "Decline" }).click(), () => dlg.getByRole("alert").filter({ hasText: "Say why: the member is told the reason" }).first().waitFor());
    assert((await statusOf(faulty.id)) === "REQUESTED", "still REQUESTED after the empty decline");
    await dlg.locator("#decline-note").fill(`E2E ${run}: outside the policy`);
    await act(mp, "decline", () => dlg.getByRole("button", { name: "Decline" }).click(), () => until(async () => (await statusOf(faulty.id)) === "DECLINED"));
    const r = await one(`SELECT decisionNote, decidedById FROM "ReturnRequest" WHERE id = $1`, [faulty.id]);
    assert(r.decisionNote?.includes(run) && r.decidedById, "decision note and decider saved");
    assert((await audits("return.decline", faulty.id)) === 1, "return.decline audited once");
    await mp.reload();
    await mp.getByText("Declined").first().waitFor();
    assert(!(await mp.getByRole("button", { name: "Approve" }).isVisible().catch(() => false)), "no Approve button on a declined return");
    await shot(mp, "store-declined");
  }

  step("Manager approves the other, books the courier, receives it and refunds it by hand");
  const detail = `/store/${CODE}/returns/${wrong.id}`;
  await visit(mp, detail, mp.getByRole("button", { name: "Approve" }));
  // A stale second tab: it still shows Approve after the first tab has approved.
  const stalePage = await mctx.newPage();
  await stalePage.goto(`${BASE}${detail}`);
  await hydrated(stalePage.getByRole("button", { name: "Approve" }));
  {
    await mp.getByRole("button", { name: "Approve" }).click();
    const dlg = mp.getByRole("group", { name: "Approve this return?" });
    await dlg.locator("#approve-note").fill(`E2E ${run}: keep the box`);
    await act(mp, "approve", () => dlg.getByRole("button", { name: "Approve" }).click(), () => until(async () => (await statusOf(wrong.id)) === "APPROVED"));
    assert((await audits("return.approve", wrong.id)) === 1, "return.approve audited once");
  }
  {
    await stalePage.getByRole("button", { name: "Approve" }).click();
    const dlg = stalePage.getByRole("group", { name: "Approve this return?" });
    await act(stalePage, "approve again from a stale tab (refused)", () => dlg.getByRole("button", { name: "Approve" }).click(), () => stalePage.getByText(/changed while you were on it|can't be approved/).first().waitFor());
    assert((await audits("return.approve", wrong.id)) === 1, "the stale second approve wrote nothing");
    await stalePage.close();
  }
  {
    await visit(mp, detail, mp.locator("#rt-courier"));
    await act(mp, "book collection with no courier (refused)", () => mp.getByRole("button", { name: "Collection booked" }).click(), () => mp.getByText("Which courier is collecting?").first().waitFor());
    assert((await statusOf(wrong.id)) === "APPROVED", "still APPROVED without a courier");
    await mp.locator("#rt-courier").fill("The Courier Guy");
    await mp.locator("#rt-waybill").fill(`E2E-${run}`);
    await act(mp, "collection booked", () => mp.getByRole("button", { name: "Collection booked" }).click(), () => until(async () => (await statusOf(wrong.id)) === "COLLECTION_BOOKED"));
    const r = await one(`SELECT courier, waybill FROM "ReturnRequest" WHERE id = $1`, [wrong.id]);
    assert(r.courier === "The Courier Guy" && r.waybill === `E2E-${run}`, "courier and waybill saved");
    assert((await audits("return.book_collection", wrong.id)) === 1, "return.book_collection audited once");
  }
  {
    await visit(mp, detail, mp.getByRole("button", { name: "Parcel received" }));
    await act(mp, "parcel received", () => mp.getByRole("button", { name: "Parcel received" }).click(), () => until(async () => (await statusOf(wrong.id)) === "RECEIVED"));
    assert((await audits("return.receive", wrong.id)) === 1, "return.receive audited once");
  }
  {
    await visit(mp, detail, mp.getByRole("button", { name: /^Refund R/ }));
    const store = await one(`SELECT id FROM "Store" WHERE code = $1`, [CODE]);
    const stockOf = async () => Number((await one(`SELECT coalesce(sum(onHand), 0) AS n FROM "StockLevel" WHERE storeId = $1 AND variantId = $2`, [store.id, wrong.variantId]))?.n ?? 0);
    const before = await stockOf().catch(() => null);
    const restock = mp.locator(`input[name="restock:${wrong.variantId}"]`);
    if (!(await restock.isChecked())) await mp.locator("label").filter({ has: restock }).first().click();
    const manual = await mp.locator("#rt-method").isVisible().catch(() => false);
    assert(manual, `order ${refundOrder.code} (${refundOrder.payMethod}) is refunded by hand: method and reference asked for`);
    await mp.locator("#rt-method").selectOption("EFT");
    await mp.locator("#rt-ref").fill(`E2E-${run}`);
    await shot(mp, "store-refund-form");
    await act(mp, "refund", () => mp.getByRole("button", { name: /^Refund R/ }).click(), () => until(async () => (await statusOf(wrong.id)) === "REFUNDED", 60_000));
    const r = await one(`SELECT refundCents, refundRef FROM "ReturnRequest" WHERE id = $1`, [wrong.id]);
    assert(Number(r.refundCents) > 0, `refund amount saved (${r.refundCents} cents)`);
    assert(r.refundRef?.includes(`E2E-${run}`), "manual refund reference saved");
    const sale = await one(`SELECT number, kind, totalCents FROM "Sale" WHERE id = $1`, [`return-${wrong.id}`]);
    assert(sale && sale.number === `${CODE}-${wrong.number}`, `credit-note sale ${CODE}-${wrong.number} posted`);
    assert(Math.abs(Number(sale.totalCents)) <= Number(r.refundCents), "credit note is not more than the refund");
    assert((await audits("return.refund", wrong.id)) === 1, "return.refund audited once");
    if (before !== null) assert((await stockOf()) === before + 1, "the unit is back on the shelf");
    const told = await q(`SELECT id FROM "MessageLog" WHERE id LIKE $1`, [`return-${wrong.id}-%`]);
    const member = await one(`SELECT email FROM "Customer" WHERE id = $1`, [wrong.customerId]);
    if (member?.email) assert(told.length === 5, `the member was emailed at each of the 5 steps (${told.length} emails)`);
    else ok("member has no email: told by SMS instead (not checked here)");
    await mp.reload();
    assert(!(await mp.getByRole("button", { name: /^Refund R/ }).isVisible().catch(() => false)), "no Refund button once refunded");
    await shot(mp, "store-refunded");
  }
  await mctx.close();

  step("HQ sees both returns");
  {
    const { ctx, page } = await session("hq");
    await signIn(page, HQ, "/hq/returns");
    await page.waitForURL(/\/hq\/returns/);
    for (const r of [wrong, faulty]) {
      const shown = await until(async () => (await page.getByText(r.number).count()) > 0 || (await page.goto(`${BASE}/hq/returns?q=${r.number}`), false), 10_000);
      assert(shown, `${r.number} on /hq/returns`);
    }
    await page.goto(`${BASE}/hq/returns/${wrong.id}`);
    await page.getByText(wrong.number).first().waitFor();
    ok("HQ opens the refunded return");
    await shot(page, "hq-return");
    await ctx.close();
  }

  step("The member sees the outcome");
  {
    const { ctx, page } = await session("member check");
    const path = `/club/orders/${refundOrder.code}/return`;
    await memberSignIn(page, refundOrder.phone, path);
    await page.getByText(wrong.number).first().waitFor();
    assert(await page.getByText(/Refunded/).first().isVisible(), "member page shows the refund");
    await ctx.close();
  }

  if (problems.length) fail(`page errors:\n  ${problems.join("\n  ")}`);
} catch (e) {
  console.error(`\n✗ FAILED during “${current}”: ${e.message}`);
  process.exitCode = 1;
} finally {
  for (const c of cleanup.reverse()) await c.fn().then(() => console.log(`  ↺ ${c.label}`), (e) => console.error(`  ✗ cleanup ${c.label}: ${e.message}`));
  console.log("\nTimings:");
  for (const t of timings) console.log(`  ${String(t.ms).padStart(6)} ms  ${t.label}`);
  await browser.close();
  await db.end();
  if (!process.exitCode) console.log("\nALL STEPS PASSED");
}
