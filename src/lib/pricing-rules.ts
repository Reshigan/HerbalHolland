// Pure price resolution. Precedence (documented in docs/PRICING.md):
//   shelf  = store's own price → else best matching ZONE/CHANNEL list (priority, then newest) → else RRP
//   member = instant Rewards price: the member's tier % off shelf, or a MEMBER list price (tier-aware), whichever is lower
//   breaks = lowest quantity-break price with minQty ≤ qty if it beats the above
//   markdown (POS) = % off for stock nearing expiry
import { tierInfo } from "./loyalty-rules";

export type Tier = "SEED" | "SPROUT" | "BLOOM" | "HARVEST";

export type PriceListRule = {
  id: string;
  name: string;
  kind: "ZONE" | "CHANNEL" | "MEMBER" | "TRADE";
  channel?: "POS" | "ONLINE" | "WHOLESALE" | null;
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
  channel: "POS" | "ONLINE" | "WHOLESALE";
  member: boolean;
  tier?: Tier | null;
  tierPct?: number; // the member's instant tier saving (settings.loyalty.tierSavingsPct)
  at: Date;
};

/** `validUntil`: the end of the price list that set the unit price, when it has one (tier %, RRP and markdowns have none). */
export type ResolvedPrice = { rrpCents: number; shelfCents: number; unitCents: number; rule: string | null; validUntil: Date | null };

/** Active and inside its date window at `at`. */
export const listLive = (l: Pick<PriceListRule, "active" | "startsAt" | "endsAt">, at: Date) => l.active && !(l.startsAt && l.startsAt > at) && !(l.endsAt && l.endsAt < at);

export function listApplies(l: PriceListRule, c: PriceContext) {
  if (!listLive(l, c.at)) return false;
  // TRADE lists hold ex-VAT trade prices and belong to the WHOLESALE channel alone (resolveTradePrice); the consumer
  // lists never price a trade basket.
  if (l.kind === "TRADE" || c.channel === "WHOLESALE") return false;
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
  let validUntil: Date | null = null;
  const zone = live.filter((l) => l.kind !== "MEMBER").map((l) => ({ l, p: priceIn(l, v.variantId, v.rrpCents, 1) })).find((x) => x.p);
  if (ctx.channel === "POS" && v.storeShelfCents != null) (shelf = v.storeShelfCents), (rule = null);
  else if (zone) (shelf = zone.p!.price), (rule = null), (validUntil = zone.l.endsAt ?? null);

  let unit = shelf;
  if (v.incentives === false) return { rrpCents: v.rrpCents, shelfCents: shelf, unitCents: unit, rule, validUntil };
  if (ctx.member && ctx.tier && ctx.tierPct) {
    unit = Math.round((shelf * (100 - ctx.tierPct)) / 100);
    rule = `${tierInfo(ctx.tier).name} Rewards −${ctx.tierPct}%`;
    validUntil = null;
  }
  for (const l of live) {
    const p = priceIn(l, v.variantId, v.rrpCents, v.qty);
    if (!p || p.price >= unit) continue;
    if (l.kind === "MEMBER") (unit = p.price), (rule = l.name), (validUntil = l.endsAt ?? null);
    else if (p.minQty > 1) (unit = p.price), (rule = `${l.name} (${p.minQty}+)`), (validUntil = l.endsAt ?? null);
  }
  if (v.markdownPct) {
    unit = Math.round((unit * (100 - v.markdownPct)) / 100);
    rule = `Near-expiry −${v.markdownPct}%`;
  }
  return { rrpCents: v.rrpCents, shelfCents: shelf, unitCents: unit, rule, validUntil };
}

export type TradePrice = { unitCents: number; rule: string | null; validUntil: Date | null; minQty: number; listId: string | null };

/**
 * Trade (wholesale) unit price, ex VAT: the account's own TRADE list first, else the live TRADE lists by priority
 * (newest first on a tie), where the first list that prices the variant decides, taking its best quantity break with
 * minQty ≤ qty (`adjustPct` on a TRADE list adjusts the wholesale price); else `Variant.wholesaleCents`. Tiers,
 * member and zone/channel lists, markdowns and store shelf prices never apply; TRADE lists aren't scoped by store.
 */
export function resolveTradePrice(v: { variantId: string; wholesaleCents: number; qty: number }, lists: PriceListRule[], ctx: { accountListId?: string | null; at: Date }): TradePrice {
  const live = lists.filter((l) => l.kind === "TRADE" && listLive(l, ctx.at)).sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime());
  const own = ctx.accountListId ? live.find((l) => l.id === ctx.accountListId) : undefined;
  const ordered = own ? [own, ...live.filter((l) => l.id !== own.id)] : live;
  const qty = Math.max(1, v.qty);
  for (const l of ordered) {
    const explicit = l.items.filter((i) => i.variantId === v.variantId && i.minQty <= qty).sort((a, b) => b.minQty - a.minQty)[0];
    if (explicit) return { unitCents: explicit.priceCents, rule: explicit.minQty > 1 ? `${l.name} (${explicit.minQty}+)` : l.name, validUntil: l.endsAt ?? null, minQty: explicit.minQty, listId: l.id };
    if (l.adjustPct != null) return { unitCents: Math.round((v.wholesaleCents * (100 + l.adjustPct)) / 100), rule: l.name, validUntil: l.endsAt ?? null, minQty: 1, listId: l.id };
  }
  return { unitCents: v.wholesaleCents, rule: null, validUntil: null, minQty: 1, listId: null };
}

/** The quantity breaks a trade buyer can reach for a variant on the list that prices it, lowest quantity first (for the range page). */
export function tradeBreaks(v: { variantId: string; wholesaleCents: number }, lists: PriceListRule[], ctx: { accountListId?: string | null; at: Date }) {
  const first = resolveTradePrice({ ...v, qty: 1 }, lists, ctx);
  const list = first.listId ? lists.find((l) => l.id === first.listId) : undefined;
  const items = list ? list.items.filter((i) => i.variantId === v.variantId).sort((a, b) => a.minQty - b.minQty) : [];
  const breaks = items.map((i) => ({ minQty: i.minQty, unitCents: i.priceCents }));
  return breaks.length ? (breaks[0].minQty > 1 ? [{ minQty: 1, unitCents: first.unitCents }, ...breaks] : breaks) : [{ minQty: 1, unitCents: first.unitCents }];
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
