"use server";
// Working support tickets from HQ: the HQ team and area managers (their region's stores' orders). Every change goes
// through @/server/support, which checks the scope again and writes the audit log.
import { revalidatePath } from "next/cache";
import { guard, DENIED, done, fail, type ActionState } from "@/server/hq/guard";
import { scopedStoreIds } from "@/server/scope";
import { str } from "@/server/hq/form";
import { assignTicket, replyToTicket, resolveTicket, setTicketPriority, SupportError, type SupportScope } from "@/server/support";

async function ctx() {
  const g = await guard("view");
  if (!g) return null;
  const scope: SupportScope = g.scope.kind === "HQ" ? { kind: "HQ" } : { kind: "STORES", storeIds: await scopedStoreIds(g.scope) };
  return { ...g, supportScope: scope };
}

const refresh = (id: string) => {
  revalidatePath("/hq/support");
  revalidatePath(`/hq/support/${id}`);
};

async function run(id: string, fn: (c: NonNullable<Awaited<ReturnType<typeof ctx>>>) => Promise<string>): Promise<ActionState> {
  const c = await ctx();
  if (!c) return DENIED;
  try {
    const msg = await fn(c);
    refresh(id);
    return done(msg);
  } catch (e) {
    if (e instanceof SupportError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
    throw e;
  }
}

export async function replyTicket(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(id, async (c) => {
    const t = await replyToTicket(id, str(fd, "body"), { id: c.user.id, name: c.user.name }, c.supportScope, { canned: str(fd, "canned") || null });
    return `Reply sent${t.email ? ` to ${t.email}` : " by SMS"}. ${t.number} is now waiting for the member.`;
  });
}

export async function assignTicketAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(id, async (c) => {
    const r = await assignTicket(id, str(fd, "assignedToId") || null, c.actor, c.supportScope);
    return !r.changed ? "No change." : r.ticket.assignedToId ? "Assigned." : "Unassigned.";
  });
}

export async function setPriorityAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(id, async (c) => {
    const r = await setTicketPriority(id, str(fd, "priority"), c.actor, c.supportScope);
    return r.changed ? "Priority saved." : "No change.";
  });
}

export async function resolveTicketAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(id, async (c) => {
    const t = await resolveTicket(id, { id: c.user.id, name: c.user.name }, c.supportScope, str(fd, "note"));
    return `${t.number} resolved. The member has been told and can reopen it by replying within 30 days.`;
  });
}
