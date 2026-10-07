// The trade cart lives on the account (TradeCart), so every buyer of the business sees the same cart on any device.
// The codec is pure (src/lib/trade-cart.ts); prices are never stored — the cart is quoted on the server every time
// it's shown. Changes run read-modify-write under the cart row's lock, so two buyers adding at once both land.
// A cart from before it moved off the browser (the hh_trade_cart cookie) is shown until the next change takes it over.
import { cache } from "react";
import { cookies } from "next/headers";
import { db, tx } from "@/server/db";
import { getTradeBuyer } from "@/server/auth";
import { parseTradeCart, serializeTradeCart, TRADE_CART_COOKIE, type TradeCartLine } from "@/lib/trade-cart";

const clean = (lines: TradeCartLine[]) => parseTradeCart(serializeTradeCart(Array.isArray(lines) ? lines : []));

export const getTradeCart = cache(async (): Promise<TradeCartLine[]> => {
  const buyer = await getTradeBuyer();
  if (!buyer) return [];
  const row = await db.tradeCart.findUnique({ where: { tradeAccountId: buyer.tradeAccountId }, select: { items: true } });
  if (row) return clean(row.items as TradeCartLine[]);
  return parseTradeCart((await cookies()).get(TRADE_CART_COOKIE)?.value);
});

/** Applies a change to the signed-in account's cart and returns the cart as saved (empty when nobody is signed in). */
export async function updateTradeCart(change: (lines: TradeCartLine[]) => TradeCartLine[]): Promise<TradeCartLine[]> {
  const buyer = await getTradeBuyer();
  if (!buyer) return [];
  const jar = await cookies();
  const legacy = jar.get(TRADE_CART_COOKIE)?.value;
  const saved = await tx(async (t) => {
    const id = buyer.tradeAccountId;
    // Create the row if it isn't there (atomic: a second buyer's first change at the same moment waits, then finds it).
    await t.$executeRaw`INSERT INTO "TradeCart" ("tradeAccountId", items, "updatedAt") VALUES (${id}, ${JSON.stringify(parseTradeCart(legacy))}::jsonb, now()) ON CONFLICT ("tradeAccountId") DO NOTHING`;
    await t.$queryRaw`SELECT 1 FROM "TradeCart" WHERE "tradeAccountId" = ${id} FOR UPDATE`;
    const row = await t.tradeCart.findUniqueOrThrow({ where: { tradeAccountId: id }, select: { items: true } });
    const items = clean(change(clean(row.items as TradeCartLine[])));
    await t.tradeCart.update({ where: { tradeAccountId: id }, data: { items } });
    return items;
  });
  if (legacy) jar.delete(TRADE_CART_COOKIE);
  return saved;
}

/** Replaces the cart (empty clears it). */
export const saveTradeCart = (lines: TradeCartLine[]) => updateTradeCart(() => lines);
