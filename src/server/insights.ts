// Owner analytics: who may see them, over which stores, and the few queries the shared reports don't already answer.
import { notFound, redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { db, Prisma } from "./db";
import { getCustomer, getStaffChangingPassword, requireStaff } from "./auth";
import { accessibleStores, scopeOf, scopedStoreIds } from "./scope";
import { sastDay } from "./sql";
import type { MemberScope } from "./hq/crm";
import type { DateRange } from "@/lib/format";

export const INSIGHT_ROLES: Role[] = ["OWNER", "HQ_ADMIN", "HQ_STAFF", "AREA_MANAGER"];

/** The store a `?store=` code names. `null` means the code is outside what this person looks after. */
export function pickStore<T extends { code: string }>(stores: T[], code: string | undefined): T | undefined | null {
  if (!code) return undefined;
  return stores.find((s) => s.code === code) ?? null;
}

/** The staff account a member card is linked to, if it may open Insights (the owner's own card in the app). */
export function cardHolderMayView(u: { active: boolean; mustChangePassword: boolean; role: Role } | null) {
  return !!u && u.active && !u.mustChangePassword && INSIGHT_ROLES.includes(u.role);
}

/**
 * Every Insights page starts here. A staff sign-in works as before. Without one, a member signed in to the app whose
 * card is linked to an active owner or HQ account (Settings, "Use this card for Insights") sees what that account sees.
 */
export async function insightsContext(sp: { store?: string }, path: string) {
  let user;
  if (await getStaffChangingPassword()) user = await requireStaff(INSIGHT_ROLES);
  else {
    const c = await getCustomer();
    const linked = c && (await db.user.findUnique({ where: { memberId: c.id }, include: { company: true, store: true, region: true } }));
    if (!linked || !cardHolderMayView(linked)) redirect(`/login?next=${encodeURIComponent(path)}`);
    user = linked;
  }
  const scope = scopeOf(user);
  const [allIds, stores] = await Promise.all([scopedStoreIds(scope), accessibleStores(user)]);
  const store = pickStore(stores, sp.store);
  if (store === null) notFound();
  const storeIds = store ? [store.id] : allIds;
  const everyMember = scope.kind === "HQ" && !store;
  return { user, stores, store, allIds, storeIds, members: (everyMember ? null : storeIds) as MemberScope, seesAllMembers: scope.kind === "HQ" };
}
export type InsightsContext = Awaited<ReturnType<typeof insightsContext>>;

export const homeWhere = (s: MemberScope): Prisma.CustomerWhereInput => (s ? { homeStoreId: { in: s } } : {});

/** New members per SAST day, every day of the range present. */
export async function newMembersByDay(s: MemberScope, r: DateRange) {
  const home = s ? Prisma.sql`AND "homeStoreId" IN (SELECT value FROM json_each(${JSON.stringify(s)}))` : Prisma.empty;
  const rows = await db.$queryRaw<{ day: string; n: number }[]>`
    SELECT ${sastDay('"createdAt"')} AS day, COUNT(*) AS n FROM "Customer"
    WHERE "createdAt" >= ${r.start} AND "createdAt" < ${r.end} ${home} GROUP BY 1`;
  const by = new Map(rows.map((x) => [x.day, Number(x.n)]));
  return Array.from({ length: r.days }, (_, i) => {
    const date = new Date(r.fromDate.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { date, n: by.get(date) ?? 0 };
  });
}

/** One product over a range: totals, the daily line and the stores that sold it. */
export async function productInsight(variantId: string, storeIds: string[], r: DateRange) {
  const where = { variantId, storeId: { in: storeIds }, date: { gte: r.fromDate, lte: r.toDate } };
  const sums = { units: true, netCents: true, costCents: true } as const;
  const [total, days, stores] = await Promise.all([
    db.dailyVariantStat.aggregate({ where, _sum: sums }),
    db.dailyVariantStat.groupBy({ by: ["date"], where, _sum: sums, orderBy: { date: "asc" } }),
    db.dailyVariantStat.groupBy({ by: ["storeId"], where, _sum: sums, orderBy: { _sum: { netCents: "desc" } } }),
  ]);
  const byDay = new Map(days.map((d) => [d.date.toISOString().slice(0, 10), d._sum.netCents ?? 0]));
  const net = total._sum.netCents ?? 0;
  return {
    units: total._sum.units ?? 0,
    netCents: net,
    marginPct: net ? (net - (total._sum.costCents ?? 0)) / net : 0,
    daily: Array.from({ length: r.days }, (_, i) => {
      const date = new Date(r.fromDate.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      return { date, netCents: byDay.get(date) ?? 0 };
    }),
    stores: stores.map((s) => ({ storeId: s.storeId, units: s._sum.units ?? 0, netCents: s._sum.netCents ?? 0 })),
  };
}
