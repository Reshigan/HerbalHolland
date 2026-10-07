"use server";
// A store's managers and owner work the returns on the orders their store fulfilled. Every change goes through
// @/server/returns, which checks the scope again, moves the money and the books, and writes the audit log.
import { revalidatePath } from "next/cache";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { str } from "@/server/store/rules";
import { bookCollection, decideReturn, receiveReturn, refundReturn, ReturnError, type ReturnScope } from "@/server/returns";
import { zar } from "@/lib/money";

type Ctx = Awaited<ReturnType<typeof manage>> & { scope: ReturnScope; who: { type: "USER"; id: string; name: string } };

async function run(code: string, id: string, fn: (c: Ctx) => Promise<string>): Promise<ActionState> {
  return attempt(async () => {
    const m = await manage(code);
    try {
      const msg = await fn({ ...m, scope: { kind: "STORES", storeIds: [m.store.id] }, who: { type: "USER", id: m.user.id, name: m.user.name } });
      revalidatePath(`/store/${m.store.code}/returns`);
      revalidatePath(`/store/${m.store.code}/returns/${id}`);
      revalidatePath(`/store/${m.store.code}/orders`);
      return done(msg);
    } catch (e) {
      if (e instanceof ReturnError) return fail(e.message, e.field);
      throw e;
    }
  });
}

export async function approveReturn(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(code, id, async (c) => `${(await decideReturn(id, "APPROVED", str(fd, "note"), c.who, c.scope)).number} approved, and the member has been told. Book the collection next.`);
}
export async function declineReturn(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(code, id, async (c) => `${(await decideReturn(id, "DECLINED", str(fd, "note"), c.who, c.scope)).number} declined. The member has been sent the reason.`);
}
export async function bookReturnCollection(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(code, id, async (c) => `Collection recorded for ${(await bookCollection(id, { courier: str(fd, "courier"), waybill: str(fd, "waybill") }, c.who, c.scope)).number}. The member has the courier and waybill.`);
}
export async function receiveReturnAction(code: string, id: string, _: ActionState): Promise<ActionState> {
  return run(code, id, async (c) => `${(await receiveReturn(id, c.who, c.scope)).number} received. Check it, then refund.`);
}
export async function refundReturnAction(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(code, id, async (c) => {
    const restock = Object.fromEntries([...fd.keys()].filter((k) => k.startsWith("restock:")).map((k) => [k.slice(8), true]));
    const r = await refundReturn(id, { restock, manualRef: str(fd, "manualRef") || null, manualMethod: str(fd, "manualMethod") || null }, c.who, c.scope);
    return `${r.r.number} refunded: ${zar(r.cents)} ${r.money.note}${r.creditNote ? `; credit note ${r.creditNote}` : ""}. The member has been told.`;
  });
}
