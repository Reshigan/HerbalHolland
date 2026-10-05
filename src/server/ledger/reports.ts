// Financial reports for any company's books, at network scale. Balances by month come from LedgerBalance (company ×
// account × store × month, kept with every posting); journal lines are read only for detail and always grouped or
// paged in SQL: one account's lines a page at a time, the journals that moved cash or VAT in a bounded range, each
// party's open items for ageing. Retained earnings are computed, never posted: the profit of earlier financial years
// is added to the retained earnings account, and this year's shows as profit for the year so far.
import { db, tx, Prisma, type Tx } from "../db";
import { audit, type Actor } from "../audit";
import { booksFor, LedgerError, syncPosting } from "./core";
import { addMonths, diffLines, fiscalYearEnd, fiscalYearStart, monthEnd, monthsBetween, netLines, periodOf, vatPeriodOf, type Line } from "@/lib/ledger";
import {
  ageBalance, ageBounds, balanceSheetLayout, cashFlowLayout, debitCredit, incomeStatementLayout, isCashAccount, isMonth, isProfitAndLoss, keyRatios, lastYearRange,
  monthEndLabel, monthLabel, previousRange, rangeLabel, sumAged, vat201Rows, vatInputGroup, yearToDate,
  type Aged, type MonthRange, type ReportAccount, type Values, type VatInputGroup,
} from "@/lib/ledger-reports";
import { sourceLabel } from "@/lib/ledger-admin";
import { dayKey } from "@/lib/format";

type Client = Tx | typeof db;
export type ChartAccount = ReportAccount & { active: boolean };
const ACCOUNT = { id: true, code: true, name: true, type: true, key: true, party: true, active: true } as const;
const COMPANY = { id: true, name: true, legalName: true, kind: true, vatNumber: true, vatCategory: true, yearEndMonth: true, booksLockedThrough: true } as const;

/** The company's chart in code order — created from the template the first time anyone opens the books. */
export async function chartOf(companyId: string): Promise<ChartAccount[]> {
  const read = () => db.ledgerAccount.findMany({ where: { companyId }, select: ACCOUNT, orderBy: { code: "asc" } });
  const accounts = await read();
  if (accounts.some((a) => a.key)) return accounts;
  await tx((t) => booksFor(t, companyId));
  return read();
}

const companyOf = (companyId: string) => db.company.findUniqueOrThrow({ where: { id: companyId }, select: COMPANY });

/** The company's own stores, for its store filter (never another company's). */
export const companyStores = (companyId: string) => db.store.findMany({ where: { companyId }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });

/** A page's store filter: the company's stores, and the one picked (?store=) when it's one of them. */
export async function storeFilter(companyId: string, picked?: string | null) {
  const stores = await companyStores(companyId);
  return { stores, store: stores.find((s) => s.id === picked) ?? null };
}

/** This month, in South African time. */
export const thisMonth = (now = new Date()) => periodOf(dayKey(now));

const fyStartOf = (period: string, yearEndMonth: number) => fiscalYearStart(fiscalYearEnd(period, yearEndMonth));
const onStore = (col: string, storeId?: string | null) => (storeId ? Prisma.sql`AND ${Prisma.raw(col)} = ${storeId}` : Prisma.empty);
const zeros = (n: number): Values => Array<number>(n).fill(0);

// ── Names ────────────────────────────────────────────────────────────────────

/** Store id → code and name, for lines that carry a store (HQ's carry franchisee stores too). */
export async function storeNames(ids: string[]) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map<string, { code: string; name: string }>();
  const rows = await db.store.findMany({ where: { id: { in: list } }, select: { id: true, code: true, name: true } });
  return new Map(rows.map((s) => [s.id, { code: s.code, name: s.name }]));
}

/** Party id → name: a franchisee company, a trade account, or a supplier as last named on the company's invoices. */
export async function partyNames(companyId: string, party: string | null | undefined, ids: string[]) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length || !party) return new Map<string, string>();
  if (party === "COMPANY") return new Map((await db.company.findMany({ where: { id: { in: list } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  if (party === "TRADE_ACCOUNT")
    return new Map((await db.tradeAccount.findMany({ where: { id: { in: list } }, select: { id: true, name: true, number: true } })).map((a) => [a.id, `${a.name} (${a.number})`]));
  // Supplier parties are the normalised name (supplierParty): match it back to how the invoices spell it, or else
  // capitalise its words.
  const rows = await db.$queryRaw<{ key: string; name: string }[]>`
    SELECT DISTINCT ON (key) key, name FROM (
      SELECT lower(btrim(regexp_replace(si."supplierName", '[[:space:]]+', ' ', 'g'))) AS key, btrim(si."supplierName") AS name, si."createdAt"
      FROM "SupplierInvoice" si JOIN "Store" s ON s.id = si."storeId" WHERE s."companyId" = ${companyId}
    ) x WHERE key = ANY(${list}::text[]) ORDER BY key, "createdAt" DESC`;
  const spelt = new Map(rows.map((r) => [r.key, r.name]));
  return new Map(list.map((id) => [id, spelt.get(id) ?? id.replace(/(^|[\s(-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())]));
}

// ── Trial balance ────────────────────────────────────────────────────────────

export type TrialBalanceRow = { account: ChartAccount; opening: number; debit: number; credit: number; closing: number };

/**
 * Every account with anything in it: the balance before `from`, the range's debits and credits, and the closing
 * balance. Income and expense accounts start each financial year at nil; earlier years' profit is in retained
 * earnings (computed). For the whole company it sums to zero; one store's slice of the books needn't. (A range
 * spanning a year end runs income and expenses from the start of its first financial year.)
 */
export async function trialBalance(companyId: string, r: MonthRange & { storeId?: string | null }) {
  const [company, accounts] = await Promise.all([companyOf(companyId), chartOf(companyId)]);
  const fyStart = fyStartOf(r.from, company.yearEndMonth);
  const sums = await db.$queryRaw<{ accountId: string; earlier: number; year: number; debit: number; credit: number }[]>`
    SELECT "accountId",
      COALESCE(SUM("debitCents" - "creditCents") FILTER (WHERE period < ${fyStart}), 0)::float8 AS earlier,
      COALESCE(SUM("debitCents" - "creditCents") FILTER (WHERE period >= ${fyStart} AND period < ${r.from}), 0)::float8 AS year,
      COALESCE(SUM("debitCents") FILTER (WHERE period >= ${r.from}), 0)::float8 AS debit,
      COALESCE(SUM("creditCents") FILTER (WHERE period >= ${r.from}), 0)::float8 AS credit
    FROM "LedgerBalance" WHERE "companyId" = ${companyId} AND period <= ${r.to} ${onStore('"storeId"', r.storeId)}
    GROUP BY 1`;
  const by = new Map(sums.map((s) => [s.accountId, s]));
  const pl = new Set(accounts.filter((a) => isProfitAndLoss(a.type)).map((a) => a.id));
  const earlierProfit = sums.reduce((s, x) => s + (pl.has(x.accountId) ? x.earlier : 0), 0); // debit − credit: a profit is negative
  const rows: TrialBalanceRow[] = [];
  for (const a of accounts) {
    const s = by.get(a.id);
    const opening = (s?.year ?? 0) + (pl.has(a.id) ? 0 : (s?.earlier ?? 0)) + (a.key === "retained" ? earlierProfit : 0);
    const debit = s?.debit ?? 0;
    const credit = s?.credit ?? 0;
    if (opening || debit || credit) rows.push({ account: a, opening, debit, credit, closing: opening + debit - credit });
  }
  const totals = rows.reduce((t, x) => ({ opening: t.opening + x.opening, debit: t.debit + x.debit, credit: t.credit + x.credit, closing: t.closing + x.closing }), { opening: 0, debit: 0, credit: 0, closing: 0 });
  return { company, range: { from: r.from, to: r.to }, storeId: r.storeId ?? null, fyStart, rows, totals, earlierProfit: -earlierProfit || 0 };
}

// ── General ledger ───────────────────────────────────────────────────────────

export const LEDGER_PAGE_SIZE = 100;
export type LedgerLine = {
  id: string; journalId: string; number: number; date: string; source: string; sourceId: string | null; memo: string; lineMemo: string | null;
  storeId: string | null; partyId: string | null; cents: number; balance: number; late: boolean;
};
type RawLine = Omit<LedgerLine, "date" | "balance"> & { date: Date };
const LINE_COLUMNS = Prisma.sql`l.id, l."journalId", l.date, l."amountCents" AS cents, l.memo AS "lineMemo", l."storeId", l."partyId", j.number, j.memo, j.source, j."sourceId", j.late`;

/** Debit − credit of the P&L accounts before a month: the profit of earlier years, as a (negative) balance. */
async function profitBefore(companyId: string, period: string, storeId?: string | null) {
  const [x] = await db.$queryRaw<{ cents: number }[]>`
    SELECT COALESCE(SUM(b."debitCents" - b."creditCents"), 0)::float8 AS cents
    FROM "LedgerBalance" b JOIN "LedgerAccount" a ON a.id = b."accountId"
    WHERE b."companyId" = ${companyId} AND b.period < ${period} AND a.type IN ('INCOME', 'EXPENSE') ${onStore('b."storeId"', storeId)}`;
  return x.cents;
}

/**
 * One account's balance before `from` (debit − credit), as the trial balance shows it: income and expense accounts
 * since the start of the financial year, retained earnings with earlier years' profit, and a party's from its lines.
 */
async function openingBalance(companyId: string, yearEndMonth: number, account: ChartAccount, from: string, storeId?: string | null, partyId?: string | null) {
  const fyStart = fyStartOf(from, yearEndMonth);
  const since = isProfitAndLoss(account.type) ? fyStart : "0000-00";
  if (partyId) {
    const [x] = await db.$queryRaw<{ cents: number }[]>`
      SELECT COALESCE(SUM(l."amountCents"), 0)::float8 AS cents FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId"
      WHERE l."companyId" = ${companyId} AND l."accountId" = ${account.id} AND l."partyId" = ${partyId} AND l.period >= ${since} AND l.period < ${from}
        AND j.status = 'POSTED' ${onStore('l."storeId"', storeId)}`;
    return x.cents;
  }
  const [[own], earlier] = await Promise.all([
    db.$queryRaw<{ cents: number }[]>`
      SELECT COALESCE(SUM("debitCents" - "creditCents"), 0)::float8 AS cents FROM "LedgerBalance"
      WHERE "companyId" = ${companyId} AND "accountId" = ${account.id} AND period >= ${since} AND period < ${from} ${onStore('"storeId"', storeId)}`,
    account.key === "retained" ? profitBefore(companyId, fyStart, storeId) : 0,
  ]);
  return own.cents + earlier;
}

const toLine = (x: RawLine, balance: number): LedgerLine => ({ ...x, cents: Number(x.cents), date: x.date.toISOString().slice(0, 10), balance });

/**
 * One account's posted lines in a range, a page at a time, oldest first, each with the running balance — optionally
 * for one store or one party (`?party=` from the ageing). Null when the account isn't in these books.
 */
export async function accountLedger(companyId: string, accountId: string, r: MonthRange & { storeId?: string | null; partyId?: string | null }, page = 1) {
  const [company, account] = await Promise.all([companyOf(companyId), db.ledgerAccount.findFirst({ where: { id: accountId, companyId }, select: ACCOUNT })]);
  if (!account) return null;
  const where = Prisma.sql`l."companyId" = ${companyId} AND l."accountId" = ${accountId} AND l.period >= ${r.from} AND l.period <= ${r.to} AND j.status = 'POSTED'
    ${onStore('l."storeId"', r.storeId)} ${r.partyId ? Prisma.sql`AND l."partyId" = ${r.partyId}` : Prisma.empty}`;
  const [opening, [sum], rows] = await Promise.all([
    openingBalance(companyId, company.yearEndMonth, account, r.from, r.storeId, r.partyId),
    db.$queryRaw<{ n: number; debit: number; credit: number }[]>`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(GREATEST(l."amountCents", 0)), 0)::float8 AS debit, COALESCE(SUM(GREATEST(-l."amountCents", 0)), 0)::float8 AS credit
      FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId" WHERE ${where}`,
    db.$queryRaw<(RawLine & { running: number })[]>`
      SELECT ${LINE_COLUMNS}, (SUM(l."amountCents") OVER (ORDER BY l.date, j.number, l.id))::float8 AS running
      FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId" WHERE ${where}
      ORDER BY l.date, j.number, l.id OFFSET ${(Math.max(1, page) - 1) * LEDGER_PAGE_SIZE} LIMIT ${LEDGER_PAGE_SIZE}`,
  ]);
  const lines = rows.map((x) => toLine(x, opening + x.running));
  const [stores, parties] = await Promise.all([
    storeNames(lines.flatMap((l) => (l.storeId ? [l.storeId] : []))),
    partyNames(companyId, account.party, [...lines.flatMap((l) => (l.partyId ? [l.partyId] : [])), ...(r.partyId ? [r.partyId] : [])]),
  ]);
  return {
    company, account, range: { from: r.from, to: r.to }, storeId: r.storeId ?? null, partyId: r.partyId ?? null,
    opening, debit: sum.debit, credit: sum.credit, closing: opening + sum.debit - sum.credit,
    total: sum.n, page, pageSize: LEDGER_PAGE_SIZE, lines, stores, parties,
  };
}

/** Every posted line of one account in a range, oldest first, in batches with the running balance (the ledger CSV). */
export async function* accountLedgerRows(companyId: string, account: ChartAccount, r: MonthRange & { storeId?: string | null; partyId?: string | null }, batch = 5_000) {
  const company = await companyOf(companyId);
  let balance = await openingBalance(companyId, company.yearEndMonth, account, r.from, r.storeId, r.partyId);
  yield [{ date: null, memo: "Opening balance", balance }];
  for (const m of monthsBetween(r.from, r.to)) {
    let after: { date: string; number: number; id: string } | null = null;
    for (;;) {
      const rows: RawLine[] = await db.$queryRaw<RawLine[]>`
        SELECT ${LINE_COLUMNS} FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId"
        WHERE l."companyId" = ${companyId} AND l."accountId" = ${account.id} AND l.period = ${m} AND j.status = 'POSTED'
          ${onStore('l."storeId"', r.storeId)} ${r.partyId ? Prisma.sql`AND l."partyId" = ${r.partyId}` : Prisma.empty}
          ${after ? Prisma.sql`AND (l.date, j.number, l.id) > (${after.date}::date, ${after.number}, ${after.id})` : Prisma.empty}
        ORDER BY l.date, j.number, l.id LIMIT ${batch}`;
      if (!rows.length) break;
      const lines = rows.map((x) => toLine(x, (balance += Number(x.cents))));
      const [stores, parties] = await Promise.all([storeNames(lines.flatMap((l) => (l.storeId ? [l.storeId] : []))), partyNames(companyId, account.party, lines.flatMap((l) => (l.partyId ? [l.partyId] : [])))]);
      yield lines.map((l) => ({
        date: l.date, number: l.number, source: sourceLabel(l.source), memo: l.lineMemo ? `${l.memo} — ${l.lineMemo}` : l.memo,
        store: l.storeId ? (stores.get(l.storeId)?.code ?? l.storeId) : "", party: l.partyId ? (parties.get(l.partyId) ?? l.partyId) : "", ...debitCredit(l.cents), balance: l.balance,
      }));
      if (rows.length < batch) break;
      const last = lines[lines.length - 1];
      after = { date: last.date, number: last.number, id: last.id };
    }
  }
}

type RawJournalLine = {
  id: string; number: number; date: Date; source: string; sourceId: string | null; memo: string; code: string; account: string; party: string | null;
  storeId: string | null; partyId: string | null; cents: number; lineMemo: string | null;
};

/** Every posted journal line in a range of months, in journal order, in batches (the journals CSV). */
export async function* journalRows(companyId: string, r: MonthRange, batch = 5_000) {
  for (const m of monthsBetween(r.from, r.to)) {
    let after: { number: number; id: string } | null = null;
    for (;;) {
      const rows: RawJournalLine[] = await db.$queryRaw<RawJournalLine[]>`
        SELECT l.id, j.number, j.date, j.source, j."sourceId", j.memo, a.code, a.name AS account, a.party, l."storeId", l."partyId", l."amountCents" AS cents, l.memo AS "lineMemo"
        FROM "Journal" j JOIN "JournalLine" l ON l."journalId" = j.id JOIN "LedgerAccount" a ON a.id = l."accountId"
        WHERE j."companyId" = ${companyId} AND j.period = ${m} AND j.status = 'POSTED' ${after ? Prisma.sql`AND (j.number, l.id) > (${after.number}, ${after.id})` : Prisma.empty}
        ORDER BY j.number, l.id LIMIT ${batch}`;
      if (!rows.length) break;
      const kinds = [...new Set(rows.flatMap((x) => (x.party && x.partyId ? [x.party] : [])))];
      const [stores, ...named] = await Promise.all([
        storeNames(rows.flatMap((x) => (x.storeId ? [x.storeId] : []))),
        ...kinds.map((k) => partyNames(companyId, k, rows.flatMap((x) => (x.party === k && x.partyId ? [x.partyId] : [])))),
      ]);
      const parties = new Map(named.flatMap((n) => [...n]));
      yield rows.map((x) => ({
        number: x.number, date: x.date.toISOString().slice(0, 10), source: sourceLabel(x.source), reference: x.sourceId ?? "", memo: x.memo, code: x.code, account: x.account,
        store: x.storeId ? (stores.get(x.storeId)?.code ?? x.storeId) : "", party: x.partyId ? (parties.get(x.partyId) ?? x.partyId) : "", ...debitCredit(Number(x.cents)), lineMemo: x.lineMemo ?? "",
      }));
      if (rows.length < batch) break;
      after = { number: rows[rows.length - 1].number, id: rows[rows.length - 1].id };
    }
  }
}

// ── Income statement ─────────────────────────────────────────────────────────

/** A column of a report: a range of months, optionally one store's lines or "other" (lines on none of the company's stores). */
export type ReportColumn = MonthRange & { key: string; label: string; storeId?: string | null; other?: boolean };

/** P&L balances (debit − credit) by account for each column, from the monthly running balances. */
export async function profitAndLossColumns(companyId: string, columns: ReportColumn[], storeId?: string | null, ownStores: string[] = []) {
  const from = columns.reduce((m, c) => (c.from < m ? c.from : m), columns[0].from);
  const to = columns.reduce((m, c) => (c.to > m ? c.to : m), columns[0].to);
  const byStore = columns.some((c) => c.storeId || c.other);
  const rows = await db.$queryRaw<{ accountId: string; period: string; store: string; cents: number }[]>`
    SELECT b."accountId", b.period, ${byStore ? Prisma.sql`CASE WHEN b."storeId" = ANY(${ownStores}::text[]) THEN b."storeId" ELSE '' END` : Prisma.sql`''`} AS store,
      SUM(b."debitCents" - b."creditCents")::float8 AS cents
    FROM "LedgerBalance" b JOIN "LedgerAccount" a ON a.id = b."accountId"
    WHERE b."companyId" = ${companyId} AND a.type IN ('INCOME', 'EXPENSE') AND b.period >= ${from} AND b.period <= ${to} ${onStore('b."storeId"', storeId)}
    GROUP BY 1, 2, 3`;
  const out = new Map<string, Values>();
  for (const x of rows) {
    const v = out.get(x.accountId) ?? zeros(columns.length);
    columns.forEach((c, i) => {
      if (x.period < c.from || x.period > c.to || (c.storeId && x.store !== c.storeId) || (c.other && x.store)) return;
      v[i] += x.cents;
    });
    out.set(x.accountId, v);
  }
  return out;
}

export type IncomeOptions = MonthRange & { storeId?: string | null; compare?: "previous" | "lastYear" | null; by?: "month" | "store" | null };

/**
 * The income statement for a range: one column, or a column per month or per store (with a total), plus a column
 * comparing with the period before or the same months last year.
 */
export async function incomeStatement(companyId: string, o: IncomeOptions) {
  const [accounts, stores] = await Promise.all([chartOf(companyId), companyStores(companyId)]);
  const r = { from: o.from, to: o.to };
  const total: ReportColumn = { key: "total", label: o.by ? "Total" : rangeLabel(r), ...r };
  const by = o.by === "month" && o.from !== o.to ? "month" : o.by === "store" && !o.storeId && stores.length > 1 ? "store" : null;
  const main: ReportColumn[] =
    by === "month"
      ? [...monthsBetween(r.from, r.to).map((m) => ({ key: m, label: monthLabel(m, true), from: m, to: m })), total]
      : by === "store"
        ? [...stores.map((s) => ({ key: s.id, label: s.name, ...r, storeId: s.id })), { key: "other", label: "Company level", ...r, other: true }, total]
        : [{ ...total, label: rangeLabel(r) }];
  const compare = o.compare === "previous" ? previousRange(r) : o.compare === "lastYear" ? lastYearRange(r) : null;
  let columns = compare ? [...main, { key: "compare", label: rangeLabel(compare), ...compare }] : main;
  let balances = await profitAndLossColumns(companyId, columns, o.storeId, stores.map((s) => s.id));
  const other = columns.findIndex((c) => c.other);
  if (other >= 0 && ![...balances.values()].some((v) => v[other])) {
    columns = columns.filter((_, i) => i !== other);
    balances = new Map([...balances].map(([k, v]) => [k, v.filter((_, i) => i !== other)]));
  }
  return { range: r, compare, by, columns, storeId: o.storeId ?? null, ...incomeStatementLayout(accounts, balances, columns.length) };
}

// ── Balance sheet ────────────────────────────────────────────────────────────

/**
 * Cumulative balances (debit − credit) by account as at the end of each month in `asOfs`, with each one's profit of
 * earlier financial years and of its own year so far (credit-positive), for the computed retained earnings.
 */
export async function balanceColumns(companyId: string, asOfs: string[], yearEndMonth: number, storeId?: string | null) {
  const n = asOfs.length;
  const balances = new Map<string, Values>();
  const priorYears = zeros(n);
  const thisYear = zeros(n);
  const all = await Promise.all(
    asOfs.map((asOf) => {
      const fyStart = fyStartOf(asOf, yearEndMonth);
      return db.$queryRaw<{ accountId: string; pl: boolean; earlier: number; year: number }[]>`
        SELECT b."accountId", a.type IN ('INCOME', 'EXPENSE') AS pl,
          COALESCE(SUM(b."debitCents" - b."creditCents") FILTER (WHERE b.period < ${fyStart}), 0)::float8 AS earlier,
          COALESCE(SUM(b."debitCents" - b."creditCents") FILTER (WHERE b.period >= ${fyStart}), 0)::float8 AS year
        FROM "LedgerBalance" b JOIN "LedgerAccount" a ON a.id = b."accountId"
        WHERE b."companyId" = ${companyId} AND b.period <= ${asOf} ${onStore('b."storeId"', storeId)}
        GROUP BY 1, 2`;
    }),
  );
  all.forEach((rows, i) => {
    for (const x of rows) {
      if (x.pl) {
        priorYears[i] -= x.earlier;
        thisYear[i] -= x.year;
        continue;
      }
      const v = balances.get(x.accountId) ?? zeros(n);
      v[i] = x.earlier + x.year;
      balances.set(x.accountId, v);
    }
  });
  return { balances, priorYears: priorYears.map((v) => v || 0), thisYear: thisYear.map((v) => v || 0) };
}

/**
 * The balance sheet as at the end of `asOf` (and of `compareTo`, when given). It balances for the whole company; a
 * store's slice shows what the rest of the company funded as the balancing line.
 */
export async function balanceSheet(companyId: string, asOf: string, o: { storeId?: string | null; compareTo?: string | null } = {}) {
  const [company, accounts] = await Promise.all([companyOf(companyId), chartOf(companyId)]);
  const dates = o.compareTo && o.compareTo !== asOf ? [asOf, o.compareTo] : [asOf];
  const { balances, priorYears, thisYear } = await balanceColumns(companyId, dates, company.yearEndMonth, o.storeId);
  const layout = balanceSheetLayout(accounts, balances, dates.length, { priorYears, thisYear }, o.storeId ? "Funded by the rest of the company" : undefined);
  return { company, columns: dates.map((m) => ({ key: m, label: monthEndLabel(m), asOf: m, fyStart: fyStartOf(m, company.yearEndMonth) })), storeId: o.storeId ?? null, priorYears, thisYear, ...layout };
}

// ── Cash flow ────────────────────────────────────────────────────────────────

/** Stock and the cost of it: a journal's lines on these that net to nil are a stock movement, not cash. */
const STOCK_KEYS = ["stock", "transit", "grni", "cogs", "stock.loss", "stock.count", "stock.transit"];

/** The company's cash-like accounts: bank, cash, card and online payments, and every bank account it added. */
export async function cashAccountsOf(companyId: string, accounts?: ChartAccount[]) {
  const [chart, banks] = await Promise.all([accounts ?? chartOf(companyId), db.bankAccount.findMany({ where: { companyId }, select: { accountId: true } })]);
  const ids = new Set(banks.map((b) => b.accountId));
  return chart.filter((a) => isCashAccount(a, ids));
}

/**
 * The cash flow statement (direct method) for one or more ranges: the cash accounts' opening and closing balances,
 * and every journal that moved cash classified by its other lines — operating, investing (fixed assets) or financing
 * (loans and equity).
 */
export async function cashFlowColumns(companyId: string, ranges: MonthRange[], storeId?: string | null) {
  const accounts = await chartOf(companyId);
  const cash = (await cashAccountsOf(companyId, accounts)).map((a) => a.id);
  const n = ranges.length;
  const flows = new Map<string, Values>();
  const opening = zeros(n);
  const closing = zeros(n);
  await Promise.all(
    ranges.map(async (r, i) => {
      const [[bal], rows] = await Promise.all([
        db.$queryRaw<{ opening: number; closing: number }[]>`
          SELECT COALESCE(SUM("debitCents" - "creditCents") FILTER (WHERE period < ${r.from}), 0)::float8 AS opening,
            COALESCE(SUM("debitCents" - "creditCents"), 0)::float8 AS closing
          FROM "LedgerBalance" WHERE "companyId" = ${companyId} AND "accountId" = ANY(${cash}::text[]) AND period <= ${r.to} ${onStore('"storeId"', storeId)}`,
        // A trading day's stock sold (cost of sales against stock) rides in the same journal as its takings but moves no
        // cash: stock and cost lines that net to nil within a journal are left out.
        db.$queryRaw<{ accountId: string; cents: number }[]>`
          SELECT x."accountId", SUM(x.cents)::float8 AS cents FROM (
            SELECT l."accountId", l."amountCents" AS cents, a.key = ANY(${STOCK_KEYS}::text[]) AS stock,
              SUM(l."amountCents") OVER (PARTITION BY l."journalId", COALESCE(a.key = ANY(${STOCK_KEYS}::text[]), false)) AS together
            FROM "JournalLine" l JOIN "LedgerAccount" a ON a.id = l."accountId"
            WHERE l."journalId" IN (
                SELECT c."journalId" FROM "JournalLine" c JOIN "Journal" j ON j.id = c."journalId"
                WHERE c."companyId" = ${companyId} AND c."accountId" = ANY(${cash}::text[]) AND c.period >= ${r.from} AND c.period <= ${r.to}
                  AND j.status = 'POSTED' ${onStore('c."storeId"', storeId)})
              AND NOT (l."accountId" = ANY(${cash}::text[])) ${onStore('l."storeId"', storeId)}
          ) x WHERE NOT (COALESCE(x.stock, false) AND x.together = 0)
          GROUP BY 1`,
      ]);
      opening[i] = bal.opening;
      closing[i] = bal.closing;
      for (const x of rows) {
        const v = flows.get(x.accountId) ?? zeros(n);
        v[i] = -x.cents || 0; // the other side of the cash: a credit to income is cash in
        flows.set(x.accountId, v);
      }
    }),
  );
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const list = [...flows].flatMap(([id, values]) => (byId.has(id) ? [{ account: byId.get(id)!, values }] : []));
  return { cashAccounts: accounts.filter((a) => cash.includes(a.id)), ...cashFlowLayout(list, opening, closing, n) };
}

export async function cashFlow(companyId: string, r: MonthRange & { storeId?: string | null }) {
  return { range: { from: r.from, to: r.to }, storeId: r.storeId ?? null, ...(await cashFlowColumns(companyId, [r], r.storeId)) };
}

// ── Ageing ───────────────────────────────────────────────────────────────────

export type AgeingKind = "debtors" | "creditors" | "franchise";
export type AgedParty = Aged & { partyId: string | null; name: string };

/** The ageing tabs a company has: trade debtors are HQ's alone. */
export const ageingKinds = (kind: "FRANCHISOR" | "FRANCHISEE"): AgeingKind[] => (kind === "FRANCHISOR" ? ["debtors", "creditors", "franchise"] : ["creditors", "franchise"]);

/**
 * Party balances as at `asOf` (a day), aged FIFO: trade debtors by trade account, creditors by supplier, and the
 * franchise current accounts — HQ's with each franchisee company, or a franchisee's one account with HQ. Amounts are
 * in the account's normal direction: what's owed to the company on an asset, what it owes on a liability.
 */
export async function ageing(companyId: string, kind: AgeingKind, asOf: string) {
  const [company, accounts] = await Promise.all([companyOf(companyId), chartOf(companyId)]);
  const key = kind === "franchise" ? (company.kind === "FRANCHISOR" ? "franchisees" : "hq") : kind;
  const account = accounts.find((a) => a.key === key) ?? null;
  if (!account) return { company, kind, asOf, account, rows: [] as AgedParty[], totals: sumAged([]) };
  const sign = account.type === "ASSET" ? 1 : -1;
  const b = ageBounds(asOf);
  const sums = await db.$queryRaw<{ partyId: string | null; balance: number; dr0: number; dr30: number; dr60: number; cr0: number; cr30: number; cr60: number }[]>`
    SELECT l."partyId", SUM(l."amountCents")::float8 AS balance,
      COALESCE(SUM(l."amountCents") FILTER (WHERE l."amountCents" > 0 AND l.date >= ${b.current}::date), 0)::float8 AS dr0,
      COALESCE(SUM(l."amountCents") FILTER (WHERE l."amountCents" > 0 AND l.date >= ${b.d30}::date AND l.date < ${b.current}::date), 0)::float8 AS dr30,
      COALESCE(SUM(l."amountCents") FILTER (WHERE l."amountCents" > 0 AND l.date >= ${b.d60}::date AND l.date < ${b.d30}::date), 0)::float8 AS dr60,
      COALESCE(-SUM(l."amountCents") FILTER (WHERE l."amountCents" < 0 AND l.date >= ${b.current}::date), 0)::float8 AS cr0,
      COALESCE(-SUM(l."amountCents") FILTER (WHERE l."amountCents" < 0 AND l.date >= ${b.d30}::date AND l.date < ${b.current}::date), 0)::float8 AS cr30,
      COALESCE(-SUM(l."amountCents") FILTER (WHERE l."amountCents" < 0 AND l.date >= ${b.d60}::date AND l.date < ${b.d30}::date), 0)::float8 AS cr60
    FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId"
    WHERE l."companyId" = ${companyId} AND l."accountId" = ${account.id} AND l.date <= ${asOf}::date AND j.status = 'POSTED'
    GROUP BY 1 HAVING SUM(l."amountCents") <> 0`;
  const names = await partyNames(companyId, account.party, sums.flatMap((x) => (x.partyId ? [x.partyId] : [])));
  const rows: AgedParty[] = sums
    .map((x) => {
      const dr = { current: x.dr0, d30: x.dr30, d60: x.dr60 };
      const cr = { current: x.cr0, d30: x.cr30, d60: x.cr60 };
      const name = x.partyId ? (names.get(x.partyId) ?? x.partyId) : key === "hq" ? "Herbal Holland" : "No party named";
      return { partyId: x.partyId, name, ...ageBalance(sign * x.balance, sign > 0 ? dr : cr, sign > 0 ? cr : dr) };
    })
    .sort((p, q) => q.total - p.total || p.name.localeCompare(q.name));
  return { company, kind, asOf, account, rows, totals: sumAged(rows) };
}

// ── VAT ──────────────────────────────────────────────────────────────────────

/** open: the period isn't over · nil: no VAT in it · due: over, not closed · closed · changed: VAT posted into it since it was closed. */
export type VatStatus = "open" | "nil" | "due" | "closed" | "changed";
type VatIds = { output: string; input: string; control: string };
type VatMovement = { accountId: string; storeId: string | null; cents: number };

const vatIds = (accounts: { id: string; key: string | null }[]): VatIds => {
  const id = (key: string) => accounts.find((a) => a.key === key)?.id ?? "";
  return { output: id("vat.output"), input: id("vat.input"), control: id("vat.control") };
};

/** The VAT accounts' movements in a VAT period, store by store, leaving out closing journals (`vat-period`). */
async function vatMovements(c: Client, companyId: string, ids: VatIds, p: MonthRange): Promise<VatMovement[]> {
  const accountId = { in: [ids.output, ids.input] };
  const [balances, closings] = await Promise.all([
    c.ledgerBalance.groupBy({ by: ["accountId", "storeId"], where: { companyId, accountId, period: { gte: p.from, lte: p.to } }, _sum: { debitCents: true, creditCents: true } }),
    c.journalLine.groupBy({ by: ["accountId", "storeId"], where: { companyId, accountId, period: { gte: p.from, lte: p.to }, journal: { source: "vat-period", status: "POSTED" } }, _sum: { amountCents: true } }),
  ]);
  const out = new Map<string, VatMovement>();
  const add = (accountId: string, storeId: string | null, cents: number) => {
    const k = `${accountId}|${storeId ?? ""}`;
    const m = out.get(k) ?? { accountId, storeId, cents: 0 };
    m.cents += cents;
    out.set(k, m);
  };
  for (const b of balances) add(b.accountId, b.storeId || null, Number(b._sum.debitCents ?? 0) - Number(b._sum.creditCents ?? 0));
  for (const l of closings) add(l.accountId, l.storeId || null, -(l._sum.amountCents ?? 0));
  return [...out.values()].filter((m) => m.cents !== 0);
}

/** What closing a VAT period posts: each store's output and input VAT moved into VAT due to / from SARS. */
const closingLines = (movements: VatMovement[], ids: VatIds): Line[] =>
  netLines(movements.flatMap((m) => [{ accountId: m.accountId, cents: -m.cents, storeId: m.storeId }, { accountId: ids.control, cents: m.cents, storeId: m.storeId }]));

const vatSourceId = (companyId: string, p: MonthRange) => `${companyId}:${p.to}`;

/**
 * The VAT201 working for the SARS VAT period containing `period` (by the company's VAT category): output and input
 * tax posted in it (closing journals left out), standard-rated supplies from the income accounts those output VAT
 * lines were charged with, and input tax by VAT201 line. Non-vendors get `vendor: false`.
 */
export async function vatReturn(companyId: string, period: string, now = new Date()) {
  const company = await companyOf(companyId);
  if (!company.vatNumber) return { vendor: false as const, company };
  const category = company.vatCategory ?? "C";
  const p = vatPeriodOf(period, category);
  const accounts = await chartOf(companyId);
  const ids = vatIds(accounts);
  const sourceId = vatSourceId(companyId, p);
  const notClosing = Prisma.sql`j.status = 'POSTED' AND j.source <> 'vat-period'`;
  const [movements, supplies, inputs, posted, journals] = await Promise.all([
    vatMovements(db, companyId, ids, p),
    db.$queryRaw<{ accountId: string; cents: number }[]>`
      SELECT l."accountId", SUM(l."amountCents")::float8 AS cents
      FROM "JournalLine" l JOIN "LedgerAccount" a ON a.id = l."accountId"
      WHERE a.type = 'INCOME' AND l."journalId" IN (
        SELECT o."journalId" FROM "JournalLine" o JOIN "Journal" j ON j.id = o."journalId"
        WHERE o."companyId" = ${companyId} AND o."accountId" = ${ids.output} AND o.period >= ${p.from} AND o.period <= ${p.to} AND ${notClosing})
      GROUP BY 1`,
    db.$queryRaw<{ source: string; capital: boolean; stock: boolean; cents: number }[]>`
      SELECT j.source, x.capital, x.stock, SUM(x.vat)::float8 AS cents FROM (
        SELECT l."journalId",
          BOOL_OR(l."amountCents" > 0 AND a.type = 'ASSET' AND a.code LIKE '15%') AS capital,
          BOOL_OR(l."amountCents" > 0 AND a.key IN ('stock', 'transit', 'grni')) AS stock,
          SUM(l."amountCents") FILTER (WHERE l."accountId" = ${ids.input}) AS vat
        FROM "JournalLine" l JOIN "LedgerAccount" a ON a.id = l."accountId"
        WHERE l."journalId" IN (
          SELECT i."journalId" FROM "JournalLine" i JOIN "Journal" j ON j.id = i."journalId"
          WHERE i."companyId" = ${companyId} AND i."accountId" = ${ids.input} AND i.period >= ${p.from} AND i.period <= ${p.to} AND ${notClosing})
        GROUP BY 1
      ) x JOIN "Journal" j ON j.id = x."journalId"
      GROUP BY 1, 2, 3`,
    db.journalLine.groupBy({ by: ["accountId", "storeId", "partyId"], where: { companyId, journal: { source: "vat-period", sourceId, status: "POSTED" } }, _sum: { amountCents: true } }),
    db.journal.findMany({ where: { companyId, source: "vat-period", sourceId, status: "POSTED" }, orderBy: { number: "asc" }, select: { id: true, number: true, date: true, late: true, createdAt: true } }),
  ]);
  const sum = (key: string) => movements.filter((m) => m.accountId === key).reduce((s, m) => s + m.cents, 0);
  const output = -sum(ids.output) || 0;
  const input = sum(ids.input);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const supplyRows = supplies
    .flatMap((x) => (byId.has(x.accountId) && x.cents ? [{ account: byId.get(x.accountId)!, exVat: -x.cents }] : []))
    .sort((a, b) => a.account.code.localeCompare(b.account.code));
  const suppliesEx = supplyRows.reduce((s, x) => s + x.exVat, 0);
  const inputBy: Partial<Record<VatInputGroup, number>> = {};
  for (const x of inputs) {
    const g = vatInputGroup(x.source, x);
    inputBy[g] = (inputBy[g] ?? 0) + x.cents;
  }
  // Still to move: the difference between what closing would post now and what the closing journals posted.
  const pending = diffLines(closingLines(movements, ids), posted.map((x) => ({ accountId: x.accountId, storeId: x.storeId, partyId: x.partyId, cents: x._sum.amountCents ?? 0 })));
  const over = p.to < thisMonth(now);
  const status: VatStatus = !over ? "open" : journals.length ? (pending.length ? "changed" : "closed") : movements.length ? "due" : "nil";
  return {
    vendor: true as const, company, category, categorySet: !!company.vatCategory, period: p, over, status, journals,
    output, input, payable: output - input, suppliesEx, suppliesIncl: suppliesEx + output, supplies: supplyRows, inputBy,
    rows: vat201Rows({ suppliesInclCents: suppliesEx + output, outputCents: output, input: inputBy }),
    // Output tax against 15% of the standard-rated income: they differ by rounding, or by VAT charged on supplies
    // credited elsewhere (HQ's marketing levy is credited to the marketing fund).
    outputGap: output - Math.round(suppliesEx * 0.15),
    pendingPayable: -pending.filter((l) => l.accountId === ids.control).reduce((s, l) => s + l.cents, 0) || 0,
  };
}

/**
 * Closes a VAT period that's over: a `vat-period` posting (via syncPosting, so closing again only moves what was
 * posted into the period since) dated the period's last day, moving its output and input VAT into VAT due to / from
 * SARS, store by store. The caller checks the books role ("approve"); audited.
 */
export async function closeVatPeriod(companyId: string, period: string, actor: Actor, now = new Date()) {
  if (!isMonth(period)) throw new LedgerError("Choose a VAT period");
  return tx(async (t) => {
    const company = await t.company.findUniqueOrThrow({ where: { id: companyId }, select: COMPANY });
    if (!company.vatNumber) throw new LedgerError(`${company.name} isn't a VAT vendor, so there's no VAT period to close`);
    if (!company.vatCategory) throw new LedgerError("Set the company's VAT category (A, B or C) in the books settings first");
    const p = vatPeriodOf(period, company.vatCategory);
    if (p.to >= thisMonth(now)) throw new LedgerError(`The VAT period ${rangeLabel(p)} isn't over yet — close it after ${monthEndLabel(p.to)}`);
    const sourceId = vatSourceId(companyId, p);
    await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger:vat-period:${sourceId}`}))`;
    const book = await booksFor(t, companyId);
    const ids = { output: book.accounts.get("vat.output")!, input: book.accounts.get("vat.input")!, control: book.accounts.get("vat.control")! };
    const movements = await vatMovements(t, companyId, ids, p);
    const lines = closingLines(movements, ids);
    const output = -movements.filter((m) => m.accountId === ids.output).reduce((s, m) => s + m.cents, 0) || 0;
    const input = movements.filter((m) => m.accountId === ids.input).reduce((s, m) => s + m.cents, 0);
    const journal = await syncPosting(t, "vat-period", sourceId, companyId, lines.length ? { companyId, date: monthEnd(p.to), memo: `VAT period ${rangeLabel(p)} closed`, lines } : null);
    await audit(t, actor, "ledger.vat_close", { entity: "Company", entityId: companyId, data: { from: p.from, to: p.to, output, input, payable: output - input, journal: journal?.number ?? null } });
    return { period: p, journal, output, input, payable: output - input };
  });
}

// ── Management pack ──────────────────────────────────────────────────────────

/**
 * The monthly management pack: the income statement for the month and the financial year to date, the balance sheet
 * at the month's end against the last financial year end, the cash flow for the month and the year to date, and the
 * key ratios for both.
 */
export async function managementPack(companyId: string, month: string) {
  const [company, accounts] = await Promise.all([companyOf(companyId), chartOf(companyId)]);
  const ytd = yearToDate(month, company.yearEndMonth);
  const lastYearEnd = addMonths(ytd.from, -1);
  const columns: ReportColumn[] = [
    { key: "month", label: monthLabel(month), from: month, to: month },
    { key: "ytd", label: "Year to date", ...ytd },
  ];
  const [pl, balance, cash] = await Promise.all([
    profitAndLossColumns(companyId, columns),
    balanceSheet(companyId, month, { compareTo: lastYearEnd }),
    cashFlowColumns(companyId, [{ from: month, to: month }, ytd]),
  ]);
  const income = incomeStatementLayout(accounts, pl, 2);
  const stock = balance.lines.reduce((s, l) => s + (l.kind === "account" && (l.account.key === "stock" || l.account.key === "transit") ? l.values[0] : 0), 0);
  const ratios = (i: number) =>
    keyRatios({
      revenue: income.revenue[i], grossProfit: income.grossProfit[i], netProfit: income.netProfit[i], operatingExpenses: income.operatingExpenses[i],
      currentAssets: balance.currentAssets[0], currentLiabilities: balance.currentLiabilities[0], stock, liabilities: balance.liabilities[0], equity: balance.equity[0],
    });
  return { company, month, ytd, lastYearEnd, columns, income, balance, cash, ratios: { month: ratios(0), ytd: ratios(1) } };
}
