// The manager's Today list for one store: gathers the facts (open orders, cycle counts due, cash to bank, loss
// alerts the person may see, expiring lots, low stock, lapsing patient authorisations, HQ updates to acknowledge,
// supplier invoices due) and hands them to the pure rules in @/lib/today. Every query is bounded to the store.
import { db } from "./db";
import { getSettings } from "./settings";
import { waitingCash } from "./banking";
import { visibleAlerts } from "./loss";
import { replenishmentPlan } from "./replenishment";
import { buildToday, type TodayFacts, type TodayItem } from "@/lib/today";
import { addDays, dayKey } from "@/lib/format";
import type { Staff } from "./auth";

export type TodayStore = { id: string; code: string; format: string; region: { code: string } };

/** Facts for the Today list. `user` decides which loss alerts count (nobody sees alerts about themselves). */
export async function todayFacts(store: TodayStore, user: Pick<Staff, "id">, now = new Date()): Promise<TodayFacts> {
  const { operations: ops } = await getSettings();
  const today = dayKey(now);
  const audience = { in: ["ALL", `format:${store.format}`, `region:${store.region.code}`] };
  const pendingAck = { audience, requiresAck: true, acks: { none: { storeId: store.id } } };
  const [orders, oldestOpen, oldestReady, counts, lastCounts, counting, cash, alerts, expiring, soonestLot, plan, auths, acks, urgent, latest, overdueInv, dueSoonInv] =
    await Promise.all([
      db.order.groupBy({ by: ["status"], where: { storeId: store.id, status: { in: ["PLACED", "PICKING", "READY"] } }, _count: true }),
      db.order.findFirst({ where: { storeId: store.id, status: { in: ["PLACED", "PICKING"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      db.order.findFirst({ where: { storeId: store.id, status: "READY" }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
      // Categories with ranged stock at the store.
      db.$queryRaw<{ slug: string; name: string }[]>`
        SELECT DISTINCT c.slug, c.name, c."sortOrder" FROM "StoreVariant" sv
        JOIN "Variant" v ON v.id = sv."variantId" JOIN "Product" p ON p.id = v."productId" JOIN "Category" c ON c.id = p."categoryId"
        WHERE sv."storeId" = ${store.id} AND v.active AND p.status = 'ACTIVE' ORDER BY c."sortOrder", c.name`,
      db.stockTake.groupBy({ by: ["scope"], where: { storeId: store.id, status: "APPROVED" }, _max: { approvedAt: true } }),
      db.stockTake.findMany({ where: { storeId: store.id, status: "COUNTING" }, select: { scope: true } }),
      waitingCash(store.id, now),
      db.alert.groupBy({ by: ["severity"], where: { AND: [visibleAlerts(user, [store.id]), { status: { in: ["OPEN", "INVESTIGATING"] } }] }, _count: true }),
      db.stockLevel.aggregate({
        where: { storeId: store.id, onHand: { gt: 0 }, batch: { status: "RELEASED", expiresAt: { gt: now, lte: addDays(now, ops.batchExpiryDays) } } },
        _sum: { onHand: true },
        _count: true,
      }),
      db.stockLevel.findFirst({
        where: { storeId: store.id, onHand: { gt: 0 }, batch: { status: "RELEASED", expiresAt: { gt: now, lte: addDays(now, ops.batchExpiryDays) } } },
        orderBy: { batch: { expiresAt: "asc" } },
        select: { batch: { select: { expiresAt: true } } },
      }),
      replenishmentPlan(store.id),
      db.patientAuth.findMany({
        where: { status: "ACTIVE", validTo: { gte: now, lte: addDays(now, ops.patientAuthDays) }, customer: { homeStoreId: store.id } },
        orderBy: { validTo: "asc" },
        select: { validTo: true },
        take: 500,
      }),
      db.announcement.count({ where: pendingAck }),
      db.announcement.count({ where: { ...pendingAck, kind: "RECALL" } }),
      db.announcement.findFirst({ where: pendingAck, orderBy: { createdAt: "desc" }, select: { title: true } }),
      db.supplierInvoice.aggregate({ where: { storeId: store.id, status: "DUE", dueDate: { lt: new Date(`${today}T00:00:00Z`) } }, _count: true, _sum: { totalCents: true } }),
      db.supplierInvoice.aggregate({
        where: { storeId: store.id, status: "DUE", dueDate: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${dayKey(addDays(now, ops.supplierInvoiceDays))}T00:00:00Z`) } },
        _count: true,
        _sum: { totalCents: true },
      }),
    ]);

  const byStatus = Object.fromEntries(orders.map((o) => [o.status, o._count])) as Record<string, number>;
  const lastBy = new Map(lastCounts.map((c) => [c.scope, c._max.approvedAt]));
  const fullAt = lastBy.get("FULL") ?? null;
  const countingScopes = new Set(counting.map((c) => c.scope));
  const overdueCash = cash.filter((s) => s.overdue);
  const low = plan.filter((r) => r.available <= r.reorderPoint);

  return {
    now,
    orders: { placed: byStatus.PLACED ?? 0, picking: byStatus.PICKING ?? 0, ready: byStatus.READY ?? 0, oldestOpenAt: oldestOpen?.createdAt ?? null, oldestReadyAt: oldestReady?.updatedAt ?? null },
    stockTakes: {
      cadenceDays: ops.cycleCountDays,
      byCategory: ops.cycleCountByCategory,
      categories: counts.map((c) => {
        const own = lastBy.get(c.slug) ?? null;
        // A full count covers every category; the most recent of the two counts.
        const last = [own, fullAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        return { slug: c.slug, name: c.name, lastApprovedAt: last, counting: countingScopes.has(c.slug) || countingScopes.has("FULL") };
      }),
    },
    cash: {
      waitingCents: cash.reduce((t, s) => t + s.cashCents, 0),
      waitingCount: cash.length,
      overdueCents: overdueCash.reduce((t, s) => t + s.cashCents, 0),
      overdueCount: overdueCash.length,
      dueOn: cash.length ? cash.map((s) => s.dueOn).sort()[0] : null,
    },
    alerts: { open: alerts.reduce((t, a) => t + a._count, 0), high: alerts.find((a) => a.severity === "HIGH")?._count ?? 0 },
    batches: { lots: expiring._count, units: expiring._sum.onHand ?? 0, soonest: soonestLot?.batch.expiresAt ?? null, withinDays: ops.batchExpiryDays },
    lowStock: { skus: low.length, out: low.filter((r) => r.available <= 0).length },
    patients: { expiring: auths.length, soonest: auths[0]?.validTo ?? null, withinDays: ops.patientAuthDays },
    announcements: { pending: acks, urgent, latestTitle: latest?.title ?? null },
    supplierInvoices: { overdue: overdueInv._count, overdueCents: overdueInv._sum.totalCents ?? 0, dueSoon: dueSoonInv._count, dueSoonCents: dueSoonInv._sum.totalCents ?? 0 },
  };
}

/** The prioritised list for the store dashboard (links into the store's back office). */
export async function todayList(store: TodayStore, user: Pick<Staff, "id">, now = new Date()): Promise<TodayItem[]> {
  return buildToday(await todayFacts(store, user, now), `/store/${store.code}`);
}
