// Finance for store owners and HQ. Sales figures come from the daily rollups so
// the same queries serve one store or 1,000.
import { db } from "./db";
import { buildStatement } from "@/lib/statement";
import { applyBps, vatOnExcl } from "@/lib/money";
import { POINT_VALUE_CENTS } from "@/lib/loyalty-rules";
import { rangeFromParams, type DateRange } from "@/lib/format";
import { receivedValue } from "./stock-orders";

const SUMS = {
  sales: true, refunds: true, units: true, grossCents: true, vatCents: true, costCents: true, discountCents: true,
  cardCents: true, cashCents: true, payshapCents: true, eftCents: true, loyaltyCents: true, onlineCents: true,
  members: true, pointsIssued: true,
} as const;

export type Totals = { -readonly [K in keyof typeof SUMS]: number };
const zero = (): Totals => Object.fromEntries(Object.keys(SUMS).map((k) => [k, 0])) as Totals;
const fill = (s: Partial<Record<keyof Totals, number | null>>) => {
  const t = zero();
  for (const k of Object.keys(t) as (keyof Totals)[]) t[k] = s[k] ?? 0;
  return t;
};

export function derived(t: Totals) {
  const net = t.grossCents - t.vatCents;
  const transactions = t.sales;
  return {
    ...t,
    netCents: net,
    grossProfitCents: net - t.costCents,
    marginPct: net ? (net - t.costCents) / net : 0,
    atvCents: transactions ? Math.round(t.grossCents / transactions) : 0,
    upt: transactions ? t.units / transactions : 0,
    memberRate: transactions ? t.members / transactions : 0,
  };
}
export type Summary = ReturnType<typeof derived>;

export async function salesSummary(storeIds: string[], r: DateRange, channel?: "POS" | "ONLINE") {
  const where = { storeId: { in: storeIds }, date: { gte: r.fromDate, lte: r.toDate }, ...(channel && { channel }) };
  const agg = await db.dailyStoreStat.aggregate({ where, _sum: SUMS });
  return derived(fill(agg._sum));
}

export async function salesByDay(storeIds: string[], r: DateRange) {
  const rows = await db.dailyStoreStat.groupBy({
    by: ["date"],
    where: { storeId: { in: storeIds }, date: { gte: r.fromDate, lte: r.toDate } },
    _sum: SUMS,
    orderBy: { date: "asc" },
  });
  const byDay = new Map(rows.map((x) => [x.date.toISOString().slice(0, 10), derived(fill(x._sum))]));
  const out: (Summary & { date: string })[] = [];
  for (let i = 0; i < r.days; i++) {
    const d = new Date(r.fromDate.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date: d, ...(byDay.get(d) ?? derived(zero())) });
  }
  return out;
}

export async function salesByChannel(storeIds: string[], r: DateRange) {
  const rows = await db.dailyStoreStat.groupBy({
    by: ["channel"],
    where: { storeId: { in: storeIds }, date: { gte: r.fromDate, lte: r.toDate } },
    _sum: SUMS,
  });
  return rows.map((x) => ({ channel: x.channel, ...derived(fill(x._sum)) }));
}

export async function salesByStore(storeIds: string[], r: DateRange) {
  const rows = await db.dailyStoreStat.groupBy({
    by: ["storeId"],
    where: { storeId: { in: storeIds }, date: { gte: r.fromDate, lte: r.toDate } },
    _sum: SUMS,
  });
  return new Map(rows.map((x) => [x.storeId, derived(fill(x._sum))]));
}

export async function expensesFor(storeIds: string[], r: DateRange) {
  const rows = await db.expense.groupBy({
    by: ["category"],
    where: { storeId: { in: storeIds }, date: { gte: r.start, lt: r.end } },
    _sum: { amountCents: true, vatCents: true },
  });
  return rows.map((x) => ({ category: x.category, amountCents: x._sum.amountCents ?? 0, vatCents: x._sum.vatCents ?? 0 }));
}

async function feeRates(storeIds: string[]) {
  const stores = await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, royaltyBps: true, levyBps: true, ecomBps: true } });
  return new Map(stores.map((s) => [s.id, s]));
}

/** Franchise fees (ex VAT) for the stores and range. */
export async function franchiseFees(storeIds: string[], r: DateRange) {
  const [byStore, online, rates] = await Promise.all([
    salesByStore(storeIds, r),
    db.dailyStoreStat.groupBy({
      by: ["storeId"],
      where: { storeId: { in: storeIds }, date: { gte: r.fromDate, lte: r.toDate }, channel: "ONLINE" },
      _sum: { grossCents: true, vatCents: true },
    }),
    feeRates(storeIds),
  ]);
  const onlineNet = new Map(online.map((o) => [o.storeId, (o._sum.grossCents ?? 0) - (o._sum.vatCents ?? 0)]));
  let royalty = 0, levy = 0, ecom = 0;
  for (const [id, s] of byStore) {
    const rate = rates.get(id);
    if (!rate) continue;
    royalty += applyBps(s.netCents, rate.royaltyBps);
    levy += applyBps(s.netCents, rate.levyBps);
    ecom += applyBps(onlineNet.get(id) ?? 0, rate.ecomBps);
  }
  return { royalty, levy, ecom, total: royalty + levy + ecom };
}

export async function profitAndLoss(storeIds: string[], r: DateRange) {
  const [s, expenses, fees] = await Promise.all([salesSummary(storeIds, r), expensesFor(storeIds, r), franchiseFees(storeIds, r)]);
  const opex = expenses.reduce((a, e) => a + e.amountCents - e.vatCents, 0);
  return {
    revenue: s.netCents,
    cogs: s.costCents,
    grossProfit: s.grossProfitCents,
    marginPct: s.marginPct,
    expenses: expenses.map((e) => ({ ...e, exVatCents: e.amountCents - e.vatCents })),
    opex,
    fees,
    netProfit: s.grossProfitCents - opex - fees.total,
    summary: s,
  };
}

/** VAT201 working: output tax on sales vs input tax on stock, expenses and franchise fees. */
export async function vatReport(storeIds: string[], r: DateRange) {
  const [s, expenses, fees, purchases] = await Promise.all([
    salesSummary(storeIds, r),
    expensesFor(storeIds, r),
    franchiseFees(storeIds, r),
    db.stockOrder.findMany({
      where: { buyerId: { in: storeIds }, status: "RECEIVED", receivedAt: { gte: r.start, lt: r.end } },
      include: { lines: true },
    }),
  ]);
  const stockInput = purchases.reduce((a, o) => a + (receivedValue(o) - Math.round(receivedValue(o) / 1.15)), 0);
  const expenseInput = expenses.reduce((a, e) => a + e.vatCents, 0);
  const feeInput = vatOnExcl(fees.total);
  const input = stockInput + expenseInput + feeInput;
  return { output: s.vatCents, stockInput, expenseInput, feeInput, input, payable: s.vatCents - input, salesInclCents: s.grossCents };
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return rangeFromParams({ from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` });
}

export async function franchiseStatement(storeId: string, month: string) {
  const r = monthRange(month);
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  const [all, online, orders] = await Promise.all([
    salesSummary([storeId], r),
    salesSummary([storeId], r, "ONLINE"),
    db.stockOrder.findMany({
      where: { status: "RECEIVED", receivedAt: { gte: r.start, lt: r.end }, OR: [{ buyerId: storeId }, { sellerId: storeId }] },
      include: { lines: true },
    }),
  ]);
  const sum = (f: (o: (typeof orders)[number]) => boolean) => orders.filter(f).reduce((a, o) => a + receivedValue(o), 0);
  const input = {
    netSalesExVatCents: all.netCents,
    onlineSalesExVatCents: online.netCents,
    onlineCollectedCents: all.onlineCents,
    pointsIssuedCents: all.pointsIssued * POINT_VALUE_CENTS,
    pointsRedeemedCents: all.loyaltyCents,
    wholesaleCents: sum((o) => o.kind === "WHOLESALE" && o.buyerId === storeId),
    networkSoldCents: sum((o) => o.kind === "NETWORK" && o.sellerId === storeId),
    networkBoughtCents: sum((o) => o.kind === "NETWORK" && o.buyerId === storeId),
    royaltyBps: store.royaltyBps,
    levyBps: store.levyBps,
    ecomBps: store.ecomBps,
  };
  return { store, month, range: r, input, ...buildStatement(input) };
}

/** Expected cash for a shift: float + cash tendered on sales and refunds in the shift. */
export async function shiftCash(shiftId: string) {
  const shift = await db.shift.findUniqueOrThrow({ where: { id: shiftId } });
  const cash = await db.payment.aggregate({ where: { method: "CASH", sale: { shiftId } }, _sum: { amountCents: true } });
  const expected = shift.openingFloatCents + (cash._sum.amountCents ?? 0);
  return { shift, cashSalesCents: cash._sum.amountCents ?? 0, expectedCents: expected, varianceCents: shift.countedCashCents != null ? shift.countedCashCents - expected : null };
}
