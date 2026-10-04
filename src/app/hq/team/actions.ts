"use server";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { hashSecret } from "@/server/auth";
import { guard, DENIED, fail, done, flashTo, type ActionState } from "@/server/hq/guard";
import { str } from "@/server/hq/form";
import type { Role } from "@/generated/prisma/client";

const ROLES: Role[] = ["HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER"];
const WORDS = ["tulip", "windmill", "harbour", "canal", "clog", "polder", "dune", "delta", "orchard", "meadow", "sunset", "harvest"];

/** Readable one-time password, e.g. "canal-Tulip-4821". */
function tempPassword() {
  const w = () => WORDS[randomInt(WORDS.length)];
  const second = w();
  return `${w()}-${second.charAt(0).toUpperCase()}${second.slice(1)}-${randomInt(1000, 10000)}`;
}

export async function addUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const role = str(fd, "role") as Role;
  const regionId = str(fd, "regionId") || null;
  if (name.length < 2) fields.name = "Full name";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Work email";
  else if (await db.user.count({ where: { email } })) fields.email = "Someone already signs in with this email";
  if (!ROLES.includes(role)) fields.role = "Choose a role";
  if (role === "AREA_MANAGER" && (!regionId || !(await db.region.count({ where: { id: regionId } })))) fields.regionId = "Area managers need a region";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const hq = await db.company.findFirst({ where: { kind: "FRANCHISOR" }, select: { id: true } });
  const password = tempPassword();
  const u = await db.user.create({
    data: { name, email, role, regionId: role === "AREA_MANAGER" ? regionId : null, companyId: role === "AREA_MANAGER" ? null : hq?.id ?? null, passwordHash: hashSecret(password), mustChangePassword: true },
  });
  await audit(db, g.actor, "user.create", { entity: "User", entityId: u.id, data: { email, role, regionId } });
  revalidatePath("/hq/team");
  return done(`${name} can now sign in as ${email} with the temporary password  ${password}  — share it privately (it isn't shown again). They'll choose their own password when they first sign in.`);
}

export async function setUserActive(userId: string, active: boolean, _: ActionState): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  if (userId === g.user.id) return fail("You can't deactivate your own account.");
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || !ROLES.includes(u.role)) return fail("User not found.");
  if (!active && u.role === "HQ_ADMIN" && (await db.user.count({ where: { role: "HQ_ADMIN", active: true } })) <= 1) return fail("Keep at least one active HQ administrator.");
  await db.user.update({ where: { id: userId }, data: { active } });
  if (!active) await db.session.deleteMany({ where: { userId } });
  await audit(db, g.actor, active ? "user.reactivate" : "user.deactivate", { entity: "User", entityId: userId, data: { email: u.email } });
  revalidatePath("/hq/team");
  flashTo("/hq/team", active ? `${u.name} can sign in again.` : `${u.name} has been signed out everywhere and can no longer sign in.`);
}

export async function resetPassword(userId: string, _: ActionState): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || !ROLES.includes(u.role)) return fail("User not found.");
  const password = tempPassword();
  await db.user.update({ where: { id: userId }, data: { passwordHash: hashSecret(password), mustChangePassword: true, passwordFails: 0, passwordLockedAt: null } });
  await db.session.deleteMany({ where: { userId } });
  await audit(db, g.actor, "user.password_reset", { entity: "User", entityId: userId, data: { email: u.email } });
  revalidatePath("/hq/team");
  return done(`New temporary password for ${u.name}:  ${password}  — share it privately. They'll choose their own password when they sign in.`);
}
