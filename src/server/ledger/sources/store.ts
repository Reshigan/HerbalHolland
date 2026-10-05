// Store-side posting rules: a store's trading day, cash-ups, deposits, expenses, outside suppliers' invoices and stock
// orders, in its company's books, and in HQ's for what HQ collected, funds or supplied. Each handler reads one
// source's facts and returns what it should show now (the lines come from @/lib/ledger-store); the core posts only the
// difference. Business code queues these inside its own transactions; storeNightly queues the day that ended.
import { db, type Tx } from "../../db";
import type { Posting, SourceHandler } from "../core";
import { shiftCash } from "../../finance";
import { receivedValue } from "../../stock-orders";
import {
  DAY_STOCK_TYPES, depositLines, expenseLines, shiftLines, stockReceiveLines, stockShipLines, storeDayLines, supplierInvoiceLines, supplierPaymentLines, type StoreRef,
} from "@/lib/ledger-store";
import type { Line } from "@/lib/ledger";
import { addDays, dayKey, rangeFromParams } from "@/lib/format";

type Source = { source: string; sourceId: string };
const asDay = (d: Date) => d.toISOString().slice(0, 10); // a DATE column's day
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function hqCompanyId(t: Tx) {
  const c = await t.company.findFirst({ where: { kind: "FRANCHISOR" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!c) throw new Error("There's no franchisor company on record");
  return c.id;
}

/** A store as the books see it, and the name its journals carry. */
async function storeRef(t: Tx, id: string): Promise<StoreRef & { code: string; label: string }> {
  const s = await t.store.findUnique({ where: { id }, select: { id: true, code: true, name: true, companyId: true, company: { select: { kind: true, vatNumber: true } } } });
  if (!s) throw new Error(`Store ${id} isn't on record`);
  return { storeId: s.id, companyId: s.companyId, hqOwned: s.company.kind === "FRANCHISOR", vendor: !!s.company.vatNumber, code: s.code, label: `${s.name} (${s.code})` };
}

/** One store's lines in its company's books, or nothing. */
const posting = (s: StoreRef, date: string, memo: string, lines: Line[]): Posting[] => (lines.length ? [{ companyId: s.companyId, date, memo, storeId: s.storeId, lines }] : []);

/** `<storeId>:<YYYY-MM-DD>`: the day's sales, VAT and tenders from its rollups, HQ's share from its payments, its stock at cost. */
const storeDay: SourceHandler = async (sourceId, t) => {
  const [storeId, day] = sourceId.split(":");
  if (!DAY.test(day ?? "")) throw new Error(`store-day ${sourceId}: expected <storeId>:<YYYY-MM-DD>`);
  const store = await storeRef(t, storeId);
  const r = rangeFromParams({ from: day, to: day });
  const days = await t.dailyStoreStat.findMany({ where: { storeId, date: r.fromDate } });
  // A trade order's sale was collected by HQ (EFT to HQ's bank, or HQ's trade ledger): its EFT is HQ's money, as in the
  // rollup (postSaleTx's collectedByHq). Refunds keep their tenders' own columns.
  const tenders = await t.$queryRaw<{ method: string; tradeAccountId: string | null; byHq: boolean; cents: bigint }[]>`
    SELECT p.method::text AS method, s."tradeAccountId", (s.kind = 'SALE' AND o.id IS NOT NULL) AS "byHq", SUM(p."amountCents")::bigint AS cents
    FROM "Payment" p JOIN "Sale" s ON s.id = p."saleId" LEFT JOIN "TradeOrder" o ON o."saleId" = s.id
    WHERE s."storeId" = ${storeId} AND s."createdAt" >= ${r.start} AND s."createdAt" < ${r.end} AND p.method IN ('ONLINE', 'VOUCHER', 'LOYALTY', 'ACCOUNT', 'EFT')
    GROUP BY 1, 2, 3`;
  const stock = await t.$queryRaw<{ type: string; cents: bigint }[]>`
    SELECT type::text AS type, SUM(qty::bigint * "unitCostCents")::bigint AS cents FROM "StockMovement"
    WHERE "storeId" = ${storeId} AND "createdAt" >= ${r.start} AND "createdAt" < ${r.end} AND type::text = ANY(${DAY_STOCK_TYPES}::text[])
    GROUP BY 1`;
  const out = storeDayLines({
    store, hqCompanyId: await hqCompanyId(t), label: `${store.code} ${day}`, days,
    tenders: tenders.map((x) => ({ method: x.method, tradeAccountId: x.tradeAccountId, collectedByHq: x.byHq, cents: Number(x.cents) })),
    stock: stock.map((x) => ({ type: x.type, cents: Number(x.cents) })),
  });
  return out.map((c) => ({ ...c, date: day, storeId, memo: c.companyId === store.companyId ? `Trading day at ${store.label}` : `Collected and funded by HQ at ${store.label}` }));
};

/** A closed cash-up: counted less expected (shiftCash), dated the day it closed. */
const shift: SourceHandler = async (id, t) => {
  const s = await t.shift.findUnique({ where: { id }, select: { storeId: true, closedAt: true, countedCashCents: true } });
  if (!s?.closedAt || s.countedCashCents == null) return [];
  const store = await storeRef(t, s.storeId);
  const { varianceCents } = await shiftCash(id);
  return posting(store, dayKey(s.closedAt), `Cash-up difference at ${store.label}`, shiftLines({ storeId: s.storeId, varianceCents: varianceCents ?? 0 }));
};

const deposit: SourceHandler = async (id, t) => {
  const d = await t.cashDeposit.findUnique({ where: { id }, select: { number: true, storeId: true, bankedOn: true, amountCents: true } });
  if (!d) return [];
  const store = await storeRef(t, d.storeId);
  return posting(store, asDay(d.bankedOn), `Cash deposit ${d.number} from ${store.label}`, depositLines({ storeId: d.storeId, amountCents: d.amountCents }));
};

const expense: SourceHandler = async (id, t) => {
  const e = await t.expense.findUnique({ where: { id } });
  if (!e) return [];
  const store = await storeRef(t, e.storeId);
  return posting(
    store, dayKey(e.date), `${e.description}${e.supplier ? ` (${e.supplier})` : ""} at ${store.label}`,
    expenseLines({ storeId: e.storeId, category: e.category, amountCents: e.amountCents, vatCents: e.vatCents, vendor: store.vendor }),
  );
};

/** An outside supplier's invoice (a stock order's own invoice is posted with the order, stock-receive). */
const supplierInvoice: SourceHandler = async (id, t) => {
  const inv = await t.supplierInvoice.findUnique({ where: { id } });
  if (!inv || inv.onStatement) return [];
  const store = await storeRef(t, inv.storeId);
  if (inv.accountId && !(await t.ledgerAccount.count({ where: { id: inv.accountId, companyId: store.companyId } })))
    throw new Error(`Supplier invoice ${inv.number} at ${store.label} is charged to an account outside its company's books`);
  return posting(
    store, asDay(inv.invoiceDate), `Invoice ${inv.number} from ${inv.supplierName}`,
    supplierInvoiceLines({ storeId: inv.storeId, supplierName: inv.supplierName, accountId: inv.accountId, totalCents: inv.totalCents, vatCents: inv.vatCents, vendor: store.vendor }),
  );
};

/** Its payment, once marked paid (a queried invoice is still owed). */
const supplierPayment: SourceHandler = async (id, t) => {
  const inv = await t.supplierInvoice.findUnique({ where: { id } });
  if (!inv || inv.onStatement || inv.status !== "PAID" || !inv.paidAt) return [];
  const store = await storeRef(t, inv.storeId);
  return posting(store, dayKey(inv.paidAt), `Paid ${inv.supplierName}, invoice ${inv.number}`, supplierPaymentLines({ storeId: inv.storeId, supplierName: inv.supplierName, totalCents: inv.totalCents }));
};

/** A stock order's transfer movements at one store, through the store's own movements around the time (indexed). */
const transfers = (t: Tx, orderId: string, storeId: string, at: Date, type: "TRANSFER_OUT" | "TRANSFER_IN") =>
  t.stockMovement.findMany({
    where: { storeId, createdAt: { gte: addDays(at, -1), lte: addDays(at, 1) }, type, stockOrderId: orderId },
    select: { variantId: true, batchId: true, qty: true, unitCostCents: true },
  });

/** Shipped: into transit at the seller's cost, dated the day it shipped. */
const stockShip: SourceHandler = async (id, t) => {
  const o = await t.stockOrder.findUnique({ where: { id }, select: { number: true, sellerId: true, shippedAt: true, buyer: { select: { name: true } } } });
  if (!o?.shippedAt) return [];
  const seller = await storeRef(t, o.sellerId);
  const cost = (await transfers(t, id, o.sellerId, o.shippedAt, "TRANSFER_OUT")).reduce((s, m) => s - m.qty * m.unitCostCents, 0);
  return posting(seller, dayKey(o.shippedAt), `Stock order ${o.number} shipped to ${o.buyer.name}`, stockShipLines({ storeId: o.sellerId, costCents: cost }));
};

/**
 * Received, dated the day it was received (the month its statement counts it in): the buyer's stock and what it owes
 * (receivedValue, as the statement has it), the seller's sale or transfer and any units lost on the way, HQ's side.
 */
const stockReceive: SourceHandler = async (id, t) => {
  const o = await t.stockOrder.findUnique({ where: { id }, include: { lines: true, buyer: { select: { name: true } }, seller: { select: { name: true } } } });
  if (!o || o.status !== "RECEIVED" || !o.receivedAt || !o.shippedAt) return [];
  const [buyer, seller] = [await storeRef(t, o.buyerId), await storeRef(t, o.sellerId)];
  const out = await transfers(t, id, o.sellerId, o.shippedAt, "TRANSFER_OUT");
  const lot = new Map(out.map((m) => [`${m.variantId}:${m.batchId}`, m.unitCostCents]));
  let received = 0, receivedCost = 0;
  for (const m of await transfers(t, id, o.buyerId, o.receivedAt, "TRANSFER_IN")) {
    const cost = lot.get(`${m.variantId}:${m.batchId}`);
    if (cost == null) throw new Error(`Stock order ${o.number}: ${buyer.label} received a lot ${seller.label} didn't ship`);
    received += m.qty * m.unitCostCents;
    receivedCost += m.qty * cost;
  }
  const invoiced = o.lines.reduce((s, l) => s + (l.receivedQty ?? 0) * l.unitCostCents, 0);
  if (received !== invoiced) throw new Error(`Stock order ${o.number}: the stock received (${received} cents ex VAT) doesn't match the order's received lines (${invoiced})`);
  const lines = stockReceiveLines({
    hqCompanyId: await hqCompanyId(t), buyer, seller, receivedCents: received, valueCents: receivedValue(o),
    shippedCostCents: out.reduce((s, m) => s - m.qty * m.unitCostCents, 0), receivedCostCents: receivedCost,
  });
  const memo = `Stock order ${o.number} from ${o.seller.name} to ${o.buyer.name}, received`;
  return lines.map((c) => ({ ...c, date: dayKey(o.receivedAt!), memo, storeId: c.companyId === seller.companyId && c.companyId !== buyer.companyId ? o.sellerId : o.buyerId }));
};

export const STORE_SOURCES: Record<string, SourceHandler> = {
  "store-day": storeDay,
  shift,
  deposit,
  expense,
  "supplier-invoice": supplierInvoice,
  "supplier-payment": supplierPayment,
  "stock-ship": stockShip,
  "stock-receive": stockReceive,
};

/** Store-days with trading (a rollup row) or stock movements, each day from `from` to `to` (SAST, inclusive). */
async function storeDays(from: string, to: string): Promise<Source[]> {
  // Movements: one probe of the store × time index per store and day (a scan by time alone would read them all).
  const rows = await db.$queryRaw<{ storeId: string; day: string }[]>`
    SELECT "storeId", to_char(date, 'YYYY-MM-DD') AS day FROM "DailyStoreStat" WHERE date BETWEEN ${from}::date AND ${to}::date
    UNION
    SELECT s.id, to_char(d.day, 'YYYY-MM-DD')
    FROM generate_series(${from}::timestamp, ${to}::timestamp, interval '1 day') AS d(day) CROSS JOIN "Store" s
    CROSS JOIN LATERAL (
      SELECT 1 FROM "StockMovement" m WHERE m."storeId" = s.id
        AND m."createdAt" >= ((d.day AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'UTC')
        AND m."createdAt" < (((d.day + interval '1 day') AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'UTC')
      LIMIT 1) moved
    ORDER BY 1, 2`;
  return rows.map((r) => ({ source: "store-day", sourceId: `${r.storeId}:${r.day}` }));
}

/** Nightly: the store-days of the day that ended (everything else is queued as it happens). */
export async function storeNightly(now: Date): Promise<Source[]> {
  const day = dayKey(addDays(now, -1));
  return storeDays(day, day);
}

/**
 * Every store-side source with activity from `from` to `to` (SAST days, inclusive): store-days, closed cash-ups,
 * deposits, expenses, outside suppliers' invoices and their payments, stock orders shipped and received. For posting
 * history (the demo seed) or re-posting a period; posting is idempotent, so a source listed again posts nothing new.
 */
export async function storeBackfill(from: string, to: string): Promise<Source[]> {
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw new Error(`Backfill needs a range of days (YYYY-MM-DD to YYYY-MM-DD), not ${from} to ${to}`);
  const r = rangeFromParams({ from, to });
  const at = { gte: r.start, lt: r.end };
  const on = { gte: r.fromDate, lte: r.toDate };
  const id = { select: { id: true } } as const;
  const [days, shifts, deposits, expenses, invoices, paid, shipped, received] = await Promise.all([
    storeDays(from, to),
    db.shift.findMany({ where: { closedAt: at, countedCashCents: { not: null } }, ...id }),
    db.cashDeposit.findMany({ where: { bankedOn: on }, ...id }),
    db.expense.findMany({ where: { date: at }, ...id }),
    db.supplierInvoice.findMany({ where: { onStatement: false, invoiceDate: on }, ...id }),
    db.supplierInvoice.findMany({ where: { onStatement: false, status: "PAID", paidAt: at }, ...id }),
    db.stockOrder.findMany({ where: { shippedAt: at }, ...id }),
    db.stockOrder.findMany({ where: { status: "RECEIVED", receivedAt: at }, ...id }),
  ]);
  const of = (source: string, rows: { id: string }[]) => rows.map((x) => ({ source, sourceId: x.id }));
  return [
    ...days, ...of("shift", shifts), ...of("deposit", deposits), ...of("expense", expenses), ...of("supplier-invoice", invoices),
    ...of("supplier-payment", paid), ...of("stock-ship", shipped), ...of("stock-receive", received),
  ];
}
