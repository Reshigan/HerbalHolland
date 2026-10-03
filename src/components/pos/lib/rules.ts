// Small pure rules for the till: receipt numbering, cash handling, compliance block
// types, order SLAs and points redemption. Isomorphic and unit-tested (tests/pos.test.ts).
import { voucherCodeFrom } from "@/lib/vouchers";
import { zar } from "@/lib/money";
import type { BlockKind, CustomerDetail, TradeAccountDTO } from "@/server/pos/types";
import type { QueuedTender } from "./storage";

/** Device-local receipt number, e.g. PTA01-B00042 (store code · device prefix · sequence). */
export const receiptNumber = (storeCode: string, prefix: string, seq: number) => `${storeCode}-${prefix}${String(seq).padStart(5, "0")}`;

/** South African notes and coins, in cents (R200 … 10c). */
export const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10] as const;
export const denomLabel = (cents: number) => (cents >= 100 ? `R${cents / 100}` : `${cents}c`);
export const isNote = (cents: number) => cents >= 1000;

export function countCash(counts: Record<string, number>) {
  return DENOMINATIONS.reduce((s, d) => s + d * Math.max(0, Math.floor(counts[String(d)] ?? 0)), 0);
}

/** Tendered-amount shortcuts: exact, then the next round amounts a customer is likely to hand over. */
export function quickCash(dueCents: number): number[] {
  if (dueCents <= 0) return [];
  const out = new Set<number>([dueCents]);
  for (const step of [1000, 2000, 5000, 10000, 20000, 50000]) out.add(Math.ceil(dueCents / step) * step);
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

/** Maps the compliance engine's messages to the action the cashier can take. */
export function classifyBlock(message: string): BlockKind {
  if (/^Members only/i.test(message)) return "MEMBER";
  if (/isn't available to trade customers|isn't approved to buy|isn't available right now/i.test(message)) return "TRADE";
  if (/^Age verification required/i.test(message)) return "AGE";
  if (/^Under \d+/i.test(message)) return "UNDERAGE";
  if (/patient authorisation/i.test(message)) return "PATIENT";
  if (/authorised quantity/i.test(message)) return "QUANTITY";
  if (/authorised dispenser/i.test(message)) return "DISPENSER";
  if (/needs a licence/i.test(message)) return "LICENCE";
  if (/^Daily limit/i.test(message)) return "DAILY_LIMIT";
  if (/can't be sold via|in-store only/i.test(message)) return "CHANNEL";
  return "OTHER";
}

export type SlaState = "ok" | "warn" | "late";

/** Age of an online order against the ready-for-collection SLA (default 15 minutes). */
export function orderSla(placedAt: Date | string, doneAt: Date | string | null, now: Date, limitMin = 15): { minutes: number; state: SlaState } {
  const end = doneAt ? new Date(doneAt) : now;
  const minutes = Math.max(0, Math.floor((end.getTime() - new Date(placedAt).getTime()) / 60_000));
  return { minutes, state: minutes >= limitMin ? "late" : minutes >= Math.ceil((limitMin * 2) / 3) ? "warn" : "ok" };
}

/**
 * Points a member can put towards this sale: whole points (1 point = R1), within their
 * balance, within what's still due, never against medicines, and only once they hold
 * the programme minimum.
 */
export function maxRedeemable(a: { balance: number; eligibleCents: number; dueCents: number; minRedeem: number }) {
  if (a.balance < a.minRedeem) return 0;
  const cap = Math.floor(Math.min(a.eligibleCents, a.dueCents) / 100);
  return Math.max(0, Math.min(a.balance, cap));
}

export const TENDER_LABEL: Record<string, string> = {
  CARD: "Card",
  CASH: "Cash",
  PAYSHAP: "PayShap",
  EFT: "EFT",
  LOYALTY: "Points",
  ONLINE: "Paid online",
  VOUCHER: "Gift voucher", ACCOUNT: "On account",
};

/** A tender as a receipt line: "Gift voucher HH-K7PM-3QXR-9ZAB", "Card •••• 1234 (ref)", "Cash". */
export function tenderLine(t: { method: string; reference?: string | null; cardLast4?: string | null }, dots = "••••") {
  if (t.method === "VOUCHER") return `${TENDER_LABEL.VOUCHER} ${t.reference ?? ""}`.trim();
  return `${TENDER_LABEL[t.method] ?? t.method}${t.cardLast4 ? ` ${dots} ${t.cardLast4}` : ""}${t.reference ? ` (${t.reference})` : ""}`;
}

/**
 * A card payment taken on a stand-alone card machine: the store's Yoco machine, or any bank terminal. The cashier charges
 * the amount on the machine, then keys in its reference (required) and, if they like, the card's last 4 digits. The
 * machine has its own connection, so the till only records the payment: it works offline and syncs with the sale.
 */
export function cardMachineTender(provider: "YOCO" | "EXTERNAL", amountCents: number, reference: string, last4 = ""): { tender: QueuedTender } | { error: string } {
  const ref = reference.trim().replace(/^#/, "");
  if (!/^[A-Za-z0-9-]{4,40}$/.test(ref)) return { error: provider === "YOCO" ? "Key in the reference from the Yoco machine" : "Enter the approval code printed on the terminal slip" };
  if (last4 && !/^\d{4}$/.test(last4)) return { error: "The card's last 4 digits, or leave it blank" };
  return { tender: { method: "CARD", amountCents, provider, reference: provider === "EXTERNAL" ? ref.toUpperCase() : ref, cardLast4: last4 || undefined } };
}

/** HH••••002 — a member number as printed on receipts (the card keeps the full number). */
export function maskMemberNo(memberNo: string) {
  const m = memberNo.match(/^([A-Z]*)(\d+)$/i);
  if (!m || m[2].length <= 3) return memberNo.replace(/\d(?=\d{3})/g, "•");
  return `${m[1]}${"•".repeat(m[2].length - 3)}${m[2].slice(-3)}`;
}

/**
 * A batch code from a scan or a typed value: the code printed on the pack ("DUPO0-35G-2605A") or the lab-certificate
 * QR that links to /batch/{code}. Never a barcode (digits only), a member number, an order QR, a ticket or a gift
 * voucher code (HH-XXXX-XXXX-XXXX, which is also dashed).
 */
export function parseBatchScan(text: string): string | null {
  const t = text.trim();
  const url = t.match(/\/batch\/([A-Z0-9][A-Z0-9-]{3,40})\/?(?:[?#].*)?$/i);
  if (url) return url[1].toUpperCase();
  if (parseOrderQr(t) || rsvpTicketFrom(t) || memberNoFrom(t) || voucherCodeFrom(t) || /^\d+$/.test(t)) return null;
  return /^[A-Z0-9]{2,12}(?:-[A-Z0-9]{1,12}){1,4}$/i.test(t) && /\d/.test(t) ? t.toUpperCase() : null;
}

/** 082 ••• 1234 — enough for the cashier to confirm who they're serving. */
export function maskPhone(e164: string) {
  const local = e164.startsWith("+27") ? `0${e164.slice(3)}` : e164;
  return local.length >= 10 ? `${local.slice(0, 3)} ••• ${local.slice(-4)}` : local;
}

/**
 * Order collection QR from the storefront: "HHORDER:{orderCode}:{collectionCode}".
 * The till still verifies the collection code against the order on the server.
 */
export function parseOrderQr(text: string): { orderCode: string; collectionCode: string } | null {
  const m = text.trim().match(/^HHORDER:([A-Z0-9]{4,12}):(\d{4,8})$/i);
  return m ? { orderCode: m[1].toUpperCase(), collectionCode: m[2] } : null;
}

/** Extracts a Herbal Holland Rewards member number (member card QR = the plain memberNo) from a scan or typed value. */
export const memberNoFrom = (text: string) => (parseOrderQr(text) || rsvpTicketFrom(text) ? null : (text.toUpperCase().match(/\bHH\d{7}\b/)?.[0] ?? null));

/** Event ticket QR from the Rewards app, "HHRSVP:{code}" (scanned or typed) → normalised, or null. */
export function rsvpTicketFrom(text: string) {
  const m = text.trim().match(/^HHRSVP:\s*([A-Z0-9]{4,16})$/i);
  return m ? `HHRSVP:${m[1].toUpperCase()}` : null;
}

/** Drops that still govern variants on this till (after a drop ends its stock sells normally), by variant id. */
export function dropIndex<D extends { variantIds: string[]; endsAt: string | null }>(drops: D[] | undefined, at = new Date()) {
  const out = new Map<string, D>();
  for (const d of drops ?? []) if (!d.endsAt || new Date(d.endsAt) > at) for (const v of d.variantIds) if (!out.has(v)) out.set(v, d);
  return out;
}

/** Parses "123.45" / "R 1 234,50" style amounts into cents; null when not a number. */
export function parseRands(input: string): number | null {
  const s = input.replace(/[R\s]/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** RFC 4122 v4 id (crypto.randomUUID needs a secure context; getRandomValues doesn't). */
export function uuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Offline, the till can't look members up: it takes the member number from their card and the server resolves it on sync. */
export const offlineMember = (memberNo: string): CustomerDetail => ({
  id: "", memberNo, firstName: "Member", lastName: memberNo, phone: "", email: null, tier: "SEED", points: 0, ageCheck: "NONE", ageVerified: false, age: null,
  homeStore: null, visitsHere: 0, lastVisitHere: null, foundingNo: null, tierFloor: null, offers: [], patient: null, offline: true,
});

// ── Trade-sale mode ──────────────────────────────────────────────────────────

/** "On account · 30 days" / "Prepaid (EFT)" — an account's terms as the till shows them. */
export const tradeTermsLabel = (a: Pick<TradeAccountDTO, "terms" | "paymentDays">) => (a.terms === "ACCOUNT" ? `On account · ${a.paymentDays} days` : "Prepaid (EFT)");

export type TradeTenderRules = {
  cash: boolean;
  card: boolean; // tap on glass / the Yoco machine / a bank terminal
  eft: boolean; // an EFT the buyer makes now (bank reference)
  payshap: boolean;
  account: boolean; // "On account": only when the credit decision allows the amount
  accountReason: string | null; // why not, in plain English (shown under the tender)
  points: false;
  voucher: false;
};

/**
 * Which tenders a trade sale may take. Money as usual (card, EFT and PayShap need the connection the sale needs
 * anyway), never points or a gift voucher (consumer money), and "On account" only for an APPROVED account on
 * ACCOUNT terms while the amount — this tender plus what's already on account in the sale — stays within what the
 * account may still put on account (`availableCents`, the server's credit decision less what's open). The server
 * re-runs the credit check when the sale posts.
 */
export function tradeTenders(a: { account: Pick<TradeAccountDTO, "terms" | "status" | "availableCents">; online: boolean; amountCents: number; onAccountSoFarCents?: number }): TradeTenderRules {
  const left = Math.max(0, a.account.availableCents - (a.onAccountSoFarCents ?? 0));
  let accountReason: string | null = null;
  if (a.account.status !== "APPROVED") accountReason = "On hold — money only";
  else if (a.account.terms !== "ACCOUNT") accountReason = "Prepaid account — money only";
  else if (a.account.availableCents <= 0) accountReason = "Nothing available on account";
  else if (a.amountCents > left) accountReason = `Only ${zar(left)} available on account`;
  else if (a.amountCents <= 0) accountReason = "Nothing left to put on account";
  return { cash: true, card: a.online, eft: a.online, payshap: a.online, account: a.online && !accountReason, accountReason, points: false, voucher: false };
}

/**
 * The 6-digit collection code a trade buyer gets when their click & collect order is ready: it must match the
 * order's exactly (the TO-… number is not a fallback — the buyer may not be the person who collects).
 */
export function tradeCodeMatches(collectionCode: string | null | undefined, entered: string) {
  const v = entered.replace(/\D/g, "");
  return !!collectionCode && /^\d{6}$/.test(v) && v === collectionCode;
}

/**
 * The Z-report's trade section from the shift's sales grouped by kind and channel: WHOLESALE sales (till trade
 * sales and trade orders handed over) ex VAT, VAT and incl, their refunds, and the part invoiced on account
 * (the ACCOUNT tender, net of credit notes) — which is not money and never changes the cash-up.
 */
export function tradeSummary(rows: { kind: string; channel: string; count: number; totalCents: number; vatCents: number }[], tenders: { method: string; amountCents: number }[]) {
  const sum = (xs: { totalCents: number; vatCents: number }[], f: (r: { totalCents: number; vatCents: number }) => number) => xs.reduce((a, r) => a + f(r), 0);
  const sales = rows.filter((r) => r.kind === "SALE" && r.channel === "WHOLESALE");
  const refunds = rows.filter((r) => r.kind === "REFUND" && r.channel === "WHOLESALE");
  const inclCents = sum(sales, (r) => r.totalCents);
  const vatCents = sum(sales, (r) => r.vatCents);
  return {
    count: sales.reduce((a, r) => a + r.count, 0),
    exCents: inclCents - vatCents,
    vatCents,
    inclCents,
    refundCents: sum(refunds, (r) => -r.totalCents),
    onAccountCents: tenders.filter((t) => t.method === "ACCOUNT").reduce((a, t) => a + t.amountCents, 0),
  };
}
