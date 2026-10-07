// Herbal Holland Rewards — the loyalty programme. Currency: points (1 point = R1).
// Earn on what the member actually pays (not on points redeemed).
export type TierKey = "SEED" | "SPROUT" | "BLOOM" | "HARVEST";

/**
 * The tiers. `perks` are what a tier adds to the tiers below it (a tier keeps every perk under it), and only perks the
 * platform delivers: the birthday bonus (jobs), members-only drops and members' evenings (any member), early access to
 * a drop for the tier HQ opens it to and up (Drop.earlyTier), and free same-day delivery from Bloom (orders.ts).
 */
export const TIERS: { key: TierKey; name: string; minCents: number; multiplier: number; perks: string[] }[] = [
  { key: "SEED", name: "Seed", minCents: 0, multiplier: 1, perks: ["Birthday bonus", "Member-only drops", "Members' evenings"] },
  { key: "SPROUT", name: "Sprout", minCents: 250_000, multiplier: 1, perks: ["Early access to selected drops"] },
  { key: "BLOOM", name: "Bloom", minCents: 750_000, multiplier: 1, perks: ["Free same-day delivery, where available", "Early access to more drops"] },
  { key: "HARVEST", name: "Harvest", minCents: 1_500_000, multiplier: 1, perks: ["Early access whenever a drop opens early"] },
];

/** Instant savings % per tier (HQ can change them in settings). Applied at the till and online, never on medicines. */
export const DEFAULT_TIER_SAVINGS: Record<TierKey, number> = { SEED: 3, SPROUT: 5, BLOOM: 7, HARVEST: 10 };

/** Everything a tier gets, headline first: "7% off instantly", "5 points per R100", then its perks. */
export const tierBenefits = (key: TierKey, savingsPct: Record<TierKey, number>, earnPer100: number) => [
  ...(savingsPct[key] ? [`${savingsPct[key]}% off instantly`] : []),
  ...(earnPer100 ? [`${earnPer100} points per R100`] : []),
  ...tierInfo(key).perks,
];

export const POINT_VALUE_CENTS = 100;
export const EARN_PER_100 = 5;

export const tierFor = (spend12mCents: number) => [...TIERS].reverse().find((t) => spend12mCents >= t.minCents)!;
export const tierInfo = (key: TierKey) => TIERS.find((t) => t.key === key)!;
export const tierRank = (key: TierKey) => TIERS.findIndex((t) => t.key === key);
export const maxTier = (a: TierKey, b?: TierKey | null) => (b && tierRank(b) > tierRank(a) ? b : a);

/** The tier a member holds: earned on 12-month spend, never below an active floor (e.g. Founding Members). */
export const heldTier = (earned: TierKey, floor?: TierKey | null, until?: Date | null, at = new Date()) =>
  floor && until && until > at ? maxTier(earned, floor) : earned;

export function nextTier(spend12mCents: number) {
  const i = TIERS.findIndex((t) => t.key === tierFor(spend12mCents).key);
  const next = TIERS[i + 1];
  return next ? { tier: next, remainingCents: next.minCents - spend12mCents, progress: spend12mCents / next.minCents } : null;
}

export function pointsFor(paidCents: number, tier: TierKey, promoMultiplier = 1, earnPer100 = EARN_PER_100) {
  if (paidCents <= 0) return 0;
  return Math.floor((paidCents / 10_000) * earnPer100 * tierInfo(tier).multiplier * promoMultiplier);
}

export const fmtPoints = (points: number) => `${new Intl.NumberFormat("en-US").format(points)} pts`;
