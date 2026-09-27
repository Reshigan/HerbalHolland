"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { hashSecret, type Staff } from "@/server/auth";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { bool, isPin, str, weakPin } from "@/server/store/rules";
import type { User } from "@/generated/prisma/client";

const isOwnerLevel = (u: Pick<Staff, "role">) => u.role === "OWNER" || u.role === "HQ_ADMIN";

/** Owners and HQ admins manage everyone at the store; managers manage budtenders and their own PIN. */
function mayManage(actor: Staff, target: Pick<User, "id" | "role">) {
  if (isOwnerLevel(actor)) return true;
  return actor.role === "MANAGER" && (target.role === "BUDTENDER" || target.id === actor.id);
}

async function target(storeId: string, id: string) {
  const u = await db.user.findFirst({ where: { id, storeId, role: { in: ["MANAGER", "BUDTENDER"] } } });
  if (!u) throw new UserError("That person isn't on this store's team");
  return u;
}

export async function addStaff(code: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const name = str(fd, "name").slice(0, 80);
    if (name.length < 2) return fail("Enter their full name", "name");
    const role = str(fd, "role") === "MANAGER" ? "MANAGER" : "BUDTENDER";
    if (role === "MANAGER" && !isOwnerLevel(user)) return fail("Only the owner can add another manager", "role");
    const pin = str(fd, "pin");
    if (!isPin(pin)) return fail("The PIN must be exactly 4 digits", "pin");
    if (weakPin(pin)) return fail("Choose a PIN that's harder to guess — no repeated or running digits", "pin");
    const email = str(fd, "email").toLowerCase().slice(0, 120);
    const password = String(fd.get("password") ?? "");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn't look right", "email");
    if (email && password.length < 8) return fail("Back-office passwords need at least 8 characters", "password");
    if (email && (await db.user.findUnique({ where: { email } }))) return fail("That email already has a login", "email");
    const canDispense = bool(fd, "canDispense") && isOwnerLevel(user);
    const u = await db.user.create({
      data: {
        name,
        role,
        storeId: store.id,
        companyId: store.companyId,
        pinHash: hashSecret(pin),
        email: email || null,
        passwordHash: email ? hashSecret(password) : null,
        canDispense,
      },
    });
    await audit(db, actor, "staff.create", { storeId: store.id, entity: "User", entityId: u.id, data: { name, role, canDispense, backOffice: !!email } });
    revalidatePath(`/store/${store.code}/team`);
    return done(`${name} added. They can sign in at the till with their PIN${email ? ` and to the back office as ${email}` : ""}.`);
  });
}

export async function resetPin(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const t = await target(store.id, id);
    if (!mayManage(user, t)) return fail("Only the owner can change a manager's PIN");
    const pin = str(fd, "pin");
    if (!isPin(pin)) return fail("The PIN must be exactly 4 digits", "pin");
    if (weakPin(pin)) return fail("Choose a PIN that's harder to guess — no repeated or running digits", "pin");
    await db.user.update({ where: { id: t.id }, data: { pinHash: hashSecret(pin) } });
    await audit(db, actor, "staff.pin_reset", { storeId: store.id, entity: "User", entityId: t.id, data: { name: t.name } });
    return done(`New PIN set for ${t.name}. Share it in person, never by message.`);
  });
}

export async function setDispenser(code: string, id: string, on: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    if (!isOwnerLevel(user)) return fail("Only the owner can authorise dispensers");
    const t = await target(store.id, id);
    await db.user.update({ where: { id: t.id }, data: { canDispense: on } });
    await audit(db, actor, "staff.dispenser", { storeId: store.id, entity: "User", entityId: t.id, data: { name: t.name, canDispense: on } });
    revalidatePath(`/store/${store.code}/team`);
    return done(on ? `${t.name} can now dispense licensed medicines.` : `${t.name} can no longer dispense licensed medicines.`);
  });
}

export async function setActive(code: string, id: string, active: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const t = await target(store.id, id);
    if (t.id === user.id) return fail("You can't deactivate yourself");
    if (!mayManage(user, t)) return fail("Only the owner can deactivate a manager");
    await db.user.update({ where: { id: t.id }, data: { active } });
    if (!active) await db.session.deleteMany({ where: { userId: t.id } });
    await audit(db, actor, active ? "staff.reactivate" : "staff.deactivate", { storeId: store.id, entity: "User", entityId: t.id, data: { name: t.name } });
    revalidatePath(`/store/${store.code}/team`);
    return done(active ? `${t.name} is active again and can sign in with their PIN.` : `${t.name} is deactivated and signed out everywhere.`);
  });
}
