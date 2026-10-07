// Server-side pricing: price lists (zones, scheduled changes, channel, member/tier,
// quantity breaks), franchisee shelf prices, near-expiry markdowns, then promotions
// (with happy-hour windows). Always recomputed server-side; clients only display.
import { db, type Tx } from "./db";
import { getSettings } from "./settings";
import { activeOffers, isOffer, offerPromo } from "./offers";
import { applyPromotions, type PromoInput, type Suggestion } from "@/lib/promotions";
import { resolvePrice, promoWindowOpen, resolveTradePrice, tradeBreaks, listLive, type PriceContext, type PriceListRule, type Tier } from "@/lib/pricing-rules";
import { vatOf } from "@/lib/money";
import { addDays } from "@/lib/format";
import type { Channel, Prisma } from "@/generated/prisma/client";
import { incentiveExcluded, tradeAllowed, type RegClass } from "@/lib/compliance";
import { rangeSearchTerms, vatHalfUp } from "@/lib/trade";
import { similarProducts } from "./shop/search";
import { availability, availKey, OPEN_ORDER_STATUSES } from "./inventory";
import { lockPromotion } from "./locks";

export async function activePromotions(opts: { storeId?: string | null; channel: Channel; at?: Date }) {
  const at = opts.at ?? new Date();
  const rows = await db.promotion.findMany({
    where: {
      active: true,
      startsAt: { lte: at },
      endsAt: { gte: at },
      channels: { has: opts.channel },
      OR: [{ storeIds: { isEmpty: true } }, ...(opts.storeId ? [{ storeIds: { has: opts.storeId } }] : [])],
    },
    orderBy: { createdAt: "desc" },
  });
  // Usage caps: a use is a sale that carried the promotion (as HQ reports it).
  const capped = rows.filter((p) => p.maxUses != null).map((p) => p.id);
  const used = new Map(
    capped.length
      ? (await db.sale.groupBy({ by: ["promotionId"], where: { promotionId: { in: capped }, kind: "SALE" }, _count: true })).map((u) => [u.promotionId, u._count])
      : [],
  );
  return rows.filter((p) => promoWindowOpen(p, at) && (p.maxUses == null || (used.get(p.id) ?? 0) < p.maxUses));
}

/**
 * Re-checks the promotion a quote applied, inside the order or sale transaction (after lockCustomer): a welcome gift
 * (first purchase only) needs a member with no purchase and no open online order yet, and a capped promotion (locked
 * here, then counted as sales plus open online orders) must still have a use left. Why it can't apply now, or null.
 */
export async function promotionProblem(t: Tx, a: { promotionId: string | null | undefined; customerId: string | null | undefined }) {
  if (!a.promotionId) return null;
  const p = await t.promotion.findUnique({ where: { id: a.promotionId }, select: { name: true, maxUses: true, firstPurchaseOnly: true } });
  if (!p) return null;
  if (p.firstPurchaseOnly) {
    const c = a.customerId ? await t.customer.findUnique({ where: { id: a.customerId }, select: { visits: true } }) : null;
    const open = a.customerId ? await t.order.count({ where: { customerId: a.customerId, status: { in: [...OPEN_ORDER_STATUSES] } } }) : 0;
    if (!c || c.visits > 0 || open > 0) return `${p.name} is for a member's first purchase only`;
  }
  if (p.maxUses != null) {
    await lockPromotion(t, a.promotionId);
    const sold = await t.sale.count({ where: { promotionId: a.promotionId, kind: "SALE" } }); // one at a time: a transaction's single connection
    const open = await t.order.count({ where: { promotionId: a.promotionId, status: { in: [...OPEN_ORDER_STATUSES] } } });
    if (sold + open >= p.maxUses) return `${p.name} has been fully claimed`;
  }
  return null;
}

/** Price context for a shopper with their instant tier saving; `tier: null` = walk-in, "SEED" = what joining saves. */
export async function priceContext(c: { channel: Channel; storeId?: string | null; regionId?: string | null; tier?: Tier | null; at?: Date }): Promise<PriceContext> {
  const tierPct = c.tier ? (await getSettings()).loyalty.tierSavingsPct[c.tier] : 0;
  return { storeId: c.storeId ?? null, regionId: c.regionId ?? null, channel: c.channel, member: !!c.tier, tier: c.tier ?? null, tierPct, at: c.at ?? new Date() };
}

export async function activePriceLists(at = new Date()): Promise<PriceListRule[]> {
  return db.priceList.findMany({
    where: { active: true, OR: [{ startsAt: null }, { startsAt: { lte: at } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: at } }] }] },
    include: { items: { select: { variantId: true, priceCents: true, minQty: true } } },
  });
}

/** Markdown % per variant at a store when its next-to-sell (FEFO) lot is close to expiry. */
async function markdowns(storeId: string, variantIds: string[], at: Date) {
  const { markdownDays, markdownPct } = (await getSettings()).pricing;
  if (!markdownPct) return new Map<string, number>();
  const lots = await db.stockLevel.findMany({
    where: { storeId, variantId: { in: variantIds }, onHand: { gt: 0 }, batch: { status: "RELEASED", expiresAt: { not: null } } },
    select: { variantId: true, batch: { select: { expiresAt: true } } },
    orderBy: { batch: { expiresAt: "asc" } },
  });
  const out = new Map<string, number>();
  for (const l of lots)
    if (!out.has(l.variantId)) out.set(l.variantId, l.batch.expiresAt! <= addDays(at, markdownDays) ? markdownPct : 0);
  return out;
}

export type QuoteLine = {
  variantId: string;
  productId: string;
  categoryId: string;
  name: string;
  productName: string;
  variantName: string;
  sku: string;
  regClass: RegClass;
  tobaccoRelated: boolean;
  grams: number | null;
  caseQty: number; // units per case (trade orders are placed in multiples of it; 1 for everything else)
  qty: number;
  rrpCents: number;
  shelfCents: number;
  unitPriceCents: number; // VAT incl., except on WHOLESALE quotes, where it is the ex-VAT trade price
  priceRule: string | null;
  priceValidUntil: Date | null; // end of the price list behind the unit price, when it has one (Offer.priceValidUntil)
  grossCents: number; // VAT incl.
  discountCents: number; // VAT incl.
  totalCents: number; // VAT incl.
  exCents: number; // the line ex VAT (totalCents − vatCents)
  vatCents: number;
  promoId?: string;
  noEarn: boolean; // excluded from incentives incl. points earn
  memberSavingsCents: number; // instant Rewards saving on this line vs the non-member price
  offerCents: number; // My Deals discount on this line (HQ-funded)
};

export type Quote = {
  lines: QuoteLine[];
  subtotalCents: number; // VAT incl., before discounts
  discountCents: number; // VAT incl.
  totalCents: number; // VAT incl. (= subtotal − discount)
  vatCents: number;
  vatRegistered: boolean;
  memberSavingsCents: number;
  joinSavingsCents: number;
  offerIds: string[];
  pointsMultiplier: number;
  applied: { id: string; name: string; discountCents: number }[];
  suggestions: Suggestion[];
  codeError?: string;
  promotionId: string | null;
  /** WHOLESALE only: the lines ex VAT after promotions (totalCents = exCents + vatCents). */
  exCents?: number;
  tradeAccountId?: string | null;
};

export type QuoteInput = {
  storeId?: string | null;
  channel: Channel;
  items: { variantId: string; qty: number; unitPriceCents?: number }[];
  code?: string | null;
  customerId?: string | null;
  /** WHOLESALE: the trade account buying (its own TRADE price list comes first). */
  tradeAccountId?: string | null;
  trustClientPrices?: boolean;
  at?: Date;
};

/**
 * Prices a basket for a channel. POS and ONLINE: the consumer engine (shelf prices, zone/channel/member lists, tiers,
 * quantity breaks, markdowns, promotions, My Deals). WHOLESALE: the trade engine (tradeQuote), with the same Quote shape, but
 * each line's `unitPriceCents` is the ex-VAT trade price, `vatCents` is 15% of the line's ex-VAT total rounded half up
 * per line (never backed out of an inclusive price) and `totalCents` = ex + VAT; the quote's `exCents` is the ex-VAT
 * total of the lines and `totalCents` = exCents + vatCents. Tiers, member/zone/channel lists, markdowns, My Deals and
 * shelf prices never touch a trade quote; promotions do only when their channels include WHOLESALE.
 */
export async function quote(opts: QuoteInput): Promise<Quote> {
  if (opts.channel === "WHOLESALE") return tradeQuote(opts);
  const at = opts.at ?? new Date();
  const items = opts.items.filter((i) => i.qty > 0);
  const variantIds = items.map((i) => i.variantId);
  // Offline till sales (trusted client prices) never get My Deals or welcome gifts: the till couldn't apply them.
  const memberDeals = !opts.trustClientPrices;
  const [variants, store, customer, lists, promos, marks, offers] = await Promise.all([
    db.variant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: { select: { id: true, name: true, categoryId: true, regClass: true, tobaccoRelated: true } },
        storeVariants: opts.storeId ? { where: { storeId: opts.storeId } } : false,
      },
    }),
    opts.storeId ? db.store.findUnique({ where: { id: opts.storeId }, select: { regionId: true, company: { select: { vatNumber: true } } } }) : null,
    opts.customerId
      ? db.customer.findUnique({ where: { id: opts.customerId }, select: { tier: true, visits: true, _count: { select: { orders: { where: { status: { in: [...OPEN_ORDER_STATUSES] } } } } } } })
      : null,
    activePriceLists(at),
    activePromotions({ storeId: opts.storeId, channel: opts.channel, at }),
    opts.storeId && opts.channel === "POS" ? markdowns(opts.storeId, variantIds, at) : Promise.resolve(new Map<string, number>()),
    opts.customerId && memberDeals ? activeOffers(opts.customerId, at) : Promise.resolve([]),
  ]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const settings = await getSettings();
  const excluded = incentiveExcluded(settings.compliance);
  const savings = settings.loyalty.tierSavingsPct;
  const ctx = { storeId: opts.storeId, regionId: store?.regionId, channel: opts.channel, member: !!customer, tier: customer?.tier ?? null, tierPct: customer ? savings[customer.tier] : 0, at };
  // Members' prices are compared with the walk-in price; walk-ins see what joining (Seed) would save them now.
  const other = customer ? { ...ctx, member: false, tier: null, tierPct: 0 } : { ...ctx, member: true, tier: "SEED" as const, tierPct: savings.SEED };
  const vatRegistered = store ? !!store.company.vatNumber : true;

  const base = items
    .filter((i) => byId.has(i.variantId))
    .map((i) => {
      const v = byId.get(i.variantId)!;
      const noPromo = excluded.includes(v.product.regClass);
      const args = { variantId: v.id, rrpCents: v.priceCents, storeShelfCents: v.storeVariants?.[0]?.priceCents, qty: i.qty, markdownPct: marks.get(v.id), incentives: !noPromo };
      const price = resolvePrice(args, lists, ctx);
      const alt = resolvePrice(args, lists, other).unitCents;
      const unit = opts.trustClientPrices && i.unitPriceCents != null ? i.unitPriceCents : price.unitCents;
      const memberSavingsCents = customer ? Math.max(0, alt - unit) * i.qty : 0;
      const joinSavingsCents = customer ? 0 : Math.max(0, unit - alt) * i.qty;
      return { i, v, price, unit, noPromo, memberSavingsCents, joinSavingsCents };
    });

  const r = applyPromotions(
    base.map(({ i, v, unit, noPromo }) => ({ key: i.variantId, productId: v.productId, categoryId: v.product.categoryId, qty: i.qty, unitPriceCents: unit, noPromo })),
    // Welcome gifts are for a member's first purchase (none yet, and no online order still open, since that one has it);
    // My Deals ride along as line deals.
    [...(promos as (PromoInput & { firstPurchaseOnly: boolean })[]).filter((p) => !p.firstPurchaseOnly || (memberDeals && customer?.visits === 0 && !customer._count.orders)), ...offers.map(offerPromo)],
    opts.code,
  );
  const lines: QuoteLine[] = base.map(({ i, v, price, unit, noPromo, memberSavingsCents }, idx) => ({
    noEarn: noPromo,
    memberSavingsCents,
    offerCents: Object.entries(r.lines[idx].byPromo).reduce((t, [id, c]) => t + (isOffer(id) ? c : 0), 0),
    variantId: v.id,
    productId: v.productId,
    categoryId: v.product.categoryId,
    name: `${v.product.name} · ${v.name}`,
    productName: v.product.name,
    variantName: v.name,
    sku: v.sku,
    regClass: v.product.regClass,
    tobaccoRelated: v.product.tobaccoRelated,
    grams: v.grams,
    caseQty: v.caseQty,
    qty: i.qty,
    rrpCents: price.rrpCents,
    shelfCents: price.shelfCents,
    unitPriceCents: unit,
    priceRule: price.rule,
    priceValidUntil: price.validUntil,
    grossCents: r.lines[idx].grossCents,
    discountCents: r.lines[idx].discountCents,
    totalCents: r.lines[idx].totalCents,
    exCents: r.lines[idx].totalCents - (vatRegistered ? vatOf(r.lines[idx].totalCents) : 0),
    vatCents: vatRegistered ? vatOf(r.lines[idx].totalCents) : 0,
    promoId: r.lines[idx].promoId,
  }));
  const codePromo = opts.code && !r.codeError ? promos.find((p) => p.code?.toUpperCase() === opts.code!.trim().toUpperCase()) : undefined;
  return {
    lines,
    subtotalCents: r.subtotalCents,
    discountCents: r.discountCents,
    totalCents: r.totalCents,
    vatCents: lines.reduce((s, l) => s + l.vatCents, 0),
    vatRegistered,
    memberSavingsCents: lines.reduce((s, l) => s + l.memberSavingsCents, 0), // "Rewards savings" on the receipt
    joinSavingsCents: base.reduce((s, b) => s + b.joinSavingsCents, 0), // "Join free and save R… today" for walk-ins
    offerIds: r.applied.map((a) => a.id).filter(isOffer), // My Deals used (redeemed when the sale posts)
    pointsMultiplier: r.pointsMultiplier,
    applied: r.applied,
    suggestions: r.suggestions as Suggestion[],
    codeError: r.codeError,
    promotionId: (codePromo?.id ?? r.applied.at(0)?.id ?? null) as string | null,
  };
}

// ── Trade (wholesale) ────────────────────────────────────────────────────────

const TRADE_INCLUDE = { product: { select: { id: true, name: true, categoryId: true, regClass: true, tobaccoRelated: true, status: true } } } as const;

/**
 * The WHOLESALE quote (see `quote` for the shape). Unit prices come from `resolveTradePrice` (the account's TRADE list,
 * the live TRADE lists by priority, else the wholesale price), ex VAT. A promotion's discount is rounded to a whole
 * cent per unit, so an order line can carry the net unit price exactly (`unitPriceCents − discountCents/qty`); its
 * `applied` figures are the rounded ones. Medicines (incentiveExcluded) and anything not tradeable get no promotion.
 * Line and quote totals are VAT inclusive like every other quote; `exCents` carries the ex-VAT figures.
 */
async function tradeQuote(opts: QuoteInput): Promise<Quote> {
  const at = opts.at ?? new Date();
  const items = opts.items.filter((i) => i.qty > 0);
  const variantIds = items.map((i) => i.variantId);
  const [variants, store, account, lists, promos, settings] = await Promise.all([
    db.variant.findMany({ where: { id: { in: variantIds } }, include: TRADE_INCLUDE }),
    opts.storeId ? db.store.findUnique({ where: { id: opts.storeId }, select: { company: { select: { vatNumber: true } } } }) : null,
    opts.tradeAccountId ? db.tradeAccount.findUnique({ where: { id: opts.tradeAccountId }, select: { priceListId: true } }) : null,
    activePriceLists(at),
    activePromotions({ storeId: opts.storeId, channel: "WHOLESALE", at }),
    getSettings(),
  ]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const vatRegistered = store ? !!store.company.vatNumber : true;
  const excluded = incentiveExcluded(settings.compliance);
  const ctx = { accountListId: account?.priceListId ?? null, at };

  const base = items
    .filter((i) => byId.has(i.variantId))
    .map((i) => {
      const v = byId.get(i.variantId)!;
      // THC is never traded: no price at all (the trade basket rule names the line when someone tries).
      const thc = v.product.regClass === "THC";
      const price = thc ? { unitCents: 0, rule: "Not available to trade", validUntil: null } : resolveTradePrice({ variantId: v.id, wholesaleCents: v.wholesaleCents, qty: i.qty }, lists, ctx);
      const noPromo = thc || excluded.includes(v.product.regClass);
      return { i, v, price, unit: Math.max(0, price.unitCents), noPromo };
    });
  const r = applyPromotions(
    base.map(({ i, v, unit, noPromo }) => ({ key: i.variantId, productId: v.productId, categoryId: v.product.categoryId, qty: i.qty, unitPriceCents: unit, noPromo })),
    promos as PromoInput[],
    opts.code,
  );
  const lines: QuoteLine[] = base.map(({ i, v, price, unit }, idx) => {
    const pl = r.lines[idx];
    const netUnit = Math.min(unit, Math.round(pl.totalCents / i.qty)); // the promotion, to the cent per unit
    const grossEx = unit * i.qty;
    const netEx = netUnit * i.qty;
    const vat = vatRegistered ? vatHalfUp(netEx) : 0;
    const grossIncl = grossEx + (vatRegistered ? vatHalfUp(grossEx) : 0);
    const totalCents = netEx + vat;
    return {
      noEarn: true,
      memberSavingsCents: 0,
      offerCents: 0,
      variantId: v.id,
      productId: v.productId,
      categoryId: v.product.categoryId,
      name: `${v.product.name} · ${v.name}`,
      productName: v.product.name,
      variantName: v.name,
      sku: v.sku,
      regClass: v.product.regClass,
      tobaccoRelated: v.product.tobaccoRelated,
      grams: v.grams,
      caseQty: v.caseQty,
      qty: i.qty,
      rrpCents: v.priceCents,
      shelfCents: v.wholesaleCents,
      unitPriceCents: unit,
      priceRule: price.rule ?? "Trade price",
      priceValidUntil: price.validUntil,
      grossCents: grossIncl,
      discountCents: grossIncl - totalCents,
      totalCents,
      exCents: netEx,
      vatCents: vat,
      promoId: netUnit < unit ? pl.promoId : undefined,
    };
  });
  const codePromo = opts.code && !r.codeError ? promos.find((p) => p.code?.toUpperCase() === opts.code!.trim().toUpperCase()) : undefined;
  // What each promotion took off, ex VAT, after the per-unit rounding.
  const applied = r.applied
    .map((a) => ({ ...a, discountCents: lines.filter((l) => l.promoId === a.id).reduce((s, l) => s + (l.unitPriceCents * l.qty - l.exCents), 0) }))
    .filter((a) => a.discountCents > 0);
  return {
    lines,
    subtotalCents: lines.reduce((s, l) => s + l.grossCents, 0),
    discountCents: lines.reduce((s, l) => s + l.discountCents, 0),
    totalCents: lines.reduce((s, l) => s + l.totalCents, 0),
    exCents: lines.reduce((s, l) => s + l.exCents, 0),
    vatCents: lines.reduce((s, l) => s + l.vatCents, 0),
    vatRegistered,
    memberSavingsCents: 0,
    joinSavingsCents: 0,
    offerIds: [],
    pointsMultiplier: 1,
    applied,
    suggestions: r.suggestions as Suggestion[],
    codeError: r.codeError,
    promotionId: (codePromo?.id ?? applied.at(0)?.id ?? null) as string | null,
    tradeAccountId: opts.tradeAccountId ?? null,
  };
}

export type TradeRangeRow = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  categoryId: string;
  regClass: RegClass;
  caseQty: number;
  rrpCents: number; // RRP, VAT incl. (what the buyer's own customers would pay)
  unitCents: number; // trade price for one case's worth, ex VAT
  priceRule: string | null;
  breaks: { minQty: number; unitCents: number }[]; // ex VAT, lowest quantity first
  onHand: number;
  available: number; // at the store, after reservations
};

/**
 * The trade range at a store for an account: live products in the account's classes (never THC, and only classes the
 * store may sell), active variants that aren't made to order, with a trade price (a TRADE list or a wholesale price),
 * their case packs, prices and current availability at that store. Searchable (q: name, SKU or barcode; category: slug
 * or id) and paginated, never the whole catalogue in one go.
 */
export async function tradeRange(
  storeId: string,
  account: { priceListId?: string | null; classes: readonly string[] },
  opts: { q?: string | null; category?: string | null; page?: number; pageSize?: number; at?: Date } = {},
) {
  const at = opts.at ?? new Date();
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(opts.pageSize ?? 24)));
  const [store, lists, settings] = await Promise.all([db.store.findUniqueOrThrow({ where: { id: storeId }, select: { licences: true } }), activePriceLists(at), getSettings()]);
  const classes = account.classes.filter((c) => tradeAllowed({ accountClasses: account.classes, sellerLicences: store.licences, productClass: c as RegClass, productStatus: "ACTIVE", licensedOnly: settings.compliance.licensedOnly })) as RegClass[];
  const empty = { rows: [] as TradeRangeRow[], total: 0, page, pageSize, didYouMean: null as string | null };
  if (!classes.length) return empty;
  const tradeLists = lists.filter((l) => l.kind === "TRADE" && listLive(l, at));
  const priced = [...new Set(tradeLists.flatMap((l) => l.items.map((i) => i.variantId)))];
  const q = opts.q?.trim().slice(0, 60);
  const category = opts.category?.trim();
  const base: Prisma.VariantWhereInput = {
    active: true,
    podSku: null,
    OR: [{ wholesaleCents: { gt: 0 } }, ...(priced.length ? [{ id: { in: priced } }] : [])],
    product: {
      status: "ACTIVE",
      regClass: { in: classes },
      ...(category ? { category: { OR: [{ slug: category }, { id: category }] } } : {}),
    },
  };
  // Every word must match somewhere (name, SKU, barcode or product name), or the whole query must (a SKU like "HH-CBD-001").
  const matches = (spellings: string[]): Prisma.VariantWhereInput => ({
    OR: spellings.flatMap((t) => {
      const like = { contains: t, mode: "insensitive" as const };
      return [{ name: like }, { sku: like }, { barcode: like }, { product: { name: like } }];
    }),
  });
  const terms = q ? rangeSearchTerms(q) : [];
  let where: Prisma.VariantWhereInput = q ? { AND: [base, { OR: [matches([q]), ...(terms.length ? [{ AND: terms.map(matches) }] : [])] }] } : base;
  let didYouMean: string | null = null;
  // Nothing by words (a typo: "colagen")? Fall back to products with a similar name, and say which we think was meant.
  if (q && !(await db.variant.count({ where }))) {
    const similar = await similarProducts(q, classes);
    const hits = similar.size ? await db.product.findMany({ where: { id: { in: [...similar.keys()] }, variants: { some: base } }, select: { id: true, name: true } }) : [];
    if (hits.length) {
      where = { AND: [base, { productId: { in: hits.map((h) => h.id) } }] };
      didYouMean = hits.reduce((x, y) => ((similar.get(y.id) ?? 0) > (similar.get(x.id) ?? 0) ? y : x)).name;
    }
  }
  const [total, variants] = await Promise.all([
    db.variant.count({ where }),
    db.variant.findMany({ where, include: TRADE_INCLUDE, orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const avail = await availability([storeId], variants.map((v) => v.id));
  const ctx = { accountListId: account.priceListId ?? null, at };
  const rows: TradeRangeRow[] = variants
    .map((v) => {
      const price = resolveTradePrice({ variantId: v.id, wholesaleCents: v.wholesaleCents, qty: v.caseQty }, tradeLists, ctx);
      const a = avail.get(availKey(storeId, v.id));
      return {
        variantId: v.id, productId: v.productId, productName: v.product.name, variantName: v.name, sku: v.sku, barcode: v.barcode, categoryId: v.product.categoryId, regClass: v.product.regClass,
        caseQty: v.caseQty, rrpCents: v.priceCents, unitCents: price.unitCents, priceRule: price.rule, breaks: tradeBreaks({ variantId: v.id, wholesaleCents: v.wholesaleCents }, tradeLists, ctx),
        onHand: a?.onHand ?? 0, available: Math.max(0, a?.available ?? 0),
      };
    })
    .filter((r) => r.unitCents > 0);
  return { rows, total, page, pageSize, didYouMean };
}
