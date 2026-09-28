// Row-level access scoping. Every back-office and report query goes through here:
// HQ sees the network, area managers their region, owners their company's stores,
// managers and budtenders their own store.
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import type { Staff } from "./auth";

export type Scope =
  | { kind: "HQ" }
  | { kind: "REGION"; regionId: string }
  | { kind: "COMPANY"; companyId: string }
  | { kind: "STORE"; storeId: string };

export function scopeOf(u: Pick<Staff, "role" | "regionId" | "companyId" | "storeId">): Scope {
  switch (u.role) {
    case "HQ_ADMIN":
    case "HQ_STAFF":
      return { kind: "HQ" };
    case "AREA_MANAGER":
      return { kind: "REGION", regionId: u.regionId! };
    case "OWNER":
      return { kind: "COMPANY", companyId: u.companyId! };
    default:
      return { kind: "STORE", storeId: u.storeId! };
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

/** Loads a store by code and asserts the user may see it. */
export async function storeForUser(u: Staff, code: string) {
  const store = await db.store.findFirst({
    where: { AND: [{ code }, storeWhere(scopeOf(u))] },
    include: { company: true, region: true, dc: true },
  });
  if (!store) {
    const exists = await db.store.count({ where: { code } });
    if (exists) redirect("/login?denied=1");
    notFound();
  }
  return store;
}

export const canManageStore = (u: Staff) => ["HQ_ADMIN", "OWNER", "MANAGER"].includes(u.role);
