// Replenishment plan per store: velocity (28-day rollups) + par/reorder levels +
// stock on order → suggested quantities, ready to become a wholesale order.
import { db } from "./db";
import { availability, availKey } from "./inventory";
import { suggestQty, daysOfCover } from "@/lib/replenish";
import { addDays, dateOnly } from "@/lib/format";

export async function replenishmentPlan(storeId: string, opts: { leadDays?: number; coverDays?: number } = {}) {
  const since = dateOnly(addDays(new Date(), -28));
  const [ranged, sold, onOrderRows] = await Promise.all([
    db.storeVariant.findMany({
      where: { storeId, variant: { active: true, product: { status: "ACTIVE" } } },
      include: { variant: { include: { product: { select: { name: true, regClass: true, category: { select: { name: true, slug: true } } } } } } },
    }),
    db.dailyVariantStat.groupBy({ by: ["variantId"], where: { storeId, date: { gte: since } }, _sum: { units: true } }),
    db.$queryRaw<{ variantId: string; qty: number }[]>`
      SELECT l."variantId", SUM(l.qty)::int AS qty FROM "StockOrderLine" l JOIN "StockOrder" o ON o.id = l."stockOrderId"
      WHERE o."buyerId" = ${storeId} AND o.status IN ('SUBMITTED', 'APPROVED', 'SHIPPED') GROUP BY 1`,
  ]);
  const avail = await availability([storeId], ranged.map((r) => r.variantId));
  const soldBy = new Map(sold.map((s) => [s.variantId, s._sum.units ?? 0]));
  const onOrder = new Map(onOrderRows.map((r) => [r.variantId, r.qty]));

  return ranged
    .map((r) => {
      const a = avail.get(availKey(storeId, r.variantId))?.available ?? 0;
      const avgDaily = (soldBy.get(r.variantId) ?? 0) / 28;
      const oo = onOrder.get(r.variantId) ?? 0;
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
        cover: daysOfCover(a, avgDaily),
        wholesaleCents: r.variant.wholesaleCents,
        suggested: suggestQty({ available: a, onOrder: oo, reorderPoint: r.reorderPoint, parLevel: r.parLevel, avgDaily, ...opts }),
      };
    })
    .sort((x, y) => y.suggested - x.suggested || x.cover - y.cover);
}
export type ReplenishRow = Awaited<ReturnType<typeof replenishmentPlan>>[number];
