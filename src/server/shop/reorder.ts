// "Buy again": one tap puts an order's lines (or one product from a reminder) back into the bag, within stock, the
// bag's limits and today's rules — a medicine needs dispensary access, a product taken off sale stays out. The rules
// are pure (@/lib/reorder); this file gathers the facts and saves the bag.
import { db } from "@/server/db";
import { availability, availKey } from "@/server/inventory";
import { getDispensaryAccess, getClasses } from "./access";
import { getNetwork } from "./catalogue";
import { getCart, saveCart } from "./context";
import { cartCount } from "./cart-codec";
import { planReorder, reorderSummary, type ReorderLine } from "@/lib/reorder";

export type ReorderResult = { ok: boolean; summary: string; count: number; added: number; skipped: { name: string; reason: string }[] };

type Wanted = { variantId: string; qty: number };

async function reorder(wanted: Wanted[]): Promise<ReorderResult> {
  const variants = await db.variant.findMany({ where: { id: { in: wanted.map((w) => w.variantId) } }, select: { id: true, name: true, active: true, podSku: true, product: { select: { name: true, status: true, regClass: true } } } });
  const classes = await getClasses();
  const licensed = variants.some((v) => classes.licensed.includes(v.product.regClass));
  const access = licensed ? await getDispensaryAccess() : null;
  const net = await getNetwork();
  const avail = await availability(net.all, variants.map((v) => v.id));
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines: ReorderLine[] = wanted.flatMap((w): ReorderLine[] => {
    const v = byId.get(w.variantId);
    if (!v) return [{ variantId: w.variantId, name: "An item", qty: w.qty, active: false, onSale: false, allowed: false, available: 0 }];
    return [{
      variantId: v.id, name: `${v.product.name} · ${v.name}`, qty: w.qty, active: v.active, onSale: v.product.status === "ACTIVE",
      allowed: !classes.licensed.includes(v.product.regClass) || !!access?.allowed,
      available: net.all.reduce((s, storeId) => s + Math.max(0, avail.get(availKey(storeId, v.id))?.available ?? 0), 0),
      made: !!v.podSku,
    }];
  });
  const plan = planReorder(lines, await getCart());
  if (plan.added.length) await saveCart(plan.cart);
  return { ok: plan.added.length > 0, summary: reorderSummary(plan), count: cartCount(plan.cart), added: plan.added.reduce((s, a) => s + a.qty, 0), skipped: plan.skipped.map((s) => ({ name: s.name, reason: s.reason })) };
}

/** Re-adds the member's own order. */
export async function reorderOrder(customerId: string, orderId: string): Promise<ReorderResult> {
  const order = await db.order.findFirst({ where: { id: orderId, customerId }, select: { lines: { select: { variantId: true, qty: true } } } });
  if (!order) return { ok: false, summary: "We couldn't find that order.", count: cartCount(await getCart()), added: 0, skipped: [] };
  return reorder(order.lines);
}

/** Re-adds one product (a reminder's one-tap link, the wishlist). */
export const reorderVariant = (variantId: string, qty = 1) => reorder([{ variantId, qty }]);
