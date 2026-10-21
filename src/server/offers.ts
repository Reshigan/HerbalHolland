// My Deals: personal, single-use offers loaded to a member's card (Checkers-style). HQ funds them from the marketing
// fund and credits the selling store on its franchise statement. Never on medicines (excluded like every incentive).
import { db, Prisma, type Tx } from "./db";
import { getSettings } from "./settings";
import { LoyaltyError } from "./loyalty";
import { incentiveExcluded } from "@/lib/compliance";
import type { PromoInput } from "@/lib/promotions";
import { asList } from "@/lib/json-list";

/** A deal that's no longer there to use. A Rewards error, so checkout and the till show it as they show a points shortfall. */
export class OfferError extends LoyaltyError {}

const OFFER = "offer:"; // id prefix inside the pricing engine
export const isOffer = (promoId?: string | null) => !!promoId?.startsWith(OFFER);

export const activeOffers = (customerId: string, at = new Date()) =>
  db.memberOffer.findMany({ where: { customerId, redeemedAt: null, startsAt: { lte: at }, endsAt: { gte: at } }, orderBy: { endsAt: "asc" } });

/** `productIds` / `categoryIds` are the row's JSON lists (or arrays already). */
export const offerPromo = (o: { id: string; title: string; kind: PromoInput["kind"]; value: number; productIds: unknown; categoryIds: unknown }): PromoInput => ({
  id: OFFER + o.id, name: o.title, code: null, kind: o.kind, value: o.value, productIds: asList<string>(o.productIds), categoryIds: asList<string>(o.categoryIds), minSpendCents: 0,
});

/**
 * Marks the offers a sale or order used as redeemed (single use). A deal another order or sale took a moment ago stops
 * this one: the error rolls its transaction back, so a deal is never given twice.
 */
export async function redeemOffers(t: Tx, promoIds: string[], ref: { saleId?: string; orderId?: string }) {
  const ids = [...new Set(promoIds.filter(isOffer).map((p) => p.slice(OFFER.length)))];
  if (!ids.length) return;
  const { count } = await t.memberOffer.updateMany({ where: { id: { in: ids }, redeemedAt: null }, data: { redeemedAt: new Date(), ...ref } });
  if (count !== ids.length) throw new OfferError("A My Deals offer in this basket was just used on another purchase, so refresh to see the price without it");
}

/** Cancelled order: its offers go back on the member's card. */
export const releaseOffers = (t: Tx, orderId: string) =>
  t.memberOffer.updateMany({ where: { orderId, saleId: null }, data: { redeemedAt: null, orderId: null } });

/** Weekly: each opted-in member's favourite eligible product (units, last 90 days) at `percent` off for `validDays`. */
export async function generateOffers(now = new Date()) {
  const { offers, compliance } = await getSettings();
  if (!offers.enabled) return { created: 0 };
  const excluded = incentiveExcluded(compliance);
  const created = await db.$executeRaw`
    INSERT INTO "MemberOffer" (id, "customerId", title, kind, value, "productIds", "startsAt", "endsAt", "createdAt")
    SELECT lower(hex(randomblob(16))), f."customerId", ${`${offers.percent}% off `} || f.name, 'PERCENT', ${offers.percent},
      json_array(f."productId"), ${now}, ${new Date(now.getTime() + offers.validDays * 86_400_000)}, ${now}
    FROM (
      SELECT s."customerId", p.id AS "productId", p.name, row_number() OVER (PARTITION BY s."customerId" ORDER BY sum(sl.qty) DESC, p.name) AS rn
      FROM "SaleLine" sl
      JOIN "Sale" s ON s.id = sl."saleId"
      JOIN "Variant" v ON v.id = sl."variantId"
      JOIN "Product" p ON p.id = v."productId"
      JOIN "Customer" c ON c.id = s."customerId"
      WHERE s.kind = 'SALE' AND s."createdAt" >= ${new Date(now.getTime() - 90 * 86_400_000)} AND c."personalisedOffers"
        AND p.status = 'ACTIVE' ${excluded.length ? Prisma.sql`AND p."regClass" NOT IN (${Prisma.join(excluded)})` : Prisma.empty}
      GROUP BY s."customerId", p.id, p.name
    ) f
    WHERE f.rn = 1 AND NOT EXISTS (SELECT 1 FROM "MemberOffer" o WHERE o."customerId" = f."customerId" AND o."endsAt" > ${now})`;
  return { created };
}
