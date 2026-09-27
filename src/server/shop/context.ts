// Storefront request context: the bag, preferred store, promo code and age-gate
// cookies, plus the signed-in Rewards member. Reads are memoised per request.
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { cartCount, parseCart, serializeCart, type CartItem } from "./cart-codec";
import type { Prisma } from "@/generated/prisma/client";

export const SHOP_COOKIE = { cart: "hh_cart", store: "hh_store", age: "hh_age", promo: "hh_promo", phone: "hh_phone" } as const;

const opts = (maxAge?: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  ...(maxAge ? { maxAge } : {}),
});
const DAY = 86_400;

// ── Bag ──────────────────────────────────────────────────────────────────────
export const getCart = cache(async () => parseCart((await cookies()).get(SHOP_COOKIE.cart)?.value));
export const getCartCount = cache(async () => cartCount(await getCart()));

export async function saveCart(items: CartItem[]) {
  const jar = await cookies();
  const value = serializeCart(items);
  if (value) jar.set(SHOP_COOKIE.cart, value, opts(30 * DAY));
  else jar.delete(SHOP_COOKIE.cart);
}

export const getPromoCode = cache(async () => (await cookies()).get(SHOP_COOKIE.promo)?.value || null);

export async function savePromoCode(code: string | null) {
  const jar = await cookies();
  if (code) jar.set(SHOP_COOKIE.promo, code.trim().toUpperCase().slice(0, 32), opts(7 * DAY));
  else jar.delete(SHOP_COOKIE.promo);
}

// ── Age gate ─────────────────────────────────────────────────────────────────
export type AgeState = "ok" | "declined" | "unknown";
export const getAgeState = cache(async (): Promise<AgeState> => {
  const v = (await cookies()).get(SHOP_COOKIE.age)?.value;
  return v === "1" ? "ok" : v === "0" ? "declined" : "unknown";
});

export async function saveAge(adult: boolean) {
  // Adults are remembered for a year; a "no" lasts for the browser session only.
  (await cookies()).set(SHOP_COOKIE.age, adult ? "1" : "0", { ...opts(adult ? 365 * DAY : undefined), httpOnly: false });
}

// ── Preferred store ──────────────────────────────────────────────────────────
export const STORE_SELECT = {
  id: true, code: true, slug: true, name: true, format: true, status: true, addressLine: true, suburb: true, city: true,
  province: true, postalCode: true, lat: true, lng: true, phone: true, whatsapp: true, email: true, hours: true,
  clickCollect: true, sameDay: true, licences: true,
} satisfies Prisma.StoreSelect;
export type ShopStore = Prisma.StoreGetPayload<{ select: typeof STORE_SELECT }>;

/** The shopper's chosen store (cookie), else their Rewards home store. Only trading stores count. */
export const getPreferredStore = cache(async (): Promise<ShopStore | null> => {
  const code = (await cookies()).get(SHOP_COOKIE.store)?.value;
  const customer = await getCustomer();
  const where: Prisma.StoreWhereInput | null = code ? { code } : customer?.homeStoreId ? { id: customer.homeStoreId } : null;
  if (!where) return null;
  return db.store.findFirst({ where: { ...where, kind: "RETAIL", status: "ACTIVE" }, select: STORE_SELECT });
});

export async function savePreferredStore(code: string) {
  (await cookies()).set(SHOP_COOKIE.store, code, opts(365 * DAY));
}

/** Trading and opening-soon retail stores for pickers and the store finder. */
export const getRetailStores = cache(async () =>
  db.store.findMany({
    where: { kind: "RETAIL", status: { in: ["ACTIVE", "OPENING_SOON"] } },
    select: STORE_SELECT,
    orderBy: [{ province: "asc" }, { city: "asc" }, { name: "asc" }],
  }),
);

/** Franchisor details for the footer, legal pages and emails. */
export const getFranchisor = cache(async () => db.company.findFirst({ where: { kind: "FRANCHISOR" } }));
