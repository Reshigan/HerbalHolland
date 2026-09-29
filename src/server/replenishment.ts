// Replenishment plan per store: a 14-day velocity forecast (@/lib/forecast) + par/reorder levels + stock on order →
// suggested quantities, ready to become a wholesale order. The forecast drives the suggestion; the 28-day average
// and days of cover are still shown for context.
import { db } from "./db";
import { availability, availKey } from "./inventory";
import { daysOfCover } from "@/lib/replenish";
import { FORECAST_WINDOW, dailySeries, forecast, forecastQty } from "@/lib/forecast";
import { addDays, dateOnly, dayKey } from "@/lib/format";

export const LEAD_DAYS = 3;
export const COVER_DAYS = 14;

export async function replenishmentPlan(storeId: string, opts: { leadDays?: number; coverDays?: number } = {}) {
  const now = new Date();
  const since = dateOnly(addDays(now, -28));
  // The forecast window ends yesterday: today is still trading and would read as a slow day.
  const yesterday = dayKey(addDays(now, -1));
  const windowFrom = dateOnly(addDays(now, -FORECAST_WINDOW));
  const leadDays = opts.leadDays ?? LEAD_DAYS;
  const coverDays = opts.coverDays ?? COVER_DAYS;
  const [ranged, sold, daily, onOrderRows] = await Promise.all([
    db.storeVariant.findMany({
      where: { storeId, variant: { active: true, product: { status: "ACTIVE" } } },
      include: { variant: { include: { product: { select: { name: true, regClass: true, category: { select: { name: true, slug: true } } } } } } },
    }),
    db.dailyVariantStat.groupBy({ by: ["variantId"], where: { storeId, date: { gte: since } }, _sum: { units: true } }),
    db.dailyVariantStat.findMany({ where: { storeId, date: { gte: windowFrom, lte: dateOnly(addDays(now, -1)) } }, select: { variantId: true, date: true, units: true } }),
    db.$queryRaw<{ variantId: string; qty: number }[]>`
      SELECT l."variantId", SUM(l.qty)::int AS qty FROM "StockOrderLine" l JOIN "StockOrder" o ON o.id = l."stockOrderId"
      WHERE o."buyerId" = ${storeId} AND o.status IN ('SUBMITTED', 'APPROVED', 'SHIPPED') GROUP BY 1`,
  ]);
  const avail = await availability([storeId], ranged.map((r) => r.variantId));
  const soldBy = new Map(sold.map((s) => [s.variantId, s._sum.units ?? 0]));
  const onOrder = new Map(onOrderRows.map((r) => [r.variantId, r.qty]));
  const days = new Map<string, { date: string; units: number }[]>();
  for (const d of daily) days.set(d.variantId, [...(days.get(d.variantId) ?? []), { date: d.date.toISOString().slice(0, 10), units: d.units }]);

  return ranged
    .map((r) => {
      const a = avail.get(availKey(storeId, r.variantId))?.available ?? 0;
      const avgDaily = (soldBy.get(r.variantId) ?? 0) / 28;
      const oo = onOrder.get(r.variantId) ?? 0;
      const series = dailySeries(days.get(r.variantId) ?? [], FORECAST_WINDOW, yesterday);
      const f = forecast(series, { leadDays });
      return {
        variantId: r.variantId,
        sku: r.variant.sku,
        name: `${r.variant.product.name} · ${r.variant.name}`,
        category: r.variant.product.category.name,
        available: a,
        onOrder: oo,
        reorderPoint: r.reorderPoint,
        parLevel: r.parLevel,
        avgDaily,
        cover: daysOfCover(a, f.perDay || avgDaily),
        forecastPerDay: f.perDay,
        forecastPerWeek: f.perWeek,
        safetyStock: f.safetyStock,
        wholesaleCents: r.variant.wholesaleCents,
        suggested: forecastQty({ available: a, onOrder: oo, reorderPoint: r.reorderPoint, parLevel: r.parLevel, daily: series, leadDays, coverDays }),
      };
    })
    .sort((x, y) => y.suggested - x.suggested || x.cover - y.cover);
}
export type ReplenishRow = Awaited<ReturnType<typeof replenishmentPlan>>[number];
