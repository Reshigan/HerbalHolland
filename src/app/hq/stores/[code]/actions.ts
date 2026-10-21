"use server";
// The store-opening checklist (HQ only): start it for a store, tick tasks off with a note, untick by mistake. And the
// franchisee's owner sign-ins (HQ administrator only): add one, reset a password, deactivate or reactivate.
import { revalidatePath } from "next/cache";
import { db, tx } from "@/server/db";
import { audit } from "@/server/audit";
import { hashSecret } from "@/server/auth";
import { temporaryPassword, tempPasswordUntil, TEMP_PASSWORD_HOURS } from "@/server/passwords";
import { guard, inScope, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str } from "@/server/hq/form";
import { completeTask, reopenTask, seedChecklist, StoreTaskError } from "@/server/store-tasks";
import { isEmail } from "@/lib/email";
import { asList } from "@/lib/json-list";

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
  const n = await seedChecklist(db, { ...c.store, licences: asList(c.store.licences) }, c.g.actor);
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

// ── Franchisee owners ────────────────────────────────────────────────────────
// An owner signs in to the back office for every store their company owns. Only the HQ administrator manages these
// sign-ins; every change is audited like HQ → Team, and deactivating or resetting signs them out everywhere.

async function ownerStore(storeId: string) {
  const g = await guard("admin");
  if (!g) return null;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, code: true, companyId: true, company: { select: { name: true, kind: true } } } });
  return store ? { g, store } : null;
}

const ownerOf = (companyId: string, userId: string) => db.user.findFirst({ where: { id: userId, role: "OWNER", companyId } });

export async function addOwner(storeId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const c = await ownerStore(storeId);
  if (!c) return DENIED;
  // HQ's own stores (the DCs) have no owner: an owner of HQ would hold HQ's books and every DC.
  if (c.store.company.kind !== "FRANCHISEE") return fail("Owners are for franchisee companies. HQ's own stores are run from HQ.");
  const fields: Record<string, string> = {};
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  if (name.length < 2) fields.name = "Their full name";
  if (!isEmail(email)) fields.email = "The email address they'll sign in with";
  else if (await db.user.count({ where: { email } })) fields.email = "Someone already signs in with this email";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const password = temporaryPassword();
  const u = await db.user.create({
    data: { name, email, role: "OWNER", companyId: c.store.companyId, passwordHash: await hashSecret(password), mustChangePassword: true, tempPasswordUntil: tempPasswordUntil() },
  });
  await audit(db, c.g.actor, "user.create", { storeId: c.store.id, entity: "User", entityId: u.id, data: { email, role: "OWNER", company: c.store.company.name } });
  revalidatePath(`/hq/stores/${c.store.code}`);
  return done(`${name} can now sign in as ${email} with the temporary password  ${password}  (share it privately: it isn't shown again, and it works for ${TEMP_PASSWORD_HOURS} hours). They'll choose their own password when they first sign in.`);
}

export async function resetOwnerPassword(storeId: string, userId: string, _: ActionState): Promise<ActionState> {
  const c = await ownerStore(storeId);
  if (!c) return DENIED;
  const u = await ownerOf(c.store.companyId, userId);
  if (!u) return fail("Owner not found.");
  const password = temporaryPassword();
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashSecret(password), mustChangePassword: true, tempPasswordUntil: tempPasswordUntil(), passwordFails: 0, passwordLockedAt: null } });
  await db.session.deleteMany({ where: { userId: u.id } });
  await audit(db, c.g.actor, "user.password_reset", { storeId: c.store.id, entity: "User", entityId: u.id, data: { email: u.email, role: "OWNER" } });
  revalidatePath(`/hq/stores/${c.store.code}`);
  return done(`New temporary password for ${u.name}:  ${password}  (share it privately: it works for ${TEMP_PASSWORD_HOURS} hours). They've been signed out everywhere and choose their own password when they sign in.`);
}

/** Deactivating signs them out everywhere; a company with a trading store keeps at least one active owner. */
export async function setOwnerActive(storeId: string, userId: string, active: boolean, _: ActionState): Promise<ActionState> {
  const c = await ownerStore(storeId);
  if (!c) return DENIED;
  const { companyId } = c.store;
  const result = await tx(async (t) => {
    // One decision at a time per company (D1 serialises writes), so two owners can't be deactivated together past the last one.
    const u = await t.user.findFirst({ where: { id: userId, role: "OWNER", companyId } });
    if (!u) return { error: "Owner not found." };
    if (!active && u.active) {
      const [others, trading] = await Promise.all([
        t.user.count({ where: { role: "OWNER", companyId, active: true, id: { not: u.id } } }),
        t.store.count({ where: { companyId, kind: "RETAIL", status: "ACTIVE" } }),
      ]);
      if (!others && trading) return { error: `${c.store.company.name} has a trading store, so it keeps at least one active owner. Add another owner first.` };
    }
    await t.user.update({ where: { id: u.id }, data: { active } });
    if (!active) await t.session.deleteMany({ where: { userId: u.id } });
    return { user: u };
  });
  if ("error" in result) return fail(result.error ?? "Owner not found.");
  const u = result.user;
  await audit(db, c.g.actor, active ? "user.reactivate" : "user.deactivate", { storeId: c.store.id, entity: "User", entityId: u.id, data: { email: u.email, role: "OWNER" } });
  revalidatePath(`/hq/stores/${c.store.code}`);
  flashTo(`/hq/stores/${c.store.code}`, active ? `${u.name} can sign in again.` : `${u.name} has been signed out everywhere and can no longer sign in.`);
}
