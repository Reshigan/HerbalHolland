"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { hashSecret, type Staff } from "@/server/auth";
import { resetPinFailures } from "@/server/lockout";
import { temporaryPassword, tempPasswordUntil, TEMP_PASSWORD_HOURS } from "@/server/passwords";
import { passwordProblem } from "@/lib/password";
import { attempt, done, fail, manage, UserError, type ActionState } from "@/server/store/context";
import { bool, isPin, str, weakPin } from "@/server/store/rules";
import { memberNoFrom } from "@/components/pos/lib/rules";
import type { User } from "@/generated/prisma/client";
import { isEmail } from "@/lib/email";

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
    if (email && !isEmail(email)) return fail("That email address doesn't look right", "email");
    const weak = email ? passwordProblem(password, { email, name }) : null;
    if (weak) return fail(weak, "password");
    if (email && (await db.user.findUnique({ where: { email } }))) return fail("That email already has a login", "email");
    const canDispense = bool(fd, "canDispense") && isOwnerLevel(user);
    // A password someone else chose is temporary: they replace it at first sign-in, before it lapses.
    const u = await db.user.create({
      data: {
        name,
        role,
        storeId: store.id,
        companyId: store.companyId,
        pinHash: await hashSecret(pin),
        email: email || null,
        passwordHash: email ? await hashSecret(password) : null,
        mustChangePassword: !!email,
        tempPasswordUntil: email ? tempPasswordUntil() : null,
        canDispense,
      },
    });
    await audit(db, actor, "staff.create", { storeId: store.id, entity: "User", entityId: u.id, data: { name, role, canDispense, backOffice: !!email } });
    revalidatePath(`/store/${store.code}/team`);
    return done(
      `${name} added. They can sign in at the till with their PIN${email ? ` and to the back office as ${email} with the password you set — they choose their own the first time, within ${TEMP_PASSWORD_HOURS} hours` : ""}.`,
    );
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
    await db.user.update({ where: { id: t.id }, data: { pinHash: await hashSecret(pin), pinFails: 0, pinLockedAt: null } });
    await resetPinFailures(t.id); // a PIN switched off after ten wrong tries works again with the new one
    await db.session.deleteMany({ where: { userId: t.id, deviceId: { not: null } } }); // signed out of every till
    await audit(db, actor, "staff.pin_reset", { storeId: store.id, entity: "User", entityId: t.id, data: { name: t.name } });
    return done(`New PIN set for ${t.name}. Share it in person, never by message.`);
  });
}

/** A new temporary back-office password, shown once (for someone who forgot theirs, or whose temporary one lapsed). */
export async function resetPassword(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const t = await target(store.id, id);
    if (!t.email) return fail(`${t.name} has no back-office login`);
    if (t.id === user.id) return fail("To change your own password, use Change password beside your name");
    if (!mayManage(user, t)) return fail("Only the owner can reset a manager's password");
    const password = temporaryPassword();
    await db.user.update({
      where: { id: t.id },
      data: { passwordHash: await hashSecret(password), mustChangePassword: true, tempPasswordUntil: tempPasswordUntil(), passwordFails: 0, passwordLockedAt: null },
    });
    await db.session.deleteMany({ where: { userId: t.id, deviceId: null } }); // signed out of the back office (tills keep their PIN sign-in)
    await audit(db, actor, "staff.password_reset", { storeId: store.id, entity: "User", entityId: t.id, data: { name: t.name } });
    return done(`New temporary password for ${t.name}:  ${password}  — share it privately (it isn't shown again). They choose their own when they sign in, within ${TEMP_PASSWORD_HOURS} hours.`);
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

/**
 * Links (or, when left empty, unlinks) a staff member's own Rewards membership. Sales they ring onto it are flagged
 * for loss prevention and earn no commission — so a manager can link their own card but only the owner can change or clear it.
 */
export async function setMemberCard(code: string, id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return attempt(async () => {
    const { store, user, actor } = await manage(code);
    const t = await target(store.id, id);
    if (!mayManage(user, t)) return fail("Only the owner can change a manager's member card");
    if (t.id === user.id && t.memberId && !isOwnerLevel(user)) return fail("Ask the owner to change or unlink your own member card");
    const before = t.memberId ? ((await db.customer.findUnique({ where: { id: t.memberId }, select: { memberNo: true } }))?.memberNo ?? null) : null;
    const raw = str(fd, "memberNo").replace(/\s+/g, "");
    if (!raw) {
      if (!t.memberId) return done(`${t.name} has no member card linked.`);
      await db.user.update({ where: { id: t.id }, data: { memberId: null } });
      await audit(db, actor, "staff.member_link", { storeId: store.id, entity: "User", entityId: t.id, data: { name: t.name, memberNo: null, before } });
      revalidatePath(`/store/${store.code}/team`);
      revalidatePath(`/store/${store.code}/commission`);
      return done(`${t.name}'s member card is unlinked.`);
    }
    const memberNo = memberNoFrom(raw) ?? (/^\d{1,7}$/.test(raw) ? `HH${raw.padStart(7, "0")}` : null);
    if (!memberNo) return fail("Enter their Rewards member number, like HH0123456", "memberNo");
    const member = await db.customer.findUnique({ where: { memberNo }, select: { id: true, firstName: true, lastName: true } });
    if (!member) return fail(`No Rewards member has the number ${memberNo}`, "memberNo");
    if (member.id === t.memberId) return done(`${memberNo} is already linked to ${t.name}.`);
    const taken = await db.user.findUnique({ where: { memberId: member.id }, select: { name: true, storeId: true } });
    if (taken) return fail(`${memberNo} is already linked to ${taken.storeId === store.id ? taken.name : "a staff member at another store"}`, "memberNo");
    await db.user.update({ where: { id: t.id }, data: { memberId: member.id } });
    await audit(db, actor, "staff.member_link", { storeId: store.id, entity: "User", entityId: t.id, data: { name: t.name, memberNo, before } });
    revalidatePath(`/store/${store.code}/team`);
    revalidatePath(`/store/${store.code}/commission`);
    const linked = `Linked ${memberNo} (${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}) to ${t.name}. Sales they ring onto it are flagged and don't earn commission.`;
    // A manager's own card locks once linked, so their button goes away: confirm with a one-time ?m= flash instead.
    if (t.id === user.id && !isOwnerLevel(user)) redirect(`/store/${store.code}/team?m=${encodeURIComponent(linked)}`);
    return done(linked);
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
