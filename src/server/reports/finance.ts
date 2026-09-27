// Finance reports: P&L, VAT201 working, cash-ups, franchise statements and the
// Rewards points liability. Built on the finance domain service so every screen agrees.
import { db } from "../db";
import { expensesFor, franchiseFees, franchiseStatement, profitAndLoss, salesByStore, vatReport } from "../finance";
import { receivedValue } from "../stock-orders";
import { delta, previousRange } from "@/lib/ranges";
import { applyBps, zar } from "@/lib/money";
import { dayKey, fmtDay, fmtMonth } from "@/lib/format";
import { POINT_VALUE_CENTS, fmtPoints } from "@/lib/loyalty-rules";
import type { Option, ReportCtx, ReportDef, Row } from "./types";
import { MANAGERS } from "./types";
import { STAT_SUMS, bounds, eachDay, isoDay, mapLimit, multi, n, ratio, retailIds, storeCols, storeLabel, storeVals, sumRows, summaryOf, userNames } from "./util";

const EXPENSE_LABEL: Record<string, string> = {
  RENT: "Rent", SALARIES: "Salaries & wages", UTILITIES: "Electricity & water", SECURITY: "Security", MARKETING: "Local marketing",
  SUPPLIES: "Store supplies", BANK_FEES: "Bank & card fees", OTHER: "Other expenses",
};

// ── Profit & loss ───────────────────────────────────────────────────────────
export const pnl: ReportDef = {
  key: "pnl",
  title: "Profit & loss",
  description: "Are we making money? Sales, margin, expenses and franchise fees against the previous period.",
  group: "Finance",
  scopes: ["store", "hq"],
  filters: ["range"],
  roles: MANAGERS,
  params: [{ key: "by", label: "Show", options: ({ multi }) => [{ value: "lines", label: "Statement" }, ...(multi ? [{ value: "store", label: "By store" }] : [])], default: "lines" }],
  async run(ctx) {
    const ids = retailIds(ctx);
    if (ctx.params.by === "store") return pnlByStore(ctx, ids);
    const prevR = previousRange(ctx.range);
    const [cur, prev] = await Promise.all([profitAndLoss(ids, ctx.range), profitAndLoss(ids, prevR)]);
    const exp = (p: typeof cur, cat: string) => p.expenses.find((e) => e.category === cat)?.exVatCents ?? 0;
    const cats = [...new Set([...cur.expenses, ...prev.expenses].map((e) => e.category))].sort((a, b) => exp(cur, b) - exp(cur, a));
    const line = (label: string, c: number, p: number, style?: Row["_style"]): Row => ({ line: label, cur: c, pct: ratio(Math.abs(c), cur.revenue), prev: p, change: delta(Math.abs(c), Math.abs(p)), _style: style });
    const section = (label: string): Row => ({ line: label, _style: "section" });
    const rows: Row[] = [
      line("Net sales (ex VAT)", cur.revenue, prev.revenue, "strong"),
      line("Cost of sales", -cur.cogs, -prev.cogs),
      line("Gross profit", cur.grossProfit, prev.grossProfit, "strong"),
      section("Operating expenses (ex VAT)"),
      ...cats.map((c) => line(EXPENSE_LABEL[c] ?? c, -exp(cur, c), -exp(prev, c))),
      line("Total operating expenses", -cur.opex, -prev.opex, "strong"),
      section("Franchise fees (ex VAT)"),
      line("Royalty", -cur.fees.royalty, -prev.fees.royalty),
      line("Marketing fund levy", -cur.fees.levy, -prev.fees.levy),
      line("E-commerce commission", -cur.fees.ecom, -prev.fees.ecom),
      line("Total franchise fees", -cur.fees.total, -prev.fees.total, "strong"),
      line("Net profit before tax", cur.netProfit, prev.netProfit, "strong"),
    ];
    return {
      columns: [
        { key: "line", label: "" },
        { key: "cur", label: `${fmtDay(ctx.range.start)} – ${fmtDay(`${ctx.range.to}T12:00:00Z`)}`, format: "zar" },
        { key: "pct", label: "% of sales", format: "pct" },
        { key: "prev", label: `Previous ${ctx.range.days} days`, format: "zar" },
        { key: "change", label: "Change", format: "pct" },
      ],
      rows,
      summary: [
        { label: "Net sales (ex VAT)", value: cur.revenue, format: "zar", delta: delta(cur.revenue, prev.revenue) },
        { label: "Gross margin", value: cur.marginPct, format: "pct", sub: `${zar(cur.grossProfit)} gross profit` },
        { label: "Operating expenses", value: cur.opex, format: "zar", delta: delta(cur.opex, prev.opex), upIsGood: false },
        { label: "Net profit before tax", value: cur.netProfit, format: "zar", delta: delta(cur.netProfit, prev.netProfit), sub: cur.revenue ? `${((cur.netProfit / cur.revenue) * 100).toFixed(1)}% net margin` : undefined },
      ],
      chart: cur.revenue > 0 && cur.netProfit >= 0
        ? { kind: "donut", title: "Where each rand of sales goes", description: "Share of net sales ex VAT", format: "zar", center: `${((cur.netProfit / cur.revenue) * 100).toFixed(0)}% profit`, data: [{ label: "Cost of sales", value: cur.cogs }, { label: "Operating expenses", value: cur.opex }, { label: "Franchise fees", value: cur.fees.total }, { label: "Net profit", value: cur.netProfit }] }
        : cur.revenue > 0
          ? { kind: "bar", title: "Costs against net sales", description: "Ex VAT", format: "zar", rows: [{ label: "Net sales", value: cur.revenue }, { label: "Cost of sales", value: cur.cogs }, { label: "Operating expenses", value: cur.opex }, { label: "Franchise fees", value: cur.fees.total }] }
          : null,
      note: `Management P&L before income tax, all amounts ex VAT. Cost of sales is the landed cost of the batches sold (FIFO by lot). Operating expenses are captured under Money → Expenses; franchise fees follow the store's royalty, levy and e-commerce rates.${multi(ctx) ? ` Combines ${ids.length} stores; distribution centres are excluded.` : ""}`,
    };
  },
};

async function pnlByStore(ctx: ReportCtx, ids: string[]) {
  const r = ctx.range;
  const [sales, exp, online, rates] = await Promise.all([
    salesByStore(ids, r),
    db.expense.groupBy({ by: ["storeId"], where: { storeId: { in: ids }, date: { gte: r.start, lt: r.end } }, _sum: { amountCents: true, vatCents: true } }),
    db.dailyStoreStat.groupBy({ by: ["storeId"], where: { storeId: { in: ids }, date: { gte: r.fromDate, lte: r.toDate }, channel: "ONLINE" }, _sum: { grossCents: true, vatCents: true } }),
    db.store.findMany({ where: { id: { in: ids } }, select: { id: true, royaltyBps: true, levyBps: true, ecomBps: true } }),
  ]);
  const opex = new Map(exp.map((e) => [e.storeId, (e._sum.amountCents ?? 0) - (e._sum.vatCents ?? 0)]));
  const onl = new Map(online.map((o) => [o.storeId, (o._sum.grossCents ?? 0) - (o._sum.vatCents ?? 0)]));
  const rows: Row[] = rates
    .map((st) => {
      const s = sales.get(st.id) ?? summaryOf(null);
      const fees = applyBps(s.netCents, st.royaltyBps) + applyBps(s.netCents, st.levyBps) + applyBps(onl.get(st.id) ?? 0, st.ecomBps);
      const o = opex.get(st.id) ?? 0;
      const net = s.grossProfitCents - o - fees;
      return { store: storeLabel(ctx, st.id), code: ctx.stores.get(st.id)?.code ?? "", sales: s.netCents, gp: s.grossProfitCents, margin: s.netCents ? s.marginPct : null, opex: o, fees, net, netMargin: ratio(net, s.netCents) };
    })
    .sort((a, b) => b.net - a.net);
  const t = sumRows(rows, ["sales", "gp", "opex", "fees", "net"], { store: "Total" });
  t.margin = ratio(t.gp as number, t.sales as number);
  t.netMargin = ratio(t.net as number, t.sales as number);
  const losing = rows.filter((x) => (x.net as number) < 0).length;
  return {
    columns: [
      { key: "store", label: "Store" },
      { key: "code", label: "Code" },
      { key: "sales", label: "Net sales", format: "zar" as const },
      { key: "gp", label: "Gross profit", format: "zar" as const },
      { key: "margin", label: "Gross margin", format: "pct" as const },
      { key: "opex", label: "Operating expenses", format: "zar" as const },
      { key: "fees", label: "Franchise fees", format: "zar" as const },
      { key: "net", label: "Net profit", format: "zar" as const },
      { key: "netMargin", label: "Net margin", format: "pct" as const },
    ],
    rows,
    totals: t,
    summary: [
      { label: "Net sales (ex VAT)", value: t.sales as number, format: "zar" as const },
      { label: "Net profit before tax", value: t.net as number, format: "zar" as const, sub: t.netMargin == null ? undefined : `${((t.netMargin as number) * 100).toFixed(1)}% net margin` },
      { label: "Stores making a loss", value: losing, format: "number" as const, sub: `of ${rows.length}`, upIsGood: false },
    ],
    chart: rows.length > 1 ? { kind: "bar" as const, title: "Net profit by store", description: "Before tax, ex VAT · stores in profit", format: "zar" as const, rows: rows.filter((x) => (x.net as number) > 0).slice(0, 15).map((x) => ({ label: String(x.store), value: x.net as number, sub: x.netMargin == null ? undefined : `${((x.netMargin as number) * 100).toFixed(1)}%` })) } : null,
    note: "Each franchisee's management P&L before income tax, ex VAT. Distribution centres are excluded.",
  };
}

// ── VAT201 working ──────────────────────────────────────────────────────────
export const vat: ReportDef = {
  key: "vat",
  title: "VAT (VAT201 working)",
  description: "What VAT do we owe SARS for the period — output tax against input tax?",
  group: "Finance",
  scopes: ["store", "hq"],
  filters: ["range"],
  defaultRange: "lastmonth",
  roles: MANAGERS,
  async run(ctx) {
    const retail = retailIds(ctx);
    const ids = retail.filter((id) => ctx.stores.get(id)?.vendor);
    const skipped = retail.length - ids.length;
    if (!ids.length)
      return { columns: [{ key: "line", label: "" }], rows: [], empty: "Not registered for VAT — no output tax is charged and no VAT201 is due for this store's company." };
    const { start, end } = bounds(ctx);
    const [v, expenses, fees, received] = await Promise.all([
      vatReport(ids, ctx.range),
      expensesFor(ids, ctx.range),
      franchiseFees(ids, ctx.range),
      db.stockOrder.findMany({ where: { buyerId: { in: ids }, status: "RECEIVED", receivedAt: { gte: start, lt: end } }, select: { lines: { select: { receivedQty: true, unitCostCents: true } } } }),
    ]);
    const purchases = received.reduce((s, o) => s + receivedValue(o), 0);
    const vatableExpenses = expenses.filter((e) => e.vatCents > 0).reduce((s, e) => s + e.amountCents, 0);
    const refund = v.payable < 0;
    const rows: Row[] = [
      { line: "Output tax", _style: "section" },
      { line: "Standard-rated sales (in store and online)", field: "1 · 4", amount: v.salesInclCents, vat: v.output },
      { line: "Input tax", _style: "section" },
      { line: "Stock purchases (HQ and network tax invoices)", field: "15", amount: purchases, vat: v.stockInput },
      { line: "Operating expenses with VAT", field: "15", amount: vatableExpenses, vat: v.expenseInput },
      { line: "Franchise fees (royalty, levy, commission)", field: "15", amount: fees.total + v.feeInput, vat: v.feeInput },
      { line: "Total input tax", field: "19", amount: null, vat: v.input, _style: "strong" },
      { line: refund ? "VAT refundable by SARS" : "VAT payable to SARS", field: "20", amount: null, vat: Math.abs(v.payable), _style: "strong" },
    ];
    return {
      columns: [
        { key: "line", label: "" },
        { key: "field", label: "VAT201 field" },
        { key: "amount", label: "Amount incl VAT", format: "zar" },
        { key: "vat", label: "VAT", format: "zar" },
      ],
      rows,
      summary: [
        { label: "Output tax", value: v.output, format: "zar", sub: "on sales" },
        { label: "Input tax", value: v.input, format: "zar", sub: "stock, expenses and fees" },
        { label: refund ? "Refundable by SARS" : "Payable to SARS", value: Math.abs(v.payable), format: "zar" },
      ],
      note: `A working paper for the VAT201 return at 15% — check it against your tax invoices before filing. Returns are filed per VAT vendor (company), so choose the date range that matches your VAT period.${multi(ctx) || ids.length > 1 ? ` Combines ${ids.length} VAT-registered store${ids.length === 1 ? "" : "s"}.` : ""}${skipped ? ` ${skipped} store${skipped === 1 ? " isn't" : "s aren't"} registered for VAT and ${skipped === 1 ? "is" : "are"} left out.` : ""}`,
    };
  },
};

// ── Cash-ups ────────────────────────────────────────────────────────────────
export const cashUps: ReportDef = {
  key: "cash-ups",
  title: "Cash-ups",
  description: "Did the cash drawer balance at every shift close?",
  group: "Finance",
  scopes: ["store", "hq"],
  filters: ["range"],
  roles: MANAGERS,
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const where = { storeId: { in: ctx.storeIds }, openedAt: { gte: start, lt: end } };
    const [shifts, count, closed] = await Promise.all([
      db.shift.findMany({ where, orderBy: { openedAt: "desc" }, take: ctx.rowLimit }),
      db.shift.count({ where }),
      db.$queryRaw<{ n: number; balanced: number; expected: number; counted: number; short: number; over: number }[]>`
        SELECT COUNT(*)::int AS n,
          COUNT(*) FILTER (WHERE "countedCashCents" = "expectedCashCents")::int AS balanced,
          COALESCE(SUM("expectedCashCents"), 0)::float8 AS expected,
          COALESCE(SUM("countedCashCents"), 0)::float8 AS counted,
          COALESCE(SUM("countedCashCents" - "expectedCashCents") FILTER (WHERE "countedCashCents" < "expectedCashCents"), 0)::float8 AS short,
          COALESCE(SUM("countedCashCents" - "expectedCashCents") FILTER (WHERE "countedCashCents" > "expectedCashCents"), 0)::float8 AS over
        FROM "Shift"
        WHERE "storeId" = ANY(${ctx.storeIds}::text[]) AND "openedAt" >= ${start} AND "openedAt" < ${end} AND "closedAt" IS NOT NULL`,
    ]);
    const ids = shifts.map((s) => s.id);
    const [cash, users] = await Promise.all([
      ids.length
        ? db.$queryRaw<{ shiftId: string; cash: number }[]>`
            SELECT s."shiftId", COALESCE(SUM(p."amountCents"), 0)::float8 AS cash
            FROM "Payment" p JOIN "Sale" s ON s.id = p."saleId"
            WHERE s."shiftId" = ANY(${ids}::text[]) AND p.method = 'CASH'
            GROUP BY 1`
        : Promise.resolve([]),
      userNames(shifts.flatMap((s) => [s.openedById, s.closedById])),
    ]);
    const cashBy = new Map(cash.map((c) => [c.shiftId, c.cash]));
    const rows: Row[] = shifts.map((s) => {
      const cashSales = cashBy.get(s.id) ?? 0;
      const expected = s.expectedCashCents ?? s.openingFloatCents + cashSales;
      const variance = s.closedAt && s.countedCashCents != null ? s.countedCashCents - expected : null;
      return {
        day: dayKey(s.openedAt), ...storeVals(ctx, s.storeId), opened: s.openedAt, closed: s.closedAt, by: users.get(s.closedById ?? s.openedById)?.name ?? "",
        float: s.openingFloatCents, cash: cashSales, expected, counted: s.countedCashCents, variance,
        status: !s.closedAt ? "Open" : variance === 0 ? "Balanced" : (variance ?? 0) < 0 ? "Short" : "Over", notes: s.notes ?? "",
      };
    });
    const c = closed[0] ?? { n: 0, balanced: 0, expected: 0, counted: 0, short: 0, over: 0 };
    const shortByStore = new Map<string, number>();
    for (const r of rows) if ((r.variance as number | null) != null && (r.variance as number) < 0) shortByStore.set(String(r.store ?? ""), (shortByStore.get(String(r.store ?? "")) ?? 0) - (r.variance as number));
    return {
      columns: [
        { key: "day", label: "Day", format: "day" },
        ...storeCols(ctx),
        { key: "opened", label: "Opened", format: "datetime" },
        { key: "closed", label: "Closed", format: "datetime" },
        { key: "by", label: "Cashed up by" },
        { key: "float", label: "Float", format: "zar" },
        { key: "cash", label: "Cash sales", format: "zar" },
        { key: "expected", label: "Expected", format: "zar" },
        { key: "counted", label: "Counted", format: "zar" },
        { key: "variance", label: "Variance", format: "zar" },
        { key: "status", label: "Status", format: "badge", tones: { Balanced: "green", Short: "red", Over: "amber", Open: "blue" } },
        { key: "notes", label: "Notes" },
      ],
      rows,
      totalRows: count,
      totals: { day: "Closed shifts", expected: c.expected, counted: c.counted, variance: c.counted - c.expected },
      summary: [
        { label: "Shifts closed", value: c.n, format: "number", sub: `${n(count - c.n)} still open` },
        { label: "Balanced", value: ratio(c.balanced, c.n), format: "pct", sub: `${n(c.balanced)} of ${n(c.n)} to the cent` },
        { label: "Total short", value: -c.short, format: "zar", upIsGood: false },
        { label: "Net variance", value: c.over + c.short, format: "zar", sub: `${zar(c.over)} over` },
      ],
      chart: multi(ctx) && shortByStore.size ? { kind: "bar", title: "Cash short by store", description: "Shifts listed below", format: "zar", rows: [...shortByStore].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value })) } : null,
      empty: "No shifts were opened in this period.",
      note: "Expected cash = opening float + cash taken on sales − cash refunded in the shift. A shortage should be explained in the shift notes.",
    };
  },
};

// ── Franchise statements (HQ) ───────────────────────────────────────────────
function monthOptions({ now }: { now: Date }): Option[] {
  const key = dayKey(now).slice(0, 7);
  const [y, m] = key.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const value = d.toISOString().slice(0, 7);
    return { value, label: `${fmtMonth(`${value}-15T12:00:00Z`)}${i === 0 ? " (to date)" : ""}` };
  });
}

export const statements: ReportDef = {
  key: "statements",
  title: "Franchise statements",
  description: "What does each franchisee owe HQ — or get paid — for the month?",
  group: "Finance",
  scopes: ["hq"],
  roles: ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER"],
  params: [{ key: "month", label: "Month", options: monthOptions, default: ({ options }) => options[1]?.value ?? options[0].value }],
  async run(ctx) {
    const month = ctx.params.month;
    const stores = [...ctx.stores.values()].filter((s) => s.kind === "RETAIL" && s.status !== "OPENING_SOON").sort((a, b) => a.name.localeCompare(b.name));
    const list = await mapLimit(stores, 6, (s) => franchiseStatement(s.id, month));
    const rows: Row[] = list.map((st) => {
      const i = st.input;
      return {
        store: st.store.name, code: st.store.code, company: ctx.stores.get(st.store.id)?.company ?? "", sales: i.netSalesExVatCents,
        online: i.onlineCollectedCents, redeemed: i.pointsRedeemedCents, netSold: i.networkSoldCents,
        royalty: st.royalty, levy: st.levy, ecom: st.ecom, feesVat: st.feesVat, issued: i.pointsIssuedCents, wholesale: i.wholesaleCents, netBought: i.networkBoughtCents,
        credits: st.credits, debits: st.debits, net: st.net, position: st.net >= 0 ? "HQ pays store" : "Store pays HQ",
        _href: `/store/${st.store.code}/statement?month=${month}`,
      };
    });
    const t = sumRows(rows, ["sales", "online", "redeemed", "netSold", "royalty", "levy", "ecom", "feesVat", "issued", "wholesale", "netBought", "credits", "debits", "net"], { store: "Total" });
    const due = rows.filter((r) => (r.net as number) < 0).reduce((s, r) => s - (r.net as number), 0);
    const pay = rows.filter((r) => (r.net as number) >= 0).reduce((s, r) => s + (r.net as number), 0);
    const current = month === dayKey(ctx.now).slice(0, 7);
    return {
      columns: [
        { key: "store", label: "Store" },
        { key: "code", label: "Code" },
        { key: "company", label: "Franchisee" },
        { key: "sales", label: "Net sales ex VAT", format: "zar" },
        { key: "online", label: "Online collected", format: "zar" },
        { key: "redeemed", label: "Points redeemed", format: "zar" },
        { key: "netSold", label: "Sold to network", format: "zar" },
        { key: "royalty", label: "Royalty", format: "zar" },
        { key: "levy", label: "Marketing levy", format: "zar" },
        { key: "ecom", label: "E-com commission", format: "zar" },
        { key: "feesVat", label: "VAT on fees", format: "zar" },
        { key: "issued", label: "Points issued", format: "zar" },
        { key: "wholesale", label: "Wholesale stock", format: "zar" },
        { key: "netBought", label: "Bought from network", format: "zar" },
        { key: "credits", label: "Credits", format: "zar" },
        { key: "debits", label: "Debits", format: "zar" },
        { key: "net", label: "Net", format: "zar" },
        { key: "position", label: "Settlement", format: "badge", tones: { "HQ pays store": "green", "Store pays HQ": "amber" } },
      ],
      rows,
      totals: t,
      summary: [
        { label: "Statements", value: rows.length, format: "number", sub: fmtMonth(`${month}-15T12:00:00Z`) },
        { label: "Due to HQ", value: due, format: "zar", sub: `${n(rows.filter((r) => (r.net as number) < 0).length)} stores` },
        { label: "HQ pays out", value: pay, format: "zar", sub: `${n(rows.filter((r) => (r.net as number) >= 0).length)} stores` },
        { label: "Fees billed ex VAT", value: (t.royalty as number) + (t.levy as number) + (t.ecom as number), format: "zar" },
      ],
      empty: "No trading stores in this selection.",
      note: `${current ? "This month is still open — figures will change until month end. " : ""}Credits: online sales collected by HQ, points redeemed in store and stock sold to other stores. Debits: royalty, marketing levy, e-commerce commission, VAT on those fees, points issued, wholesale stock and stock bought from other stores. Positive net = HQ pays the store.`,
    };
  },
};

// ── Rewards points liability ────────────────────────────────────────────────
export const loyaltyLiability: ReportDef = {
  key: "loyalty-liability",
  title: "Rewards liability",
  description: "Herbal Holland Rewards points issued vs redeemed by store, the settlement, and what we owe members.",
  group: "Finance",
  scopes: ["store", "hq"],
  filters: ["range"],
  roles: MANAGERS,
  async run(ctx) {
    const where = { storeId: { in: ctx.storeIds }, date: { gte: ctx.range.fromDate, lte: ctx.range.toDate } };
    const memberWhere = ctx.networkWide ? {} : { homeStoreId: { in: ctx.storeIds } };
    const { start, end } = bounds(ctx);
    const [byDay, byStore, outstanding, hq] = await Promise.all([
      db.dailyStoreStat.groupBy({ by: ["date"], where, _sum: { pointsIssued: true, loyaltyCents: true }, orderBy: { date: "asc" } }),
      db.dailyStoreStat.groupBy({ by: ["storeId"], where, _sum: STAT_SUMS }),
      db.customer.aggregate({ where: { ...memberWhere, points: { gt: 0 } }, _sum: { points: true }, _count: true }),
      ctx.networkWide
        ? db.loyaltyEntry.groupBy({ by: ["kind"], where: { storeId: null, kind: { in: ["SIGNUP", "BIRTHDAY", "REFERRAL", "BONUS", "ADJUST"] }, createdAt: { gte: start, lt: end } }, _sum: { points: true }, _count: true })
        : Promise.resolve([]),
    ]);
    const issued = byStore.reduce((s, x) => s + (x._sum.pointsIssued ?? 0), 0);
    const redeemed = byStore.reduce((s, x) => s + Math.round((x._sum.loyaltyCents ?? 0) / POINT_VALUE_CENTS), 0);
    const days = new Map(byDay.map((d) => [isoDay(d.date), { issued: d._sum.pointsIssued ?? 0, redeemed: Math.round((d._sum.loyaltyCents ?? 0) / POINT_VALUE_CENTS) }]));
    const series = eachDay(ctx.range).map((date) => ({ date, ...(days.get(date) ?? { issued: 0, redeemed: 0 }) }));
    const value = (p: number) => p * POINT_VALUE_CENTS;
    let rows: Row[];
    let columns;
    if (multi(ctx)) {
      rows = byStore
        .map((x) => {
          const i = x._sum.pointsIssued ?? 0, r = Math.round((x._sum.loyaltyCents ?? 0) / POINT_VALUE_CENTS);
          return { store: storeLabel(ctx, x.storeId), code: ctx.stores.get(x.storeId)?.code ?? "", issued: i, issuedValue: value(i), redeemed: r, redeemedValue: value(r), settlement: value(i - r), rate: ratio(r, i) };
        })
        .sort((a, b) => b.issued - a.issued);
      columns = [{ key: "store", label: "Store" }, { key: "code", label: "Code" }];
    } else {
      rows = series.map((d) => ({ date: d.date, issued: d.issued, issuedValue: value(d.issued), redeemed: d.redeemed, redeemedValue: value(d.redeemed), settlement: value(d.issued - d.redeemed), rate: ratio(d.redeemed, d.issued) }));
      columns = [{ key: "date", label: "Day", format: "day" as const }];
    }
    const hqRows = (hq as { kind: string; _sum: { points: number | null }; _count: number }[]).map((h) => ({ kind: KIND_LABEL[h.kind] ?? h.kind, n: h._count, points: h._sum.points ?? 0, value: value(h._sum.points ?? 0) })).sort((a, b) => b.points - a.points);
    return {
      columns: [
        ...columns,
        { key: "issued", label: "Points issued", format: "points" },
        { key: "issuedValue", label: "Issued value", format: "zar" },
        { key: "redeemed", label: "Points redeemed", format: "points" },
        { key: "redeemedValue", label: "Redeemed value", format: "zar" },
        { key: "settlement", label: "Settlement", format: "zar" },
        { key: "rate", label: "Redeemed ÷ issued", format: "pct" },
      ],
      rows,
      totals: { [multi(ctx) ? "store" : "date"]: "Total", issued, issuedValue: value(issued), redeemed, redeemedValue: value(redeemed), settlement: value(issued - redeemed), rate: ratio(redeemed, issued) },
      summary: [
        { label: "Outstanding liability", value: value(outstanding._sum.points ?? 0), format: "zar", sub: `${fmtPoints(outstanding._sum.points ?? 0)} held by ${n(outstanding._count)} members` },
        { label: "Issued in period", value: issued, format: "points", sub: zar(value(issued)) },
        { label: "Redeemed in period", value: redeemed, format: "points", sub: zar(value(redeemed)) },
        { label: "Net settlement", value: value(issued - redeemed), format: "zar", sub: issued - redeemed >= 0 ? "stores pay into the pool" : "pool reimburses stores" },
      ],
      chart: {
        kind: "area",
        title: "Points issued and redeemed",
        description: "Daily, 1 point = R1",
        format: "number",
        labels: series.map((d) => fmtDay(`${d.date}T12:00:00Z`)),
        series: [
          { name: "Issued", values: series.map((d) => d.issued) },
          { name: "Redeemed", values: series.map((d) => d.redeemed) },
        ],
      },
      extra: hqRows.length
        ? [{ title: "Issued by HQ (not charged to stores)", description: "Sign-up, birthday and other network bonuses", columns: [{ key: "kind", label: "Type" }, { key: "n", label: "Entries", format: "number" }, { key: "points", label: "Points", format: "points" }, { key: "value", label: "Value", format: "zar" }], rows: hqRows, totals: sumRows(hqRows, ["n", "points", "value"], { kind: "Total" }) }]
        : [],
      note: `1 point = R1. The issuing store funds the points it awards; the store where they're redeemed is reimbursed — both settle on the monthly franchise statement. Outstanding liability is every member's current balance${ctx.networkWide ? " across the network" : " for members whose home store is in this selection"}, as of today.`,
    };
  },
};
const KIND_LABEL: Record<string, string> = { SIGNUP: "Sign-up bonus", BIRTHDAY: "Birthday bonus", REFERRAL: "Referral bonus", BONUS: "Bonus", ADJUST: "Adjustment", REVERSAL: "Reversal", EXPIRE: "Expiry", EARN: "Earned", REDEEM: "Redeemed" };
