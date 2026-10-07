// Row-level access scoping. Every back-office and report query goes through here:
// HQ sees the network, area managers their region, owners their company's stores,
// managers and budtenders their own store.
import { notFound } from "next/navigation";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import type { Staff } from "./auth";

export type Scope =
  | { kind: "HQ" }
  | { kind: "REGION"; regionId: string }
  | { kind: "COMPANY"; companyId: string }
  | { kind: "STORE"; storeId: string }
  | { kind: "NONE" }; // no stores at all (an accountant: the books only)

export function scopeOf(u: Pick<Staff, "role" | "regionId" | "companyId" | "storeId">): Scope {
  switch (u.role) {
    case "HQ_ADMIN":
    case "HQ_STAFF":
      return { kind: "HQ" };
    // Without its region or company a role sees nothing (an undefined id would filter nothing out).
    case "AREA_MANAGER":
      return u.regionId ? { kind: "REGION", regionId: u.regionId } : { kind: "NONE" };
    case "OWNER":
      return u.companyId ? { kind: "COMPANY", companyId: u.companyId } : { kind: "NONE" };
    case "ACCOUNTANT":
      return { kind: "NONE" };
    default:
      return u.storeId ? { kind: "STORE", storeId: u.storeId } : { kind: "NONE" };
  }
}

export function storeWhere(scope: Scope): Prisma.StoreWhereInput {
  switch (scope.kind) {
    case "HQ":
      return {};
    case "REGION":
      return { regionId: scope.regionId };
    case "COMPANY":
      return { companyId: scope.companyId };
    case "STORE":
      return { id: scope.storeId };
    case "NONE":
      return { id: { in: [] } };
  }
}

export async function scopedStoreIds(scope: Scope, extra: Prisma.StoreWhereInput = {}) {
  const rows = await db.store.findMany({ where: { AND: [storeWhere(scope), extra] }, select: { id: true } });
  return rows.map((r) => r.id);
}

export function accessibleStores(u: Staff) {
  return db.store.findMany({
    where: { AND: [storeWhere(scopeOf(u)), { kind: "RETAIL" }] },
    select: { id: true, code: true, name: true, city: true, status: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Loads a store by code and asserts the user may see it. A store outside their scope is a not-found, like a code that
 * doesn't exist (so codes can't be probed): back-office pages show it inside the shell (store/[code]/not-found.tsx).
 */
export async function storeForUser(u: Staff, code: string) {
  const store = await db.store.findFirst({
    where: { AND: [{ code }, storeWhere(scopeOf(u))] },
    include: { company: true, region: true, dc: true },
  });
  if (!store) notFound();
  return store;
}

/**
 * The store whose shell /store/[code] shows: that store when the user may see it, else their own (the first they look
 * after), so a store outside their scope — or no such store — opens not-found.tsx inside their own back office while
 * the page's storeForUser answers 404. Authorises nothing: every page loads its store through storeForUser.
 */
export async function shellStoreFor(u: Staff, code: string) {
  const mine = storeWhere(scopeOf(u));
  const select = { code: true, name: true, slug: true, companyId: true } as const;
  return (
    (await db.store.findFirst({ where: { AND: [{ code }, mine] }, select })) ??
    (await db.store.findFirst({ where: { AND: [mine, { kind: "RETAIL" }] }, orderBy: { code: "asc" }, select }))
  );
}

export const canManageStore = (u: Staff) => ["HQ_ADMIN", "OWNER", "MANAGER"].includes(u.role);
