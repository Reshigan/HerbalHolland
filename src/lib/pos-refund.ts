// Till refunds: who may approve one, and where its money goes back to. Pure: the server (sales.refundSale) and the
// till's refund sheet use the same rules, so the sheet shows exactly what will be posted.
import { zar } from "./money";

/** Roles that may approve a refund (and other manager-PIN actions) at the till. */
export const TILL_MANAGER_ROLES = ["MANAGER", "OWNER"] as const;
export const isTillManager = (role: string | null | undefined) => (TILL_MANAGER_ROLES as readonly string[]).includes(role ?? "");

export const REFUND_METHODS = ["CARD", "CASH", "PAYSHAP", "EFT"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];
/** Where a till refund's money goes: back to how they paid (split over the sale's money tenders), or one tender (a manager's call). */
export type RefundTo = RefundMethod | "ORIGINAL";

type Paid = { method: string; amountCents: number; cardLast4?: string | null };
const isMoney = (m: string): m is RefundMethod => (REFUND_METHODS as readonly string[]).includes(m);

/** A money tender on a sale: what it paid, what refunds have already put back on it, and the card (when one card paid). */
export type MoneyPart = { method: RefundMethod; paidCents: number; refundedCents: number; cardLast4: string | null };
/** Money going back on one tender. */
export type RefundPart = { method: RefundMethod; cents: number; cardLast4: string | null };

/**
 * The sale's money tenders (card, cash, PayShap or EFT, but never vouchers, points or the account), in tender order: what each
 * paid and what earlier refunds put back on it (refund rows are negative). A card's last 4 digits ride along when a
 * single card paid, so its refund names it.
 */
export function moneyPartsOf(sale: { payments: Paid[]; refunds?: { payments: Paid[] }[] }): MoneyPart[] {
  const parts = new Map<RefundMethod, MoneyPart & { cards: Set<string> }>();
  for (const p of sale.payments) {
    if (!isMoney(p.method) || p.amountCents <= 0) continue;
    const part = parts.get(p.method) ?? { method: p.method, paidCents: 0, refundedCents: 0, cardLast4: null, cards: new Set<string>() };
    part.paidCents += p.amountCents;
    if (p.cardLast4) part.cards.add(p.cardLast4);
    parts.set(p.method, part);
  }
  for (const r of sale.refunds ?? [])
    for (const p of r.payments) {
      const part = isMoney(p.method) ? parts.get(p.method) : undefined;
      if (part) part.refundedCents += Math.max(0, -p.amountCents);
    }
  return [...parts.values()].map(({ cards, ...p }) => ({ ...p, cardLast4: cards.size === 1 ? [...cards][0] : null }));
}

const left = (p: MoneyPart) => Math.max(0, p.paidCents - p.refundedCents);

/**
 * "Back to how they paid": the money part of a refund (after vouchers and the account, which come first) spread over
 * the sale's money tenders in proportion to what each still has to give back (paid less earlier refunds), so no tender
 * ever gets back more than that. Whole cents: each part rounds down and the odd cents go on the largest tender (the
 * next largest once it's full). `overCents` is what no tender has left to take: rounding of whole points, or refunds
 * from before this rule.
 */
export function refundSplit(parts: MoneyPart[], toTenderCents: number): { parts: RefundPart[]; overCents: number } {
  const amount = Math.max(0, Math.round(toTenderCents));
  const live = parts.map((p) => ({ p, left: left(p) })).filter((x) => x.left > 0);
  const total = live.reduce((s, x) => s + x.left, 0);
  const give = Math.min(amount, total);
  if (!give) return { parts: [], overCents: amount };
  const out = live.map((x) => ({ ...x, cents: Math.floor((give * x.left) / total) }));
  let odd = give - out.reduce((s, x) => s + x.cents, 0);
  for (const x of [...out].sort((a, b) => b.left - a.left)) {
    const add = Math.min(odd, x.left - x.cents);
    x.cents += add;
    odd -= add;
    if (!odd) break;
  }
  return { parts: out.filter((x) => x.cents > 0).map((x) => ({ method: x.p.method, cents: x.cents, cardLast4: x.p.cardLast4 })), overCents: amount - give };
}

/**
 * The money "back to how they paid" as the server posts it: refundSplit's parts, plus any cents it couldn't place on the
 * tender that paid most. Null when no money tender paid on the sale: a manager then chooses one.
 */
export function backHowTheyPaid(parts: MoneyPart[], toTenderCents: number): RefundPart[] | null {
  const s = refundSplit(parts, toTenderCents);
  if (!s.overCents) return s.parts;
  const top = parts.reduce<MoneyPart | null>((best, p) => (!best || p.paidCents > best.paidCents ? p : best), null);
  if (!top) return null;
  const hit = s.parts.find((p) => p.method === top.method);
  if (hit) hit.cents += s.overCents;
  else s.parts.push({ method: top.method, cents: s.overCents, cardLast4: top.cardLast4 });
  return s.parts;
}

/** Cash still to give back on a sale: the cash it was paid less cash already refunded (a refund never pays out more). */
export const cashLeft = (parts: MoneyPart[]) => parts.filter((p) => p.method === "CASH").reduce((s, p) => s + left(p), 0);

/** "R100.00 cash · R290.00 to the card ending 0005" */
export const describeRefund = (parts: RefundPart[]) =>
  parts
    .map((p) =>
      p.method === "CASH" ? `${zar(p.cents)} cash` : p.method === "CARD" ? `${zar(p.cents)} to the card${p.cardLast4 ? ` ending ${p.cardLast4}` : ""}` : `${zar(p.cents)} by ${p.method === "PAYSHAP" ? "PayShap" : "EFT"}`,
    )
    .join(" · ");

/**
 * A sale line's share of a refund of `qty` units: its total × qty ÷ its quantity, rounded. When these are the last
 * units back, it's exactly what's left of the line, so a line refunded in parts adds up to what was paid for it. The same for
 * its VAT, member savings and deals.
 */
export const lineShare = (lineCents: number, lineQty: number, qty: number, refundedQty: number, refundedCents: number) =>
  refundedQty + qty >= lineQty ? lineCents - refundedCents : Math.round((lineCents * qty) / lineQty);

/**
 * The points part of a refund, in cents of whole points: points paid on the sale come back in proportion to the value
 * refunded so far (this refund included), rounded down, so a sale refunded in parts returns every point paid by its
 * last refund, and never more.
 */
export function pointsBack(a: { loyaltyPaidCents: number; loyaltyBackCents: number; totalCents: number; refundedCents: number; amountCents: number }) {
  if (a.loyaltyPaidCents <= 0 || a.totalCents <= 0) return 0;
  const after = Math.min(a.totalCents, Math.max(0, a.refundedCents + a.amountCents));
  const due = Math.floor((after * a.loyaltyPaidCents) / (a.totalCents * 100)) * 100;
  return Math.max(0, Math.min(a.loyaltyPaidCents, due) - a.loyaltyBackCents);
}
