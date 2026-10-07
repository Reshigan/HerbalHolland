"use server";
// Working returns from HQ (the HQ team, and area managers for their region's stores). Every change goes through
// @/server/returns, which checks the scope again, moves the money and the books, and writes the audit log.
import { revalidatePath } from "next/cache";
import { guard, DENIED, done, fail, type ActionState } from "@/server/hq/guard";
import { scopedStoreIds } from "@/server/scope";
import { str } from "@/server/hq/form";
import { bookCollection, decideReturn, receiveReturn, refundReturn, ReturnError, type ReturnScope } from "@/server/returns";
import { zar } from "@/lib/money";

async function ctx() {
  const g = await guard("view");
  if (!g) return null;
  const scope: ReturnScope = g.scope.kind === "HQ" ? { kind: "HQ" } : { kind: "STORES", storeIds: await scopedStoreIds(g.scope) };
  return { ...g, returnScope: scope, who: { ...g.actor, id: g.user.id, name: g.user.name } };
}

async function run(id: string, fn: (c: NonNullable<Awaited<ReturnType<typeof ctx>>>) => Promise<string>): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  try {
    const msg = await fn(c);
    revalidatePath("/hq/returns");
    revalidatePath(`/hq/returns/${id}`);
    return done(msg);
  } catch (e) {
    if (e instanceof ReturnError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
    throw e;
  }
}

export async function approveReturn(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(id, async (c) => `${(await decideReturn(id, "APPROVED", str(fd, "note"), c.who, c.returnScope)).number} approved and the member has been told. Book the collection next.`);
}
export async function declineReturn(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(id, async (c) => `${(await decideReturn(id, "DECLINED", str(fd, "note"), c.who, c.returnScope)).number} declined. The member has been sent the reason.`);
}
export async function bookReturnCollection(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(id, async (c) => `Collection recorded for ${(await bookCollection(id, { courier: str(fd, "courier"), waybill: str(fd, "waybill") }, c.who, c.returnScope)).number}. The member has the courier and waybill.`);
}
export async function receiveReturnAction(id: string, _: ActionState): Promise<ActionState> {
  return run(id, async (c) => `${(await receiveReturn(id, c.who, c.returnScope)).number} received. Check it, then refund.`);
}
export async function refundReturnAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(id, async (c) => {
    const restock = Object.fromEntries([...fd.keys()].filter((k) => k.startsWith("restock:")).map((k) => [k.slice(8), true]));
    const r = await refundReturn(id, { restock, manualRef: str(fd, "manualRef") || null, manualMethod: str(fd, "manualMethod") || null }, c.who, c.returnScope);
    return `${r.r.number} refunded: ${zar(r.cents)} ${r.money.note}${r.creditNote ? `; credit note ${r.creditNote}` : ""}. The member has been told.`;
  });
}
