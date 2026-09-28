"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { approveMonth, releaseHeld, type CommissionLine } from "@/server/commission";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { zar } from "@/lib/money";
import { fmtMonth } from "@/lib/format";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthLabel = (m: string) => fmtMonth(`${m}-15T12:00:00Z`);

/** The owner pays commission, so only they (or the HQ administrator) switch it, approve it and release held amounts. */
async function owner(code: string) {
  const ctx = await manage(code);
  if (ctx.user.role !== "OWNER" && ctx.user.role !== "HQ_ADMIN") throw new UserError("Only the owner can do that — they pay the commission.");
  return { ...ctx, approver: { ...ctx.actor, id: ctx.user.id } };
}

/** Each action's own button disappears once it's done, so the confirmation travels as a one-time ?m= flash. */
function back(code: string, message: string, month?: string): never {
  revalidatePath("/hq/commission");
  redirect(`/store/${code}/commission?${month ? `month=${month}&` : ""}m=${encodeURIComponent(message)}`);
}

export async function setCommission(code: string, on: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await owner(code);
    if (store.commissionOn === on) return done(on ? "Commission is already on." : "Commission is already off.");
    await db.store.update({ where: { id: store.id }, data: { commissionOn: on } });
    await audit(db, actor, "commission.switch", { storeId: store.id, entity: "Store", entityId: store.id, data: { on } });
    back(
      store.code,
      on
        ? "Commission is on. Your team sees theirs on the till, and you approve each month for payroll once it ends."
        : "Commission is off. Approved months stay on record; nothing new can be approved until it's back on.",
    );
  });
}

export async function approve(code: string, month: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, approver } = await owner(code);
    if (!MONTH.test(month)) return fail("Choose a month to approve");
    const run = await approveMonth(store.id, month, approver);
    const held = (run.lines as CommissionLine[]).filter((l) => l.held);
    back(
      store.code,
      `${monthLabel(month)} approved: ${zar(run.totalCents)} to pay through payroll` +
        (held.length ? `, and ${zar(held.reduce((t, l) => t + l.commissionCents, 0))} held for ${held.length === 1 ? "1 person" : `${held.length} people`} until their alerts are closed.` : "."),
      month,
    );
  });
}

export async function release(code: string, month: string, userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, approver } = await owner(code);
    if (!MONTH.test(month)) return fail("Choose a month");
    await releaseHeld(store.id, month, userId, approver);
    const run = await db.commissionRun.findUnique({ where: { storeId_month: { storeId: store.id, month } }, select: { lines: true } });
    const line = ((run?.lines ?? []) as CommissionLine[]).find((l) => l.userId === userId);
    back(store.code, `Released ${line ? `${zar(line.commissionCents)} for ${line.name}` : "the held amount"} — pay it with the next payroll.`, month);
  });
}
