// The working parts of a company's books behind the screens: the chart of accounts, manual and opening journals,
// closing and reopening months, the books settings, the company's accountants, and where an automatic journal came
// from. Each function takes the person acting and checks their rights again (booksRole), so nothing here can be reached
// around the screens; every change is audited (journals, approvals and closes by the core itself).
import { unstable_rethrow } from "next/navigation";
import { db, tx } from "../db";
import { audit, type Actor } from "../audit";
import { reportFailure } from "../alerts";
import { hashSecret } from "../crypto";
import { scopeOf, storeWhere } from "../scope";
import { temporaryPassword, tempPasswordUntil } from "../passwords";
import type { Staff } from "../auth";
import { booksAccess, booksRole, type BooksRole } from "./access";
import { approveJournal, booksFor, createManualJournal, deleteDraft, LedgerError, processLedgerQueue, queuePosting, reverseJournal, setBooksLock, type JournalLineInput } from "./core";
import { accountCodeProblem, firstProblems, MAX_LINE_CENTS, readOpeningCsv } from "@/lib/ledger-admin";
import { addMonths, supplierParty, VAT_CATEGORIES, type AccountType, type Party } from "@/lib/ledger";
import { dayKey, fmtDate, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";
import { isEmail } from "@/lib/email";
import { plural } from "@/lib/plural";

/** A problem with one field of a books form (the action shows it under that field). */
export class BooksFieldError extends LedgerError {
  constructor(message: string, public field: string) {
    super(message);
  }
}

export type BooksUser = Pick<Staff, "id" | "name" | "role" | "companyId" | "regionId">;
const TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const approver = (kind: string) => (kind === "FRANCHISOR" ? "an HQ administrator" : "the owner");

/** The person's rights in a company's books, or a refusal that says who may. */
async function rights(user: BooksUser, companyId: string, need: keyof BooksRole) {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { id: true, kind: true, name: true, vatNumber: true, booksLockedThrough: true, vatCategory: true, yearEndMonth: true } });
  if (!company) throw new LedgerError("These books don't exist");
  const role = await booksRole(user, company);
  if (!role[need])
    throw new LedgerError(!role.read ? "You don't have access to these books." : need === "approve" ? `Only ${approver(company.kind)} can do that in these books.` : "You can read these books, but not change them.");
  const actor: Actor & { id: string } = { type: "USER", id: user.id, name: user.name };
  return { company, role, actor };
}

// ── Chart of accounts ─────────────────────────────────────────────────────────

const cleanName = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 80);

async function accountIn(companyId: string, accountId: string) {
  const a = await db.ledgerAccount.findFirst({ where: { id: accountId, companyId } });
  if (!a) throw new LedgerError("That account isn't in these books");
  return a;
}

/** An account the company adds: a free four-digit code, never a system key (the posting rules don't know it). */
export async function createAccount(user: BooksUser, companyId: string, a: { code: string; name: string; type: string }) {
  const { actor } = await rights(user, companyId, "write");
  const code = a.code.trim();
  const name = cleanName(a.name);
  const bad = accountCodeProblem(code);
  if (bad) throw new BooksFieldError(bad, "code");
  if (name.length < 2) throw new BooksFieldError("Name the account", "name");
  if (!TYPES.includes(a.type as AccountType)) throw new BooksFieldError("Choose what kind of account it is", "type");
  await tx((t) => booksFor(t, companyId)); // the template's codes are taken first
  if (await db.ledgerAccount.count({ where: { companyId, code } })) throw new BooksFieldError(`${code} is already used. Choose another code`, "code");
  const acc = await db.ledgerAccount.create({ data: { companyId, code, name, type: a.type as AccountType } });
  await audit(db, actor, "ledger.account_create", { entity: "LedgerAccount", entityId: acc.id, data: { companyId, code, name, type: acc.type } });
  return acc;
}

/** Renames an account (system accounts too: the rules post by key). Only an added account with no postings changes type. */
export async function renameAccount(user: BooksUser, companyId: string, accountId: string, a: { name?: string; type?: string }) {
  const { actor } = await rights(user, companyId, "write");
  const acc = await accountIn(companyId, accountId);
  const name = a.name == null ? acc.name : cleanName(a.name);
  if (name.length < 2) throw new BooksFieldError("Name the account", "name");
  const type = (a.type ?? acc.type) as AccountType;
  if (!TYPES.includes(type)) throw new BooksFieldError("Choose what kind of account it is", "type");
  if (type !== acc.type) {
    if (acc.key) throw new BooksFieldError("A system account keeps its type, but you can rename it", "type");
    if (await db.journalLine.count({ where: { accountId } })) throw new BooksFieldError("It has postings already: add a new account and move the balance with a journal", "type");
  }
  if (name === acc.name && type === acc.type) return acc;
  const updated = await db.ledgerAccount.update({ where: { id: accountId }, data: { name, type } });
  await audit(db, actor, "ledger.account_rename", { entity: "LedgerAccount", entityId: accountId, data: { companyId, code: acc.code, before: { name: acc.name, type: acc.type }, after: { name, type } } });
  return updated;
}

/** Switches an account off (an added one with nothing on it) or back on. */
export async function setAccountActive(user: BooksUser, companyId: string, accountId: string, active: boolean) {
  const { actor } = await rights(user, companyId, "write");
  const acc = await accountIn(companyId, accountId);
  if (acc.active === active) return acc;
  if (!active) {
    if (acc.key) throw new LedgerError(`${acc.code} ${acc.name} is a system account: the posting rules use it, so it stays on`);
    const b = await db.ledgerBalance.aggregate({ where: { companyId, accountId }, _sum: { debitCents: true, creditCents: true } });
    const cents = Number(b._sum.debitCents ?? 0) - Number(b._sum.creditCents ?? 0);
    if (cents) throw new LedgerError(`${acc.code} ${acc.name} still has a balance of ${zar(cents)}. Move it to another account with a journal first`);
    if (await db.journalLine.count({ where: { accountId, journal: { status: "DRAFT" } } })) throw new LedgerError("A draft journal uses it. Approve or delete the draft first");
    if (await db.bankAccount.count({ where: { accountId, active: true } })) throw new LedgerError("A bank account in Banking uses it. Close that bank account first");
  }
  const updated = await db.ledgerAccount.update({ where: { id: accountId }, data: { active } });
  await audit(db, actor, active ? "ledger.account_reactivate" : "ledger.account_deactivate", { entity: "LedgerAccount", entityId: accountId, data: { companyId, code: acc.code, name: acc.name } });
  return updated;
}

// ── Journal lines from the screens: accounts, stores and parties checked against the company ──

/** A line as typed or imported: the account by id or code, the store by id or code, the party as typed. */
export type LineDraft = { account: string; cents: number; store?: string | null; party?: string | null; memo?: string | null };

/**
 * Resolves lines against the company's books: each account must be its own and switched on, each store one of its
 * stores; a party is required on (and only on) control accounts: a supplier by name, a trade account by number, a
 * franchisee company by name. Problems are named by `where(i)` ("Line 3", "Row 12").
 */
export async function resolveLines(companyId: string, lines: LineDraft[], where: (i: number) => string): Promise<JournalLineInput[]> {
  await tx((t) => booksFor(t, companyId));
  const accounts = await db.ledgerAccount.findMany({ where: { companyId, OR: [{ id: { in: lines.map((l) => l.account) } }, { code: { in: lines.map((l) => l.account) } }] } });
  const accountOf = (ref: string) => accounts.find((a) => a.id === ref || a.code === ref);
  const stores = await db.store.findMany({ where: { companyId }, select: { id: true, code: true } });
  const typed = (kind: Party) => [...new Set(lines.flatMap((l) => (accountOf(l.account)?.party === kind && l.party?.trim() ? [l.party.trim()] : [])))];
  const tradeRefs = typed("TRADE_ACCOUNT");
  const [trade, companies] = await Promise.all([
    tradeRefs.length ? db.tradeAccount.findMany({ where: { OR: [{ id: { in: tradeRefs } }, { number: { in: tradeRefs.map((s) => s.toUpperCase()) } }] }, select: { id: true, number: true } }) : [],
    typed("COMPANY").length ? db.company.findMany({ where: { kind: "FRANCHISEE" }, select: { id: true, name: true, legalName: true } }) : [],
  ]);
  const problems: string[] = [];
  const out: JournalLineInput[] = [];
  lines.forEach((l, i) => {
    const say = (m: string) => problems.push(`${where(i)}: ${m}.`);
    const acc = accountOf(l.account);
    if (!acc) return say(l.account ? `there's no account ${l.account} in these books` : "choose an account");
    if (!acc.active) return say(`${acc.code} ${acc.name} is switched off. Switch it on in the chart of accounts first`);
    if (!Number.isInteger(l.cents) || l.cents === 0) return say("enter a debit or a credit");
    if (Math.abs(l.cents) > MAX_LINE_CENTS) return say(`more than ${zar(MAX_LINE_CENTS)}: check the amount`);
    const ref = l.store?.trim();
    const store = ref ? stores.find((s) => s.id === ref || s.code === ref.toUpperCase()) : null;
    if (ref && !store) return say(`store ${ref} isn't one of this company's`);
    const p = l.party?.trim() ?? "";
    let partyId: string | null = null;
    if (!acc.party) {
      if (p) return say(`${acc.code} ${acc.name} doesn't take a supplier, trade account or company, so leave it empty`);
    } else if (!p) {
      return say(`${acc.code} ${acc.name} needs the ${acc.party === "SUPPLIER" ? "supplier's name" : acc.party === "TRADE_ACCOUNT" ? "trade account number" : "franchisee company"}`);
    } else if (acc.party === "SUPPLIER") partyId = supplierParty(p);
    else if (acc.party === "TRADE_ACCOUNT") {
      partyId = trade.find((x) => x.id === p || x.number === p.toUpperCase())?.id ?? null;
      if (!partyId) return say(`there's no trade account ${p}`);
    } else {
      const lower = p.toLowerCase();
      const found = companies.filter((c) => c.id === p || c.name.toLowerCase() === lower || c.legalName.toLowerCase() === lower);
      if (found.length !== 1) return say(found.length ? `more than one franchisee is called ${p}: use the registered name` : `there's no franchisee company ${p}`);
      partyId = found[0].id;
    }
    out.push({ accountId: acc.id, cents: l.cents, storeId: store?.id ?? null, partyId, memo: l.memo?.trim().slice(0, 200) || null });
  });
  if (problems.length) throw new LedgerError(firstProblems(problems));
  return out;
}

// ── Manual journals ───────────────────────────────────────────────────────────

/**
 * A manual journal from the form: saved as a draft by anyone who may write, posted straight away only by someone who
 * may approve. Lines carry a debit or a credit (cents), never both.
 */
export async function saveJournal(user: BooksUser, companyId: string, j: { date: string; memo: string; post: boolean; lines: { account: string; debitCents: number; creditCents: number; store?: string | null; party?: string | null; memo?: string | null }[] }) {
  const { company, role, actor } = await rights(user, companyId, "write");
  if (j.post && !role.approve) throw new LedgerError(`Only ${approver(company.kind)} posts journals. Save it as a draft and they'll approve it.`);
  if (!DAY.test(j.date)) throw new BooksFieldError("Choose the journal's date", "date");
  if (j.memo.trim().length < 3) throw new BooksFieldError("Say what the journal is for", "memo");
  const used = j.lines.filter((l) => l.account || l.debitCents || l.creditCents);
  if (used.length < 2) throw new LedgerError("A journal needs at least two lines: what's debited and what's credited.");
  const both = used.findIndex((l) => l.debitCents && l.creditCents);
  if (both >= 0) throw new LedgerError(`Line ${both + 1}: enter a debit or a credit, not both.`);
  const lines = await resolveLines(companyId, used.map((l) => ({ account: l.account, cents: (l.debitCents || 0) - (l.creditCents || 0), store: l.store, party: l.party, memo: l.memo })), (i) => `Line ${i + 1}`);
  const out = lines.reduce((s, l) => s + l.cents, 0);
  if (out) throw new LedgerError(`The journal doesn't balance: the debits are ${out > 0 ? "more" : "less"} than the credits by ${zar(Math.abs(out))}.`);
  return createManualJournal({ companyId, date: j.date, memo: j.memo, post: j.post, actor, lines });
}

export async function approveDraft(user: BooksUser, companyId: string, journalId: string) {
  const { actor } = await rights(user, companyId, "approve");
  return approveJournal(journalId, companyId, actor);
}

export async function deleteDraftJournal(user: BooksUser, companyId: string, journalId: string) {
  const { actor } = await rights(user, companyId, "write");
  return deleteDraft(journalId, companyId, actor);
}

/** Reverses a posted manual or opening journal on `date` (its reversal posts straight away, so it needs approve rights). */
export async function reverseManual(user: BooksUser, companyId: string, journalId: string, date?: string) {
  const { actor } = await rights(user, companyId, "approve");
  if (date && !DAY.test(date)) throw new BooksFieldError("Choose the reversal's date", "date");
  return reverseJournal(journalId, companyId, actor, date);
}

// ── Opening balances ──────────────────────────────────────────────────────────

/** Opening journals still standing (posted or draft, not reversed). */
export async function openingJournals(companyId: string) {
  const all = await db.journal.findMany({ where: { companyId, source: "opening", reversalOfId: null }, orderBy: { number: "asc" }, select: { id: true, number: true, date: true, status: true } });
  const reversed = new Set((await db.journal.findMany({ where: { reversalOfId: { in: all.map((j) => j.id) } }, select: { reversalOfId: true } })).map((r) => r.reversalOfId));
  return all.filter((j) => !reversed.has(j.id));
}

/**
 * Imports an opening trial balance (CSV: account code, debit, credit, party, store code) as one "opening" journal on
 * `date`: posted when the person may approve, otherwise a draft for the owner. Refused when it doesn't balance, names
 * an account, store or party the company doesn't have, or opening balances are already in (unless adding to them).
 */
export async function importOpeningBalances(user: BooksUser, companyId: string, a: { text: string; date: string; addToExisting?: boolean }) {
  const { role, actor } = await rights(user, companyId, "write");
  if (!DAY.test(a.date)) throw new BooksFieldError("Choose the date the balances are at (usually the day before you started)", "date");
  const read = readOpeningCsv(a.text);
  if (read.errors.length) throw new LedgerError(firstProblems(read.errors));
  const standing = await openingJournals(companyId);
  if (standing.length && !a.addToExisting)
    throw new BooksFieldError(`Opening balances are already in (journal ${standing[0].number}, ${fmtDate(standing[0].date)}). Tick “add to them” to import more, or reverse that journal first.`, "addToExisting");
  const lines = await resolveLines(companyId, read.rows.map((r) => ({ account: r.code, cents: r.cents, store: r.store, party: r.party })), (i) => `Row ${read.rows[i].line}`);
  const journal = await createManualJournal({ companyId, date: a.date, memo: `Opening balances (${read.rows.length} ${read.rows.length === 1 ? "row" : "rows"})`, source: "opening", post: role.approve, actor, lines });
  await audit(db, actor, "ledger.opening_import", { entity: "Journal", entityId: journal.id, data: { companyId, number: journal.number, date: a.date, rows: read.rows.length, skipped: read.skipped, debitCents: read.debitCents, posted: role.approve } });
  return { journal, rows: read.rows.length, skipped: read.skipped, debitCents: read.debitCents, posted: role.approve };
}

// ── Month end ─────────────────────────────────────────────────────────────────

/** Closes the books through `month` (a month that's over); later months stay open. */
export async function closeMonth(user: BooksUser, companyId: string, month: string, now = new Date()) {
  const { company, actor } = await rights(user, companyId, "approve");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new LedgerError("Choose a month");
  if (company.booksLockedThrough && month <= company.booksLockedThrough) throw new LedgerError(`${fmtMonth(`${month}-15T12:00:00Z`)} is already closed`);
  if (!company.booksLockedThrough) await postQueueBeforeClose(month);
  await setBooksLock(companyId, month, actor, now);
}

/** How long a first close waits for the posting queue: behind Cloudflare a request is cut off at 100 seconds. */
const FIRST_CLOSE_MS = 60_000;

/**
 * The books' first close posts what's waiting in the queue first, so nothing lands late by accident (setBooksLock then
 * finds little or nothing left). For a minute at most: if postings are still waiting after that, the month stays open,
 * since closing it would put them in a later month. They post in the background (the 15-minute job), and the month
 * can be closed once they're through. Postings that failed stay queued with their reason and don't hold the close.
 */
export async function postQueueBeforeClose(month: string, ms = FIRST_CLOSE_MS) {
  await processLedgerQueue({ limit: 20_000, deadline: Date.now() + ms });
  const waiting = await db.ledgerQueue.count({ where: { attempts: 0 } });
  if (waiting)
    throw new LedgerError(`The books are still catching up (${plural(waiting, "posting")} to go). What's left posts in the background every 15 minutes: close ${fmtMonth(`${month}-15T12:00:00Z`)} once it's through, so nothing lands in a later month.`);
}

/** Reopens the last closed month (one at a time, deliberately). */
export async function reopenMonth(user: BooksUser, companyId: string, now = new Date()) {
  const { company, actor } = await rights(user, companyId, "approve");
  const locked = company.booksLockedThrough;
  if (!locked) throw new LedgerError("No month is closed");
  const before = addMonths(locked, -1);
  const first = await db.journal.findFirst({ where: { companyId }, orderBy: { period: "asc" }, select: { period: true } });
  await setBooksLock(companyId, first && first.period <= before ? before : null, actor, now);
  return locked;
}

// ── Settings ──────────────────────────────────────────────────────────────────

/** The VAT category (A, B or C for a VAT vendor; none otherwise) and the month the financial year ends. */
export async function saveBooksSettings(user: BooksUser, companyId: string, s: { vatCategory: string | null; yearEndMonth: number }) {
  const { company, actor } = await rights(user, companyId, "approve");
  const vatCategory = s.vatCategory || null;
  if (company.vatNumber && !VAT_CATEGORIES.some((c) => c.key === vatCategory)) throw new BooksFieldError("Choose the VAT category SARS gave the company", "vatCategory");
  if (!company.vatNumber && vatCategory) throw new BooksFieldError(`${company.name} has no VAT number, so it has no VAT category`, "vatCategory");
  if (!Number.isInteger(s.yearEndMonth) || s.yearEndMonth < 1 || s.yearEndMonth > 12) throw new BooksFieldError("Choose the month the financial year ends", "yearEndMonth");
  if (vatCategory === company.vatCategory && s.yearEndMonth === company.yearEndMonth) return false;
  await db.company.update({ where: { id: companyId }, data: { vatCategory, yearEndMonth: s.yearEndMonth } });
  await audit(db, actor, "ledger.settings", { entity: "Company", entityId: companyId, data: { before: { vatCategory: company.vatCategory, yearEndMonth: company.yearEndMonth }, after: { vatCategory, yearEndMonth: s.yearEndMonth } } });
  return true;
}

// ── Accountants (role ACCOUNTANT: the company's books only) ───────────────────

export const accountantsOf = (companyId: string) =>
  db.user.findMany({ where: { companyId, role: "ACCOUNTANT" }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, active: true, lastLoginAt: true, createdAt: true, mustChangePassword: true } });

const temporary = async () => {
  const password = temporaryPassword();
  return { password, data: { passwordHash: await hashSecret(password), mustChangePassword: true, tempPasswordUntil: tempPasswordUntil() } };
};

async function accountantIn(companyId: string, id: string) {
  const u = await db.user.findFirst({ where: { id, companyId, role: "ACCOUNTANT" } });
  if (!u) throw new LedgerError("That accountant isn't on these books");
  return u;
}

/** Adds an accountant with a temporary password (they choose their own at first sign-in). Owner, or HQ admin for HQ. */
export async function addAccountant(user: BooksUser, companyId: string, a: { name: string; email: string }) {
  const { actor } = await rights(user, companyId, "approve");
  const name = cleanName(a.name);
  const email = a.email.trim().toLowerCase().slice(0, 120);
  if (name.length < 2) throw new BooksFieldError("Enter their full name", "name");
  if (!isEmail(email)) throw new BooksFieldError("Enter their email address", "email");
  if (await db.user.count({ where: { email } })) throw new BooksFieldError("Someone already signs in with this email", "email");
  const { password, data } = await temporary();
  const accountant = await db.user.create({ data: { name, email, role: "ACCOUNTANT", companyId, ...data } });
  await audit(db, actor, "user.create", { entity: "User", entityId: accountant.id, data: { email, role: "ACCOUNTANT", companyId } });
  return { accountant, password };
}

export async function setAccountantActive(user: BooksUser, companyId: string, accountantId: string, active: boolean) {
  const { actor } = await rights(user, companyId, "approve");
  const u = await accountantIn(companyId, accountantId);
  if (u.active === active) return u;
  const updated = await db.user.update({ where: { id: u.id }, data: { active } });
  if (!active) await db.session.deleteMany({ where: { userId: u.id } });
  await audit(db, actor, active ? "user.reactivate" : "user.deactivate", { entity: "User", entityId: u.id, data: { email: u.email, role: "ACCOUNTANT", companyId } });
  return updated;
}

/** A new temporary password (shown once); they're signed out everywhere. */
export async function resetAccountantPassword(user: BooksUser, companyId: string, accountantId: string) {
  const { actor } = await rights(user, companyId, "approve");
  const u = await accountantIn(companyId, accountantId);
  if (!u.active) throw new LedgerError(`${u.name} is deactivated. Reactivate them first`);
  const { password, data } = await temporary();
  await db.user.update({ where: { id: u.id }, data: { ...data, passwordFails: 0, passwordLockedAt: null } });
  await db.session.deleteMany({ where: { userId: u.id } });
  await audit(db, actor, "user.password_reset", { entity: "User", entityId: u.id, data: { email: u.email, role: "ACCOUNTANT", companyId } });
  return { accountant: u, password };
}

// ── The posting queue (HQ's books) ────────────────────────────────────────────

/**
 * Queues a failed posting again (its attempts and reason cleared); the queue posts it within 15 minutes. The queue
 * is network-wide, so only HQ's books, for those who approve there, show and retry it.
 */
export async function retryPosting(user: BooksUser, companyId: string, source: string, sourceId: string) {
  const { company, actor } = await rights(user, companyId, "approve");
  if (company.kind !== "FRANCHISOR") throw new LedgerError("Postings are retried from Herbal Holland's books");
  const q = await db.ledgerQueue.findUnique({ where: { source_sourceId: { source, sourceId } } });
  if (!q) throw new LedgerError("That posting isn't waiting any more: it has probably posted");
  await queuePosting(db, source, sourceId);
  await audit(db, actor, "ledger.retry", { entity: "LedgerQueue", entityId: `${source}:${sourceId}`, data: { source, sourceId, attempts: q.attempts, error: q.error } });
}

// ── Where a journal came from ─────────────────────────────────────────────────

export type Viewer = Pick<Staff, "role" | "companyId" | "regionId" | "storeId">;
export type SourceLink = { label: string; href: string };

/**
 * The page an automatic journal came from (a store's trading day, a cash-up, a deposit, an expense, a supplier
 * invoice, a stock order, a statement, an online order, a trade account, a bank line, a VAT period) when the viewer may open it
 * (an accountant sees only the books, so only bank lines link for them). Null for manual journals and unknown sources.
 */
export async function sourceLink(j: { companyId: string; source: string; sourceId: string | null; storeId?: string | null }, viewer: Viewer): Promise<SourceLink | null> {
  if (!j.sourceId) return null;
  const scope = scopeOf(viewer);
  const hq = scope.kind === "HQ";
  const open = (id: string | null | undefined) =>
    id ? db.store.findFirst({ where: { AND: [{ id }, storeWhere(scope)] }, select: { id: true, code: true, name: true, kind: true, companyId: true } }) : Promise.resolve(null);
  const [first, second] = j.sourceId.split(":");
  const statementLink = async (storeId: string, month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return null;
    const label = `${fmtMonth(`${month}-15T12:00:00Z`)} franchise statement`;
    const store = await open(storeId);
    if (!store) return null;
    const ownBooks = store.companyId === j.companyId;
    return { label: `${store.name} · ${label}`, href: hq && !ownBooks ? `/hq/statements?month=${month}&store=${store.code}` : `/store/${store.code}/statement?month=${month}` };
  };
  switch (j.source) {
    case "store-day": {
      const store = await open(first);
      return store && DAY.test(second ?? "") ? { label: `${store.name} · trading on ${fmtDate(`${second}T12:00:00Z`)}`, href: `/store/${store.code}/finance?from=${second}&to=${second}` } : null;
    }
    case "statement":
      return statementLink(first, second ?? "");
    case "statement-payment": {
      const p = await db.statementPayment.findUnique({ where: { id: first }, select: { storeId: true, month: true } });
      return p ? statementLink(p.storeId, p.month) : null;
    }
    case "shift": {
      const s = await db.shift.findUnique({ where: { id: first }, select: { id: true, storeId: true } });
      const store = await open(s?.storeId);
      return s && store ? { label: `${store.name} · cash-up`, href: `/store/${store.code}/cash-ups/${s.id}` } : null;
    }
    case "deposit": {
      const d = await db.cashDeposit.findUnique({ where: { id: first }, select: { number: true, storeId: true } });
      const store = await open(d?.storeId);
      return d && store ? { label: `${store.name} · deposit ${d.number}`, href: `/store/${store.code}/banking?dep=${encodeURIComponent(d.number)}` } : null;
    }
    case "expense": {
      const e = await db.expense.findUnique({ where: { id: first }, select: { storeId: true, date: true, description: true } });
      const store = await open(e?.storeId);
      const day = e ? dayKey(e.date) : "";
      return e && store ? { label: `${store.name} · expense: ${e.description}`, href: `/store/${store.code}/expenses?from=${day}&to=${day}` } : null;
    }
    case "supplier-invoice":
    case "supplier-payment": {
      const inv = await db.supplierInvoice.findUnique({ where: { id: first }, select: { storeId: true, supplierName: true, number: true } });
      const store = await open(inv?.storeId);
      return inv && store ? { label: `${inv.supplierName} · invoice ${inv.number}`, href: `/store/${store.code}/finance/supplier-invoices?q=${encodeURIComponent(inv.number)}` } : null;
    }
    case "stock-ship":
    case "stock-receive": {
      const o = await db.stockOrder.findUnique({ where: { id: first }, select: { id: true, number: true, buyerId: true, sellerId: true, buyer: { select: { companyId: true } } } });
      if (!o) return null;
      const label = `Stock order ${o.number}`;
      const hqBooks = (await db.company.findUnique({ where: { id: j.companyId }, select: { kind: true } }))?.kind === "FRANCHISOR";
      if (hqBooks) return hq ? { label, href: `/hq/distribution/${o.id}` } : null;
      // The company's own side of the order: the buyer's store, or the seller's when it sold to another company.
      const store = (await open(o.buyer.companyId === j.companyId ? o.buyerId : o.sellerId)) ?? (await open(j.storeId));
      return store ? { label, href: `/store/${store.code}/purchasing/${o.id}` } : null;
    }
    case "online-payment": {
      if (!hq) return null;
      const o = await db.order.findUnique({ where: { id: first }, select: { code: true } });
      return o ? { label: `Online order ${o.code}`, href: `/hq/orders/${o.code}` } : null;
    }
    case "voucher": {
      if (!hq) return null;
      const v = await db.giftVoucher.findUnique({ where: { id: first }, select: { code: true, purchaseOrderId: true } });
      const o = v?.purchaseOrderId ? await db.order.findUnique({ where: { id: v.purchaseOrderId }, select: { code: true } }) : null;
      return v && o ? { label: `Gift voucher ${v.code}`, href: `/hq/orders/${o.code}` } : null;
    }
    case "points":
      return hq ? { label: "Herbal Holland Rewards", href: "/hq/loyalty" } : null;
    case "trade-entry": {
      if (!hq) return null;
      const e = await db.tradeLedgerEntry.findUnique({ where: { id: first }, select: { tradeAccountId: true, reference: true, account: { select: { name: true } } } });
      return e ? { label: `${e.account.name}${e.reference ? ` · ${e.reference}` : ""}`, href: `/hq/trade/accounts/${e.tradeAccountId}?tab=ledger` } : null;
    }
    case "trade-eft": {
      if (!hq) return null;
      const o = await db.tradeOrder.findUnique({ where: { id: first }, select: { id: true, number: true } });
      return o ? { label: `Trade order ${o.number}`, href: `/hq/trade/orders/${o.id}` } : null;
    }
    case "vat-period":
      return /^\d{4}-\d{2}$/.test(second ?? "") ? { label: `VAT period to ${fmtMonth(`${second}-15T12:00:00Z`)}`, href: `/books/${j.companyId}/vat?period=${second}` } : null;
    case "bank": {
      const line = await db.bankLine.findFirst({ where: { id: first, companyId: j.companyId }, select: { id: true, bankAccountId: true, date: true, description: true } });
      return line ? { label: `Bank statement · ${fmtDate(line.date)} · ${line.description.slice(0, 40)}`, href: `/books/${j.companyId}/bank/${line.bankAccountId}?line=${line.id}` } : null;
    }
    default:
      return null;
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type ActionState = { ok?: string; error?: string; fields?: Record<string, string>; at?: number };
export const done = (ok: string): ActionState => ({ ok, at: Date.now() });
export const failed = (error: string, field?: string): ActionState => ({ error, fields: field ? { [field]: error } : undefined, at: Date.now() });

/**
 * Runs a books server action for someone with `need` in the company's books (checked from the session, again):
 * expected problems come back as inline messages, redirects pass through.
 */
export async function booksAction(companyId: string, need: keyof BooksRole, fn: (a: NonNullable<Awaited<ReturnType<typeof booksAccess>>>) => Promise<ActionState>): Promise<ActionState> {
  try {
    const a = await booksAccess(companyId, need);
    if (!a) return failed(need === "read" ? "You don't have access to these books." : need === "write" ? "You can read these books, but not change them." : "Only the owner (or an HQ administrator, in HQ's books) can do that.");
    return await fn(a);
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof LedgerError) return failed(e.message, e instanceof BooksFieldError ? e.field : undefined);
    if ((e as { code?: string })?.code === "P2002") return failed("That already exists. Check for a duplicate.");
    void reportFailure(e, "books action"); // unexpected: logged and emailed to ops
    return failed("Something went wrong. Please try again.");
  }
}
