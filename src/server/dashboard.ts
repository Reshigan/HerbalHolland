// Shared dashboard queries (store and network). Rollup-backed so they scale to 1,000 stores.
import { db } from "./db";
import { salesByDay, salesSummary, salesByChannel } from "./finance";
import { previousRange, delta } from "@/lib/ranges";
import { dayKey, fmtDay, addDays, dateOnly, type DateRange } from "@/lib/format";
import { OPEN_ORDER_STATUSES } from "./inventory";
import { sast } from "./sql";

export async function kpis(storeIds: string[], r: DateRange) {
  const prev = previousRange(r);
  const [cur, before, days, channels] = await Promise.all([salesSummary(storeIds, r), salesSummary(storeIds, prev), salesByDay(storeIds, r), salesByChannel(storeIds, r)]);
  const payments = [
    { label: "Card (tap)", value: cur.cardCents },
    { label: "Cash", value: cur.cashCents },
    { label: "PayShap", value: cur.payshapCents },
    { label: "Paid online", value: cur.onlineCents },
    { label: "Points", value: cur.loyaltyCents },
    { label: "EFT", value: cur.eftCents },
  ];
  return {
    cur,
    before,
    deltas: {
      net: delta(cur.netCents, before.netCents),
      tx: delta(cur.sales, before.sales),
      atv: delta(cur.atvCents, before.atvCents),
      margin: before.marginPct ? cur.marginPct - before.marginPct : null,
      members: before.memberRate ? cur.memberRate - before.memberRate : null,
    },
    // Today is still trading: leave the partial day off multi-day trend lines.
    trend: (() => {
      const complete = r.days > 1 && r.to === dayKey(new Date()) ? days.slice(0, -1) : days;
      return { labels: complete.map((d) => fmtDay(`${d.date}T12:00:00Z`)), net: complete.map((d) => d.netCents) };
    })(),
    online: channels.find((c) => c.channel === "ONLINE")?.netCents ?? 0,
    payments,
  };
}

export async function topProducts(storeIds: string[], r: DateRange, take = 8) {
  const rows = await db.dailyVariantStat.groupBy({
    by: ["variantId"],
    where: { storeId: { in: storeIds }, date: { gte: r.fromDate, lte: r.toDate } },
    _sum: { units: true, netCents: true, costCents: true },
    orderBy: { _sum: { netCents: "desc" } },
    take,
  });
  const variants = await db.variant.findMany({ where: { id: { in: rows.map((x) => x.variantId) } }, include: { product: { select: { name: true, slug: true } } } });
  const v = new Map(variants.map((x) => [x.id, x]));
  return rows.map((x) => ({
    variantId: x.variantId,
    name: `${v.get(x.variantId)?.product.name} · ${v.get(x.variantId)?.name}`,
    units: x._sum.units ?? 0,
    netCents: x._sum.netCents ?? 0,
    marginPct: x._sum.netCents ? ((x._sum.netCents ?? 0) - (x._sum.costCents ?? 0)) / (x._sum.netCents ?? 1) : 0,
  }));
}

/** Stock health for one or many stores: below reorder point, expiring, negative, recalled on hand. */
export async function stockAlerts(storeIds: string[]) {
  const soon = addDays(new Date(), 30);
  const [low, expiring, negative, blocked] = await Promise.all([
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "StoreVariant" sv
      LEFT JOIN (SELECT sl."storeId", sl."variantId", SUM(sl."onHand") AS q FROM "StockLevel" sl JOIN "Batch" b ON b.id = sl."batchId"
                 WHERE b.status = 'RELEASED' AND sl."storeId" = ANY(${storeIds}::text[]) GROUP BY 1, 2) s
        ON s."storeId" = sv."storeId" AND s."variantId" = sv."variantId"
      WHERE sv."storeId" = ANY(${storeIds}::text[]) AND COALESCE(s.q, 0) <= sv."reorderPoint"`,
    db.stockLevel.aggregate({ where: { storeId: { in: storeIds }, onHand: { gt: 0 }, batch: { status: "RELEASED", expiresAt: { lte: soon, gt: new Date() } } }, _sum: { onHand: true }, _count: true }),
    db.stockLevel.count({ where: { storeId: { in: storeIds }, onHand: { lt: 0 } } }),
    db.stockLevel.aggregate({ where: { storeId: { in: storeIds }, onHand: { gt: 0 }, batch: { status: { in: ["RECALLED", "QUARANTINE"] } } }, _sum: { onHand: true } }),
  ]);
  return { low: low[0]?.n ?? 0, expiringUnits: expiring._sum.onHand ?? 0, expiringLots: expiring._count, negative, blockedUnits: blocked._sum.onHand ?? 0 };
}

export async function orderQueue(storeIds: string[]) {
  const rows = await db.order.groupBy({ by: ["status"], where: { storeId: { in: storeIds }, status: { in: [...OPEN_ORDER_STATUSES, "OUT_FOR_DELIVERY"] } }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.status, r._count])) as Record<string, number>;
}

/** Transactions by weekday × hour (SAST) for the heatmap. Raw sales, bounded by range. */
export async function hourlyHeat(storeIds: string[], r: DateRange) {
  const rows = await db.$queryRaw<{ dow: number; hour: number; n: number }[]>`
    SELECT EXTRACT(DOW FROM ${sast('"createdAt"')})::int AS dow,
           EXTRACT(HOUR FROM ${sast('"createdAt"')})::int AS hour, COUNT(*)::int AS n
    FROM "Sale" WHERE kind = 'SALE' AND "storeId" = ANY(${storeIds}::text[]) AND "createdAt" >= ${r.start} AND "createdAt" < ${r.end}
    GROUP BY 1, 2`;
  return rows.map((x) => ({ day: x.dow, hour: x.hour, value: x.n }));
}

export async function pendingAnnouncements(storeId: string, format: string, regionCode: string) {
  const list = await db.announcement.findMany({
    where: { requiresAck: true, audience: { in: ["ALL", `format:${format}`, `region:${regionCode}`] }, acks: { none: { storeId } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return list;
}

export const lastNDays = (n: number) => ({ from: dateOnly(addDays(new Date(), -(n - 1))), key: dayKey(new Date()) });
