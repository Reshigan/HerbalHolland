// Row "locks" that order decisions resting on a member's history or a store's stock. D1 has no row locks or
// transactions: it serialises writes per database, so these are plain reads of the rows (they still fail fast on a
// row that doesn't exist). Keep them as the FIRST statements of a unit of work, always customer → promotion → stock,
// then re-run the checks: whatever a competing request wrote is visible by the time these reads return.
import type { Tx } from "./db";

/** The member's row: patient grams, drop limits, first-purchase promotions, points and visits are decided under it. */
export const lockCustomer = (t: Tx, customerId: string) => t.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId}`;

/** A promotion's row, before counting its uses against maxUses. */
export const lockPromotion = (t: Tx, promotionId: string) => t.$queryRaw`SELECT id FROM "Promotion" WHERE id = ${promotionId}`;

/** Every lot of these variants at the store, in variant-then-lot order, before reserving or taking stock. */
export const lockStock = (t: Tx, storeId: string, variantIds: string[]) =>
  variantIds.length
    ? t.$queryRaw`SELECT id FROM "StockLevel" WHERE "storeId" = ${storeId} AND "variantId" IN (SELECT value FROM json_each(${JSON.stringify([...new Set(variantIds)].sort())})) ORDER BY "variantId", id`
    : Promise.resolve([]);
