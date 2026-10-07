// Row locks that serialise decisions resting on a member's history or a store's stock. Take them as the FIRST
// statements of the transaction, always customer → promotion → stock (one order everywhere, so two transactions can
// never deadlock), then re-run the checks: at READ COMMITTED anything a competing transaction wrote is committed by the
// time the lock is granted, so plain reads (db or t) see it.
import type { Tx } from "./db";

/** The member's row: patient grams, drop limits, first-purchase promotions, points and visits are decided under it. */
export const lockCustomer = (t: Tx, customerId: string) => t.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;

/** A promotion's row, before counting its uses against maxUses. */
export const lockPromotion = (t: Tx, promotionId: string) => t.$queryRaw`SELECT id FROM "Promotion" WHERE id = ${promotionId} FOR UPDATE`;

/** Every lot of these variants at the store, in variant-then-lot order, before reserving or taking stock. */
export const lockStock = (t: Tx, storeId: string, variantIds: string[]) =>
  variantIds.length
    ? t.$queryRaw`SELECT id FROM "StockLevel" WHERE "storeId" = ${storeId} AND "variantId" = ANY(${[...new Set(variantIds)].sort()}::text[]) ORDER BY "variantId", id FOR UPDATE`
    : Promise.resolve([]);
