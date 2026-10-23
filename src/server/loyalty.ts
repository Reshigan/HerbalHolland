// Herbal Holland Rewards ledger operations. Points are a network liability: the issuing store
// funds them and the redeeming store is reimbursed on the franchise statement.
import type { Tx } from "./db";
import { queuePosting } from "./ledger/core";
import { heldTier, maxTier, pointsFor, tierFor, type TierKey } from "@/lib/loyalty-rules";
import { POINTS_SOURCE_KINDS } from "@/lib/ledger-hq";
import { dayKey } from "@/lib/format";
import { floorFor, ladderStep } from "@/lib/referral-ladder";
import { audit, SYSTEM } from "./audit";
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
  if (POINTS_SOURCE_KINDS.includes(a.kind)) await queuePosting(t, "points", dayKey(new Date())); // points HQ gives, or that expire: HQ's books
}

/**
 * Spends points only if the member has them, in one statement, so two redemptions at once can't spend the same
 * points. `overdraw`: a till sale queued offline records what the member was given (loss prevention flags it).
 */
export async function redeemPoints(t: Tx, a: { customerId: string; points: number; storeId?: string | null; saleId?: string; orderId?: string; overdraw?: boolean }) {
  if (a.points <= 0) return;
  const { overdraw, ...entry } = a;
  if (overdraw) return addPoints(t, { ...entry, points: -a.points, kind: "REDEEM" });
  const { count } = await t.customer.updateMany({ where: { id: a.customerId, points: { gte: a.points } }, data: { points: { decrement: a.points } } });
  if (!count) throw new LoyaltyError(`Only ${(await t.customer.findUnique({ where: { id: a.customerId }, select: { points: true } }))?.points ?? 0} points available`);
  await t.loyaltyEntry.create({ data: { ...entry, points: -a.points, kind: "REDEEM" } });
}

/**
 * Updates purchase stats, re-tiers the member on rolling 12-month spend and awards
 * points on what was actually paid. Handles first-purchase referral rewards.
 */
export async function recordPurchase(
  t: Tx,
  a: { customerId: string; storeId: string; paidCents: number; totalCents: number; multiplier: number; saleId: string; orderId?: string; at: Date; earnPer100: number; referralBonus: number },
) {
  // The member's row first (no row locks on D1: writes are serialised, so the second of two first purchases sees the first).
  const before = await t.customer.findUniqueOrThrow({ where: { id: a.customerId } });
  const spend = await spend12m(t, a.customerId);
  const tier = heldTier(tierFor(spend).key as TierKey, before.tierFloor, before.tierFloorUntil, a.at);
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
    await addPoints(t, { customerId: a.customerId, points: a.referralBonus, kind: "REFERRAL", storeId: a.storeId, note: "Welcome: you were referred" });
    await addPoints(t, { customerId: before.referredById, points: a.referralBonus, kind: "REFERRAL", storeId: a.storeId, note: `Referral: ${before.firstName}` });
    await climbReferralLadder(t, before.referredById, a.at);
  }
  return { points, tier, tierChanged: tier !== before.tier };
}

/** Friends who joined with this member's link and have made their first purchase (joins alone never count). */
export async function qualifiedReferrals(t: Tx, customerId: string) {
  return t.customer.count({ where: { referredById: customerId, firstPurchaseAt: { not: null } } });
}

/**
 * The referral ladder, right after a referrer is paid for a friend's first purchase (this friend's firstPurchaseAt is
 * already set). At exactly 3 qualified referrals the referrer gets the next tier up for 30 days as a tier floor; 10 is
 * Windmill Crew, derived from the count and never stored. Granted once per member (the audit row is the receipt), and
 * floorFor never lowers or shortens a floor, so a rerun or a count that dips and climbs back pays nothing twice.
 */
async function climbReferralLadder(t: Tx, referrerId: string, at: Date) {
  const count = await qualifiedReferrals(t, referrerId);
  if (ladderStep(count)?.kind !== "BOOST") return;
  if (await t.auditLog.findFirst({ where: { action: "customer.referral_ladder", entityId: referrerId }, select: { id: true } })) return;
  const r = await t.customer.findUnique({ where: { id: referrerId }, select: { tier: true, tierFloor: true, tierFloorUntil: true } });
  if (!r) return;
  const floor = floorFor(r.tier as TierKey, r.tierFloor as TierKey | null, r.tierFloorUntil, at);
  // The marker goes first: if the run stops between the two writes the boost is missed (HQ can grant it), never doubled.
  await audit(t, SYSTEM, "customer.referral_ladder", {
    entity: "Customer", entityId: referrerId,
    data: { qualified: count, from: r.tier, floor: floor?.tier ?? null, until: floor?.until.toISOString() ?? null, kept: floor ? null : `${r.tierFloor} until ${r.tierFloorUntil?.toISOString()}` },
  });
  if (floor) {
    await t.customer.update({ where: { id: referrerId }, data: { tierFloor: floor.tier, tierFloorUntil: floor.until, tier: maxTier(r.tier as TierKey, floor.tier) } });
  }
}
