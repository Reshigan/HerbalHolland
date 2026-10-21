// Wishlists: a heart on cards and product pages saves a variant to the member's list (/club/wishlist). The frequent
// job watches the network's stock for wished-for items and flags the ones that came back ("Back in stock"); members
// who want a message use "Notify me" (StockAlert). The wishlist itself sends nothing.
import { cache } from "react";
import { db } from "@/server/db";
import { availability, availKey } from "@/server/inventory";
import { madeToOrder } from "@/server/merch";
import { cardsWhere, getNetwork, type ProductCard, type Shopper } from "./catalogue";
import { getClasses } from "./access";
import { addDays } from "@/lib/format";
import { inBatches } from "@/lib/json-list";

export const WISHLIST_MAX = 100;
/** How long "Back in stock" stays on an item after its stock returned. */
export const RESTOCK_FLAG_DAYS = 14;

export const wishlistVariantIds = cache(async (customerId: string) => new Set((await db.wishlist.findMany({ where: { customerId }, select: { variantId: true } })).map((w) => w.variantId)));

export const wishlistCount = cache(async (customerId: string) => db.wishlist.count({ where: { customerId } }));

/** Adds or removes a variant; returns the new state. */
export async function toggleWishlist(customerId: string, variantId: string): Promise<{ on: boolean; error?: string }> {
  const v = await db.variant.findUnique({ where: { id: variantId }, select: { id: true, product: { select: { status: true } } } });
  if (!v || v.product.status === "ARCHIVED") return { on: false, error: "That item is no longer available" };
  const { count } = await db.wishlist.deleteMany({ where: { customerId, variantId } });
  if (count) return { on: false };
  if ((await db.wishlist.count({ where: { customerId } })) >= WISHLIST_MAX) return { on: false, error: `Your wishlist holds up to ${WISHLIST_MAX} items` };
  await db.wishlist.create({ data: { customerId, variantId } });
  return { on: true };
}

export type WishlistItem = { id: string; variantId: string; variantName: string; variantCount: number; addedAt: Date; restocked: boolean; card: ProductCard | null; buyable: boolean };

/** The member's list, newest first, as cards (a product that left the range keeps its name but can't be bought). */
export async function listWishlist(customerId: string, who: Shopper, now = new Date()): Promise<WishlistItem[]> {
  const rows = await db.wishlist.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: WISHLIST_MAX });
  if (!rows.length) return [];
  const variants = await inBatches(rows.map((r) => r.variantId), (part) => db.variant.findMany({ where: { id: { in: part } }, select: { id: true, name: true, active: true, podSku: true, productId: true, product: { select: { name: true, regClass: true, status: true, _count: { select: { variants: { where: { active: true } } } } } } } }));
  const byId = new Map(variants.map((v) => [v.id, v]));
  const [classes, net] = await Promise.all([getClasses(), getNetwork()]);
  const [cards, avail] = await Promise.all([inBatches([...new Set(variants.map((v) => v.productId))], (part) => cardsWhere({ id: { in: part } }, [...classes.public, ...classes.licensed], who)), availability(net.all, variants.map((v) => v.id))]);
  const cardOf = new Map(cards.map((c) => [c.id, c]));
  // Stock is the variant's own (a card speaks for the whole product).
  const inStock = (v: (typeof variants)[number]) => !!v.podSku || net.all.some((storeId) => (avail.get(availKey(storeId, v.id))?.available ?? 0) > 0);
  return rows.flatMap((r) => {
    const v = byId.get(r.variantId);
    if (!v) return [];
    const card = cardOf.get(v.productId) ?? null;
    return [{
      id: r.id, variantId: r.variantId, variantName: v.name, variantCount: v.product._count.variants, addedAt: r.createdAt,
      restocked: !!r.restockedAt && r.restockedAt > addDays(now, -RESTOCK_FLAG_DAYS),
      card, buyable: !!card && v.active && v.product.status === "ACTIVE" && inStock(v),
    }];
  });
}

/**
 * The frequent job: for every wished-for variant, note when the whole network runs out and when stock comes back.
 * Made-to-order merch is always in stock. Bounded to the newest 5,000 wishlist rows' variants.
 */
export async function refreshWishlistStock(now = new Date()) {
  const ids = (await db.wishlist.groupBy({ by: ["variantId"], orderBy: { variantId: "asc" }, take: 5_000 })).map((g) => g.variantId);
  if (!ids.length) return { checked: 0, out: 0, restocked: 0 };
  const [net, made] = await Promise.all([getNetwork(), madeToOrder(ids)]);
  const avail = await availability(net.all, ids);
  const out: string[] = [];
  const back: string[] = [];
  for (const id of ids) {
    const total = made.has(id) ? 1 : net.all.reduce((s, storeId) => s + Math.max(0, avail.get(availKey(storeId, id))?.available ?? 0), 0);
    (total > 0 ? back : out).push(id);
  }
  const [o, r] = await Promise.all([
    inBatches(out, (part) => db.wishlist.updateMany({ where: { variantId: { in: part }, outOfStockAt: null }, data: { outOfStockAt: now } }).then((r) => [r.count])).then((counts) => ({ count: counts.reduce((s, n) => s + n, 0) })),
    inBatches(back, (part) => db.wishlist.updateMany({ where: { variantId: { in: part }, outOfStockAt: { not: null } }, data: { outOfStockAt: null, restockedAt: now } }).then((r) => [r.count])).then((counts) => ({ count: counts.reduce((s, n) => s + n, 0) })),
  ]);
  return { checked: ids.length, out: o.count, restocked: r.count };
}
