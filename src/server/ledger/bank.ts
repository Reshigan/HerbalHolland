// A company's bank accounts and their statements. The first bank account carries the books' "Bank" account (key
// bank, which the automatic postings use); each further one gets a ledger account of its own. Statements are imported
// (every line once, the file kept), matched to postings already in the books — automatically when exactly one fits —
// and the rest allocated with a journal of their own (source "bank", the line's id): bank charges, card payouts net of
// fees, interest, a SARS payment, a transfer between the company's own accounts. The reconciliation explains the
// books' balance from the statement's at any date. Every write re-checks access to the books and is audited.
//
// A "posting" here is what one statement line can be matched to: an automatic source's journals together (a late
// correction or a reversal nets into it), or a manual journal with its reversal. Several lines may settle one posting
// (a day's PayShap payments against the trading day), never more than its amount on the account.
import { createHash, randomUUID } from "node:crypto";
import { db, tx, Prisma, type Tx } from "../db";
import { audit, SYSTEM, type Actor } from "../audit";
import { putObject } from "../storage";
import { booksAccess } from "./access";
import { booksFor, syncPosting, type Posting } from "./core";
import {
  assignMatches, BANKS, decodeStatement, hashLines, LINE_MAX_CENTS, matchCandidates, parseStatement, reconcile, STATEMENT_MAX_BYTES,
  type Bank, type ColumnMap, type LedgerItem, type StatementFormat,
} from "@/lib/bank-import";
import { periodOf, supplierParty, type Line } from "@/lib/ledger";
import { dayKey } from "@/lib/format";
import { zar } from "@/lib/money";
import type { BankLineStatus } from "@/generated/prisma/client";

export class BankError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

/** Days either side of a line that a posting can be matched in: automatically, and as a suggestion. */
export const AUTO_DAYS = 5;
const SUGGEST_DAYS = 10;

/**
 * Accounts kept by their own records: a bank line isn't allocated to them (that would put the books out with the
 * register they mirror) — the payment is recorded where it belongs, and the line then matches its posting.
 */
const KEPT: Record<string, string> = {
  hq: "Payments to and from Herbal Holland are recorded as statement payments, so both sets of books get them — this line then matches by itself.",
  franchisees: "Payments from and to franchisees are recorded as statement payments (Statements → the store), so both sets of books agree — this line then matches by itself.",
  debtors: "Trade payments are captured on the trade account, so the trade ledger and the books agree — this line then matches by itself.",
  vouchers: "Gift vouchers follow their register: they aren't posted from the bank.",
  points: "Rewards points follow the members' balances: they aren't posted from the bank.",
  prepaid: "Online orders paid follow the orders: they aren't posted from the bank.",
  stock: "Stock is posted from receiving and stock orders, so it agrees with the stock valuation.",
  transit: "Stock in transit is posted from stock orders.",
  interstore: "Transfers between your stores are posted from their stock orders.",
  grni: "Stock received but not invoiced is posted from receiving and supplier invoices.",
  "vat.input": "VAT goes with what it's on: allocate to the expense and enter the VAT, or a SARS payment to “VAT due to / from SARS”.",
  "vat.output": "VAT goes with what it's on: a SARS payment or refund goes to “VAT due to / from SARS”.",
  retained: "Retained earnings are worked out from the year's results, not posted.",
};

export const STATUS_LABEL: Record<BankLineStatus, string> = { UNMATCHED: "To do", MATCHED: "Matched", ALLOCATED: "Allocated", IGNORED: "Ignored" };

const day = (d: Date) => d.toISOString().slice(0, 10);
const dateCol = (s: string) => new Date(`${s}T00:00:00Z`);
const shift = (s: string, n: number) => day(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const lock = (t: Tx, bankAccountId: string) => t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bank:${bankAccountId}`}))`;

/** The signed-in person, allowed to change these books — or a refusal. */
async function writer(companyId: string) {
  const a = await booksAccess(companyId, "write");
  if (!a) throw new BankError("You don't have permission to change these books.");
  return { ...a, actor: { type: "USER" as const, id: a.user.id, name: a.user.name } };
}

/** A line of these books, re-read under its bank account's lock (so two people can't settle it twice). */
async function lockedLine(t: Tx, companyId: string, lineId: string) {
  const found = await t.bankLine.findFirst({ where: { id: lineId, companyId }, select: { bankAccountId: true } });
  if (!found) throw new BankError("That statement line isn't in these books.");
  await lock(t, found.bankAccountId);
  const line = await t.bankLine.findUniqueOrThrow({ where: { id: lineId } });
  const acct = await t.bankAccount.findUniqueOrThrow({ where: { id: line.bankAccountId } });
  return { line, acct };
}

const already = (s: BankLineStatus) => new BankError(s === "IGNORED" ? "This line is ignored — restore it first." : `This line is already ${s === "MATCHED" ? "matched" : "allocated"}.`);
/** A long list in slices (a year's statement is more than one query's worth of values). */
const slices = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// ── Bank accounts ──────────────────────────────────────────────────────────────

function accountFields(input: { name: string; number: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new BankError("Name the account, e.g. “FNB Business Cheque”", "name");
  const digits = input.number.replace(/\D/g, "");
  if (digits.length < 4) throw new BankError("Enter at least the last four digits of the account number", "number");
  return { name, number: digits.slice(-4) };
}

async function ownStore(t: Tx | typeof db, companyId: string, storeId: string | null | undefined) {
  if (!storeId) return null;
  const s = await t.store.findFirst({ where: { id: storeId, companyId }, select: { id: true } });
  if (!s) throw new BankError("Choose one of this company's stores", "storeId");
  return s.id;
}

/**
 * Adds a bank account. The company's first carries the books' Bank account (1000), which deposits and payments post
 * to; each further one gets a ledger account of its own (the next free code from 1001, named after it).
 */
export async function createBankAccount(companyId: string, input: { bank: string; name: string; number: string; storeId?: string | null }) {
  const { actor } = await writer(companyId);
  const bank = (Object.keys(BANKS) as Bank[]).find((b) => b === input.bank);
  if (!bank) throw new BankError("Choose the bank", "bank");
  const { name, number } = accountFields(input);
  const storeId = await ownStore(db, companyId, input.storeId);
  return tx(async (t) => {
    await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bank-accounts:${companyId}`}))`;
    const main = (await booksFor(t, companyId)).accounts.get("bank")!;
    let accountId = main;
    if (await t.bankAccount.count({ where: { accountId: main } })) {
      const codes = new Set((await t.ledgerAccount.findMany({ where: { companyId }, select: { code: true } })).map((a) => a.code));
      let code = 1001;
      while (codes.has(String(code))) code++;
      accountId = (await t.ledgerAccount.create({ data: { companyId, code: String(code), name, type: "ASSET" } })).id;
    }
    const row = await t.bankAccount.create({ data: { companyId, accountId, bank, name, number, storeId } });
    await audit(t, actor, "bank.account.create", { entity: "BankAccount", entityId: row.id, data: { companyId, bank, name, number, storeId, ledgerAccountId: accountId, main: accountId === main } });
    return row;
  });
}

/** Renames a bank account (and the ledger account opened for it; the books' main Bank account keeps its name). */
export async function updateBankAccount(companyId: string, id: string, input: { name: string; number: string; storeId?: string | null }) {
  const { actor } = await writer(companyId);
  const before = await db.bankAccount.findFirst({ where: { id, companyId } });
  if (!before) throw new BankError("That bank account isn't in these books.");
  const { name, number } = accountFields(input);
  const storeId = await ownStore(db, companyId, input.storeId);
  return tx(async (t) => {
    const row = await t.bankAccount.update({ where: { id }, data: { name, number, storeId } });
    await t.ledgerAccount.updateMany({ where: { id: before.accountId, companyId, key: null }, data: { name } });
    await audit(t, actor, "bank.account.update", { entity: "BankAccount", entityId: id, data: { companyId, from: { name: before.name, number: before.number, storeId: before.storeId }, to: { name, number, storeId } } });
    return row;
  });
}

/** Closes a bank account (nothing more is imported to it) or reopens it. Its lines and postings stay. */
export async function setBankAccountActive(companyId: string, id: string, active: boolean) {
  const { actor } = await writer(companyId);
  const before = await db.bankAccount.findFirst({ where: { id, companyId } });
  if (!before) throw new BankError("That bank account isn't in these books.");
  if (before.active === active) return before;
  const row = await db.bankAccount.update({ where: { id }, data: { active } });
  await audit(db, actor, active ? "bank.account.reopen" : "bank.account.close", { entity: "BankAccount", entityId: id, data: { companyId, name: before.name } });
  return row;
}

// ── Import ─────────────────────────────────────────────────────────────────────

export type ImportResult = {
  format: string; lines: number; added: number; duplicates: number; failed: { row: number; error: string }[]; skipped: number; matched: number;
  from: string | null; to: string | null; balancesLeftOff: number;
};

/**
 * Reads a statement file into a bank account's lines: each line once (a line already imported is a duplicate), the
 * file kept with the lines it added, then the open lines matched automatically. A file for another account (by its
 * number) is refused.
 */
export async function importStatement(companyId: string, bankAccountId: string, a: { file: File; format: StatementFormat; map?: ColumnMap }): Promise<ImportResult> {
  const { actor, user } = await writer(companyId);
  const acct = await db.bankAccount.findFirst({ where: { id: bankAccountId, companyId } });
  if (!acct) throw new BankError("Choose one of these books' bank accounts", "bankAccountId");
  if (!acct.active) throw new BankError(`${acct.name} is closed — reopen it to import a statement`, "bankAccountId");
  if (!a.file.size) throw new BankError("Choose the statement file", "file");
  if (a.file.size > STATEMENT_MAX_BYTES) throw new BankError("The file is over 5 MB — download a shorter period", "file");
  const bytes = new Uint8Array(await a.file.arrayBuffer());
  const read = parseStatement(decodeStatement(bytes), a.format, a.map);
  if (read.account && read.account.length >= 4 && !read.account.endsWith(acct.number))
    throw new BankError(`This statement is for the account ending ${read.account.slice(-4)}, not ${acct.name} (ending ${acct.number}). Choose the right account, or correct its number.`, "file");
  if (!read.lines.length)
    throw new BankError(read.failed.length ? `None of the lines could be read: row ${read.failed[0].row}, ${read.failed[0].error}.` : "There are no transactions in this file.", "file");

  const lines = hashLines(acct.id, read.lines);
  const known = new Set<string>();
  for (const part of slices(lines, 5000))
    for (const l of await db.bankLine.findMany({ where: { bankAccountId: acct.id, hash: { in: part.map((x) => x.hash) } }, select: { hash: true } })) known.add(l.hash);
  const fresh = lines.map((l, i) => ({ ...l, i })).filter((l) => !known.has(l.hash));
  const ofx = read.format === "OFX";
  const key = `bank-statements/${companyId}/${dayKey(new Date()).slice(0, 7)}/${randomUUID()}.${ofx ? "ofx" : "csv"}`;
  if (fresh.length) await putObject(key, bytes, ofx ? "application/x-ofx" : "text/csv");
  const fits = (n?: number) => (n != null && Math.abs(n) <= LINE_MAX_CENTS ? n : null);
  const base = Date.now(); // createdAt keeps the statement's order within a day
  const [from, to] = [lines[0].date, lines[lines.length - 1].date];
  const added = await tx(async (t) => {
    await lock(t, acct.id);
    const upload = fresh.length
      ? await t.upload.create({
          data: {
            key, fileName: a.file.name.slice(0, 120) || `statement.${ofx ? "ofx" : "csv"}`, contentType: ofx ? "application/x-ofx" : "text/csv", sizeBytes: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"), storeId: acct.storeId, uploadedById: user.id,
          },
        })
      : null;
    let count = 0;
    for (const part of slices(fresh, 1000)) {
      const data = part.map((l) => ({
        companyId, bankAccountId: acct.id, date: dateCol(l.date), amountCents: l.amountCents, description: l.description, reference: l.reference ?? null,
        balanceCents: fits(l.balanceCents), hash: l.hash, uploadId: upload?.id ?? null, createdAt: new Date(base + l.i),
      }));
      count += (await t.bankLine.createMany({ data, skipDuplicates: true })).count;
    }
    await audit(t, actor, "bank.statement.add", {
      entity: "BankAccount", entityId: acct.id,
      data: { companyId, format: read.format, fileName: a.file.name.slice(0, 120), uploadId: upload?.id ?? null, lines: lines.length, added: count, duplicates: lines.length - count, failed: read.failed.length, from, to },
    });
    return count;
  });
  const matched = await autoMatch(companyId, acct.id, actor);
  return {
    format: read.format, lines: lines.length, added, duplicates: lines.length - added, failed: read.failed, skipped: read.skipped, matched, from, to,
    balancesLeftOff: fresh.filter((l) => l.balanceCents != null && fits(l.balanceCents) == null).length,
  };
}

// ── Postings on a bank's ledger account ────────────────────────────────────────

export type BookPosting = { key: string; journalId: string; number: number; date: string; memo: string; source: string; sourceId: string | null; storeId: string | null; cents: number; matchedCents: number };

/** The posting a journal belongs to (SQL): an automatic source's journals together; a manual journal with its reversal. */
const POSTING = (j: string) => Prisma.raw(`CASE WHEN ${j}."sourceId" IS NOT NULL THEN ${j}.source || ':' || ${j}."sourceId" ELSE COALESCE(${j}."reversalOfId", ${j}.id) END`);

/**
 * The postings on a bank account's ledger account with a line between two days (or holding given journals): their
 * amount on the account, all their journals together, and what this bank account's statement lines already settle.
 */
async function postings(t: Tx | typeof db, companyId: string, acct: { id: string; accountId: string }, scope: { from: string; to: string } | { journalIds: string[] }): Promise<BookPosting[]> {
  const near =
    "journalIds" in scope
      ? Prisma.sql`SELECT j.source, j."sourceId", COALESCE(j."reversalOfId", j.id) AS root FROM "Journal" j WHERE j."companyId" = ${companyId} AND j.id = ANY(${scope.journalIds}::text[])`
      : Prisma.sql`SELECT DISTINCT j.source, j."sourceId", COALESCE(j."reversalOfId", j.id) AS root FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId"
          WHERE l."companyId" = ${companyId} AND l."accountId" = ${acct.accountId} AND l.date BETWEEN ${scope.from}::date AND ${scope.to}::date AND j.status = 'POSTED'`;
  const rows = await t.$queryRaw<{ key: string; journalId: string; number: number; date: Date; memo: string; source: string; sourceId: string | null; storeId: string | null; cents: bigint; matched: bigint }[]>`
    WITH near AS (${near}),
    js AS (
      SELECT j.* FROM "Journal" j JOIN (SELECT DISTINCT source, "sourceId" FROM near WHERE "sourceId" IS NOT NULL) n ON j."companyId" = ${companyId} AND j.source = n.source AND j."sourceId" = n."sourceId"
      UNION SELECT j.* FROM "Journal" j JOIN (SELECT DISTINCT root FROM near WHERE "sourceId" IS NULL) n ON j.id = n.root
      UNION SELECT j.* FROM "Journal" j JOIN (SELECT DISTINCT root FROM near WHERE "sourceId" IS NULL) n ON j."reversalOfId" = n.root
    ),
    per AS (
      SELECT js.id, js.number, js.date, js.memo, js.source, js."sourceId", js."storeId", ${POSTING("js")} AS key, SUM(l."amountCents") AS cents
      FROM js JOIN "JournalLine" l ON l."journalId" = js.id AND l."accountId" = ${acct.accountId}
      WHERE js.status = 'POSTED'
      GROUP BY js.id, js.number, js.date, js.memo, js.source, js."sourceId", js."storeId", js."reversalOfId"
    ),
    grp AS (
      SELECT key, MIN(date) AS date, SUM(cents)::bigint AS cents, MIN(number) AS number, (array_agg(id ORDER BY number))[1] AS "journalId",
        (array_agg(memo ORDER BY number))[1] AS memo, (array_agg(source ORDER BY number))[1] AS source, (array_agg("sourceId" ORDER BY number))[1] AS "sourceId",
        (array_agg("storeId" ORDER BY number))[1] AS "storeId"
      FROM per GROUP BY key
    ),
    mat AS (
      SELECT ${POSTING("j")} AS key, SUM(b."amountCents")::bigint AS matched FROM "BankLine" b JOIN "Journal" j ON j.id = b."journalId"
      WHERE b."bankAccountId" = ${acct.id} AND b.status IN ('MATCHED', 'ALLOCATED') AND b."journalId" IN (SELECT id FROM js)
      GROUP BY 1
    )
    SELECT grp.*, COALESCE(mat.matched, 0)::bigint AS matched FROM grp LEFT JOIN mat USING (key)`;
  return rows.map((r) => ({ ...r, date: day(r.date), cents: Number(r.cents), matchedCents: Number(r.matched) }));
}

/** Words that help recognise a posting on a statement: its memo, and the reference of the deposit or payment it's for. */
async function postingWords(ps: BookPosting[]) {
  const ids = (source: string) => ps.flatMap((p) => (p.source === source && p.sourceId ? [p.sourceId] : []));
  const [deposits, payments] = await Promise.all([
    ids("deposit").length ? db.cashDeposit.findMany({ where: { id: { in: ids("deposit") } }, select: { id: true, number: true, reference: true } }) : [],
    ids("statement-payment").length ? db.statementPayment.findMany({ where: { id: { in: ids("statement-payment") } }, select: { id: true, reference: true } }) : [],
  ]);
  const refs = new Map<string, string>([...deposits.map((d) => [d.id, `${d.number} ${d.reference}`] as const), ...payments.map((p) => [p.id, p.reference] as const)]);
  return (p: BookPosting) => `${p.memo} ${(p.sourceId && refs.get(p.sourceId)) || ""}`;
}

const asLine = (l: { date: Date; amountCents: number; description: string; reference: string | null }) => ({ date: day(l.date), amountCents: l.amountCents, description: l.description, reference: l.reference });

/** Postings by amount, so each line only weighs those of its own amount (thousands of open lines stay quick). */
function byAmount(items: LedgerItem[]) {
  const m = new Map<number, LedgerItem[]>();
  for (const i of items) (m.get(i.amountCents) ?? m.set(i.amountCents, []).get(i.amountCents)!).push(i);
  return (cents: number) => m.get(cents) ?? [];
}

/**
 * Matches a bank account's open lines to postings already in the books: the same amount, within five days either
 * way, only postings nothing on this account is matched to yet, and only where a line has one candidate left that no
 * other line needs (nothing is guessed). System work (after an import, or nightly); returns how many.
 */
export async function autoMatch(companyId: string, bankAccountId: string, actor: Actor = SYSTEM) {
  return tx(async (t) => {
    await lock(t, bankAccountId);
    const acct = await t.bankAccount.findFirst({ where: { id: bankAccountId, companyId }, select: { id: true, accountId: true } });
    if (!acct) throw new BankError("That bank account isn't in these books.");
    const open = await t.bankLine.findMany({ where: { bankAccountId, status: "UNMATCHED" }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: 5000 });
    if (!open.length) return 0;
    const ps = await postings(t, companyId, acct, { from: shift(day(open[0].date), -AUTO_DAYS), to: shift(day(open[open.length - 1].date), AUTO_DAYS) });
    const byKey = new Map(ps.map((p) => [p.key, p]));
    const free = byAmount(ps.filter((p) => p.cents && !p.matchedCents).map((p) => ({ id: p.key, date: p.date, amountCents: p.cents, text: p.memo })));
    const pairs = assignMatches(new Map(open.map((l) => [l.id, matchCandidates(asLine(l), free(l.amountCents), AUTO_DAYS).map((c) => c.item.id)])));
    let n = 0;
    const now = new Date();
    for (const [lineId, key] of pairs) {
      const { count } = await t.bankLine.updateMany({ where: { id: lineId, status: "UNMATCHED" }, data: { status: "MATCHED", journalId: byKey.get(key)!.journalId, matchedById: actor.id ?? null, matchedAt: now } });
      n += count;
    }
    if (n) await audit(t, actor, "bank.line.auto_match", { entity: "BankAccount", entityId: bankAccountId, data: { companyId, matched: n } });
    return n;
  });
}

/** "Match automatically", by someone who may change the books. */
export async function matchAutomatically(companyId: string, bankAccountId: string) {
  const { actor } = await writer(companyId);
  return autoMatch(companyId, bankAccountId, actor);
}

/** Every bank account with open lines tried again (for the nightly job: postings arrive after the statement). */
export async function autoMatchAll() {
  const open = await db.bankLine.groupBy({ by: ["companyId", "bankAccountId"], where: { status: "UNMATCHED" } });
  let matched = 0;
  for (const a of open) matched += await autoMatch(a.companyId, a.bankAccountId);
  return { accounts: open.length, matched };
}

/** For each open line given: the postings it could be, best first (three at most), with what's left of each to match. */
export async function suggestionsFor(companyId: string, acct: { id: string; accountId: string }, lines: { id: string; status: BankLineStatus; date: Date; amountCents: number; description: string; reference: string | null }[]) {
  const open = lines.filter((l) => l.status === "UNMATCHED");
  const out = new Map<string, (BookPosting & { leftCents: number; days: number })[]>();
  if (!open.length) return out;
  const days = open.map((l) => day(l.date)).sort();
  const ps = await postings(db, companyId, acct, { from: shift(days[0], -SUGGEST_DAYS), to: shift(days[days.length - 1], SUGGEST_DAYS) });
  const text = await postingWords(ps);
  const byKey = new Map(ps.map((p) => [p.key, p]));
  const items = byAmount(ps.filter((p) => p.cents !== p.matchedCents).map((p) => ({ id: p.key, date: p.date, amountCents: p.cents - p.matchedCents, text: text(p) })));
  for (const l of open) out.set(l.id, matchCandidates(asLine(l), items(l.amountCents), SUGGEST_DAYS).slice(0, 3).map((c) => ({ ...byKey.get(c.item.id)!, leftCents: c.item.amountCents, days: c.days })));
  return out;
}

// ── Settling a line ────────────────────────────────────────────────────────────

/**
 * Matches a line to a posted journal (by id, or by its number): the journal's posting must have at least the line's
 * amount, in the same direction, still unmatched on this bank account.
 */
export async function matchLine(companyId: string, lineId: string, journal: { id?: string; number?: number }) {
  const { actor } = await writer(companyId);
  return tx(async (t) => {
    const { line, acct } = await lockedLine(t, companyId, lineId);
    if (line.status !== "UNMATCHED") throw already(line.status);
    const where = journal.id ? { id: journal.id } : Number.isInteger(journal.number) && journal.number! > 0 ? { number: journal.number } : null;
    const j = where && (await t.journal.findFirst({ where: { companyId, status: "POSTED", ...where }, select: { id: true, number: true } }));
    if (!j) throw new BankError(journal.number ? `There's no posted journal ${journal.number} in these books.` : "That journal isn't in these books.", "number");
    const [p] = await postings(t, companyId, acct, { journalIds: [j.id] });
    if (!p?.cents) throw new BankError(`Journal ${j.number} has nothing on ${acct.name}.`, "number");
    const left = p.cents - p.matchedCents;
    if (!left) throw new BankError(`Journal ${j.number} is already matched in full on ${acct.name}.`, "number");
    if (Math.sign(left) !== Math.sign(line.amountCents) || Math.abs(line.amountCents) > Math.abs(left))
      throw new BankError(`Journal ${j.number} has ${zar(left)} left to match on ${acct.name}; this line is ${zar(line.amountCents)}.`, "number");
    await t.bankLine.update({ where: { id: line.id }, data: { status: "MATCHED", journalId: j.id, matchedById: actor.id, matchedAt: new Date() } });
    await audit(t, actor, "bank.line.match", { entity: "BankLine", entityId: line.id, data: { companyId, bankAccountId: acct.id, journal: j.number, amountCents: line.amountCents, date: day(line.date) } });
    return { number: j.number };
  });
}

export async function unmatchLine(companyId: string, lineId: string) {
  const { actor } = await writer(companyId);
  return tx(async (t) => {
    const { line, acct } = await lockedLine(t, companyId, lineId);
    if (line.status !== "MATCHED") throw new BankError("This line isn't matched.");
    await t.bankLine.update({ where: { id: line.id }, data: { status: "UNMATCHED", journalId: null, matchedById: null, matchedAt: null } });
    await audit(t, actor, "bank.line.unmatch", { entity: "BankLine", entityId: line.id, data: { companyId, bankAccountId: acct.id, journalId: line.journalId, amountCents: line.amountCents, date: day(line.date) } });
  });
}

/** Sets a line aside (a duplicate from another download, a reversed pair, something already in the opening balance). */
export async function ignoreLine(companyId: string, lineId: string, reason?: string | null) {
  const { actor } = await writer(companyId);
  return tx(async (t) => {
    const { line, acct } = await lockedLine(t, companyId, lineId);
    if (line.status !== "UNMATCHED") throw already(line.status);
    await t.bankLine.update({ where: { id: line.id }, data: { status: "IGNORED", matchedById: actor.id, matchedAt: new Date() } });
    await audit(t, actor, "bank.line.ignore", { entity: "BankLine", entityId: line.id, data: { companyId, bankAccountId: acct.id, amountCents: line.amountCents, date: day(line.date), reason: reason?.trim().slice(0, 200) || null } });
  });
}

export async function unignoreLine(companyId: string, lineId: string) {
  const { actor } = await writer(companyId);
  return tx(async (t) => {
    const { line, acct } = await lockedLine(t, companyId, lineId);
    if (line.status !== "IGNORED") throw new BankError("This line isn't ignored.");
    await t.bankLine.update({ where: { id: line.id }, data: { status: "UNMATCHED", matchedById: null, matchedAt: null } });
    await audit(t, actor, "bank.line.unignore", { entity: "BankLine", entityId: line.id, data: { companyId, bankAccountId: acct.id, amountCents: line.amountCents, date: day(line.date) } });
  });
}

/**
 * What a line is allocated to: another account (with the store, the supplier or other party the account needs, and
 * the VAT on money out for a VAT vendor), or a card payout that lands net — the fee (and its VAT) to card fees, the
 * gross clearing card payments (or, for HQ, online payments).
 */
export type Allocation =
  | { kind: "account"; accountId: string; storeId?: string | null; party?: string | null; vatCents?: number; memo?: string | null }
  | { kind: "payout"; feeCents: number; feeVatCents?: number; clears?: "card" | "gateway"; storeId?: string | null; memo?: string | null };

/** A party for a control account's line: a supplier by name; a trade account by number or name; a franchisee by a store code or its name. */
async function partyOf(t: Tx, companyId: string, kind: string, raw: string | null | undefined) {
  const v = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (kind === "SUPPLIER") {
    if (v.length < 2) throw new BankError("Name the supplier", "party");
    return { partyId: supplierParty(v), storeId: null };
  }
  const ci = (s: string) => ({ equals: s, mode: "insensitive" as const });
  if (kind === "TRADE_ACCOUNT") {
    const ta = v ? await t.tradeAccount.findFirst({ where: { OR: [{ number: ci(v) }, { name: ci(v) }] }, select: { id: true } }) : null;
    if (!ta) throw new BankError("Enter the trade account's number (TA-…) or its exact name", "party");
    return { partyId: ta.id, storeId: null };
  }
  const store = v ? await t.store.findFirst({ where: { code: ci(v), companyId: { not: companyId } }, select: { id: true, companyId: true } }) : null;
  if (store) return { partyId: store.companyId, storeId: store.id };
  const co = v ? await t.company.findFirst({ where: { id: { not: companyId }, OR: [{ name: ci(v) }, { legalName: ci(v) }] }, select: { id: true } }) : null;
  if (!co) throw new BankError("Enter the franchisee's store code or its company name", "party");
  return { partyId: co.id, storeId: null };
}

/** Posts a journal for a line nothing in the books covers yet, and marks it allocated. */
export async function allocateLine(companyId: string, lineId: string, a: Allocation) {
  const { actor } = await writer(companyId);
  return tx(async (t) => {
    const { line, acct } = await lockedLine(t, companyId, lineId);
    if (line.status !== "UNMATCHED") throw already(line.status);
    const book = await booksFor(t, companyId);
    const amount = line.amountCents;
    let storeId = await ownStore(t, companyId, a.storeId);
    let lines: Line[], to: string;
    if (a.kind === "payout") {
      if (amount <= 0) throw new BankError("A card payout is money in — allocate money out to an account instead", "kind");
      const fee = a.feeCents, vat = a.feeVatCents ?? 0;
      if (!Number.isInteger(fee) || fee < 0 || fee > 100_000_000) throw new BankError("Enter the fee taken off the payout (0 if none)", "fee");
      if (vat && !book.vendor) throw new BankError("This company isn't registered for VAT, so there's no VAT to claim", "feeVat");
      if (!Number.isInteger(vat) || vat < 0 || vat > fee) throw new BankError("The VAT can't be more than the fee", "feeVat");
      const clears = a.clears === "gateway" && book.accounts.has("gateway") ? "gateway" : "card";
      lines = [
        { accountId: acct.accountId, cents: amount, storeId },
        { key: "card.fees", cents: fee - vat, storeId },
        { key: "vat.input", cents: vat, storeId },
        { key: clears, cents: -(amount + fee), storeId },
      ];
      to = clears === "card" ? "card payments (payout)" : "online payments (payout)";
    } else {
      const target = await t.ledgerAccount.findFirst({ where: { id: a.accountId, companyId, active: true } });
      if (!target) throw new BankError("Choose one of these books' accounts", "accountId");
      if (target.id === acct.accountId) throw new BankError("That's this bank account itself — choose where the money came from or went", "accountId");
      if (target.key && KEPT[target.key]) throw new BankError(KEPT[target.key], "accountId");
      const party = target.party ? await partyOf(t, companyId, target.party, a.party) : { partyId: null, storeId: null };
      storeId = party.storeId ?? storeId;
      const vat = a.vatCents ?? 0;
      if (vat) {
        if (!book.vendor) throw new BankError("This company isn't registered for VAT, so there's no VAT to claim", "vat");
        if (amount > 0) throw new BankError("VAT is claimed on money out — leave it empty for money in", "vat");
        if (!Number.isInteger(vat) || vat < 0 || vat >= -amount) throw new BankError("The VAT must be less than the amount", "vat");
      }
      lines = [
        { accountId: acct.accountId, cents: amount, storeId },
        { accountId: target.id, cents: -amount - vat, storeId, partyId: party.partyId },
        { key: "vat.input", cents: vat, storeId },
      ];
      to = `${target.code} ${target.name}`;
    }
    const memo = a.memo?.trim().replace(/\s+/g, " ") || line.description;
    const posting: Posting = { companyId, date: day(line.date), memo: `Bank: ${memo}`.slice(0, 300), storeId, lines };
    const j = (await syncPosting(t, "bank", line.id, companyId, posting)) ?? (await t.journal.findFirst({ where: { companyId, source: "bank", sourceId: line.id, status: "POSTED" }, orderBy: { number: "desc" } }));
    if (!j) throw new BankError("Nothing was posted — try again.");
    await t.bankLine.update({ where: { id: line.id }, data: { status: "ALLOCATED", journalId: j.id, matchedById: actor.id, matchedAt: new Date() } });
    await audit(t, actor, "bank.line.allocate", {
      entity: "BankLine", entityId: line.id,
      data: { companyId, bankAccountId: acct.id, journal: j.number, to, amountCents: amount, date: day(line.date), ...(a.kind === "payout" ? { feeCents: a.feeCents, vatCents: a.feeVatCents ?? 0 } : { vatCents: a.vatCents ?? 0 }) },
    });
    return { number: j.number, to };
  });
}

/** Takes an allocation back: its journal is reversed (into the first open month if its own is closed) and the line is open again. */
export async function unallocateLine(companyId: string, lineId: string) {
  const { actor } = await writer(companyId);
  return tx(async (t) => {
    const { line, acct } = await lockedLine(t, companyId, lineId);
    if (line.status !== "ALLOCATED") throw new BankError("This line isn't allocated.");
    // A transfer to another of the company's accounts may be matched on that account's statement: unmatch it there first.
    const journals = await t.journal.findMany({ where: { companyId, source: "bank", sourceId: line.id }, select: { id: true } });
    const elsewhere = await t.bankLine.findFirst({ where: { companyId, id: { not: line.id }, status: "MATCHED", journalId: { in: journals.map((j) => j.id) } }, select: { bankAccountId: true } });
    if (elsewhere) {
      const other = await t.bankAccount.findUnique({ where: { id: elsewhere.bankAccountId }, select: { name: true } });
      throw new BankError(`This allocation is matched on ${other?.name ?? "another account"}'s statement — unmatch it there first.`);
    }
    const r = await syncPosting(t, "bank", line.id, companyId, null);
    await t.bankLine.update({ where: { id: line.id }, data: { status: "UNMATCHED", journalId: null, matchedById: null, matchedAt: null } });
    await audit(t, actor, "bank.line.unallocate", { entity: "BankLine", entityId: line.id, data: { companyId, bankAccountId: acct.id, reversal: r?.number ?? null, amountCents: line.amountCents, date: day(line.date) } });
    return { reversal: r?.number ?? null };
  });
}

// ── Reading ────────────────────────────────────────────────────────────────────

/** The statement's balance at the end of a day: the last line with a balance, carried on by the lines after it. */
async function statementAt(bankAccountId: string, on: string) {
  const last = await db.bankLine.findFirst({ where: { bankAccountId, date: { lte: dateCol(on) }, balanceCents: { not: null } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }], select: { id: true, date: true, balanceCents: true } });
  if (!last) return null;
  const [after] = await db.$queryRaw<{ cents: bigint | null; n: number }[]>`
    SELECT SUM(b."amountCents")::bigint AS cents, COUNT(*)::int AS n FROM "BankLine" b, "BankLine" lb
    WHERE lb.id = ${last.id} AND b."bankAccountId" = ${bankAccountId} AND b.date <= ${on}::date AND (b.date, b."createdAt", b.id) > (lb.date, lb."createdAt", lb.id)`;
  return { cents: last.balanceCents! + Number(after?.cents ?? 0), asOf: day(last.date), later: after?.n ?? 0 };
}

/** The balance before the first imported line: the first balance given, less the lines up to it. */
async function statementOpening(bankAccountId: string) {
  const [row] = await db.$queryRaw<{ cents: bigint }[]>`
    SELECT f."balanceCents" - (SELECT SUM(b."amountCents") FROM "BankLine" b WHERE b."bankAccountId" = f."bankAccountId" AND (b.date, b."createdAt", b.id) <= (f.date, f."createdAt", f.id))::bigint AS cents
    FROM "BankLine" f WHERE f."bankAccountId" = ${bankAccountId} AND f."balanceCents" IS NOT NULL ORDER BY f.date, f."createdAt", f.id LIMIT 1`;
  return row ? Number(row.cents) : null;
}

/** A ledger account's balance at the end of a day: the running totals of the months before, and the lines of its own. */
async function ledgerAt(companyId: string, accountId: string, on: string) {
  const [before, month] = await Promise.all([
    db.ledgerBalance.aggregate({ where: { companyId, accountId, period: { lt: periodOf(on) } }, _sum: { debitCents: true, creditCents: true } }),
    db.journalLine.aggregate({ where: { companyId, accountId, period: periodOf(on), date: { lte: dateCol(on) }, journal: { status: "POSTED" } }, _sum: { amountCents: true } }),
  ]);
  return Number(before._sum.debitCents ?? 0n) - Number(before._sum.creditCents ?? 0n) + (month._sum.amountCents ?? 0);
}

/** The company's bank accounts with their books balance, the statement's latest balance and what's still to do. */
export async function bankAccountsOf(companyId: string) {
  const accounts = await db.bankAccount.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a.id);
  const [ledger, todo, latest, ledgerAccounts, stores] = await Promise.all([
    db.ledgerBalance.groupBy({ by: ["accountId"], where: { companyId, accountId: { in: accounts.map((a) => a.accountId) } }, _sum: { debitCents: true, creditCents: true } }),
    db.bankLine.groupBy({ by: ["bankAccountId"], where: { bankAccountId: { in: ids }, status: "UNMATCHED" }, _count: true, _sum: { amountCents: true } }),
    db.bankLine.groupBy({ by: ["bankAccountId"], where: { bankAccountId: { in: ids } }, _max: { date: true, createdAt: true }, _count: true }),
    db.ledgerAccount.findMany({ where: { id: { in: accounts.map((a) => a.accountId) } }, select: { id: true, code: true, name: true, key: true } }),
    db.store.findMany({ where: { companyId, id: { in: accounts.flatMap((a) => (a.storeId ? [a.storeId] : [])) } }, select: { id: true, code: true, name: true } }),
  ]);
  const statements = await Promise.all(accounts.map((a) => {
    const last = latest.find((l) => l.bankAccountId === a.id)?._max.date;
    return last ? statementAt(a.id, day(last)) : null;
  }));
  return accounts.map((a, i) => {
    const l = ledger.find((x) => x.accountId === a.accountId)?._sum;
    const t = todo.find((x) => x.bankAccountId === a.id);
    const m = latest.find((x) => x.bankAccountId === a.id);
    return {
      ...a,
      ledgerAccount: ledgerAccounts.find((x) => x.id === a.accountId) ?? null,
      store: stores.find((s) => s.id === a.storeId) ?? null,
      ledgerCents: Number(l?.debitCents ?? 0n) - Number(l?.creditCents ?? 0n),
      statement: statements[i],
      todo: t?._count ?? 0,
      todoCents: t?._sum.amountCents ?? 0,
      lines: m?._count ?? 0,
      lastImport: m?._max.createdAt ?? null,
    };
  });
}
export type BankAccountRow = Awaited<ReturnType<typeof bankAccountsOf>>[number];

/** One of the company's bank accounts, with its ledger account and store (null when it isn't the company's). */
export async function bankAccountOf(companyId: string, id: string) {
  const a = await db.bankAccount.findFirst({ where: { id, companyId } });
  if (!a) return null;
  const [ledgerAccount, store] = await Promise.all([
    db.ledgerAccount.findUnique({ where: { id: a.accountId }, select: { id: true, code: true, name: true, key: true } }),
    a.storeId ? db.store.findUnique({ where: { id: a.storeId }, select: { id: true, code: true, name: true } }) : null,
  ]);
  return { ...a, ledgerAccount, store };
}

export const LINE_FILTERS = { todo: "To do", matched: "Matched", allocated: "Allocated", ignored: "Ignored", all: "All" } as const;
export type LineFilter = keyof typeof LINE_FILTERS;
const FILTER_STATUS: Record<Exclude<LineFilter, "all">, BankLineStatus> = { todo: "UNMATCHED", matched: "MATCHED", allocated: "ALLOCATED", ignored: "IGNORED" };

/** A page of a bank account's statement lines (to do: oldest first, to work through; the rest newest first). */
export async function bankLinePage(companyId: string, acct: { id: string; accountId: string }, filter: LineFilter, page: number, pageSize: number) {
  const where: Prisma.BankLineWhereInput = { bankAccountId: acct.id, companyId, ...(filter !== "all" && { status: FILTER_STATUS[filter] }) };
  const [total, rows, counts] = await Promise.all([
    db.bankLine.count({ where }),
    db.bankLine.findMany({ where, orderBy: filter === "todo" ? [{ date: "asc" }, { createdAt: "asc" }] : [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.bankLine.groupBy({ by: ["status"], where: { bankAccountId: acct.id, companyId }, _count: true }),
  ]);
  const journalIds = [...new Set(rows.flatMap((r) => (r.journalId ? [r.journalId] : [])))];
  const [journals, users, suggestions] = await Promise.all([
    journalIds.length
      ? db.journal.findMany({ where: { id: { in: journalIds }, companyId }, select: { id: true, number: true, date: true, memo: true, source: true, lines: { select: { amountCents: true, account: { select: { id: true, code: true, name: true } } } } } })
      : [],
    db.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => (r.matchedById ? [r.matchedById] : [])))] } }, select: { id: true, name: true } }),
    suggestionsFor(companyId, acct, rows),
  ]);
  const byId = new Map(journals.map((j) => [j.id, j]));
  const who = new Map(users.map((u) => [u.id, u.name]));
  const count = (s: BankLineStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  return {
    total,
    counts: { todo: count("UNMATCHED"), matched: count("MATCHED"), allocated: count("ALLOCATED"), ignored: count("IGNORED"), all: counts.reduce((n, c) => n + c._count, 0) },
    rows: rows.map((r) => {
      const j = r.journalId ? byId.get(r.journalId) : undefined;
      return {
        ...r,
        day: day(r.date),
        journal: j ? { id: j.id, number: j.number, day: day(j.date), memo: j.memo, source: j.source, to: j.lines.filter((l) => l.account.id !== acct.accountId && l.amountCents).map((l) => `${l.account.code} ${l.account.name}`) } : null,
        by: r.matchedById ? (who.get(r.matchedById) ?? null) : null,
        suggestions: suggestions.get(r.id) ?? [],
      };
    }),
  };
}
export type BankLineRow = Awaited<ReturnType<typeof bankLinePage>>["rows"][number];

/** What a line can be allocated to: the books' active accounts (not this bank's own, nor the ones kept by their own records), and the company's stores. */
export async function allocationChoices(companyId: string, acct: { accountId: string }) {
  const [accounts, stores, company] = await Promise.all([
    db.ledgerAccount.findMany({ where: { companyId, active: true, id: { not: acct.accountId } }, select: { id: true, code: true, name: true, type: true, key: true, party: true }, orderBy: { code: "asc" } }),
    db.store.findMany({ where: { companyId, status: { not: "CLOSED" } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { vatNumber: true, kind: true } }),
  ]);
  return {
    accounts: accounts.filter((a) => !(a.key && KEPT[a.key])).map(({ id, code, name, type, party }) => ({ id, code, name, type, party })),
    stores,
    vendor: !!company.vatNumber,
    gateway: company.kind === "FRANCHISOR",
  };
}

/** Recent statement files imported to a bank account, with how many lines each added. */
export async function statementFiles(companyId: string, bankAccountId: string, take = 5) {
  const added = await db.bankLine.groupBy({ by: ["uploadId"], where: { bankAccountId, companyId, uploadId: { not: null } }, _count: true, _min: { date: true }, _max: { date: true } });
  const uploads = added.length ? await db.upload.findMany({ where: { id: { in: added.map((a) => a.uploadId!) } }, orderBy: { createdAt: "desc" }, take, select: { id: true, fileName: true, createdAt: true, sizeBytes: true, uploadedById: true } }) : [];
  const users = await db.user.findMany({ where: { id: { in: uploads.flatMap((u) => (u.uploadedById ? [u.uploadedById] : [])) } }, select: { id: true, name: true } });
  return uploads.map((u) => {
    const a = added.find((x) => x.uploadId === u.id)!;
    return { ...u, lines: a._count, from: a._min.date ? day(a._min.date) : null, to: a._max.date ? day(a._max.date) : null, by: users.find((x) => x.id === u.uploadedById)?.name ?? null };
  });
}

/** A statement file imported to one of the company's bank accounts (for downloading it again). */
export async function statementFile(companyId: string, bankAccountId: string, uploadId: string) {
  const line = await db.bankLine.findFirst({ where: { companyId, bankAccountId, uploadId }, select: { id: true } });
  return line ? db.upload.findUnique({ where: { id: uploadId } }) : null;
}

/** Statement lines still to do in a company's books, up to a day (the month-end check). */
export async function bankToDo(companyId: string, through?: string) {
  const r = await db.bankLine.aggregate({ where: { companyId, status: "UNMATCHED", ...(through && { date: { lte: dateCol(through) } }) }, _count: true, _sum: { amountCents: true } });
  return { count: r._count, cents: r._sum.amountCents ?? 0 };
}

const LIST_MAX = 500;

/**
 * The reconciliation of a bank account at the end of a day:
 *   - the books' balance (the running totals of the months before, and the day's month line by line);
 *   - the statement's balance (the last line with a balance on or before the day, carried on by any lines after it
 *     without one; when the files carry no balances, the one read off the statement);
 *   - postings in the books not yet (fully) on the statement, since the first imported line;
 *   - statement lines not in the books: still to do, ignored, or matched to a posting dated after the day;
 *   - before the first imported line: the books less the statement's opening balance;
 *   - and what's left unexplained.
 */
export async function reconciliation(companyId: string, bankAccountId: string, on: string, opts: { statementCents?: number | null } = {}) {
  const acct = await bankAccountOf(companyId, bankAccountId);
  if (!acct) return null;
  const end = dateCol(on);
  const [ledgerCents, first, statement, opening, lineTotal] = await Promise.all([
    ledgerAt(companyId, acct.accountId, on),
    db.bankLine.findFirst({ where: { bankAccountId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], select: { date: true } }),
    statementAt(bankAccountId, on),
    statementOpening(bankAccountId),
    db.bankLine.aggregate({ where: { bankAccountId, date: { lte: end } }, _sum: { amountCents: true }, _count: true }),
  ]);
  const start = first ? day(first.date) : null;
  // Imports without balances: the statement balance read off the statement gives the opening too.
  const given = statement == null && opts.statementCents != null ? opts.statementCents : null;
  const statementCents = statement?.cents ?? given;
  const openingCents = opening ?? (given != null ? given - (lineTotal._sum.amountCents ?? 0) : null);

  const rows = await db.$queryRaw<{ key: string; date: Date | null; cents: bigint; matched: bigint; journalId: string; number: number; memo: string; lineDate: Date | null; description: string | null; lines: number }[]>`
    WITH led AS (
      SELECT ${POSTING("j")} AS key, MIN(j.date) AS date, SUM(l."amountCents")::bigint AS cents, MIN(j.number) AS number,
        (array_agg(j.id ORDER BY j.number))[1] AS "journalId", (array_agg(j.memo ORDER BY j.number))[1] AS memo
      FROM "JournalLine" l JOIN "Journal" j ON j.id = l."journalId"
      WHERE l."companyId" = ${companyId} AND l."accountId" = ${acct.accountId} AND l.date <= ${on}::date AND j.status = 'POSTED'
      GROUP BY 1
    ), mat AS (
      SELECT ${POSTING("j")} AS key, SUM(b."amountCents")::bigint AS cents, COUNT(*)::int AS lines, MIN(b.date) AS "lineDate", (array_agg(b.description ORDER BY b.date))[1] AS description,
        MIN(j.number) AS number, (array_agg(j.id ORDER BY j.number))[1] AS "journalId", (array_agg(j.memo ORDER BY j.number))[1] AS memo
      FROM "BankLine" b JOIN "Journal" j ON j.id = b."journalId"
      WHERE b."bankAccountId" = ${bankAccountId} AND b.status IN ('MATCHED', 'ALLOCATED') AND b.date <= ${on}::date
      GROUP BY 1
    )
    SELECT COALESCE(led.key, mat.key) AS key, led.date, COALESCE(led.cents, 0)::bigint AS cents, COALESCE(mat.cents, 0)::bigint AS matched,
      COALESCE(led."journalId", mat."journalId") AS "journalId", COALESCE(led.number, mat.number) AS number, COALESCE(led.memo, mat.memo) AS memo,
      mat."lineDate", mat.description, COALESCE(mat.lines, 0)::int AS lines
    FROM led FULL JOIN mat ON mat.key = led.key
    WHERE COALESCE(led.cents, 0) <> COALESCE(mat.cents, 0)
    ORDER BY led.date NULLS LAST, 6`;

  let broughtForwardCents = 0;
  const outstanding: { journalId: string; number: number; day: string; memo: string; cents: number; matchedCents: number; leftCents: number; reversed: boolean }[] = [];
  const later: { journalId: string; number: number; day: string; description: string; lines: number; cents: number }[] = [];
  for (const r of rows) {
    const [cents, matched] = [Number(r.cents), Number(r.matched)];
    if (!r.date) later.push({ journalId: r.journalId, number: r.number, day: day(r.lineDate!), description: r.description ?? r.memo, lines: r.lines, cents: matched });
    else if (start && day(r.date) < start) broughtForwardCents += cents - matched;
    else outstanding.push({ journalId: r.journalId, number: r.number, day: day(r.date), memo: r.memo, cents, matchedCents: matched, leftCents: cents - matched, reversed: cents === 0 });
  }
  const notIn = { status: { in: ["UNMATCHED", "IGNORED"] as BankLineStatus[] }, bankAccountId, date: { lte: end } };
  const [open, openBy] = await Promise.all([
    db.bankLine.findMany({ where: notIn, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: LIST_MAX, select: { id: true, date: true, amountCents: true, description: true, reference: true, status: true } }),
    db.bankLine.groupBy({ by: ["status"], where: notIn, _count: true, _sum: { amountCents: true } }),
  ]);
  const sumOf = (s: BankLineStatus) => openBy.find((x) => x.status === s)?._sum.amountCents ?? 0;
  const countOf = (s: BankLineStatus) => openBy.find((x) => x.status === s)?._count ?? 0;
  const laterCents = later.reduce((s, l) => s + l.cents, 0);
  const outstandingCents = outstanding.reduce((s, o) => s + o.leftCents, 0);
  const notInBooksCents = sumOf("UNMATCHED") + sumOf("IGNORED") + laterCents;
  return {
    account: acct, on, start, ledgerCents, statement: statement ?? (given != null ? { cents: given, asOf: null, later: 0 } : null), statementCents, openingCents,
    linesToDate: lineTotal._count, broughtForwardCents,
    outstanding: { items: outstanding.slice(0, LIST_MAX), count: outstanding.length, cents: outstandingCents },
    notInBooks: {
      lines: open.map((l) => ({ ...l, day: day(l.date) })), later,
      unmatched: { count: countOf("UNMATCHED"), cents: sumOf("UNMATCHED") }, ignored: { count: countOf("IGNORED"), cents: sumOf("IGNORED") },
      count: countOf("UNMATCHED") + countOf("IGNORED") + later.length, cents: notInBooksCents,
    },
    ...reconcile({ ledgerCents, statementCents, openingCents, broughtForwardCents, outstandingCents, notInBooksCents }),
  };
}
export type Reconciliation = NonNullable<Awaited<ReturnType<typeof reconciliation>>>;
