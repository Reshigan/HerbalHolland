// Financial reports, pure: statement layouts (income statement, balance sheet, cash flow) from account balances,
// ageing with FIFO allocation, cash-flow classes, the VAT201 fields, report ranges in whole months, key ratios and the
// CSV columns. src/server/ledger/reports.ts reads the balances; the books pages and CSV exports render these.
// Balances are debit − credit (debits positive), as in the ledger.
import { addMonths, fiscalYearEnd, fiscalYearStart, monthEnd, monthsBetween, vatPeriodOf, type AccountType } from "./ledger";
import { csvEscape, csvValue, type CsvColumn } from "./csv";

export type ReportAccount = { id: string; code: string; name: string; type: AccountType; key: string | null; party?: string | null };
/** One amount per column of a report. */
export type Values = number[];

const zeros = (n: number): Values => Array<number>(n).fill(0);
const plus = (a: Values, b: Values) => a.map((v, i) => v + (b[i] ?? 0));
const minus = (a: Values, b: Values) => a.map((v, i) => v - (b[i] ?? 0));
const neg = (v: number) => (v ? -v : 0); // never -0
export const nonZero = (v: Values) => v.some((x) => x !== 0);
const total = (rows: { values: Values }[], n: number) => rows.reduce((t, r) => plus(t, r.values), zeros(n));

// ── Statement sections ───────────────────────────────────────────────────────

export type SectionKey =
  | "revenue" | "costOfSales" | "otherIncome" | "operatingExpenses"
  | "nonCurrentAssets" | "currentAssets" | "equity" | "nonCurrentLiabilities" | "currentLiabilities";

export const SECTION_LABEL: Record<SectionKey, string> = {
  revenue: "Revenue",
  costOfSales: "Cost of sales",
  otherIncome: "Other income",
  operatingExpenses: "Operating expenses",
  nonCurrentAssets: "Non-current assets",
  currentAssets: "Current assets",
  equity: "Equity",
  nonCurrentLiabilities: "Non-current liabilities",
  currentLiabilities: "Current liabilities",
};

export const isProfitAndLoss = (t: AccountType) => t === "INCOME" || t === "EXPENSE";

/**
 * Where an account sits in the statements, by type and code range: income 40xx–48xx is revenue (the rest other
 * income); expenses 5xxx are cost of sales, the rest operating expenses; assets 15xx (fixed assets) and liabilities
 * 26xx–29xx (loans) are non-current; everything else is current.
 */
export function sectionOf(a: Pick<ReportAccount, "type" | "code">): SectionKey {
  switch (a.type) {
    case "INCOME":
      return /^4[0-8]/.test(a.code) ? "revenue" : "otherIncome";
    case "EXPENSE":
      return a.code.startsWith("5") ? "costOfSales" : "operatingExpenses";
    case "ASSET":
      return a.code.startsWith("15") ? "nonCurrentAssets" : "currentAssets";
    case "LIABILITY":
      return /^2[6-9]/.test(a.code) ? "nonCurrentLiabilities" : "currentLiabilities";
    default:
      return "equity";
  }
}

/** A row of a statement: a section heading, an account (drills down to its ledger), a computed item, or a total. */
export type StatementLine =
  | { kind: "section"; key: string; label: string }
  | { kind: "account"; key: string; label: string; account: ReportAccount; values: Values; note?: string }
  | { kind: "item"; key: string; label: string; values: Values; note?: string }
  | { kind: "total"; key: string; label: string; values: Values; grand?: boolean };

type Row = Extract<StatementLine, { kind: "account" | "item" }>;
const block = (key: string, label: string, rows: Row[], totalLabel: string, values: Values): StatementLine[] =>
  rows.length ? [{ kind: "section", key, label }, ...rows, { kind: "total", key: `${key}.total`, label: totalLabel, values }] : [];

/**
 * The income statement from P&L balances (one per column). Income shows positive and costs negative, so each
 * subtotal is a plain sum: gross profit = revenue + cost of sales; net profit adds other income and operating
 * expenses. Accounts with nothing in any column are left out, and so are empty sections.
 */
export function incomeStatementLayout(accounts: ReportAccount[], balances: Map<string, Values>, width: number) {
  const rows = (s: SectionKey): Row[] =>
    accounts.flatMap((a) => {
      const b = balances.get(a.id);
      return isProfitAndLoss(a.type) && sectionOf(a) === s && b && nonZero(b) ? [{ kind: "account" as const, key: a.id, label: a.name, account: a, values: b.map(neg) }] : [];
    });
  const revenue = rows("revenue");
  const costOfSales = rows("costOfSales");
  const otherIncome = rows("otherIncome");
  const operatingExpenses = rows("operatingExpenses");
  const t = { revenue: total(revenue, width), costOfSales: total(costOfSales, width), otherIncome: total(otherIncome, width), operatingExpenses: total(operatingExpenses, width) };
  const grossProfit = plus(t.revenue, t.costOfSales);
  const netProfit = plus(plus(grossProfit, t.otherIncome), t.operatingExpenses);
  const lines: StatementLine[] = [
    ...block("revenue", SECTION_LABEL.revenue, revenue, "Total revenue", t.revenue),
    ...block("costOfSales", SECTION_LABEL.costOfSales, costOfSales, "Total cost of sales", t.costOfSales),
    { kind: "total", key: "grossProfit", label: "Gross profit", values: grossProfit, grand: true },
    ...block("otherIncome", SECTION_LABEL.otherIncome, otherIncome, "Total other income", t.otherIncome),
    ...block("operatingExpenses", SECTION_LABEL.operatingExpenses, operatingExpenses, "Total operating expenses", t.operatingExpenses),
    { kind: "total", key: "netProfit", label: "Net profit", values: netProfit, grand: true },
  ];
  return { lines, ...t, grossProfit, netProfit };
}

/**
 * The balance sheet from cumulative balances as at each column's date. Retained earnings are computed, never posted:
 * `priorYears` (the profit of financial years ended before the column's year) is added to the retained earnings
 * account, and `thisYear` shows as "Profit for the year so far". Both are credit-positive. `balancing` names the
 * difference for a slice of the books that needn't balance on its own (one store's entries): it's shown in equity.
 */
export function balanceSheetLayout(
  accounts: ReportAccount[],
  balances: Map<string, Values>,
  width: number,
  computed: { priorYears: Values; thisYear: Values },
  balancing?: string,
) {
  const hasRetained = accounts.some((a) => a.key === "retained");
  const rows = (s: SectionKey): Row[] =>
    accounts.flatMap((a) => {
      if (isProfitAndLoss(a.type) || sectionOf(a) !== s) return [];
      const b = balances.get(a.id) ?? zeros(width);
      let values = a.type === "ASSET" ? b.map((v) => v || 0) : b.map(neg);
      const earlier = a.key === "retained" && nonZero(computed.priorYears);
      if (earlier) values = plus(values, computed.priorYears);
      return nonZero(values) ? [{ kind: "account" as const, key: a.id, label: a.name, account: a, values, note: earlier ? "Includes the profit of earlier financial years" : undefined }] : [];
    });
  const nonCurrentAssets = rows("nonCurrentAssets");
  const currentAssets = rows("currentAssets");
  const equity = rows("equity");
  if (!hasRetained && nonZero(computed.priorYears)) equity.push({ kind: "item", key: "retained", label: "Retained earnings", values: computed.priorYears });
  if (nonZero(computed.thisYear)) equity.push({ kind: "item", key: "profitThisYear", label: "Profit for the year so far", values: computed.thisYear });
  const nonCurrentLiabilities = rows("nonCurrentLiabilities");
  const currentLiabilities = rows("currentLiabilities");
  const t = {
    nonCurrentAssets: total(nonCurrentAssets, width),
    currentAssets: total(currentAssets, width),
    nonCurrentLiabilities: total(nonCurrentLiabilities, width),
    currentLiabilities: total(currentLiabilities, width),
  };
  const assets = plus(t.nonCurrentAssets, t.currentAssets);
  const liabilities = plus(t.nonCurrentLiabilities, t.currentLiabilities);
  let difference = minus(minus(assets, liabilities), total(equity, width));
  if (balancing && nonZero(difference)) {
    equity.push({ kind: "item", key: "balancing", label: balancing, values: difference });
    difference = zeros(width);
  }
  const equityTotal = total(equity, width);
  const lines: StatementLine[] = [
    ...block("nonCurrentAssets", SECTION_LABEL.nonCurrentAssets, nonCurrentAssets, "Total non-current assets", t.nonCurrentAssets),
    ...block("currentAssets", SECTION_LABEL.currentAssets, currentAssets, "Total current assets", t.currentAssets),
    { kind: "total", key: "assets", label: "Total assets", values: assets, grand: true },
    ...block("equity", SECTION_LABEL.equity, equity, "Total equity", equityTotal),
    ...block("nonCurrentLiabilities", SECTION_LABEL.nonCurrentLiabilities, nonCurrentLiabilities, "Total non-current liabilities", t.nonCurrentLiabilities),
    ...block("currentLiabilities", SECTION_LABEL.currentLiabilities, currentLiabilities, "Total current liabilities", t.currentLiabilities),
    { kind: "total", key: "equityAndLiabilities", label: "Total equity and liabilities", values: plus(equityTotal, liabilities), grand: true },
  ];
  return { lines, ...t, assets, liabilities, equity: equityTotal, difference };
}

// ── Cash flow ────────────────────────────────────────────────────────────────

export type CashFlowClass = "operating" | "investing" | "financing";
export const CASH_FLOW_LABEL: Record<CashFlowClass, string> = { operating: "Operating activities", investing: "Investing activities", financing: "Financing activities" };
/** The cash-like system accounts: bank, cash on hand, card and online payments waiting to be paid out. */
export const CASH_KEYS = ["bank", "cash", "card", "gateway"] as const;

/** Cash-like accounts: the system ones and every bank account the company added (`bankAccountIds`). */
export const isCashAccount = (a: Pick<ReportAccount, "id" | "key">, bankAccountIds: ReadonlySet<string> = new Set()) =>
  (!!a.key && (CASH_KEYS as readonly string[]).includes(a.key)) || bankAccountIds.has(a.id);

/** A cash movement's class, by its counter-account: fixed assets (15xx) are investing, loans (26xx–29xx) and equity financing, the rest operating. */
export function cashFlowClass(a: Pick<ReportAccount, "type" | "code">): CashFlowClass {
  const s = sectionOf(a);
  if (s === "nonCurrentAssets") return "investing";
  if (s === "nonCurrentLiabilities" || s === "equity") return "financing";
  return "operating";
}

// Receipts and payments first (income, then expenses), then working capital, loans and equity.
const FLOW_ORDER: Record<AccountType, number> = { INCOME: 0, EXPENSE: 1, ASSET: 2, LIABILITY: 3, EQUITY: 4 };

/**
 * The cash flow statement, direct method. `flows` are the cash movements by counter-account (the other side of
 * every journal that moved cash, money in positive), one value per column. Anything left between the change in cash
 * and the flows is cash moved against lines outside the view (one store's cash banked into a company account): shown
 * as `otherLabel` in operating activities, so the statement always ties to the cash accounts.
 */
export function cashFlowLayout(flows: { account: ReportAccount; values: Values }[], opening: Values, closing: Values, width: number, otherLabel = "Moved to or from the company's other accounts") {
  const rows = (c: CashFlowClass): Row[] =>
    flows
      .filter((f) => cashFlowClass(f.account) === c && nonZero(f.values))
      .sort((a, b) => FLOW_ORDER[a.account.type] - FLOW_ORDER[b.account.type] || a.account.code.localeCompare(b.account.code))
      .map((f) => ({ kind: "account" as const, key: f.account.id, label: f.account.name, account: f.account, values: f.values.map((v) => v || 0) }));
  const operating = rows("operating");
  const investing = rows("investing");
  const financing = rows("financing");
  const other = minus(minus(closing, opening), total([...operating, ...investing, ...financing], width));
  if (nonZero(other)) operating.push({ kind: "item", key: "other", label: otherLabel, values: other });
  const t = { operating: total(operating, width), investing: total(investing, width), financing: total(financing, width) };
  const net = plus(plus(t.operating, t.investing), t.financing);
  const section = (c: CashFlowClass, list: Row[], label: string): StatementLine[] => [
    { kind: "section", key: c, label: CASH_FLOW_LABEL[c] },
    ...list,
    { kind: "total", key: `${c}.total`, label, values: t[c] },
  ];
  const lines: StatementLine[] = [
    ...section("operating", operating, "Net cash from operating activities"),
    ...section("investing", investing, "Net cash from investing activities"),
    ...section("financing", financing, "Net cash from financing activities"),
    { kind: "total", key: "net", label: "Net change in cash", values: net, grand: true },
    { kind: "item", key: "opening", label: "Cash at the start", values: opening },
    { kind: "total", key: "closing", label: "Cash at the end", values: closing, grand: true },
  ];
  return { lines, ...t, net, opening, closing, other };
}

// ── Ageing ───────────────────────────────────────────────────────────────────

export type AgeKey = "current" | "d30" | "d60" | "d90plus";
export const AGEING: { key: AgeKey; label: string; detail: string }[] = [
  { key: "current", label: "Current", detail: "up to 30 days old" },
  { key: "d30", label: "30 days", detail: "31–60 days old" },
  { key: "d60", label: "60 days", detail: "61–90 days old" },
  { key: "d90plus", label: "90+ days", detail: "over 90 days old" },
];
export type Aged = Record<AgeKey, number> & { total: number };
type Recent = Record<"current" | "d30" | "d60", number>;

const DAY = 86_400_000;
const at = (day: string) => Date.parse(`${day}T00:00:00Z`);
/** Whole days from `day` to `asOf` (both YYYY-MM-DD). */
export const ageDays = (day: string, asOf: string) => Math.round((at(asOf) - at(day)) / DAY);
export const ageKey = (days: number): AgeKey => (days <= 30 ? "current" : days <= 60 ? "d30" : days <= 90 ? "d60" : "d90plus");
export const shiftDay = (day: string, n: number) => new Date(at(day) + n * DAY).toISOString().slice(0, 10);
/** The oldest day in each bucket as at `asOf`: a line dated on or after `current` is current, and so on; older is 90+. */
export const ageBounds = (asOf: string) => ({ current: shiftDay(asOf, -30), d30: shiftDay(asOf, -60), d60: shiftDay(asOf, -90) });

/**
 * Ages one party's balance (in the account's normal direction: what they owe us, or we owe them). FIFO: whatever
 * reduced the balance settled the oldest items first, so the open items are the newest that add up to the balance.
 * `added` and `reduced` are what went onto and came off the balance in the current, 30- and 60-day buckets (positive
 * amounts); whatever's still open beyond them is 90+. A balance the other way (an overpayment) ages its newest
 * reductions the same way and shows negative.
 */
export function ageBalance(balance: number, added: Recent, reduced: Recent): Aged {
  const sign = balance < 0 ? -1 : 1;
  const items = sign > 0 ? added : reduced;
  let left = Math.abs(balance);
  const out: Aged = { current: 0, d30: 0, d60: 0, d90plus: 0, total: balance };
  for (const k of ["current", "d30", "d60"] as const) {
    const take = Math.min(left, Math.max(0, items[k]));
    out[k] = sign * take || 0;
    left -= take;
  }
  out.d90plus = sign * left || 0;
  return out;
}

/** The same, from a party's lines (normal direction positive): FIFO over every line up to `asOf`. */
export function ageLines(lines: { date: string; cents: number }[], asOf: string): Aged {
  const added: Recent = { current: 0, d30: 0, d60: 0 };
  const reduced: Recent = { current: 0, d30: 0, d60: 0 };
  let balance = 0;
  for (const l of lines) {
    if (l.date > asOf) continue;
    balance += l.cents;
    const k = ageKey(ageDays(l.date, asOf));
    if (k === "d90plus") continue;
    if (l.cents > 0) added[k] += l.cents;
    else reduced[k] -= l.cents;
  }
  return ageBalance(balance, added, reduced);
}

export function sumAged(list: Aged[]): Aged {
  const t: Aged = { current: 0, d30: 0, d60: 0, d90plus: 0, total: 0 };
  for (const a of list) for (const k of ["current", "d30", "d60", "d90plus", "total"] as const) t[k] += a[k];
  return t;
}

// ── VAT201 ───────────────────────────────────────────────────────────────────

export type VatInputGroup = "capital" | "stock" | "expenses" | "fees" | "other";
/** Input tax lines of the VAT201 working (the labels of the reports' working, src/server/reports/finance.ts). */
export const VAT_INPUT: Record<VatInputGroup, { label: string; field: string }> = {
  capital: { label: "Capital goods (equipment, fittings and other fixed assets)", field: "14" },
  stock: { label: "Stock purchases (HQ and network tax invoices)", field: "15" },
  expenses: { label: "Operating expenses with VAT", field: "15" },
  fees: { label: "Franchise fees (royalty, levy, commission)", field: "15" },
  other: { label: "Other input tax (journals)", field: "15" },
};
const INPUT_ORDER: VatInputGroup[] = ["capital", "stock", "expenses", "fees", "other"];

/**
 * The VAT201 input-tax line a journal's input VAT belongs on: capital goods when it bought a fixed asset (field 14);
 * franchise fees from the statement; stock from stock orders (or stock on a supplier invoice); expenses, supplier
 * invoices and bank charges; anything else (manual journals) as other input tax.
 */
export function vatInputGroup(source: string, j: { capital?: boolean; stock?: boolean } = {}): VatInputGroup {
  if (j.capital) return "capital";
  if (source === "statement") return "fees";
  if (source === "stock-ship" || source === "stock-receive" || j.stock) return "stock";
  if (source === "expense" || source === "supplier-invoice" || source === "bank") return "expenses";
  return "other";
}

export type VatRow = { line: string; field?: string; amount?: number | null; vat?: number | null; style?: "section" | "strong" };

/**
 * The VAT201 working, laid out like the reports' working: output tax on standard-rated supplies (fields 1 and 4),
 * input tax by kind (14 and 15), total input tax (19) and what's payable or refundable (20). Stock, expenses and fees
 * always show; capital goods and other input tax only when there are some.
 */
export function vat201Rows(v: { suppliesInclCents: number; outputCents: number; input: Partial<Record<VatInputGroup, number>> }): VatRow[] {
  const input = INPUT_ORDER.reduce((s, g) => s + (v.input[g] ?? 0), 0);
  const payable = v.outputCents - input;
  return [
    { line: "Output tax", style: "section" },
    { line: "Standard-rated supplies (sales, stock sold and fees)", field: "1 · 4", amount: v.suppliesInclCents, vat: v.outputCents },
    { line: "Input tax", style: "section" },
    ...INPUT_ORDER.filter((g) => ["stock", "expenses", "fees"].includes(g) || v.input[g]).map((g) => ({ line: VAT_INPUT[g].label, field: VAT_INPUT[g].field, amount: null, vat: v.input[g] ?? 0 })),
    { line: "Total input tax", field: "19", amount: null, vat: input, style: "strong" },
    { line: payable < 0 ? "VAT refundable by SARS" : "VAT payable to SARS", field: "20", amount: null, vat: Math.abs(payable), style: "strong" },
  ];
}

// ── Ranges of months ────────────────────────────────────────────────────────

/** Reports run over whole months, YYYY-MM to YYYY-MM inclusive (the ledger keeps its running balances by month). */
export type MonthRange = { from: string; to: string };
export const MAX_RANGE_MONTHS = 36;
export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(at(s)) && new Date(at(s)).toISOString().slice(0, 10) === s;
/** The first of several values of a search param. */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** ?from=&to= (months) checked, in order and at most three years long; `fallback` fills what's missing or invalid. */
export function monthRange(q: { from?: string; to?: string }, fallback: MonthRange): MonthRange {
  let from = isMonth(q.from) ? q.from : fallback.from;
  let to = isMonth(q.to) ? q.to : fallback.to;
  if (from > to) [from, to] = [to, from];
  if (monthsBetween(from, to).length > MAX_RANGE_MONTHS) from = addMonths(to, 1 - MAX_RANGE_MONTHS);
  return { from, to };
}
export const rangeMonths = (r: MonthRange) => monthsBetween(r.from, r.to).length;
/** The same number of months just before. */
export const previousRange = (r: MonthRange): MonthRange => ({ from: addMonths(r.from, -rangeMonths(r)), to: addMonths(r.from, -1) });
/** The same months a year earlier. */
export const lastYearRange = (r: MonthRange): MonthRange => ({ from: addMonths(r.from, -12), to: addMonths(r.to, -12) });
/** The financial year containing `period`, from its first month to `period`. */
export const yearToDate = (period: string, yearEndMonth: number): MonthRange => ({ from: fiscalYearStart(fiscalYearEnd(period, yearEndMonth)), to: period });
/** The whole financial year containing `period`. */
export const financialYear = (period: string, yearEndMonth: number): MonthRange => {
  const end = fiscalYearEnd(period, yearEndMonth);
  return { from: fiscalYearStart(end), to: end };
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "October 2026" (or "Oct 2026"). */
export const monthLabel = (p: string, short = false) => `${MONTHS[Number(p.slice(5, 7)) - 1].slice(0, short ? 3 : undefined)} ${p.slice(0, 4)}`;
/** "31 October 2026": the last day of a month, for balances as at. */
export const monthEndLabel = (p: string) => `${Number(monthEnd(p).slice(8))} ${monthLabel(p)}`;
/** "October 2026", "March – October 2026", "Nov 2025 – Feb 2026". */
export function rangeLabel(r: MonthRange) {
  if (r.from === r.to) return monthLabel(r.from);
  if (r.from.slice(0, 4) === r.to.slice(0, 4)) return `${MONTHS[Number(r.from.slice(5, 7)) - 1]} – ${monthLabel(r.to)}`;
  return `${monthLabel(r.from, true)} – ${monthLabel(r.to, true)}`;
}
/** Months for a picker, newest first: `count` months back from `current`. */
export const recentMonths = (current: string, count = 36) => Array.from({ length: count }, (_, i) => addMonths(current, -i));

export type PeriodChoice = { group: string; label: string; from: string; to: string };

/**
 * The period picker's choices as at `current` (this month): the last twelve months, the quarters of this financial
 * year and the last, and financial years (this one to date, then the three before). Newest first.
 */
export function periodChoices(current: string, yearEndMonth: number): PeriodChoice[] {
  const out: PeriodChoice[] = [];
  for (let i = 0; i < 12; i++) {
    const m = addMonths(current, -i);
    out.push({ group: "Months", label: i === 0 ? `${monthLabel(m)} (so far)` : monthLabel(m), from: m, to: m });
  }
  const fyEnd = fiscalYearEnd(current, yearEndMonth);
  for (const end of [fyEnd, addMonths(fyEnd, -12)]) {
    const start = fiscalYearStart(end);
    for (let q = 3; q >= 0; q--) {
      const from = addMonths(start, q * 3);
      const to = addMonths(from, 2);
      if (from > current) continue;
      out.push({ group: "Quarters", label: `${rangeLabel({ from, to })}${to > current ? " (so far)" : ""}`, from, to: to > current ? current : to });
    }
  }
  out.push({ group: "Financial years", label: `This financial year (to ${monthLabel(current, true)})`, from: fiscalYearStart(fyEnd), to: current });
  for (let y = 1; y <= 3; y++) {
    const end = addMonths(fyEnd, -12 * y);
    out.push({ group: "Financial years", label: `Year ended ${monthEndLabel(end)}`, from: fiscalYearStart(end), to: end });
  }
  return out;
}

/** SARS VAT periods for a picker: the one containing `current` and the `count − 1` before it, newest first. */
export function vatPeriodChoices(current: string, category: string, count = 12): (MonthRange & { label: string })[] {
  const out: (MonthRange & { label: string })[] = [];
  let p = vatPeriodOf(current, category);
  for (let i = 0; i < count; i++) {
    out.push({ ...p, label: rangeLabel(p) });
    p = vatPeriodOf(addMonths(p.from, -1), category);
  }
  return out;
}

// ── Key ratios ───────────────────────────────────────────────────────────────

export type Ratio = { key: string; label: string; value: number | null; format: "pct" | "times"; hint: string };

/** The management pack's ratios; null where the denominator is nil (no revenue, no current liabilities, no equity). */
export function keyRatios(x: { revenue: number; grossProfit: number; netProfit: number; operatingExpenses: number; currentAssets: number; currentLiabilities: number; stock: number; liabilities: number; equity: number }): Ratio[] {
  const div = (a: number, b: number) => (b ? a / b : null);
  return [
    { key: "grossMargin", label: "Gross margin", value: div(x.grossProfit, x.revenue), format: "pct", hint: "Gross profit as a share of revenue" },
    { key: "netMargin", label: "Net margin", value: div(x.netProfit, x.revenue), format: "pct", hint: "Net profit as a share of revenue" },
    { key: "expenseRatio", label: "Operating expenses to revenue", value: div(-x.operatingExpenses, x.revenue), format: "pct", hint: "What running the business costs per rand of revenue" },
    { key: "currentRatio", label: "Current ratio", value: div(x.currentAssets, x.currentLiabilities), format: "times", hint: "Current assets ÷ current liabilities: above 1 covers what falls due within a year" },
    { key: "quickRatio", label: "Quick ratio", value: div(x.currentAssets - x.stock, x.currentLiabilities), format: "times", hint: "The current ratio without stock" },
    { key: "debtToEquity", label: "Debt to equity", value: x.equity > 0 ? x.liabilities / x.equity : null, format: "times", hint: "Liabilities ÷ equity (shown when equity is positive)" },
  ];
}
export const fmtRatio = (r: Pick<Ratio, "value" | "format">) => (r.value == null || !Number.isFinite(r.value) ? "—" : r.format === "pct" ? `${(r.value * 100).toFixed(1)}%` : `${r.value.toFixed(2)}×`);

// ── CSV and links ──────────────────────────────────────────────────────────

/** A signed amount as debit and credit columns, the other one empty. */
export const debitCredit = (cents: number) => ({ debit: cents > 0 ? cents : null, credit: cents < 0 ? -cents : null });

export const TRIAL_BALANCE_CSV: CsvColumn[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Account" },
  { key: "type", label: "Type" },
  { key: "opening", label: "Opening balance (debit + / credit −)", format: "zar" },
  { key: "debit", label: "Debits", format: "zar" },
  { key: "credit", label: "Credits", format: "zar" },
  { key: "closing", label: "Closing balance (debit + / credit −)", format: "zar" },
];
export const LEDGER_CSV: CsvColumn[] = [
  { key: "date", label: "Date", format: "day" },
  { key: "number", label: "Journal", format: "number" },
  { key: "source", label: "Source" },
  { key: "memo", label: "Description" },
  { key: "store", label: "Store" },
  { key: "party", label: "Party" },
  { key: "debit", label: "Debit", format: "zar" },
  { key: "credit", label: "Credit", format: "zar" },
  { key: "balance", label: "Balance (debit + / credit −)", format: "zar" },
];
export const JOURNALS_CSV: CsvColumn[] = [
  { key: "number", label: "Journal", format: "number" },
  { key: "date", label: "Date", format: "day" },
  { key: "source", label: "Source" },
  { key: "reference", label: "Reference" },
  { key: "memo", label: "Description" },
  { key: "code", label: "Account code" },
  { key: "account", label: "Account" },
  { key: "store", label: "Store" },
  { key: "party", label: "Party" },
  { key: "debit", label: "Debit", format: "zar" },
  { key: "credit", label: "Credit", format: "zar" },
  { key: "lineMemo", label: "Line note" },
];

/** A UTF-8 byte-order mark, so Excel reads accents (as @/lib/csv's toCsv writes). */
export const CSV_BOM = "﻿";
/** One CSV header line, for exports streamed in batches (whole tables use toCsv). */
export const csvHead = (columns: CsvColumn[]) => `${columns.map((c) => csvEscape(csvValue(c.label))).join(",")}\r\n`;
/** One CSV row, formatted and guarded like toCsv's. */
export const csvRow = (columns: CsvColumn[], row: Record<string, unknown>) => `${columns.map((c) => csvEscape(csvValue(row[c.key], c.format))).join(",")}\r\n`;

/** /books/<companyId>/<path>?… with empty parameters left out. */
export function booksHref(companyId: string, path: string, q: Record<string, string | number | null | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v != null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return `/books/${companyId}${path ? `/${path}` : ""}${s ? `?${s}` : ""}`;
}
