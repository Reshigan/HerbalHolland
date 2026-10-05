// Store-side posting rules, pure: what a store's money events put in the books, as ledger lines (debit positive,
// credit negative). A store's lines go to its company's books; what HQ collected, funds or supplies is mirrored in
// HQ's books on the franchisee's current account. A store HQ owns (its DCs) posts straight into HQ's books, with no
// current-account legs. src/server/ledger/sources/store.ts gathers the facts and posts these.
import { expenseKey, netLines, supplierParty, type Line } from "./ledger";
import { zar } from "./money";

/** One company's lines for a source: they balance on their own. */
export type CompanyLines = { companyId: string; lines: Line[] };

/** A store as the books see it: whose it is, whether HQ owns it, and whether its company is a VAT vendor. */
export type StoreRef = { storeId: string; companyId: string; hqOwned: boolean; vendor: boolean };

/** Lines grouped and netted per company; companies left with nothing are dropped. */
function byCompany(entries: { companyId: string; line: Line }[]): CompanyLines[] {
  const by = new Map<string, Line[]>();
  for (const e of entries) by.set(e.companyId, [...(by.get(e.companyId) ?? []), e.line]);
  return [...by.entries()].map(([companyId, lines]) => ({ companyId, lines: netLines(lines) })).filter((c) => c.lines.length);
}

// ── Trading day ─────────────────────────────────────────────────────────────────

/** A store's day in one channel, from its DailyStoreStat row (VAT incl., refunds netted in). */
export type DayChannel = {
  channel: "POS" | "ONLINE" | "WHOLESALE";
  grossCents: number;
  vatCents: number;
  cardCents: number;
  cashCents: number;
  payshapCents: number;
  eftCents: number;
  loyaltyCents: number;
  onlineCents: number;
  accountCents: number;
};
/** Tenders on the day's sales and refunds, by method. `collectedByHq`: a trade order's EFT, paid to HQ. */
export type DayTender = { method: string; cents: number; tradeAccountId?: string | null; collectedByHq?: boolean };
/** The day's stock movements of one type at their cost: Σ qty × unitCostCents (qty is signed, positive in). */
export type DayStock = { type: string; cents: number };

const SALES: Record<DayChannel["channel"], string> = { POS: "sales.pos", ONLINE: "sales.online", WHOLESALE: "sales.trade" };
/** What each kind of stock movement is charged against (transfers belong to the stock orders). */
const STOCK_CONTRA: Record<string, string> = { SALE: "cogs", ONLINE: "cogs", REFUND: "cogs", ADJUST: "stock.loss", COUNT: "stock.count", RECEIVE: "grni" };
export const DAY_STOCK_TYPES = Object.keys(STOCK_CONTRA);

/** HQ's account for a tender it collected or funds; null for the store's own money. */
export function hqTenderKey(t: Pick<DayTender, "method" | "collectedByHq">) {
  if (t.method === "ONLINE" || (t.method === "EFT" && t.collectedByHq)) return "prepaid";
  return ({ VOUCHER: "vouchers", LOYALTY: "points", ACCOUNT: "debtors" } as Record<string, string>)[t.method] ?? null;
}

/**
 * A store's trading day. In its company's books: sales ex VAT by channel and the VAT on them; the tenders (cash, card,
 * PayShap and till EFT to the bank, and everything HQ collected or funds — online, vouchers, trade orders, trade on
 * account and points — to its Herbal Holland current account, exactly the rollup's online + account + points); a gap
 * between the tenders and the takings to cash over and short; the day's stock movements at cost. In HQ's books, what
 * it collected or funds by HQ account (from the day's payments, which must agree with the rollup to the cent),
 * against the franchisee's current account.
 */
export function storeDayLines(a: { store: StoreRef; hqCompanyId: string; label: string; days: DayChannel[]; tenders: DayTender[]; stock: DayStock[] }): CompanyLines[] {
  const { storeId, companyId, hqOwned } = a.store;
  const line = (key: string, cents: number, partyId: string | null = null): Line => ({ key, cents, storeId, partyId });
  const own: Line[] = [];
  const hq: Line[] = [];
  let gross = 0, tendered = 0, viaHq = 0;
  for (const d of a.days) {
    const hqPart = d.onlineCents + d.accountCents + d.loyaltyCents;
    own.push(line(SALES[d.channel], d.vatCents - d.grossCents), line("vat.output", -d.vatCents));
    own.push(line("cash", d.cashCents), line("card", d.cardCents), line("bank", d.payshapCents + d.eftCents));
    gross += d.grossCents;
    tendered += d.cashCents + d.cardCents + d.payshapCents + d.eftCents + hqPart;
    viaHq += hqPart;
  }
  own.push(line("cash.diff", gross - tendered));
  let broken = 0;
  for (const t of a.tenders) {
    const key = hqTenderKey(t);
    if (!key) continue;
    hq.push(line(key, t.cents, key === "debtors" ? (t.tradeAccountId ?? null) : null));
    broken += t.cents;
  }
  if (broken !== viaHq)
    throw new Error(`${a.label}: the payments HQ collected or funds come to ${zar(broken)}, the day's rollup to ${zar(viaHq)} — out by ${zar(broken - viaHq)}`);
  if (hqOwned) own.push(...hq);
  else own.push(line("hq", viaHq)), hq.push(line("franchisees", -viaHq, companyId));
  for (const m of a.stock) {
    const contra = STOCK_CONTRA[m.type];
    if (contra) own.push(line("stock", m.cents), line(contra, -m.cents));
  }
  return byCompany([...own.map((l) => ({ companyId, line: l })), ...(hqOwned ? [] : hq.map((l) => ({ companyId: a.hqCompanyId, line: l })))]);
}

// ── Cash, expenses and outside suppliers (one store, one company) ─────────────────

/** A cash-up: counted less expected, into or out of cash against cash over and short. */
export const shiftLines = (a: { storeId: string; varianceCents: number }): Line[] =>
  netLines([{ key: "cash", cents: a.varianceCents, storeId: a.storeId }, { key: "cash.diff", cents: -a.varianceCents, storeId: a.storeId }]);

/** Cash banked. */
export const depositLines = (a: { storeId: string; amountCents: number }): Line[] =>
  netLines([{ key: "bank", cents: a.amountCents, storeId: a.storeId }, { key: "cash", cents: -a.amountCents, storeId: a.storeId }]);

/** An expense paid from the bank: ex VAT plus input VAT, or the whole amount for a non-vendor (its VAT stays in the cost). */
export function expenseLines(a: { storeId: string; category: string; amountCents: number; vatCents: number; vendor: boolean }): Line[] {
  const vat = a.vendor ? a.vatCents : 0;
  return netLines([
    { key: expenseKey(a.category), cents: a.amountCents - vat, storeId: a.storeId },
    { key: "vat.input", cents: vat, storeId: a.storeId },
    { key: "bank", cents: -a.amountCents, storeId: a.storeId },
  ]);
}

/** An outside supplier's invoice: charged to its account (other expenses unless chosen), owed to the supplier. */
export function supplierInvoiceLines(a: { storeId: string; supplierName: string; accountId?: string | null; totalCents: number; vatCents: number; vendor: boolean }): Line[] {
  const vat = a.vendor ? a.vatCents : 0;
  return netLines([
    { ...(a.accountId ? { accountId: a.accountId } : { key: "exp.OTHER" }), cents: a.totalCents - vat, storeId: a.storeId },
    { key: "vat.input", cents: vat, storeId: a.storeId },
    { key: "creditors", cents: -a.totalCents, storeId: a.storeId, partyId: supplierParty(a.supplierName) },
  ]);
}

/** Paying it from the bank. */
export const supplierPaymentLines = (a: { storeId: string; supplierName: string; totalCents: number }): Line[] =>
  netLines([{ key: "creditors", cents: a.totalCents, storeId: a.storeId, partyId: supplierParty(a.supplierName) }, { key: "bank", cents: -a.totalCents, storeId: a.storeId }]);

// ── Stock orders ─────────────────────────────────────────────────────────────────

/** Shipped: the seller's stock goes into transit at its cost. */
export const stockShipLines = (a: { storeId: string; costCents: number }): Line[] =>
  netLines([{ key: "transit", cents: a.costCents, storeId: a.storeId }, { key: "stock", cents: -a.costCents, storeId: a.storeId }]);

/**
 * Received. The buyer takes the stock in at the agreed price and owes HQ what it's invoiced (VAT incl.), claiming
 * the VAT only when both sides are VAT vendors. The seller is owed the same through HQ and sells it — revenue and
 * VAT, the cost of what arrived, and what was shipped but never arrived as a loss in transit. HQ carries the trade
 * on its franchisee accounts (debit the buyer, credit the seller); a DC (or any store HQ owns) is its own side of it.
 * Between two stores of one company it's a transfer, not a sale: the VAT legs meet in transfers between own stores
 * and the agreed price less cost is a transfer price difference.
 */
export function stockReceiveLines(a: {
  hqCompanyId: string;
  buyer: StoreRef;
  seller: StoreRef;
  receivedCents: number; // what arrived, at the agreed price ex VAT
  valueCents: number; // what the buyer is invoiced for it, VAT incl. (receivedValue)
  shippedCostCents: number; // the seller's cost of everything shipped
  receivedCostCents: number; // … of the units that arrived
}): CompanyLines[] {
  const { buyer: b, seller: s, receivedCents: ex, valueCents: value, receivedCostCents: cost } = a;
  const vat = value - ex;
  const entries: { companyId: string; line: Line }[] = [];
  const add = (who: StoreRef, key: string, cents: number) => entries.push({ companyId: who.companyId, line: { key, cents, storeId: who.storeId } });
  const settle = (who: StoreRef, cents: number) => {
    if (who.hqOwned) return;
    add(who, "hq", cents);
    entries.push({ companyId: a.hqCompanyId, line: { key: "franchisees", cents: -cents, storeId: who.storeId, partyId: who.companyId } });
  };
  add(b, "stock", ex);
  settle(b, -value);
  settle(s, value);
  add(s, "stock.transit", a.shippedCostCents - cost);
  add(s, "transit", -a.shippedCostCents);
  if (b.companyId === s.companyId) {
    if (!b.hqOwned) add(b, "interstore", vat), add(s, "interstore", -vat); // HQ's own stores settle nothing, so carry no VAT legs
    add(s, "transfer.diff", cost - ex);
  } else {
    add(b, b.vendor && s.vendor ? "vat.input" : "vat.nonclaimable", vat);
    add(s, s.hqOwned ? "sales.wholesale" : "sales.network", -(s.vendor ? ex : value));
    add(s, "vat.output", -(s.vendor ? vat : 0));
    add(s, "cogs", cost);
  }
  return byCompany(entries);
}
