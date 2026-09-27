// Windmill Club — the Herbal Holland loyalty programme. Currency: Guilders (ƒ).
// Earn on what the member actually pays (not on Guilders redeemed). 1 Guilder = R1.
export type TierKey = "SEED" | "SPROUT" | "BLOOM" | "HARVEST";

export const TIERS: { key: TierKey; name: string; minCents: number; multiplier: number; perks: string[] }[] = [
  { key: "SEED", name: "Seed", minCents: 0, multiplier: 1, perks: ["5 Guilders per R100", "Birthday bonus", "Member-only drops"] },
  { key: "SPROUT", name: "Sprout", minCents: 250_000, multiplier: 1.25, perks: ["1.25× Guilders", "Early access to drops", "Free grinder on tier-up"] },
  { key: "BLOOM", name: "Bloom", minCents: 750_000, multiplier: 1.5, perks: ["1.5× Guilders", "Free same-day delivery", "Members' evenings"] },
  { key: "HARVEST", name: "Harvest", minCents: 1_500_000, multiplier: 2, perks: ["2× Guilders", "Personal budtender", "First access to Reserve batches"] },
];

export const POINT_VALUE_CENTS = 100;
export const EARN_PER_100 = 5;

export const tierFor = (spend12mCents: number) => [...TIERS].reverse().find((t) => spend12mCents >= t.minCents)!;
export const tierInfo = (key: TierKey) => TIERS.find((t) => t.key === key)!;

export function nextTier(spend12mCents: number) {
  const i = TIERS.findIndex((t) => t.key === tierFor(spend12mCents).key);
  const next = TIERS[i + 1];
  return next ? { tier: next, remainingCents: next.minCents - spend12mCents, progress: spend12mCents / next.minCents } : null;
}

export function pointsFor(paidCents: number, tier: TierKey, promoMultiplier = 1, earnPer100 = EARN_PER_100) {
  if (paidCents <= 0) return 0;
  return Math.floor((paidCents / 10_000) * earnPer100 * tierInfo(tier).multiplier * promoMultiplier);
}

export const guilders = (points: number) => `ƒ${new Intl.NumberFormat("en-US").format(points)}`;
