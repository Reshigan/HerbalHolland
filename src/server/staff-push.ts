// Staff push notifications (Web Push, same VAPID keys as the Rewards app): a manager's or owner's phone hears about
// new online orders, loss alerts about other people, HQ updates that need acknowledging, lots about to expire, cash
// due at the bank and a daily low-stock digest. Sent by the scheduler (/api/cron/staff-push every 5 minutes for the
// immediate events, /api/cron/operations daily for the digests); StaffPushEvent keys make every poll idempotent.
// Without VAPID keys every push is only written to the message log (development and the demo).
import webpush from "web-push";
import { db } from "./db";
import { getSettings } from "./settings";
import { waitingCash } from "./banking";
import { replenishmentPlan } from "./replenishment";
import { addDays, dayKey, fmtDay } from "@/lib/format";
import { zar } from "@/lib/money";
import { FALLBACK_EMAIL } from "@/lib/contact";
import type { Role } from "@/generated/prisma/client";

export const staffVapidKey = () => process.env.WEB_PUSH_PUBLIC_KEY ?? null;
const live = () => !!(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY);
let configured = false;

export type StaffPush = { title: string; body: string; url: string };
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Roles that get store notifications on their phone. */
export const STAFF_PUSH_ROLES: Role[] = ["MANAGER", "OWNER", "AREA_MANAGER", "HQ_ADMIN", "HQ_STAFF"];

// ── Subscriptions ────────────────────────────────────────────────────────────
export function saveStaffSubscription(userId: string, sub: PushSub, userAgent: string | null) {
  const data = { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 200) ?? null };
  return db.staffPushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: data, update: data });
}

export function removeStaffSubscription(userId: string, endpoint: string) {
  return db.staffPushSubscription.deleteMany({ where: { userId, endpoint } });
}

export const staffDeviceCount = (userId: string) => db.staffPushSubscription.count({ where: { userId } });

// ── Sending ──────────────────────────────────────────────────────────────────
/** Pushes to every phone the users subscribed; dead subscriptions (404/410) are pruned. Every push is logged. */
export async function pushToStaff(userIds: string[], p: StaffPush) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return { sent: 0, pruned: 0, users: 0 };
  const [subs, users] = await Promise.all([
    db.staffPushSubscription.findMany({ where: { userId: { in: ids } } }),
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }),
  ]);
  if (!subs.length) return { sent: 0, pruned: 0, users: 0 };
  const email = new Map(users.map((u) => [u.id, u.email]));
  let sent = 0, pruned = 0;
  const delivered = new Set<string>();
  if (live()) {
    if (!configured) {
      webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT ?? `mailto:${FALLBACK_EMAIL}`, process.env.WEB_PUSH_PUBLIC_KEY!, process.env.WEB_PUSH_PRIVATE_KEY!);
      configured = true;
    }
    await Promise.all(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 6 * 3600 }).then(
          () => (sent++, delivered.add(s.id)),
          async (e: { statusCode?: number }) => {
            if (e.statusCode === 404 || e.statusCode === 410) (pruned++, await db.staffPushSubscription.delete({ where: { id: s.id } }).catch(() => null));
          },
        ),
      ),
    );
    if (delivered.size) await db.staffPushSubscription.updateMany({ where: { id: { in: [...delivered] } }, data: { lastUsedAt: new Date() } });
  }
  const reached = new Set(subs.filter((s) => !live() || delivered.has(s.id)).map((s) => s.userId));
  await db.messageLog.createMany({
    data: [...reached].map((userId) => ({
      channel: "PUSH" as const, to: email.get(userId) ?? `user:${userId}`, kind: "TRANSACTIONAL", status: "SENT",
      reason: live() ? null : "logged (WEB_PUSH keys not set)", body: `${p.title}\n\n${p.body}\n${p.url}`,
    })),
  });
  return { sent: live() ? sent : subs.length, pruned, users: reached.size };
}

// ── Who hears about which store ─────────────────────────────────────────────
type Person = { id: string; role: Role; storeId: string | null; companyId: string | null; regionId: string | null };
type StoreRef = { id: string; code: string; name: string; companyId: string; regionId: string };

/** Stores that at least one subscribed manager, owner or area manager covers, with those people. */
export async function subscribedStores() {
  const subs = await db.staffPushSubscription.findMany({ select: { userId: true }, distinct: ["userId"] });
  if (!subs.length) return { stores: [] as StoreRef[], people: [] as Person[] };
  const people = await db.user.findMany({
    where: { id: { in: subs.map((s) => s.userId) }, active: true, role: { in: STAFF_PUSH_ROLES } },
    select: { id: true, role: true, storeId: true, companyId: true, regionId: true },
  });
  const storeIds = people.map((p) => p.storeId).filter((x): x is string => !!x);
  const companyIds = people.filter((p) => p.role === "OWNER").map((p) => p.companyId).filter((x): x is string => !!x);
  const regionIds = people.filter((p) => p.role === "AREA_MANAGER").map((p) => p.regionId).filter((x): x is string => !!x);
  const stores = await db.store.findMany({
    where: { kind: "RETAIL", status: { not: "CLOSED" }, OR: [{ id: { in: storeIds } }, { companyId: { in: companyIds } }, { regionId: { in: regionIds } }] },
    select: { id: true, code: true, name: true, companyId: true, regionId: true },
  });
  return { stores, people };
}

/** The people who get a store's notifications: its managers, its owners and (for `wide` events) its area manager. */
export const peopleFor = (store: StoreRef, people: Person[], wide = false) =>
  people
    .filter((p) => (p.role === "MANAGER" && p.storeId === store.id) || (p.role === "OWNER" && p.companyId === store.companyId) || (wide && p.role === "AREA_MANAGER" && p.regionId === store.regionId))
    .map((p) => p.id);

/** Claims event keys; only the ones not sent before are returned, so a poll never notifies twice. */
export async function claimEvents(keys: string[]) {
  if (!keys.length) return new Set<string>();
  const before = new Set((await db.staffPushEvent.findMany({ where: { key: { in: keys } }, select: { key: true } })).map((e) => e.key));
  const fresh = keys.filter((k) => !before.has(k));
  if (fresh.length) await db.staffPushEvent.createMany({ data: fresh.map((key) => ({ key })) });
  return new Set(fresh);
}

const summarize = (sent: Promise<{ users: number }>[]) => Promise.all(sent).then((r) => r.reduce((t, x) => t + x.users, 0));

// ── Immediate events (every 5 minutes) ───────────────────────────────────────
/** New online orders: the scheduler polls for orders placed since the last run (nothing hooks the checkout itself). */
export async function notifyNewOrders(now = new Date()) {
  const { stores, people } = await subscribedStores();
  if (!stores.length) return { pushed: 0 };
  const orders = await db.order.findMany({
    where: { storeId: { in: stores.map((s) => s.id) }, status: "PLACED", createdAt: { gte: addDays(now, -1), lte: now } },
    select: { id: true, code: true, storeId: true, fulfilment: true, totalCents: true, customer: { select: { firstName: true } } },
    take: 500,
  });
  const fresh = await claimEvents(orders.map((o) => `order:${o.id}`));
  const byStore = new Map(stores.map((s) => [s.id, s]));
  const sent = orders
    .filter((o) => fresh.has(`order:${o.id}`))
    .map((o) => {
      const s = byStore.get(o.storeId)!;
      const how = o.fulfilment === "COLLECT" ? "click & collect" : o.fulfilment === "SAME_DAY" ? "same-day delivery" : "courier";
      return pushToStaff(peopleFor(s, people), { title: `New online order · ${s.name}`, body: `${o.code} · ${o.customer.firstName} · ${zar(o.totalCents)} · ${how}`, url: `/store/${s.code}/orders/${o.id}` });
    });
  return { pushed: await summarize(sent) };
}

/** Loss alerts raised in the last day, never sent to the person they're about. */
export async function notifyAlerts(now = new Date()) {
  const { stores, people } = await subscribedStores();
  if (!stores.length) return { pushed: 0 };
  const alerts = await db.alert.findMany({
    where: { storeId: { in: stores.map((s) => s.id) }, status: "OPEN", createdAt: { gte: addDays(now, -1), lte: now } },
    select: { id: true, storeId: true, userId: true, title: true, severity: true },
    take: 500,
  });
  const fresh = await claimEvents(alerts.map((a) => `alert:${a.id}`));
  const byStore = new Map(stores.map((s) => [s.id, s]));
  const sent = alerts
    .filter((a) => fresh.has(`alert:${a.id}`))
    .map((a) => {
      const s = byStore.get(a.storeId)!;
      const to = peopleFor(s, people, true).filter((id) => id !== a.userId);
      return pushToStaff(to, { title: `${a.severity === "HIGH" ? "High" : a.severity === "MEDIUM" ? "Medium" : "Low"} loss alert · ${s.name}`, body: a.title, url: `/store/${s.code}/loss-prevention/${a.id}` });
    });
  return { pushed: await summarize(sent) };
}

/** HQ updates that require acknowledgement, per store that hasn't acknowledged yet. */
export async function notifyAnnouncements(now = new Date()) {
  const { stores, people } = await subscribedStores();
  if (!stores.length) return { pushed: 0 };
  const list = await db.announcement.findMany({
    where: { requiresAck: true, createdAt: { gte: addDays(now, -7), lte: now } },
    select: { id: true, title: true, kind: true, audience: true, acks: { select: { storeId: true } } },
    take: 100,
  });
  if (!list.length) return { pushed: 0 };
  const formats = new Map((await db.store.findMany({ where: { id: { in: stores.map((s) => s.id) } }, select: { id: true, format: true, region: { select: { code: true } } } })).map((s) => [s.id, s]));
  const pairs: { a: (typeof list)[number]; s: StoreRef }[] = [];
  for (const a of list)
    for (const s of stores) {
      const f = formats.get(s.id);
      const addressed = a.audience === "ALL" || a.audience === `format:${f?.format}` || a.audience === `region:${f?.region.code}`;
      if (addressed && !a.acks.some((x) => x.storeId === s.id)) pairs.push({ a, s });
    }
  const fresh = await claimEvents(pairs.map(({ a, s }) => `announcement:${a.id}:${s.id}`));
  const sent = pairs
    .filter(({ a, s }) => fresh.has(`announcement:${a.id}:${s.id}`))
    .map(({ a, s }) => pushToStaff(peopleFor(s, people), { title: `${a.kind === "RECALL" ? "Recall" : "HQ update"} to acknowledge · ${s.name}`, body: a.title, url: `/store/${s.code}/updates?view=todo` }));
  return { pushed: await summarize(sent) };
}

// ── Daily digests ────────────────────────────────────────────────────────────
/** Lots on hand that enter the expiry window, once per lot per store. */
export async function notifyExpiringBatches(now = new Date()) {
  const { stores, people } = await subscribedStores();
  if (!stores.length) return { pushed: 0 };
  const { operations } = await getSettings();
  const lots = await db.stockLevel.findMany({
    where: { storeId: { in: stores.map((s) => s.id) }, onHand: { gt: 0 }, batch: { status: "RELEASED", expiresAt: { gt: now, lte: addDays(now, operations.batchExpiryDays) } } },
    select: { storeId: true, batchId: true, onHand: true, batch: { select: { code: true, expiresAt: true, variant: { select: { name: true, product: { select: { name: true } } } } } } },
    take: 2_000,
  });
  const fresh = await claimEvents(lots.map((l) => `batch:${l.storeId}:${l.batchId}`));
  const byStore = new Map(stores.map((s) => [s.id, s]));
  const sent = lots
    .filter((l) => fresh.has(`batch:${l.storeId}:${l.batchId}`))
    .map((l) => {
      const s = byStore.get(l.storeId)!;
      return pushToStaff(peopleFor(s, people), {
        title: `Lot expiring ${fmtDay(l.batch.expiresAt!)} · ${s.name}`,
        body: `${l.batch.variant.product.name} · ${l.batch.variant.name} (${l.batch.code}): ${l.onHand} on hand: mark down or move them first`,
        url: `/store/${s.code}/batches?view=expiring`,
      });
    });
  return { pushed: await summarize(sent) };
}

/** Cash due at the bank today or overdue: one reminder per store per day. */
export async function notifyDepositsDue(now = new Date()) {
  const { stores, people } = await subscribedStores();
  if (!stores.length) return { pushed: 0 };
  const today = dayKey(now);
  const due: { s: StoreRef; cents: number; n: number; overdue: number }[] = [];
  for (const s of stores) {
    const waiting = (await waitingCash(s.id, now)).filter((w) => w.dueOn <= today);
    if (waiting.length) due.push({ s, cents: waiting.reduce((t, w) => t + w.cashCents, 0), n: waiting.length, overdue: waiting.filter((w) => w.overdue).length });
  }
  const fresh = await claimEvents(due.map((d) => `deposit:${d.s.id}:${today}`));
  const sent = due
    .filter((d) => fresh.has(`deposit:${d.s.id}:${today}`))
    .map((d) =>
      pushToStaff(peopleFor(d.s, people), {
        title: `${d.overdue ? "Cash overdue at the bank" : "Cash to bank today"} · ${d.s.name}`,
        body: `${zar(d.cents)} from ${d.n} cash-up${d.n === 1 ? "" : "s"}${d.overdue ? ` (${d.overdue} past the deadline)` : ""}. Record the deposit with its slip.`,
        url: `/store/${d.s.code}/banking`,
      }),
    );
  return { pushed: await summarize(sent) };
}

/** Daily low-stock digest per store, from the replenishment plan. */
export async function lowStockDigest(now = new Date()) {
  const { stores, people } = await subscribedStores();
  if (!stores.length) return { pushed: 0 };
  const today = dayKey(now);
  const fresh = await claimEvents(stores.map((s) => `lowstock:${s.id}:${today}`));
  let pushed = 0;
  for (const s of stores.filter((s) => fresh.has(`lowstock:${s.id}:${today}`))) {
    const plan = await replenishmentPlan(s.id);
    const low = plan.filter((r) => r.available <= r.reorderPoint);
    if (!low.length) continue;
    const out = low.filter((r) => r.available <= 0).length;
    const top = low.slice(0, 3).map((r) => r.name).join(", ");
    const r = await pushToStaff(peopleFor(s, people), {
      title: `${low.length} SKU${low.length === 1 ? "" : "s"} low on stock · ${s.name}`,
      body: `${out ? `${out} out of stock. ` : ""}${top}${low.length > 3 ? ` and ${low.length - 3} more` : ""}: suggested order ready.`,
      url: `/store/${s.code}/purchasing/new`,
    });
    pushed += r.users;
  }
  return { pushed };
}

/** Event keys older than 60 days are of no further use. */
export const pruneStaffPushEvents = (now = new Date()) => db.staffPushEvent.deleteMany({ where: { sentAt: { lt: addDays(now, -60) } } });

