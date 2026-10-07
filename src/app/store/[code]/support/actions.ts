"use server";
// A store's managers and owner work the support tickets about the orders their store fulfilled. Every change goes
// through @/server/support, which checks the scope again and writes the audit log.
import { revalidatePath } from "next/cache";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { str } from "@/server/store/rules";
import { assignTicket, replyToTicket, resolveTicket, setTicketPriority, SupportError, type SupportScope } from "@/server/support";

async function run(code: string, id: string, fn: (c: Awaited<ReturnType<typeof manage>> & { scope: SupportScope }) => Promise<string>): Promise<ActionState> {
  return attempt(async () => {
    const m = await manage(code);
    try {
      const msg = await fn({ ...m, scope: { kind: "STORES", storeIds: [m.store.id] } });
      revalidatePath(`/store/${m.store.code}/support`);
      revalidatePath(`/store/${m.store.code}/support/${id}`);
      return done(msg);
    } catch (e) {
      if (e instanceof SupportError) return fail(e.message, e.field);
      throw e;
    }
  });
}

export async function replyTicket(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(code, id, async (c) => {
    const t = await replyToTicket(id, str(fd, "body"), { id: c.user.id, name: c.user.name }, c.scope, { canned: str(fd, "canned") || null });
    return `Reply sent${t.email ? ` to ${t.email}` : " by SMS"}. ${t.number} is now waiting for the member.`;
  });
}

export async function assignTicketAction(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(code, id, async (c) => {
    const r = await assignTicket(id, str(fd, "assignedToId") || null, c.actor, c.scope);
    return !r.changed ? "No change." : r.ticket.assignedToId ? "Assigned." : "Unassigned.";
  });
}

export async function setPriorityAction(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(code, id, async (c) => {
    const r = await setTicketPriority(id, str(fd, "priority"), c.actor, c.scope);
    return r.changed ? "Priority saved." : "No change.";
  });
}

export async function resolveTicketAction(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(code, id, async (c) => {
    const t = await resolveTicket(id, { id: c.user.id, name: c.user.name }, c.scope, str(fd, "note"));
    return `${t.number} resolved. The member has been told and can reopen it by replying within 30 days.`;
  });
}
