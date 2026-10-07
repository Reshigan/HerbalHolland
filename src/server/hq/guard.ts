// HQ console access control. Pages call requireStaff(HQ_ROLES) + scopeOf + scopedStoreIds;
// server actions call guard(level) and re-check store scope before touching a row.
//   view:    HQ admin, HQ team, area managers (area managers see their region only)
//   network: network-wide merchandising, marketing and operations (HQ admin + HQ team)
//   admin:   commercial terms, compliance, programme settings, POPIA tools, users (HQ admin)
import { redirect } from "next/navigation";
import { getStaff, HQ_ROLES, type Staff } from "@/server/auth";
import { scopeOf, scopedStoreIds, storeWhere, type Scope } from "@/server/scope";
import { db } from "@/server/db";
import type { Actor } from "@/server/audit";
import type { Role } from "@/generated/prisma/client";

export type Level = "view" | "network" | "admin";

const LEVEL_ROLES: Record<Level, Role[]> = {
  view: HQ_ROLES,
  network: ["HQ_ADMIN", "HQ_STAFF"],
  admin: ["HQ_ADMIN"],
};

export const can = (u: { role: Role }, level: Level) => LEVEL_ROLES[level].includes(u.role);

export const actorOf = (u: Pick<Staff, "id" | "name">): Actor => ({ type: "USER", id: u.id, name: u.name });

export type ActionState = { ok?: string; error?: string; fields?: Record<string, string>; at?: number };

export const DENIED: ActionState = { error: "You don't have permission to do that." };
export const fail = (error: string, fields?: Record<string, string>): ActionState => ({ error, fields, at: Date.now() });
export const done = (ok: string): ActionState => ({ ok, at: Date.now() });

/** Re-checks the signed-in user inside a server action. Returns null when not allowed. */
export async function guard(level: Level) {
  const user = await getStaff();
  if (!user || !can(user, level)) return null;
  const scope = scopeOf(user);
  return { user, scope, actor: actorOf(user) };
}

/** True when the store is inside the user's scope (HQ: any store, area manager: their region). */
export async function inScope(scope: Scope, storeId: string) {
  return (await db.store.count({ where: { AND: [{ id: storeId }, storeWhere(scope)] } })) > 0;
}

/** Redirects back to a page with a one-time confirmation (shown by <Flash>). */
export function flashTo(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}m=${encodeURIComponent(message)}`);
}

export { scopedStoreIds, scopeOf };
