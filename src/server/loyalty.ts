// Windmill Club ledger operations. Points are a network liability: the issuing store
// funds them and the redeeming store is reimbursed on the franchise statement.
import type { Tx } from "./db";
import { pointsFor, tierFor, type TierKey } from "@/lib/loyalty-rules";
import type { LoyaltyKind } from "@/generated/prisma/client";

export class LoyaltyError extends Error {}

export async function spend12m(t: Tx, customerId: string) {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const r = await t.sale.aggregate({ where: { customerId, createdAt: { gte: since } }, _sum: { totalCents: true } });
  return r._sum.totalCents ?? 0;
}

export async function addPoints(
  t: Tx,
  a: { customerId: string; points: number; kind: LoyaltyKind; storeId?: string | null; saleId?: string; orderId?: string; note?: string },
) {
  if (!a.points) return;
  await t.loyaltyEntry.create({ data: a });
  await t.customer.update({ where: { id: a.customerId }, data: { points: { increment: a.points } } });
}

export async function redeemPoints(t: Tx, a: { customerId: string; points: number; storeId?: string | null; saleId?: string; orderId?: string }) {
  if (a.points <= 0) return;
  const c = await t.customer.findUniqueOrThrow({ where: { id: a.customerId }, select: { points: true } });
  if (c.points < a.points) throw new LoyaltyError(`Only ƒ${c.points} available`);
  await addPoints(t, { ...a, points: -a.points, kind: "REDEEM" });
}

/**
 * Updates purchase stats, re-tiers the member on rolling 12-month spend and awards
 * Guilders on what was actually paid. Handles first-purchase referral rewards.
 */
export async function recordPurchase(
  t: Tx,
  a: { customerId: string; storeId: string; paidCents: number; totalCents: number; multiplier: number; saleId: string; orderId?: string; at: Date; earnPer100: number; referralBonus: number },
) {
  const before = await t.customer.findUniqueOrThrow({ where: { id: a.customerId } });
  const spend = await spend12m(t, a.customerId);
  const tier = tierFor(spend).key as TierKey;
  const points = pointsFor(a.paidCents, tier, a.multiplier, a.earnPer100);
  await t.customer.update({
    where: { id: a.customerId },
    data: {
      tier,
      visits: { increment: 1 },
      lifetimeCents: { increment: a.totalCents },
      lastPurchaseAt: a.at,
      firstPurchaseAt: before.firstPurchaseAt ?? a.at,
      lastSeenAt: a.at,
    },
  });
  await addPoints(t, { customerId: a.customerId, points, kind: "EARN", storeId: a.storeId, saleId: a.saleId, orderId: a.orderId });
  if (before.visits === 0 && before.referredById && a.referralBonus > 0) {
    await addPoints(t, { customerId: a.customerId, points: a.referralBonus, kind: "REFERRAL", storeId: a.storeId, note: "Welcome — you were referred" });
    await addPoints(t, { customerId: before.referredById, points: a.referralBonus, kind: "REFERRAL", storeId: a.storeId, note: `Referral: ${before.firstName}` });
  }
  return { points, tier, tierChanged: tier !== before.tier };
}
