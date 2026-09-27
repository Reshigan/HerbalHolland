// Customer segmentation from denormalised purchase stats (recency, frequency, monetary).
export type SegmentKey = "NEW" | "CHAMPION" | "LOYAL" | "PROMISING" | "AT_RISK" | "LAPSED" | "PROSPECT";

export const SEGMENTS: Record<SegmentKey, { name: string; blurb: string; play: string }> = {
  CHAMPION: { name: "Champions", blurb: "Bought in the last 30 days, 10+ visits", play: "Reward & recruit: referral asks, Reserve early access" },
  LOYAL: { name: "Loyal", blurb: "Bought in the last 60 days, 5+ visits", play: "Tier-up nudges, new-drop previews" },
  PROMISING: { name: "Promising", blurb: "Recent, 2–4 visits", play: "Education + second-category cross-sell" },
  NEW: { name: "New", blurb: "First purchase in the last 30 days", play: "Welcome journey: how Guilders work, strain guide" },
  AT_RISK: { name: "At risk", blurb: "3+ visits but quiet for 60–120 days", play: "Win-back: double Guilders weekend" },
  LAPSED: { name: "Lapsed", blurb: "No purchase for 120+ days", play: "Reactivation offer, then suppress" },
  PROSPECT: { name: "Prospects", blurb: "Joined, never purchased", play: "First-visit offer at their home store" },
};

export type RfmStats = { visits: number; firstPurchaseAt?: Date | null; lastPurchaseAt?: Date | null };

export function segmentOf(c: RfmStats, now = new Date()): SegmentKey {
  if (!c.lastPurchaseAt || c.visits === 0) return "PROSPECT";
  const days = (now.getTime() - c.lastPurchaseAt.getTime()) / 86_400_000;
  const sinceFirst = c.firstPurchaseAt ? (now.getTime() - c.firstPurchaseAt.getTime()) / 86_400_000 : Infinity;
  if (days <= 30 && c.visits >= 10) return "CHAMPION";
  if (sinceFirst <= 30 && c.visits <= 2) return "NEW";
  if (days <= 60 && c.visits >= 5) return "LOYAL";
  if (days <= 60) return "PROMISING";
  if (days <= 120 && c.visits >= 3) return "AT_RISK";
  if (days <= 120) return "PROMISING";
  return "LAPSED";
}
