// HQ's side of the books, on the real services: a franchise statement in both books (a VAT vendor and a non-vendor
// franchisee, nothing for a month still trading), statement payments either way and one deleted, online payments (a
// cancellation, and a return refunded through Peach — a small in-memory fake, global fetch is mocked), a gift voucher
// sold, spent, expired and refunded onto, the points HQ gives and forfeits, the trade ledger (payments, a credit note,
// an adjustment; invoices and refund credit notes left to the store's day) and EFTs paid ahead; then posting again,
// the trial balance, the nightly list and the backfill listing.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, tx } from "@/server/db";
import { postSource, processLedgerQueue, queuePosting } from "@/server/ledger/core"; // first: core → sources → hq
import { hqBackfill, hqNightly } from "@/server/ledger/sources/hq";
import { deleteStatementPayment, paidByStore, recordStatementPayment, statementPayments } from "@/server/ledger/statement-payments";
import { franchiseStatement } from "@/server/finance";
import { advanceOrder, markOrderPaid, placeOrder } from "@/server/orders";
import { bookCollection, decideReturn, receiveReturn, refundReturn, requestReturn } from "@/server/returns";
import { expireVouchers, startVoucherPurchase } from "@/server/shop/vouchers";
import { postPosSale, refundSale } from "@/server/sales";
import { quote } from "@/server/pricing";
import { addPoints } from "@/server/loyalty";
import { birthdayPoints } from "@/server/jobs";
import { getSettings } from "@/server/settings";
import { adjustTradeLedger, issueCreditNote, recordTradePayment } from "@/server/trade/ledger";
import { advanceTradeOrder, confirmTradePayment, placeTradeOrder } from "@/server/trade/orders";
import { addMonths, monthEnd, periodOf } from "@/lib/ledger";
import { statementOutstanding } from "@/lib/ledger-hq";
import { addDays, dayKey } from "@/lib/format";
import type { PeachRefund } from "@/lib/peach";
import { buildWorld, resetDb, type World } from "./world";

const PEACH_API = "https://app.sandbox-next.peachpayments.com/api";
const address = { addressLine: "9 Protea Road", suburb: "Brooklyn", city: "Pretoria", province: "GP" as const, postalCode: "0181" };
const now = new Date();
const today = dayKey(now);
const yesterday = dayKey(addDays(now, -1));
const thisMonth = periodOf(today);
const month = addMonths(thisMonth, -2); // a month that's over
const lastMonth = addMonths(thisMonth, -1);
const HQ_SOURCES = ["statement", "statement-payment", "online-payment", "voucher", "points", "trade-entry", "trade-eft"];

let w: World;
let who: { type: "USER"; id: string; name: string };
let admin: { id: string; name: string; role: "HQ_ADMIN" };
let n = 0;

const member = () =>
  db.customer.create({ data: { memberNo: `HH0082${String(++n).padStart(4, "0")}`, phone: `+2782820${String(n).padStart(4, "0")}`, firstName: `Lee${n}`, referralCode: `LED${n}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date() } });
const stat = (storeId: string, day: string, channel: "POS" | "ONLINE", d: { grossCents: number; vatCents: number; onlineCents?: number; pointsIssued?: number; offerCents?: number }) =>
  db.dailyStoreStat.create({ data: { storeId, date: new Date(`${day}T00:00:00Z`), channel, sales: 1, ...d } });
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** What's posted in a company's books (optionally for one source), net by account key, zeros dropped. */
async function posted(companyId: string, where: { source?: string; sourceId?: string } = {}) {
  const lines = await db.journalLine.findMany({ where: { companyId, journal: { status: "POSTED", ...where } }, select: { amountCents: true, account: { select: { key: true, code: true } } } });
  const by: Record<string, number> = {};
  for (const l of lines) by[l.account.key ?? l.account.code] = (by[l.account.key ?? l.account.code] ?? 0) + l.amountCents;
  return Object.fromEntries(Object.entries(by).filter(([, v]) => v !== 0));
}
/** One account's posted amount, narrowed by source, store and party. */
async function amount(companyId: string, key: string, f: { source?: string; sourceId?: string; storeId?: string; partyId?: string } = {}) {
  const { source, sourceId, ...line } = f;
  const r = await db.journalLine.aggregate({ where: { companyId, account: { key }, ...line, journal: { status: "POSTED", ...(source && { source }), ...(sourceId && { sourceId }) } }, _sum: { amountCents: true } });
  return r._sum.amountCents ?? 0;
}
const journalDays = async (source: string, sourceId: string) => (await db.journal.findMany({ where: { source, sourceId }, orderBy: { number: "asc" }, select: { date: true } })).map((j) => dayOf(j.date));

/** Peach's refund API in memory: /refunds/list and /refunds. */
function fakePeach() {
  const refunds: PeachRefund[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      const path = url.slice(PEACH_API.length);
      if (path === "/refunds/list") return Response.json({ count: refunds.length, data: refunds.filter((r) => r.payment_id === body.payment_id) });
      if (path === "/refunds") {
        const r: PeachRefund = { refund_id: `ref_${randomUUID().slice(0, 8)}`, payment_id: String(body.payment_id), amount: Number(body.amount), currency: "ZAR", status: "succeeded" };
        refunds.push(r);
        return Response.json(r);
      }
      return Response.json({ error: { message: "Unrecognized request URL" } }, { status: 404 });
    }),
  );
  return refunds;
}

beforeAll(async () => {
  process.env.PEACH_API_KEY = "snd_integration_only";
  await resetDb();
  w = await buildWorld();
  who = { type: "USER", id: w.manager.id, name: w.manager.name };
  const a = await db.user.create({ data: { name: "Ayesha Admin", role: "HQ_ADMIN", companyId: w.hq.id } });
  admin = { id: a.id, name: a.name, role: "HQ_ADMIN" };
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  delete process.env.PEACH_API_KEY;
  await new Promise((r) => setTimeout(r, 500)); // fire-and-forget invoice emails
  await db.$disconnect();
});

describe("the franchise statement", () => {
  let other: { companyId: string; storeId: string };

  it("posts a franchisee store's month in both books on its last day: fees and VAT, points issued, My Deals", async () => {
    // R12,000 net sales, R2,000 of them online (paid online: R2,300), 500 points issued and R100 of My Deals.
    await stat(w.store.id, `${month}-10`, "POS", { grossCents: 1_150_000, vatCents: 150_000, pointsIssued: 500, offerCents: 10_000 });
    await stat(w.store.id, `${month}-20`, "ONLINE", { grossCents: 230_000, vatCents: 30_000, onlineCents: 230_000 });
    const st = await franchiseStatement(w.store.id, month);
    expect([st.royalty, st.levy, st.ecom, st.feesVat]).toEqual([72_000, 24_000, 20_000, 17_400]);

    const js = await postSource("statement", `${w.store.id}:${month}`);
    expect(js.map((j) => [j.companyId, dayOf(j.date), j.storeId]).sort()).toEqual([[w.hq.id, monthEnd(month), w.store.id], [w.owner.id, monthEnd(month), w.store.id]].sort());
    expect(await posted(w.owner.id, { source: "statement" })).toEqual({
      "fees.royalty": 72_000, "fees.levy": 24_000, "fees.ecom": 20_000, "vat.input": 17_400, "points.issued": 50_000, "offers.recovered": -10_000, hq: -173_400,
    });
    expect(await posted(w.hq.id, { source: "statement" })).toEqual({ franchisees: 173_400, royalty: -72_000, levy: -24_000, ecom: -20_000, "vat.output": -17_400, points: -50_000, "offers.funded": 10_000 });
    // The current account moves by the statement's own lines (credits − debits): My Deals less fees, VAT and points.
    const own = st.lines.filter((l) => ["My Deals given", "Royalty", "Marketing fund levy", "E-commerce commission", "VAT on fees", "Points issued"].includes(l.label));
    expect(await amount(w.owner.id, "hq", { source: "statement", storeId: w.store.id })).toBe(own.reduce((s, l) => s + (l.kind === "credit" ? l.cents : -l.cents), 0));
    // Every line is the store's; HQ's franchisee account names the company.
    expect(await db.journalLine.count({ where: { journal: { source: "statement" }, storeId: { not: w.store.id } } })).toBe(0);
    expect(await amount(w.hq.id, "franchisees", { source: "statement", storeId: w.store.id, partyId: w.owner.id })).toBe(173_400);
  });

  it("keeps a non-vendor franchisee's VAT on fees as a cost", async () => {
    const company = await db.company.create({ data: { kind: "FRANCHISEE", name: "Small Shop", legalName: "Small Shop CC" } });
    const store = await db.store.create({
      data: { code: "TST02", slug: "tst02", name: "Second Store", companyId: company.id, regionId: w.region.id, dcId: w.dc.id, addressLine: "2 Burnett St", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083" },
    });
    other = { companyId: company.id, storeId: store.id };
    await stat(store.id, `${month}-15`, "POS", { grossCents: 500_000, vatCents: 0, pointsIssued: 100 }); // a non-vendor charges no VAT
    await postSource("statement", `${store.id}:${month}`);
    expect(await posted(company.id, { source: "statement" })).toEqual({ "fees.royalty": 30_000, "fees.levy": 10_000, "vat.nonclaimable": 6_000, "points.issued": 10_000, hq: -56_000 });
    expect(await amount(w.hq.id, "vat.output", { source: "statement", storeId: store.id })).toBe(-6_000);
  });

  it("mirrors each franchisee's Herbal Holland account in HQ's franchisee accounts, store by store", async () => {
    for (const s of [{ companyId: w.owner.id, storeId: w.store.id }, other]) {
      const fr = await amount(s.companyId, "hq", { source: "statement", storeId: s.storeId });
      expect(fr).not.toBe(0);
      expect(await amount(w.hq.id, "franchisees", { source: "statement", storeId: s.storeId, partyId: s.companyId })).toBe(-fr);
    }
  });

  it("posts nothing for a month still trading, or for a store HQ owns; a late change posts only the difference", async () => {
    await stat(w.store.id, today, "POS", { grossCents: 115_000, vatCents: 15_000 });
    expect(await postSource("statement", `${w.store.id}:${thisMonth}`)).toEqual([]);
    expect(await postSource("statement", `${w.store.id}:${addMonths(thisMonth, 1)}`)).toEqual([]);
    expect(await postSource("statement", `${w.dc.id}:${month}`)).toEqual([]);
    expect(await db.journal.count({ where: { source: "statement", sourceId: { in: [`${w.store.id}:${thisMonth}`, `${w.dc.id}:${month}`] } } })).toBe(0);
    // A till sale of R1,000 ex VAT that synced after the month closed its rollup: fees on it, and nothing else.
    await stat(w.store.id, `${month}-28`, "POS", { grossCents: 115_000, vatCents: 15_000 });
    const [fr, hq] = await postSource("statement", `${w.store.id}:${month}`).then((js) => [js.find((j) => j.companyId === w.owner.id)!, js.find((j) => j.companyId === w.hq.id)!]);
    expect(fr.memo).toMatch(/franchise statement · Test Store — updated$/);
    expect(await posted(w.owner.id, { source: "statement", sourceId: `${w.store.id}:${month}` })).toMatchObject({ "fees.royalty": 78_000, "fees.levy": 26_000, "vat.input": 18_600, hq: -182_600 });
    expect((await db.journalLine.findMany({ where: { journalId: hq.id } })).map((l) => l.amountCents).sort((a, b) => a - b)).toEqual([-6_000, -2_000, -1_200, 9_200]);
  });
});

describe("statement payments", () => {
  let paid: { id: string };
  let extra: { id: string };

  it("are recorded by an HQ admin only, with the amount, the day and the bank reference", async () => {
    const staff = { id: "hq-staff", name: "Sam", role: "HQ_STAFF" as const };
    const base = { storeId: w.store.id, month, paidOn: `${lastMonth}-07`, reference: "HH-ST-0001" };
    await expect(recordStatementPayment({ ...base, direction: "HQ_PAID", amountCents: 100 }, staff)).rejects.toThrow(/Only an HQ admin/);
    await expect(recordStatementPayment({ ...base, direction: "HQ_PAID", amountCents: null }, admin)).rejects.toThrow(/amount paid/);
    await expect(recordStatementPayment({ ...base, direction: "HQ_PAID", amountCents: 100, paidOn: dayKey(addDays(now, 2)) }, admin)).rejects.toThrow(/future/);
    await expect(recordStatementPayment({ ...base, direction: "HQ_PAID", amountCents: 100, paidOn: `${addMonths(month, -1)}-28` }, admin)).rejects.toThrow(/before that month/);
    await expect(recordStatementPayment({ ...base, direction: "HQ_PAID", amountCents: 100, month: addMonths(thisMonth, 1) }, admin)).rejects.toThrow(/month/);
    await expect(recordStatementPayment({ ...base, direction: "HQ_PAID", amountCents: 100, reference: "  " }, admin)).rejects.toThrow(/bank reference/);
    await expect(recordStatementPayment({ ...base, direction: "HQ_PAID", amountCents: 100, storeId: w.dc.id }, admin)).rejects.toThrow(/franchise stores/);
  });

  it("post either way in both books on the day paid: the store paying HQ, and HQ paying the store", async () => {
    const st = await franchiseStatement(w.store.id, month);
    expect(st.net).toBeGreaterThan(0); // HQ collected more online than the fees: HQ pays the store
    paid = await recordStatementPayment({ storeId: w.store.id, month, direction: "HQ_PAID", amountCents: st.net, paidOn: `${lastMonth}-07`, reference: "HH-ST-0001" }, admin);
    await expect(recordStatementPayment({ storeId: w.store.id, month, direction: "HQ_PAID", amountCents: st.net, paidOn: `${lastMonth}-07`, reference: "HH-ST-0001" }, admin)).rejects.toThrow(/already recorded/);
    extra = await recordStatementPayment({ storeId: w.store.id, month, direction: "STORE_PAID", amountCents: 5_000, paidOn: today, reference: "HH-ST-0002", note: "Overpaid by mistake" }, admin);
    await processLedgerQueue();
    expect(await posted(w.owner.id, { source: "statement-payment", sourceId: paid.id })).toEqual({ bank: st.net, hq: -st.net });
    expect(await posted(w.hq.id, { source: "statement-payment", sourceId: paid.id })).toEqual({ franchisees: st.net, bank: -st.net });
    expect(await posted(w.owner.id, { source: "statement-payment", sourceId: extra.id })).toEqual({ hq: 5_000, bank: -5_000 });
    expect(await posted(w.hq.id, { source: "statement-payment", sourceId: extra.id })).toEqual({ bank: 5_000, franchisees: -5_000 });
    expect(await amount(w.hq.id, "franchisees", { source: "statement-payment", storeId: w.store.id, partyId: w.owner.id })).toBe(st.net - 5_000);
    expect(await journalDays("statement-payment", paid.id)).toEqual([`${lastMonth}-07`, `${lastMonth}-07`]);
    // What's still outstanding: the net, less what HQ paid, plus what the store paid.
    const list = await statementPayments(w.store.id, month);
    expect(list).toMatchObject({ total: 2, paidCents: 5_000 - st.net });
    expect(list.rows.map((r) => r.createdBy)).toEqual(["Ayesha Admin", "Ayesha Admin"]);
    expect(statementOutstanding(st.net, list.rows)).toBe(5_000);
    expect((await paidByStore([w.store.id], month)).get(w.store.id)).toBe(5_000 - st.net);
  });

  it("deleted by mistake: reversed in both books, and audited", async () => {
    await expect(deleteStatementPayment(extra.id, { id: "hq-staff", name: "Sam", role: "HQ_STAFF" })).rejects.toThrow(/Only an HQ admin/);
    await deleteStatementPayment(extra.id, admin);
    await expect(deleteStatementPayment(extra.id, admin)).rejects.toThrow(/already been deleted/);
    await processLedgerQueue();
    expect(await posted(w.owner.id, { source: "statement-payment", sourceId: extra.id })).toEqual({});
    expect(await posted(w.hq.id, { source: "statement-payment", sourceId: extra.id })).toEqual({});
    expect(await db.journal.count({ where: { source: "statement-payment", sourceId: extra.id } })).toBe(4); // posted, then reversed, in each book
    const st = await franchiseStatement(w.store.id, month);
    expect(statementOutstanding(st.net, (await statementPayments(w.store.id, month)).rows)).toBe(0);
    expect(await db.auditLog.count({ where: { action: "statement.payment", actorId: admin.id } })).toBe(2);
    expect(await db.auditLog.findFirstOrThrow({ where: { action: "statement.payment_delete" } })).toMatchObject({ entityId: extra.id, storeId: w.store.id, data: { month, amountCents: 5_000, reference: "HH-ST-0002" } });
  });
});

describe("online payments", () => {
  it("hold what the member paid online as prepaid until the order is fulfilled, and take it back out when it's cancelled", async () => {
    const c = await member();
    const o = await placeOrder({ customerId: c.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.coffeeV.id, qty: 2 }], payMethod: "ONLINE" });
    expect(o.status).toBe("PENDING_PAYMENT");
    await processLedgerQueue();
    expect(await postSource("online-payment", o.id)).toEqual([]); // nothing paid yet
    await markOrderPaid(o.id, "SIM-EFT-LEDGER1");
    await processLedgerQueue();
    expect(await posted(w.hq.id, { source: "online-payment", sourceId: o.id })).toEqual({ gateway: o.totalCents, prepaid: -o.totalCents });
    expect(await db.journalLine.count({ where: { journal: { source: "online-payment", sourceId: o.id }, storeId: w.store.id } })).toBe(2);
    expect(await journalDays("online-payment", o.id)).toEqual([today]);

    await advanceOrder(o.id, "CANCELLED", who, { note: "The member changed their mind" });
    await processLedgerQueue();
    expect(await posted(w.hq.id, { source: "online-payment", sourceId: `${o.id}:cancel` })).toEqual({ prepaid: o.totalCents, gateway: -o.totalCents });
    expect(await posted(w.owner.id, { source: "online-payment" })).toEqual({}); // HQ's money until a store fulfils an order
  });

  it("post a return refunded through the gateway by its credit note's online tender", async () => {
    const refunds = fakePeach();
    const c = await member();
    const placed = await placeOrder({ customerId: c.id, fulfilment: "COURIER", address, items: [{ variantId: w.oilV.id, qty: 2 }], payMethod: "ONLINE" });
    await markOrderPaid(placed.id, `pay_${randomUUID().slice(0, 8)}`);
    for (const s of ["PICKING", "READY", "OUT_FOR_DELIVERY"] as const) await advanceOrder(placed.id, s, who, { staffId: w.manager.id, courier: "The Courier Guy", trackingNo: "TCG1" });
    await advanceOrder(placed.id, "COMPLETED", who, { idChecked: true, staffId: w.manager.id });
    const ret = await requestReturn({ orderCode: placed.code, reason: "DEFECTIVE", items: [{ variantId: w.oilV.id, qty: 1 }], note: "The dropper leaks.", sealedConfirmed: false, photos: [] }, c);
    await decideReturn(ret.id, "APPROVED", "", who, { kind: "HQ" });
    await bookCollection(ret.id, { courier: "The Courier Guy", waybill: "TCG-RT1" }, who, { kind: "HQ" });
    await receiveReturn(ret.id, who, { kind: "HQ" });
    await refundReturn(ret.id, { restock: {} }, who, { kind: "HQ" });
    await processLedgerQueue();
    const note = await db.sale.findUniqueOrThrow({ where: { id: `return-${ret.id}` }, include: { payments: true } });
    const back = -note.payments.filter((p) => p.method === "ONLINE").reduce((s, p) => s + p.amountCents, 0);
    expect(back).toBeGreaterThan(0);
    expect(refunds.map((r) => r.amount)).toEqual([back]);
    expect(await posted(w.hq.id, { source: "online-payment", sourceId: `${placed.id}:return-${ret.id}` })).toEqual({ prepaid: back, gateway: -back });
    expect(await posted(w.hq.id, { source: "online-payment", sourceId: placed.id })).toEqual({ gateway: placed.totalCents, prepaid: -placed.totalCents });
  });
});

describe("gift vouchers", () => {
  let voucher: { id: string; code: string };
  let saleId: string;

  it("are sold through the gateway into the voucher liability (not an order's prepaid money)", async () => {
    const c = await member();
    const bought = await startVoucherPurchase({ customer: c, amountCents: 50_000 });
    voucher = bought.voucher;
    await processLedgerQueue();
    expect(await postSource("voucher", voucher.id)).toEqual([]); // not paid yet
    await markOrderPaid(bought.order.id, "SIM-EFT-VOUCHER1");
    await processLedgerQueue();
    expect(await posted(w.hq.id, { source: "voucher", sourceId: voucher.id })).toEqual({ gateway: 50_000, vouchers: -50_000 });
    expect(await journalDays("voucher", voucher.id)).toEqual([today]);
    expect(await db.journal.count({ where: { source: "online-payment", sourceId: bought.order.id } })).toBe(0);
    expect(await postSource("online-payment", bought.order.id)).toEqual([]);
  });

  it("expire what's left of them into breakage — and what a refund puts back onto an expired voucher too", async () => {
    // Spent at the till on a coffee (the store's day takes it off the liability), then three years pass.
    const c = await member();
    const lines = [{ variantId: w.coffeeV.id, qty: 1 }];
    const q = await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId: c.id });
    const r = await postPosSale(
      { id: randomUUID(), number: "TST01-V00001", customerId: c.id, lines, payments: [{ method: "VOUCHER", amountCents: q.totalCents, reference: voucher.code }], ageCheck: "ID_SIGHTED" },
      { storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Mia" },
    );
    saleId = r.sale.id;
    const left = 50_000 - q.totalCents;
    expect((await db.giftVoucher.findUniqueOrThrow({ where: { id: voucher.id } })).balanceCents).toBe(left);
    await db.giftVoucher.update({ where: { id: voucher.id }, data: { expiresAt: new Date(`${yesterday}T23:59:59+02:00`) } });
    expect(await expireVouchers()).toMatchObject({ expired: 1 });
    await processLedgerQueue();
    expect(await posted(w.hq.id, { source: "voucher", sourceId: `${voucher.id}:expiry` })).toEqual({ vouchers: left, breakage: -left });
    expect(await journalDays("voucher", `${voucher.id}:expiry`)).toEqual([yesterday]);

    // The coffee comes back: the voucher part goes back onto the (expired) voucher, so it's breakage too.
    const sale = await db.sale.findUniqueOrThrow({ where: { id: saleId }, include: { lines: true } });
    await refundSale({ id: randomUUID(), number: "TST01-V00002", saleId, lines: [{ saleLineId: sale.lines[0].id, qty: 1, restock: true }], method: "ORIGINAL", reason: "Changed mind", staffId: w.manager.id, staffName: "Mia" });
    expect((await db.giftVoucher.findUniqueOrThrow({ where: { id: voucher.id } })).balanceCents).toBe(50_000);
    await processLedgerQueue();
    expect(await posted(w.hq.id, { source: "voucher", sourceId: `${voucher.id}:expiry` })).toEqual({ vouchers: 50_000, breakage: -50_000 });
    expect(await journalDays("voucher", `${voucher.id}:expiry`)).toEqual([yesterday, yesterday]);
  });
});

describe("Rewards points", () => {
  it("charge what HQ gives to HQ and expire forfeited points as breakage, a day at a time", async () => {
    const { loyalty } = await getSettings();
    const c = await member();
    const md = today.slice(5);
    await db.customer.update({ where: { id: c.id }, data: { dob: new Date(`1990-${md}T12:00:00Z`) } });
    await tx((t) => addPoints(t, { customerId: c.id, points: 50, kind: "SIGNUP", note: "Welcome to Herbal Holland Rewards" }));
    expect(await birthdayPoints(now)).toMatchObject({ done: 1 });
    await tx((t) => addPoints(t, { customerId: c.id, points: -30, kind: "EXPIRE", note: "Forfeited on POPIA erasure request" }));
    expect(await db.ledgerQueue.findUnique({ where: { source_sourceId: { source: "points", sourceId: today } } })).toBeTruthy();
    await processLedgerQueue();
    // Today: the world's opening balance brought forward (200), the welcome and birthday bonuses; 30 forfeited.
    const given = (200 + 50 + loyalty.birthdayBonus) * 100;
    expect(await posted(w.hq.id, { source: "points", sourceId: today })).toEqual({ "points.hq": given, points: -given + 3_000, breakage: -3_000 });
    expect(await journalDays("points", today)).toEqual([today]);
  });

  it("charge points issued at a store HQ owns to HQ, and leave store-issued and redeemed points to the statement and the till", async () => {
    const c = await member();
    const at = new Date(`${yesterday}T11:00:00+02:00`);
    await db.loyaltyEntry.createMany({
      data: [
        { customerId: c.id, storeId: w.dc.id, points: 40, kind: "EARN", createdAt: at },
        { customerId: c.id, storeId: w.store.id, points: 70, kind: "EARN", createdAt: at },
        { customerId: c.id, storeId: w.store.id, points: -20, kind: "REDEEM", createdAt: at },
        { customerId: c.id, storeId: w.store.id, points: 20, kind: "REVERSAL", createdAt: at },
      ],
    });
    await stat(w.dc.id, yesterday, "ONLINE", { grossCents: 46_000, vatCents: 6_000, pointsIssued: 40 });
    await stat(w.store.id, yesterday, "POS", { grossCents: 80_500, vatCents: 10_500, pointsIssued: 70 });
    await postSource("points", yesterday);
    expect(await posted(w.hq.id, { source: "points", sourceId: yesterday })).toEqual({ "points.hq": 4_000, points: -4_000 });
    expect(await amount(w.hq.id, "points.hq", { source: "points", sourceId: yesterday, storeId: w.dc.id })).toBe(4_000);
  });
});

describe("the trade ledger", () => {
  let account: { id: string };
  let hq: { type: "USER"; id: string; name: string };
  let tillSale: { id: string; number: string };

  beforeAll(async () => {
    hq = { type: "USER", id: admin.id, name: admin.name };
    account = await db.tradeAccount.create({
      data: {
        number: "TA-000001", name: "Hatfield Pharmacy", legalName: "Hatfield Pharmacy (Pty) Ltd", kind: "PHARMACY", vatNumber: "4550001234", email: "orders@hatfieldpharmacy.example",
        addressLine: "12 Burnett St", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083", status: "APPROVED", terms: "ACCOUNT", paymentDays: 30,
        creditLimitCents: 5_000_000, classes: ["CBD"], dcId: w.dc.id,
      },
    });
    await db.tradeLicence.createMany({
      data: [
        { tradeAccountId: account.id, kind: "PHARMACY_LICENCE", number: "GP-PL-0042", uploadId: "doc-1", status: "VERIFIED" },
        { tradeAccountId: account.id, kind: "SAPC_RECORDING", number: "P1234567", uploadId: "doc-2", status: "VERIFIED" },
      ],
    });
  });

  it("leaves invoices to the store's day: each is an ACCOUNT tender on its sale, or an EFT HQ took ahead", async () => {
    const onAccount = await placeTradeOrder({ accountId: account.id, actor: hq, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "ACCOUNT" });
    await advanceTradeOrder(onAccount.id, "ship", hq, { courier: "The Courier Guy" });
    const eft = await placeTradeOrder({ accountId: account.id, actor: hq, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "EFT" });
    await confirmTradePayment(eft.id, { reference: "HH-TO-EFT1" }, hq);
    await advanceTradeOrder(eft.id, "ship", hq, { courier: "The Courier Guy" });
    const lines = [{ variantId: w.oilV.id, qty: 2 }];
    const q = await quote({ storeId: w.store.id, channel: "WHOLESALE", items: lines, tradeAccountId: account.id });
    tillSale = (await postPosSale({ id: randomUUID(), number: "TST01-T00001", lines, payments: [{ method: "ACCOUNT", amountCents: q.totalCents }], trade: { tradeAccountId: account.id } }, { storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Mia" })).sale;
    await processLedgerQueue();

    const invoices = await db.tradeLedgerEntry.findMany({ where: { tradeAccountId: account.id, kind: "INVOICE" } });
    expect(invoices).toHaveLength(3);
    for (const inv of invoices) {
      const sale = await db.sale.findUniqueOrThrow({ where: { id: inv.saleId! }, include: { payments: true, tradeOrder: true } });
      const tender = (m: string) => sale.payments.filter((p) => p.method === m).reduce((s, p) => s + p.amountCents, 0);
      if (sale.tradeOrder?.payMethod === "EFT") expect([tender("EFT"), tender("ACCOUNT"), !!sale.tradeOrder.paidAt]).toEqual([inv.cents, 0, true]);
      else expect(tender("ACCOUNT")).toBe(inv.cents);
      expect(await postSource("trade-entry", inv.id)).toEqual([]);
    }
    // The EFT's PAYMENT on the trade ledger is the trade-eft posting's (held as prepaid), not a payment off the debtor.
    const eftPayment = await db.tradeLedgerEntry.findFirstOrThrow({ where: { tradeOrderId: eft.id, kind: "PAYMENT" } });
    expect(await postSource("trade-entry", eftPayment.id)).toEqual([]);
    const total = (await db.tradeOrder.findUniqueOrThrow({ where: { id: eft.id } })).totalCents;
    expect(await posted(w.hq.id, { source: "trade-eft", sourceId: eft.id })).toEqual({ bank: total, prepaid: -total });
    expect(await db.journal.count({ where: { source: "trade-entry" } })).toBe(0);
  });

  it("posts payments to the bank, and HQ's credit notes and adjustments against bad debts, on the account", async () => {
    const pay = await recordTradePayment(account.id, { cents: 100_000, reference: "EFT-HATFIELD-1", receivedAt: new Date(`${yesterday}T00:00:00+02:00`) }, hq);
    const cn = await issueCreditNote(account.id, { cents: 5_000, note: "Two units arrived with broken seals" }, hq);
    const up = await adjustTradeLedger(account.id, { cents: 2_500, note: "Courier recharge" }, hq);
    const down = await adjustTradeLedger(account.id, { cents: -1_000, note: "Rounding write-off" }, hq);
    await processLedgerQueue();
    expect(await posted(w.hq.id, { source: "trade-entry", sourceId: pay.entry.id })).toEqual({ bank: 100_000, debtors: -100_000 });
    expect(await journalDays("trade-entry", pay.entry.id)).toEqual([yesterday]);
    expect(await posted(w.hq.id, { source: "trade-entry", sourceId: cn.id })).toEqual({ "bad.debts": 5_000, debtors: -5_000 });
    expect(await posted(w.hq.id, { source: "trade-entry", sourceId: up.id })).toEqual({ debtors: 2_500, "bad.debts": -2_500 });
    expect(await posted(w.hq.id, { source: "trade-entry", sourceId: down.id })).toEqual({ "bad.debts": 1_000, debtors: -1_000 });
    // The debtor moves with the account's own entries, by party.
    expect(await amount(w.hq.id, "debtors", { source: "trade-entry", partyId: account.id })).toBe(-100_000 - 5_000 + 2_500 - 1_000);
  });

  it("leaves a credit note that refunds a sale on account to the refund's tender", async () => {
    const sale = await db.sale.findUniqueOrThrow({ where: { id: tillSale.id }, include: { lines: true } });
    const refund = await refundSale({ id: randomUUID(), number: "TST01-T00002", saleId: sale.id, lines: [{ saleLineId: sale.lines[0].id, qty: 1, restock: true }], method: "EFT", reason: "Damaged box", staffId: w.manager.id, staffName: "Mia" });
    const cn = await db.tradeLedgerEntry.findFirstOrThrow({ where: { tradeAccountId: account.id, kind: "CREDIT_NOTE", reference: refund.number } });
    const back = await db.payment.aggregate({ where: { saleId: refund.id, method: "ACCOUNT" }, _sum: { amountCents: true } });
    expect(back._sum.amountCents).toBe(cn.cents);
    expect(await postSource("trade-entry", cn.id)).toEqual([]);
  });

  it("holds an EFT paid ahead as prepaid from the day it arrived, and refunds it when the order is cancelled", async () => {
    const o = await placeTradeOrder({ accountId: account.id, actor: hq, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "EFT" });
    await processLedgerQueue();
    expect(await postSource("trade-eft", o.id)).toEqual([]); // not paid yet
    await confirmTradePayment(o.id, { reference: "HH-TO-EFT2", paidAt: new Date(`${yesterday}T00:00:00+02:00`) }, hq);
    await processLedgerQueue();
    expect(await posted(w.hq.id, { source: "trade-eft", sourceId: o.id })).toEqual({ bank: o.totalCents, prepaid: -o.totalCents });
    expect(await journalDays("trade-eft", o.id)).toEqual([yesterday]);
    await advanceTradeOrder(o.id, "cancel", hq, { note: "The pharmacy cancelled" });
    await processLedgerQueue();
    expect(await posted(w.hq.id, { source: "trade-eft", sourceId: `${o.id}:refund` })).toEqual({ prepaid: o.totalCents, bank: -o.totalCents });
    expect(await journalDays("trade-eft", `${o.id}:refund`)).toEqual([today]);
  });
});

describe("posting again, and the whole books", () => {
  it("lists every source it posted for a period, and nightly what's due", async () => {
    const listed = await hqBackfill(`${month}-01`, today);
    const key = (s: { source: string; sourceId: string | null }) => `${s.source}|${s.sourceId}`;
    const deleted = new Set((await db.auditLog.findMany({ where: { action: "statement.payment_delete" }, select: { entityId: true } })).map((a) => `statement-payment|${a.entityId}`));
    const postedIds = (await db.journal.findMany({ where: { source: { in: HQ_SOURCES } }, distinct: ["source", "sourceId"], select: { source: true, sourceId: true } })).map(key).filter((k) => !deleted.has(k));
    expect(postedIds.length).toBeGreaterThan(15);
    expect(postedIds.filter((k) => !new Set(listed.map(key)).has(k))).toEqual([]);
    expect(new Set(listed.map(key)).size).toBe(listed.length);
    await expect(hqBackfill(today, yesterday)).rejects.toThrow(/range of days/);

    expect(await hqNightly(new Date(`${today}T02:00:00+02:00`))).toEqual(today.endsWith("-01") ? expect.arrayContaining([{ source: "points", sourceId: yesterday }]) : [{ source: "points", sourceId: yesterday }]);
    const first = `${addMonths(month, 1)}-01`;
    expect(await hqNightly(new Date(`${first}T02:00:00+02:00`))).toEqual(
      expect.arrayContaining([{ source: "points", sourceId: monthEnd(month) }, { source: "statement", sourceId: `${w.store.id}:${month}` }, { source: "statement", sourceId: expect.stringMatching(new RegExp(`:${month}$`)) }]),
    );
    expect((await hqNightly(new Date(`${first}T02:00:00+02:00`))).filter((s) => s.source === "statement")).toHaveLength(2); // the two franchisee stores that traded, not the DC
  });

  it("changes nothing when everything is posted again, or queued twice", async () => {
    const mine = { where: { source: { in: HQ_SOURCES } } };
    const before = await db.journal.count(mine);
    for (const s of await hqBackfill(`${month}-01`, today)) expect(await postSource(s.source, s.sourceId)).toEqual([]);
    await queuePosting(db, "points", today);
    await queuePosting(db, "points", today);
    await processLedgerQueue();
    expect(await db.journal.count(mine)).toBe(before);
  });

  it("leaves every company's trial balance at zero", async () => {
    const companies = await db.company.findMany({ select: { id: true } });
    for (const c of companies) {
      const lines = await db.journalLine.aggregate({ where: { companyId: c.id, journal: { status: "POSTED" } }, _sum: { amountCents: true } });
      expect(lines._sum.amountCents ?? 0).toBe(0);
      const b = await db.ledgerBalance.aggregate({ where: { companyId: c.id }, _sum: { debitCents: true, creditCents: true } });
      expect(b._sum.debitCents ?? 0n).toBe(b._sum.creditCents ?? 0n);
    }
    expect(await db.journal.count({ where: { companyId: w.hq.id, source: { in: HQ_SOURCES } } })).toBeGreaterThan(10);
  });
});
