// Store-side postings against the real services: a franchisee's trading day with every tender and a refund, a
// non-vendor's, a DC's; cash-ups, deposits, expenses and outside suppliers' invoices; wholesale and network stock
// orders (short deliveries, between companies and within one); late till sales; and the checks the books must pass —
// every trial balance zero, stock equal to its valuation, HQ's franchisee accounts mirroring each store's current
// account, and the franchise statement agreeing with what was posted.
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "hh-ledger-store-"));

import { db, tx } from "@/server/db";
import { postSource, processLedgerQueue, queuePosting } from "@/server/ledger/core";
import { storeBackfill, storeNightly } from "@/server/ledger/sources/store";
import { postPosSale, postSaleTx, refundSale, type TenderInput } from "@/server/sales";
import { quote } from "@/server/pricing";
import { adjustStock, putStock } from "@/server/inventory";
import { actOnStockOrder, createStockOrder, receivedValue } from "@/server/stock-orders";
import { recordDeposit } from "@/server/banking";
import { captureSupplierInvoice, invoiceAccounts, paySupplierInvoice, querySupplierInvoice, reopenSupplierInvoice, supplierInvoiceList } from "@/server/supplier-invoices";
import { franchiseStatement, shiftCash } from "@/server/finance";
import { closeShift } from "@/server/pos/shift";
import type { PosStaff } from "@/server/pos/http";
import { countCash, DENOMINATIONS } from "@/components/pos/lib/rules";
import { supplierParty } from "@/lib/ledger";
import { addDays, dayKey } from "@/lib/format";
import { vatOf, vatOnExcl } from "@/lib/money";
import { makeVoucherCode, voucherExpiry } from "@/lib/vouchers";
import { buildWorld, resetDb, type World } from "./world";

const MINE = ["store-day", "shift", "deposit", "expense", "supplier-invoice", "supplier-payment", "stock-ship", "stock-receive"];
const now = new Date();
const today = dayKey(now);
const yesterday = dayKey(addDays(now, -1));
const period = today.slice(0, 7);

let w: World;
let mia: { type: "USER"; id: string; name: string };
let account: { id: string; number: string };
let seq = 0;
const number = () => `TST01-L${String(++seq).padStart(5, "0")}`;
const till = (storeId?: string, deviceId?: string) => ({ storeId: storeId ?? w.store.id, deviceId: deviceId ?? w.device.id, staffId: w.manager.id, staffName: "Mia" });
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89]);
const png = () => new File([PNG], "invoice.png", { type: "image/png" });
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70])], "slip.jpg", { type: "image/jpeg" });
const COFFEE = 22_900;

/** What a source shows, netted per company: { companyId: { "key[@party]#store": cents } }. */
async function shown(source: string, sourceId: string) {
  const lines = await db.journalLine.findMany({ where: { journal: { source, sourceId, status: "POSTED" } }, include: { account: { select: { key: true, code: true } } } });
  const out: Record<string, Record<string, number>> = {};
  for (const l of lines) {
    const k = `${l.account.key ?? l.account.code}${l.partyId ? `@${l.partyId}` : ""}#${l.storeId ?? ""}`;
    const c = (out[l.companyId] ??= {});
    c[k] = (c[k] ?? 0) + l.amountCents;
  }
  for (const c of Object.values(out)) for (const [k, v] of Object.entries(c)) if (!v) delete c[k];
  return out;
}
/** A company's balance on an account (debit − credit), every month, for one store or all. */
async function bal(companyId: string, key: string, storeId?: string) {
  const acc = await db.ledgerAccount.findFirstOrThrow({ where: { companyId, key } });
  const rows = await db.ledgerBalance.findMany({ where: { companyId, accountId: acc.id, ...(storeId !== undefined && { storeId }) } });
  return rows.reduce((s, r) => s + Number(r.debitCents) - Number(r.creditCents), 0);
}
/** The lines of my sources on an account, summed (optionally one source, store and month). */
async function sum(key: string, where: { source?: string; storeId?: string; period?: string; companyId?: string } = {}) {
  const r = await db.journalLine.aggregate({
    where: { account: { key }, journal: { source: where.source ?? { in: MINE }, status: "POSTED" }, ...(where.storeId && { storeId: where.storeId }), ...(where.period && { period: where.period }), ...(where.companyId && { companyId: where.companyId }) },
    _sum: { amountCents: true },
  });
  return r._sum.amountCents ?? 0;
}
/** Runs the queue: every store-side source queued is posted. */
async function drain() {
  await processLedgerQueue();
  expect(await db.ledgerQueue.findMany({ where: { source: { in: MINE } }, select: { source: true, sourceId: true, error: true } })).toEqual([]);
}
const memberPrice = async (storeId = w.store.id) => (await quote({ storeId, channel: "POS", items: [{ variantId: w.coffeeV.id, qty: 1 }], customerId: w.walkIn.id })).totalCents;
const sellCoffee = (payments: TenderInput[], over: Partial<Parameters<typeof postPosSale>[0]> = {}, ctx = till()) =>
  postPosSale({ id: randomUUID(), number: number(), customerId: w.walkIn.id, lines: [{ variantId: w.coffeeV.id, qty: 1 }], ageCheck: "ID_SIGHTED", payments, ...over }, ctx);
/** A sale posted as an online order's handover or a trade order's shipment posts it (postSaleTx). */
const postTx = (a: { storeId: string; channel: "ONLINE" | "WHOLESALE"; lines: { variantId: string; qty: number; unit: number; ex?: boolean }[]; payments: TenderInput[] | { method: "ONLINE"; amountCents: number }[]; extraCents?: number; tradeAccountId?: string; collectedByHq?: boolean }) => {
  const lines = a.lines.map((l) => {
    const total = l.ex ? l.qty * l.unit + vatOnExcl(l.qty * l.unit) : l.qty * l.unit;
    return { variantId: l.variantId, qty: l.qty, unitPriceCents: l.unit, discountCents: 0, totalCents: total, vatCents: l.ex ? vatOnExcl(l.qty * l.unit) : vatOf(total), noEarn: true };
  });
  const total = lines.reduce((s, l) => s + l.totalCents, 0);
  return tx((t) =>
    postSaleTx(t, {
      id: randomUUID(), number: number(), storeId: a.storeId, channel: a.channel, customerId: null, tradeAccountId: a.tradeAccountId ?? null,
      quote: { lines, subtotalCents: total, discountCents: 0, totalCents: total, vatCents: lines.reduce((s, l) => s + l.vatCents, 0), pointsMultiplier: 1, promotionId: null },
      payments: a.payments as TenderInput[], pointsRedeemed: 0, redeemNow: false, extraCents: a.extraCents, ageCheck: "NONE", offline: false, createdAt: new Date(), collectedByHq: a.collectedByHq,
    }),
  );
};
const base = () => ({ suburb: "Hatfield", city: "Pretoria", province: "GP" as const, postalCode: "0083", regionId: w.region.id, dcId: w.dc.id, licences: ["THC" as const] });
const lot = (code: string) => db.batch.create({ data: { variantId: w.flowerV.id, code, supplier: "Test Farm", packedAt: addDays(now, -5), expiresAt: addDays(now, 200) } });
const receive = (storeId: string, variantId: string, batchId: string, qty: number, unitCostCents: number) => tx((t) => putStock(t, { storeId, variantId, batchId, qty, unitCostCents, type: "RECEIVE" }));

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  mia = { type: "USER", id: w.manager.id, name: "Mia" };
  account = await db.tradeAccount.create({
    data: {
      number: "TA-000001", name: "Hatfield Pharmacy", legalName: "Hatfield Pharmacy (Pty) Ltd", kind: "PHARMACY", vatNumber: "4550001234", email: "orders@hatfieldpharmacy.example",
      addressLine: "12 Burnett St", city: "Pretoria", province: "GP", postalCode: "0083", status: "APPROVED", terms: "ACCOUNT", paymentDays: 30, creditLimitCents: 100_000_000, classes: ["CBD"], dcId: w.dc.id,
    },
  });
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500));
  await db.$disconnect();
});

describe("trading days", () => {
  it("posts a franchisee's day: sales and VAT, each tender, HQ's share on its current account and mirrored in HQ's books", async () => {
    const cash = await sellCoffee([{ method: "CASH", amountCents: await memberPrice() }]);
    const card = await memberPrice();
    await sellCoffee([{ method: "CARD", amountCents: card }]);
    const voucher = await db.giftVoucher.create({ data: { code: makeVoucherCode(), amountCents: 50_000, balanceCents: 50_000, status: "ACTIVE", issuedAt: now, expiresAt: voucherExpiry(now), purchasedByCustomerId: w.walkIn.id } });
    const third = await memberPrice();
    await sellCoffee([{ method: "VOUCHER", amountCents: third - 5_000, reference: voucher.code }], { pointsRedeemed: 50 }); // R50 in points, the rest on the voucher
    await postTx({ storeId: w.store.id, channel: "ONLINE", lines: [{ variantId: w.coffeeV.id, qty: 1, unit: COFFEE }], extraCents: 5_000, payments: [{ method: "ONLINE", amountCents: COFFEE + 5_000 }] });
    await postTx({ storeId: w.store.id, channel: "WHOLESALE", tradeAccountId: account.id, lines: [{ variantId: w.oilV.id, qty: 2, unit: 28_000, ex: true }], payments: [{ method: "ACCOUNT", amountCents: 64_400 }] });
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: cash.sale.id } });
    await refundSale({ id: randomUUID(), number: number(), saleId: cash.sale.id, lines: [{ saleLineId: line.id, qty: 1, restock: true }], method: "ORIGINAL", reason: "Changed their mind", staffId: w.manager.id, staffName: "Mia" });
    expect(await db.ledgerQueue.count({ where: { source: { in: MINE } } })).toBe(0); // today's trading posts tonight

    const id = `${w.store.id}:${today}`;
    const journals = await postSource("store-day", id);
    expect(journals.find((j) => j.companyId === w.owner.id)).toMatchObject({ date: new Date(`${today}T00:00:00Z`), storeId: w.store.id, memo: "Trading day at Test Store (TST01)" });
    expect(journals.find((j) => j.companyId === w.hq.id)?.memo).toBe("Collected and funded by HQ at Test Store (TST01)");
    const day = await shown("store-day", id);
    const viaHq = third - 5_000 + 5_000 + COFFEE + 5_000 + 64_400;
    expect(day[w.owner.id]).toMatchObject({ [`card#${w.store.id}`]: card, [`hq#${w.store.id}`]: viaHq });
    expect(day[w.owner.id][`cash#${w.store.id}`]).toBeUndefined(); // the cash sale was refunded in cash
    expect(day[w.hq.id]).toEqual({
      [`debtors@${account.id}#${w.store.id}`]: 64_400, [`prepaid#${w.store.id}`]: COFFEE + 5_000, [`vouchers#${w.store.id}`]: third - 5_000, [`points#${w.store.id}`]: 5_000,
      [`franchisees@${w.owner.id}#${w.store.id}`]: -viaHq,
    });
    // Revenue and VAT are what the day's sales and refunds carried.
    const sales = await db.sale.aggregate({ where: { storeId: w.store.id }, _sum: { totalCents: true, vatCents: true } });
    const revenue = ["sales.pos", "sales.online", "sales.trade"].reduce((s, k) => s + (day[w.owner.id][`${k}#${w.store.id}`] ?? 0), 0);
    expect(revenue).toBe(-(sales._sum.totalCents! - sales._sum.vatCents!));
    expect(day[w.owner.id][`vat.output#${w.store.id}`]).toBe(-sales._sum.vatCents!);
    expect(day[w.owner.id][`sales.trade#${w.store.id}`]).toBe(-56_000);
    expect(day[w.owner.id][`grni#${w.store.id}`]).toBeLessThan(0); // the fixture's opening stock, received today
  });

  it("charges a non-vendor's sales no VAT and keeps the VAT it pays out of input tax", async () => {
    const c3 = await db.company.create({ data: { kind: "FRANCHISEE", name: "Small Leaf", legalName: "Small Leaf (Pty) Ltd" } });
    const s3 = await db.store.create({ data: { ...base(), code: "TST03", slug: "tst03", name: "Small Store", companyId: c3.id, addressLine: "3 Duncan St" } });
    const device = await db.device.create({ data: { storeId: s3.id, name: "Till 1", prefix: "C", tokenHash: "test-device-3" } });
    await receive(s3.id, w.coffeeV.id, w.coffeeNew.id, 5, 11_000);
    const sale = await sellCoffee([{ method: "CARD", amountCents: await memberPrice(s3.id) }], {}, till(s3.id, device.id));
    expect(sale.sale.vatCents).toBe(0);
    const e = await db.expense.create({ data: { storeId: s3.id, date: new Date(`${today}T12:00:00+02:00`), category: "SECURITY", description: "Armed response", amountCents: 115_000, vatCents: 15_000 } });
    await queuePosting(db, "expense", e.id); // as the expense action does
    await drain();
    await postSource("store-day", `${s3.id}:${today}`);
    const day = (await shown("store-day", `${s3.id}:${today}`))[c3.id];
    expect(day).toMatchObject({ [`card#${s3.id}`]: sale.sale.totalCents, [`sales.pos#${s3.id}`]: -sale.sale.totalCents, [`stock#${s3.id}`]: 55_000 - 11_000, [`grni#${s3.id}`]: -55_000 });
    expect(day[`vat.output#${s3.id}`]).toBeUndefined();
    expect((await shown("expense", e.id))[c3.id]).toEqual({ [`exp.SECURITY#${s3.id}`]: 115_000, [`bank#${s3.id}`]: -115_000 });

    // Stock from the DC: the VAT on the invoice isn't claimable.
    const po = await createStockOrder({ buyerId: s3.id, sellerId: w.dc.id, kind: "WHOLESALE", lines: [{ variantId: w.oilV.id, qty: 2 }], actor: mia, submit: true });
    for (const a of ["approve", "ship", "receive"] as const) await actOnStockOrder(po.id, a, mia);
    await drain();
    const value = receivedValue(await db.stockOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } }));
    expect((await shown("stock-receive", po.id))[c3.id]).toEqual({ [`stock#${s3.id}`]: 56_000, [`vat.nonclaimable#${s3.id}`]: 8_400, [`hq#${s3.id}`]: -value });
  });

  it("posts a DC's day straight into HQ's books: trade sales on account and paid to HQ, no current-account legs", async () => {
    // Two trade orders shipped from the DC, as advanceTradeOrder posts them: one on account, one paid by EFT to HQ.
    const shipped = async (n: string, payMethod: "ACCOUNT" | "EFT", qty: number) => {
      const ex = qty * 28_000;
      const order = await db.tradeOrder.create({ data: { number: n, tradeAccountId: account.id, storeId: w.dc.id, status: "SHIPPED", payMethod, subtotalCents: ex, vatCents: vatOnExcl(ex), totalCents: ex + vatOnExcl(ex), events: [] } });
      const sale = await postTx({
        storeId: w.dc.id, channel: "WHOLESALE", tradeAccountId: account.id, lines: [{ variantId: w.oilV.id, qty, unit: 28_000, ex: true }], collectedByHq: true,
        payments: [payMethod === "EFT" ? { method: "EFT", amountCents: order.totalCents, provider: "Trade EFT" } : { method: "ACCOUNT", amountCents: order.totalCents }],
      });
      await db.tradeOrder.update({ where: { id: order.id }, data: { saleId: sale.id } });
    };
    await shipped("TO-000001", "ACCOUNT", 6);
    await shipped("TO-000002", "EFT", 3);

    const out = await postSource("store-day", `${w.dc.id}:${today}`);
    expect(out.map((j) => j.companyId)).toEqual([w.hq.id]);
    const day = (await shown("store-day", `${w.dc.id}:${today}`))[w.hq.id];
    expect(day).toMatchObject({
      [`debtors@${account.id}#${w.dc.id}`]: 193_200, [`prepaid#${w.dc.id}`]: 96_600, [`sales.trade#${w.dc.id}`]: -252_000, [`vat.output#${w.dc.id}`]: -37_800, [`cogs#${w.dc.id}`]: 9 * 17_000,
    });
    expect(Object.keys(day).some((k) => k.startsWith("hq#") || k.startsWith("franchisees"))).toBe(false);
  });
});

describe("cash, expenses and outside suppliers", () => {
  it("posts a cash-up's difference, corrects it when a till sale from the shift syncs late, and banks the deposit", async () => {
    const shift = await db.shift.create({ data: { storeId: w.store.id, deviceId: w.device.id, openedById: w.manager.id, openingFloatCents: 50_000 } });
    const price = await memberPrice();
    await sellCoffee([{ method: "CASH", amountCents: price }], { shiftId: shift.id });
    // The drawer holds the float, that sale and a sale rung up offline that hasn't synced — and is about R10 short.
    const counts: Record<string, number> = {};
    let left = 50_000 + price + COFFEE - 1_000;
    for (const d of DENOMINATIONS) (counts[String(d)] = Math.floor(left / d)), (left %= d);
    const counted = countCash(counts);
    const short = counted - (50_000 + price + COFFEE);
    expect(short).toBeLessThan(0);
    const pos = { user: await db.user.findUniqueOrThrow({ where: { id: w.manager.id } }), device: await db.device.findUniqueOrThrow({ where: { id: w.device.id }, include: { store: true } }) } as unknown as PosStaff;
    await closeShift(pos, shift.id, counts, "Offline sale still to sync");
    await drain();
    expect((await shown("shift", shift.id))[w.owner.id]).toEqual({ [`cash#${w.store.id}`]: COFFEE + short, [`cash.diff#${w.store.id}`]: -(COFFEE + short) });

    await postPosSale({ id: randomUUID(), number: number(), offline: true, createdAt: new Date(Date.now() - 3_600_000).toISOString(), shiftId: shift.id, lines: [{ variantId: w.coffeeV.id, qty: 1, unitPriceCents: COFFEE }], payments: [{ method: "CASH", amountCents: COFFEE }] }, till());
    expect(await db.ledgerQueue.count({ where: { source: "shift", sourceId: shift.id } })).toBe(1);
    await drain();
    expect((await shiftCash(shift.id)).varianceCents).toBe(short);
    expect((await shown("shift", shift.id))[w.owner.id]).toEqual({ [`cash.diff#${w.store.id}`]: -short, [`cash#${w.store.id}`]: short });
    expect(await db.journal.count({ where: { source: "shift", sourceId: shift.id } })).toBe(2);

    const d = await recordDeposit({ storeId: w.store.id, storeCode: w.store.code, shiftIds: [shift.id], amountCents: counted - 50_000, bankedOn: new Date(`${today}T00:00:00Z`), reference: "TST-001", file: jpeg() }, { ...mia });
    await drain();
    expect((await shown("deposit", d.id))[w.owner.id]).toEqual({ [`bank#${w.store.id}`]: counted - 50_000, [`cash#${w.store.id}`]: -(counted - 50_000) });
    expect((await db.journal.findFirstOrThrow({ where: { source: "deposit", sourceId: d.id } })).date).toEqual(new Date(`${today}T00:00:00Z`));
  });

  it("posts an expense ex VAT with its input VAT, and reverses it when it's deleted", async () => {
    const e = await db.expense.create({ data: { storeId: w.store.id, date: new Date(`${yesterday}T12:00:00+02:00`), category: "UTILITIES", description: "Electricity", supplier: "City of Tshwane", amountCents: 230_000, vatCents: 30_000 } });
    await queuePosting(db, "expense", e.id);
    await drain();
    expect((await shown("expense", e.id))[w.owner.id]).toEqual({ [`exp.UTILITIES#${w.store.id}`]: 200_000, [`vat.input#${w.store.id}`]: 30_000, [`bank#${w.store.id}`]: -230_000 });
    expect((await db.journal.findFirstOrThrow({ where: { source: "expense", sourceId: e.id } })).memo).toBe("Electricity (City of Tshwane) at Test Store (TST01)");
    await db.expense.delete({ where: { id: e.id } });
    await queuePosting(db, "expense", e.id);
    await drain();
    expect(await shown("expense", e.id)).toEqual({ [w.owner.id]: {} });
    expect(await db.journal.count({ where: { source: "expense", sourceId: e.id } })).toBe(2);
  });

  it("charges an outside supplier's invoice to the account chosen, owes the supplier, and pays it from the bank", async () => {
    const accounts = await tx((t) => invoiceAccounts(t, w.owner.id));
    expect(accounts.every((a) => a.key !== "grni")).toBe(true);
    const utilities = accounts.find((a) => a.key === "exp.UTILITIES")!;
    const at = { storeId: w.store.id, storeCode: w.store.code, supplierName: "Tshwane Security (Pty) Ltd", invoiceDate: yesterday, dueDate: today, totalCents: 115_000, vatCents: 15_000 };
    const hqAccount = (await tx((t) => invoiceAccounts(t, w.hq.id))).find((a) => a.key === "exp.RENT")!;
    await expect(captureSupplierInvoice({ ...at, number: "TS-1", accountId: hqAccount.id, file: png() }, mia)).rejects.toThrow("Choose what the invoice is charged to");
    const inv = await captureSupplierInvoice({ ...at, number: "TS-1", accountId: utilities.id, file: png() }, mia);
    expect(inv.accountId).toBe(utilities.id);
    await drain();
    const party = supplierParty("Tshwane Security (Pty) Ltd");
    expect((await shown("supplier-invoice", inv.id))[w.owner.id]).toEqual({ [`exp.UTILITIES#${w.store.id}`]: 100_000, [`vat.input#${w.store.id}`]: 15_000, [`creditors@${party}#${w.store.id}`]: -115_000 });
    expect(await shown("supplier-payment", inv.id)).toEqual({});
    // A query doesn't change what's owed; paying it does.
    await querySupplierInvoice(inv.id, w.store.id, "Two call-outs we didn't order", mia);
    await reopenSupplierInvoice(inv.id, w.store.id, mia);
    await drain();
    expect(await db.journal.count({ where: { sourceId: inv.id } })).toBe(1);
    await paySupplierInvoice(inv.id, w.store.id, { paidOn: today }, mia);
    await drain();
    expect((await shown("supplier-payment", inv.id))[w.owner.id]).toEqual({ [`creditors@${party}#${w.store.id}`]: 115_000, [`bank#${w.store.id}`]: -115_000 });
    expect(await bal(w.owner.id, "creditors")).toBe(0);
    // Without a choice: other expenses. The list names the account.
    const other = await captureSupplierInvoice({ ...at, number: "TS-2", file: png() }, mia);
    const list = await supplierInvoiceList({ storeIds: [w.store.id] }, 1, 10);
    expect(list.rows.map((r) => [r.number, r.account])).toEqual(expect.arrayContaining([["TS-1", "Utilities"], ["TS-2", "Other expenses"]]));
    await drain();
    expect((await shown("supplier-invoice", other.id))[w.owner.id]).toMatchObject({ [`exp.OTHER#${w.store.id}`]: 100_000 });

    // At a DC, a grower's invoice clears stock received but not yet invoiced.
    const grni = (await tx((t) => invoiceAccounts(t, w.hq.id))).find((a) => a.key === "grni")!;
    expect(grni.name).toBe("Stock received at the warehouse, not yet invoiced");
    const grower = await captureSupplierInvoice({ ...at, storeId: w.dc.id, storeCode: w.dc.code, supplierName: "Test Farm", number: "TF-1", totalCents: 1_840_000, vatCents: 240_000, accountId: grni.id, file: png() }, mia);
    await drain();
    expect((await shown("supplier-invoice", grower.id))[w.hq.id]).toEqual({ [`grni#${w.dc.id}`]: 1_600_000, [`vat.input#${w.dc.id}`]: 240_000, [`creditors@test farm#${w.dc.id}`]: -1_840_000 });
  });
});

describe("stock orders", () => {
  let s2: { id: string };
  let s1b: { id: string };
  let c2: { id: string };

  it("WHOLESALE, one short: the store owes HQ the invoice; HQ sells from the DC and loses the unit in transit", async () => {
    const po = await createStockOrder({ buyerId: w.store.id, sellerId: w.dc.id, kind: "WHOLESALE", lines: [{ variantId: w.flowerV.id, qty: 4 }], actor: mia, submit: true });
    await actOnStockOrder(po.id, "approve", mia);
    await actOnStockOrder(po.id, "ship", mia);
    await drain();
    expect((await shown("stock-ship", po.id))[w.hq.id]).toEqual({ [`transit#${w.dc.id}`]: 4 * 16_000, [`stock#${w.dc.id}`]: -4 * 16_000 });
    const line = await db.stockOrderLine.findFirstOrThrow({ where: { stockOrderId: po.id } });
    await actOnStockOrder(po.id, "receive", mia, { received: { [line.id]: 3 } });
    await drain();
    const value = 3 * 29_000 + vatOnExcl(3 * 29_000);
    expect(await shown("stock-receive", po.id)).toEqual({
      [w.owner.id]: { [`stock#${w.store.id}`]: 87_000, [`vat.input#${w.store.id}`]: 13_050, [`hq#${w.store.id}`]: -value },
      [w.hq.id]: {
        [`franchisees@${w.owner.id}#${w.store.id}`]: value, [`cogs#${w.dc.id}`]: 3 * 16_000, [`stock.transit#${w.dc.id}`]: 16_000,
        [`vat.output#${w.dc.id}`]: -13_050, [`transit#${w.dc.id}`]: -4 * 16_000, [`sales.wholesale#${w.dc.id}`]: -87_000,
      },
    });
    expect(await bal(w.hq.id, "transit", w.dc.id)).toBe(0);
  });

  it("NETWORK between companies: a sale for the seller, a purchase for the buyer, both settled through HQ", async () => {
    c2 = await db.company.create({ data: { kind: "FRANCHISEE", name: "Second Leaf", legalName: "Second Leaf (Pty) Ltd", vatNumber: "4420000000" } });
    s2 = await db.store.create({ data: { ...base(), code: "TST02", slug: "tst02", name: "Second Store", companyId: c2.id, addressLine: "2 Church St" } });
    const thc = await lot("TH-C"); // a lot of its own, so the buyer takes it in at the agreed price without averaging
    await receive(s2.id, w.flowerV.id, thc.id, 10, 26_000);
    const po = await createStockOrder({ buyerId: w.store.id, sellerId: s2.id, kind: "NETWORK", lines: [{ variantId: w.flowerV.id, qty: 2, unitCostCents: 30_000 }], actor: mia, submit: true });
    for (const a of ["approve", "ship", "receive"] as const) await actOnStockOrder(po.id, a, mia);
    await drain();
    expect(await shown("stock-receive", po.id)).toEqual({
      [w.owner.id]: { [`stock#${w.store.id}`]: 60_000, [`vat.input#${w.store.id}`]: 9_000, [`hq#${w.store.id}`]: -69_000 },
      [c2.id]: { [`hq#${s2.id}`]: 69_000, [`cogs#${s2.id}`]: 52_000, [`vat.output#${s2.id}`]: -9_000, [`transit#${s2.id}`]: -52_000, [`sales.network#${s2.id}`]: -60_000 },
      [w.hq.id]: { [`franchisees@${w.owner.id}#${w.store.id}`]: 69_000, [`franchisees@${c2.id}#${s2.id}`]: -69_000 },
    });
  });

  it("NETWORK within one company: a transfer — VAT legs between its own stores, the price difference, the short unit lost", async () => {
    s1b = await db.store.create({ data: { ...base(), code: "TST04", slug: "tst04", name: "Second Test Store", companyId: w.owner.id, addressLine: "4 Park St" } });
    const thd = await lot("TH-D");
    await receive(s1b.id, w.flowerV.id, thd.id, 10, 25_000);
    const po = await createStockOrder({ buyerId: w.store.id, sellerId: s1b.id, kind: "NETWORK", lines: [{ variantId: w.flowerV.id, qty: 3, unitCostCents: 31_000 }], actor: mia, submit: true });
    await actOnStockOrder(po.id, "approve", mia);
    await actOnStockOrder(po.id, "ship", mia);
    const line = await db.stockOrderLine.findFirstOrThrow({ where: { stockOrderId: po.id } });
    await actOnStockOrder(po.id, "receive", mia, { received: { [line.id]: 2 } });
    await drain();
    expect(await shown("stock-receive", po.id)).toEqual({
      [w.owner.id]: {
        [`hq#${s1b.id}`]: 71_300, [`stock#${w.store.id}`]: 62_000, [`interstore#${w.store.id}`]: 9_300, [`stock.transit#${s1b.id}`]: 25_000,
        [`interstore#${s1b.id}`]: -9_300, [`transfer.diff#${s1b.id}`]: -12_000, [`transit#${s1b.id}`]: -75_000, [`hq#${w.store.id}`]: -71_300,
      },
      [w.hq.id]: { [`franchisees@${w.owner.id}#${w.store.id}`]: 71_300, [`franchisees@${w.owner.id}#${s1b.id}`]: -71_300 },
    });
  });

  it("agrees with the franchise statement: what each store owes or is owed for stock, and what HQ collected for it", async () => {
    for (const s of [w.store.id, s2.id, s1b.id]) {
      const st = await franchiseStatement(s, period);
      expect(await sum("hq", { source: "stock-receive", storeId: s, period })).toBe(st.input.networkSoldCents - st.input.wholesaleCents - st.input.networkBoughtCents);
    }
    expect((await franchiseStatement(w.store.id, period)).input.wholesaleCents).toBe(3 * 29_000 + vatOnExcl(3 * 29_000));
  });
});

describe("late changes", () => {
  it("posts a till sale that synced after its day, and then only the next one's difference", async () => {
    const id = `${w.store.id}:${yesterday}`;
    const late = (paid: number) =>
      postPosSale({ id: randomUUID(), number: number(), offline: true, createdAt: `${yesterday}T10:00:00+02:00`, lines: [{ variantId: w.coffeeV.id, qty: 1, unitPriceCents: COFFEE }], payments: [{ method: "CASH", amountCents: paid }] }, till());
    // Its stock moved on its own day too, so the cost of sales posts with the sale.
    const cost = async () => -Number((await db.stockMovement.findMany({ where: { storeId: w.store.id, type: "SALE", createdAt: { gte: new Date(`${yesterday}T00:00:00+02:00`), lt: new Date(`${today}T00:00:00+02:00`) } } })).reduce((s, m) => s + m.qty * m.unitCostCents, 0));
    await late(COFFEE);
    expect(await db.ledgerQueue.count({ where: { source: "store-day", sourceId: id } })).toBe(1);
    await drain();
    const first = await cost();
    expect(first).toBeGreaterThan(0);
    expect((await shown("store-day", id))[w.owner.id]).toEqual({ [`cash#${w.store.id}`]: COFFEE, [`vat.output#${w.store.id}`]: -vatOf(COFFEE), [`sales.pos#${w.store.id}`]: -(COFFEE - vatOf(COFFEE)), [`cogs#${w.store.id}`]: first, [`stock#${w.store.id}`]: -first });
    await late(COFFEE - 100); // paid R1 short at a till that was offline
    await drain();
    const second = (await cost()) - first;
    const journals = await db.journal.findMany({ where: { source: "store-day", sourceId: id }, orderBy: { number: "asc" }, include: { lines: { include: { account: true } } } });
    expect(journals).toHaveLength(2);
    expect(journals[1].memo).toBe("Trading day at Test Store (TST01) · updated");
    expect(Object.fromEntries(journals[1].lines.map((l) => [l.account.key, l.amountCents]))).toEqual({ cash: COFFEE - 100, "cash.diff": 100, "vat.output": -vatOf(COFFEE), "sales.pos": -(COFFEE - vatOf(COFFEE)), cogs: second, stock: -second });
    expect(journals.every((j) => j.date.toISOString().slice(0, 10) === yesterday)).toBe(true);
  });

  it("keeps a day queued, with the reason, when its payments and its rollup disagree", async () => {
    const key = { storeId_date_channel: { storeId: w.store.id, date: new Date(`${yesterday}T00:00:00Z`), channel: "POS" as const } };
    await db.dailyStoreStat.update({ where: key, data: { onlineCents: { increment: 100 }, cashCents: { decrement: 100 } } });
    await queuePosting(db, "store-day", `${w.store.id}:${yesterday}`);
    await processLedgerQueue();
    const q = await db.ledgerQueue.findUniqueOrThrow({ where: { source_sourceId: { source: "store-day", sourceId: `${w.store.id}:${yesterday}` } } });
    expect(q).toMatchObject({ attempts: 1 });
    expect(q.error).toBe(`TST01 ${yesterday}: the payments HQ collected or funds come to R0.00 and the day's rollup to R1.00, so they're out by -R1.00`);
    await db.dailyStoreStat.update({ where: key, data: { onlineCents: { decrement: 100 }, cashCents: { increment: 100 } } });
    await queuePosting(db, "store-day", `${w.store.id}:${yesterday}`);
    await drain();
    expect(await db.journal.count({ where: { source: "store-day", sourceId: `${w.store.id}:${yesterday}` } })).toBe(2); // nothing had changed
  });
});

describe("the books", () => {
  it("lists every source with activity for a backfill and the store-days for the nightly run", async () => {
    const listed = await storeBackfill(yesterday, today);
    const ids = new Set(listed.map((s) => `${s.source}|${s.sourceId}`));
    const expenses = new Set((await db.expense.findMany({ select: { id: true } })).map((e) => e.id));
    const journals = await db.journal.findMany({ where: { source: { in: MINE } }, distinct: ["source", "sourceId"], select: { source: true, sourceId: true } });
    expect(journals.length).toBeGreaterThan(15);
    for (const j of journals) if (j.source !== "expense" || expenses.has(j.sourceId!)) expect(ids).toContain(`${j.source}|${j.sourceId}`); // a deleted expense is gone, its reversal posted
    expect(listed.filter((s) => s.source === "store-day").map((s) => s.sourceId).sort()).toEqual(
      [...[w.store.id, w.dc.id].map((s) => `${s}:${today}`), `${w.store.id}:${yesterday}`, ...(await db.store.findMany({ where: { code: { in: ["TST02", "TST03", "TST04"] } }, select: { id: true } })).map((s) => `${s.id}:${today}`)].sort(),
    );
    // Nightly: the day that ended, and a day from the week before that a missed night left unposted (yesterday's posted).
    const nightly = async (n: number) => (await storeNightly(addDays(now, n))).map((s) => s.sourceId);
    const todays = listed.filter((s) => s.source === "store-day" && s.sourceId.endsWith(today)).map((s) => s.sourceId);
    expect(await nightly(1)).toEqual(todays);
    const missedDay = dayKey(addDays(now, -3));
    const stat = { storeId: w.dc.id, date: new Date(`${missedDay}T00:00:00Z`), channel: "POS" as const }; // trading a missed night never posted
    await db.dailyStoreStat.create({ data: stat });
    expect(await nightly(1)).toEqual([...todays, `${w.dc.id}:${missedDay}`]);
    await queuePosting(db, "store-day", `${w.dc.id}:${missedDay}`);
    expect(await nightly(1)).toEqual(todays); // waiting in the queue already
    await db.ledgerQueue.deleteMany({ where: { sourceId: `${w.dc.id}:${missedDay}` } });
    await db.dailyStoreStat.delete({ where: { storeId_date_channel: stat } });
    expect(await nightly(8)).toEqual([]);
    await expect(storeBackfill(today, yesterday)).rejects.toThrow("range of days");
  });

  it("balance: every trial balance is zero, stock is its valuation, HQ mirrors each store's current account — and posting again posts nothing", async () => {
    // Lots whose cost re-averages: one received again at a new cost, one sold below zero and then received.
    const again = await lot("REAVG");
    await receive(w.store.id, w.flowerV.id, again.id, 3, 10_001);
    await receive(w.store.id, w.flowerV.id, again.id, 4, 12_347); // 7 at R113.42: 3 cents more than the two receipts
    const under = await lot("UNDER");
    await tx((t) => adjustStock(t, { storeId: w.store.id, variantId: w.flowerV.id, batchId: under.id, delta: -2, reason: "DAMAGED", allowNegative: true }));
    await receive(w.store.id, w.flowerV.id, under.id, 5, w.flowerV.wholesaleCents + 1_000); // the two below zero now cost R10 more each
    const revalued = await db.stockMovement.findMany({ where: { batchId: { in: [again.id, under.id] }, revalueCents: { not: 0 } }, select: { revalueCents: true } });
    expect(revalued.map((m) => m.revalueCents).sort((a, b) => a - b)).toEqual([-2_000, 3]);

    const listed = await storeBackfill(yesterday, today);
    for (const s of listed) await postSource(s.source, s.sourceId); // today's days, with everything since they were first posted

    for (const r of await db.ledgerBalance.groupBy({ by: ["companyId"], _sum: { debitCents: true, creditCents: true } })) expect(Number(r._sum.debitCents) - Number(r._sum.creditCents)).toBe(0);

    const stores = await db.store.findMany({ select: { id: true, companyId: true } });
    const levels = await db.$queryRaw<{ storeId: string; v: bigint }[]>`SELECT "storeId", SUM("onHand"::bigint * "unitCostCents") AS v FROM "StockLevel" GROUP BY 1`;
    expect(levels.length).toBe(5);
    for (const l of levels) expect(await bal(stores.find((s) => s.id === l.storeId)!.companyId, "stock", l.storeId)).toBe(Number(l.v));

    const hq = await db.journalLine.groupBy({ by: ["companyId", "storeId"], where: { account: { key: "hq" }, journal: { source: { in: MINE } } }, _sum: { amountCents: true } });
    const mirror = await db.journalLine.groupBy({ by: ["partyId", "storeId"], where: { companyId: w.hq.id, account: { key: "franchisees" }, journal: { source: { in: MINE } } }, _sum: { amountCents: true } });
    expect(hq.length).toBe(4);
    for (const h of hq) expect(mirror.find((m) => m.partyId === h.companyId && m.storeId === h.storeId)?._sum.amountCents).toBe(-(h._sum.amountCents ?? 0));
    expect(mirror.length).toBe(hq.length);

    // The store's current account carries exactly what the statement credits for HQ's collections and points redeemed.
    const st = await franchiseStatement(w.store.id, period);
    expect(await sum("hq", { source: "store-day", storeId: w.store.id, period })).toBe(st.input.onlineCollectedCents + st.input.pointsRedeemedCents);

    const before = await db.journal.count({ where: { source: { in: MINE } } });
    for (const s of listed) expect(await postSource(s.source, s.sourceId)).toEqual([]);
    await processLedgerQueue();
    expect(await db.journal.count({ where: { source: { in: MINE } } })).toBe(before);
  });
});
