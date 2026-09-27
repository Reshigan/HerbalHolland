// Server-side pricing: price lists (zones, scheduled changes, channel, member/tier,
// quantity breaks), franchisee shelf prices, near-expiry markdowns, then promotions
// (with happy-hour windows). Always recomputed server-side; clients only display.
import { db } from "./db";
import { getSettings } from "./settings";
import { applyPromotions, type PromoInput, type Suggestion } from "@/lib/promotions";
import { resolvePrice, promoWindowOpen, type PriceContext, type PriceListRule, type Tier } from "@/lib/pricing-rules";
import { vatOf } from "@/lib/money";
import { addDays } from "@/lib/format";
import type { Channel } from "@/generated/prisma/client";
import { incentiveExcluded, type RegClass } from "@/lib/compliance";

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
  qty: number;
  rrpCents: number;
  shelfCents: number;
  unitPriceCents: number;
  priceRule: string | null;
  grossCents: number;
  discountCents: number;
  totalCents: number;
  vatCents: number;
  promoId?: string;
  noEarn: boolean; // excluded from incentives incl. points earn
  memberSavingsCents: number; // instant Rewards saving on this line vs the non-member price
};

export async function quote(opts: {
  storeId?: string | null;
  channel: Channel;
  items: { variantId: string; qty: number; unitPriceCents?: number }[];
  code?: string | null;
  customerId?: string | null;
  trustClientPrices?: boolean;
  at?: Date;
}) {
  const at = opts.at ?? new Date();
  const items = opts.items.filter((i) => i.qty > 0);
  const variantIds = items.map((i) => i.variantId);
  const [variants, store, customer, lists, promos, marks] = await Promise.all([
    db.variant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: { select: { id: true, name: true, categoryId: true, regClass: true, tobaccoRelated: true } },
        storeVariants: opts.storeId ? { where: { storeId: opts.storeId } } : false,
      },
    }),
    opts.storeId ? db.store.findUnique({ where: { id: opts.storeId }, select: { regionId: true, company: { select: { vatNumber: true } } } }) : null,
    opts.customerId ? db.customer.findUnique({ where: { id: opts.customerId }, select: { tier: true } }) : null,
    activePriceLists(at),
    activePromotions({ storeId: opts.storeId, channel: opts.channel, at }),
    opts.storeId && opts.channel === "POS" ? markdowns(opts.storeId, variantIds, at) : Promise.resolve(new Map<string, number>()),
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
    promos as PromoInput[],
    opts.code,
  );
  const lines: QuoteLine[] = base.map(({ i, v, price, unit, noPromo, memberSavingsCents }, idx) => ({
    noEarn: noPromo,
    memberSavingsCents,
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
    qty: i.qty,
    rrpCents: price.rrpCents,
    shelfCents: price.shelfCents,
    unitPriceCents: unit,
    priceRule: price.rule,
    grossCents: r.lines[idx].grossCents,
    discountCents: r.lines[idx].discountCents,
    totalCents: r.lines[idx].totalCents,
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
    pointsMultiplier: r.pointsMultiplier,
    applied: r.applied,
    suggestions: r.suggestions as Suggestion[],
    codeError: r.codeError,
    promotionId: (codePromo?.id ?? r.applied.at(0)?.id ?? null) as string | null,
  };
}
export type Quote = Awaited<ReturnType<typeof quote>>;
