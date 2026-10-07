"use server";
import { revalidatePath } from "next/cache";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { adjustStock } from "@/server/inventory";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { checkAdjustment, str } from "@/server/store/rules";
import { zar } from "@/lib/money";

const ALLOWED = ["RECALL", "DESTROYED", "EXPIRED"] as const;

/** Writes off everything on hand in one lot — recall return, witnessed destruction or expiry. */
export async function writeOffLot(code: string, lotId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const reason = str(fd, "reason") as (typeof ALLOWED)[number];
    if (!ALLOWED.includes(reason)) return fail("Choose how the stock leaves the store", "reason");
    const lot = await db.stockLevel.findFirst({
      where: { id: lotId, storeId: store.id },
      include: { batch: true, variant: { include: { product: { select: { name: true } } } } },
    });
    if (!lot) return fail("That lot is no longer at this store");
    if (lot.onHand <= 0) return fail("Nothing on hand in this lot to write off");
    if (reason === "EXPIRED" && (!lot.batch.expiresAt || lot.batch.expiresAt > new Date())) return fail("This batch hasn't expired. Use Recall return or Destroyed.");
    const witness = str(fd, "witness").slice(0, 120);
    const noteIn = str(fd, "note").slice(0, 300);
    const check = checkAdjustment({ reason, qty: lot.onHand, onHand: lot.onHand, witness, note: noteIn });
    if ("error" in check) return fail(check.error, check.field);
    const note =
      reason === "DESTROYED"
        ? `Destroyed, witnessed by ${witness}${noteIn ? ` · ${noteIn}` : ""}`
        : reason === "RECALL"
          ? `Recall return to ${store.dc?.name ?? "distribution centre"}${noteIn ? ` · ${noteIn}` : ""}`
          : noteIn || "Expired stock written off";
    const value = await tx(async (t) => {
      const cost = await adjustStock(t, { storeId: store.id, variantId: lot.variantId, batchId: lot.batchId, delta: check.delta, reason, userId: user.id, note });
      await audit(t, actor, "stock.writeoff", {
        storeId: store.id,
        entity: "Batch",
        entityId: lot.batchId,
        data: { batch: lot.batch.code, status: lot.batch.status, units: -check.delta, reason, witness: witness || undefined, valueCents: check.delta * cost },
      });
      return -check.delta * cost;
    });
    revalidatePath(`/store/${store.code}/batches`);
    revalidatePath(`/store/${store.code}/inventory`);
    return done(`Wrote off ${-check.delta} × ${lot.variant.product.name} · ${lot.variant.name} from batch ${lot.batch.code} (${zar(value)} at cost).`);
  });
}
