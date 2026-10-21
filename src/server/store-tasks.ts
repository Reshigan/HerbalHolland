// Franchisee onboarding: a store's opening checklist, seeded from the template in @/lib/opening when HQ onboards
// the store (or started later for an existing one), worked from HQ → Stores → store. HQ-only.
import { db, type Tx } from "./db";
import { audit, type Actor } from "./audit";
import { checklistProgress, groupTasks, openingTasks } from "@/lib/opening";
import { asList } from "@/lib/json-list";

export class StoreTaskError extends Error {}

/** Seeds the checklist for a store (no-op when it already has one). Licence lines only where THC is licensed. */
export async function seedChecklist(client: Tx | typeof db, store: { id: string; openedAt: Date | null; licences: unknown; status?: string }, actor: Actor) {
  if (await client.storeTask.count({ where: { storeId: store.id } })) return 0;
  // A store already trading has no opening day ahead: leave the dates off and let HQ tick things as they stand.
  const openingAt = store.status === "ACTIVE" ? null : store.openedAt;
  const tasks = openingTasks({ openingAt, thc: asList<string>(store.licences).includes("THC") });
  const r = await client.storeTask.createMany({ data: tasks.map((t) => ({ storeId: store.id, key: t.key, title: t.title, group: t.group, sortOrder: t.sortOrder, dueAt: t.dueAt })) });
  await audit(client, actor, "store.checklist_seed", { storeId: store.id, entity: "Store", entityId: store.id, data: { tasks: r.count, openingAt } });
  return r.count;
}

/** The checklist with progress, grouped in template order. */
export async function checklist(storeId: string, now = new Date()) {
  const tasks = await db.storeTask.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(tasks.map((t) => t.doneById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
  const who = new Map(users.map((u) => [u.id, u.name]));
  const rows = tasks.map((t) => ({ ...t, doneBy: t.doneById ? who.get(t.doneById) ?? null : null }));
  return { tasks: rows, groups: groupTasks(rows, now), progress: checklistProgress(rows, now) };
}

export async function completeTask(storeId: string, taskId: string, note: string | null, actor: Actor & { id: string }) {
  const t = await db.storeTask.findFirst({ where: { id: taskId, storeId } });
  if (!t) throw new StoreTaskError("Task not found");
  if (t.doneAt) throw new StoreTaskError("Already marked done");
  const text = note?.trim().slice(0, 300) || null;
  await db.storeTask.update({ where: { id: t.id }, data: { doneAt: new Date(), doneById: actor.id, note: text } });
  await audit(db, actor, "store.task_done", { storeId, entity: "StoreTask", entityId: t.id, data: { key: t.key, title: t.title, note: text } });
  return t;
}

export async function reopenTask(storeId: string, taskId: string, actor: Actor & { id: string }) {
  const t = await db.storeTask.findFirst({ where: { id: taskId, storeId } });
  if (!t) throw new StoreTaskError("Task not found");
  if (!t.doneAt) throw new StoreTaskError("Not done yet");
  await db.storeTask.update({ where: { id: t.id }, data: { doneAt: null, doneById: null } });
  await audit(db, actor, "store.task_reopen", { storeId, entity: "StoreTask", entityId: t.id, data: { key: t.key, title: t.title } });
  return t;
}

/** Moves every open task's due date when the opening day changes (done tasks keep their dates). */
export async function rescheduleChecklist(storeId: string, openingAt: Date | null) {
  const tasks = await db.storeTask.findMany({ where: { storeId, doneAt: null }, select: { id: true, key: true } });
  if (!tasks.length) return 0;
  const due = new Map(openingTasks({ openingAt, thc: true }).map((t) => [t.key, t.dueAt]));
  await db.$transaction(tasks.map((t) => db.storeTask.update({ where: { id: t.id }, data: { dueAt: due.get(t.key) ?? null } })));
  return tasks.length;
}

/** Compact progress per store for the HQ stores list: done / total and overdue, for the visible page only. */
export async function checklistProgressByStore(storeIds: string[], now = new Date()) {
  if (!storeIds.length) return new Map<string, { total: number; done: number; overdue: number }>();
  const rows = await db.$queryRaw<{ storeId: string; total: number; done: number; overdue: number }[]>`
    SELECT "storeId", COUNT(*) AS total, COUNT("doneAt") AS done,
      COUNT(CASE WHEN "doneAt" IS NULL AND "dueAt" < ${now} THEN 1 END) AS overdue
    FROM "StoreTask" WHERE "storeId" IN (SELECT value FROM json_each(${JSON.stringify(storeIds)})) GROUP BY 1`;
  return new Map(rows.map((r) => [r.storeId, { total: r.total, done: r.done, overdue: r.overdue }]));
}
