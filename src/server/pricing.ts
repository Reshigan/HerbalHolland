// Server-side pricing: price lists (zones, scheduled changes, channel, member/tier,
// quantity breaks), franchisee shelf prices, near-expiry markdowns, then promotions
// (with happy-hour windows). Always recomputed server-side; clients only display.
import { db } from "./db";
import { getSettings } from "./settings";
import { applyPromotions, type PromoInput, type Suggestion } from "@/lib/promotions";
import { resolvePrice, promoWindowOpen, type PriceListRule } from "@/lib/pricing-rules";
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
  return rows.filter((p) => promoWindowOpen(p, at));
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
  const excluded = incentiveExcluded((await getSettings()).compliance);
  const ctx = { storeId: opts.storeId, regionId: store?.regionId, channel: opts.channel, member: !!customer, tier: customer?.tier ?? null, at };
  const vatRegistered = store ? !!store.company.vatNumber : true;

  const base = items
    .filter((i) => byId.has(i.variantId))
    .map((i) => {
      const v = byId.get(i.variantId)!;
      const noPromo = excluded.includes(v.product.regClass);
      const price = resolvePrice(
        { variantId: v.id, rrpCents: v.priceCents, storeShelfCents: v.storeVariants?.[0]?.priceCents, qty: i.qty, markdownPct: marks.get(v.id), incentives: !noPromo },
        lists,
        ctx,
      );
      const unit = opts.trustClientPrices && i.unitPriceCents != null ? i.unitPriceCents : price.unitCents;
      return { i, v, price, unit, noPromo };
    });

  const r = applyPromotions(
    base.map(({ i, v, unit, noPromo }) => ({ key: i.variantId, productId: v.productId, categoryId: v.product.categoryId, qty: i.qty, unitPriceCents: unit, noPromo })),
    promos as PromoInput[],
    opts.code,
  );
  const lines: QuoteLine[] = base.map(({ i, v, price, unit, noPromo }, idx) => ({
    noEarn: noPromo,
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
    pointsMultiplier: r.pointsMultiplier,
    applied: r.applied,
    suggestions: r.suggestions as Suggestion[],
    codeError: r.codeError,
    promotionId: (codePromo?.id ?? r.applied.at(0)?.id ?? null) as string | null,
  };
}
export type Quote = Awaited<ReturnType<typeof quote>>;
