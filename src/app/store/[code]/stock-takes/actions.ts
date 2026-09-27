"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { nextNumber } from "@/server/counters";
import { approveStockTake, startStockTake } from "@/server/inventory";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { bool, scopesOverlap, str } from "@/server/store/rules";

async function openTake(storeId: string, id: string) {
  const take = await db.stockTake.findFirst({ where: { id, storeId } });
  if (!take) throw new UserError("Stock take not found");
  if (take.status !== "COUNTING") throw new UserError(`This stock take is already ${take.status.toLowerCase()}`);
  return take;
}

export async function startTake(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await attempt(async () => {
    const { store, user, actor } = await manage(code);
    const scope = str(fd, "scope") === "FULL" ? "FULL" : str(fd, "category");
    if (!scope) return fail("Choose a category to cycle count", "category");
    if (scope !== "FULL" && !(await db.category.findUnique({ where: { slug: scope } }))) return fail("Unknown category", "category");
    const open = await db.stockTake.findMany({ where: { storeId: store.id, status: "COUNTING" }, select: { number: true, scope: true } });
    const clash = open.find((o) => scopesOverlap(o.scope, scope));
    if (clash) return fail(`${clash.number} is still counting ${clash.scope === "FULL" ? "the whole store" : "that category"} — approve or cancel it first.`);
    const n = await tx((t) => nextNumber(t, "ST"));
    const take = await startStockTake(store.id, scope, bool(fd, "blind"), user.id, `ST-${String(n).padStart(5, "0")}`);
    const lines = await db.stockTakeLine.count({ where: { stockTakeId: take.id } });
    if (!lines) {
      await db.stockTake.delete({ where: { id: take.id } });
      return fail("There's nothing on hand or ranged in that scope to count.");
    }
    const notes = str(fd, "notes").slice(0, 500);
    if (notes) await db.stockTake.update({ where: { id: take.id }, data: { notes } });
    await audit(db, actor, "stocktake.start", { storeId: store.id, entity: "StockTake", entityId: take.id, data: { number: take.number, scope, blind: take.blind, lines } });
    id = take.id;
    return done("Started");
  });
  if (id) redirect(`/store/${code}/stock-takes/${id}`);
  return res;
}

/** Saves counts from the count sheet (only changed lines are sent). null = not counted. */
export async function saveCounts(code: string, id: string, counts: { lineId: string; qty: number | null }[]): Promise<ActionState> {
  return attempt(async () => {
    const { store } = await manage(code);
    await openTake(store.id, id);
    if (!Array.isArray(counts) || counts.length > 5_000) return fail("Nothing to save");
    for (const c of counts) {
      if (typeof c?.lineId !== "string") return fail("Invalid line");
      if (c.qty != null && (!Number.isInteger(c.qty) || c.qty < 0 || c.qty > 100_000)) return fail("Counts must be whole numbers of 0 or more");
    }
    await db.$transaction(counts.map((c) => db.stockTakeLine.updateMany({ where: { id: c.lineId, stockTakeId: id }, data: { countedQty: c.qty } })));
    return done(`Saved ${counts.length} ${counts.length === 1 ? "count" : "counts"}`);
  });
}

export async function approveTake(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  let ok = false;
  const res = await attempt(async () => {
    const { store, user, actor } = await manage(code);
    const take = await openTake(store.id, id);
    const counted = await db.stockTakeLine.count({ where: { stockTakeId: id, countedQty: { not: null } } });
    if (!counted) return fail("Count at least one line before approving.");
    const value = await tx(async (t) => {
      const v = await approveStockTake(t, id, user.id);
      await audit(t, actor, "stocktake.approve", { storeId: store.id, entity: "StockTake", entityId: id, data: { number: take.number, varianceValueCents: v, countedLines: counted } });
      return v;
    });
    void value;
    ok = true;
    return done("Approved");
  });
  if (ok) {
    revalidatePath(`/store/${code}/inventory`);
    redirect(`/store/${code}/stock-takes/${id}`);
  }
  return res;
}

export async function cancelTake(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  let ok = false;
  const res = await attempt(async () => {
    const { store, actor } = await manage(code);
    const take = await openTake(store.id, id);
    await db.stockTake.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(db, actor, "stocktake.cancel", { storeId: store.id, entity: "StockTake", entityId: id, data: { number: take.number } });
    ok = true;
    return done("Cancelled");
  });
  if (ok) redirect(`/store/${code}/stock-takes/${id}`);
  return res;
}
