// Sales reports. Daily/store/product figures come from the rollups; hour, staff,
// refund and order analysis reads raw rows, always bounded by stores + date range.
import { db, Prisma } from "../db";
import { sastHour } from "../sql";
import { delta, previousRange } from "@/lib/ranges";
import { dayKey, fmtDate, fmtDay } from "@/lib/format";
import { zar, zarCompact } from "@/lib/money";
import type { ReportDef, Row } from "./types";
import { MANAGERS } from "./types";
import {
  CHANNEL_LABEL, FULFIL_LABEL, PAY_LABEL, ROLE_LABEL, STAT_SUMS, bounds, categoryVariantIds, count, eachDay, isoDay, n, ratio, storeCols, storeLabel, storeVals, statWhere, sumRows, summaryOf, userNames, variantMap, rangeQS, storeDrill,
} from "./util";

const channelSql = (c?: "POS" | "ONLINE" | "WHOLESALE", col = "channel") => (c ? Prisma.sql`AND ${Prisma.raw(col)} = ${c}` : Prisma.empty);
/** A list of ids as one JSON parameter (any length under D1's 100 bound values): `col IN (${inList(ids)})`. */
const inList = (ids: readonly string[]) => Prisma.sql`SELECT value FROM json_each(${JSON.stringify(ids)})`;

// ── Sales overview ──────────────────────────────────────────────────────────
export const salesOverview: ReportDef = {
  key: "sales-overview",
  title: "Sales overview",
  description: "How did we trade each day? Sales, VAT, discounts, baskets and margin.",
  group: "Sales",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  async run(ctx) {
    const r = ctx.range;
    const [days, cur, prev] = await Promise.all([
      db.dailyStoreStat.groupBy({ by: ["date"], where: statWhere(ctx), _sum: { ...STAT_SUMS, memberSavingsCents: true }, orderBy: { date: "asc" } }),
      db.dailyStoreStat.aggregate({ where: statWhere(ctx), _sum: STAT_SUMS }),
      db.dailyStoreStat.aggregate({ where: statWhere(ctx, previousRange(r)), _sum: STAT_SUMS }),
    ]);
    const byDay = new Map(days.map((d) => [isoDay(d.date), summaryOf(d._sum)]));
    const savedBy = new Map(days.map((d) => [isoDay(d.date), d._sum.memberSavingsCents ?? 0]));
    const line = (s: ReturnType<typeof summaryOf>) => ({
      sales: s.sales, refunds: s.refunds, units: s.units, gross: s.grossCents, discount: s.discountCents, vat: s.vatCents,
      net: s.netCents, cost: s.costCents, gp: s.grossProfitCents, margin: s.netCents ? s.marginPct : null,
      atv: s.sales ? s.atvCents : null, upt: s.sales ? s.upt : null, members: s.sales ? s.memberRate : null,
    });
    const rows: Row[] = eachDay(r).map((date) => ({
      _href: ctx.href("sales-by-hour", { from: date, to: date }),
      date, ...line(byDay.get(date) ?? summaryOf(null)), savings: savedBy.get(date) ?? 0,
    }));
    const t = summaryOf(cur._sum), p = summaryOf(prev._sum);
    // Today is still trading: keep the partial day off the trend line.
    const complete = r.days > 1 && r.to === dayKey(ctx.now) ? rows.slice(0, -1) : rows;
    return {
      columns: [
        { key: "date", label: "Day", format: "day" },
        { key: "sales", label: "Transactions", format: "number" },
        { key: "refunds", label: "Refunds", format: "number", csvOnly: true },
        { key: "units", label: "Units", format: "number", csvOnly: true },
        { key: "gross", label: "Sales incl VAT", format: "zar" },
        { key: "discount", label: "Discounts", format: "zar" },
        { key: "savings", label: "Rewards savings", format: "zar" },
        { key: "vat", label: "VAT", format: "zar" },
        { key: "net", label: "Net sales", format: "zar" },
        { key: "cost", label: "Cost of sales", format: "zar", csvOnly: true },
        { key: "gp", label: "Gross profit", format: "zar" },
        { key: "margin", label: "Margin", format: "pct" },
        { key: "atv", label: "Avg basket", format: "zar" },
        { key: "upt", label: "Units / sale", format: "number" },
        { key: "members", label: "Member sales", format: "pct" },
      ],
      rows,
      title: "Day by day",
      totals: { date: "Total", ...line(t), savings: [...savedBy.values()].reduce((s, v) => s + v, 0) },
      summary: [
        { label: "Net sales (ex VAT)", value: t.netCents, format: "zar", delta: delta(t.netCents, p.netCents) },
        { label: "Transactions", value: t.sales, format: "number", delta: delta(t.sales, p.sales) },
        { label: "Avg basket incl VAT", value: t.atvCents, format: "zar", delta: delta(t.atvCents, p.atvCents) },
        { label: "Units per sale", value: Math.round(t.upt * 100) / 100, format: "number", delta: delta(t.upt, p.upt) },
        { label: "Gross margin", value: t.marginPct, format: "pct", sub: `${zar(t.grossProfitCents)} profit` },
        { label: "Discounts given", value: t.discountCents, format: "zar", sub: t.grossCents ? `${((t.discountCents / (t.grossCents + t.discountCents)) * 100).toFixed(1)}% of sales` : undefined, upIsGood: false },
      ],
      chart: {
        kind: "area",
        title: "Net sales and gross profit",
        description: `Daily, ex VAT${complete.length < rows.length ? " · today excluded until trading closes" : ""}`,
        format: "zar",
        labels: complete.map((x) => fmtDay(`${x.date}T12:00:00Z`)),
        series: [
          { name: "Net sales", values: complete.map((x) => x.net as number) },
          { name: "Gross profit", values: complete.map((x) => x.gp as number) },
        ],
      },
      note: "Net sales exclude VAT. Refunds are netted off on the day they are processed. Discounts are promotions; Rewards savings are members' instant tier prices. Average basket includes VAT.",
    };
  },
};

// ── By product / category (DailyVariantStat) ───────────────────────────────
async function variantSales(ctx: Parameters<ReportDef["run"]>[0]) {
  const vids = await categoryVariantIds(ctx);
  const rows = await db.dailyVariantStat.groupBy({
    by: ["variantId"],
    where: { storeId: { in: ctx.storeIds }, date: { gte: ctx.range.fromDate, lte: ctx.range.toDate }, ...(vids && { variantId: { in: vids } }) },
    _sum: { units: true, netCents: true, costCents: true },
    orderBy: { _sum: { netCents: "desc" } },
  });
  const info = await variantMap(rows.map((r) => r.variantId));
  return rows.map((r) => ({ v: info.get(r.variantId), units: r._sum.units ?? 0, net: r._sum.netCents ?? 0, cost: r._sum.costCents ?? 0 }));
}

export const salesByProduct: ReportDef = {
  key: "sales-by-product",
  title: "Sales by product",
  description: "Which products sell, and at what margin?",
  group: "Sales",
  scopes: ["store", "hq"],
  filters: ["range", "category"],
  async run(ctx) {
    const data = await variantSales(ctx);
    const total = data.reduce((s, d) => s + d.net, 0);
    const rows: Row[] = data.map((d) => ({
      product: d.v?.name ?? "Unknown item", sku: d.v?.sku ?? "", category: d.v?.category ?? "", units: d.units, net: d.net,
      avg: d.units ? Math.round(d.net / d.units) : null, cost: d.cost, gp: d.net - d.cost, margin: ratio(d.net - d.cost, d.net), share: ratio(d.net, total),
    }));
    const t = sumRows(rows, ["units", "net", "cost", "gp"], { product: "Total" });
    t.margin = ratio(t.gp as number, t.net as number);
    t.share = rows.length ? 1 : null;
    return {
      columns: [
        { key: "product", label: "Product" },
        { key: "sku", label: "SKU" },
        { key: "category", label: "Category" },
        { key: "units", label: "Units", format: "number" },
        { key: "net", label: "Net sales", format: "zar" },
        { key: "avg", label: "Avg price ex VAT", format: "zar" },
        { key: "cost", label: "Cost", format: "zar", csvOnly: true },
        { key: "gp", label: "Gross profit", format: "zar" },
        { key: "margin", label: "Margin", format: "pct" },
        { key: "share", label: "Share of sales", format: "pct" },
      ],
      rows,
      totals: t,
      chart: rows.length
        ? {
            kind: "bar",
            title: "Top sellers",
            description: "Net sales ex VAT · top 10",
            format: "zar",
            rows: data.slice(0, 10).map((d) => ({ label: d.v?.name ?? "Unknown", value: d.net, sub: `${d.units.toLocaleString()} sold`, tip: `${d.v?.name}\n${d.units} units · margin ${((ratio(d.net - d.cost, d.net) ?? 0) * 100).toFixed(1)}%` })),
          }
        : null,
      emptyTitle: "No sales",
      empty: "No products sold in this period.",
      note: "Online orders are included on the day they were handed over or dispatched. Refunds reduce the product's units and sales.",
    };
  },
};

export const salesByCategory: ReportDef = {
  key: "sales-by-category",
  title: "Sales by category",
  description: "Which categories drive sales and profit?",
  group: "Sales",
  scopes: ["store", "hq"],
  filters: ["range"],
  async run(ctx) {
    const data = await variantSales(ctx);
    const by = new Map<string, { name: string; skus: number; units: number; net: number; cost: number }>();
    for (const d of data) {
      const k = d.v?.category ?? "Other";
      const c = by.get(k) ?? { name: k, skus: 0, units: 0, net: 0, cost: 0 };
      if (d.units > 0) c.skus++;
      c.units += d.units;
      c.net += d.net;
      c.cost += d.cost;
      by.set(k, c);
    }
    const total = data.reduce((s, d) => s + d.net, 0);
    const list = [...by.values()].sort((a, b) => b.net - a.net);
    const slugs = new Map((await db.category.findMany({ select: { name: true, slug: true } })).map((c) => [c.name, c.slug]));
    const rows: Row[] = list.map((c) => ({
      _href: slugs.has(c.name) ? ctx.href("sales-by-product", { category: slugs.get(c.name)!, ...rangeQS(ctx) }) : undefined,
      category: c.name, skus: c.skus, units: c.units, net: c.net, cost: c.cost, gp: c.net - c.cost, margin: ratio(c.net - c.cost, c.net), share: ratio(c.net, total),
    }));
    const t = sumRows(rows, ["skus", "units", "net", "cost", "gp"], { category: "Total" });
    t.margin = ratio(t.gp as number, t.net as number);
    t.share = rows.length ? 1 : null;
    return {
      columns: [
        { key: "category", label: "Category" },
        { key: "skus", label: "SKUs sold", format: "number" },
        { key: "units", label: "Units", format: "number" },
        { key: "net", label: "Net sales", format: "zar" },
        { key: "cost", label: "Cost", format: "zar" },
        { key: "gp", label: "Gross profit", format: "zar" },
        { key: "margin", label: "Margin", format: "pct" },
        { key: "share", label: "Share of sales", format: "pct" },
      ],
      rows,
      totals: t,
      chart: rows.length
        ? { kind: "bar", title: "Net sales by category", description: "Ex VAT", format: "zar", rows: list.map((c) => ({ label: c.name, value: c.net, sub: `${((ratio(c.net - c.cost, c.net) ?? 0) * 100).toFixed(0)}% margin` })) }
        : null,
      empty: "No sales in this period.",
    };
  },
};

// ── Store league ────────────────────────────────────────────────────────────
export const salesByStore: ReportDef = {
  key: "sales-by-store",
  title: "Sales by store",
  description: "Which stores lead, and who is growing against the previous period?",
  group: "Sales",
  scopes: ["hq", "store"],
  multiStore: true,
  filters: ["range", "channel"],
  async run(ctx) {
    const prevR = previousRange(ctx.range);
    const [cur, before, online, trade] = await Promise.all([
      db.dailyStoreStat.groupBy({ by: ["storeId"], where: statWhere(ctx), _sum: STAT_SUMS }),
      db.dailyStoreStat.groupBy({ by: ["storeId"], where: statWhere(ctx, prevR), _sum: { grossCents: true, vatCents: true } }),
      db.dailyStoreStat.groupBy({ by: ["storeId"], where: { ...statWhere(ctx), channel: "ONLINE" }, _sum: { grossCents: true, vatCents: true } }),
      db.dailyStoreStat.groupBy({ by: ["storeId"], where: { ...statWhere(ctx), channel: "WHOLESALE" }, _sum: { grossCents: true, vatCents: true } }),
    ]);
    const now = new Map(cur.map((x) => [x.storeId, summaryOf(x._sum)]));
    const prev = new Map(before.map((x) => [x.storeId, (x._sum.grossCents ?? 0) - (x._sum.vatCents ?? 0)]));
    const netOf = (x: { _sum: { grossCents: number | null; vatCents: number | null } }) => (x._sum.grossCents ?? 0) - (x._sum.vatCents ?? 0);
    const onl = new Map(online.map((x) => [x.storeId, netOf(x)]));
    const trd = new Map(trade.map((x) => [x.storeId, netOf(x)]));
    const ids = [...ctx.stores.values()].filter((s) => now.has(s.id) || prev.has(s.id) || (s.kind === "RETAIL" && s.status === "ACTIVE")).map((s) => s.id);
    const list = ids
      .map((id) => ({ id, s: now.get(id) ?? summaryOf(null), prev: prev.get(id) ?? 0, dc: ctx.stores.get(id)!.kind === "WAREHOUSE" }))
      // Stores are ranked; distribution centres (courier and trade fulfilment) follow, unranked.
      .sort((a, b) => Number(a.dc) - Number(b.dc) || b.s.netCents - a.s.netCents);
    const rows: Row[] = list.map((x, i) => {
      const st = ctx.stores.get(x.id)!;
      return {
        _link: "store", _href: storeDrill(ctx, st.code, "sales-overview"),
        rank: x.dc ? null : i + 1, store: storeLabel(ctx, x.id), code: st.code, region: st.region, net: x.s.netCents, prev: x.prev,
        growth: delta(x.s.netCents, x.prev), sales: x.s.sales, atv: x.s.sales ? x.s.atvCents : null, margin: x.s.netCents ? x.s.marginPct : null,
        members: x.s.sales ? x.s.memberRate : null, online: ratio(onl.get(x.id) ?? 0, x.s.netCents), trade: ratio(trd.get(x.id) ?? 0, x.s.netCents),
      };
    });
    const t = summaryOf(Object.fromEntries(Object.keys(STAT_SUMS).map((k) => [k, cur.reduce((s, x) => s + ((x._sum as Record<string, number | null>)[k] ?? 0), 0)])));
    const prevTotal = list.reduce((s, x) => s + x.prev, 0);
    const retailRows = rows.filter((_, i) => !list[i].dc);
    const dcTrading = rows.filter((r, i) => list[i].dc && (r.sales as number) > 0).length;
    const growing = retailRows.filter((r) => (r.growth as number | null) != null && (r.growth as number) > 0).length;
    return {
      columns: [
        { key: "rank", label: "#", format: "number" },
        { key: "store", label: "Store" },
        { key: "code", label: "Code" },
        { key: "region", label: "Region" },
        { key: "net", label: "Net sales", format: "zar" },
        { key: "prev", label: "Previous period", format: "zar" },
        { key: "growth", label: "Growth", format: "pct" },
        { key: "sales", label: "Transactions", format: "number" },
        { key: "atv", label: "Avg basket", format: "zar" },
        { key: "margin", label: "Margin", format: "pct" },
        { key: "members", label: "Member sales", format: "pct" },
        { key: "online", label: "Online share", format: "pct" },
        { key: "trade", label: "Trade share", format: "pct" },
      ],
      rows,
      title: "League table",
      totals: {
        rank: "", store: "Total", net: t.netCents, prev: prevTotal, growth: delta(t.netCents, prevTotal), sales: t.sales,
        atv: t.sales ? t.atvCents : null, margin: t.netCents ? t.marginPct : null, members: t.sales ? t.memberRate : null,
        online: ratio(online.reduce((s, x) => s + netOf(x), 0), t.netCents),
        trade: ratio(trade.reduce((s, x) => s + netOf(x), 0), t.netCents),
      },
      summary: [
        { label: "Net sales (ex VAT)", value: t.netCents, format: "zar", delta: delta(t.netCents, prevTotal) },
        { label: "Stores trading", value: retailRows.filter((r) => (r.sales as number) > 0).length, format: "number", sub: dcTrading ? `+ ${dcTrading} distribution centre${dcTrading === 1 ? "" : "s"}` : undefined },
        { label: "Growing vs last period", value: growing, format: "number", sub: `of ${retailRows.length} stores` },
        { label: "Average basket", value: t.atvCents, format: "zar", sub: "incl VAT" },
      ],
      chart: retailRows.length > 1
        ? { kind: "bar", title: "Store league", description: "Net sales ex VAT · top 15", format: "zar", rows: retailRows.slice(0, 15).map((r) => ({ label: `${String(r.rank).padStart(2, "0")}  ${r.store}`, value: r.net as number, sub: r.growth == null ? "new" : `${(r.growth as number) >= 0 ? "▲" : "▼"} ${Math.abs((r.growth as number) * 100).toFixed(1)}%`, tip: `${r.store} (${r.code})\n${zar(r.net as number)} net · ${r.region}` })) }
        : null,
      note: `Growth compares with ${fmtDate(`${prevR.from}T12:00:00Z`)} – ${fmtDate(`${prevR.to}T12:00:00Z`)}, the same number of days immediately before. Online share is online orders the store fulfilled; trade share is sales to business accounts (the trade portal's orders collected at the store, and trade sales rung up at a till). Distribution centres (DC) are listed after the stores, unranked, when they fulfil courier or trade orders; they don't count as stores trading.`,
    };
  },
};

// ── Weekday × hour ──────────────────────────────────────────────────────────
const WEEK = [
  { dow: 1, key: "mon", label: "Mon" }, { dow: 2, key: "tue", label: "Tue" }, { dow: 3, key: "wed", label: "Wed" }, { dow: 4, key: "thu", label: "Thu" },
  { dow: 5, key: "fri", label: "Fri" }, { dow: 6, key: "sat", label: "Sat" }, { dow: 0, key: "sun", label: "Sun" },
];

export const salesByHour: ReportDef = {
  key: "sales-by-hour",
  title: "Sales by hour",
  description: "When are the tills busiest? Plan rosters around the busy hours.",
  group: "Sales",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  defaults: { channel: "POS" },
  params: [{ key: "measure", label: "Measure", options: [{ value: "tx", label: "Transactions" }, { value: "net", label: "Net sales" }], default: "tx" }],
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const raw = await db.$queryRaw<{ dow: number | bigint; hour: number | bigint; tx: number; net: number }[]>`
      SELECT cast(strftime('%w', "createdAt", '+2 hours') AS integer) AS dow,
             ${sastHour('"createdAt"')} AS hour,
             cast(COUNT(CASE WHEN kind = 'SALE' THEN 1 END) AS real) AS tx,
             cast(COALESCE(SUM("totalCents" - "vatCents"), 0) AS real) AS net
      FROM "Sale"
      WHERE "storeId" IN (${inList(ctx.storeIds)}) AND "createdAt" >= ${start} AND "createdAt" < ${end} ${channelSql(ctx.channel)}
      GROUP BY 1, 2`;
    const data = raw.map((d) => ({ dow: Number(d.dow), hour: Number(d.hour), tx: d.tx, net: d.net }));
    const measure = ctx.params.measure === "net" ? "net" : "tx";
    const fmt = measure === "net" ? ("zar" as const) : ("number" as const);
    if (!data.length) return { columns: [{ key: "hour", label: "Hour" }], rows: [], empty: "No sales in this period." };
    const hours = data.filter((d) => d.tx > 0 || d.net !== 0).map((d) => d.hour);
    const lo = Math.min(...hours), hi = Math.max(...hours);
    const cell = (dow: number, h: number) => data.find((d) => d.dow === dow && d.hour === h);
    const grand = data.reduce((s, d) => s + d[measure], 0);
    const rows: Row[] = [];
    for (let h = lo; h <= hi; h++) {
      const row: Row = { hour: `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00` };
      let total = 0;
      for (const w of WEEK) {
        const v = cell(w.dow, h)?.[measure] ?? 0;
        row[w.key] = v;
        total += v;
      }
      row.total = total;
      row.share = ratio(total, grand);
      rows.push(row);
    }
    const t = sumRows(rows, [...WEEK.map((w) => w.key), "total"], { hour: "Total" });
    t.share = 1;
    const busiest = [...data].sort((a, b) => b[measure] - a[measure])[0];
    const busiestDay = WEEK.map((w) => ({ w, v: t[w.key] as number })).sort((a, b) => b.v - a.v)[0];
    return {
      columns: [
        { key: "hour", label: "Hour" },
        ...WEEK.map((w) => ({ key: w.key, label: w.label, format: fmt })),
        { key: "total", label: "Total", format: fmt },
        { key: "share", label: "Share", format: "pct" },
      ],
      rows,
      totals: t,
      summary: [
        { label: "Busiest hour", value: `${WEEK.find((w) => w.dow === busiest.dow)!.label} ${String(busiest.hour).padStart(2, "0")}:00`, sub: measure === "net" ? zar(busiest.net) : `${n(busiest.tx)} transactions` },
        { label: "Busiest day", value: busiestDay.w.label, sub: measure === "net" ? zar(busiestDay.v) : `${n(busiestDay.v)} transactions` },
        { label: measure === "net" ? "Net sales" : "Transactions", value: grand, format: fmt },
      ],
      chart: {
        kind: "heatmap",
        title: measure === "net" ? "Net sales by weekday and hour" : "Transactions by weekday and hour",
        description: "South African time",
        format: fmt,
        cells: data.map((d) => ({ day: d.dow, hour: d.hour, value: d[measure] })),
        hours: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
      },
      note: "Hours are in South African time. Transactions count sales only; net sales include refunds in the hour they were processed.",
    };
  },
};

// ── Sales by staff ───────────────────────────────────────────────────────────────
export const salesByStaff: ReportDef = {
  key: "sales-by-staff",
  title: "Sales by staff",
  description: "How is each person at the till doing? Sales, baskets, member sign-in and refunds.",
  group: "Sales",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  roles: MANAGERS,
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const [agg, units] = await Promise.all([
      db.$queryRaw<{ staffId: string | null; storeId: string; tx: number; members: number; refunds: number; refundCents: number; gross: number; net: number; discount: number }[]>`
        SELECT "staffId", "storeId",
          cast(COUNT(CASE WHEN kind = 'SALE' THEN 1 END) AS real) AS tx,
          cast(COUNT(CASE WHEN kind = 'SALE' AND "customerId" IS NOT NULL THEN 1 END) AS real) AS members,
          cast(COUNT(CASE WHEN kind = 'REFUND' THEN 1 END) AS real) AS refunds,
          cast(COALESCE(-SUM(CASE WHEN kind = 'REFUND' THEN "totalCents" ELSE 0 END), 0) AS real) AS "refundCents",
          cast(COALESCE(SUM(CASE WHEN kind = 'SALE' THEN "totalCents" ELSE 0 END), 0) AS real) AS gross,
          cast(COALESCE(SUM("totalCents" - "vatCents"), 0) AS real) AS net,
          cast(COALESCE(SUM(CASE WHEN kind = 'SALE' THEN "discountCents" ELSE 0 END), 0) AS real) AS discount
        FROM "Sale"
        WHERE "storeId" IN (${inList(ctx.storeIds)}) AND "createdAt" >= ${start} AND "createdAt" < ${end} ${channelSql(ctx.channel)}
        GROUP BY 1, 2`,
      db.$queryRaw<{ staffId: string | null; storeId: string; units: number }[]>`
        SELECT s."staffId", s."storeId", cast(COALESCE(SUM(l.qty), 0) AS real) AS units
        FROM "SaleLine" l JOIN "Sale" s ON s.id = l."saleId"
        WHERE s.kind = 'SALE' AND s."storeId" IN (${inList(ctx.storeIds)}) AND s."createdAt" >= ${start} AND s."createdAt" < ${end} ${channelSql(ctx.channel, "s.channel")}
        GROUP BY 1, 2`,
    ]);
    const users = await userNames(agg.map((a) => a.staffId));
    const unitsBy = new Map(units.map((u) => [`${u.staffId}|${u.storeId}`, u.units]));
    const list = agg
      .map((a) => {
        const u = a.staffId ? users.get(a.staffId) : undefined;
        const n = unitsBy.get(`${a.staffId}|${a.storeId}`) ?? 0;
        return {
          name: u?.name ?? "Not recorded (online)", role: u ? `${ROLE_LABEL[u.role] ?? u.role}${u.canDispense ? " · dispenser" : ""}` : "",
          ...storeVals(ctx, a.storeId), sales: a.tx, net: a.net, atv: a.tx ? Math.round(a.gross / a.tx) : null, upt: a.tx ? n / a.tx : null,
          attach: ratio(a.members, a.tx), discount: a.discount, refunds: a.refunds, refundValue: a.refundCents, _units: n, _members: a.members, _gross: a.gross,
        };
      })
      .sort((x, y) => y.net - x.net);
    const tx = list.reduce((s, x) => s + x.sales, 0);
    const t = sumRows(list, ["sales", "net", "discount", "refunds", "refundValue"], { name: "Total" });
    const gross = list.reduce((s, x) => s + x._gross, 0);
    t.atv = tx ? Math.round(gross / tx) : null;
    t.upt = tx ? list.reduce((s, x) => s + x._units, 0) / tx : null;
    t.attach = ratio(list.reduce((s, x) => s + x._members, 0), tx);
    return {
      columns: [
        { key: "name", label: "Staff member" },
        { key: "role", label: "Role" },
        ...storeCols(ctx),
        { key: "sales", label: "Transactions", format: "number" },
        { key: "net", label: "Net sales", format: "zar" },
        { key: "atv", label: "Avg basket", format: "zar" },
        { key: "upt", label: "Units / sale", format: "number" },
        { key: "attach", label: "Member attach", format: "pct" },
        { key: "discount", label: "Discounts", format: "zar" },
        { key: "refunds", label: "Refunds", format: "number" },
        { key: "refundValue", label: "Refund value", format: "zar" },
      ],
      rows: list,
      totals: t,
      chart: list.length > 1 ? { kind: "bar", title: "Net sales by staff member", description: "Ex VAT · top 10", format: "zar", rows: list.slice(0, 10).map((x) => ({ label: x.name, value: x.net, sub: count(x.sales, "sale") })) } : null,
      emptyTitle: "No sales",
      empty: "No sales recorded in this period.",
      note: "Net sales are after refunds the staff member processed. Member attach = share of their transactions linked to a Herbal Holland Rewards member. Average basket includes VAT.",
    };
  },
};

// ── Refunds ─────────────────────────────────────────────────────────────────
export const refunds: ReportDef = {
  key: "refunds",
  title: "Refunds",
  description: "What came back, who processed it, and why?",
  group: "Sales",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  roles: MANAGERS,
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const where: Prisma.SaleWhereInput = { kind: "REFUND", storeId: { in: ctx.storeIds }, createdAt: { gte: start, lt: end }, ...(ctx.channel && { channel: ctx.channel }) };
    const [list, count, agg, reasons, sales] = await Promise.all([
      db.sale.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: ctx.rowLimit,
        select: {
          number: true, createdAt: true, storeId: true, totalCents: true, note: true, channel: true,
          refundOf: { select: { number: true, createdAt: true } }, staff: { select: { name: true } }, customer: { select: { memberNo: true } },
          lines: { select: { qty: true } }, payments: { select: { method: true } },
        },
      }),
      db.sale.count({ where }),
      db.sale.aggregate({ where, _sum: { totalCents: true } }),
      db.sale.groupBy({ by: ["note"], where, _sum: { totalCents: true }, _count: true }),
      db.dailyStoreStat.aggregate({ where: statWhere(ctx), _sum: { grossCents: true } }),
    ]);
    const value = -(agg._sum.totalCents ?? 0);
    const salesBefore = (sales._sum.grossCents ?? 0) + value;
    const rows: Row[] = list.map((s) => ({
      at: s.createdAt, number: s.number, of: s.refundOf?.number ?? "", ...storeVals(ctx, s.storeId), channel: CHANNEL_LABEL[s.channel],
      staff: s.staff?.name ?? "", member: s.customer?.memberNo ?? "Walk-in", units: -s.lines.reduce((a, l) => a + l.qty, 0), amount: -s.totalCents,
      method: [...new Set(s.payments.map((p) => PAY_LABEL[p.method] ?? p.method))].join(" + "),
      days: s.refundOf ? Math.max(0, Math.round((s.createdAt.getTime() - s.refundOf.createdAt.getTime()) / 86_400_000)) : null, reason: s.note ?? "",
    }));
    const byReason = reasons.map((r) => ({ reason: r.note || "No reason given", value: -(r._sum.totalCents ?? 0), n: r._count })).sort((a, b) => b.value - a.value);
    return {
      columns: [
        { key: "at", label: "When", format: "datetime" },
        { key: "number", label: "Refund" },
        { key: "of", label: "Original sale" },
        ...storeCols(ctx),
        { key: "channel", label: "Channel" },
        { key: "staff", label: "Processed by" },
        { key: "member", label: "Member" },
        { key: "units", label: "Units", format: "number" },
        { key: "amount", label: "Amount incl VAT", format: "zar" },
        { key: "method", label: "Refunded to" },
        { key: "days", label: "Days after sale", format: "number" },
        { key: "reason", label: "Reason" },
      ],
      rows,
      totalRows: count,
      totals: { at: "Total", units: rows.length === count ? rows.reduce((s, r) => s + (r.units as number), 0) : null, amount: value },
      summary: [
        { label: "Refunds", value: count, format: "number" },
        { label: "Refunded incl VAT", value: value, format: "zar", upIsGood: false },
        { label: "Refund rate", value: ratio(value, salesBefore), format: "pct", sub: "of sales incl VAT" },
        { label: "Top reason", value: byReason[0]?.reason ?? "—", sub: byReason[0] ? `${n(byReason[0].n)} refunds` : undefined },
      ],
      chart: byReason.length ? { kind: "bar", title: "Refunds by reason", description: "Value incl VAT", format: "zar", rows: byReason.slice(0, 8).map((r) => ({ label: r.reason, value: r.value, sub: `${r.n}×` })) } : null,
      emptyTitle: "No refunds",
      empty: "Nothing was refunded in this period.",
    };
  },
};

// ── Tender reconciliation ───────────────────────────────────────────────────
const TENDERS = [
  { key: "cardCents", label: "Card" },
  { key: "cashCents", label: "Cash" },
  { key: "payshapCents", label: "PayShap" },
  { key: "eftCents", label: "EFT" },
  { key: "onlineCents", label: "Collected by HQ" },
  { key: "loyaltyCents", label: "Points" },
  { key: "accountCents", label: "On account" },
] as const;

export const payments: ReportDef = {
  key: "payments",
  title: "Payments & tenders",
  description: "Do the takings match the bank? Tenders by day for reconciliation.",
  group: "Sales",
  scopes: ["store", "hq"],
  filters: ["range", "channel"],
  async run(ctx) {
    const [days, all] = await Promise.all([
      db.dailyStoreStat.groupBy({ by: ["date"], where: statWhere(ctx), _sum: STAT_SUMS, orderBy: { date: "asc" } }),
      db.dailyStoreStat.aggregate({ where: statWhere(ctx), _sum: STAT_SUMS }),
    ]);
    const byDay = new Map(days.map((d) => [isoDay(d.date), d._sum]));
    const line = (s: Partial<Record<string, number | null>> | undefined) => {
      const o: Row = { sales: s?.sales ?? 0 };
      let total = 0;
      for (const t of TENDERS) {
        o[t.key] = s?.[t.key] ?? 0;
        total += (o[t.key] as number);
      }
      o.total = total;
      o.banked = (s?.cardCents ?? 0) + (s?.payshapCents ?? 0) + (s?.eftCents ?? 0);
      return o;
    };
    const rows: Row[] = eachDay(ctx.range).map((date) => ({ date, ...line(byDay.get(date) as Record<string, number | null> | undefined) }));
    const t = line(all._sum as Record<string, number | null>);
    return {
      title: "Day by day",
      columns: [
        { key: "date", label: "Day", format: "day" },
        { key: "sales", label: "Transactions", format: "number" },
        ...TENDERS.map((x) => ({ key: x.key, label: x.label, format: "zar" as const })),
        { key: "total", label: "Total tendered", format: "zar" },
        { key: "banked", label: "Card + PayShap + EFT", format: "zar" },
      ],
      rows,
      totals: { date: "Total", ...t },
      summary: [
        { label: "Total tendered", value: t.total as number, format: "zar" },
        { label: "Card", value: t.cardCents as number, format: "zar", sub: pctOf(t.cardCents, t.total) },
        { label: "Cash", value: t.cashCents as number, format: "zar", sub: pctOf(t.cashCents, t.total) },
        { label: "PayShap", value: t.payshapCents as number, format: "zar", sub: pctOf(t.payshapCents, t.total) },
      ],
      chart: (t.total as number) > 0 ? { kind: "donut", title: "How sales were paid", description: "Share of takings incl VAT", format: "zar", data: TENDERS.map((x) => ({ label: x.label, value: Math.max(0, t[x.key] as number) })), center: zarCompact(t.total as number) } : null,
      note: "Business days run midnight to midnight, South African time. Card, PayShap and EFT settle to the store's bank account. Collected by HQ is money HQ took on the store's behalf: online payments, gift vouchers (paid for online, HQ's liability) and trade orders collected at the store. Redeemed Rewards points are reimbursed. On account is trade sales invoiced to a business account on HQ's trade ledger, not money at the till. All of those are settled on the monthly franchise statement. Refunds show as negative amounts on the tender they went back to; the voucher part of a refund goes back onto the voucher.",
    };
  },
};
const pctOf = (a: unknown, b: unknown) => (Number(b) ? `${((Number(a) / Number(b)) * 100).toFixed(1)}% of takings` : undefined);

// ── Online orders ───────────────────────────────────────────────────────────
export const onlineOrders: ReportDef = {
  key: "online-orders",
  title: "Online orders",
  description: "How quickly and reliably are online orders fulfilled?",
  group: "Sales",
  scopes: ["store", "hq"],
  filters: ["range"],
  params: [
    {
      key: "by",
      label: "Group by",
      options: ({ multi }) => [{ value: "fulfilment", label: "Fulfilment" }, ...(multi ? [{ value: "store", label: "Store & fulfilment" }] : [])],
      default: "fulfilment",
    },
  ],
  async run(ctx) {
    const { start, end } = bounds(ctx);
    const byStore = ctx.params.by === "store";
    // A group's rows (by store and fulfilment, then all together) with the continuous percentiles of the minutes from
    // placed to ready: each group's waits ranked by a window, then the value at the fraction's position interpolated.
    const grp = byStore ? Prisma.sql`COALESCE(o."storeId", '') || '|' || COALESCE(o.fulfilment, '')` : Prisma.sql`COALESCE(o.fulfilment, '')`;
    const at = (status: string) => Prisma.sql`(SELECT MIN(json_extract(e.value, '$.at')) FROM json_each(o.events) e WHERE json_extract(e.value, '$.status') = ${status})`;
    const pct = (q: number) => Prisma.sql`SUM(CASE
      WHEN rn = cast(${q} * (cnt - 1) AS integer) THEN mins * (1 - (${q} * (cnt - 1) - cast(${q} * (cnt - 1) AS integer)))
      WHEN rn = cast(${q} * (cnt - 1) AS integer) + 1 THEN mins * (${q} * (cnt - 1) - cast(${q} * (cnt - 1) AS integer))
      ELSE 0 END)`;
    const measures = Prisma.sql`
        cast(COUNT(*) AS real) AS orders,
        cast(COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS real) AS completed,
        cast(COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) AS real) AS cancelled,
        cast(COUNT(CASE WHEN status = 'PENDING_PAYMENT' THEN 1 END) AS real) AS unpaid,
        cast(COALESCE(SUM(CASE WHEN status NOT IN ('CANCELLED', 'PENDING_PAYMENT') THEN "totalCents" ELSE 0 END), 0) AS real) AS value`;
    const rows = await db.$queryRaw<{ storeId: string | null; fulfilment: string | null; total: number; orders: number; completed: number; cancelled: number; unpaid: number; value: number; readyMedian: number | null; readyP90: number | null; doneHours: number | null }[]>`
      WITH o AS (
        SELECT o."storeId", o.fulfilment, o.status, o."totalCents", ${grp} AS grp,
          (julianday(${at("READY")}) - julianday(${at("PLACED")})) * 1440 AS mins,
          (julianday(${at("COMPLETED")}) - julianday(${at("PLACED")})) * 24 AS hours
        FROM "Order" o
        WHERE o."storeId" IN (${inList(ctx.storeIds)}) AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
      ),
      r AS (SELECT grp, mins, ROW_NUMBER() OVER (PARTITION BY grp ORDER BY mins) - 1 AS rn, COUNT(*) OVER (PARTITION BY grp) AS cnt FROM o WHERE mins IS NOT NULL),
      rt AS (SELECT mins, ROW_NUMBER() OVER (ORDER BY mins) - 1 AS rn, COUNT(*) OVER () AS cnt FROM o WHERE mins IS NOT NULL),
      p AS (SELECT grp, ${pct(0.5)} AS med, ${pct(0.9)} AS p90 FROM r GROUP BY grp),
      pt AS (SELECT ${pct(0.5)} AS med, ${pct(0.9)} AS p90 FROM rt)
      SELECT ${byStore ? Prisma.sql`o."storeId"` : Prisma.sql`NULL AS "storeId"`}, o.fulfilment, 0 AS total, ${measures},
        cast(MAX(p.med) AS real) AS "readyMedian", cast(MAX(p.p90) AS real) AS "readyP90", cast(AVG(o.hours) AS real) AS "doneHours"
      FROM o LEFT JOIN p ON p.grp = o.grp
      GROUP BY o.grp
      UNION ALL
      SELECT NULL, NULL, 1 AS total, ${measures},
        cast(MAX(pt.med) AS real) AS "readyMedian", cast(MAX(pt.p90) AS real) AS "readyP90", cast(AVG(o.hours) AS real) AS "doneHours"
      FROM o CROSS JOIN pt
      ORDER BY 3, 1, 2`;
    const reasons = await db.$queryRaw<{ reason: string; n: number }[]>`
      SELECT COALESCE(NULLIF(json_extract(e.value, '$.note'), ''), 'No reason given') AS reason, cast(COUNT(*) AS real) AS n
      FROM "Order" o, json_each(o.events) e
      WHERE o."storeId" IN (${inList(ctx.storeIds)}) AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
        AND o.status = 'CANCELLED' AND json_extract(e.value, '$.status') = 'CANCELLED'
      GROUP BY 1 ORDER BY 2 DESC`;
    const total = rows.find((r) => Number(r.total) === 1);
    const shape = (r: (typeof rows)[number]): Row => {
      const live = r.orders - r.cancelled - r.unpaid;
      return {
        ...(byStore ? storeVals(ctx, r.storeId) : {}), fulfilment: r.fulfilment ? FULFIL_LABEL[r.fulfilment] ?? r.fulfilment : "All",
        orders: r.orders, completed: r.completed, open: live - r.completed, unpaid: r.unpaid, cancelled: r.cancelled, cancelRate: ratio(r.cancelled, r.orders),
        value: r.value, aov: live ? Math.round(r.value / live) : null, readyMedian: r.readyMedian, readyP90: r.readyP90, doneHours: r.doneHours,
      };
    };
    const list = rows
      .filter((r) => Number(r.total) === 0)
      .map(shape)
      .sort((a, b) => String(a.store ?? "").localeCompare(String(b.store ?? "")) || String(a.fulfilment).localeCompare(String(b.fulfilment)));
    const t = total ? shape(total) : null;
    if (t) Object.assign(t, { fulfilment: "All orders" }, byStore ? { store: "Total", code: "" } : {});
    const inProgress = t ? (t.open as number) : 0;
    return {
      columns: [
        ...(byStore ? storeCols(ctx) : []),
        { key: "fulfilment", label: "Fulfilment" },
        { key: "orders", label: "Orders", format: "number" },
        { key: "completed", label: "Completed", format: "number" },
        { key: "open", label: "In progress", format: "number" },
        { key: "unpaid", label: "Awaiting payment", format: "number" },
        { key: "cancelled", label: "Cancelled", format: "number" },
        { key: "cancelRate", label: "Cancel rate", format: "pct" },
        { key: "value", label: "Order value incl VAT", format: "zar" },
        { key: "aov", label: "Avg order", format: "zar" },
        { key: "readyMedian", label: "Placed → ready (median min)", format: "number" },
        { key: "readyP90", label: "Placed → ready (90th pct min)", format: "number" },
        { key: "doneHours", label: "Placed → completed (avg h)", format: "number" },
      ],
      rows: list,
      totals: t,
      summary: t
        ? [
            { label: "Orders", value: t.orders as number, format: "number" },
            { label: "Completion rate", value: ratio(t.completed as number, (t.orders as number) - (t.cancelled as number) - (t.unpaid as number)), format: "pct", sub: `${n(inProgress)} still in progress` },
            { label: "Cancel rate", value: t.cancelRate as number | null, format: "pct", upIsGood: false },
            { label: "Median time to ready", value: t.readyMedian == null ? null : `${Math.round(t.readyMedian as number)} min`, sub: t.readyP90 == null ? undefined : `90% within ${Math.round(t.readyP90 as number)} min` },
          ]
        : [],
      chart: t && (t.orders as number) > 0
        ? { kind: "donut", title: "Where orders are now", description: "Orders placed in the period", format: "number", data: [{ label: "Completed", value: t.completed as number }, { label: "In progress", value: inProgress }, { label: "Awaiting payment", value: t.unpaid as number }, { label: "Cancelled", value: t.cancelled as number }], center: `${t.orders}` }
        : null,
      extra: reasons.length ? [{ title: "Cancellations by reason", columns: [{ key: "reason", label: "Reason" }, { key: "n", label: "Orders", format: "number" }], rows: reasons }] : [],
      emptyTitle: "No online orders",
      empty: "No online orders were placed in this period.",
      note: "Times run from the moment an order is placed (after payment for pay-online orders) to the first 'ready' and 'completed' events. Order value excludes cancelled and unpaid orders.",
    };
  },
};
