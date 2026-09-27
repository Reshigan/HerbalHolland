"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { availability, availKey } from "@/server/inventory";
import { createStockOrder } from "@/server/stock-orders";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { parseRand, parseWhole, str } from "@/server/store/rules";
import { zar } from "@/lib/money";

/** Buys from another store's listing at its asking price (network order, awaiting the seller). */
export async function buyListing(code: string, listingId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await attempt(async () => {
    const { store, actor } = await manage(code);
    const listing = await db.listing.findUnique({ where: { id: listingId }, include: { store: { select: { id: true, status: true, kind: true, name: true } } } });
    if (!listing || !listing.active || listing.qty <= 0) return fail("That listing has just closed or sold out");
    if (listing.storeId === store.id) return fail("That's your own listing");
    if (listing.store.status !== "ACTIVE" || listing.store.kind !== "RETAIL") return fail("That store isn't trading right now");
    const qty = parseWhole(str(fd, "qty"), 1, listing.qty);
    if (qty == null) return fail(`Choose between 1 and ${listing.qty} units`, "qty");
    const order = await createStockOrder({
      buyerId: store.id,
      sellerId: listing.storeId,
      kind: "NETWORK",
      lines: [{ variantId: listing.variantId, qty, unitCostCents: listing.unitCostCents }],
      notes: `From ${listing.store.name}'s network listing`,
      actor,
      submit: true,
      listingId: listing.id,
    });
    id = order.id;
    return done(`${order.number} sent to ${listing.store.name}`);
  });
  if (id) {
    revalidatePath(`/store/${code}/network`);
    redirect(`/store/${code}/purchasing/${id}`);
  }
  return res;
}

export async function createListing(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const variantId = str(fd, "variantId");
    const variant = variantId ? await db.variant.findUnique({ where: { id: variantId }, include: { product: { select: { name: true } } } }) : null;
    if (!variant) return fail("Choose an item to list", "variantId");
    const avail = (await availability([store.id], [variantId])).get(availKey(store.id, variantId))?.available ?? 0;
    const qty = parseWhole(str(fd, "qty"), 1, 100_000);
    if (qty == null) return fail("Enter how many units to list", "qty");
    if (qty > avail) return fail(`You only have ${Math.max(0, avail)} available to sell`, "qty");
    const price = parseRand(str(fd, "price"));
    if (price == null || price <= 0) return fail("Enter an asking price per unit, ex VAT", "price");
    if (price > variant.wholesaleCents * 2) return fail(`That's more than double wholesale (${zar(variant.wholesaleCents)}) — check the price`, "price");
    const note = str(fd, "note").slice(0, 200) || null;
    const existing = await db.listing.findFirst({ where: { storeId: store.id, variantId, active: true } });
    const listing = existing
      ? await db.listing.update({ where: { id: existing.id }, data: { qty, unitCostCents: price, note } })
      : await db.listing.create({ data: { storeId: store.id, variantId, qty, unitCostCents: price, note } });
    await audit(db, actor, existing ? "listing.update" : "listing.create", { storeId: store.id, entity: "Listing", entityId: listing.id, data: { sku: variant.sku, qty, unitCostCents: price } });
    revalidatePath(`/store/${store.code}/network`);
    return done(`${existing ? "Updated" : "Listed"} ${qty} × ${variant.product.name} · ${variant.name} at ${zar(price)} ex VAT.`);
  });
}

export async function closeListing(code: string, listingId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const listing = await db.listing.findFirst({ where: { id: listingId, storeId: store.id } });
    if (!listing) return fail("Listing not found");
    await db.listing.update({ where: { id: listing.id }, data: { active: false } });
    await audit(db, actor, "listing.close", { storeId: store.id, entity: "Listing", entityId: listing.id });
    revalidatePath(`/store/${store.code}/network`);
    return done("Listing closed.");
  });
}
