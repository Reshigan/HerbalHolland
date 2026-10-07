// The books' working rules, pure: what each journal source is called, account codes, the opening-balances CSV (a
// trial balance from the old system), the key figures an overview shows, and the dates the reconciliation checks
// compare at. Money is integer cents; balances are debit − credit unless a function says otherwise.
import { CellError, parseCsv, readNumber } from "./catalogue-import";
import { addDays, dayKey } from "./format";
import { debitNormal, monthEnd, type AccountType } from "./ledger";
import { zar } from "./money";

/** What people call each journal source. */
export const SOURCE_LABEL: Record<string, string> = {
  "store-day": "Trading day",
  shift: "Cash-up",
  deposit: "Cash deposit",
  expense: "Expense",
  "supplier-invoice": "Supplier invoice",
  "supplier-payment": "Supplier payment",
  "stock-ship": "Stock shipped",
  "stock-receive": "Stock received",
  statement: "Franchise statement",
  "statement-payment": "Statement payment",
  "online-payment": "Online payment",
  voucher: "Gift voucher",
  points: "Rewards points",
  "trade-entry": "Trade account",
  "trade-eft": "Trade EFT",
  bank: "Bank statement",
  "vat-period": "VAT period closed",
  manual: "Manual journal",
  opening: "Opening balances",
};
export const sourceLabel = (source: string) => SOURCE_LABEL[source] ?? source.replace(/[-.]/g, " ").replace(/^./, (c) => c.toUpperCase());

export const ACCOUNT_TYPES: { type: AccountType; label: string; hint: string }[] = [
  { type: "ASSET", label: "Assets", hint: "What the business owns or is owed" },
  { type: "LIABILITY", label: "Liabilities", hint: "What the business owes" },
  { type: "EQUITY", label: "Equity", hint: "The owners' stake" },
  { type: "INCOME", label: "Income", hint: "Sales and other income" },
  { type: "EXPENSE", label: "Expenses", hint: "Cost of sales and running costs" },
];

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A new account's code: four digits (the chart groups them 1xxx assets … 6xxx expenses). */
export const accountCodeProblem = (code: string) => (/^\d{4}$/.test(code) ? null : "Use a four-digit code, like 6550");

/** A balance the way an account normally reads: assets and expenses as debits, the rest as credits (positive). */
export const natural = (type: AccountType, cents: number) => (debitNormal(type) ? cents : -cents);

/** The most one manual or opening line may carry: R100bn, a guard against typos (the core splits big lines itself). */
export const MAX_LINE_CENTS = 10_000_000_000_000;

// ── Opening balances (CSV) ────────────────────────────────────────────────────

export const OPENING_MAX_BYTES = 1024 * 1024;
export const OPENING_MAX_ROWS = 5_000;

/** One row of an opening trial balance: debit positive, credit negative. */
export type OpeningRow = { line: number; code: string; cents: number; party: string | null; store: string | null };
export type OpeningRead = { rows: OpeningRow[]; errors: string[]; debitCents: number; creditCents: number; skipped: number };

type Col = "code" | "debit" | "credit" | "party" | "store";
const HEADERS: Record<string, Col> = {
  account: "code", account_code: "code", code: "code", account_no: "code", account_number: "code", acc: "code", gl: "code", gl_code: "code",
  debit: "debit", dr: "debit", debits: "debit", debit_amount: "debit",
  credit: "credit", cr: "credit", credits: "credit", credit_amount: "credit",
  party: "party", supplier: "party", customer: "party", trade_account: "party", company: "party", franchisee: "party", contact: "party",
  store: "store", store_code: "store", branch: "store",
};
const POSITIONAL: Col[] = ["code", "debit", "credit", "party", "store"];
const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Rand in a spreadsheet cell → cents: "1234.50", "R 1 234,50", "1,234.50". Empty is 0; negatives belong in the other column. */
export function readCents(raw: string): number {
  const s = raw.trim().replace(/^(zar|r)\s*/i, "");
  if (!s) return 0;
  if (/^[-−(]|\)$/.test(s)) throw new CellError("a negative amount (put it in the other column)");
  const n = readNumber(s);
  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) throw new CellError("at most two decimals (cents)");
  if (cents > MAX_LINE_CENTS) throw new CellError(`more than ${zar(MAX_LINE_CENTS)} (check the amount)`);
  return cents;
}

/**
 * Reads an opening trial balance: account code, debit, credit and, optionally, the party (supplier, trade account or
 * franchisee) and store code. With a header row the columns are found by name (others, like the account name, are
 * ignored); without one they're taken in that order. Rows without an amount are skipped; the total must balance.
 */
export function readOpeningCsv(text: string): OpeningRead {
  const out: OpeningRead = { rows: [], errors: [], debitCents: 0, creditCents: 0, skipped: 0 };
  const { rows, error } = parseCsv(text);
  if (error) {
    out.errors.push(/more than \d+ cells/.test(error) ? "A row has far too many cells. Save the trial balance as CSV with the columns account, debit, credit, party, store." : error);
    return out;
  }
  const at = rows.findIndex((r) => r.some((c) => c.trim()));
  if (at < 0) return (out.errors.push("The file is empty."), out);
  const named = rows[at].map((h) => HEADERS[norm(h)] ?? null);
  const header = named.includes("debit") || named.includes("credit") || named.includes("code");
  let cols: (Col | null)[] = POSITIONAL;
  if (header) {
    const seen = new Set<Col>();
    cols = named.map((c) => (c && !seen.has(c) ? (seen.add(c), c) : null));
    if (!seen.has("code")) out.errors.push("There's no account column. Name it “account”.");
    if (!seen.has("debit") && !seen.has("credit")) out.errors.push("There are no debit or credit columns. Name them “debit” and “credit”.");
  }
  const body = rows.slice(header ? at + 1 : at).map((cells, i) => ({ cells, line: (header ? at + 2 : at + 1) + i })).filter((r) => r.cells.some((c) => c.trim()));
  if (!body.length && !out.errors.length) out.errors.push("There are no rows with balances.");
  if (body.length > OPENING_MAX_ROWS) out.errors.push(`The file has ${body.length.toLocaleString("en-US")} rows: import at most ${OPENING_MAX_ROWS.toLocaleString("en-US")}.`);
  if (out.errors.length) return out;

  for (const { cells, line } of body) {
    const cell = (c: Col) => {
      const i = cols.indexOf(c);
      return i < 0 ? "" : (cells[i] ?? "").trim();
    };
    const problems: string[] = [];
    const rawCode = cell("code");
    const code = rawCode.match(/^(\d{4})(?:$|\s|[-–—:])/)?.[1];
    if (!code) problems.push(rawCode ? `“${rawCode.slice(0, 30)}” isn't a four-digit account code` : "no account code");
    const amount = (c: "debit" | "credit") => {
      try {
        return readCents(cell(c));
      } catch (e) {
        if (!(e instanceof CellError)) throw e;
        problems.push(`${c}: ${e.message}`);
        return 0;
      }
    };
    const debit = amount("debit"), credit = amount("credit");
    if (debit && credit) problems.push("both a debit and a credit (use one column per row)");
    if (problems.length) {
      out.errors.push(`Row ${line}: ${problems.join("; ")}.`);
      continue;
    }
    if (!debit && !credit) {
      out.skipped++;
      continue;
    }
    out.rows.push({ line, code: code!, cents: debit - credit, party: cell("party").replace(/\s+/g, " ") || null, store: cell("store").toUpperCase() || null });
    out.debitCents += debit;
    out.creditCents += credit;
  }
  if (!out.errors.length && !out.rows.length) out.errors.push("Every row's amount is empty or zero.");
  if (!out.errors.length && out.debitCents !== out.creditCents)
    out.errors.push(`The debits (${zar(out.debitCents)}) and credits (${zar(out.creditCents)}) don't balance: they're out by ${zar(Math.abs(out.debitCents - out.creditCents))}.`);
  return out;
}

/** At most `n` problems, then how many more. */
export function firstProblems(errors: string[], n = 6) {
  return errors.length <= n ? errors.join(" ") : `${errors.slice(0, n).join(" ")} … and ${errors.length - n} more.`;
}

// ── Key figures ───────────────────────────────────────────────────────────────

export type AccountSum = { id: string; key: string | null; type: AccountType; cents: number };

/**
 * The overview's balances from each account's balance: money in the bank and tills, owed to the company (trade
 * debtors, franchisees, Herbal Holland when it owes the store), owed by it (every liability but VAT, and the current
 * account the other way round), VAT due to SARS (negative: a refund) and stock (incl. in transit).
 */
export function keyFigures(sums: AccountSum[], bankAccountIds: Set<string> = new Set()) {
  const f = { cash: 0, owedToUs: 0, owedByUs: 0, vatDue: 0, stock: 0 };
  for (const a of sums) {
    if (a.key === "bank" || a.key === "cash" || bankAccountIds.has(a.id)) f.cash += a.cents;
    else if (a.key === "debtors" || ((a.key === "hq" || a.key === "franchisees") && a.cents >= 0)) f.owedToUs += a.cents;
    else if (a.key === "hq" || a.key === "franchisees") f.owedByUs -= a.cents;
    else if (a.key === "vat.output" || a.key === "vat.input" || a.key === "vat.control") f.vatDue -= a.cents;
    else if (a.key === "stock" || a.key === "transit") f.stock += a.cents;
    else if (a.type === "LIABILITY") f.owedByUs -= a.cents;
  }
  return f;
}

/** Income, expenses and profit from account balances (income is a credit, so it's turned positive). */
export function profitOf(sums: { type: AccountType; cents: number }[]) {
  const revenue = -sums.filter((s) => s.type === "INCOME").reduce((t, s) => t + s.cents, 0);
  const expenses = sums.filter((s) => s.type === "EXPENSE").reduce((t, s) => t + s.cents, 0);
  return { revenue, expenses, profit: revenue - expenses };
}

// ── Checks ────────────────────────────────────────────────────────────────────

const shiftDay = (day: string, n: number) => dayKey(addDays(new Date(`${day}T12:00:00+02:00`), n));

/**
 * The day balances are compared at for a month: its last day once it's over, else yesterday (today's trading posts
 * tonight). Registers are taken back to the start of the next day (`cutoff`, SAST).
 */
export function checkDate(period: string, today: string) {
  const end = monthEnd(period);
  const yesterday = shiftDay(today, -1);
  const asAt = end < yesterday ? end : yesterday;
  return { asAt, cutoff: new Date(`${shiftDay(asAt, 1)}T00:00:00+02:00`), over: end < today };
}

/** Where two sets of figures (by store, party…) disagree: actual − expected, zeros left out. */
export function differences(expected: Map<string, number>, actual: Map<string, number>) {
  return [...new Set([...expected.keys(), ...actual.keys()])]
    .map((key) => ({ key, expected: expected.get(key) ?? 0, actual: actual.get(key) ?? 0 }))
    .map((r) => ({ ...r, difference: r.actual - r.expected }))
    .filter((r) => r.difference !== 0);
}
