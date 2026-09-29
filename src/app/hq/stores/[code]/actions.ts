"use server";
// The store-opening checklist (HQ only): start it for a store, tick tasks off with a note, untick by mistake.
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { guard, inScope, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str } from "@/server/hq/form";
import { completeTask, reopenTask, seedChecklist, StoreTaskError } from "@/server/store-tasks";

async function checklistStore(storeId: string) {
  const g = await guard("network");
  if (!g || !(await inScope(g.scope, storeId))) return null;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, code: true, openedAt: true, licences: true, status: true } });
  return store ? { g, store } : null;
}

export async function startChecklist(storeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  const c = await checklistStore(storeId);
  if (!c) return DENIED;
  const n = await seedChecklist(db, c.store, c.g.actor);
  revalidatePath(`/hq/stores/${c.store.code}`);
  revalidatePath("/hq/stores");
  return done(n ? `Opening checklist started: ${n} tasks.` : "The checklist already exists.");
}

export async function markTaskDone(storeId: string, taskId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const c = await checklistStore(storeId);
  if (!c) return DENIED;
  try {
    const t = await completeTask(storeId, taskId, str(fd, "note") || null, { ...c.g.actor, id: c.g.user.id });
    revalidatePath(`/hq/stores/${c.store.code}`);
    revalidatePath("/hq/stores");
    return done(`Done: ${t.title}.`);
  } catch (e) {
    if (e instanceof StoreTaskError) return fail(e.message);
    throw e;
  }
}

export async function markTaskOpen(storeId: string, taskId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  const c = await checklistStore(storeId);
  if (!c) return DENIED;
  try {
    const t = await reopenTask(storeId, taskId, { ...c.g.actor, id: c.g.user.id });
    revalidatePath(`/hq/stores/${c.store.code}`);
    revalidatePath("/hq/stores");
    return done(`Reopened: ${t.title}.`);
  } catch (e) {
    if (e instanceof StoreTaskError) return fail(e.message);
    throw e;
  }
}
