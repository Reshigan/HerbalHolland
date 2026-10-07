// Drop rules (pure): when a shopper may buy a limited release, and how many.
import { tierRank, type TierKey } from "./loyalty-rules";

export type DropRule = {
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  earlyTier: TierKey | null;
  earlyMinutes: number;
  perMemberLimit: number;
  membersOnly: boolean;
};

/** When the drop opens for this shopper: `earlyMinutes` sooner at or above the early-access tier. */
export function opensFor(d: DropRule, tier: TierKey | null) {
  const early = !!d.earlyTier && !!tier && tierRank(tier) >= tierRank(d.earlyTier);
  return new Date(d.startsAt.getTime() - (early ? d.earlyMinutes * 60_000 : 0));
}

/** Why this shopper can't buy `qty` more now (null = they can). `bought` = units already bought or on open orders. */
export function dropBlock(d: DropRule, who: { member: boolean; tier: TierKey | null; bought: number }, qty: number, at: Date) {
  if (d.endsAt && at > d.endsAt) return null; // after the drop, remaining stock sells normally
  if (d.membersOnly && !who.member) return `${d.name} is for Herbal Holland Rewards members: join free to buy`;
  if (at < opensFor(d, who.tier)) return `${d.name} isn't open yet`;
  if (who.bought + qty > d.perMemberLimit) return `${d.name}: limit ${d.perMemberLimit} per member`;
  return null;
}
