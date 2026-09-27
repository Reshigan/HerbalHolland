// Inventory reports: batch-lot stock (valued at each lot's landed cost), the movement
// ledger, shrinkage, expiry, dead stock, sell-through, reorder and negative lots.
import { db, Prisma } from "../db";
import { availability, availKey } from "../inventory";
import { getSettings } from "../settings";
import { suggestQty, daysOfCover } from "@/lib/replenish";
import { addDays, dateOnly, dayKey } from "@/lib/format";
import { zar } from "@/lib/money";
import type { ParamDef, ReportCtx, ReportDef, Row } from "./types";
import { bounds, categoryVariantIds, multi, ratio, retailIds, storeCols, storeLabel, storeVals, sumRows, userNames, variantMap } from "./util";

const catSql = (ctx: ReportCtx, alias = "p") => (ctx.category ? Prisma.sql`AND ${Prisma.raw(alias)}."categoryId" = ${ctx.category.id}` : Prisma.empty);
const variantCatWhere = (ctx: ReportCtx) => (ctx.category ? { variant: { product: { categoryId: ctx.category.id } } } : {});

const groupParam = (extra: { value: string; label: string }[] = []): ParamDef => ({
  key: "by",
  label: "Group by",
  options: ({ multi }) => [...extra, { value: "category", label: "Category" }, ...(multi ? [{ value: "store", label: "Store" }] : []), { value: "product", label: "Product" }],
  default: ({ options }) => options[0].value,
});

export const MOVEMENT_LABEL: Record<string, string> = {
  RECEIVE: "Received", SALE: "Sale", ONLINE: "Online sale", REFUND: "Refund (restocked)", ADJUST: "Adjustment",
  COUNT: "Stock-take variance", TRANSFER_OUT: "Transfer out", TRANSFER_IN: "Transfer in",
};
export const REASON_LABEL: Record<string, string> = {
  DAMAGED: "Damaged", EXPIRED: "Expired (written off)", THEFT: "Theft", LOST: "Count variance — missing", FOUND: "Count variance — found",
  SAMPLE: "Samples & demo units", QUALITY: "Quality", RECALL: "Recall returns", DESTROYED: "Destroyed", CORRECTION: "Correction",
};

// ── Stock valuation ─────────────────────────────────────────────────────────
export const stockValuation: ReportDef = {
  key: "stock-valuation",
  title: "Stock valuation",
  description: "What is the stock on hand worth, at landed cost and at retail?",
  group: "Inventory",
  scopes: ["store", "hq"],
  filters: ["category"],
  params: [{ ...groupParam(), options: ({ multi }) => (multi ? [{ value: "store", label: "Store" }, { value: "category", label: "Category" }, { value: "product", label: "Product" }] : [{ value: "category", label: "Category" }, { value: "product", label: "Product" }]) }],
  async run(ctx) {
    const by = ctx.params.by;
    const key = Prisma.raw(by === "store" ? `sl."storeId"` : by === "product" ? `sl."variantId"` : `c.id`);
    const unsellable = Prisma.sql`(b.status <> 'RELEASED' OR b."expiresAt" <= ${ctx.now})`;
    const data = await db.$queryRaw<{ k: string; category: string; product: string; sku: string; skus: number; units: number; value: number; retail: number; blockedUnits: number; blockedValue: number; negLots: number }[]>`
      SELECT ${key} AS k, MIN(c.name) AS category, MIN(p.name || ' · ' || v.name) AS product, MIN(v.sku) AS sku,
        COUNT(DISTINCT sl."variantId") FILTER (WHERE sl."onHand" > 0)::int AS skus,
        COALESCE(SUM(sl."onHand") FILTER (WHERE sl."onHand" > 0), 0)::int AS units,
        COALESCE(SUM(sl."onHand"::float8 * sl."unitCostCents") FILTER (WHERE sl."onHand" > 0), 0)::float8 AS value,
        COALESCE(SUM(sl."onHand"::float8 * v."priceCents") FILTER (WHERE sl."onHand" > 0), 0)::float8 AS retail,
        COALESCE(SUM(sl."onHand") FILTER (WHERE sl."onHand" > 0 AND ${unsellable}), 0)::int AS "blockedUnits",
        COALESCE(SUM(sl."onHand"::float8 * sl."unitCostCents") FILTER (WHERE sl."onHand" > 0 AND ${unsellable}), 0)::float8 AS "blockedValue",
        COUNT(*) FILTER (WHERE sl."onHand" < 0)::int AS "negLots"
      FROM "StockLevel" sl
      JOIN "Variant" v ON v.id = sl."variantId"
      JOIN "Product" p ON p.id = v."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      JOIN "Batch" b ON b.id = sl."batchId"
      WHERE sl."storeId" = ANY(${ctx.storeIds}::text[]) ${catSql(ctx)}
      GROUP BY 1`;
    const list = data.filter((d) => d.units > 0).sort((a, b) => b.value - a.value);
    const total = list.reduce((s, d) => s + d.value, 0);
    const label = (d: (typeof data)[number]) => (by === "store" ? storeLabel(ctx, d.k) : by === "product" ? d.product : d.category);
    const rows: Row[] = list.map((d) => ({
      name: label(d), ...(by === "store" ? { code: ctx.stores.get(d.k)?.code ?? "", region: ctx.stores.get(d.k)?.region ?? "" } : by === "product" ? { sku: d.sku, category: d.category } : {}),
      skus: d.skus, units: d.units, value: d.value, avg: d.units ? Math.round(d.value / d.units) : null, retail: d.retail, share: ratio(d.value, total),
      blockedUnits: d.blockedUnits, blockedValue: d.blockedValue,
    }));
    const t = sumRows(rows, ["units", "value", "retail", "blockedUnits", "blockedValue"], { name: "Total" });
    t.share = rows.length ? 1 : null;
    const negLots = data.reduce((s, d) => s + d.negLots, 0);
    const first = by === "store" ? "Store" : by === "product" ? "Product" : "Category";
    return {
      columns: [
        { key: "name", label: first },
        ...(by === "store" ? [{ key: "code", label: "Code" }, { key: "region", label: "Region" }] : by === "product" ? [{ key: "sku", label: "SKU" }, { key: "category", label: "Category" }] : []),
        ...(by === "product" ? [] : [{ key: "skus", label: "SKUs", format: "number" as const }]),
        { key: "units", label: "Units on hand", format: "number" },
        { key: "value", label: "Value at cost", format: "zar" },
        { key: "avg", label: "Avg unit cost", format: "zar" },
        { key: "retail", label: "Retail value (RRP)", format: "zar" },
        { key: "share", label: "Share of value", format: "pct" },
        { key: "blockedUnits", label: "Unsellable units", format: "number" },
        { key: "blockedValue", label: "Unsellable value", format: "zar" },
      ],
      rows,
      totals: t,
      summary: [
        { label: "Stock value at cost", value: t.value as number, format: "zar", sub: "ex VAT" },
        { label: "Units on hand", value: t.units as number, format: "number" },
        { label: "Retail value", value: t.retail as number, format: "zar", sub: "at RRP incl VAT" },
        { label: "Unsellable", value: t.blockedValue as number, format: "zar", sub: "recalled, quarantined or expired", upIsGood: false },
      ],
      chart: rows.length > 1 ? { kind: "bar", title: `Stock value by ${first.toLowerCase()}`, description: "At landed cost, ex VAT · top 12", format: "zar", rows: rows.slice(0, 12).map((r) => ({ label: String(r.name), value: r.value as number, sub: `${(r.units as number).toLocaleString()} units` })) } : null,
      empty: "No stock on hand.",
      note: `Valued at each batch lot's landed cost (ex VAT) — the cost the stock was received at, so the value follows FIFO by lot.${negLots ? ` ${negLots} lot${negLots === 1 ? " has" : "s have"} negative stock and ${negLots === 1 ? "is" : "are"} left out — see the Negative stock report.` : ""}`,
    };
  },
};

// ── Movement ledger ─────────────────────────────────────────────────────────
export const stockMovements: ReportDef = {
  key: "stock-movements",
  title: "Stock movements",
  description: "Every unit in and out: receipts, sales, transfers, adjustments and counts.",
  group: "Inventory",
  scopes: ["store", "hq"],
  filters: ["range", "category"],
  defaultRange: "7d",
  params: [
    { key: "type", label: "Movement", options: [{ value: "", label: "All movements" }, ...Object.entries(MOVEMENT_LABEL).map(([value, label]) => ({ value, label }))], default: "" },
    { key: "reason", label: "Reason", options: [{ value: "", label: "Any reason" }, ...Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label }))], default: "" },
  ],
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const vids = await categoryVariantIds(ctx);
    const type = ctx.params.type || undefined;
    const reason = ctx.params.reason || undefined;
    const where: Prisma.StockMovementWhereInput = {
      storeId: { in: ctx.storeIds }, createdAt: { gte: start, lt: end },
      ...(type && { type: type as Prisma.StockMovementWhereInput["type"] }), ...(reason && { reason: reason as Prisma.StockMovementWhereInput["reason"] }),
      ...(vids && { variantId: { in: vids } }),
    };
    const extraSql = Prisma.sql`${type ? Prisma.sql`AND type::text = ${type}` : Prisma.empty} ${reason ? Prisma.sql`AND reason::text = ${reason}` : Prisma.empty} ${vids ? Prisma.sql`AND "variantId" = ANY(${vids}::text[])` : Prisma.empty}`;
    const [list, count, byType] = await Promise.all([
      db.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: ctx.rowLimit,
        include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } }, batch: { select: { code: true } } },
      }),
      db.stockMovement.count({ where }),
      db.$queryRaw<{ type: string; n: number; units_in: number; units_out: number; value: number }[]>`
        SELECT type::text AS type, COUNT(*)::int AS n,
          COALESCE(SUM(qty) FILTER (WHERE qty > 0), 0)::int AS units_in,
          COALESCE(-SUM(qty) FILTER (WHERE qty < 0), 0)::int AS units_out,
          COALESCE(SUM(qty::float8 * "unitCostCents"), 0)::float8 AS value
        FROM "StockMovement"
        WHERE "storeId" = ANY(${ctx.storeIds}::text[]) AND "createdAt" >= ${start} AND "createdAt" < ${end} ${extraSql}
        GROUP BY 1 ORDER BY 2 DESC`,
    ]);
    const [users, salesRef, orderRef, takeRef] = await Promise.all([
      userNames(list.map((m) => m.userId)),
      db.sale.findMany({ where: { id: { in: [...new Set(list.map((m) => m.saleId).filter((x): x is string => !!x))] } }, select: { id: true, number: true } }),
      db.stockOrder.findMany({ where: { id: { in: [...new Set(list.map((m) => m.stockOrderId).filter((x): x is string => !!x))] } }, select: { id: true, number: true } }),
      db.stockTake.findMany({ where: { id: { in: [...new Set(list.map((m) => m.stockTakeId).filter((x): x is string => !!x))] } }, select: { id: true, number: true } }),
    ]);
    const ref = new Map([...salesRef, ...orderRef, ...takeRef].map((x) => [x.id, x.number]));
    const rows: Row[] = list.map((m) => ({
      at: m.createdAt, ...storeVals(ctx, m.storeId), type: MOVEMENT_LABEL[m.type] ?? m.type, reason: m.reason ? REASON_LABEL[m.reason] ?? m.reason : "",
      product: `${m.variant.product.name} · ${m.variant.name}`, sku: m.variant.sku, batch: m.batch.code, qty: m.qty, cost: m.unitCostCents, value: m.qty * m.unitCostCents,
      user: m.userId ? users.get(m.userId)?.name ?? "" : "", ref: (m.saleId && ref.get(m.saleId)) || (m.stockOrderId && ref.get(m.stockOrderId)) || (m.stockTakeId && ref.get(m.stockTakeId)) || "", note: m.note ?? "",
    }));
    const unitsIn = byType.reduce((s, t) => s + t.units_in, 0), unitsOut = byType.reduce((s, t) => s + t.units_out, 0);
    const value = byType.reduce((s, t) => s + t.value, 0);
    return {
      columns: [
        { key: "at", label: "When", format: "datetime" },
        ...storeCols(ctx),
        { key: "type", label: "Movement" },
        { key: "reason", label: "Reason" },
        { key: "product", label: "Product" },
        { key: "sku", label: "SKU" },
        { key: "batch", label: "Batch" },
        { key: "qty", label: "Qty", format: "number" },
        { key: "cost", label: "Unit cost", format: "zar" },
        { key: "value", label: "Value at cost", format: "zar" },
        { key: "user", label: "By" },
        { key: "ref", label: "Reference" },
        { key: "note", label: "Note" },
      ],
      rows,
      totalRows: count,
      totals: { at: "Total", qty: unitsIn - unitsOut, value },
      summary: [
        { label: "Movements", value: count, format: "number" },
        { label: "Units in", value: unitsIn, format: "number" },
        { label: "Units out", value: unitsOut, format: "number" },
        { label: "Net change at cost", value, format: "zar" },
      ],
      extra: [
        {
          title: "Summary by movement type",
          position: "before",
          columns: [
            { key: "type", label: "Movement" },
            { key: "n", label: "Movements", format: "number" },
            { key: "units_in", label: "Units in", format: "number" },
            { key: "units_out", label: "Units out", format: "number" },
            { key: "net", label: "Net units", format: "number" },
            { key: "value", label: "Value at cost", format: "zar" },
          ],
          rows: byType.map((t) => ({ ...t, type: MOVEMENT_LABEL[t.type] ?? t.type, net: t.units_in - t.units_out })),
          totals: { type: "Total", n: count, units_in: unitsIn, units_out: unitsOut, net: unitsIn - unitsOut, value },
        },
      ],
      empty: "No stock movements match these filters.",
      note: "Quantities are signed: positive into stock, negative out. Values use the unit cost recorded on each movement (ex VAT).",
    };
  },
};

// ── Shrinkage ───────────────────────────────────────────────────────────────
export const shrinkage: ReportDef = {
  key: "shrinkage",
  title: "Shrinkage",
  description: "What are we losing — damage, theft, expiry and count variances — and what does it cost?",
  group: "Inventory",
  scopes: ["store", "hq"],
  filters: ["range", "category"],
  params: [groupParam([{ value: "reason", label: "Reason" }])],
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const by = ctx.params.by;
    const key = Prisma.raw(by === "store" ? `m."storeId"` : by === "product" ? `m."variantId"` : by === "category" ? `c.id` : `COALESCE(m.reason::text, 'CORRECTION')`);
    const [data, sales] = await Promise.all([
      db.$queryRaw<{ k: string; category: string; product: string; sku: string; events: number; lost: number; found: number; lostValue: number; foundValue: number }[]>`
        SELECT ${key} AS k, MIN(c.name) AS category, MIN(p.name || ' · ' || v.name) AS product, MIN(v.sku) AS sku,
          COUNT(*)::int AS events,
          COALESCE(SUM(-m.qty) FILTER (WHERE m.qty < 0), 0)::int AS lost,
          COALESCE(SUM(m.qty) FILTER (WHERE m.qty > 0), 0)::int AS found,
          COALESCE(SUM(-m.qty::float8 * m."unitCostCents") FILTER (WHERE m.qty < 0), 0)::float8 AS "lostValue",
          COALESCE(SUM(m.qty::float8 * m."unitCostCents") FILTER (WHERE m.qty > 0), 0)::float8 AS "foundValue"
        FROM "StockMovement" m
        JOIN "Variant" v ON v.id = m."variantId" JOIN "Product" p ON p.id = v."productId" JOIN "Category" c ON c.id = p."categoryId"
        WHERE m."storeId" = ANY(${ctx.storeIds}::text[]) AND m."createdAt" >= ${start} AND m."createdAt" < ${end}
          AND m.type IN ('ADJUST', 'COUNT') ${catSql(ctx)}
        GROUP BY 1`,
      db.dailyStoreStat.aggregate({ where: { storeId: { in: ctx.storeIds }, date: { gte: ctx.range.fromDate, lte: ctx.range.toDate } }, _sum: { grossCents: true, vatCents: true } }),
    ]);
    const netSales = (sales._sum.grossCents ?? 0) - (sales._sum.vatCents ?? 0);
    const label = (d: (typeof data)[number]) => (by === "store" ? storeLabel(ctx, d.k) : by === "product" ? d.product : by === "category" ? d.category : REASON_LABEL[d.k] ?? d.k);
    const list = data.map((d) => ({ d, net: d.lostValue - d.foundValue })).sort((a, b) => b.net - a.net);
    const rows: Row[] = list.map(({ d, net }) => ({
      name: label(d), ...(by === "product" ? { sku: d.sku } : by === "store" ? { code: ctx.stores.get(d.k)?.code ?? "" } : {}),
      events: d.events, lost: d.lost, found: d.found, net: d.lost - d.found, lostValue: d.lostValue, foundValue: d.foundValue, value: net, pctSales: ratio(net, netSales),
    }));
    const t = sumRows(rows, ["events", "lost", "found", "net", "lostValue", "foundValue", "value"], { name: "Total" });
    t.pctSales = ratio(t.value as number, netSales);
    const first = { store: "Store", product: "Product", category: "Category", reason: "Reason" }[by] ?? "Reason";
    const top = rows.find((r) => (r.value as number) > 0);
    return {
      columns: [
        { key: "name", label: first },
        ...(by === "product" ? [{ key: "sku", label: "SKU" }] : by === "store" ? [{ key: "code", label: "Code" }] : []),
        { key: "events", label: "Entries", format: "number" },
        { key: "lost", label: "Units lost", format: "number" },
        { key: "found", label: "Units found", format: "number" },
        { key: "net", label: "Net units", format: "number" },
        { key: "lostValue", label: "Lost at cost", format: "zar" },
        { key: "foundValue", label: "Found at cost", format: "zar" },
        { key: "value", label: "Net shrinkage", format: "zar" },
        { key: "pctSales", label: "% of net sales", format: "pct" },
      ],
      rows,
      totals: t,
      summary: [
        { label: "Net shrinkage at cost", value: t.value as number, format: "zar", upIsGood: false },
        { label: "Shrinkage rate", value: t.pctSales as number | null, format: "pct", sub: `of ${zar(netSales)} net sales` },
        { label: "Units lost", value: t.lost as number, format: "number", sub: `${t.found} found again` },
        { label: `Biggest ${first.toLowerCase()}`, value: top ? String(top.name) : "—", sub: top ? zar(top.value as number) : undefined },
      ],
      chart: rows.some((r) => (r.value as number) > 0) ? { kind: "bar", title: `Net shrinkage by ${first.toLowerCase()}`, description: "At cost, ex VAT", format: "zar", rows: rows.filter((r) => (r.value as number) > 0).slice(0, 10).map((r) => ({ label: String(r.name), value: r.value as number, sub: `${r.net} units` })) } : null,
      empty: "No adjustments or count variances in this period.",
      note: "Includes manual adjustments (with their reason codes) and approved stock-take variances. Units found in a count offset losses. The rate is net shrinkage at cost divided by net sales ex VAT.",
    };
  },
};

// ── Expiry ──────────────────────────────────────────────────────────────────
const BUCKETS = [
  { key: "expired", label: "Expired", tone: "red" },
  { key: "d7", label: "Within 7 days", tone: "red" },
  { key: "d30", label: "8–30 days", tone: "amber" },
  { key: "d60", label: "31–60 days", tone: "blue" },
  { key: "d90", label: "61–90 days", tone: "neutral" },
] as const;
const bucketOf = (days: number) => (days <= 0 ? BUCKETS[0] : days <= 7 ? BUCKETS[1] : days <= 30 ? BUCKETS[2] : days <= 60 ? BUCKETS[3] : BUCKETS[4]);

export const expiry: ReportDef = {
  key: "expiry",
  title: "Expiry",
  description: "What stock is about to expire, or already has, and what is it worth?",
  group: "Inventory",
  scopes: ["store", "hq"],
  filters: ["category"],
  params: [{ key: "days", label: "Window", options: [{ value: "30", label: "Next 30 days" }, { value: "60", label: "Next 60 days" }, { value: "90", label: "Next 90 days" }], default: "30" }],
  async run(ctx) {
    const days = Number(ctx.params.days) || 30;
    const until = addDays(ctx.now, days);
    const where: Prisma.StockLevelWhereInput = { storeId: { in: ctx.storeIds }, onHand: { gt: 0 }, batch: { expiresAt: { lte: until } }, ...variantCatWhere(ctx) };
    const [lots, count, settings] = await Promise.all([
      db.stockLevel.findMany({
        where,
        orderBy: [{ batch: { expiresAt: "asc" } }, { onHand: "desc" }],
        take: ctx.rowLimit,
        include: { batch: { select: { code: true, expiresAt: true, status: true } }, variant: { select: { sku: true, name: true, priceCents: true, product: { select: { name: true, category: { select: { name: true } } } } } } },
      }),
      db.stockLevel.count({ where }),
      getSettings(),
    ]);
    const buckets = await db.$queryRaw<{ days: number; units: number; value: number; retail: number; lots: number }[]>`
      SELECT CEIL(EXTRACT(EPOCH FROM (b."expiresAt" - ${ctx.now}::timestamp)) / 86400)::int AS days,
        SUM(sl."onHand")::int AS units, SUM(sl."onHand"::float8 * sl."unitCostCents")::float8 AS value,
        SUM(sl."onHand"::float8 * v."priceCents")::float8 AS retail, COUNT(*)::int AS lots
      FROM "StockLevel" sl JOIN "Batch" b ON b.id = sl."batchId" JOIN "Variant" v ON v.id = sl."variantId" JOIN "Product" p ON p.id = v."productId"
      WHERE sl."storeId" = ANY(${ctx.storeIds}::text[]) AND sl."onHand" > 0 AND b."expiresAt" <= ${until} ${catSql(ctx)}
      GROUP BY 1`;
    const agg = new Map<string, { units: number; value: number; retail: number; lots: number }>();
    for (const b of buckets) {
      const k = bucketOf(b.days).key;
      const a = agg.get(k) ?? { units: 0, value: 0, retail: 0, lots: 0 };
      a.units += b.units; a.value += b.value; a.retail += b.retail; a.lots += b.lots;
      agg.set(k, a);
    }
    const sum = (keys: string[], f: "units" | "value" | "retail" | "lots") => keys.reduce((s, k) => s + (agg.get(k)?.[f] ?? 0), 0);
    const all = BUCKETS.map((b) => b.key);
    const rows: Row[] = lots.map((l) => {
      const left = Math.ceil((l.batch.expiresAt!.getTime() - ctx.now.getTime()) / 86_400_000);
      return {
        ...storeVals(ctx, l.storeId), product: `${l.variant.product.name} · ${l.variant.name}`, sku: l.variant.sku, category: l.variant.product.category.name, batch: l.batch.code,
        expires: l.batch.expiresAt, left, status: bucketOf(left).label, onHand: l.onHand, value: l.onHand * l.unitCostCents, retail: l.onHand * l.variant.priceCents,
      };
    });
    const { markdownDays, markdownPct } = settings.pricing;
    return {
      columns: [
        ...storeCols(ctx),
        { key: "product", label: "Product" },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        { key: "batch", label: "Batch" },
        { key: "expires", label: "Expires", format: "date" },
        { key: "left", label: "Days left", format: "number" },
        { key: "status", label: "Status", format: "badge", tones: Object.fromEntries(BUCKETS.map((b) => [b.label, b.tone])) },
        { key: "onHand", label: "On hand", format: "number" },
        { key: "value", label: "Value at cost", format: "zar" },
        { key: "retail", label: "Retail value (RRP)", format: "zar" },
      ],
      rows,
      totalRows: count,
      totals: { store: multi(ctx) ? "Total" : undefined, product: multi(ctx) ? undefined : "Total", onHand: sum(all, "units"), value: sum(all, "value"), retail: sum(all, "retail") },
      summary: [
        { label: "Expired, still on hand", value: sum(["expired"], "value"), format: "zar", sub: `${sum(["expired"], "units")} units to write off`, upIsGood: false },
        { label: "Expiring within 7 days", value: sum(["d7"], "value"), format: "zar", sub: `${sum(["d7"], "units")} units` },
        { label: `Expiring within ${days} days`, value: sum(all.slice(1), "value"), format: "zar", sub: `${sum(all.slice(1), "units")} units in ${sum(all.slice(1), "lots")} lots` },
        { label: "Retail value at risk", value: sum(all, "retail"), format: "zar", sub: "at RRP incl VAT" },
      ],
      chart: count
        ? { kind: "column", title: "Stock value by time to expiry", description: "At cost, ex VAT", format: "zar", data: BUCKETS.filter((b) => b.key === "expired" || b.key === "d7" || Number(b.key.slice(1)) <= days).map((b) => ({ label: b.label, value: agg.get(b.key)?.value ?? 0, tip: `${b.label}\n${zar(agg.get(b.key)?.value ?? 0)} · ${agg.get(b.key)?.units ?? 0} units` })) }
        : null,
      empty: `Nothing expires in the next ${days} days.`,
      note: `Expired stock can't be sold (the till blocks it) — write it off as an EXPIRED adjustment. Stock within ${markdownDays} days of expiry is marked down ${markdownPct}% at the till.`,
    };
  },
};

// ── Dead stock ──────────────────────────────────────────────────────────────
export const deadStock: ReportDef = {
  key: "dead-stock",
  title: "Dead stock",
  description: "What is sitting on the shelf without selling?",
  group: "Inventory",
  scopes: ["store", "hq"],
  filters: ["category"],
  params: [{ key: "days", label: "No sales for", options: [{ value: "30", label: "30 days" }, { value: "60", label: "60 days" }, { value: "90", label: "90 days" }], default: "60" }],
  async run(ctx) {
    const days = Number(ctx.params.days) || 60;
    const ids = retailIds(ctx);
    const since = dateOnly(addDays(ctx.now, -(days - 1)));
    const yearAgo = dateOnly(addDays(ctx.now, -365));
    const [data, stock] = await Promise.all([
      db.$queryRaw<{ storeId: string; variantId: string; units: number; value: number; lastSold: Date | null; lastIn: Date | null }[]>`
        WITH oh AS (
          SELECT sl."storeId", sl."variantId", SUM(sl."onHand")::int AS units, SUM(sl."onHand"::float8 * sl."unitCostCents")::float8 AS value
          FROM "StockLevel" sl JOIN "Batch" b ON b.id = sl."batchId" JOIN "Variant" v ON v.id = sl."variantId" JOIN "Product" p ON p.id = v."productId"
          WHERE sl."storeId" = ANY(${ids}::text[]) AND sl."onHand" > 0 AND b.status = 'RELEASED' ${catSql(ctx)}
          GROUP BY 1, 2
        ), sold AS (
          SELECT "storeId", "variantId", MAX(date) AS "lastSold", SUM(units) FILTER (WHERE date >= ${since}) AS recent
          FROM "DailyVariantStat" WHERE "storeId" = ANY(${ids}::text[]) AND date >= ${yearAgo} AND units > 0
          GROUP BY 1, 2
        ), recv AS (
          SELECT "storeId", "variantId", MAX("createdAt") AS "lastIn" FROM "StockMovement"
          WHERE "storeId" = ANY(${ids}::text[]) AND "createdAt" >= ${yearAgo} AND qty > 0 AND type IN ('RECEIVE', 'TRANSFER_IN')
          GROUP BY 1, 2
        )
        SELECT oh."storeId", oh."variantId", oh.units, oh.value, sold."lastSold", recv."lastIn"
        FROM oh LEFT JOIN sold ON sold."storeId" = oh."storeId" AND sold."variantId" = oh."variantId"
        LEFT JOIN recv ON recv."storeId" = oh."storeId" AND recv."variantId" = oh."variantId"
        WHERE COALESCE(sold.recent, 0) = 0
        ORDER BY oh.value DESC`,
      db.$queryRaw<{ value: number }[]>`
        SELECT COALESCE(SUM(sl."onHand"::float8 * sl."unitCostCents"), 0)::float8 AS value
        FROM "StockLevel" sl JOIN "Batch" b ON b.id = sl."batchId"
        WHERE sl."storeId" = ANY(${ids}::text[]) AND sl."onHand" > 0 AND b.status = 'RELEASED'`,
    ]);
    const info = await variantMap([...new Set(data.map((d) => d.variantId))]);
    const today = dayKey(ctx.now);
    const rows: Row[] = data.slice(0, ctx.rowLimit).map((d) => {
      const v = info.get(d.variantId);
      return {
        ...storeVals(ctx, d.storeId), product: v?.name ?? "", sku: v?.sku ?? "", category: v?.category ?? "", onHand: d.units, value: d.value,
        lastSold: d.lastSold ? d.lastSold.toISOString().slice(0, 10) : null,
        since: d.lastSold ? Math.round((Date.parse(`${today}T00:00:00Z`) - d.lastSold.getTime()) / 86_400_000) : null,
        lastIn: d.lastIn,
      };
    });
    const units = data.reduce((s, d) => s + d.units, 0), value = data.reduce((s, d) => s + d.value, 0);
    const byCat = new Map<string, number>();
    for (const d of data) byCat.set(info.get(d.variantId)?.category ?? "Other", (byCat.get(info.get(d.variantId)?.category ?? "Other") ?? 0) + d.value);
    return {
      columns: [
        ...storeCols(ctx),
        { key: "product", label: "Product" },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        { key: "onHand", label: "On hand", format: "number" },
        { key: "value", label: "Value at cost", format: "zar" },
        { key: "lastSold", label: "Last sold", format: "date" },
        { key: "since", label: "Days since sale", format: "number" },
        { key: "lastIn", label: "Last received", format: "date" },
      ],
      rows,
      totalRows: data.length,
      totals: { [multi(ctx) ? "store" : "product"]: "Total", onHand: units, value },
      summary: [
        { label: "Dead stock at cost", value, format: "zar", upIsGood: false },
        { label: "Share of stock value", value: ratio(value, stock[0]?.value ?? 0), format: "pct" },
        { label: "Lines", value: data.length, format: "number", sub: `${units.toLocaleString()} units` },
      ],
      chart: byCat.size ? { kind: "bar", title: "Dead stock by category", description: "At cost, ex VAT", format: "zar", rows: [...byCat].sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, value: v })) } : null,
      empty: `Everything on hand has sold in the last ${days} days.`,
      note: `Sellable stock on hand with no sales in the last ${days} days. "Last sold" looks back 12 months. Consider a network listing, a transfer or a promotion before it ages further.`,
    };
  },
};

// ── Sell-through ────────────────────────────────────────────────────────────
export const sellThrough: ReportDef = {
  key: "sell-through",
  title: "Sell-through",
  description: "How fast is each product turning, and how many days of stock are left?",
  group: "Inventory",
  scopes: ["store", "hq"],
  filters: ["range", "category"],
  async run(ctx) {
    const ids = retailIds(ctx);
    const vids = await categoryVariantIds(ctx);
    const vf = vids ? { variantId: { in: vids } } : {};
    const { start, end } = bounds(ctx);
    const [sold, onHand, received] = await Promise.all([
      db.dailyVariantStat.groupBy({ by: ["variantId"], where: { storeId: { in: ids }, date: { gte: ctx.range.fromDate, lte: ctx.range.toDate }, ...vf }, _sum: { units: true } }),
      db.stockLevel.groupBy({ by: ["variantId"], where: { storeId: { in: ids }, onHand: { gt: 0 }, batch: { status: "RELEASED" }, ...vf }, _sum: { onHand: true } }),
      db.stockMovement.groupBy({ by: ["variantId"], where: { storeId: { in: ids }, createdAt: { gte: start, lt: end }, type: { in: ["RECEIVE", "TRANSFER_IN"] }, qty: { gt: 0 }, ...vf }, _sum: { qty: true } }),
    ]);
    const s = new Map(sold.map((x) => [x.variantId, x._sum.units ?? 0]));
    const o = new Map(onHand.map((x) => [x.variantId, x._sum.onHand ?? 0]));
    const r = new Map(received.map((x) => [x.variantId, x._sum.qty ?? 0]));
    const vset = [...new Set([...s.keys(), ...o.keys()])];
    const info = await variantMap(vset);
    const d = ctx.range.days;
    const list = vset.map((id) => {
      const units = Math.max(0, s.get(id) ?? 0), stock = o.get(id) ?? 0, perDay = units / d;
      const cover = daysOfCover(stock, perDay);
      return { v: info.get(id), received: r.get(id) ?? 0, units, stock, st: ratio(units, units + stock), perDay, cover: Number.isFinite(cover) ? cover : null };
    });
    list.sort((a, b) => (b.st ?? 0) - (a.st ?? 0));
    const rows: Row[] = list.map((x) => ({
      product: x.v?.name ?? "", sku: x.v?.sku ?? "", category: x.v?.category ?? "", received: x.received, sold: x.units, onHand: x.stock, st: x.st,
      perDay: Math.round(x.perDay * 100) / 100, cover: x.cover == null ? null : Math.round(x.cover),
    }));
    const tSold = list.reduce((a, x) => a + x.units, 0), tStock = list.reduce((a, x) => a + x.stock, 0);
    const byCat = new Map<string, { sold: number; stock: number }>();
    for (const x of list) {
      const k = x.v?.category ?? "Other";
      const c = byCat.get(k) ?? { sold: 0, stock: 0 };
      c.sold += x.units; c.stock += x.stock;
      byCat.set(k, c);
    }
    const tCover = tSold ? tStock / (tSold / d) : null;
    return {
      columns: [
        { key: "product", label: "Product" },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        { key: "received", label: "Received", format: "number" },
        { key: "sold", label: "Sold", format: "number" },
        { key: "onHand", label: "On hand now", format: "number" },
        { key: "st", label: "Sell-through", format: "pct" },
        { key: "perDay", label: "Sold / day", format: "number" },
        { key: "cover", label: "Days of cover", format: "number" },
      ],
      rows,
      totals: { product: "Total", received: list.reduce((a, x) => a + x.received, 0), sold: tSold, onHand: tStock, st: ratio(tSold, tSold + tStock), perDay: Math.round((tSold / d) * 100) / 100, cover: tCover == null ? null : Math.round(tCover) },
      summary: [
        { label: "Sell-through", value: ratio(tSold, tSold + tStock), format: "pct", sub: "sold ÷ (sold + on hand)" },
        { label: "Units sold", value: tSold, format: "number" },
        { label: "Units on hand", value: tStock, format: "number" },
        { label: "Days of cover", value: tCover == null ? null : Math.round(tCover), format: "number", sub: "at this period's pace" },
      ],
      chart: byCat.size > 1 ? { kind: "bar", title: "Sell-through by category", description: `Sold ÷ (sold + on hand) over ${d} days`, format: "pct", rows: [...byCat].map(([label, c]) => ({ label, value: ratio(c.sold, c.sold + c.stock) ?? 0, sub: `${c.sold} sold` })).sort((a, b) => b.value - a.value) } : null,
      empty: "No stock or sales for these filters.",
      note: "Sell-through = units sold in the period ÷ (units sold + sellable units on hand now). Days of cover = on hand ÷ average daily sales in the period. Distribution centres are excluded.",
    };
  },
};

// ── Low stock / reorder ─────────────────────────────────────────────────────
export const lowStock: ReportDef = {
  key: "low-stock",
  title: "Low stock",
  description: "What is at or below its reorder point, and how much should we order?",
  group: "Inventory",
  scopes: ["store", "hq"],
  filters: ["category"],
  async run(ctx) {
    const ids = retailIds(ctx);
    const since = dateOnly(addDays(ctx.now, -28));
    const [ranged, sold, onOrderRows, avail] = await Promise.all([
      db.storeVariant.findMany({
        where: { storeId: { in: ids }, variant: { active: true, product: { status: "ACTIVE", ...(ctx.category && { categoryId: ctx.category.id }) } } },
        select: { storeId: true, variantId: true, reorderPoint: true, parLevel: true },
      }),
      db.dailyVariantStat.groupBy({ by: ["storeId", "variantId"], where: { storeId: { in: ids }, date: { gte: since } }, _sum: { units: true } }),
      db.$queryRaw<{ storeId: string; variantId: string; qty: number }[]>`
        SELECT o."buyerId" AS "storeId", l."variantId", SUM(l.qty)::int AS qty
        FROM "StockOrderLine" l JOIN "StockOrder" o ON o.id = l."stockOrderId"
        WHERE o."buyerId" = ANY(${ids}::text[]) AND o.status IN ('SUBMITTED', 'APPROVED', 'SHIPPED')
        GROUP BY 1, 2`,
      availability(ids),
    ]);
    const soldBy = new Map(sold.map((x) => [availKey(x.storeId, x.variantId), x._sum.units ?? 0]));
    const onOrder = new Map(onOrderRows.map((x) => [availKey(x.storeId, x.variantId), x.qty]));
    const low = ranged
      .map((r) => {
        const k = availKey(r.storeId, r.variantId);
        const available = avail.get(k)?.available ?? 0;
        const avgDaily = Math.max(0, soldBy.get(k) ?? 0) / 28;
        const oo = onOrder.get(k) ?? 0;
        const cover = daysOfCover(available, avgDaily);
        return { ...r, available, oo, avgDaily, cover: Number.isFinite(cover) ? Math.max(0, cover) : null, suggested: suggestQty({ available, onOrder: oo, reorderPoint: r.reorderPoint, parLevel: r.parLevel, avgDaily }) };
      })
      .filter((r) => r.available <= r.reorderPoint)
      .sort((a, b) => a.available - b.available || (a.cover ?? 1e9) - (b.cover ?? 1e9) || b.suggested - a.suggested);
    const info = await variantMap([...new Set(low.map((r) => r.variantId))]);
    const rows: Row[] = low.slice(0, ctx.rowLimit).map((r) => {
      const v = info.get(r.variantId);
      return {
        ...storeVals(ctx, r.storeId), product: v?.name ?? "", sku: v?.sku ?? "", category: v?.category ?? "",
        status: r.available <= 0 ? "Out of stock" : r.suggested === 0 && r.oo > 0 ? "Covered by open order" : "Below reorder point",
        available: r.available, onOrder: r.oo, reorderPoint: r.reorderPoint, par: r.parLevel, perDay: Math.round(r.avgDaily * 100) / 100,
        cover: r.cover == null ? null : Math.round(r.cover * 10) / 10, suggested: r.suggested, cost: r.suggested * (v?.wholesaleCents ?? 0),
      };
    });
    const suggested = low.reduce((s, r) => s + r.suggested, 0);
    const cost = low.reduce((s, r) => s + r.suggested * (info.get(r.variantId)?.wholesaleCents ?? 0), 0);
    const out = low.filter((r) => r.available <= 0).length;
    return {
      columns: [
        ...storeCols(ctx),
        { key: "product", label: "Product" },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        { key: "status", label: "Status", format: "badge", tones: { "Out of stock": "red", "Below reorder point": "amber", "Covered by open order": "blue" } },
        { key: "available", label: "Available", format: "number" },
        { key: "onOrder", label: "On order", format: "number" },
        { key: "reorderPoint", label: "Reorder point", format: "number" },
        { key: "par", label: "Par", format: "number" },
        { key: "perDay", label: "Sold / day (28d)", format: "number" },
        { key: "cover", label: "Days of cover", format: "number" },
        { key: "suggested", label: "Suggested qty", format: "number" },
        { key: "cost", label: "Est. cost ex VAT", format: "zar" },
      ],
      rows,
      totalRows: low.length,
      totals: { [multi(ctx) ? "store" : "product"]: "Total", onOrder: low.reduce((s, r) => s + r.oo, 0), suggested, cost },
      summary: [
        { label: "Lines at or below reorder point", value: low.length, format: "number", upIsGood: false },
        { label: "Out of stock", value: out, format: "number", upIsGood: false },
        { label: "Suggested units", value: suggested, format: "number" },
        { label: "Estimated order value", value: cost, format: "zar", sub: "at wholesale, ex VAT" },
      ],
      empty: "Nothing is at or below its reorder point.",
      note: "Available = sellable on hand less open online reservations. Suggestions use the Purchasing replenishment maths: 28-day sales pace, 3-day lead time, 14 days of cover and the par level, less stock already on order.",
    };
  },
};

// ── Negative stock ──────────────────────────────────────────────────────────
export const negativeStock: ReportDef = {
  key: "negative-stock",
  title: "Negative stock",
  description: "Where has the till sold more than the system says we had?",
  group: "Inventory",
  scopes: ["store", "hq"],
  async run(ctx) {
    const where: Prisma.StockLevelWhereInput = { storeId: { in: ctx.storeIds }, onHand: { lt: 0 } };
    const [lots, count, agg] = await Promise.all([
      db.stockLevel.findMany({
        where,
        orderBy: [{ onHand: "asc" }, { updatedAt: "desc" }],
        take: ctx.rowLimit,
        include: { batch: { select: { code: true } }, variant: { select: { sku: true, name: true, product: { select: { name: true } } } } },
      }),
      db.stockLevel.count({ where }),
      db.$queryRaw<{ units: number; value: number }[]>`
        SELECT COALESCE(SUM("onHand"), 0)::int AS units, COALESCE(SUM("onHand"::float8 * "unitCostCents"), 0)::float8 AS value
        FROM "StockLevel" WHERE "storeId" = ANY(${ctx.storeIds}::text[]) AND "onHand" < 0`,
    ]);
    const rows: Row[] = lots.map((l) => ({
      ...storeVals(ctx, l.storeId), product: `${l.variant.product.name} · ${l.variant.name}`, sku: l.variant.sku, batch: l.batch.code,
      onHand: l.onHand, cost: l.unitCostCents, value: l.onHand * l.unitCostCents, updated: l.updatedAt,
    }));
    return {
      columns: [
        ...storeCols(ctx),
        { key: "product", label: "Product" },
        { key: "sku", label: "SKU" },
        { key: "batch", label: "Batch" },
        { key: "onHand", label: "On hand", format: "number" },
        { key: "cost", label: "Unit cost", format: "zar" },
        { key: "value", label: "Value at cost", format: "zar" },
        { key: "updated", label: "Last change", format: "datetime" },
      ],
      rows,
      totalRows: count,
      totals: { [multi(ctx) ? "store" : "product"]: "Total", onHand: agg[0]?.units ?? 0, value: agg[0]?.value ?? 0 },
      summary: [
        { label: "Negative lots", value: count, format: "number", upIsGood: false },
        { label: "Units short", value: -(agg[0]?.units ?? 0), format: "number" },
        { label: "Value at cost", value: agg[0]?.value ?? 0, format: "zar" },
      ],
      empty: "No negative stock — every lot balances.",
      note: "The till never blocks a sale for stock, so a sale posted before a delivery was received (or a miscount) leaves a lot below zero. Receive outstanding deliveries, then run a cycle count on these items to correct them.",
    };
  },
};
