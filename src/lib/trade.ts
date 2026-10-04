// Trade (wholesale) channel: the pure rules. Prices are ex VAT with VAT worked out per line (15%, rounded half up to
// the cent), orders are placed in case multiples above a minimum value, accounts buy prepaid (EFT) or on approved
// credit terms within a limit, and the account's ledger ages FIFO. Pure: safe on the server, in the browser and in
// tests (tests/trade.test.ts). THC is never traded.
import { PROVINCES, type ProvinceCode } from "./sa";
import { REG_CLASSES, type RegClass } from "./compliance";
import { zar } from "./money";
import { parseQuery } from "./search";
import { addDays } from "./format";
import { checkLicenceInput, licenceInSentence, requiredLicences, TRADE_LICENCES, TRADE_LICENCE_KINDS, type TradeLicenceKind } from "./trade-licences";

// ── Numbers ──────────────────────────────────────────────────────────────────
// Counter keys (src/server/counters.ts nextNumber): "trade-account", "trade-order", "trade-invoice", "trade-credit".
const six = (n: number) => String(n).padStart(6, "0");
export const tradeAccountNumber = (n: number) => `TA-${six(n)}`;
export const tradeOrderNumber = (n: number) => `TO-${six(n)}`;
export const tradeInvoiceNumber = (n: number) => `TI-${six(n)}`;
/** A credit note HQ issues by hand on the ledger (a refund's credit note carries the refund's own number). */
export const tradeCreditNumber = (n: number) => `TC-${six(n)}`;

/** The EFT reference the buyer puts on their payment — printed on the pro forma: "HH-TO-000123". */
export const eftReference = (orderNumber: string) => `HH-${orderNumber}`;

/** "TA-000123", "ta 123", "123" → "TA-000123"; null when it doesn't look like a trade number of that prefix. */
export function tradeNumberQuery(raw: string, prefix: "TA" | "TO" | "TI") {
  const m = raw.trim().toUpperCase().match(new RegExp(`^(?:${prefix}[-\\s]?)?0*(\\d{1,6})$`));
  return m ? `${prefix}-${six(Number(m[1]))}` : null;
}

// ── VAT per line ─────────────────────────────────────────────────────────────
export const TRADE_VAT_BPS = 1500;

/** VAT on an ex-VAT amount, rounded half up to the cent (integer maths: no floating point). */
export const vatHalfUp = (exCents: number, vatBps = TRADE_VAT_BPS) => {
  const sign = exCents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(exCents) * vatBps + 5000) / 10000);
};

export type TradeLineTotals = { exCents: number; vatCents: number; inclCents: number };

/** One line: unit price ex VAT × quantity, VAT on the line (half up), and what it comes to. */
export function tradeLine(a: { unitCents: number; qty: number; vatBps?: number }): TradeLineTotals {
  const exCents = a.unitCents * a.qty;
  const vatCents = vatHalfUp(exCents, a.vatBps ?? TRADE_VAT_BPS);
  return { exCents, vatCents, inclCents: exCents + vatCents };
}

export type TradeTotals = {
  subtotalCents: number; // the lines, ex VAT
  deliveryCents: number; // ex VAT
  handlingCents: number; // ex VAT (click & collect)
  exCents: number; // lines + delivery + handling, ex VAT
  vatCents: number; // VAT per line, plus VAT on delivery and handling as lines of their own
  totalCents: number; // what's owed, incl. VAT
};

/** The order's totals from its lines (VAT per line) and the extras: a flat delivery fee, or a handling fee on collection. */
export function tradeTotals(lines: TradeLineTotals[], extras: number | { deliveryCents?: number; handlingCents?: number } = 0): TradeTotals {
  const e = typeof extras === "number" ? { deliveryCents: extras } : extras;
  const deliveryCents = Math.max(0, e.deliveryCents ?? 0);
  const handlingCents = Math.max(0, e.handlingCents ?? 0);
  const subtotalCents = lines.reduce((s, l) => s + l.exCents, 0);
  const vatCents = lines.reduce((s, l) => s + l.vatCents, 0) + vatHalfUp(deliveryCents) + vatHalfUp(handlingCents);
  const exCents = subtotalCents + deliveryCents + handlingCents;
  return { subtotalCents, deliveryCents, handlingCents, exCents, vatCents, totalCents: exCents + vatCents };
}

// ── Cases and minimum order ──────────────────────────────────────────────────

/** The next case multiple at or above `qty` — at least one case (a case of 1 is any quantity of at least one). */
export function caseMultiple(qty: number, caseQty: number) {
  const c = Math.max(1, Math.floor(caseQty || 1));
  const q = Math.max(0, Math.floor(qty || 0));
  return Math.max(1, Math.ceil(q / c)) * c;
}

export type TradeBasketLine = { name: string; qty: number; unitCents: number; caseQty?: number | null };

/**
 * Plain-English problems with a trade basket: nothing in it, quantities that aren't whole cases, and an order under
 * the minimum (ex VAT, after any promotion). Empty means it can be placed. `caseQty` in the options stands in for
 * lines that don't say their own.
 */
export function validateTradeBasket(lines: TradeBasketLine[], opts: { minOrderCents: number; caseQty?: number }) {
  const problems: string[] = [];
  if (!lines.length) return ["The order has no items"];
  for (const l of lines) {
    const c = Math.max(1, Math.floor(l.caseQty ?? opts.caseQty ?? 1));
    if (!Number.isInteger(l.qty) || l.qty <= 0) problems.push(`${l.name}: enter a quantity of at least ${c}`);
    else if (l.qty % c !== 0) problems.push(`${l.name} comes in cases of ${c}: order ${c}, ${2 * c}, ${3 * c}… (the next case up from ${l.qty} is ${caseMultiple(l.qty, c)})`);
  }
  const subtotal = lines.reduce((s, l) => s + Math.max(0, l.qty) * l.unitCents, 0);
  if (subtotal < opts.minOrderCents) problems.push(`Minimum order is ${zar(opts.minOrderCents)} ex VAT — this order is ${zar(subtotal)}, ${zar(opts.minOrderCents - subtotal)} short`);
  return problems;
}

// ── Delivery, handling, EFT ──────────────────────────────────────────────────

/** Courier from the DC: a flat fee ex VAT, free at or over the threshold (both from HQ → Settings → Trade). */
export const tradeDelivery = (subtotalExCents: number, s: { deliveryCents: number; freeDeliveryOverCents: number }) =>
  s.freeDeliveryOverCents > 0 && subtotalExCents >= s.freeDeliveryOverCents ? 0 : Math.max(0, s.deliveryCents);

/** Click & collect at a store: the store's handling fee ex VAT (no delivery fee). */
export const tradeHandling = (s: { collectHandlingCents: number }) => Math.max(0, s.collectHandlingCents);

/** An EFT order whose payment hasn't arrived within the hold period lapses (cancelled by the daily job). */
export const eftExpired = (order: { status: string; createdAt: Date }, now: Date, holdDays: number) =>
  order.status === "PENDING_PAYMENT" && addDays(order.createdAt, Math.max(0, holdDays)).getTime() <= now.getTime();

// ── Credit ───────────────────────────────────────────────────────────────────

export type TradeTerms = "PREPAID" | "ACCOUNT";
export type TradeAccountStatus = "PENDING" | "APPROVED" | "ON_HOLD" | "CLOSED";

export const ACCOUNT_STATUS_PROBLEM: Record<Exclude<TradeAccountStatus, "APPROVED">, string> = {
  PENDING: "This trade account hasn't been approved yet — we'll email you as soon as it is",
  ON_HOLD: "This trade account is on hold — settle the account or speak to Herbal Holland Trade to lift it",
  CLOSED: "This trade account is closed",
};

export type CreditDecision = { ok: boolean; reason?: string; availableCents: number };

/**
 * May this order go on account? Only an approved account on ACCOUNT terms, and only while what it owes, what it has
 * on open on-account orders and this order stay within its credit limit. Prepaid accounts never buy on account.
 */
export function creditDecision(a: { terms: TradeTerms; status: TradeAccountStatus; creditLimitCents: number; balanceCents: number; openOrdersCents: number; orderInclCents: number }): CreditDecision {
  const exposure = a.balanceCents + a.openOrdersCents;
  const availableCents = a.creditLimitCents - exposure;
  if (a.status !== "APPROVED") return { ok: false, reason: ACCOUNT_STATUS_PROBLEM[a.status], availableCents: 0 };
  if (a.terms !== "ACCOUNT") return { ok: false, reason: "This account buys prepaid (EFT), not on account", availableCents: 0 };
  if (a.creditLimitCents <= 0) return { ok: false, reason: "This account has no credit limit yet", availableCents: 0 };
  if (exposure + a.orderInclCents > a.creditLimitCents)
    return {
      ok: false,
      availableCents,
      reason: `Over the credit limit: ${zar(Math.max(0, availableCents))} available on a limit of ${zar(a.creditLimitCents)} (owing ${zar(a.balanceCents)}${a.openOrdersCents ? `, ${zar(a.openOrdersCents)} on open orders` : ""}) — this order is ${zar(a.orderInclCents)}`,
    };
  return { ok: true, availableCents };
}

// ── Ledger: ageing and statements ────────────────────────────────────────────

export type TradeLedgerKind = "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "ADJUSTMENT";
export type LedgerEntryLike = {
  kind: TradeLedgerKind;
  cents: number;
  createdAt: Date;
  dueAt?: Date | null;
  reference?: string | null;
  note?: string | null;
  tradeOrderId?: string | null; // the order an entry is for: a payment names the order it settles
  saleId?: string | null; // the sale an invoice is for — and the sale a credit note credits
};

export type Ageing = { current: number; d30: number; d60: number; d90plus: number; overdue: number; total: number };

const DAY = 86_400_000;

/**
 * Open invoices after credits are applied. Debits are invoices and positive adjustments. A credit that names an order
 * or a sale (an EFT for an order, a credit note for a sale, a payment HQ recorded against an invoice) settles that
 * debit first; whatever is left — and every credit without a reference — is applied oldest-due-first (FIFO).
 */
export function openInvoices(entries: LedgerEntryLike[]) {
  const debits = entries
    .filter((e) => e.cents > 0)
    .map((e) => ({ ...e, dueAt: e.dueAt ?? e.createdAt, openCents: e.cents }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
  let pool = 0;
  for (const c of entries.filter((e) => e.cents < 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    let left = -c.cents;
    if (c.tradeOrderId || c.saleId)
      for (const d of debits) {
        if (left <= 0) break;
        if (!((c.tradeOrderId && d.tradeOrderId === c.tradeOrderId) || (c.saleId && d.saleId === c.saleId))) continue;
        const take = Math.min(left, d.openCents);
        d.openCents -= take;
        left -= take;
      }
    pool += left;
  }
  for (const d of debits) {
    if (pool <= 0) break;
    const take = Math.min(pool, d.openCents);
    d.openCents -= take;
    pool -= take;
  }
  return { open: debits.filter((d) => d.openCents > 0), unappliedCreditCents: pool };
}

/**
 * Age analysis at `now`: what's open on each invoice (FIFO) by how far past its due date it is — current (not yet
 * due), 1–30 days, 31–60 days, and the 90+ column (more than 60 days past due). Unapplied credit (an overpayment or
 * credit note) shows as negative current, so `total` is always the balance.
 */
export function ageing(entries: LedgerEntryLike[], now = new Date()): Ageing {
  const { open, unappliedCreditCents } = openInvoices(entries);
  const a: Ageing = { current: unappliedCreditCents ? -unappliedCreditCents : 0, d30: 0, d60: 0, d90plus: 0, overdue: 0, total: 0 };
  for (const d of open) {
    const days = Math.floor((now.getTime() - d.dueAt.getTime()) / DAY);
    if (days <= 0) a.current += d.openCents;
    else if (days <= 30) a.d30 += d.openCents;
    else if (days <= 60) a.d60 += d.openCents;
    else a.d90plus += d.openCents;
  }
  a.overdue = a.d30 + a.d60 + a.d90plus;
  a.total = a.current + a.overdue;
  return a;
}

/** Cents on invoices past due by more than `graceDays` at `now`, after FIFO application: the overdue-hold trigger. */
export function overdueBeyondGrace(entries: LedgerEntryLike[], now: Date, graceDays: number) {
  return openInvoices(entries)
    .open.filter((d) => now.getTime() - d.dueAt.getTime() > graceDays * DAY)
    .reduce((s, d) => s + d.openCents, 0);
}

export type StatementLine = { at: Date; kind: TradeLedgerKind; reference: string | null; note: string | null; debitCents: number; creditCents: number; balanceCents: number };
export type TradeStatement = { from: Date; to: Date; asAt: Date; opening: number; lines: StatementLine[]; closing: number; ageing: Ageing };

/**
 * The account's statement for [from, to): the opening balance, every entry with a running balance, the closing balance
 * and its age analysis at the period's end — or now, for the month still running (nothing is past due early).
 */
export function tradeStatement(entries: LedgerEntryLike[], period: { from: Date; to: Date }, now = new Date()): TradeStatement {
  const asAt = new Date(Math.min(period.to.getTime(), now.getTime()));
  const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const opening = sorted.filter((e) => e.createdAt < period.from).reduce((s, e) => s + e.cents, 0);
  let balance = opening;
  const lines: StatementLine[] = sorted
    .filter((e) => e.createdAt >= period.from && e.createdAt < period.to)
    .map((e) => {
      balance += e.cents;
      return { at: e.createdAt, kind: e.kind, reference: e.reference ?? null, note: e.note ?? null, debitCents: Math.max(0, e.cents), creditCents: Math.max(0, -e.cents), balanceCents: balance };
    });
  return { from: period.from, to: period.to, asAt, opening, lines, closing: balance, ageing: ageing(sorted.filter((e) => e.createdAt < period.to), asAt) };
}

/** "2026-09" → the SAST month [from, to) and its label. */
export function statementMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must be YYYY-MM");
  const [y, m] = month.split("-").map(Number);
  const from = new Date(`${month}-01T00:00:00+02:00`);
  const to = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00+02:00`);
  return { from, to };
}

/** The month before the one `now` (SAST) falls in: what a statement run on the statement day covers. */
export function previousMonth(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" }).format(now);
  const [y, m] = parts.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const dayOfMonthSA = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", day: "numeric" }).format(now));

// ── What may be traded ───────────────────────────────────────────────────────

/** Every class a trade account may be approved for: everything but licensed medicines. */
export const TRADE_CLASSES: RegClass[] = REG_CLASSES.filter((c) => c !== "THC");

// The allow-list rule itself lives with the other compliance rules (and evaluateTradeBasket) in ./compliance.
export { tradeAllowed, tradeProblem } from "./compliance";

// ── The application form ─────────────────────────────────────────────────────

export const TRADE_KINDS = {
  PHARMACY: "Pharmacy",
  RETAILER: "Independent retailer",
  CAFE: "Café or restaurant",
  PRACTICE: "Wellness or health practice",
  ONLINE_SHOP: "Online shop",
  DISTRIBUTOR: "Wholesaler or distributor",
  OTHER: "Other business",
} as const;
export type TradeKind = keyof typeof TRADE_KINDS;
export const isTradeKind = (v: unknown): v is TradeKind => typeof v === "string" && v in TRADE_KINDS;
/** The kind of business mid-sentence, with its article: "an independent retailer", and "a business" for any other. */
export const tradeKindPhrase = (kind: string) => {
  if (!isTradeKind(kind) || kind === "OTHER") return "a business";
  const name = TRADE_KINDS[kind].toLowerCase();
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
};

export const TRADE_LIMITS = { name: 120, email: 254, address: 160, notes: 1_000, reference: 60 } as const;

export type TradeField =
  | "legalName" | "name" | "kind" | "regNumber" | "vatNumber" | "email" | "phone"
  | "addressLine" | "suburb" | "city" | "province" | "postalCode"
  | "deliveryLine" | "deliverySuburb" | "deliveryCity" | "deliveryProvince" | "deliveryPostalCode"
  | "classes" | "buyerName" | "buyerEmail" | "buyerPhone" | "notes" | "adult" | "terms";
/** What the form sent: untrusted text, checkboxes as "on", classes as an array (or comma-separated); each licence's number
 * and expiry as typed, and which licences came with a document attached (the files themselves go to the server). */
export type RawTradeApplication = Partial<Record<TradeField, string | boolean | string[] | null | undefined>> & {
  licences?: Partial<Record<string, { number?: string | null; expiresAt?: string | null }>>;
  licenceFiles?: readonly string[];
};
/** A licence field's error key: `licence.PHARMACY_LICENCE.number`, `….expiresAt`, `….file`. */
export type LicenceField = `licence.${TradeLicenceKind}.${"number" | "expiresAt" | "file"}`;
export type CleanTradeApplication = {
  legalName: string;
  name: string;
  kind: TradeKind;
  regNumber: string | null;
  vatNumber: string | null;
  email: string;
  phone: string; // +27…
  addressLine: string;
  suburb: string | null;
  city: string;
  province: ProvinceCode;
  postalCode: string;
  delivery: { addressLine: string; suburb: string | null; city: string; province: ProvinceCode; postalCode: string } | null;
  classes: RegClass[];
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  notes: string | null;
  licences: { kind: TradeLicenceKind; number: string; expiresAt: Date | null }[]; // what the kind of business and its ranges require
};
export type TradeErrors = Partial<Record<TradeField | LicenceField, string>>;
export type TradeApplicationCheck = { ok: true; data: CleanTradeApplication } | { ok: false; fields: TradeErrors };

const text = (v: unknown) => (typeof v === "string" ? v : "");
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const line = (v: unknown) => text(v).replace(CONTROL, "").replace(/\s+/g, " ").trim();
const ticked = (v: unknown) => v === true || (typeof v === "string" && ["on", "true", "yes", "1"].includes(v.trim().toLowerCase()));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A South African business number (landline or mobile) as +27XXXXXXXXX; null when it isn't one. */
export function normaliseTradePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+27")) d = d.slice(3);
  else if (d.startsWith("27") && d.length === 11) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^[1-8]\d{8}$/.test(d) ? `+27${d}` : null;
}

/** CIPC registration numbers: YYYY/NNNNNN/NN. Returned tidy, or null when it isn't one. */
export const normaliseRegNumber = (raw: string) => {
  const m = raw.replace(/\s/g, "").toUpperCase().match(/^(\d{4})\/(\d{6})\/(\d{2})$/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null;
};
/** SARS VAT numbers: ten digits starting with 4. */
export const normaliseVatNumber = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return /^4\d{9}$/.test(d) ? d : null;
};

export const normaliseEmail = (raw: string) => line(raw).toLowerCase();

const classList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => line(x)) : line(v) ? line(v).split(/[,\s]+/) : []);

/** Checks and tidies a trade application. Every problem is a plain message against its field. */
export function validateTradeApplication(raw: RawTradeApplication, now = new Date()): TradeApplicationCheck {
  const f: TradeErrors = {};
  const legalName = line(raw.legalName);
  const name = line(raw.name) || legalName;
  const kindRaw = line(raw.kind).toUpperCase();
  const email = normaliseEmail(text(raw.email));
  const phone = normaliseTradePhone(text(raw.phone));
  const addressLine = line(raw.addressLine);
  const suburb = line(raw.suburb) || null;
  const city = line(raw.city);
  const province = line(raw.province).toUpperCase();
  const postalCode = line(raw.postalCode);
  const buyerName = line(raw.buyerName);
  const buyerEmail = normaliseEmail(text(raw.buyerEmail)) || email;
  const buyerPhoneRaw = line(raw.buyerPhone);
  const buyerPhone = buyerPhoneRaw ? normaliseTradePhone(buyerPhoneRaw) : null;
  const regRaw = line(raw.regNumber);
  const vatRaw = line(raw.vatNumber);
  const notes = line(raw.notes).slice(0, TRADE_LIMITS.notes) || null;
  const classes = [...new Set(classList(raw.classes).map((c) => c.toUpperCase()))];

  if (!legalName) f.legalName = "Enter the registered (legal) name of the business";
  else if (legalName.length > TRADE_LIMITS.name) f.legalName = `Keep the legal name under ${TRADE_LIMITS.name} characters`;
  if (name.length > TRADE_LIMITS.name) f.name = `Keep the trading name under ${TRADE_LIMITS.name} characters`;
  if (!isTradeKind(kindRaw)) f.kind = "Choose what kind of business this is";
  if (!email || !EMAIL.test(email) || email.length > TRADE_LIMITS.email) f.email = "Enter the billing email address (pro formas, invoices and statements go here)";
  if (!phone) f.phone = "Enter a South African phone number";
  if (!addressLine) f.addressLine = "Enter the street address";
  else if (addressLine.length > TRADE_LIMITS.address) f.addressLine = `Keep the address under ${TRADE_LIMITS.address} characters`;
  if (!city) f.city = "Enter the city or town";
  if (!(province in PROVINCES)) f.province = "Choose the province";
  if (!/^\d{4}$/.test(postalCode)) f.postalCode = "Enter the four-digit postal code";
  const regNumber = regRaw ? normaliseRegNumber(regRaw) : null;
  if (regRaw && !regNumber) f.regNumber = "Company registration numbers look like 2015/123456/07 — leave it blank if the business isn't registered";
  const vatNumber = vatRaw ? normaliseVatNumber(vatRaw) : null;
  if (vatRaw && !vatNumber) f.vatNumber = "VAT numbers are ten digits starting with 4 — leave it blank if the business isn't a VAT vendor";
  if (!classes.length) f.classes = "Tick at least one range you'd like to buy";
  else if (classes.includes("THC")) f.classes = "Licensed medicines aren't available to trade customers";
  else if (classes.some((c) => !TRADE_CLASSES.includes(c as RegClass))) f.classes = "Choose ranges from the list";
  if (!buyerName) f.buyerName = "Enter the name of the person who'll place orders";
  else if (buyerName.length > TRADE_LIMITS.name) f.buyerName = `Keep the buyer's name under ${TRADE_LIMITS.name} characters`;
  if (!EMAIL.test(buyerEmail) || buyerEmail.length > TRADE_LIMITS.email) f.buyerEmail = "Enter the buyer's email address — they sign in with a code sent here";
  if (buyerPhoneRaw && !buyerPhone) f.buyerPhone = "Enter a South African phone number, or leave it blank";
  if (!ticked(raw.adult)) f.adult = "Confirm that everyone who orders for this business is 18 or older";
  if (!ticked(raw.terms)) f.terms = "Accept the trade terms to apply";

  // The licences this kind of business needs for these ranges: each with its number (a company registration certificate
  // uses the registration number above; a retailer without one is a sole proprietor, who gives the SARS registration),
  // its expiry when it lapses, and the document.
  const licences: CleanTradeApplication["licences"] = [];
  if (isTradeKind(kindRaw) && !f.classes) {
    for (const { kind } of requiredLicences(kindRaw, classes, !!regRaw)) {
      const typed = raw.licences?.[kind] ?? {};
      if (kind === "CIPC_REGISTRATION") {
        if (!regRaw) f.regNumber = "Enter the company registration number — this kind of business needs it";
      }
      const check = checkLicenceInput(kind, kind === "CIPC_REGISTRATION" ? { number: regNumber ?? regRaw, expiresAt: null } : { number: typed.number, expiresAt: TRADE_LICENCES[kind].expires ? typed.expiresAt : null }, now);
      if (!check.ok) {
        if (check.fields.number && kind !== "CIPC_REGISTRATION") f[`licence.${kind}.number`] = check.fields.number;
        if (check.fields.expiresAt) f[`licence.${kind}.expiresAt`] = check.fields.expiresAt;
      } else licences.push({ kind, number: check.number, expiresAt: check.expiresAt });
      if (!raw.licenceFiles?.includes(kind)) f[`licence.${kind}.file`] = `Attach the ${licenceInSentence(kind)} (a PDF or a photo)`;
    }
  }

  const dLine = line(raw.deliveryLine);
  let delivery: CleanTradeApplication["delivery"] = null;
  if (dLine) {
    const dProvince = line(raw.deliveryProvince).toUpperCase();
    const dCity = line(raw.deliveryCity);
    const dPostal = line(raw.deliveryPostalCode);
    if (dLine.length > TRADE_LIMITS.address) f.deliveryLine = `Keep the delivery address under ${TRADE_LIMITS.address} characters`;
    if (!dCity) f.deliveryCity = "Enter the delivery city or town";
    if (!(dProvince in PROVINCES)) f.deliveryProvince = "Choose the delivery province";
    if (!/^\d{4}$/.test(dPostal)) f.deliveryPostalCode = "Enter the delivery postal code";
    delivery = { addressLine: dLine, suburb: line(raw.deliverySuburb) || null, city: dCity, province: dProvince as ProvinceCode, postalCode: dPostal };
  }

  if (Object.keys(f).length) return { ok: false, fields: f };
  return {
    ok: true,
    data: {
      legalName, name, kind: kindRaw as TradeKind, regNumber, vatNumber, email, phone: phone!, addressLine, suburb, city, province: province as ProvinceCode, postalCode,
      delivery, classes: classes as RegClass[], buyerName, buyerEmail, buyerPhone, notes, licences,
    },
  };
}

/** The application form's text fields, as named in the form. */
export const TRADE_TEXT_FIELDS = [
  "legalName", "name", "kind", "regNumber", "vatNumber", "email", "phone", "addressLine", "suburb", "city", "province", "postalCode",
  "deliveryLine", "deliverySuburb", "deliveryCity", "deliveryProvince", "deliveryPostalCode", "buyerName", "buyerEmail", "buyerPhone", "notes",
] as const satisfies readonly TradeField[];

/** A licence input's form name: `licence.PHARMACY_LICENCE.number`, `….expiresAt`, `….file`. */
export const licenceInputName = (kind: TradeLicenceKind, part: "number" | "expiresAt" | "file") => `licence.${kind}.${part}` as LicenceField;

/**
 * The application as the form posts it. The browser's check before sending and the server action read the form the
 * same way, so a typing mistake is caught before any document leaves the browser.
 */
export function applicationFromForm(form: FormData): RawTradeApplication {
  const get = (k: string) => String(form.get(k) ?? "").slice(0, 2_000);
  const raw: RawTradeApplication = Object.fromEntries(TRADE_TEXT_FIELDS.map((k) => [k, get(k)]));
  raw.classes = form.getAll("classes").map((c) => String(c).slice(0, 20));
  raw.adult = form.get("adult") === "on";
  raw.terms = form.get("terms") === "on";
  raw.licences = Object.fromEntries(TRADE_LICENCE_KINDS.map((k) => [k, { number: get(licenceInputName(k, "number")), expiresAt: get(licenceInputName(k, "expiresAt")) }]));
  raw.licenceFiles = TRADE_LICENCE_KINDS.filter((k) => {
    const f = form.get(licenceInputName(k, "file"));
    return typeof f === "object" && f !== null && f.size > 0;
  });
  return raw;
}

/** One line for an address block: "1 Burnett St, Hatfield, Pretoria, 0083". */
export const addressLineOf = (a: { addressLine?: string | null; suburb?: string | null; city?: string | null; postalCode?: string | null }) =>
  [a.addressLine, a.suburb, a.city, a.postalCode].filter((x): x is string => !!x).join(", ");

/** The buyer block a WHOLESALE sale carries for the full tax invoice (VAT Act s20): legal name, address, VAT number. */
export const tradeBuyerBlock = (a: { legalName: string; name: string; vatNumber?: string | null; addressLine: string; suburb?: string | null; city: string; postalCode: string }) => ({
  name: a.name && a.name !== a.legalName ? `${a.legalName} (trading as ${a.name})` : a.legalName,
  address: addressLineOf(a),
  ...(a.vatNumber ? { vatNumber: a.vatNumber } : {}),
});

// ── Range search ─────────────────────────────────────────────────────────────

/**
 * The words a trade range search must all match (each in a name, SKU or barcode): the query's words split on hyphens
 * (so "calm-oil" finds "Calm oil") plus the numbers it measures ("calm 600" → "calm", "600"; "cbd 30ml" → "cbd", "30").
 */
export function rangeSearchTerms(q: string): string[] {
  const p = parseQuery(q);
  const words = p.terms.flatMap((t) => t.split(/[-']+/)).filter((w) => w.length > 1);
  const numbers = p.measures.map((m) => m.raw.match(/\d+(?:[.,]\d+)?/)?.[0]).filter((n): n is string => !!n);
  return [...new Set([...words, ...numbers])].slice(0, 8);
}
