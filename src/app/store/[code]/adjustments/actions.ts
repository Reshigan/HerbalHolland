"use server";
import { revalidatePath } from "next/cache";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { adjustStock } from "@/server/inventory";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { ADJUST_REASONS, checkAdjustment, parseWhole, str } from "@/server/store/rules";
import { zar } from "@/lib/money";
import type { AdjustReason } from "@/generated/prisma/client";

/** Posts a manual adjustment against one batch lot, with a reason (and a witness for destruction). */
export async function postAdjustment(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const reason = str(fd, "reason") as AdjustReason;
    if (!(reason in ADJUST_REASONS)) return fail("Choose a reason", "reason");
    const variantId = str(fd, "variantId");
    const batchId = str(fd, "batchId");
    if (!variantId) return fail("Choose an item", "variantId");
    if (!batchId) return fail("Choose the batch", "batchId");
    const batch = await db.batch.findUnique({ where: { id: batchId }, include: { variant: { include: { product: { select: { name: true } } } } } });
    if (!batch || batch.variantId !== variantId) return fail("That batch doesn't belong to this item", "batchId");
    const lot = await db.stockLevel.findUnique({ where: { storeId_variantId_batchId: { storeId: store.id, variantId, batchId } } });
    const witness = str(fd, "witness").slice(0, 120);
    const noteIn = str(fd, "note").slice(0, 300);
    const dir = str(fd, "direction");
    const check = checkAdjustment({
      reason,
      qty: parseWhole(str(fd, "qty"), 0, 1_000_000) ?? NaN,
      direction: dir === "IN" || dir === "OUT" ? dir : null,
      onHand: lot?.onHand ?? 0,
      witness,
      note: noteIn,
    });
    if ("error" in check) return fail(check.error, check.field);
    const note = reason === "DESTROYED" ? `Destroyed, witnessed by ${witness}${noteIn ? ` · ${noteIn}` : ""}` : noteIn || undefined;
    const value = await tx(async (t) => {
      const cost = await adjustStock(t, { storeId: store.id, variantId, batchId, delta: check.delta, reason, userId: user.id, note });
      await audit(t, actor, "stock.adjust", {
        storeId: store.id,
        entity: "Variant",
        entityId: variantId,
        data: { batch: batch.code, delta: check.delta, reason, witness: witness || undefined, note: noteIn || undefined, valueCents: check.delta * cost },
      });
      return check.delta * cost;
    });
    revalidatePath(`/store/${store.code}/adjustments`);
    revalidatePath(`/store/${store.code}/inventory`);
    const n = Math.abs(check.delta);
    return done(
      `${check.delta < 0 ? "Wrote off" : "Booked in"} ${n} × ${batch.variant.product.name} · ${batch.variant.name} (${ADJUST_REASONS[reason].label.toLowerCase()}, batch ${batch.code}), ${zar(Math.abs(value))} at cost.`,
    );
  });
}
