// Local marketing read models: the store's own promotions (and HQ deals running there),
// usage at the store's tills, and the store's campaigns with attributed sales.
import { db } from "@/server/db";
import { campaignResults } from "@/server/marketing";
import { promoWindowOpen } from "@/lib/pricing-rules";
import type { Promotion } from "@/generated/prisma/client";

export type PromoState = "live" | "idle" | "scheduled" | "ended" | "paused";

/** Live now, live today but outside its happy-hour window, not started, ended or switched off. */
export function promoState(p: Pick<Promotion, "active" | "startsAt" | "endsAt" | "days" | "startMinute" | "endMinute">, now = new Date()): PromoState {
  if (!p.active) return p.endsAt <= now ? "ended" : "paused";
  if (p.endsAt < now) return "ended";
  if (p.startsAt > now) return "scheduled";
  return promoWindowOpen(p, now) ? "live" : "idle";
}

export async function storePromotions(store: { id: string }) {
  const now = new Date();
  const [own, network] = await Promise.all([
    db.promotion.findMany({ where: { ownerStoreId: store.id }, orderBy: [{ active: "desc" }, { endsAt: "desc" }], take: 100 }),
    db.promotion.findMany({
      // Network-wide promotions may store storeIds as NULL rather than '{}' (see server/pricing activePromotions).
      where: { ownerStoreId: null, active: true, endsAt: { gte: now }, channels: { has: "POS" }, OR: [{ storeIds: { isEmpty: true } }, { storeIds: { equals: null } }, { storeIds: { has: store.id } }] },
      orderBy: { endsAt: "asc" },
    }),
  ]);
  const ids = [...own, ...network].map((p) => p.id);
  const usage = await db.sale.groupBy({ by: ["promotionId"], where: { storeId: store.id, promotionId: { in: ids } }, _count: true, _sum: { discountCents: true } });
  const used = new Map(usage.map((u) => [u.promotionId!, { sales: u._count, discountCents: u._sum.discountCents ?? 0 }]));
  // Seeded rows can hold NULL arrays; normalise so describePromo and the UI can rely on them.
  const withUse = <T extends Promotion>(p: T) => ({
    ...p,
    categoryIds: p.categoryIds ?? [],
    productIds: p.productIds ?? [],
    rewardCategoryIds: p.rewardCategoryIds ?? [],
    rewardProductIds: p.rewardProductIds ?? [],
    days: p.days ?? [],
    state: promoState(p, now),
    use: used.get(p.id) ?? { sales: 0, discountCents: 0 },
  });
  return { own: own.map(withUse), network: network.map(withUse) };
}

export async function storeCampaigns(storeId: string, page: number, pageSize: number) {
  const where = { storeId };
  const [total, rows] = await Promise.all([
    db.campaign.count({ where }),
    db.campaign.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const results = await campaignResults(rows.map((r) => r.id));
  return { total, rows: rows.map((r) => ({ ...r, result: results.get(r.id) ?? { revenueCents: 0, orders: 0 } })) };
}
