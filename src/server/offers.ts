// My Deals: personal, single-use offers loaded to a member's card (Checkers-style). HQ funds them from the marketing
// fund and credits the selling store on its franchise statement. Never on medicines (excluded like every incentive).
import { db, type Tx } from "./db";
import { getSettings } from "./settings";
import { incentiveExcluded } from "@/lib/compliance";
import type { PromoInput } from "@/lib/promotions";

const OFFER = "offer:"; // id prefix inside the pricing engine
export const isOffer = (promoId?: string | null) => !!promoId?.startsWith(OFFER);

export const activeOffers = (customerId: string, at = new Date()) =>
  db.memberOffer.findMany({ where: { customerId, redeemedAt: null, startsAt: { lte: at }, endsAt: { gte: at } }, orderBy: { endsAt: "asc" } });

export const offerPromo = (o: { id: string; title: string; kind: PromoInput["kind"]; value: number; productIds: string[]; categoryIds: string[] }): PromoInput => ({
  id: OFFER + o.id, name: o.title, code: null, kind: o.kind, value: o.value, productIds: o.productIds, categoryIds: o.categoryIds, minSpendCents: 0,
});

/** Marks the offers a sale or order used as redeemed (single use). */
export async function redeemOffers(t: Tx, promoIds: string[], ref: { saleId?: string; orderId?: string }) {
  const ids = [...new Set(promoIds.filter(isOffer).map((p) => p.slice(OFFER.length)))];
  if (ids.length) await t.memberOffer.updateMany({ where: { id: { in: ids }, redeemedAt: null }, data: { redeemedAt: new Date(), ...ref } });
}

/** Cancelled order: its offers go back on the member's card. */
export const releaseOffers = (t: Tx, orderId: string) =>
  t.memberOffer.updateMany({ where: { orderId, saleId: null }, data: { redeemedAt: null, orderId: null } });

/** Weekly: each opted-in member's favourite eligible product (units, last 90 days) at `percent` off for `validDays`. */
export async function generateOffers(now = new Date()) {
  const { offers, compliance } = await getSettings();
  if (!offers.enabled) return { created: 0 };
  const created = await db.$executeRaw`
    INSERT INTO "MemberOffer" (id, "customerId", title, kind, value, "productIds", "startsAt", "endsAt")
    SELECT gen_random_uuid()::text, f."customerId", ${`${offers.percent}% off `} || f.name, 'PERCENT'::"PromoKind", ${offers.percent},
      ARRAY[f."productId"], ${now}, ${new Date(now.getTime() + offers.validDays * 86_400_000)}
    FROM (
      SELECT s."customerId", p.id AS "productId", p.name, row_number() OVER (PARTITION BY s."customerId" ORDER BY sum(sl.qty) DESC, p.name) AS rn
      FROM "SaleLine" sl
      JOIN "Sale" s ON s.id = sl."saleId"
      JOIN "Variant" v ON v.id = sl."variantId"
      JOIN "Product" p ON p.id = v."productId"
      JOIN "Customer" c ON c.id = s."customerId"
      WHERE s.kind = 'SALE' AND s."createdAt" >= ${new Date(now.getTime() - 90 * 86_400_000)} AND c."personalisedOffers"
        AND p.status = 'ACTIVE' AND NOT (p."regClass"::text = ANY(${incentiveExcluded(compliance)}::text[]))
      GROUP BY s."customerId", p.id, p.name
    ) f
    WHERE f.rn = 1 AND NOT EXISTS (SELECT 1 FROM "MemberOffer" o WHERE o."customerId" = f."customerId" AND o."endsAt" > ${now})`;
  return { created };
}
