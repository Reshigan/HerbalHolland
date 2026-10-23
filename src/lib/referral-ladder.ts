// The referral ladder (Herbal Holland Rewards). A qualified referral is a friend who joined with the member's link and
// has made their first purchase: the moment the referral points are paid. Joins alone never count.
import { maxTier, tierInfo, tierRank, TIERS, type TierKey } from "@/lib/loyalty-rules";

export const BOOST_DAYS = 30;
export const RUNGS = [
  { at: 3, kind: "BOOST", reward: `The next tier up for ${BOOST_DAYS} days` },
  { at: 10, kind: "CREW", reward: "Windmill Crew status" },
] as const;
export type Rung = (typeof RUNGS)[number];

/** The rung a member has just reached with this many qualified referrals (only on the exact count), or null. */
export const ladderStep = (count: number): Rung | null => RUNGS.find((r) => r.at === count) ?? null;

/** The next rung up and what it gives, or null once the top rung is reached. */
export const nextRung = (count: number) => {
  const r = RUNGS.find((x) => x.at > count);
  return r ? { at: r.at, reward: r.reward, kind: r.kind, remaining: r.at - count } : null;
};

/** Windmill Crew: a badge (no discount), derived from the count, never stored. */
export const windmillCrew = (count: number) => count >= RUNGS[RUNGS.length - 1].at;

/** The 3-friend boost is due: at least 3 qualified referrals and not granted before (`granted`: its audit marker exists). */
export const boostDue = (count: number, granted: boolean) => !granted && count >= RUNGS[0].at;

/** A tier held until a date (a floor or a boost), or null when there is none or it has lapsed at `now`. */
export const activeHold = (tier: TierKey | string | null | undefined, until: Date | null | undefined, now = new Date()) =>
  tier && until && until > now ? { tier: tier as TierKey, until } : null;

/**
 * The tier a member holds: the highest of the tier their 12-month spend earns, an active tier floor (Founding Members,
 * First Year Members) and an active referral boost. The floor and the boost are separate, so each lapses on its own.
 */
export function effectiveTier(
  spendTier: TierKey,
  floor: TierKey | string | null | undefined,
  floorUntil: Date | null | undefined,
  boost: TierKey | string | null | undefined,
  boostUntil: Date | null | undefined,
  now = new Date(),
): TierKey {
  return maxTier(maxTier(spendTier, activeHold(floor, floorUntil, now)?.tier), activeHold(boost, boostUntil, now)?.tier);
}

/**
 * The guarantee that holds a member's tier right now, for display: the higher of an active floor and an active boost
 * (on a tie, the one that runs longer). Null when neither is active.
 */
export function holdingGuarantee(
  floor: TierKey | string | null | undefined,
  floorUntil: Date | null | undefined,
  boost: TierKey | string | null | undefined,
  boostUntil: Date | null | undefined,
  now = new Date(),
) {
  const f = activeHold(floor, floorUntil, now);
  const b = activeHold(boost, boostUntil, now);
  if (!f || !b) return f ? { ...f, kind: "FLOOR" as const } : b ? { ...b, kind: "BOOST" as const } : null;
  const d = tierRank(b.tier) - tierRank(f.tier);
  return d > 0 || (d === 0 && b.until > f.until) ? { ...b, kind: "BOOST" as const } : { ...f, kind: "FLOOR" as const };
}

/**
 * The boost the 3-friend rung gives: one tier above the member's effective tier (never above the top tier), for
 * BOOST_DAYS from `now`. It is stored apart from any tier floor and applies on top of it; a floor that runs longer
 * carries on after the boost ends.
 */
export function boostFor(current: TierKey, now = new Date()) {
  const tier = TIERS[Math.min(tierRank(current) + 1, TIERS.length - 1)].key;
  return { tier, until: new Date(now.getTime() + BOOST_DAYS * 86_400_000), name: tierInfo(tier).name };
}
