// Bag cookie codec (pure). Compact and cookie-safe: "<variantId>_<qty>.<variantId>_<qty>".
// Prices are never stored client-side — the bag is re-quoted on the server every time.
export type CartItem = { variantId: string; qty: number };

export const CART_MAX_LINES = 30;
export const CART_MAX_QTY = 20;
const ID = /^[A-Za-z0-9-]{8,40}$/;

export function parseCart(raw: string | null | undefined): CartItem[] {
  if (!raw) return [];
  const out = new Map<string, number>();
  for (const part of raw.split(".")) {
    const [id, q] = part.split("_");
    const qty = Math.floor(Number(q));
    if (!id || !ID.test(id) || !Number.isFinite(qty) || qty < 1) continue;
    if (!out.has(id) && out.size >= CART_MAX_LINES) break;
    out.set(id, Math.min(CART_MAX_QTY, (out.get(id) ?? 0) + qty));
  }
  return [...out].map(([variantId, qty]) => ({ variantId, qty }));
}

export function serializeCart(items: CartItem[]) {
  return items
    .filter((i) => ID.test(i.variantId) && i.qty >= 1)
    .slice(0, CART_MAX_LINES)
    .map((i) => `${i.variantId}_${Math.min(CART_MAX_QTY, Math.floor(i.qty))}`)
    .join(".");
}

/** Adds `qty` to a line (creating it), capped per line and per bag. */
export function withItem(items: CartItem[], variantId: string, qty: number): CartItem[] {
  const n = Math.max(1, Math.floor(qty));
  const hit = items.find((i) => i.variantId === variantId);
  if (hit) return items.map((i) => (i === hit ? { ...i, qty: Math.min(CART_MAX_QTY, i.qty + n) } : i));
  if (items.length >= CART_MAX_LINES) return items;
  return [...items, { variantId, qty: Math.min(CART_MAX_QTY, n) }];
}

/** Sets a line's quantity; zero or less removes it. */
export function withQty(items: CartItem[], variantId: string, qty: number): CartItem[] {
  const n = Math.floor(qty);
  if (n <= 0) return items.filter((i) => i.variantId !== variantId);
  return items.map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(CART_MAX_QTY, n) } : i));
}

export const cartCount = (items: CartItem[]) => items.reduce((s, i) => s + i.qty, 0);

/**
 * Points a member may redeem on an order: whole points (1 point = R1), at most `maxPct`
 * of the part of the order that may carry incentives (medicines are excluded under
 * Medicines Act s18A), never more than the balance, and nothing below the minimum.
 */
export function redeemablePoints(a: { balance: number; eligibleCents: number; maxPct: number; min: number }) {
  const cap = Math.floor((Math.max(0, a.eligibleCents) * a.maxPct) / 100 / 100);
  const max = Math.max(0, Math.min(a.balance, cap));
  return max >= a.min ? max : 0;
}
