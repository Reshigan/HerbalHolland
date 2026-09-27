// Pure price resolution. Precedence (documented in docs/PRICING.md):
//   shelf  = store's own price → else best matching ZONE/CHANNEL list (priority, then newest) → else RRP
//   member = lowest applicable MEMBER list price (tier-aware) if it beats shelf
//   breaks = lowest quantity-break price with minQty ≤ qty if it beats the above
//   markdown (POS) = % off for stock nearing expiry
export type Tier = "SEED" | "SPROUT" | "BLOOM" | "ORANJE";

export type PriceListRule = {
  id: string;
  name: string;
  kind: "ZONE" | "CHANNEL" | "MEMBER";
  channel?: "POS" | "ONLINE" | null;
  tiers: Tier[];
  storeIds: string[];
  regionIds: string[];
  adjustPct?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  active: boolean;
  priority: number;
  createdAt: Date;
  items: { variantId: string; priceCents: number; minQty: number }[];
};

export type PriceContext = {
  storeId?: string | null;
  regionId?: string | null;
  channel: "POS" | "ONLINE";
  member: boolean;
  tier?: Tier | null;
  at: Date;
};

export type ResolvedPrice = { rrpCents: number; shelfCents: number; unitCents: number; rule: string | null };

export function listApplies(l: PriceListRule, c: PriceContext) {
  if (!l.active) return false;
  if (l.startsAt && l.startsAt > c.at) return false;
  if (l.endsAt && l.endsAt < c.at) return false;
  if (l.channel && l.channel !== c.channel) return false;
  const placed = !l.storeIds.length && !l.regionIds.length;
  const inPlace = placed || (!!c.storeId && l.storeIds.includes(c.storeId)) || (!!c.regionId && l.regionIds.includes(c.regionId));
  if (!inPlace) return false;
  if (l.kind === "MEMBER") return c.member && (!l.tiers.length || (!!c.tier && l.tiers.includes(c.tier)));
  return true;
}

const priceIn = (l: PriceListRule, variantId: string, rrp: number, qty: number) => {
  const explicit = l.items.filter((i) => i.variantId === variantId && i.minQty <= qty).sort((a, b) => b.minQty - a.minQty)[0];
  if (explicit) return { price: explicit.priceCents, minQty: explicit.minQty };
  if (l.adjustPct != null) return { price: Math.round((rrp * (100 + l.adjustPct)) / 100), minQty: 1 };
  return null;
};

export function resolvePrice(
  v: { variantId: string; rrpCents: number; storeShelfCents?: number | null; qty: number; markdownPct?: number | null; incentives?: boolean },
  lists: PriceListRule[],
  ctx: PriceContext,
): ResolvedPrice {
  const live = lists.filter((l) => listApplies(l, ctx)).sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime());

  let shelf = v.rrpCents;
  let rule: string | null = null;
  const zone = live.filter((l) => l.kind !== "MEMBER").map((l) => ({ l, p: priceIn(l, v.variantId, v.rrpCents, 1) })).find((x) => x.p);
  if (ctx.channel === "POS" && v.storeShelfCents != null) (shelf = v.storeShelfCents), (rule = null);
  else if (zone) (shelf = zone.p!.price), (rule = null);

  let unit = shelf;
  if (v.incentives === false) return { rrpCents: v.rrpCents, shelfCents: shelf, unitCents: unit, rule };
  for (const l of live) {
    const p = priceIn(l, v.variantId, v.rrpCents, v.qty);
    if (!p || p.price >= unit) continue;
    if (l.kind === "MEMBER") (unit = p.price), (rule = l.name);
    else if (p.minQty > 1) (unit = p.price), (rule = `${l.name} (${p.minQty}+)`);
  }
  if (v.markdownPct) {
    unit = Math.round((unit * (100 - v.markdownPct)) / 100);
    rule = `Near-expiry −${v.markdownPct}%`;
  }
  return { rrpCents: v.rrpCents, shelfCents: shelf, unitCents: unit, rule };
}

/** Is a promotion's happy-hour / day-of-week window open at `at` (SAST)? */
export function promoWindowOpen(p: { days?: number[] | null; startMinute?: number | null; endMinute?: number | null }, at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const minute = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  if (p.days?.length && !p.days.includes(day)) return false;
  if (p.startMinute != null && minute < p.startMinute) return false;
  if (p.endMinute != null && minute >= p.endMinute) return false;
  return true;
}

export const marginPct = (priceInclCents: number, costExclCents: number) => {
  const ex = priceInclCents / 1.15;
  return ex > 0 ? (ex - costExclCents) / ex : 0;
};
