// Loss prevention: the rules in src/lib/loss.ts run over recent trading (nightly, plus at shift close and when a
// deposit is recorded). Each finding becomes one alert with its evidence. The key stops a rule raising it twice.
// High severity is emailed at once to the store's owner and area manager; the rest go in a daily digest.
// Nobody sees, or is emailed, an alert about themselves.
import { db } from "./db";
import { audit, SYSTEM } from "./audit";
import { emailLayout, esc, sendEmail } from "./email";
import { reportFailure } from "./alerts";
import { getSettings } from "./settings";
import { APP_URL } from "./invoices";
import { sastDay } from "./sql";
import { openState, parseHours } from "./shop/hours";
import { aboveNorm, cashShort, median, refundFlags, type LossSettings, type Severity } from "@/lib/loss";
import { cashToBank, isOverdue, bankBy } from "@/lib/banking";
import { addDays, dayKey, fmtDateTime } from "@/lib/format";
import { zar } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";
import type { Staff } from "./auth";

export const RULES = {
  CASH_SHORT: "Cash-up short",
  CASH_SHORT_REPEAT: "Repeated cash shortages",
  DEPOSIT_OVERDUE: "Cash not banked in time",
  DEPOSIT_SHORT: "Deposit short",
  REFUND: "Suspicious refund",
  REFUND_RATE: "High refund rate",
  SALES_REFUNDED: "Own sales refunded",
  WRITE_OFFS: "Stock write-offs",
  OWN_MEMBER: "Sales on own member card",
  MEMBER_REPEAT: "One card, many sales",
  OFFLINE_SHARE: "Unusual offline selling",
  AFTER_HOURS: "Sales outside trading hours",
  COMPLIANCE: "Compliance exception",
  OFFLINE_VARIANCE: "Offline sale off price or tender",
} as const;
export type Rule = keyof typeof RULES;

type Evidence = { label: string; href?: string };
export type NewAlert = { key: string; rule: Rule; severity: Severity; storeId: string; userId?: string | null; title: string; detail: string; amountCents?: number | null; evidence: Evidence[] };

/** Alerts a user may see: their stores, never about themselves. */
export const visibleAlerts = (u: Pick<Staff, "id">, storeIds: string[]): Prisma.AlertWhereInput => ({
  storeId: { in: storeIds },
  OR: [{ userId: null }, { userId: { not: u.id } }],
});

/** Raises new alerts (existing keys are skipped) and emails the high-severity ones at once. */
export async function raiseAlerts(list: NewAlert[]) {
  if (!list.length) return 0;
  const raised = new Set((await db.alert.findMany({ where: { key: { in: list.map((a) => a.key) } }, select: { key: true } })).map((a) => a.key));
  const { count } = await db.alert.createMany({ data: list.filter((a) => !raised.has(a.key)).map((a) => ({ ...a, userId: a.userId ?? null, amountCents: a.amountCents ?? null })) });
  if (list.some((a) => a.severity === "HIGH")) await notifyHigh(list.filter((a) => a.severity === "HIGH").map((a) => a.key)).catch((e) => console.error("[loss] notify failed", e));
  return count;
}

// ── Notifications ────────────────────────────────────────────────────────────
const link = (code: string, id: string) => `${APP_URL()}/store/${code}/loss-prevention/${id}`;

async function recipients(stores: { companyId: string; regionId: string }[]) {
  return db.user.findMany({
    where: {
      active: true,
      email: { not: null },
      OR: [
        { role: "OWNER", companyId: { in: [...new Set(stores.map((s) => s.companyId))] } },
        { role: "AREA_MANAGER", regionId: { in: [...new Set(stores.map((s) => s.regionId))] } },
      ],
    },
    select: { id: true, email: true, role: true, companyId: true, regionId: true },
  });
}
const covers = (u: { role: string; companyId: string | null; regionId: string | null }, s: { companyId: string; regionId: string }) =>
  u.role === "OWNER" ? u.companyId === s.companyId : u.regionId === s.regionId;

async function notifyHigh(keys: string[]) {
  const alerts = await db.alert.findMany({ where: { key: { in: keys }, notifiedAt: null }, include: { store: { select: { code: true, name: true, companyId: true, regionId: true } } } });
  if (!alerts.length) return;
  const people = await recipients(alerts.map((a) => a.store));
  for (const a of alerts) {
    const subject = `Loss prevention: ${a.title} at ${a.store.name}`;
    const html = emailLayout({ preheader: a.title, heading: `${a.title} at ${a.store.name}`, body: `<p>${esc(a.detail)}</p>`, cta: { label: "Review the alert", href: link(a.store.code, a.id) } });
    for (const u of people.filter((p) => p.id !== a.userId && covers(p, a.store)))
      await sendEmail({ to: u.email!, subject, html, text: `${a.title} at ${a.store.name}.\n\n${a.detail}\n\nReview it: ${link(a.store.code, a.id)}` });
    await db.alert.update({ where: { id: a.id }, data: { notifiedAt: new Date() } });
  }
}

/**
 * One email per owner / area manager with yesterday's other new alerts in their stores. An alert counts as notified
 * once a digest with it has gone (or nobody covers it); one whose every digest failed goes out again the next night.
 */
export async function sendDigest(now = new Date()) {
  const alerts = await db.alert.findMany({ where: { notifiedAt: null }, orderBy: { createdAt: "asc" }, take: 5_000, include: { store: { select: { code: true, name: true, companyId: true, regionId: true } } } });
  if (!alerts.length) return { emails: 0, failed: 0, alerts: 0 };
  let emails = 0, failed = 0;
  const sent = new Set<string>(), unsent = new Set<string>();
  for (const u of await recipients(alerts.map((a) => a.store))) {
    const mine = alerts.filter((a) => a.userId !== u.id && covers(u, a.store));
    if (!mine.length) continue;
    const subject = `Loss prevention: ${mine.length} new alert${mine.length === 1 ? "" : "s"} (${dayKey(now)})`;
    const items = mine.map((a) => `<li style="margin:0 0 8px"><a href="${esc(link(a.store.code, a.id))}">${esc(a.store.name)}: ${esc(a.title)}</a> <span style="color:#78716C">(${a.severity.toLowerCase()})</span></li>`);
    const html = emailLayout({ preheader: subject, heading: "New loss-prevention alerts", body: `<ul style="padding-left:18px">${items.join("")}</ul>` });
    try {
      await sendEmail({ to: u.email!, subject, html, text: mine.map((a) => `• [${a.severity.toLowerCase()}] ${a.store.name}: ${a.title}\n  ${link(a.store.code, a.id)}`).join("\n") });
      emails++;
      for (const a of mine) sent.add(a.id);
    } catch (e) {
      failed++;
      for (const a of mine) unsent.add(a.id);
      await reportFailure(e, "cron sendDigest");
    }
  }
  const notified = alerts.filter((a) => sent.has(a.id) || !unsent.has(a.id)).map((a) => a.id);
  await db.alert.updateMany({ where: { id: { in: notified } }, data: { notifiedAt: now } });
  return { emails, failed, alerts: notified.length };
}

// ── Rules ────────────────────────────────────────────────────────────────────
const weekOf = (now: Date) => dayKey(addDays(now, -((new Date(`${dayKey(now)}T12:00:00Z`).getUTCDay() + 6) % 7))); // Monday, SAST
const codes = async (ids: string[]) => new Map((await db.store.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, code: true } })).map((s) => [s.id, s.code]));

/** A cash-up counted short (at shift close, and nightly for tills that closed offline). */
export async function checkShifts(where: Prisma.ShiftWhereInput, s: LossSettings) {
  const shifts = await db.shift.findMany({ where: { AND: [where, { closedAt: { not: null }, countedCashCents: { not: null }, expectedCashCents: { not: null } }] }, include: { store: { select: { code: true } } } });
  return shifts.flatMap((x): NewAlert[] => {
    const v = x.countedCashCents! - x.expectedCashCents!;
    const severity = cashShort(v, s);
    return severity
      ? [{ key: `CASH_SHORT:${x.id}`, rule: "CASH_SHORT", severity, storeId: x.storeId, userId: x.closedById, amountCents: -v, title: `Cash-up short ${zar(-v)}`, detail: `Counted ${zar(x.countedCashCents!)} against ${zar(x.expectedCashCents!)} expected when the shift closed (${fmtDateTime(x.closedAt!)}).`, evidence: [{ label: "The cash-up", href: `/store/${x.store.code}/cash-ups/${x.id}` }] }]
      : [];
  });
}

async function repeatShorts(now: Date, s: LossSettings) {
  const rows = await db.$queryRaw<{ storeId: string; userId: string; n: number; short: number }[]>`
    SELECT "storeId", "closedById" AS "userId", COUNT(*) AS n, -SUM("countedCashCents" - "expectedCashCents") AS short
    FROM "Shift" WHERE "closedAt" >= ${addDays(now, -30)} AND "closedById" IS NOT NULL AND "countedCashCents" - "expectedCashCents" <= ${-s.cashShortCents}
    GROUP BY 1, 2 HAVING COUNT(*) >= ${s.repeatShorts}`;
  const code = await codes(rows.map((r) => r.storeId));
  return rows.map((r): NewAlert => ({
    key: `CASH_SHORT_REPEAT:${r.userId}:${weekOf(now)}`, rule: "CASH_SHORT_REPEAT", severity: "HIGH", storeId: r.storeId, userId: r.userId, amountCents: r.short,
    title: `${r.n} cash-ups short in 30 days`, detail: `The same person closed ${r.n} shifts short in the last 30 days, ${zar(r.short)} in all.`,
    evidence: [{ label: "Cash-ups with a variance", href: `/store/${code.get(r.storeId)}/cash-ups?view=variance` }],
  }));
}

/** Cash past its bank-by day: one live alert per store, kept up to date nightly and closed once it's all banked. */
async function overdueCash(now: Date, dueDays: number) {
  const shifts = await db.shift.findMany({
    where: { depositId: null, closedAt: { not: null, lt: addDays(now, -1) }, countedCashCents: { not: null }, store: { status: "ACTIVE" } },
    select: { id: true, storeId: true, closedAt: true, countedCashCents: true, openingFloatCents: true, store: { select: { code: true } } },
    orderBy: { closedAt: "asc" },
  });
  const byStore = new Map<string, typeof shifts>();
  for (const x of shifts) if (cashToBank(x) > 0 && isOverdue(x.closedAt!, dueDays, now)) byStore.set(x.storeId, [...(byStore.get(x.storeId) ?? []), x]);
  const found = [...byStore.values()].map((list): NewAlert => {
    const cash = list.reduce((t, x) => t + cashToBank(x), 0);
    const late = Math.round((now.getTime() - new Date(`${bankBy(list[0].closedAt!, dueDays)}T22:00:00Z`).getTime()) / 86_400_000);
    return {
      key: `DEPOSIT_OVERDUE:${list[0].storeId}:${list[0].id}`, rule: "DEPOSIT_OVERDUE", severity: late > 3 ? "HIGH" : "MEDIUM", storeId: list[0].storeId, amountCents: cash,
      title: `${zar(cash)} not banked in time`, detail: `${list.length} cash-up${list.length === 1 ? "" : "s"} past the banking deadline; the oldest was due ${bankBy(list[0].closedAt!, dueDays)}.`,
      evidence: [{ label: "Cash waiting to be banked", href: `/store/${list[0].store.code}/banking` }],
    };
  });

  const live = await db.alert.findMany({ where: { rule: "DEPOSIT_OVERDUE", status: { in: ["OPEN", "INVESTIGATING"] }, store: { status: "ACTIVE" } }, select: { id: true, storeId: true, severity: true, status: true } });
  const fresh: NewAlert[] = [];
  for (const a of found) {
    const cur = live.find((l) => l.storeId === a.storeId);
    if (!cur) fresh.push(a);
    // An escalation to high goes out with tonight's digest.
    else await db.alert.update({ where: { id: cur.id }, data: { title: a.title, detail: a.detail, amountCents: a.amountCents, severity: a.severity, ...(a.severity === "HIGH" && cur.severity !== "HIGH" && { notifiedAt: null }) } });
  }
  const note = "Everything overdue has been banked, so this closed automatically.";
  for (const cur of live.filter((l) => !byStore.has(l.storeId))) {
    await db.alert.update({ where: { id: cur.id }, data: { status: "RESOLVED", note, closedAt: now } });
    await audit(db, SYSTEM, "alert.update", { storeId: cur.storeId, entity: "Alert", entityId: cur.id, data: { from: cur.status, to: "RESOLVED", note } });
  }
  return fresh;
}

async function refunds(since: Date, s: LossSettings) {
  const rows = await db.sale.findMany({
    where: { kind: "REFUND", createdAt: { gte: since }, refundOfId: { not: null } },
    select: {
      id: true, number: true, storeId: true, staffId: true, createdAt: true, totalCents: true,
      shift: { select: { closedAt: true } }, payments: { select: { method: true } }, store: { select: { code: true } },
      refundOf: { select: { number: true, staffId: true, createdAt: true, payments: { select: { method: true } } } },
    },
  });
  return rows.flatMap((r): NewAlert[] => {
    const o = r.refundOf!;
    const { severity, reasons } = refundFlags(
      {
        cashForCard: r.payments.some((p) => p.method === "CASH") && !o.payments.some((p) => p.method === "CASH"),
        otherPersonsSale: !!o.staffId && o.staffId !== r.staffId,
        minutesAfterSale: (r.createdAt.getTime() - o.createdAt.getTime()) / 60_000,
        minutesBeforeClose: r.shift?.closedAt ? (r.shift.closedAt.getTime() - r.createdAt.getTime()) / 60_000 : null,
      },
      s,
    );
    return severity
      ? [{ key: `REFUND:${r.id}`, rule: "REFUND", severity, storeId: r.storeId, userId: r.staffId, amountCents: -r.totalCents, title: `Refund ${r.number}: ${zar(-r.totalCents)}`, detail: `Refund of sale ${o.number}: ${reasons.join("; ")}.`, evidence: [{ label: "Refunds report", href: `/store/${r.store.code}/reports/refunds?range=7d` }] }]
      : [];
  });
}

async function refundRates(now: Date, s: LossSettings) {
  const rows = await db.$queryRaw<{ storeId: string; userId: string; role: string; sales: number; refunds: number; value: number }[]>`
    SELECT s."storeId", s."staffId" AS "userId", u.role AS role, COUNT(CASE WHEN s.kind = 'SALE' THEN 1 END) AS sales, COUNT(CASE WHEN s.kind = 'REFUND' THEN 1 END) AS refunds,
      -COALESCE(SUM(CASE WHEN s.kind = 'REFUND' THEN s."totalCents" END), 0) AS value
    FROM "Sale" s JOIN "User" u ON u.id = s."staffId" WHERE s."createdAt" >= ${addDays(now, -30)} AND s.channel = 'POS' GROUP BY 1, 2, 3`;
  const rate = (r: { sales: number; refunds: number }) => r.refunds / Math.max(1, r.sales);
  // Compared with people in the same role across the network: refunds are usually a manager's job.
  const norms = new Map([...new Set(rows.map((r) => r.role))].map((role) => [role, median(rows.filter((r) => r.role === role && r.sales >= 30).map(rate))]));
  const code = await codes(rows.map((r) => r.storeId));
  return rows
    .filter((r) => r.refunds >= s.refundMin && aboveNorm(rate(r), norms.get(r.role) ?? 0, s.refundFactor, 0))
    .map((r): NewAlert => ({
      key: `REFUND_RATE:${r.userId}:${weekOf(now)}`, rule: "REFUND_RATE", severity: "MEDIUM", storeId: r.storeId, userId: r.userId, amountCents: r.value,
      title: `${r.refunds} refunds in 30 days`, detail: `${(rate(r) * 100).toFixed(1)}% of their transactions were refunds (${(100 * (norms.get(r.role) ?? 0)).toFixed(1)}% is normal for their role across the network), ${zar(r.value)} paid back.`,
      evidence: [{ label: "Refunds report", href: `/store/${code.get(r.storeId)}/reports/refunds?range=30d` }],
    }));
}

/** Commission gaming: a person's own sales refunded this month. */
async function salesRefunded(now: Date, s: LossSettings) {
  const month = dayKey(now).slice(0, 7);
  const start = new Date(`${month}-01T00:00:00+02:00`);
  const rows = await db.$queryRaw<{ storeId: string; userId: string; sold: number; refunded: number; n: number }[]>`
    SELECT o."storeId", COALESCE(o."soldById", o."staffId") AS "userId", SUM(o."totalCents") AS sold, -COALESCE(SUM(r.value), 0) AS refunded, COALESCE(SUM(r.n), 0) AS n
    FROM "Sale" o
    LEFT JOIN (SELECT "refundOfId", SUM("totalCents") AS value, COUNT(*) AS n FROM "Sale" WHERE kind = 'REFUND' AND "createdAt" >= ${start} GROUP BY 1) r ON r."refundOfId" = o.id
    WHERE o.kind = 'SALE' AND o.channel = 'POS' AND COALESCE(o."soldById", o."staffId") IS NOT NULL AND o."createdAt" >= ${start}
    GROUP BY 1, 2`; // the seller, as commission credits it (a dispenser who completed the sale isn't the seller)
  const code = await codes(rows.map((r) => r.storeId));
  return rows
    .filter((r) => r.n >= s.refundedMin && r.refunded >= r.sold * s.refundedShare)
    .map((r): NewAlert => ({
      key: `SALES_REFUNDED:${r.userId}:${month}`, rule: "SALES_REFUNDED", severity: "MEDIUM", storeId: r.storeId, userId: r.userId, amountCents: r.refunded,
      title: `${Math.round((r.refunded / Math.max(1, r.sold)) * 100)}% of their sales refunded this month`, detail: `${r.n} of this person's sales this month were refunded (${zar(r.refunded)} of ${zar(r.sold)}). Sales that are later refunded can inflate commission.`,
      evidence: [{ label: "Commission this month", href: `/store/${code.get(r.storeId)}/commission` }],
    }));
}

async function writeOffs(now: Date, s: LossSettings) {
  const rows = await db.$queryRaw<{ storeId: string; week: number; norm: number }[]>`
    SELECT "storeId",
      COALESCE(SUM(CASE WHEN "createdAt" >= ${addDays(now, -7)} THEN -qty * "unitCostCents" END), 0) AS week,
      COALESCE(SUM(CASE WHEN "createdAt" < ${addDays(now, -7)} THEN -qty * "unitCostCents" END), 0) / 12.0 AS norm
    FROM "StockMovement"
    WHERE "createdAt" >= ${addDays(now, -91)} AND qty < 0 AND ((type = 'ADJUST' AND reason IN ('DAMAGED', 'THEFT', 'LOST', 'EXPIRED')) OR type = 'COUNT')
    GROUP BY 1`;
  const code = await codes(rows.map((r) => r.storeId));
  return rows
    .filter((r) => aboveNorm(r.week, r.norm, s.writeOffFactor, s.writeOffMinCents))
    .map((r): NewAlert => ({
      key: `WRITE_OFFS:${r.storeId}:${weekOf(now)}`, rule: "WRITE_OFFS", severity: r.week >= r.norm * s.writeOffFactor * 2 ? "HIGH" : "MEDIUM", storeId: r.storeId, amountCents: r.week,
      title: `${zar(r.week)} of stock written off this week`, detail: `Damaged, theft, lost, expired and count losses at cost, against a weekly norm of ${zar(Math.round(r.norm))} over the last 12 weeks.`,
      evidence: [{ label: "Adjustments", href: `/store/${code.get(r.storeId)}/adjustments` }, { label: "Shrinkage report", href: `/store/${code.get(r.storeId)}/reports/shrinkage?range=30d` }],
    }));
}

async function memberCards(since: Date, s: LossSettings) {
  const own = await db.$queryRaw<{ storeId: string; userId: string; customerId: string; day: string; n: number; total: number }[]>`
    SELECT s."storeId", s."staffId" AS "userId", s."customerId", ${sastDay('s."createdAt"')} AS day, COUNT(*) AS n, SUM(s."totalCents") AS total
    FROM "Sale" s JOIN "User" u ON u.id = s."staffId" AND u."memberId" = s."customerId"
    WHERE s."createdAt" >= ${since} AND s.kind = 'SALE' GROUP BY 1, 2, 3, 4`;
  const repeat = await db.$queryRaw<{ storeId: string; userId: string; customerId: string; day: string; n: number; total: number }[]>`
    SELECT "storeId", "staffId" AS "userId", "customerId", ${sastDay('"createdAt"')} AS day, COUNT(*) AS n, SUM("totalCents") AS total
    FROM "Sale" WHERE "createdAt" >= ${since} AND kind = 'SALE' AND channel = 'POS' AND "customerId" IS NOT NULL AND "staffId" IS NOT NULL
    GROUP BY 1, 2, 3, 4 HAVING COUNT(*) >= ${s.memberRepeat}`;
  const code = await codes([...own, ...repeat].map((r) => r.storeId));
  const member = (r: { storeId: string; customerId: string }) => ({ label: "The member", href: `/store/${code.get(r.storeId)}/customers/${r.customerId}` });
  return [
    ...own.map((r): NewAlert => ({
      key: `OWN_MEMBER:${r.userId}:${r.day}`, rule: "OWN_MEMBER", severity: "MEDIUM", storeId: r.storeId, userId: r.userId, amountCents: r.total,
      title: `Rang up ${r.n} sale${r.n === 1 ? "" : "s"} on their own member card`, detail: `${r.day}: ${zar(r.total)}. Staff purchases should be rung up by someone else; points on customers' purchases don't belong on a staff card.`, evidence: [member(r)],
    })),
    ...repeat.map((r): NewAlert => ({
      key: `MEMBER_REPEAT:${r.userId}:${r.customerId}:${r.day}`, rule: "MEMBER_REPEAT", severity: "MEDIUM", storeId: r.storeId, userId: r.userId, amountCents: r.total,
      title: `One member card on ${r.n} of their sales in a day`, detail: `${r.day}: the same card collected points on ${r.n} sales (${zar(r.total)}) rung up by the same person. Check it's really one shopper coming back.`, evidence: [member(r)],
    })),
  ];
}

async function offlineShare(now: Date, s: LossSettings) {
  const rows = await db.$queryRaw<{ storeId: string; weekOff: number; weekAll: number; normOff: number; normAll: number }[]>`
    SELECT "storeId",
      COUNT(CASE WHEN "createdAt" >= ${addDays(now, -7)} AND offline THEN 1 END) AS "weekOff", COUNT(CASE WHEN "createdAt" >= ${addDays(now, -7)} THEN 1 END) AS "weekAll",
      COUNT(CASE WHEN "createdAt" < ${addDays(now, -7)} AND offline THEN 1 END) AS "normOff", COUNT(CASE WHEN "createdAt" < ${addDays(now, -7)} THEN 1 END) AS "normAll"
    FROM "Sale" WHERE "createdAt" >= ${addDays(now, -63)} AND channel = 'POS' GROUP BY 1`;
  const code = await codes(rows.map((r) => r.storeId));
  const share = (off: number, all: number) => off / Math.max(1, all);
  return rows
    .filter((r) => r.weekOff >= s.offlineMin && aboveNorm(share(r.weekOff, r.weekAll), share(r.normOff, r.normAll), s.offlineFactor, 0))
    .map((r): NewAlert => ({
      key: `OFFLINE_SHARE:${r.storeId}:${weekOf(now)}`, rule: "OFFLINE_SHARE", severity: "LOW", storeId: r.storeId,
      title: `${r.weekOff} offline sales this week`, detail: `${(share(r.weekOff, r.weekAll) * 100).toFixed(1)}% of till sales this week were rung up offline (normally ${(share(r.normOff, r.normAll) * 100).toFixed(1)}%). Offline sales skip the live member and compliance checks. Check the connection, then the tills.`,
      evidence: [{ label: "Cash-ups", href: `/store/${code.get(r.storeId)}/cash-ups` }],
    }));
}

async function afterHours(since: Date) {
  const stores = (await db.store.findMany({ where: { kind: "RETAIL", status: "ACTIVE" }, select: { id: true, code: true, hours: true } })).filter((x) => Object.keys(parseHours(x.hours)).length);
  const hours = new Map(stores.map((x) => [x.id, { code: x.code, h: parseHours(x.hours) }]));
  const sales = await db.sale.findMany({ where: { createdAt: { gte: since }, channel: "POS", kind: "SALE", storeId: { in: stores.map((x) => x.id) } }, select: { storeId: true, staffId: true, createdAt: true, number: true } });
  const HALF_HOUR = 30 * 60_000;
  const closed = (h: ReturnType<typeof parseHours>, t: Date) => ![t, new Date(t.getTime() - HALF_HOUR), new Date(t.getTime() + HALF_HOUR)].some((x) => openState(h, x).open);
  const found = new Map<string, { storeId: string; userId: string | null; day: string; numbers: string[] }>();
  for (const x of sales) {
    const st = hours.get(x.storeId)!;
    if (!closed(st.h, x.createdAt)) continue;
    const k = `${x.staffId}:${x.storeId}:${dayKey(x.createdAt)}`;
    const f = found.get(k) ?? { storeId: x.storeId, userId: x.staffId, day: dayKey(x.createdAt), numbers: [] };
    f.numbers.push(`${x.number} (${fmtDateTime(x.createdAt)})`);
    found.set(k, f);
  }
  return [...found.values()].map((f): NewAlert => ({
    key: `AFTER_HOURS:${f.userId}:${f.storeId}:${f.day}`, rule: "AFTER_HOURS", severity: "MEDIUM", storeId: f.storeId, userId: f.userId,
    title: `${f.numbers.length} sale${f.numbers.length === 1 ? "" : "s"} outside trading hours`, detail: `More than 30 minutes outside the store's hours: ${f.numbers.slice(0, 5).join(", ")}${f.numbers.length > 5 ? "…" : ""}.`,
    evidence: [{ label: "Cash-ups", href: `/store/${hours.get(f.storeId)!.code}/cash-ups` }],
  }));
}

async function complianceExceptions(since: Date) {
  const rows = await db.auditLog.findMany({ where: { action: "compliance.offline_exception", at: { gte: since }, storeId: { not: null } }, select: { id: true, storeId: true, actorId: true, at: true, data: true } });
  return rows.map((r): NewAlert => ({
    key: `COMPLIANCE:${r.id}`, rule: "COMPLIANCE", severity: "HIGH", storeId: r.storeId!, userId: r.actorId,
    title: "Offline sale broke a compliance rule", detail: `${fmtDateTime(r.at)}: ${String((r.data as { message?: string } | null)?.message ?? "the till couldn't check it offline")}.`,
    evidence: [{ label: "Logged as compliance.offline_exception in the HQ audit log" }],
  }));
}

/** Offline sales the server would have charged more for, that were paid short or over, or that took more points than the member had. */
async function offlineVariances(since: Date) {
  const rows = await db.auditLog.findMany({ where: { action: { in: ["sale.offline_price", "sale.tender_variance", "sale.points_overdraw"] }, at: { gte: since }, storeId: { not: null } }, select: { id: true, action: true, storeId: true, actorId: true, at: true, data: true } });
  return rows.map((r): NewAlert => {
    const d = (r.data ?? {}) as { charged?: number; price?: number; paid?: number; total?: number; redeemed?: number; balance?: number };
    const [title, detail, amountCents] =
      r.action === "sale.offline_price" ? ["Offline sale below price", `Charged ${zar(d.charged ?? 0)} for what costs ${zar(d.price ?? 0)} today.`, (d.price ?? 0) - (d.charged ?? 0)]
      : r.action === "sale.points_overdraw" ? ["Offline sale took more points than the member had", `${d.redeemed} points redeemed with ${d.balance} on the card.`, ((d.redeemed ?? 0) - (d.balance ?? 0)) * 100]
      : ["Sale paid short or over", `Tendered ${zar(d.paid ?? 0)} against a total of ${zar(d.total ?? 0)}.`, Math.abs((d.total ?? 0) - (d.paid ?? 0))];
    return { key: `OFFLINE_VARIANCE:${r.id}`, rule: "OFFLINE_VARIANCE", severity: "MEDIUM", storeId: r.storeId!, userId: r.actorId, title, detail: `${fmtDateTime(r.at)}: ${detail}`, amountCents, evidence: [{ label: `Logged as ${r.action} in the HQ audit log` }] };
  });
}

/** The nightly run: every rule over recent trading, then the digest. Idempotent: re-running raises nothing new. */
export async function runLossRules(now = new Date()) {
  const { loss: s, banking } = await getSettings();
  const since = addDays(now, -2);
  const found = [
    ...(await checkShifts({ closedAt: { gte: since } }, s)),
    ...(await repeatShorts(now, s)),
    ...(await overdueCash(now, banking.dueBusinessDays)),
    ...(await refunds(since, s)),
    ...(await refundRates(now, s)),
    ...(await salesRefunded(now, s)),
    ...(await writeOffs(now, s)),
    ...(await memberCards(since, s)),
    ...(await offlineShare(now, s)),
    ...(await afterHours(since)),
    ...(await complianceExceptions(since)),
    ...(await offlineVariances(since)),
  ];
  const raised = await raiseAlerts(found);
  return { found: found.length, raised, digest: await sendDigest(now) };
}
