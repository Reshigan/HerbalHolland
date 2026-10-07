// Bank statements, read in pure code: the CSV exports of the big five South African banks (FNB, Absa, Standard Bank,
// Nedbank, Capitec), OFX/QFX, and any other CSV by its columns. Each becomes statement lines — a day, signed cents
// (money in positive), the description, the reference and the balance after it — in date order, with a stable hash so
// importing the same statement again adds nothing. matchCandidates ranks the postings a line could be matched to, and
// reconcile explains the books against the statement.
import { createHash } from "node:crypto";

export const BANKS = { FNB: "FNB", ABSA: "Absa", STANDARD: "Standard Bank", NEDBANK: "Nedbank", CAPITEC: "Capitec", OTHER: "Other bank" } as const;
export type Bank = keyof typeof BANKS;

/** How an imported file is read: a bank's own export, OFX, or a CSV with its columns named. AUTO tells from the file. */
export const FORMATS = {
  AUTO: "Work it out from the file",
  FNB: "FNB (CSV)",
  ABSA: "Absa (CSV)",
  STANDARD: "Standard Bank (CSV)",
  NEDBANK: "Nedbank (CSV)",
  CAPITEC: "Capitec (CSV)",
  OFX: "OFX / QFX",
  CSV: "Other CSV — name the columns",
} as const;
export type StatementFormat = keyof typeof FORMATS;
export type ReadFormat = Exclude<StatementFormat, "AUTO">;

/** One statement line: money in positive, out negative; the balance after it when the bank gives one. */
export type StatementLine = { date: string; amountCents: number; description: string; reference?: string; balanceCents?: number };
/** A CSV's columns by heading (as in the file) or number (1 = the first column). */
export type ColumnMap = { date: string; description: string; amount?: string; debit?: string; credit?: string; balance?: string; reference?: string };
export type ReadStatement = { format: ReadFormat; lines: StatementLine[]; failed: { row: number; error: string }[]; skipped: number; account?: string };

export class StatementError extends Error {}

export const STATEMENT_MAX_BYTES = 5 * 1024 * 1024;
export const STATEMENT_MAX_LINES = 20_000;
/** The most one statement line can hold (R21.47m): a bigger amount is refused, a bigger balance left off. */
export const LINE_MAX_CENTS = 2_147_483_647;
const TOO_BIG = "the amount is more than R21 million — split it, or capture it as a journal";

const NOT_RECOGNISED =
  "We don't recognise this file. Download the transactions from your online banking as CSV or OFX, or choose “Other CSV” and name the date, description and amount columns.";
type BankFormat = Exclude<ReadFormat, "OFX" | "CSV">;
const EXPECT: Record<BankFormat, string> = {
  FNB: "its columns are Date, Description1–3, Amount and Balance",
  ABSA: "its columns are Date, Transaction Description, Debit Amount, Credit Amount and Balance",
  STANDARD: "it has HIST lines, or Date, Description and Amount columns",
  NEDBANK: "its columns are Date, Description, Amount and Balance",
  CAPITEC: "its columns are Posting Date, Description, Money In, Money Out, Fee and Balance",
};

// ── The file ───────────────────────────────────────────────────────────────────

/** The file's text: UTF-8, UTF-16 (Excel's “Unicode text”) or Windows-1252 (older exports). Workbooks and PDFs are refused. */
export function decodeStatement(bytes: Uint8Array): string {
  if ((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf))
    throw new StatementError("That's a spreadsheet workbook: download the transactions as CSV or OFX instead (in Excel: File → Save As → “CSV UTF-8”).");
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) throw new StatementError("That's a PDF statement: download the transactions as CSV or OFX from your online banking instead.");
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const countOutside = (line: string, d: string) => {
  let quoted = false, n = 0;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === d && !quoted) n++;
  }
  return n;
};

/** The delimiter that splits the most lines into the same number of cells (so decimal commas don't fool it). */
function sniffDelimiter(text: string) {
  const lines = text.split(/\r?\n/, 60).filter((l) => l.trim());
  let best = ",", score = 0;
  for (const d of [",", ";", "\t", "|"]) {
    const freq = new Map<number, number>();
    for (const l of lines) {
      const n = countOutside(l, d);
      if (n) freq.set(n, (freq.get(n) ?? 0) + 1);
    }
    for (const [n, f] of freq) if (f * 1000 + n > score) (score = f * 1000 + n), (best = d);
  }
  return best;
}

const clean = (cell: string) =>
  cell
    .replace(/[    ]/g, " ")
    .trim()
    .replace(/^'(.*)'$/, "$1")
    .replace(/^'(?=[=+\-@\d])/, "")
    .replace(/\s+/g, " ");

/** RFC 4180 rows (comma, semicolon, tab or pipe separated; quoted cells; CRLF or LF; BOM; Excel's sep= line), trimmed. */
const CELL_MAX = 1_000; // a cell is never more than a long description

export function csvRows(text: string): string[][] {
  let src = text.replace(/^﻿/, "");
  let d: string;
  const hint = src.match(/^sep=(.)\r?\n/i);
  if (hint) (d = hint[1]), (src = src.slice(hint[0].length));
  else d = sniffDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') (cell += '"'), i++;
      else quoted = false;
    } else if (ch === '"' && !cell.trim()) (quoted = true), (cell = "");
    else if (ch === d) row.push(cell.slice(0, CELL_MAX)), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell.slice(0, CELL_MAX)), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (quoted) throw new StatementError(`A quoted cell is never closed — look for a stray " on or after row ${rows.length + 1}.`);
  if (cell || row.length) row.push(cell.slice(0, CELL_MAX)), rows.push(row);
  return rows.map((r) => r.map(clean));
}

// ── Cells ──────────────────────────────────────────────────────────────────────

const count = (s: string, ch: string) => s.split(ch).length - 1;

/**
 * Rand as banks write them → cents: "1 234,56", "1,234.56", "1.234,56", "R -50.00", "(150.00)", "150.00-",
 * "150.00 DR" (out) / "150.00 CR" (in), "−150". Empty → null. A lone separator before exactly three digits groups
 * thousands ("1,234" is R1 234): money has two decimals.
 */
export function readAmount(raw: string): number | null {
  let s = raw.replace(/[    ]/g, " ").trim();
  if (!s || /^[-—–]$/.test(s)) return null;
  if (s.length > 40) throw new StatementError(`“${s.slice(0, 40)}…” isn't an amount`);
  const bad = (why = "isn't an amount"): never => {
    throw new StatementError(`“${raw.trim()}” ${why}`);
  };
  let neg = false;
  let dir: "CR" | "DR" | null = null;
  const suffix = s.match(/(CR|DR)\.?$/i); // the space before it goes with the trim
  if (suffix) (dir = suffix[1].toUpperCase() as "CR" | "DR"), (s = s.slice(0, suffix.index).trim());
  const paren = s.match(/^\((.*)\)$/);
  if (paren) (neg = true), (s = paren[1].trim());
  const minus = () => {
    if (/^[-−–]/.test(s)) (neg = true), (s = s.slice(1).trim());
    else if (s.startsWith("+")) s = s.slice(1).trim();
  };
  minus();
  s = s.replace(/^(ZAR|R)\s*/i, "");
  minus();
  if (/[-−–]$/.test(s)) (neg = true), (s = s.slice(0, -1).trim());
  s = s.replace(/[\s']/g, "");
  if (!/^(\d[\d.,]*|[.,]\d+)$/.test(s)) bad();
  let whole = s, frac = "";
  const dots = count(s, "."), commas = count(s, ",");
  if (dots && commas) {
    const point = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    if (count(s, point) > 1) bad();
    whole = s.slice(0, s.lastIndexOf(point)).replaceAll(point === "." ? "," : ".", "");
    frac = s.slice(s.lastIndexOf(point) + 1);
  } else if (dots || commas) {
    const sep = dots ? "." : ",";
    const at = s.lastIndexOf(sep), after = s.length - at - 1;
    if (dots + commas > 1 || (after === 3 && /^[1-9]\d{0,2}$/.test(s.slice(0, at)))) whole = s.replaceAll(sep, "");
    else if (after <= 2) (whole = s.slice(0, at)), (frac = s.slice(at + 1));
    else bad("has more than two decimals");
  }
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) bad();
  if (frac.length > 2) {
    if (!/^0+$/.test(frac.slice(2))) bad("has more than two decimals");
    frac = frac.slice(0, 2);
  }
  const cents = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) bad("is too large");
  if (dir) neg = dir === "DR";
  return cents === 0 ? 0 : neg ? -cents : cents;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, maa: 3, mrt: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * A statement date → YYYY-MM-DD: "05/10/2026" (day first, as South African banks write it; MDY on request),
 * "2026-10-05", "2026/10/05", "20261005" (OFX), "05 Oct 2026", "5-Oct-26", "05Okt2026", with or without a time.
 * Null when it isn't a real date.
 */
export function readDay(raw: string, order: "DMY" | "MDY" = "DMY"): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number, r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{4})(\d{2})(\d{2})(?:\d{2,6}(?:\.\d+)?)?(?:\s*\[.*\])?$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:[T\s].*)?$/))) [d, m, y] = order === "MDY" ? [+r[2], +r[1], fullYear(r[3])] : [+r[1], +r[2], fullYear(r[3])];
  else if ((r = s.match(/^(\d{1,2})[\s-]*([A-Za-z]{3,9})\.?,?[\s-]*(\d{4}|\d{2})(?:[T\s,].*)?$/))) [d, m, y] = [+r[1], MONTHS[r[2].slice(0, 3).toLowerCase()], fullYear(r[3])];
  else if ((r = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/))) [d, m, y] = [+r[2], MONTHS[r[1].slice(0, 3).toLowerCase()], +r[3]];
  else return null;
  if (!m || y < 1990 || y > 2100) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Day-first unless the file's dates only make sense month-first (an export from a US-set system). */
function dateOrder(cells: string[]): "DMY" | "MDY" {
  const slashed = cells.filter((c) => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/.test(c));
  return slashed.length && !slashed.every((c) => readDay(c, "DMY")) && slashed.every((c) => readDay(c, "MDY")) ? "MDY" : "DMY";
}

const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

// ── Columns ────────────────────────────────────────────────────────────────────

/** A heading compared loosely: "Money In (R)" → "money in". */
const norm = (s: string) => s.slice(0, 200).toLowerCase().replace(/\([^()]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

// Each column's possible headings, the preferred first (Capitec's posting date is the one its balance follows).
const NAMES = {
  date: ["posting date", "date", "transaction date", "value date", "posted date", "date posted", "trans date", "tran date", "txn date", "effective date", "processing date", "booking date"],
  description: ["original description", "transaction description", "description", "description1", "details", "transaction details", "narrative", "narration", "particulars", "memo"],
  more: ["description2", "description3"],
  reference: ["reference", "ref", "your reference", "their reference", "beneficiary reference", "transaction reference", "statement reference", "reference number", "ref no", "chkref", "cheque number", "cheque no", "check number"],
  amount: ["amount", "transaction amount", "amt"],
  debit: ["debit amount", "debit", "debits", "money out", "withdrawal", "withdrawals", "paid out", "payments", "dr"],
  credit: ["credit amount", "credit", "credits", "money in", "deposit", "deposits", "paid in", "receipts", "cr"],
  fee: ["fee", "fees", "bank fee", "bank fees", "service fee"],
  balance: ["balance", "running balance", "available balance", "account balance", "ledger balance", "current balance"],
  drcr: ["dr cr", "cr dr", "debit credit", "credit debit", "d c", "c d"],
  account: ["account", "account number", "account no"],
};

type Cols = { date: number; description: number; more: number[]; reference?: number; amount?: number; debit?: number; credit?: number; fee?: number; balance?: number; drcr?: number; account?: number };
type Head = { at: number; cols: Cols; names: string[] };

function colsOf(names: string[]): Cols | null {
  const find = (list: string[]) => {
    for (const n of list) {
      const k = names.indexOf(n);
      if (k >= 0) return k;
    }
    return undefined;
  };
  // A file with no description column describes its lines by their reference.
  const date = find(NAMES.date), description = find(NAMES.description) ?? find(NAMES.reference), amount = find(NAMES.amount);
  const debit = amount == null ? find(NAMES.debit) : undefined, credit = amount == null ? find(NAMES.credit) : undefined;
  if (date == null || description == null || (amount == null && debit == null && credit == null)) return null;
  return {
    date, description, amount, debit, credit,
    more: NAMES.more.map((n) => names.indexOf(n)).filter((k) => k >= 0 && k !== description),
    reference: find(NAMES.reference) === description ? undefined : find(NAMES.reference),
    fee: find(NAMES.fee), balance: find(NAMES.balance), drcr: find(NAMES.drcr), account: find(NAMES.account),
  };
}

/** The heading row: the first of the first 40 rows that names a date, a description and an amount (or money in/out). */
function findHead(rows: string[][]): Head | null {
  for (let at = 0; at < Math.min(rows.length, 40); at++) {
    const names = rows[at].map(norm);
    const cols = colsOf(names);
    if (cols) return { at, cols, names };
  }
  return null;
}

/** Which bank's export the headings (and what's above them) are; CSV when they could be anyone's. */
function bankOf(names: string[], above: string[][]): ReadFormat {
  const h = new Set(names);
  if (h.has("description1") || h.has("accrued charges") || h.has("accrued bank charges")) return "FNB";
  if (h.has("money in") && h.has("money out")) return "CAPITEC";
  if (h.has("transaction description") && (h.has("debit amount") || h.has("credit amount"))) return "ABSA";
  const preamble = above.flat().join(" ").toLowerCase();
  if (preamble.includes("nedbank")) return "NEDBANK";
  if (preamble.includes("standard bank")) return "STANDARD";
  return "CSV";
}

/** The account number in the lines above the headings ("Account number, 1234567890"; FNB's record 2). */
function accountAbove(rows: string[][]) {
  for (const r of rows) {
    for (let k = 0; k < r.length - 1; k++) if (/^(account|acc)\s*(number|no\.?|nr)?\s*:?$/i.test(r[k]) && digits(r[k + 1]).length >= 6) return digits(r[k + 1]);
    if (r[0] === "2" && digits(r[1]).length >= 8) return digits(r[1]);
  }
  return undefined;
}

// ── Lines ──────────────────────────────────────────────────────────────────────

const SUMMARY = /^(opening|closing|available) balance\b|\bbal(ance)? (brought|carried) (forward|down)\b|^bal(ance)? [bc]\/?[fd]\b|^(brought|carried) forward\b|^(sub-?)?totals?\b/i;
const PENDING = /\(pending\)|^pending\b/i;

/** The rows under the headings → lines. Blank, opening/closing balance, total and pending rows are skipped. */
function readTable(rows: string[][], head: Head, format: ReadFormat, headless = false): ReadStatement {
  const { cols } = head;
  const first = rows[head.at]?.[0] ?? "";
  // FNB numbers its record types: the headings and the transactions share one ("5"); the account details don't.
  const record = !headless && /^\d$/.test(first) ? first : null;
  const body = rows.slice(head.at + 1).map((r, i) => ({ r, row: head.at + 2 + i })).filter(({ r }) => !record || r[0] === record);
  const order = dateOrder(body.map(({ r }) => r[cols.date] ?? ""));
  const lines: StatementLine[] = [];
  const failed: ReadStatement["failed"] = [];
  let skipped = 0, account: string | undefined, after = false; // after: the previous row became a line
  const cell = (r: string[], k?: number) => (k == null ? "" : (r[k] ?? ""));
  for (const { r, row } of body) {
    if (r.every((c) => !c)) {
      after = false;
      continue;
    }
    const dateCell = cell(r, cols.date);
    const description = [cell(r, cols.description), ...cols.more.map((k) => cell(r, k))].filter(Boolean).join(" ");
    if (!dateCell) {
      // A description running onto the next row (nothing else on it), or a total without a date.
      const textOnly = r.every((c, k) => !c || k === cols.description || cols.more.includes(k));
      if (textOnly && description && after && !SUMMARY.test(description)) lines[lines.length - 1].description = `${lines[lines.length - 1].description} ${description}`.slice(0, 300);
      else (skipped++, (after = false));
      continue;
    }
    after = false;
    if (SUMMARY.test(description) || PENDING.test(description) || PENDING.test(dateCell) || !/\d/.test(dateCell)) {
      skipped++;
      continue;
    }
    const date = readDay(dateCell, order);
    if (!date) {
      if (headless && !lines.length && !failed.length) skipped++; // the headings of a file read by column numbers
      else failed.push({ row, error: `“${dateCell}” isn't a date` });
      continue;
    }
    let main: number | null = null, fee: number | null = null;
    try {
      if (cols.amount != null) {
        main = readAmount(cell(r, cols.amount));
        const sign = cell(r, cols.drcr).toUpperCase();
        if (main != null && /^(DR?|DEBIT)$/.test(sign)) main = -Math.abs(main);
        else if (main != null && /^(CR?|CREDIT)$/.test(sign)) main = Math.abs(main);
      } else {
        const out = readAmount(cell(r, cols.debit)), inn = readAmount(cell(r, cols.credit));
        if (out != null || inn != null) main = Math.abs(inn ?? 0) - Math.abs(out ?? 0);
      }
      const f = readAmount(cell(r, cols.fee));
      fee = f ? -Math.abs(f) : null;
    } catch (e) {
      failed.push({ row, error: e instanceof StatementError ? e.message : "the amount can't be read" });
      continue;
    }
    if (!main && !fee) {
      skipped++;
      continue;
    }
    if (Math.abs(main ?? 0) > LINE_MAX_CENTS || Math.abs(fee ?? 0) > LINE_MAX_CENTS) {
      failed.push({ row, error: TOO_BIG });
      continue;
    }
    let balance: number | undefined;
    try {
      balance = readAmount(cell(r, cols.balance)) ?? undefined;
    } catch {
      balance = undefined; // a balance that can't be read only costs the reconciliation a figure
    }
    const reference = cell(r, cols.reference);
    const ref = reference && !/^0+$/.test(reference) ? { reference: reference.slice(0, 120) } : {};
    const text = (description || reference || "Bank transaction").slice(0, 300);
    if (main) lines.push({ date, amountCents: main, description: text, ...ref, ...(balance != null && { balanceCents: balance - (fee ?? 0) }) });
    // Capitec puts a transaction's fee in its own column: it's a line of its own, to allocate to bank charges.
    if (fee) lines.push({ date, amountCents: fee, description: main ? `Fee: ${text}`.slice(0, 300) : text, ...ref, ...(balance != null && { balanceCents: balance }) });
    after = true;
    account ??= digits(cell(r, cols.account)) || undefined;
  }
  return finish(format, lines, failed, skipped, account);
}

/** Lines in date order (bank exports are often newest first; on one day the balances tell), size-checked. */
function finish(format: ReadFormat, lines: StatementLine[], failed: ReadStatement["failed"], skipped: number, account?: string): ReadStatement {
  if (lines.length > STATEMENT_MAX_LINES) throw new StatementError(`That's more than ${STATEMENT_MAX_LINES.toLocaleString("en-US")} lines — import a shorter period.`);
  let reverse = lines.length > 1 && lines[0].date > lines[lines.length - 1].date;
  if (lines.length > 1 && lines[0].date === lines[lines.length - 1].date) {
    let fwd = 0, back = 0;
    for (let i = 1; i < lines.length; i++) {
      const [a, b] = [lines[i - 1], lines[i]];
      if (a.balanceCents == null || b.balanceCents == null) continue;
      if (a.balanceCents + b.amountCents === b.balanceCents) fwd++;
      if (b.balanceCents + a.amountCents === a.balanceCents) back++;
    }
    reverse = back > fwd;
  }
  const ordered = (reverse ? [...lines].reverse() : lines).sort((a, b) => a.date.localeCompare(b.date)); // stable
  return { format, lines: ordered, failed, skipped, ...(account && { account }) };
}

/** Standard Bank's download: ACC-NO, OPEN (balance), HIST (date, amount, description, reference) and CLOSE records. */
function readStandard(rows: string[][]): ReadStatement | null {
  if (!rows.some((r) => r[0]?.toUpperCase() === "HIST")) return null;
  const lines: StatementLine[] = [];
  const failed: ReadStatement["failed"] = [];
  let account: string | undefined, balance: number | null = null, skipped = 0;
  rows.forEach((r, i) => {
    const kind = r[0]?.toUpperCase();
    try {
      if (kind === "ACC-NO") account = digits(r[1]) || undefined;
      else if (kind === "OPEN") balance = readAmount(r[3] ?? "");
      else if (kind === "HIST") {
        const date = readDay(r[1] ?? "");
        if (!date) return void failed.push({ row: i + 1, error: `“${r[1] ?? ""}” isn't a date` });
        const amount = readAmount(r[3] ?? "");
        if (!amount) return void skipped++;
        if (Math.abs(amount) > LINE_MAX_CENTS) return void failed.push({ row: i + 1, error: TOO_BIG });
        if (balance != null) balance += amount;
        const reference = r[5] && !/^0+$/.test(r[5]) ? r[5].slice(0, 120) : undefined;
        lines.push({ date, amountCents: amount, description: (r[4] || reference || "Bank transaction").slice(0, 300), ...(reference && { reference }), ...(balance != null && { balanceCents: balance }) });
      }
    } catch (e) {
      failed.push({ row: i + 1, error: e instanceof StatementError ? e.message : "the line can't be read" });
    }
  });
  return finish("STANDARD", lines, failed, skipped, account);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) => ENTITIES[e]);

/** OFX 1 (SGML) or 2 (XML): each STMTTRN; the ledger balance at the end goes on the last line. One account per file. */
function readOfx(text: string): ReadStatement {
  const tag = (block: string, name: string) => decodeEntities(block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"))?.[1].trim() ?? "");
  const accounts = new Set([...text.matchAll(/<ACCTID>([^<\r\n]*)/gi)].map((m) => digits(m[1])).filter(Boolean));
  if (accounts.size > 1) throw new StatementError("This file has more than one account's statement in it — download one account at a time.");
  const lines: StatementLine[] = [];
  const failed: ReadStatement["failed"] = [];
  let skipped = 0;
  // One pass over the transactions (a lazy regex rescans to the end from every opening tag that never closes).
  const blocks: string[] = [];
  const open = /<STMTTRN>/gi, close = /<\/STMTTRN>/gi;
  while (open.exec(text)) {
    close.lastIndex = open.lastIndex;
    const end = close.exec(text);
    if (!end) break;
    blocks.push(text.slice(open.lastIndex, end.index));
    open.lastIndex = close.lastIndex;
  }
  blocks.forEach((b, i) => {
    const date = readDay(tag(b, "DTPOSTED"));
    if (!date) return void failed.push({ row: i + 1, error: `transaction ${i + 1}: “${tag(b, "DTPOSTED")}” isn't a date` });
    let amount: number | null;
    try {
      amount = readAmount(tag(b, "TRNAMT"));
    } catch (e) {
      return void failed.push({ row: i + 1, error: `transaction ${i + 1}: ${(e as Error).message}` });
    }
    if (!amount) return void skipped++;
    if (Math.abs(amount) > LINE_MAX_CENTS) return void failed.push({ row: i + 1, error: `transaction ${i + 1}: ${TOO_BIG}` });
    const [name, memo] = [tag(b, "NAME"), tag(b, "MEMO")];
    const description = name && memo && !memo.toUpperCase().includes(name.toUpperCase()) ? `${name} ${memo}` : memo || name;
    const reference = tag(b, "CHECKNUM") || tag(b, "REFNUM");
    lines.push({ date, amountCents: amount, description: (description || reference || "Bank transaction").slice(0, 300), ...(reference && { reference: reference.slice(0, 120) }) });
  });
  const out = finish("OFX", lines, failed, skipped, [...accounts][0]);
  const ledger = text.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|$)/i)?.[1];
  const last = out.lines[out.lines.length - 1];
  if (ledger && last) {
    const asOf = readDay(tag(ledger, "DTASOF"));
    try {
      const bal = readAmount(tag(ledger, "BALAMT"));
      if (bal != null && asOf && asOf >= last.date) last.balanceCents = bal;
    } catch {
      // no closing balance: the reconciliation carries the last one forward
    }
  }
  return out;
}

/** A CSV read by the columns someone named: headings as in the file, or numbers (1 = the first column). */
function readMapped(rows: string[][], map: ColumnMap): ReadStatement {
  const given = Object.entries(map).filter(([, v]) => v?.trim()) as [keyof ColumnMap, string][];
  const has = (k: keyof ColumnMap) => given.some(([g]) => g === k);
  if (!has("date") || !has("description")) throw new StatementError("Name the date and description columns — their headings, or their numbers (1 for the first column).");
  if (!has("amount") && !has("debit") && !has("credit")) throw new StatementError("Name the amount column — or the money out (debit) and money in (credit) columns.");
  const named = given.filter(([, v]) => !/^\d+$/.test(v.trim()));
  let at = -1, names: string[] = [];
  if (named.length) {
    at = rows.slice(0, 40).findIndex((r) => named.every(([, v]) => r.map(norm).includes(norm(v))));
    if (at < 0) {
      const missing = named.filter(([, v]) => !rows.slice(0, 40).some((r) => r.map(norm).includes(norm(v)))).map(([, v]) => `“${v}”`);
      throw new StatementError(missing.length ? `There's no ${missing.join(" or ")} column in the file.` : "Those headings aren't all on one row of the file.");
    }
    names = rows[at].map(norm);
  }
  const idx = (k: keyof ColumnMap) => {
    const v = map[k]?.trim();
    if (!v) return undefined;
    const i = /^\d+$/.test(v) ? Number(v) - 1 : names.indexOf(norm(v));
    if (i < 0 || i > 200) throw new StatementError(`Column ${v} isn't in the file.`);
    return i;
  };
  const amount = idx("amount");
  const cols: Cols = { date: idx("date")!, description: idx("description")!, more: [], reference: idx("reference"), amount, debit: amount == null ? idx("debit") : undefined, credit: amount == null ? idx("credit") : undefined, balance: idx("balance") };
  return readTable(rows, { at, cols, names }, "CSV", at < 0);
}

/**
 * Reads a statement file's text. AUTO tells the format from the file; a bank chosen by hand must match it (or have
 * headings any bank could use). Throws a StatementError, written for the person importing, when it can't be read.
 */
export function parseStatement(text: string, format: StatementFormat = "AUTO", map?: ColumnMap): ReadStatement {
  const body = text.replace(/^﻿/, "");
  if (!body.trim()) throw new StatementError("The file is empty.");
  const ofx = /<OFX>|^\s*OFXHEADER/i.test(body);
  if (format === "OFX" && !ofx) throw new StatementError("This isn't an OFX file — choose the bank's CSV format, or “Work it out from the file”.");
  if (ofx) {
    if (format !== "OFX" && format !== "AUTO") throw new StatementError("This is an OFX file — choose “OFX / QFX”, or “Work it out from the file”.");
    return readOfx(body);
  }
  const rows = csvRows(body);
  if (format === "CSV") {
    if (!map) throw new StatementError("Name the columns to read this file by.");
    return readMapped(rows, map);
  }
  if (format === "AUTO" || format === "STANDARD") {
    const sb = readStandard(rows);
    if (sb) return sb;
  }
  const bank = format === "AUTO" ? null : (format as BankFormat);
  const head = findHead(rows);
  if (!head) throw new StatementError(!bank ? NOT_RECOGNISED : `This doesn't look like ${BANKS[bank]}'s download: ${EXPECT[bank]}. Try “Work it out from the file”, or “Other CSV”.`);
  const above = rows.slice(0, head.at);
  const seen = bankOf(head.names, above);
  if (bank && seen !== "CSV" && seen !== bank)
    throw new StatementError(`This looks like ${BANKS[seen as BankFormat]}'s download, not ${BANKS[bank]}'s — choose ${BANKS[seen as BankFormat]}, or “Work it out from the file”.`);
  const out = readTable(rows, head, bank ?? seen);
  const account = accountAbove(above);
  return out.account || !account ? out : { ...out, account };
}

// ── Duplicates ─────────────────────────────────────────────────────────────────

const descKey = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
const sameKey = (l: StatementLine) => [l.date, l.amountCents, descKey(l.description), l.balanceCents ?? ""].join("\u001f");

/**
 * A line's fingerprint in one bank account: its day, amount, description and balance, and how many identical lines
 * came before it in the same file (two R50 coffees on one day are two lines; the same file imported twice is not).
 */
export const lineHash = (bankAccountId: string, l: StatementLine, occurrence: number) =>
  createHash("sha256").update(`${bankAccountId}\u001f${sameKey(l)}\u001f${occurrence}`).digest("hex").slice(0, 40);

/** Every line of a file with its hash. */
export function hashLines<L extends StatementLine>(bankAccountId: string, lines: L[]) {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const k = sameKey(l);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return { ...l, hash: lineHash(bankAccountId, l, n) };
  });
}

// ── Matching ───────────────────────────────────────────────────────────────────

/** A posting in the books a statement line could be: its amount on the bank account, its date and its words. */
export type LedgerItem = { id: string; date: string; amountCents: number; text: string };

const STOP = new Set(["THE", "AND", "FOR", "FROM", "PAYMENT", "PAYMENTS", "TRANSFER", "DEPOSIT", "CASH", "CREDIT", "DEBIT", "EFT", "ACB", "INTERNET", "BANKING", "APP", "POS", "PURCHASE", "FEE", "FEES", "REF", "REFERENCE", "BANK", "ACCOUNT", "JOURNAL"]);

/** The words a reference can be recognised by: letters and numbers, numbers without leading zeros. */
export function words(s: string) {
  const out = new Set<string>();
  for (const w of s.toUpperCase().split(/[^A-Z0-9]+/)) {
    const t = /^\d+$/.test(w) ? w.replace(/^0+(?=\d)/, "") : w;
    if ((t.length >= 3 || (t.length === 2 && /\d/.test(t))) && !STOP.has(t)) out.add(t);
  }
  return out;
}

const dayNo = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;
export const daysApart = (a: string, b: string) => Math.abs(dayNo(a) - dayNo(b));

/**
 * The postings a statement line could be, best first: exactly its amount (so the same direction), within
 * `windowDays` of its date; the nearest date first, then the most reference words in common.
 */
export function matchCandidates(line: { date: string; amountCents: number; description: string; reference?: string | null }, items: LedgerItem[], windowDays = 5) {
  const mine = words(`${line.description} ${line.reference ?? ""}`);
  return items
    .filter((i) => i.amountCents === line.amountCents && i.amountCents !== 0 && daysApart(i.date, line.date) <= windowDays)
    .map((item) => ({ item, days: daysApart(item.date, line.date), overlap: [...words(item.text)].filter((w) => mine.has(w)).length }))
    .sort((a, b) => a.days - b.days || b.overlap - a.overlap || a.item.date.localeCompare(b.item.date) || a.item.id.localeCompare(b.item.id));
}

/**
 * Which lines match which postings by themselves, given each line's candidates: a line whose one candidate is no
 * other line's one candidate takes it, the posting is gone for the rest, and again until nothing changes. A line with
 * several candidates left, or two lines with the same single one, is left to a person.
 */
export function assignMatches(candidates: Map<string, string[]>) {
  const left = new Map([...candidates].map(([line, c]) => [line, new Set(c)]));
  const out = new Map<string, string>();
  for (let progress = true; progress; ) {
    progress = false;
    const singles = [...left].flatMap(([line, c]) => (c.size === 1 ? [[line, [...c][0]] as const] : []));
    const wanted = new Map<string, number>();
    for (const [, p] of singles) wanted.set(p, (wanted.get(p) ?? 0) + 1);
    for (const [line, p] of singles) {
      if (wanted.get(p) !== 1) continue;
      out.set(line, p);
      left.delete(line);
      for (const c of left.values()) c.delete(p);
      progress = true;
    }
  }
  return out;
}

// ── Reconciliation ─────────────────────────────────────────────────────────────

/**
 * The books' balance explained from the statement's at a date:
 *   statement balance
 *   + in the books, not yet on the statement (deposits in transit, payments not yet through)
 *   − on the statement, not in the books (lines still to match, allocate or that were ignored)
 *   + the books before the first imported line, less the statement's opening balance
 *   = the books' balance, explained. What's left over is unexplained: a statement that wasn't imported, a balance
 *     that doesn't follow, or a posting that changed after it was matched.
 */
export function reconcile(r: { ledgerCents: number; statementCents: number | null; openingCents: number | null; broughtForwardCents: number; outstandingCents: number; notInBooksCents: number }) {
  const openingDiffCents = r.openingCents == null ? null : r.broughtForwardCents - r.openingCents;
  const expectedCents = r.statementCents == null || openingDiffCents == null ? null : r.statementCents + r.outstandingCents - r.notInBooksCents + openingDiffCents;
  return {
    differenceCents: r.statementCents == null ? null : r.ledgerCents - r.statementCents,
    openingDiffCents,
    expectedCents,
    unexplainedCents: expectedCents == null ? null : r.ledgerCents - expectedCents,
  };
}
