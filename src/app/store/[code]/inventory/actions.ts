"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { parseWhole, str } from "@/server/store/rules";

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
    return done(before ? "Stock levels saved." : "Item ranged at your store with these levels.");
  });
}
