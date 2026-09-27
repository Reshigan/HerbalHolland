// Till-side pricing: the same pure rules the server's quote() uses (price lists, shelf
// prices, near-expiry markdowns, promotions, s18A incentive exclusions), run against the
// cached bootstrap. Used for instant feedback online and as the price of record offline.
import { applyPromotions } from "@/lib/promotions";
import { promoWindowOpen, resolvePrice, type PriceListRule, type Tier } from "@/lib/pricing-rules";
import { incentiveExcluded, type ComplianceSettings, type RegClass } from "@/lib/compliance";
import { pointsFor, type TierKey } from "@/lib/loyalty-rules";
import { vatOf } from "@/lib/money";
import type { BootPriceList, BootPromotion, QuoteDTO, QuoteLineDTO } from "@/server/pos/types";

export type PricingVariant = {
  id: string;
  productId: string;
  categoryId: string;
  regClass: RegClass;
  rrpCents: number;
  shelfCents: number | null;
  markdownPct: number;
};

export type PricingData = {
  storeId: string;
  regionId: string;
  vatRegistered: boolean;
  compliance: ComplianceSettings;
  earnPer100: number;
  variants: Record<string, PricingVariant>;
  promotions: BootPromotion[];
  priceLists: BootPriceList[];
};

const reviveList = (l: BootPriceList): PriceListRule => ({
  ...l,
  startsAt: l.startsAt ? new Date(l.startsAt) : null,
  endsAt: l.endsAt ? new Date(l.endsAt) : null,
  createdAt: new Date(l.createdAt),
});

/** Promotions live at `at`: inside their date range and happy-hour / weekday window. */
export function livePromotions(promos: BootPromotion[], at: Date) {
  return promos.filter((p) => new Date(p.startsAt) <= at && new Date(p.endsAt) >= at && promoWindowOpen(p, at));
}

export function priceBasket(
  data: PricingData,
  items: { variantId: string; qty: number }[],
  opts: { code?: string | null; member?: boolean; tier?: Tier | null; at?: Date } = {},
): QuoteDTO {
  const at = opts.at ?? new Date();
  const lists = data.priceLists.map(reviveList);
  const excluded = incentiveExcluded(data.compliance);
  const ctx = { storeId: data.storeId, regionId: data.regionId, channel: "POS" as const, member: !!opts.member, tier: opts.tier ?? null, at };

  const base = items
    .filter((i) => i.qty > 0 && data.variants[i.variantId])
    .map((i) => {
      const v = data.variants[i.variantId];
      const noPromo = excluded.includes(v.regClass);
      const price = resolvePrice(
        { variantId: v.id, rrpCents: v.rrpCents, storeShelfCents: v.shelfCents, qty: i.qty, markdownPct: v.markdownPct || null, incentives: !noPromo },
        lists,
        ctx,
      );
      return { i, v, price, noPromo };
    });

  const r = applyPromotions(
    base.map(({ i, v, price, noPromo }) => ({ key: i.variantId, productId: v.productId, categoryId: v.categoryId, qty: i.qty, unitPriceCents: price.unitCents, noPromo })),
    livePromotions(data.promotions, at),
    opts.code,
  );

  const lines: QuoteLineDTO[] = base.map(({ i, v, price, noPromo }, idx) => ({
    variantId: v.id,
    qty: i.qty,
    unitPriceCents: price.unitCents,
    shelfCents: price.shelfCents,
    rrpCents: price.rrpCents,
    priceRule: price.rule,
    grossCents: r.lines[idx].grossCents,
    discountCents: r.lines[idx].discountCents,
    totalCents: r.lines[idx].totalCents,
    vatCents: data.vatRegistered ? vatOf(r.lines[idx].totalCents) : 0,
    promoId: r.lines[idx].promoId,
    noEarn: noPromo,
  }));

  const earnable = lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0);
  return {
    lines,
    subtotalCents: r.subtotalCents,
    discountCents: r.discountCents,
    totalCents: r.totalCents,
    vatCents: lines.reduce((s, l) => s + l.vatCents, 0),
    pointsMultiplier: r.pointsMultiplier,
    applied: r.applied,
    suggestions: r.suggestions,
    codeError: r.codeError,
    pointsEstimate: opts.member && opts.tier ? pointsFor(earnable, opts.tier as TierKey, r.pointsMultiplier, data.earnPer100) : 0,
  };
}

/** Rand value of a basket that Guilders may pay for (never medicines under s18A). */
export const redeemableCents = (q: Pick<QuoteDTO, "lines">) => q.lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0);
