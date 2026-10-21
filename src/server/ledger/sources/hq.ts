// HQ and network posting rules: the franchise statement and its payments (in both books), and, in HQ's books, online
// payments, gift vouchers, the points HQ gives, the trade ledger and EFTs paid ahead for trade orders. Each handler
// says what its source should show now (the lines come from @/lib/ledger-hq); the core posts the difference. A source
// whose events fall on different days (a payment and its refund) takes a suffix on its id, so each keeps its own date.
//   statement          <storeId>:<YYYY-MM>     a franchisee store's month, once it's over
//   statement-payment  <StatementPayment id>
//   online-payment     <Order id>              paid online; <id>:cancel refunded on cancelling; <id>:<credit note id> a return refunded
//   voucher            <GiftVoucher id>        sold; <id>:expiry what was left on it when it expired
//   points             <YYYY-MM-DD>            points HQ gave (or its own stores issued) and points that expired that day
//   trade-entry        <TradeLedgerEntry id>   payments, credit notes and adjustments HQ made
//   trade-eft          <TradeOrder id>         an EFT paid ahead; <id>:refund refunded when the order was cancelled
import { db, Prisma, type Tx } from "../../db";
import { franchiseStatement, monthRange } from "../../finance";
import { sastDay } from "../../sql";
import type { Posting, SourceHandler } from "../core";
import { CATCH_UP_DAYS, missed } from "./catch-up";
import { addMonths, monthEnd, monthsBetween, periodOf } from "@/lib/ledger";
import {
  HQ_POINT_KINDS, onlinePaymentLines, orderCancelledAt, orderPaidAt, pointsLines, POINTS_SOURCE_KINDS, statementLines, statementPaymentLines, tradeEftLines, tradeEntryLines, voucherLines,
} from "@/lib/ledger-hq";
import { POINT_VALUE_CENTS } from "@/lib/loyalty-rules";
import { isVoucherSku, maskVoucherCode } from "@/lib/vouchers";
import { addDays, dayKey, fmtDate, fmtMonth } from "@/lib/format";
import type { LoyaltyKind } from "@/generated/prisma/client";

type Source = { source: string; sourceId: string };
type OrderEvent = { status: string; at: string };

/** HQ, the franchisor. */
async function hqCompany(t: Tx) {
  const hq = await t.company.findFirst({ where: { kind: "FRANCHISOR" }, orderBy: { createdAt: "asc" }, select: { id: true, vatNumber: true } });
  if (!hq) throw new Error("There's no franchisor company to post HQ's side to");
  return hq;
}

const monthLabel = (month: string) => fmtMonth(`${month}-15T12:00:00Z`);
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ── The franchise statement and its payments (both books) ─────────────────────────

/** A franchisee store's month, once it's over: the statement's fees, points issued and My Deals, on the month's last day. */
const statement: SourceHandler = async (sourceId, t) => {
  const [storeId, month = ""] = sourceId.split(":");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month >= periodOf(dayKey(new Date()))) return [];
  const store = await t.store.findUnique({ where: { id: storeId }, select: { name: true, kind: true, company: { select: { id: true, kind: true, vatNumber: true } } } });
  if (!store || store.kind !== "RETAIL" || store.company.kind !== "FRANCHISEE") return [];
  const hq = await hqCompany(t);
  const st = await franchiseStatement(storeId, month);
  const lines = statementLines(
    { royalty: st.royalty, levy: st.levy, ecom: st.ecom, feesVat: st.feesVat, pointsIssuedCents: st.input.pointsIssuedCents, offersFundedCents: st.input.offersFundedCents ?? 0, storeId, franchiseeId: store.company.id },
    { franchisee: !!store.company.vatNumber, hq: !!hq.vatNumber },
  );
  const base = { date: monthEnd(month), memo: `${monthLabel(month)} franchise statement · ${store.name}`, storeId };
  return [{ ...base, companyId: store.company.id, lines: lines.franchisee }, { ...base, companyId: hq.id, lines: lines.hq }];
};

/** A payment settling a statement, in both books on the day it was paid; a deleted one is reversed. */
const statementPayment: SourceHandler = async (id, t) => {
  const p = await t.statementPayment.findUnique({ where: { id } });
  if (!p) return [];
  const hq = await hqCompany(t);
  if (p.companyId === hq.id) return [];
  const store = await t.store.findUnique({ where: { id: p.storeId }, select: { name: true } });
  const company = await t.company.findUnique({ where: { id: p.companyId }, select: { name: true } });
  const lines = statementPaymentLines({ amountCents: p.amountCents, storeId: p.storeId, franchiseeId: p.companyId });
  const about = `${monthLabel(p.month)} statement · ${store?.name ?? "store"} · ref ${p.reference}`;
  const base = { date: p.paidOn.toISOString().slice(0, 10), storeId: p.storeId };
  const toHq = p.amountCents > 0;
  return [
    { ...base, companyId: p.companyId, memo: `${toHq ? "Paid to" : "Received from"} Herbal Holland · ${about}`, lines: lines.franchisee },
    { ...base, companyId: hq.id, memo: `${toHq ? "Received from" : "Paid to"} ${company?.name ?? "franchisee"} · ${about}`, lines: lines.hq },
  ];
};

// ── Online payments and gift vouchers (HQ's books) ────────────────────────────────

/** What the member paid through the gateway for an order, and the day: the total less points and gift vouchers. */
async function paidOnline(t: Tx, o: { id: string; payMethod: string; paymentStatus: string; totalCents: number; pointsRedeemed: number; events: unknown; createdAt: Date }) {
  if (o.payMethod !== "ONLINE" || (o.paymentStatus !== "PAID" && o.paymentStatus !== "REFUNDED")) return null;
  // Every voucher amount taken at checkout, released ones too: the gateway was charged the rest, then refunded it.
  const vouchers = (await t.voucherRedemption.aggregate({ where: { orderId: o.id, cents: { gt: 0 } }, _sum: { cents: true } }))._sum.cents ?? 0;
  const cents = o.totalCents - o.pointsRedeemed * POINT_VALUE_CENTS - vouchers;
  return cents > 0 ? { cents, day: dayKey(orderPaidAt(o.events as OrderEvent[], o.createdAt)) } : null;
}

/**
 * An order's money through the online gateway, held as prepaid until the store fulfils it (the store's day clears it):
 * paid (`<id>`), refunded in full when the order is cancelled (`<id>:cancel`; a refund the gateway failed is back on
 * the order, so reversed), and a return refunded through the gateway (`<id>:<credit note id>`: the credit note's online
 * tender). A gift voucher purchase posts as `voucher`.
 */
const onlinePayment: SourceHandler = async (sourceId, t) => {
  const [orderId, part] = sourceId.split(":");
  const o = await t.order.findUnique({
    where: { id: orderId },
    select: { id: true, code: true, storeId: true, status: true, payMethod: true, paymentStatus: true, totalCents: true, pointsRedeemed: true, events: true, createdAt: true, lines: { select: { variant: { select: { sku: true } } } } },
  });
  if (!o || o.lines.every((l) => isVoucherSku(l.variant.sku))) return [];
  const paid = await paidOnline(t, o);
  if (!paid) return [];
  const hq = await hqCompany(t);
  const post = (date: string, memo: string, cents: number): Posting[] => [{ companyId: hq.id, date, memo, storeId: o.storeId, lines: onlinePaymentLines(cents, o.storeId) }];
  if (!part) return post(paid.day, `Paid online · order ${o.code}`, paid.cents);
  if (part === "cancel") {
    const at = orderCancelledAt(o.events as OrderEvent[]);
    return o.status === "CANCELLED" && o.paymentStatus === "REFUNDED" && at ? post(dayKey(at), `Refunded online · order ${o.code} cancelled`, -paid.cents) : [];
  }
  const note = await t.sale.findFirst({ where: { id: part, kind: "REFUND", refundOf: { orderId: o.id } }, select: { number: true, createdAt: true, payments: { where: { method: "ONLINE" }, select: { amountCents: true } } } });
  const back = note?.payments.reduce((s, p) => s + p.amountCents, 0) ?? 0; // negative: money out
  return note && back ? post(dayKey(note.createdAt), `Refunded online · ${note.number} · order ${o.code}`, back) : [];
};

/** A gift voucher: sold through the gateway on the day it was issued (`<id>`); what was left on it when it expired (`<id>:expiry`). */
const voucher: SourceHandler = async (sourceId, t) => {
  const [id, part] = sourceId.split(":");
  const v = await t.giftVoucher.findUnique({ where: { id }, select: { code: true, amountCents: true, balanceCents: true, status: true, issuedAt: true, expiresAt: true } });
  if (!v?.issuedAt || v.status === "PENDING" || v.status === "CANCELLED") return [];
  const hq = await hqCompany(t);
  const code = maskVoucherCode(v.code);
  if (!part) return [{ companyId: hq.id, date: dayKey(v.issuedAt), memo: `Gift voucher sold · ${code}`, lines: voucherLines({ soldCents: v.amountCents }) }];
  const expired = part === "expiry" && (v.status === "EXPIRED" || v.expiresAt <= new Date());
  return expired ? [{ companyId: hq.id, date: dayKey(v.expiresAt), memo: `Gift voucher expired unused · ${code}`, lines: voucherLines({ expiredCents: Math.max(0, v.balanceCents) }) }] : [];
};

// ── Rewards points (HQ's books) ─────────────────────────────────────────────────────

/**
 * A day of points in HQ's books: what HQ gave (sign-up, referral, birthday and goodwill bonuses, adjustments), what
 * stores HQ owns issued on their sales (they have no statement to charge it on), and what expired or was forfeited.
 */
const points: SourceHandler = async (day, t) => {
  if (!isDay(day)) return [];
  const start = new Date(`${day}T00:00:00+02:00`);
  const kinds = await t.loyaltyEntry.groupBy({ by: ["kind"], where: { createdAt: { gte: start, lt: addDays(start, 1) }, kind: { in: POINTS_SOURCE_KINDS as LoyaltyKind[] } }, _sum: { points: true } });
  const own = await t.dailyStoreStat.groupBy({ by: ["storeId"], where: { date: new Date(`${day}T00:00:00Z`), store: { company: { kind: "FRANCHISOR" } } }, _sum: { pointsIssued: true } });
  const value = (rows: typeof kinds) => rows.reduce((s, r) => s + (r._sum.points ?? 0), 0) * POINT_VALUE_CENTS;
  const lines = pointsLines({
    givenCents: value(kinds.filter((r) => HQ_POINT_KINDS.includes(r.kind))),
    expiredCents: -value(kinds.filter((r) => r.kind === "EXPIRE")),
    ownStores: own.map((r) => ({ storeId: r.storeId, cents: (r._sum.pointsIssued ?? 0) * POINT_VALUE_CENTS })),
  });
  return [{ companyId: (await hqCompany(t)).id, date: day, memo: `Rewards points given by Herbal Holland, and points expired · ${fmtDate(`${day}T12:00:00Z`)}`, lines }];
};

// ── The trade ledger (HQ's books) ───────────────────────────────────────────────────

/**
 * A trade-ledger entry HQ made, on its day: a payment, a credit note or an adjustment. Invoices, and credit notes that
 * refund a sale, are tenders on the sale (the store's day posts them); an EFT confirmed for a trade order is trade-eft's.
 */
const tradeEntry: SourceHandler = async (id, t) => {
  const e = await t.tradeLedgerEntry.findUnique({
    where: { id },
    select: { kind: true, cents: true, reference: true, note: true, tradeAccountId: true, tradeOrderId: true, saleId: true, createdAt: true, account: { select: { name: true, number: true } } },
  });
  if (!e || e.kind === "INVOICE") return [];
  if (e.kind === "PAYMENT" && e.tradeOrderId) {
    const o = await t.tradeOrder.findUnique({ where: { id: e.tradeOrderId }, select: { payMethod: true, paidAt: true, paymentRef: true } });
    if (o?.payMethod === "EFT" && o.paidAt?.getTime() === e.createdAt.getTime() && o.paymentRef === e.reference) return [];
  }
  if (e.kind === "CREDIT_NOTE" && e.saleId && (await t.sale.count({ where: { number: e.reference ?? "", kind: "REFUND", refundOfId: e.saleId } }))) return [];
  const who = `${e.account.name} (${e.account.number})`;
  const memo =
    e.kind === "PAYMENT" ? `Trade payment · ${who} · ref ${e.reference ?? "—"}` : e.kind === "CREDIT_NOTE" ? `Trade credit note ${e.reference ?? ""} · ${who} · ${e.note ?? ""}` : `Trade account adjustment · ${who} · ${e.note ?? ""}`;
  return [{ companyId: (await hqCompany(t)).id, date: dayKey(e.createdAt), memo, lines: tradeEntryLines(e) }];
};

/**
 * An EFT paid ahead for a trade order: in the bank on the day HQ says it arrived, held as prepaid until the order ships
 * or is collected (`<id>`); refunded by hand when the order is cancelled (`<id>:refund`, on the day it was cancelled).
 */
const tradeEft: SourceHandler = async (sourceId, t) => {
  const [id, part] = sourceId.split(":");
  const o = await t.tradeOrder.findUnique({ where: { id }, select: { number: true, storeId: true, status: true, payMethod: true, paidAt: true, cancelledAt: true, totalCents: true, account: { select: { name: true } } } });
  if (!o || o.payMethod !== "EFT" || !o.paidAt) return [];
  const refund = part === "refund" && o.status === "CANCELLED" ? o.cancelledAt : null;
  if (part && !refund) return [];
  const [date, what, cents] = refund ? [refund, "EFT refunded", -o.totalCents] : [o.paidAt, "EFT received", o.totalCents];
  return [{ companyId: (await hqCompany(t)).id, date: dayKey(date), memo: `${what} · trade order ${o.number} · ${o.account.name}`, storeId: o.storeId, lines: tradeEftLines(cents, o.storeId) }];
};

export const HQ_SOURCES: Record<string, SourceHandler> = {
  statement,
  "statement-payment": statementPayment,
  "online-payment": onlinePayment,
  voucher,
  points,
  "trade-entry": tradeEntry,
  "trade-eft": tradeEft,
};

// ── What to post nightly, and what a period holds ─────────────────────────────────────

/** The franchisee stores that traded in a month: their statements. */
async function statementsFor(month: string): Promise<Source[]> {
  const r = monthRange(month);
  const rows = await db.dailyStoreStat.groupBy({ by: ["storeId"], where: { date: { gte: r.fromDate, lte: r.toDate }, store: { kind: "RETAIL", company: { kind: "FRANCHISEE" } } } });
  return rows.map((x) => ({ source: "statement", sourceId: `${x.storeId}:${month}` }));
}

/**
 * Nightly: the points of the week that ended with yesterday (cheap to post again, and a day's points can post while
 * it's under way, as members' balances change, so only posting it again makes up a missed night), and last month's
 * statement for every franchisee store that traded: on the 1st (SAST), then to the 7th any that a missed night left
 * unposted. Voucher expiries queue themselves.
 */
export async function hqNightly(now: Date): Promise<Source[]> {
  const today = dayKey(now);
  const points = Array.from({ length: CATCH_UP_DAYS }, (_, i): Source => ({ source: "points", sourceId: dayKey(addDays(now, -1 - i)) }));
  if (Number(today.slice(8)) > CATCH_UP_DAYS) return points;
  const statements = await statementsFor(addMonths(periodOf(today), -1));
  return [...points, ...(today.endsWith("-01") ? statements : await missed(statements))];
}

/**
 * Every source of HQ's with activity between two SAST days (inclusive), to post or re-post a period: statements for
 * the months that are over and overlap it, statement payments, online payments and refunds, vouchers sold or expired,
 * points days, trade-ledger entries and trade-order EFTs. Each query is bounded by the range. Every source dates its own
 * posting, so a few listed from just before the range (or that post nothing) change nothing.
 */
export async function hqBackfill(from: string, to: string): Promise<Source[]> {
  if (!isDay(from) || !isDay(to) || from > to) throw new Error("Choose a range of days (YYYY-MM-DD)");
  const start = new Date(`${from}T00:00:00+02:00`);
  const end = addDays(new Date(`${to}T00:00:00+02:00`), 1);
  const now = new Date();
  const within = (d: Date | null | undefined) => !!d && d >= start && d < end;
  const out: Source[] = [];
  const add = (source: string, sourceId: string) => out.push({ source, sourceId });

  const current = periodOf(dayKey(now));
  for (const m of monthsBetween(periodOf(from), periodOf(to))) if (m < current) out.push(...(await statementsFor(m)));

  for (const p of await db.statementPayment.findMany({ where: { paidOn: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }, select: { id: true } }))
    add("statement-payment", p.id);

  // Online orders are paid within their payment window of being placed (a day's margin lists a few from just before the
  // range too: posting is idempotent and each keeps its own date), refunded on cancelling within weeks, and refunded
  // for a return by its credit note.
  for (const o of await db.order.findMany({ where: { payMethod: "ONLINE", paymentStatus: { in: ["PAID", "REFUNDED"] }, createdAt: { gte: addDays(start, -1), lt: end } }, select: { id: true } }))
    add("online-payment", o.id);
  for (const o of await db.order.findMany({ where: { payMethod: "ONLINE", status: "CANCELLED", paymentStatus: "REFUNDED", createdAt: { gte: addDays(start, -120), lt: end }, updatedAt: { gte: start } }, select: { id: true } }))
    add("online-payment", `${o.id}:cancel`);
  const notes = await db.sale.findMany({ where: { kind: "REFUND", createdAt: { gte: start, lt: end }, refundOf: { orderId: { not: null } }, payments: { some: { method: "ONLINE" } } }, select: { id: true, refundOf: { select: { orderId: true } } } });
  for (const n of notes) add("online-payment", `${n.refundOf!.orderId}:${n.id}`);

  const vouchers = await db.giftVoucher.findMany({
    where: { OR: [{ issuedAt: { gte: start, lt: end } }, { expiresAt: { gte: start, lt: end < now ? end : now }, status: { notIn: ["PENDING", "CANCELLED"] } }] },
    select: { id: true, issuedAt: true, expiresAt: true },
  });
  for (const v of vouchers) {
    if (within(v.issuedAt)) add("voucher", v.id);
    if (within(v.expiresAt) && v.expiresAt <= now) add("voucher", `${v.id}:expiry`);
  }

  const days = await db.$queryRaw<{ day: string }[]>`
    SELECT ${sastDay('"createdAt"')} AS day FROM "LoyaltyEntry"
    WHERE "createdAt" >= ${start} AND "createdAt" < ${end} AND kind IN (${Prisma.join([...POINTS_SOURCE_KINDS])})
    UNION
    SELECT date(d."date") FROM "DailyStoreStat" d JOIN "Store" s ON s.id = d."storeId" JOIN "Company" c ON c.id = s."companyId"
    WHERE d."date" >= ${new Date(`${from}T00:00:00Z`)} AND d."date" <= ${new Date(`${to}T00:00:00Z`)} AND c.kind = 'FRANCHISOR' AND d."pointsIssued" <> 0
    ORDER BY day`;
  for (const d of days) add("points", d.day);

  for (const e of await db.tradeLedgerEntry.findMany({ where: { createdAt: { gte: start, lt: end }, kind: { not: "INVOICE" } }, select: { id: true } })) add("trade-entry", e.id);
  const eft = await db.tradeOrder.findMany({
    where: { payMethod: "EFT", paidAt: { not: null }, OR: [{ paidAt: { gte: start, lt: end } }, { cancelledAt: { gte: start, lt: end } }] },
    select: { id: true, paidAt: true, cancelledAt: true },
  });
  for (const o of eft) {
    if (within(o.paidAt)) add("trade-eft", o.id);
    if (within(o.cancelledAt)) add("trade-eft", `${o.id}:refund`);
  }
  return out;
}
