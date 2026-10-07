"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { isHq, requireStaff } from "@/server/auth";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { parseRand, parseWhole, str } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { savePrices } from "../pricing/actions";

/** Sets the reorder point and par level for a SKU (ranging it at the store if needed). */
export async function saveLevels(code: string, variantId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, actor } = await manage(code);
    const reorderPoint = parseWhole(str(fd, "reorderPoint"), 0, 9_999);
    const parLevel = parseWhole(str(fd, "parLevel"), 0, 9_999);
    if (reorderPoint == null) return fail("Enter a reorder point of 0 or more", "reorderPoint");
    if (parLevel == null) return fail("Enter a par level of 0 or more", "parLevel");
    if (parLevel < reorderPoint) return fail("Par level must be at least the reorder point", "parLevel");
    const variant = await db.variant.findUnique({ where: { id: variantId }, select: { id: true, active: true } });
    if (!variant) throw new UserError("That item no longer exists");
    const key = { storeId_variantId: { storeId: store.id, variantId } };
    const before = await db.storeVariant.findUnique({ where: key });
    await db.storeVariant.upsert({ where: key, create: { storeId: store.id, variantId, reorderPoint, parLevel }, update: { reorderPoint, parLevel } });
    await audit(db, actor, "inventory.levels", {
      storeId: store.id,
      entity: "Variant",
      entityId: variantId,
      data: { reorderPoint, parLevel, before: before ? { reorderPoint: before.reorderPoint, parLevel: before.parLevel } : null },
    });
    revalidatePath(`/store/${store.code}/inventory/${variantId}`);
    revalidatePath(`/store/${store.code}/inventory`);
    return done(before ? "Stock levels saved." : "Item ranged at your store with these levels.");
  });
}

/**
 * Sets one SKU's shelf price from the stock list (empty = follow the list price). Same rules, audit entry
 * (`price.override`) and margin warning as the pricing workbench, which does the work. Like it, never for HQ:
 * shelf prices are the franchisee's (Competition Act s5(2)).
 */
export async function saveShelfPrice(code: string, variantId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    if (isHq(await requireStaff())) return fail("Shelf prices are the franchisee's to set", "price");
    const { store } = await manage(code);
    const raw = str(fd, "price");
    const priceCents = raw ? parseRand(raw) : null;
    if (raw && (priceCents == null || priceCents <= 0)) return fail("Enter a price like 249.00, or leave it empty to follow the list price", "price");
    const current = await db.storeVariant.findUnique({ where: { storeId_variantId: { storeId: store.id, variantId } }, select: { priceCents: true } });
    if (!current) return fail("Range the item at your store before setting a price");
    if (current.priceCents === priceCents) return done(priceCents == null ? "Already following the list price." : `Already ${zar(priceCents)}.`);
    const r = await savePrices(code, [{ variantId, priceCents }]);
    if (r.error) return fail(r.error, "price");
    revalidatePath(`/store/${store.code}/inventory`);
    revalidatePath(`/store/${store.code}/inventory/${variantId}`);
    return done(priceCents == null ? "Back to the list price. Tills pick it up straight away." : `Shelf price ${zar(priceCents)} saved. Tills pick it up straight away.${r.ok?.includes("margin guide") ? " It's below the margin guide, but it's your call." : ""}`);
  });
}
