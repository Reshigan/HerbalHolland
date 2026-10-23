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

/**
 * The tier floor the 3-friend rung writes: one tier above the higher of the member's tier and any active floor (never
 * above the top tier), for BOOST_DAYS from `now`. Null when it would not improve the floor the member already has:
 * a floor is never lowered or shortened (a founding member's longer guarantee stays as it is).
 */
export function floorFor(currentTier: TierKey, existingFloor: TierKey | null | undefined, existingUntil: Date | null | undefined, now = new Date()) {
  const active = existingFloor && existingUntil && existingUntil > now ? { tier: existingFloor, until: existingUntil } : null;
  const base = maxTier(currentTier, active?.tier);
  const tier = TIERS[Math.min(tierRank(base) + 1, TIERS.length - 1)].key;
  const until = new Date(now.getTime() + BOOST_DAYS * 86_400_000);
  if (active && (tierRank(tier) < tierRank(active.tier) || until <= active.until)) return null;
  return { tier, until, name: tierInfo(tier).name };
}
