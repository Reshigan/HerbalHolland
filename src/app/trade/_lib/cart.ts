// The trade cart cookie (hh_trade_cart), read once per request and written by the portal's actions. The codec is pure
// (src/lib/trade-cart.ts); prices are never stored — the cart is quoted on the server every time it's shown.
import { cache } from "react";
import { cookies } from "next/headers";
import { parseTradeCart, serializeTradeCart, TRADE_CART_COOKIE, type TradeCartLine } from "@/lib/trade-cart";

const DAY = 86_400;

export const getTradeCart = cache(async () => parseTradeCart((await cookies()).get(TRADE_CART_COOKIE)?.value));

export async function saveTradeCart(lines: TradeCartLine[]) {
  const jar = await cookies();
  const value = serializeTradeCart(lines);
  if (value) jar.set(TRADE_CART_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * DAY });
  else jar.delete(TRADE_CART_COOKIE);
}
