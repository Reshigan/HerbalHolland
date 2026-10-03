// Trade reports: sales to business accounts — the WHOLESALE channel: the trade portal's orders, fulfilled by a
// distribution centre or collected at a store, and trade sales rung up at a till to an account — by account, product
// and month, and the accounts' aged balances from HQ's trade ledger. Trade volume is a fraction of retail, so these
// read Sale and TradeLedgerEntry directly, always bounded by the report's stores and dates.
import type { Role } from "@/generated/prisma/client";
import { db, Prisma } from "../db";
import { sast } from "../sql";
import { AGE_BUCKETS, ageTradeLedger, sumAgedBalances } from "@/lib/trade-ageing";
import { delta, previousRange } from "@/lib/ranges";
import { fmtDate, fmtDateTime, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";
import type { Column, ReportCtx, ReportDef, ReportResult, Row } from "./types";
import { MANAGERS } from "./types";
import { bounds, count, multi, n, ratio, storeLabel, sumRows, variantMap } from "./util";

const TRADE_ROLES: Role[] = ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER"];
const KIND_LABEL: Record<string, string> = { PHARMACY: "Pharmacy", RETAILER: "Retailer", CAFE: "Café", PRACTICE: "Practice", ONLINE_SHOP: "Online shop", OTHER: "Other" };
const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", ON_HOLD: "On hold", CLOSED: "Closed" };
const termsLabel = (a: { terms: string; paymentDays: number }) => (a.terms === "ACCOUNT" ? `${a.paymentDays} days` : "Prepaid");
const NO_ACCOUNT = "No account on file";

type AccountInfo = { id: string; number: string; name: string; kind: string; status: string; terms: string; paymentDays: number; creditLimitCents: number; city: string; province: string };
async function accountMap(ids: string[]) {
  if (!ids.length) return new Map<string, AccountInfo>();
  const list = await db.tradeAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true, number: true, name: true, kind: true, status: true, terms: true, paymentDays: true, creditLimitCents: true, city: true, province: true },
  });
  return new Map<string, AccountInfo>(list.map((a) => [a.id, a]));
}

// ── Trade sales: by account, product and month ──────────────────────────────
async function tradeSales(ctx: ReportCtx): Promise<ReportResult> {
  const { start, end } = bounds(ctx);
  const prevR = previousRange(ctx.range);
  const rollup = (r: { fromDate: Date; toDate: Date }, channel?: "WHOLESALE") =>
    db.dailyStoreStat.aggregate({ where: { storeId: { in: ctx.storeIds }, date: { gte: r.fromDate, lte: r.toDate }, ...(channel && { channel }) }, _sum: { grossCents: true, vatCents: true } });
  const [byAccount, byProduct, byMonth, before, all] = await Promise.all([
    db.$queryRaw<{ accountId: string | null; orders: number; credits: number; units: number; ex: number; vat: number; incl: number; stores: number; last: Date }[]>`
      SELECT s."tradeAccountId" AS "accountId",
        COUNT(*) FILTER (WHERE s.kind = 'SALE')::int AS orders,
        COUNT(*) FILTER (WHERE s.kind = 'REFUND')::int AS credits,
        COALESCE(SUM(u.units), 0)::int AS units,
        COALESCE(SUM(s."totalCents" - s."vatCents"), 0)::float8 AS ex,
        COALESCE(SUM(s."vatCents"), 0)::float8 AS vat,
        COALESCE(SUM(s."totalCents"), 0)::float8 AS incl,
        COUNT(DISTINCT s."storeId")::int AS stores,
        MAX(s."createdAt") AS last
      FROM "Sale" s
      LEFT JOIN LATERAL (SELECT COALESCE(SUM(l.qty), 0)::int AS units FROM "SaleLine" l WHERE l."saleId" = s.id) u ON true
      WHERE s.channel = 'WHOLESALE' AND s."storeId" = ANY(${ctx.storeIds}::text[]) AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
      GROUP BY 1`,
    db.$queryRaw<{ variantId: string; units: number; ex: number; vat: number; incl: number; accounts: number }[]>`
      SELECT l."variantId", COALESCE(SUM(l.qty), 0)::int AS units,
        COALESCE(SUM(l."totalCents" - l."vatCents"), 0)::float8 AS ex, COALESCE(SUM(l."vatCents"), 0)::float8 AS vat, COALESCE(SUM(l."totalCents"), 0)::float8 AS incl,
        COUNT(DISTINCT s."tradeAccountId")::int AS accounts
      FROM "SaleLine" l JOIN "Sale" s ON s.id = l."saleId"
      WHERE s.channel = 'WHOLESALE' AND s."storeId" = ANY(${ctx.storeIds}::text[]) AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
      GROUP BY 1 ORDER BY 3 DESC LIMIT ${ctx.rowLimit}`,
    db.$queryRaw<{ month: string; orders: number; accounts: number; ex: number; vat: number; incl: number }[]>`
      SELECT to_char(${sast('"createdAt"')}, 'YYYY-MM') AS month,
        COUNT(*) FILTER (WHERE kind = 'SALE')::int AS orders, COUNT(DISTINCT "tradeAccountId")::int AS accounts,
        COALESCE(SUM("totalCents" - "vatCents"), 0)::float8 AS ex, COALESCE(SUM("vatCents"), 0)::float8 AS vat, COALESCE(SUM("totalCents"), 0)::float8 AS incl
      FROM "Sale"
      WHERE channel = 'WHOLESALE' AND "storeId" = ANY(${ctx.storeIds}::text[]) AND "createdAt" >= ${start} AND "createdAt" < ${end}
      GROUP BY 1 ORDER BY 1`,
    rollup(prevR, "WHOLESALE"),
    rollup(ctx.range),
  ]);
  const accounts = await accountMap(byAccount.flatMap((a) => (a.accountId ? [a.accountId] : [])));
  const totalEx = byAccount.reduce((s, a) => s + a.ex, 0);
  const rows: Row[] = byAccount
    .map((a) => {
      const acc = a.accountId ? accounts.get(a.accountId) : undefined;
      return {
        account: acc?.name ?? NO_ACCOUNT, number: acc?.number ?? "", kind: acc ? (KIND_LABEL[acc.kind] ?? acc.kind) : "", terms: acc ? termsLabel(acc) : "", city: acc?.city ?? "",
        orders: a.orders, credits: a.credits, units: a.units, ex: a.ex, vat: a.vat, incl: a.incl, avg: a.orders ? Math.round(a.ex / a.orders) : null, share: ratio(a.ex, totalEx),
        stores: a.stores, last: a.last,
      };
    })
    .sort((x, y) => (y.ex as number) - (x.ex as number));
  const t = sumRows(rows, ["orders", "credits", "units", "ex", "vat", "incl"], { account: "Total" });
  t.avg = (t.orders as number) ? Math.round((t.ex as number) / (t.orders as number)) : null;
  t.share = rows.length ? 1 : null;
  const prevNet = (before._sum.grossCents ?? 0) - (before._sum.vatCents ?? 0);
  const allNet = (all._sum.grossCents ?? 0) - (all._sum.vatCents ?? 0);
  const buying = rows.filter((r) => (r.orders as number) > 0).length;
  const info = await variantMap(byProduct.map((x) => x.variantId));
  const products: Row[] = byProduct.map((x) => {
    const v = info.get(x.variantId);
    return { product: v?.name ?? "Unknown item", sku: v?.sku ?? "", category: v?.category ?? "", units: x.units, unit: x.units ? Math.round(x.ex / x.units) : null, ex: x.ex, vat: x.vat, incl: x.incl, accounts: x.accounts, share: ratio(x.ex, totalEx) };
  });
  const months: Row[] = byMonth.map((m) => ({ month: fmtMonth(`${m.month}-15T12:00:00Z`), orders: m.orders, accounts: m.accounts, ex: m.ex, vat: m.vat, incl: m.incl, avg: m.orders ? Math.round(m.ex / m.orders) : null }));
  return {
    title: "By trade account",
    columns: [
      { key: "account", label: "Account" },
      { key: "number", label: "Number" },
      { key: "kind", label: "Type" },
      { key: "terms", label: "Terms", csvOnly: true },
      { key: "city", label: "City", csvOnly: true },
      { key: "orders", label: "Orders", format: "number" },
      { key: "credits", label: "Credit notes", format: "number", csvOnly: true },
      { key: "units", label: "Units", format: "number" },
      { key: "ex", label: "Ex VAT", format: "zar" },
      { key: "vat", label: "VAT", format: "zar" },
      { key: "incl", label: "Incl VAT", format: "zar" },
      { key: "avg", label: "Avg order ex VAT", format: "zar" },
      { key: "share", label: "Share", format: "pct" },
      ...(multi(ctx) ? [{ key: "stores", label: "Stores", format: "number" } as Column] : []),
      { key: "last", label: "Last order", format: "date", csvOnly: true },
    ],
    rows,
    totals: t,
    summary: [
      { label: "Trade sales (ex VAT)", value: t.ex as number, format: "zar", delta: delta(t.ex as number, prevNet) },
      { label: "Accounts buying", value: buying, format: "number" },
      { label: "Orders", value: t.orders as number, format: "number", sub: (t.credits as number) ? `${count(t.credits as number, "credit note")}` : undefined },
      { label: "Average order", value: t.avg as number | null, format: "zar", sub: "ex VAT" },
      { label: "Share of net sales", value: ratio(t.ex as number, allNet), format: "pct", sub: "all channels, ex VAT" },
    ],
    chart: rows.length ? { kind: "bar", title: "Top accounts", description: "Ex VAT · top 10", format: "zar", rows: rows.slice(0, 10).map((r) => ({ label: String(r.account), value: r.ex as number, sub: count(r.orders as number, "order"), tip: `${r.account} (${r.number || "no account"})\n${zar(r.ex as number)} ex VAT · ${n(r.units as number)} units` })) } : null,
    extra: [
      { title: "By product", description: "What trade accounts take", columns: [
        { key: "product", label: "Product" }, { key: "sku", label: "SKU" }, { key: "category", label: "Category" }, { key: "units", label: "Units", format: "number" },
        { key: "unit", label: "Avg unit ex VAT", format: "zar" }, { key: "ex", label: "Ex VAT", format: "zar" }, { key: "vat", label: "VAT", format: "zar" }, { key: "incl", label: "Incl VAT", format: "zar" },
        { key: "accounts", label: "Accounts", format: "number" }, { key: "share", label: "Share", format: "pct" },
      ], rows: products, totals: products.length ? sumRows(products, ["units", "ex", "vat", "incl"], { product: "Total" }) : null },
      { title: "By month", columns: [
        { key: "month", label: "Month" }, { key: "orders", label: "Orders", format: "number" }, { key: "accounts", label: "Accounts", format: "number" },
        { key: "ex", label: "Ex VAT", format: "zar" }, { key: "vat", label: "VAT", format: "zar" }, { key: "incl", label: "Incl VAT", format: "zar" }, { key: "avg", label: "Avg order ex VAT", format: "zar" },
      ], rows: months, totals: months.length ? sumRows(months, ["orders", "ex", "vat", "incl"], { month: "Total" }) : null },
    ],
    emptyTitle: "No trade sales",
    empty: "No sales to business accounts in this period.",
    note: `Trade sales are priced ex VAT with VAT added per line. They are the trade portal's orders — fulfilled by a distribution centre or collected at a store, with the store's handling fee — and trade sales rung up at a till to a business account. Refunds and credit notes are netted off. Royalty and levy apply at the standard rates; the e-commerce commission does not.${ctx.scope === "hq" ? " What the accounts still owe is in the Trade aged balances report." : ""}`,
  };
}

export const tradeSalesReport: ReportDef = {
  key: "trade-sales",
  title: "Trade sales",
  description: "Which business accounts buy, what they take and what it's worth — by account, product and month.",
  group: "Sales",
  scopes: ["hq"],
  filters: ["range"],
  roles: TRADE_ROLES,
  run: tradeSales,
};

export const tradeSalesAtStore: ReportDef = {
  key: "trade-sales-store",
  title: "Trade sales at this store",
  description: "Sales to business accounts rung up here or collected here — by account, product and month.",
  group: "Sales",
  scopes: ["store"],
  filters: ["range"],
  roles: MANAGERS,
  run: tradeSales,
};

// ── Aged balances (HQ's trade ledger) ───────────────────────────────────────
const AGED_COLUMNS: Column[] = [
  { key: "account", label: "Account" },
  { key: "number", label: "Number" },
  { key: "status", label: "Status", format: "badge", tones: { Approved: "green", "On hold": "red", Pending: "amber", Closed: "neutral" } },
  { key: "terms", label: "Terms" },
  { key: "limit", label: "Credit limit", format: "zar", csvOnly: true },
  ...AGE_BUCKETS.map((b): Column => ({ key: b.key, label: b.label, format: "zar" })),
  { key: "overdue", label: "Overdue", format: "zar" },
  { key: "total", label: "Balance", format: "zar" },
  { key: "oldest", label: "Oldest overdue", format: "date" },
  { key: "days", label: "Days overdue", format: "number" },
  { key: "items", label: "Open invoices", format: "number", csvOnly: true },
];

export const tradeAgedBalances: ReportDef = {
  key: "trade-aged-balances",
  title: "Trade aged balances",
  description: "What do trade accounts owe HQ, and how overdue is it? Current, 30, 60 and 90+ days per account, as of today.",
  group: "Finance",
  scopes: ["hq"],
  roles: TRADE_ROLES,
  async run(ctx) {
    // Network-wide: every account. Narrowed to a region or a store: the accounts that bought there, or are served by a DC there.
    const scoped: Prisma.TradeLedgerEntryWhereInput = ctx.networkWide
      ? {}
      : { account: { OR: [{ sales: { some: { storeId: { in: ctx.storeIds } } } }, { orders: { some: { storeId: { in: ctx.storeIds } } } }, { dcId: { in: ctx.storeIds } }] } };
    const balances = await db.tradeLedgerEntry.groupBy({ by: ["tradeAccountId"], where: scoped, _sum: { cents: true } });
    const ids = balances.filter((b) => (b._sum.cents ?? 0) !== 0).map((b) => b.tradeAccountId);
    const empty = { columns: AGED_COLUMNS, rows: [], emptyTitle: "Nothing outstanding", empty: "No trade account has a balance on the ledger." };
    if (!ids.length) return empty;
    const [entries, accounts] = await Promise.all([
      db.tradeLedgerEntry.findMany({ where: { tradeAccountId: { in: ids } }, select: { tradeAccountId: true, kind: true, cents: true, dueAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
      accountMap(ids),
    ]);
    const aged = ageTradeLedger(entries, ctx.now);
    const rows: Row[] = [...aged]
      .map(([id, b]) => {
        const a = accounts.get(id);
        return {
          account: a?.name ?? id, number: a?.number ?? "", status: a ? (STATUS_LABEL[a.status] ?? a.status) : "", terms: a ? termsLabel(a) : "", limit: a?.creditLimitCents ?? 0,
          current: b.current, d30: b.d30, d60: b.d60, d90plus: b.d90plus, overdue: b.overdue, total: b.total,
          oldest: b.oldestDue, days: b.daysOverdue || null, items: b.openItems,
        };
      })
      .sort((x, y) => (y.overdue as number) - (x.overdue as number) || (y.total as number) - (x.total as number));
    const t = sumAgedBalances(aged.values());
    const overdueAccounts = rows.filter((r) => (r.overdue as number) > 0).length;
    return {
      title: "By account",
      columns: AGED_COLUMNS,
      rows,
      totals: { account: "Total", current: t.current, d30: t.d30, d60: t.d60, d90plus: t.d90plus, overdue: t.overdue, total: t.total, items: t.openItems },
      summary: [
        { label: "Outstanding", value: t.total, format: "zar", sub: count(ids.length, "account") },
        { label: "Overdue", value: t.overdue, format: "zar", upIsGood: false, sub: overdueAccounts ? `${count(overdueAccounts, "account")} past due` : "nothing past due" },
        { label: "90+ days", value: t.d90plus, format: "zar", upIsGood: false, sub: "more than 60 days past due" },
        { label: "Oldest overdue", value: t.daysOverdue ? `${n(t.daysOverdue)} days` : "—", sub: t.oldestDue ? `due ${fmtDate(`${t.oldestDue}T12:00:00Z`)}` : undefined },
      ],
      chart: t.total > 0 ? { kind: "column", title: "Outstanding by age", description: "As of today, FIFO", format: "zar", data: AGE_BUCKETS.map((b) => ({ label: b.label, value: Math.max(0, t[b.key]), tip: `${b.label} · ${b.detail}\n${zar(t[b.key])}` })) } : null,
      note: `As of ${fmtDateTime(ctx.now)}. Payments and credit notes settle the oldest invoices first (FIFO by due date); what is still open is aged by days past its due date — 30 days = 1–30, 60 days = 31–60, 90+ = more than 60 days overdue. A negative current amount is a credit balance (an unapplied payment or credit note). Accounts with a zero balance are left out.${ctx.networkWide ? "" : ` Limited to accounts that bought at ${ctx.storeIds.length === 1 ? storeLabel(ctx, ctx.storeIds[0]) : "the selected stores"} or are served by a distribution centre there.`}`,
    };
  },
};
