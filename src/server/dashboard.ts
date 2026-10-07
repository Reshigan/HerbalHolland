// Shared dashboard queries (store and network). Rollup-backed so they scale to 1,000 stores.
import { db } from "./db";
import { salesByDay, salesSummary, salesByChannel } from "./finance";
import { previousRange, delta } from "@/lib/ranges";
import { dayKey, fmtDay, addDays, dateOnly, rangeFromParams, type DateRange } from "@/lib/format";
import { cashToBank, isOverdue } from "@/lib/banking";
import { OPEN_ORDER_STATUSES } from "./inventory";
import { sast } from "./sql";
import { waitingCash } from "./banking";
import { visibleAlerts } from "./loss";
import { getSettings } from "./settings";
import type { Staff } from "./auth";

export async function kpis(storeIds: string[], r: DateRange) {
  const prev = previousRange(r);
  const [cur, before, days, channels] = await Promise.all([salesSummary(storeIds, r), salesSummary(storeIds, prev), salesByDay(storeIds, r), salesByChannel(storeIds, r)]);
  // Every tender, so the shares add up to takings incl. VAT. On account is invoiced to a trade account on HQ's ledger —
  // not money at the till — and what HQ collected (online, vouchers, trade collect orders) is settled on the statement.
  const payments = [
    { label: "Card (tap)", value: cur.cardCents },
    { label: "Cash", value: cur.cashCents },
    { label: "PayShap", value: cur.payshapCents },
    { label: "Collected by HQ", value: cur.onlineCents },
    { label: "Points", value: cur.loyaltyCents },
    { label: "EFT", value: cur.eftCents },
    { label: "On account (invoiced)", value: cur.accountCents },
  ];
  return {
    cur,
    before,
    deltas: {
      net: delta(cur.netCents, before.netCents),
      tx: delta(cur.sales, before.sales),
      atv: delta(cur.atvCents, before.atvCents),
      margin: before.marginPct ? cur.marginPct - before.marginPct : null,
      members: before.memberRate ? cur.memberRate - before.memberRate : null,
    },
    // Today is still trading: leave the partial day off multi-day trend lines.
    trend: (() => {
      const complete = r.days > 1 && r.to === dayKey(new Date()) ? days.slice(0, -1) : days;
      return { labels: complete.map((d) => fmtDay(`${d.date}T12:00:00Z`)), net: complete.map((d) => d.netCents) };
    })(),
    online: channels.find((c) => c.channel === "ONLINE")?.netCents ?? 0,
    /** Net sales to business accounts (the WHOLESALE channel) in the range — "of which trade" on the sales tiles. */
    trade: channels.find((c) => c.channel === "WHOLESALE")?.netCents ?? 0,
    payments,
  };
}

export async function topProducts(storeIds: string[], r: DateRange, take = 8) {
  const rows = await db.dailyVariantStat.groupBy({
    by: ["variantId"],
    where: { storeId: { in: storeIds }, date: { gte: r.fromDate, lte: r.toDate } },
    _sum: { units: true, netCents: true, costCents: true },
    orderBy: { _sum: { netCents: "desc" } },
    take,
  });
  const variants = await db.variant.findMany({ where: { id: { in: rows.map((x) => x.variantId) } }, include: { product: { select: { name: true, slug: true } } } });
  const v = new Map(variants.map((x) => [x.id, x]));
  return rows.map((x) => ({
    variantId: x.variantId,
    name: `${v.get(x.variantId)?.product.name} · ${v.get(x.variantId)?.name}`,
    units: x._sum.units ?? 0,
    netCents: x._sum.netCents ?? 0,
    marginPct: x._sum.netCents ? ((x._sum.netCents ?? 0) - (x._sum.costCents ?? 0)) / (x._sum.netCents ?? 1) : 0,
  }));
}

/** Stock health for one or many stores: below reorder point, expiring, negative, recalled on hand. */
export async function stockAlerts(storeIds: string[]) {
  const soon = addDays(new Date(), 30);
  const [low, expiring, negative, blocked] = await Promise.all([
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM "StoreVariant" sv
      LEFT JOIN (SELECT sl."storeId", sl."variantId", SUM(sl."onHand") AS q FROM "StockLevel" sl JOIN "Batch" b ON b.id = sl."batchId"
                 WHERE b.status = 'RELEASED' AND sl."storeId" = ANY(${storeIds}::text[]) GROUP BY 1, 2) s
        ON s."storeId" = sv."storeId" AND s."variantId" = sv."variantId"
      WHERE sv."storeId" = ANY(${storeIds}::text[]) AND COALESCE(s.q, 0) <= sv."reorderPoint"`,
    db.stockLevel.aggregate({ where: { storeId: { in: storeIds }, onHand: { gt: 0 }, batch: { status: "RELEASED", expiresAt: { lte: soon, gt: new Date() } } }, _sum: { onHand: true }, _count: true }),
    db.stockLevel.count({ where: { storeId: { in: storeIds }, onHand: { lt: 0 } } }),
    db.stockLevel.aggregate({ where: { storeId: { in: storeIds }, onHand: { gt: 0 }, batch: { status: { in: ["RECALLED", "QUARANTINE"] } } }, _sum: { onHand: true } }),
  ]);
  return { low: low[0]?.n ?? 0, expiringUnits: expiring._sum.onHand ?? 0, expiringLots: expiring._count, negative, blockedUnits: blocked._sum.onHand ?? 0 };
}

export async function orderQueue(storeIds: string[]) {
  const rows = await db.order.groupBy({ by: ["status"], where: { storeId: { in: storeIds }, status: { in: [...OPEN_ORDER_STATUSES, "OUT_FOR_DELIVERY"] } }, _count: true });
  return Object.fromEntries(rows.map((r) => [r.status, r._count])) as Record<string, number>;
}

/** Transactions by weekday × hour (SAST) for the heatmap. Raw sales, bounded by range. */
export async function hourlyHeat(storeIds: string[], r: DateRange) {
  const rows = await db.$queryRaw<{ dow: number; hour: number; n: number }[]>`
    SELECT EXTRACT(DOW FROM ${sast('"createdAt"')})::int AS dow,
           EXTRACT(HOUR FROM ${sast('"createdAt"')})::int AS hour, COUNT(*)::int AS n
    FROM "Sale" WHERE kind = 'SALE' AND "storeId" = ANY(${storeIds}::text[]) AND "createdAt" >= ${r.start} AND "createdAt" < ${r.end}
    GROUP BY 1, 2`;
  return rows.map((x) => ({ day: x.dow, hour: x.hour, value: x.n }));
}

export async function pendingAnnouncements(storeId: string, format: string, regionCode: string) {
  const list = await db.announcement.findMany({
    where: { requiresAck: true, audience: { in: ["ALL", `format:${format}`, `region:${regionCode}`] }, acks: { none: { storeId } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return list;
}

// ── Role dashboards ──────────────────────────────────────────────────────────
// The numbers each role leads with. Everything here reads the rollups or indexed counts, bounded to the caller's
// stores, so the owner, manager, HQ and area-manager overviews stay cheap across the network.

const dayRange = (day: string, now: Date) => rangeFromParams({ from: day, to: day }, 1, now);

/** Takings so far today against the same weekday last week (the whole of that day). Today's rollup row is live. */
export async function todayTakings(storeIds: string[], now = new Date()) {
  const today = dayRange(dayKey(now), now);
  const [cur, prev, trade] = await Promise.all([salesSummary(storeIds, today), salesSummary(storeIds, dayRange(dayKey(addDays(now, -7)), now)), salesSummary(storeIds, today, "WHOLESALE")]);
  return { cur, prev, delta: delta(cur.grossCents, prev.grossCents), tradeCents: trade.grossCents };
}

/**
 * The trade channel's open work for the HQ overview: orders to fulfil (placed, picking, ready to collect), EFT pro
 * formas waiting for HQ to confirm payment, and accounts on hold. Indexed counts; a region sees the orders its stores
 * fulfil and the accounts that order from them.
 */
export async function tradeQueue(storeIds: string[], networkWide: boolean) {
  const at = networkWide ? {} : { storeId: { in: storeIds } };
  const [orders, onHold] = await Promise.all([
    db.tradeOrder.groupBy({ by: ["status"], where: { ...at, status: { in: ["PENDING_PAYMENT", "PLACED", "PICKING", "READY"] } }, _count: true }),
    db.tradeAccount.count({ where: { status: "ON_HOLD", ...(networkWide ? {} : { OR: [{ orders: { some: at } }, { dcId: { in: storeIds } }] }) } }),
  ]);
  const n = (status: string) => orders.find((o) => o.status === status)?._count ?? 0;
  return { open: n("PLACED") + n("PICKING") + n("READY"), ready: n("READY"), pendingEft: n("PENDING_PAYMENT"), onHold };
}

/** Net sales month to date against the same days of last month. */
export async function monthToDate(storeIds: string[], now = new Date()) {
  const today = dayKey(now);
  const r = rangeFromParams({ from: `${today.slice(0, 7)}-01`, to: today }, 30, now);
  const [cur, prev] = await Promise.all([salesSummary(storeIds, r), salesSummary(storeIds, previousRange(r))]);
  return { range: r, cur, prev, delta: delta(cur.netCents, prev.netCents) };
}

/** Cash from closed cash-ups not yet banked, across a few stores (an owner's company), with what's overdue. */
export async function cashWaiting(storeIds: string[], now = new Date()) {
  const lists = await Promise.all(storeIds.slice(0, 50).map((id) => waitingCash(id, now)));
  const all = lists.flat();
  const overdue = all.filter((s) => s.overdue);
  return {
    cents: all.reduce((t, s) => t + s.cashCents, 0),
    count: all.length,
    overdueCents: overdue.reduce((t, s) => t + s.cashCents, 0),
    overdueCount: overdue.length,
    dueOn: all.length ? all.map((s) => s.dueOn).sort()[0] : null,
  };
}

/** Open loss-prevention alerts the person may see (never about themselves). */
export async function openAlerts(user: Pick<Staff, "id">, storeIds: string[]) {
  const rows = await db.alert.groupBy({ by: ["severity"], where: { AND: [visibleAlerts(user, storeIds), { status: { in: ["OPEN", "INVESTIGATING"] } }] }, _count: true });
  return { open: rows.reduce((t, r) => t + r._count, 0), high: rows.find((r) => r.severity === "HIGH")?._count ?? 0 };
}

/** Who is signed in on a till right now (open shifts at the store). */
export async function onShift(storeId: string) {
  const shifts = await db.shift.findMany({ where: { storeId, closedAt: null }, orderBy: { openedAt: "asc" }, select: { id: true, openedById: true, openedAt: true, deviceId: true }, take: 20 });
  if (!shifts.length) return [];
  const [users, devices] = await Promise.all([
    db.user.findMany({ where: { id: { in: shifts.map((s) => s.openedById) } }, select: { id: true, name: true } }),
    db.device.findMany({ where: { id: { in: shifts.flatMap((s) => (s.deviceId ? [s.deviceId] : [])) } }, select: { id: true, name: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const till = new Map(devices.map((d) => [d.id, d.name]));
  return shifts.map((s) => ({ id: s.id, name: name.get(s.openedById) ?? "Unknown", since: s.openedAt, till: s.deviceId ? till.get(s.deviceId) ?? null : null }));
}

/** Stores that have rung up a sale today (from the live rollup). */
export async function tradingToday(storeIds: string[], now = new Date()) {
  const rows = await db.dailyStoreStat.groupBy({ by: ["storeId"], where: { storeId: { in: storeIds }, date: dateOnly(now) }, _sum: { sales: true } });
  return new Set(rows.filter((r) => (r._sum.sales ?? 0) > 0).map((r) => r.storeId));
}

/** Franchise enquiries nobody has picked up yet (HQ admin and team only). */
export const newLeads = () => db.franchiseLead.count({ where: { status: "NEW" } });

/**
 * Last month's franchise statements still to email: trading stores less the ones with a `statement.email`
 * (or one `statement.email_all`) audit entry for that month. Nothing is stored per statement, so the audit log is the record.
 */
export async function statementsDue(storeIds: string[], now = new Date()) {
  const today = dayKey(now);
  const first = new Date(`${today.slice(0, 7)}-01T12:00:00+02:00`);
  const month = dayKey(addDays(first, -1)).slice(0, 7);
  const [stores, sent] = await Promise.all([
    db.store.findMany({ where: { id: { in: storeIds }, kind: "RETAIL", status: "ACTIVE" }, select: { id: true } }),
    db.auditLog.findMany({ where: { action: { in: ["statement.email", "statement.email_all"] }, at: { gte: addDays(first, -1) } }, select: { action: true, storeId: true, data: true } }),
  ]);
  const forMonth = sent.filter((a) => (a.data as { month?: string } | null)?.month === month);
  if (forMonth.some((a) => a.action === "statement.email_all")) return { month, due: 0, of: stores.length };
  const done = new Set(forMonth.map((a) => a.storeId));
  return { month, due: stores.filter((s) => !done.has(s.id)).length, of: stores.length };
}

export type StoreException = { storeId: string; overdueCash: number; highAlerts: number; alerts: number; negativeLots: number; lowStock: number; quiet: boolean; score: number };

/**
 * Exceptions per store for an area manager's region (or an owner's company): overdue cash-ups, open alerts, negative
 * stock, SKUs at or below reorder point, and stores that haven't sold today. Grouped queries, one per signal.
 */
export async function storeExceptions(user: Pick<Staff, "id">, stores: { id: string; status: string }[], now = new Date()): Promise<StoreException[]> {
  const ids = stores.map((s) => s.id);
  if (!ids.length) return [];
  const [alerts, negative, low, trading, cash] = await Promise.all([
    db.alert.groupBy({ by: ["storeId", "severity"], where: { AND: [visibleAlerts(user, ids), { status: { in: ["OPEN", "INVESTIGATING"] } }] }, _count: true }),
    db.stockLevel.groupBy({ by: ["storeId"], where: { storeId: { in: ids }, onHand: { lt: 0 } }, _count: true }),
    db.$queryRaw<{ storeId: string; n: number }[]>`
      SELECT sv."storeId", COUNT(*)::int AS n FROM "StoreVariant" sv
      LEFT JOIN (SELECT sl."storeId", sl."variantId", SUM(sl."onHand") AS q FROM "StockLevel" sl JOIN "Batch" b ON b.id = sl."batchId"
                 WHERE b.status = 'RELEASED' AND sl."storeId" = ANY(${ids}::text[]) GROUP BY 1, 2) s
        ON s."storeId" = sv."storeId" AND s."variantId" = sv."variantId"
      WHERE sv."storeId" = ANY(${ids}::text[]) AND COALESCE(s.q, 0) <= sv."reorderPoint"
      GROUP BY 1`,
    tradingToday(ids, now),
    db.shift.findMany({ where: { storeId: { in: ids }, depositId: null, closedAt: { not: null }, countedCashCents: { not: null } }, select: { storeId: true, closedAt: true, countedCashCents: true, openingFloatCents: true }, take: 2000 }),
  ]);
  const { banking } = await getSettings();
  // Only after the day's opening hours count as quiet: a store with no sale by 11:00 SAST is worth a look.
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", hour12: false }).format(now));
  const active = new Set(stores.filter((s) => s.status === "ACTIVE").map((s) => s.id));
  return ids
    .map((id) => {
      const a = alerts.filter((x) => x.storeId === id);
      const overdueCash = cash.filter((s) => s.storeId === id && cashToBank(s) > 0 && isOverdue(s.closedAt!, banking.dueBusinessDays, now)).length;
      const highAlerts = a.find((x) => x.severity === "HIGH")?._count ?? 0;
      const row: StoreException = {
        storeId: id,
        overdueCash,
        highAlerts,
        alerts: a.reduce((t, x) => t + x._count, 0),
        negativeLots: negative.find((x) => x.storeId === id)?._count ?? 0,
        lowStock: low.find((x) => x.storeId === id)?.n ?? 0,
        quiet: active.has(id) && hour >= 11 && !trading.has(id),
        score: 0,
      };
      row.score = row.overdueCash * 5 + row.highAlerts * 4 + (row.alerts - row.highAlerts) * 2 + row.negativeLots * 2 + (row.quiet ? 3 : 0) + (row.lowStock > 0 ? 1 : 0);
      return row;
    })
    .sort((x, y) => y.score - x.score);
}
