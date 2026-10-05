// HQ-side and network posting rules, pure: what the franchise statement and its payments put in both books, and what
// online payments, gift vouchers, the points HQ gives and the trade ledger put in HQ's. Lines are signed (debit
// positive, credit negative) and each set balances. src/server/ledger/sources/hq.ts gathers the facts and posts these.
import { netLines, type Line } from "./ledger";

// ── The franchise statement ─────────────────────────────────────────────────────

/** The statement's own figures (src/lib/statement.ts): fees ex VAT, the VAT on them, points issued and My Deals. */
export type StatementFigures = { royalty: number; levy: number; ecom: number; feesVat: number; pointsIssuedCents: number; offersFundedCents: number };

/**
 * A store's monthly statement, in both books: the fees (royalty, marketing levy, e-commerce commission) plus VAT, the
 * points it issued (into the network pool) and the My Deals HQ funds. HQ takes the levy as income (a supply it charges
 * VAT on, so it belongs in the VAT201's standard-rated supplies) and My Deals as its marketing cost; ring-fencing what's
 * unspent in the marketing fund, when the franchise agreements ask for it, is a year-end journal. The franchisee claims
 * the VAT on the fees only when it and HQ are both VAT vendors (otherwise it's a cost); HQ owes it to SARS only when it
 * is a vendor. The statement's other lines (what HQ collected, points redeemed, stock) are posted where they happen.
 */
export function statementLines(s: StatementFigures & { storeId: string; franchiseeId: string }, vendor: { franchisee: boolean; hq: boolean }) {
  const fees = s.royalty + s.levy + s.ecom + s.feesVat;
  const at = (key: string, cents: number, partyId: string | null = null): Line => ({ key, cents, storeId: s.storeId, partyId });
  const franchisee = netLines([
    at("fees.royalty", s.royalty),
    at("fees.levy", s.levy),
    at("fees.ecom", s.ecom),
    at(vendor.franchisee && vendor.hq ? "vat.input" : "vat.nonclaimable", s.feesVat),
    at("points.issued", s.pointsIssuedCents),
    at("offers.recovered", -s.offersFundedCents),
    at("hq", s.offersFundedCents - fees - s.pointsIssuedCents),
  ]);
  const hq = netLines([
    at("franchisees", fees + s.pointsIssuedCents - s.offersFundedCents, s.franchiseeId),
    at("royalty", -s.royalty),
    at("levy", -s.levy),
    at("ecom", -s.ecom),
    at("offers.funded", s.offersFundedCents),
    at(vendor.hq ? "vat.output" : "other.income", -s.feesVat),
    at("points", -s.pointsIssuedCents),
  ]);
  return { franchisee, hq };
}

/**
 * A payment settling a statement, in both books, against the current accounts: positive when the store paid HQ (from
 * its bank into HQ's), negative when HQ paid the store.
 */
export function statementPaymentLines(p: { amountCents: number; storeId: string; franchiseeId: string }) {
  const at = (key: string, cents: number, partyId: string | null = null): Line => ({ key, cents, storeId: p.storeId, partyId });
  return {
    franchisee: netLines([at("hq", p.amountCents), at("bank", -p.amountCents)]),
    hq: netLines([at("bank", p.amountCents), at("franchisees", -p.amountCents, p.franchiseeId)]),
  };
}

/**
 * What's still to settle on a statement, signed like its net (positive: HQ pays the store; negative: the store pays
 * HQ). A payment from the store (positive) brings a negative net up to zero; one from HQ (negative) brings a positive
 * net down.
 */
export const statementOutstanding = (netCents: number, payments: { amountCents: number }[]) => netCents + payments.reduce((s, p) => s + p.amountCents, 0);

// ── Online payments and gift vouchers (HQ's books) ───────────────────────────────

/** Money through the online gateway for an order: in (positive) until the store fulfils it; a refund (negative) out. */
export const onlinePaymentLines = (cents: number, storeId: string | null = null): Line[] =>
  netLines([{ key: "gateway", cents, storeId }, { key: "prepaid", cents: -cents, storeId }]);

/** A gift voucher: sold through the gateway (owed to whoever holds it), and what's left on it when it expires (breakage). */
export const voucherLines = (v: { soldCents?: number; expiredCents?: number }): Line[] =>
  netLines([
    { key: "gateway", cents: v.soldCents ?? 0 },
    { key: "vouchers", cents: (v.expiredCents ?? 0) - (v.soldCents ?? 0) },
    { key: "breakage", cents: -(v.expiredCents ?? 0) },
  ]);

type OrderEvent = { status: string; at: string };

/** When an online order was paid: its move out of PENDING_PAYMENT (an order placed already paid: when it was placed). */
export function orderPaidAt(events: OrderEvent[], createdAt: Date) {
  const i = events.findIndex((e) => e.status === "PENDING_PAYMENT");
  const paid = i < 0 ? null : events.slice(i + 1).find((e) => e.status === "PLACED" || e.status === "COMPLETED");
  return paid ? new Date(paid.at) : createdAt;
}

/** When an order was cancelled, or null. */
export function orderCancelledAt(events: OrderEvent[]) {
  const e = events.findLast((x) => x.status === "CANCELLED");
  return e ? new Date(e.at) : null;
}

// ── Rewards points (HQ's books) ───────────────────────────────────────────────────

/**
 * Points HQ gives and pays for: welcome, referral, birthday and goodwill bonuses, and adjustments (balances brought
 * forward). Points a store issues on a sale are charged to it on its statement; points redeemed are a tender on the
 * sale; reversals undo one of those two, so they post with them.
 */
export const HQ_POINT_KINDS: readonly string[] = ["SIGNUP", "REFERRAL", "BIRTHDAY", "BONUS", "ADJUST"];
/** Kinds the daily `points` source posts: what HQ gives, and points that expire or are forfeited. */
export const POINTS_SOURCE_KINDS: readonly string[] = [...HQ_POINT_KINDS, "EXPIRE"];

/**
 * A day of points in HQ's books: given by HQ (and earned at stores HQ owns, which have no statement) into what's owed
 * to members, at HQ's cost; the value of points that expired or were forfeited out of it, as breakage.
 */
export function pointsLines(p: { givenCents: number; expiredCents: number; ownStores?: { storeId: string; cents: number }[] }): Line[] {
  return netLines([
    { key: "points.hq", cents: p.givenCents },
    { key: "points", cents: p.expiredCents - p.givenCents },
    { key: "breakage", cents: -p.expiredCents },
    ...(p.ownStores ?? []).flatMap((s) => [{ key: "points.hq", cents: s.cents, storeId: s.storeId }, { key: "points", cents: -s.cents, storeId: s.storeId }]),
  ]);
}

// ── The trade ledger (HQ's books) ─────────────────────────────────────────────────

/**
 * A trade-ledger entry, mirrored on the account's trade debtor by its own signed amount: a payment against the bank, a
 * credit note or adjustment HQ made against bad debts. Invoices (and credit notes refunding a sale) are tenders on the
 * sale, posted with the store's day — none here.
 */
export function tradeEntryLines(e: { kind: string; cents: number; tradeAccountId: string }): Line[] {
  if (e.kind === "INVOICE") return [];
  return netLines([{ key: "debtors", cents: e.cents, partyId: e.tradeAccountId }, { key: e.kind === "PAYMENT" ? "bank" : "bad.debts", cents: -e.cents }]);
}

/** An EFT paid ahead for a trade order: in the bank, held until it ships (positive); refunded when it's cancelled (negative). */
export const tradeEftLines = (cents: number, storeId: string | null = null): Line[] =>
  netLines([{ key: "bank", cents, storeId }, { key: "prepaid", cents: -cents, storeId }]);
