// "Buy again" (pure): which of an order's lines can go back into the bag now, and why the rest can't. The bag's own
// limits apply (lines and quantity per line), stock is what the network can ship or hand over, and a line the shopper
// may not buy today (a medicine without dispensary access, a product taken off sale) is left out with the reason.
import { CART_MAX_LINES, CART_MAX_QTY, type CartItem } from "@/server/shop/cart-codec";

export type ReorderLine = {
  variantId: string;
  name: string; // "Calm CBD Oil · 30 ml"
  qty: number;
  active: boolean; // the variant is on sale
  onSale: boolean; // the product is ACTIVE
  allowed: boolean; // the shopper may buy this class today (licensed classes need dispensary access)
  available: number; // units the network can supply now (ignored for made-to-order lines)
  made?: boolean; // made to order: always available
};
export type Skipped = { variantId: string; name: string; reason: string };
export type ReorderPlan = { cart: CartItem[]; added: { variantId: string; name: string; qty: number }[]; skipped: Skipped[] };

/** Rebuilds the bag from `cart` plus what can be re-added from `lines`; nothing is removed from the bag. */
export function planReorder(lines: ReorderLine[], cart: CartItem[], limits = { maxLines: CART_MAX_LINES, maxQty: CART_MAX_QTY }): ReorderPlan {
  const next = cart.map((i) => ({ ...i }));
  const added: ReorderPlan["added"] = [];
  const skipped: Skipped[] = [];
  for (const l of lines) {
    if (!l.active || !l.onSale) {
      skipped.push({ variantId: l.variantId, name: l.name, reason: "no longer available" });
      continue;
    }
    if (!l.allowed) {
      skipped.push({ variantId: l.variantId, name: l.name, reason: "needs your patient authorisation, so order it from the dispensary" });
      continue;
    }
    const inBag = next.find((i) => i.variantId === l.variantId);
    const room = limits.maxQty - (inBag?.qty ?? 0);
    const supply = l.made ? Infinity : Math.max(0, l.available);
    if (supply <= 0) {
      skipped.push({ variantId: l.variantId, name: l.name, reason: "out of stock right now" });
      continue;
    }
    if (room <= 0) {
      skipped.push({ variantId: l.variantId, name: l.name, reason: `already ${limits.maxQty} in your bag` });
      continue;
    }
    if (!inBag && next.length >= limits.maxLines) {
      skipped.push({ variantId: l.variantId, name: l.name, reason: "your bag is full" });
      continue;
    }
    const qty = Math.max(1, Math.min(l.qty, room, supply));
    if (inBag) inBag.qty += qty;
    else next.push({ variantId: l.variantId, qty });
    added.push({ variantId: l.variantId, name: l.name, qty });
    if (qty < l.qty) skipped.push({ variantId: l.variantId, name: l.name, reason: supply < l.qty ? `only ${qty} in stock, so we added ${qty}` : `we added ${qty}: the most one bag can hold` });
  }
  return { cart: next, added, skipped };
}

/** One line for the member: "Added 2 items. Left out: Sunset grinder (out of stock right now)." */
export function reorderSummary(p: ReorderPlan) {
  const n = p.added.reduce((s, a) => s + a.qty, 0);
  const head = n ? `Added ${n} item${n === 1 ? "" : "s"} to your bag.` : "Nothing could be added to your bag.";
  const left = p.skipped.length ? ` Left out: ${p.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}.` : "";
  return head + left;
}
