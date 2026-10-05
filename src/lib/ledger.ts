// General ledger rules, pure: the chart-of-accounts template, posting-line arithmetic, months and VAT periods.
// Money is integer cents; a line's amount is a debit when positive and a credit when negative, and a journal's lines
// sum to zero. The services in src/server/ledger post with these.

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export type Party = "SUPPLIER" | "TRADE_ACCOUNT" | "COMPANY";
type ChartRow = { key?: string; code: string; name: string; type: AccountType; party?: Party; only?: "HQ" | "FRANCHISEE" };

/**
 * The South African retail-franchise chart every company starts with. Rows with a key are system accounts the posting
 * rules use (renamable, never removed); the others are there for manual and recurring journals. HQ-only rows are the
 * franchisor's side of the network (distribution, online collections, vouchers, points, trade debtors, fees);
 * franchisee-only rows are its mirror.
 */
export const CHART: ChartRow[] = [
  { key: "bank", code: "1000", name: "Bank", type: "ASSET" },
  { key: "cash", code: "1050", name: "Cash on hand (tills and safe)", type: "ASSET" },
  { key: "card", code: "1100", name: "Card payments to be paid out", type: "ASSET" },
  { key: "gateway", code: "1110", name: "Online payments to be paid out", type: "ASSET", only: "HQ" },
  { key: "hq", code: "1150", name: "Herbal Holland current account", type: "ASSET", only: "FRANCHISEE" },
  { key: "franchisees", code: "1160", name: "Franchisee current accounts", type: "ASSET", party: "COMPANY", only: "HQ" },
  { key: "debtors", code: "1200", name: "Trade debtors", type: "ASSET", party: "TRADE_ACCOUNT", only: "HQ" },
  { key: "stock", code: "1300", name: "Stock on hand", type: "ASSET" },
  { key: "transit", code: "1310", name: "Stock in transit", type: "ASSET" },
  { key: "interstore", code: "1350", name: "Transfers between own stores", type: "ASSET", only: "FRANCHISEE" },
  { key: "vat.input", code: "1400", name: "VAT input", type: "ASSET" },
  { code: "1500", name: "Furniture, fittings and equipment", type: "ASSET" },
  { code: "1510", name: "Accumulated depreciation", type: "ASSET" },
  { code: "1600", name: "Deposits and prepayments", type: "ASSET" },
  { key: "creditors", code: "2000", name: "Trade creditors", type: "LIABILITY", party: "SUPPLIER" },
  { key: "grni", code: "2050", name: "Stock received, not yet invoiced", type: "LIABILITY" },
  { key: "vat.output", code: "2100", name: "VAT output", type: "LIABILITY" },
  { key: "vat.control", code: "2150", name: "VAT due to / from SARS", type: "LIABILITY" },
  { key: "prepaid", code: "2200", name: "Online orders paid, not yet fulfilled", type: "LIABILITY", only: "HQ" },
  { key: "vouchers", code: "2300", name: "Gift vouchers in issue", type: "LIABILITY", only: "HQ" },
  { key: "points", code: "2310", name: "Rewards points owed to members", type: "LIABILITY", only: "HQ" },
  { key: "fund", code: "2400", name: "Marketing fund", type: "LIABILITY", only: "HQ" },
  { code: "2500", name: "Accruals", type: "LIABILITY" },
  { code: "2600", name: "Loans", type: "LIABILITY" },
  { key: "capital", code: "3000", name: "Share capital / owner's capital", type: "EQUITY" },
  { key: "retained", code: "3100", name: "Retained earnings", type: "EQUITY" },
  { code: "3200", name: "Drawings", type: "EQUITY" },
  { key: "sales.pos", code: "4000", name: "Sales in store", type: "INCOME" },
  { key: "sales.online", code: "4010", name: "Online sales", type: "INCOME" },
  { key: "sales.trade", code: "4020", name: "Trade sales", type: "INCOME" },
  { key: "sales.network", code: "4030", name: "Stock sold to other stores", type: "INCOME", only: "FRANCHISEE" },
  { key: "transfer.diff", code: "4040", name: "Transfer price differences between own stores", type: "INCOME" },
  { key: "sales.wholesale", code: "4100", name: "Sales to franchisees", type: "INCOME", only: "HQ" },
  { key: "royalty", code: "4200", name: "Royalties", type: "INCOME", only: "HQ" },
  { key: "ecom", code: "4210", name: "E-commerce commission", type: "INCOME", only: "HQ" },
  { key: "levy", code: "4220", name: "Marketing fund levies", type: "INCOME", only: "HQ" },
  { key: "offers.recovered", code: "4300", name: "My Deals funded by Herbal Holland", type: "INCOME", only: "FRANCHISEE" },
  { key: "breakage", code: "4400", name: "Expired gift vouchers and points", type: "INCOME", only: "HQ" },
  { key: "other.income", code: "4900", name: "Other income", type: "INCOME" },
  { key: "cogs", code: "5000", name: "Cost of sales", type: "EXPENSE" },
  { key: "stock.loss", code: "5100", name: "Stock written off", type: "EXPENSE" },
  { key: "stock.count", code: "5110", name: "Stock-take differences", type: "EXPENSE" },
  { key: "stock.transit", code: "5120", name: "Stock lost in transit", type: "EXPENSE" },
  { key: "exp.RENT", code: "6000", name: "Rent", type: "EXPENSE" },
  { key: "exp.SALARIES", code: "6010", name: "Salaries and wages", type: "EXPENSE" },
  { key: "exp.UTILITIES", code: "6020", name: "Utilities", type: "EXPENSE" },
  { key: "exp.SECURITY", code: "6030", name: "Security", type: "EXPENSE" },
  { key: "exp.MARKETING", code: "6040", name: "Marketing", type: "EXPENSE" },
  { key: "exp.SUPPLIES", code: "6050", name: "Supplies", type: "EXPENSE" },
  { key: "exp.BANK_FEES", code: "6060", name: "Bank charges", type: "EXPENSE" },
  { key: "exp.OTHER", code: "6090", name: "Other expenses", type: "EXPENSE" },
  { key: "fees.royalty", code: "6100", name: "Royalties", type: "EXPENSE", only: "FRANCHISEE" },
  { key: "fees.levy", code: "6110", name: "Marketing fund levy", type: "EXPENSE", only: "FRANCHISEE" },
  { key: "fees.ecom", code: "6120", name: "E-commerce commission", type: "EXPENSE", only: "FRANCHISEE" },
  { key: "card.fees", code: "6200", name: "Card and payment fees", type: "EXPENSE" },
  { key: "points.issued", code: "6300", name: "Rewards points issued", type: "EXPENSE", only: "FRANCHISEE" },
  { key: "points.hq", code: "6310", name: "Rewards points given by Herbal Holland", type: "EXPENSE", only: "HQ" },
  { key: "offers.funded", code: "6320", name: "My Deals funded", type: "EXPENSE", only: "HQ" },
  { key: "cash.diff", code: "6400", name: "Cash over and short", type: "EXPENSE" },
  { code: "6500", name: "Depreciation", type: "EXPENSE" },
  { key: "vat.nonclaimable", code: "6600", name: "VAT not claimable", type: "EXPENSE" },
  { key: "bad.debts", code: "6700", name: "Bad debts and trade write-offs", type: "EXPENSE", only: "HQ" },
];

/** The chart a company starts with: every common row, plus its side of the network. */
export const chartFor = (kind: "FRANCHISOR" | "FRANCHISEE") => CHART.filter((r) => !r.only || r.only === (kind === "FRANCHISOR" ? "HQ" : "FRANCHISEE"));

/** The expense account an expense category is charged to. */
export const expenseKey = (category: string) => `exp.${category}`;

/** Where the balance of each account type normally sits: assets and expenses are debits, the rest credits. */
export const debitNormal = (t: AccountType) => t === "ASSET" || t === "EXPENSE";

// ── Lines ─────────────────────────────────────────────────────────────────────

/** A posting line before it's resolved to an account id: `key` names a system account, `accountId` any account. */
export type Line = { key?: string; accountId?: string; cents: number; storeId?: string | null; partyId?: string | null; memo?: string | null };

const target = (l: Line) => l.accountId ?? `key:${l.key}`;
const lineKey = (l: Line) => `${target(l)}|${l.storeId ?? ""}|${l.partyId ?? ""}`;

/** Lines merged by account, store and party, zero lines dropped, in a stable order (debits first). */
export function netLines(lines: Line[]): Line[] {
  const by = new Map<string, Line>();
  for (const l of lines) {
    if (!Number.isInteger(l.cents)) throw new Error(`Ledger amounts are whole cents (${target(l)}: ${l.cents})`);
    const k = lineKey(l);
    const cur = by.get(k);
    if (cur) cur.cents += l.cents;
    else by.set(k, { ...l, storeId: l.storeId ?? null, partyId: l.partyId ?? null });
  }
  return [...by.values()].filter((l) => l.cents !== 0).sort((a, b) => b.cents - a.cents || lineKey(a).localeCompare(lineKey(b)));
}

export const sumCents = (lines: { cents: number }[]) => lines.reduce((s, l) => s + l.cents, 0);
export const isBalanced = (lines: { cents: number }[]) => sumCents(lines) === 0;

/** A journal line holds at most R20m (a 32-bit column); a bigger amount is stored as several lines on the same account. */
export const LINE_CAP_CENTS = 2_000_000_000;
export function splitLarge<T extends { cents: number }>(lines: T[], cap = LINE_CAP_CENTS): T[] {
  return lines.flatMap((l) => {
    const parts: T[] = [];
    let left = l.cents;
    while (Math.abs(left) > cap) {
      parts.push({ ...l, cents: Math.sign(left) * cap });
      left -= Math.sign(left) * cap;
    }
    return [...parts, { ...l, cents: left }];
  });
}

/** What must be posted so that `posted` becomes `desired`: the difference, netted. Both must balance. */
export function diffLines(desired: Line[], posted: Line[]): Line[] {
  return netLines([...desired, ...posted.map((l) => ({ ...l, cents: -l.cents }))]);
}

/** Debit/credit columns of a signed amount. */
export const drCr = (cents: number) => ({ debit: cents > 0 ? cents : 0, credit: cents < 0 ? -cents : 0 });

/**
 * Splits a VAT-inclusive amount into ex-VAT and VAT using the VAT already stored with it (never recomputed, so the
 * ledger agrees with the invoice to the cent). A non-vendor's VAT is 0.
 */
export const exAndVat = (inclCents: number, vatCents: number) => ({ ex: inclCents - vatCents, vat: vatCents });

// ── Months, years and VAT periods (SAST days as YYYY-MM-DD) ──────────────────────

export const periodOf = (day: string) => day.slice(0, 7);
export const monthStart = (period: string) => `${period}-01`;
export function monthEnd(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
export function addMonths(period: string, n: number) {
  const [y, m] = period.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}
/** Months from `from` to `to` inclusive. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

/**
 * The day a posting dated `day` lands on: its own day while its month is open; once the books are closed through a
 * later month, the first day of the first open month (flagged late).
 */
export function postingDay(day: string, lockedThrough: string | null | undefined) {
  if (!lockedThrough || periodOf(day) > lockedThrough) return { day, late: false };
  return { day: monthStart(addMonths(lockedThrough, 1)), late: true };
}

/** The financial year a month falls in, named by the month it ends (e.g. year end February: 2026-03 → "2027-02"). */
export function fiscalYearEnd(period: string, yearEndMonth: number) {
  const [y, m] = period.split("-").map(Number);
  const endYear = m > yearEndMonth ? y + 1 : y;
  return `${endYear}-${String(yearEndMonth).padStart(2, "0")}`;
}
/** First month of the financial year ending `fyEnd`. */
export const fiscalYearStart = (fyEnd: string) => addMonths(fyEnd, -11);

/**
 * SARS VAT categories: A files two-monthly for periods ending in odd months (Jan, Mar, …), B two-monthly ending in
 * even months (Feb, Apr, …), C monthly. Returns the period containing `period` as its first and last month.
 */
export function vatPeriodOf(period: string, category: string) {
  if (category === "C") return { from: period, to: period };
  const m = Number(period.slice(5, 7));
  const endsOdd = category === "A";
  const isEnd = endsOdd ? m % 2 === 1 : m % 2 === 0;
  const to = isEnd ? period : addMonths(period, 1);
  return { from: addMonths(to, -1), to };
}

export const VAT_CATEGORIES = [
  { key: "A", label: "Category A — every two months, ending Jan, Mar, May, Jul, Sep, Nov" },
  { key: "B", label: "Category B — every two months, ending Feb, Apr, Jun, Aug, Oct, Dec" },
  { key: "C", label: "Category C — monthly" },
] as const;

/** Supplier names as a party id: trimmed, single-spaced, lower case (so "ACME (Pty) Ltd " and "acme (pty) ltd" agree). */
export const supplierParty = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
