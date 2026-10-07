// The ledger's posting core. A company's books (its chart is created from the template on first use); journals and
// the running balances kept with them; automatic sources synced to what they should show, so only the difference is
// ever posted; the posting queue; manual journals, reversals and month locks. Every journal goes through
// writeJournal. The rules for each source live in ./sources.
import { db, tx, Prisma, type Tx } from "../db";
import { audit, SYSTEM, type Actor } from "../audit";
import { reportError } from "../alerts";
import { nextNumber } from "../counters";
import { chartFor, diffLines, netLines, periodOf, postingDay, splitLarge, sumCents, type Line } from "@/lib/ledger";
import { dayKey } from "@/lib/format";

export class LedgerError extends Error {}

export type Book = { companyId: string; kind: "FRANCHISOR" | "FRANCHISEE"; vendor: boolean; lockedThrough: string | null; accounts: Map<string, string> };

/** A company's books: the chart is created from the template the first time anything posts or anyone opens them. */
export async function booksFor(t: Tx, companyId: string): Promise<Book> {
  const c = await t.company.findUniqueOrThrow({ where: { id: companyId }, select: { kind: true, vatNumber: true, booksLockedThrough: true } });
  const template = chartFor(c.kind);
  let keyed = await t.ledgerAccount.findMany({ where: { companyId, key: { not: null } }, select: { id: true, key: true } });
  if (keyed.length < template.filter((r) => r.key).length) {
    await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`books:${companyId}`}))`;
    await t.ledgerAccount.createMany({ data: template.map((r) => ({ companyId, code: r.code, name: r.name, type: r.type, key: r.key ?? null, party: r.party ?? null })), skipDuplicates: true });
    keyed = await t.ledgerAccount.findMany({ where: { companyId, key: { not: null } }, select: { id: true, key: true } });
  }
  return { companyId, kind: c.kind, vendor: !!c.vatNumber, lockedThrough: c.booksLockedThrough, accounts: new Map(keyed.map((a) => [a.key!, a.id])) };
}

export type JournalLineInput = { accountId: string; cents: number; storeId?: string | null; partyId?: string | null; memo?: string | null };
export type JournalInput = {
  companyId: string;
  date: string; // YYYY-MM-DD
  memo: string;
  source: string;
  sourceId?: string | null;
  storeId?: string | null;
  status?: "DRAFT" | "POSTED";
  late?: boolean;
  reversalOfId?: string | null;
  createdById?: string | null;
  approvedById?: string | null;
  lines: JournalLineInput[];
};

/** Writes a journal (balanced, whole cents) and, once posted, its running balances. The only way journals are made. */
export async function writeJournal(t: Tx, j: JournalInput) {
  const lines = j.lines.filter((l) => l.cents !== 0);
  if (lines.length < 2) throw new LedgerError("A journal needs at least two lines");
  if (lines.some((l) => !Number.isInteger(l.cents))) throw new LedgerError("Amounts are whole cents");
  if (sumCents(lines) !== 0) throw new LedgerError(`The journal doesn't balance (out by ${sumCents(lines)} cents)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date)) throw new LedgerError("Choose the journal date");
  const date = new Date(`${j.date}T00:00:00Z`);
  const period = periodOf(j.date);
  const status = j.status ?? "POSTED";
  const journal = await t.journal.create({
    data: {
      companyId: j.companyId, number: await nextNumber(t, `journal:${j.companyId}`), date, period, source: j.source, sourceId: j.sourceId ?? null, storeId: j.storeId ?? null,
      memo: j.memo.slice(0, 300), status, late: !!j.late, reversalOfId: j.reversalOfId ?? null, createdById: j.createdById ?? null, approvedById: j.approvedById ?? null,
      lines: { create: splitLarge(lines).map((l) => ({ companyId: j.companyId, accountId: l.accountId, storeId: l.storeId ?? null, partyId: l.partyId ?? null, amountCents: l.cents, memo: l.memo?.slice(0, 200) ?? null, date, period })) },
    },
  });
  if (status === "POSTED") await addBalances(t, j.companyId, period, lines);
  return journal;
}

/** Adds lines to the running balances (company × account × store × month), one statement per journal. */
async function addBalances(t: Tx, companyId: string, period: string, lines: JournalLineInput[]) {
  const by = new Map<string, { accountId: string; storeId: string; debit: number; credit: number }>();
  for (const l of lines) {
    const k = `${l.accountId}|${l.storeId ?? ""}`;
    const row = by.get(k) ?? { accountId: l.accountId, storeId: l.storeId ?? "", debit: 0, credit: 0 };
    if (l.cents > 0) row.debit += l.cents;
    else row.credit -= l.cents;
    by.set(k, row);
  }
  const values = Prisma.join([...by.values()].map((r) => Prisma.sql`(${companyId}, ${r.accountId}, ${r.storeId}, ${period}, ${r.debit}::bigint, ${r.credit}::bigint)`));
  await t.$executeRaw`
    INSERT INTO "LedgerBalance" ("companyId", "accountId", "storeId", "period", "debitCents", "creditCents") VALUES ${values}
    ON CONFLICT ("companyId", "accountId", "storeId", "period") DO UPDATE SET
      "debitCents" = "LedgerBalance"."debitCents" + EXCLUDED."debitCents",
      "creditCents" = "LedgerBalance"."creditCents" + EXCLUDED."creditCents"`;
}

// ── Automatic sources ──────────────────────────────────────────────────────────

/** What a source should show in one company's books: lines by account key (or id), balanced, all on one date. */
export type Posting = { companyId: string; date: string; memo: string; storeId?: string | null; lines: Line[] };
/** A source's rules: everything it should show, in every company it touches, as of now ([] = nothing). */
export type SourceHandler = (sourceId: string, t: Tx) => Promise<Posting[]>;

/**
 * Brings what a source shows in one company's books to `desired` (null = nothing), posting only the difference — the
 * first posting, a correction after a late change, or the reversal of a source that's gone. Into a closed month it
 * goes to the first open one, marked late.
 */
export async function syncPosting(t: Tx, source: string, sourceId: string, companyId: string, desired: Posting | null) {
  const book = await booksFor(t, companyId);
  const resolve = (l: Line) => {
    const accountId = l.accountId ?? (l.key ? book.accounts.get(l.key) : undefined);
    if (!accountId) throw new LedgerError(`${source} ${sourceId}: no account "${l.key}" in the books`);
    return { ...l, accountId, key: undefined };
  };
  const want = desired ? netLines(desired.lines.map(resolve)) : [];
  if (sumCents(want) !== 0) throw new LedgerError(`${source} ${sourceId} doesn't balance (out by ${sumCents(want)} cents)`);
  const posted = await t.journalLine.groupBy({ by: ["accountId", "storeId", "partyId"], where: { companyId, journal: { source, sourceId, status: "POSTED" } }, _sum: { amountCents: true } });
  const diff = diffLines(want, posted.map((p) => ({ accountId: p.accountId, storeId: p.storeId, partyId: p.partyId, cents: p._sum.amountCents ?? 0 })));
  if (!diff.length) return null;
  const [first, last] = posted.length
    ? await Promise.all([
        t.journal.findFirst({ where: { companyId, source, sourceId }, orderBy: { number: "asc" }, select: { memo: true } }),
        t.journal.findFirst({ where: { companyId, source, sourceId }, orderBy: { number: "desc" }, select: { date: true } }),
      ])
    : [null, null];
  const wanted = desired?.date ?? (last ? last.date.toISOString().slice(0, 10) : dayKey(new Date()));
  const { day, late } = postingDay(wanted, book.lockedThrough);
  const memo = !first ? (desired?.memo ?? source) : `${desired?.memo ?? first.memo} — ${desired ? "updated" : "reversed"}`;
  return writeJournal(t, {
    companyId, date: day, late, memo, source, sourceId, storeId: desired?.storeId ?? null,
    lines: diff.map((l) => ({ accountId: l.accountId!, cents: l.cents, storeId: l.storeId, partyId: l.partyId, memo: l.memo })),
  });
}

/** Posts one source now, inside `t`: every company it touches (or touched before) synced to what its rules say. */
export async function postSourceTx(t: Tx, source: string, sourceId: string) {
  // Loaded when first needed: the rules import services that import this file (no cycle at start-up).
  const { SOURCES } = await import("./sources");
  const handler = SOURCES[source];
  if (!handler) throw new LedgerError(`Unknown ledger source "${source}"`);
  await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ledger:${source}:${sourceId}`}))`;
  const postings = await handler(sourceId, t);
  const companies = new Set(postings.map((p) => p.companyId));
  for (const j of await t.journal.findMany({ where: { source, sourceId }, distinct: ["companyId"], select: { companyId: true } })) companies.add(j.companyId);
  const out = [];
  for (const companyId of companies) {
    const mine = postings.filter((p) => p.companyId === companyId);
    if (mine.length > 1) throw new LedgerError(`${source} ${sourceId} gives two postings for one company`);
    const j = await syncPosting(t, source, sourceId, companyId, mine[0] ?? null);
    if (j) out.push(j);
  }
  return out;
}

export const postSource = (source: string, sourceId: string) => tx((t) => postSourceTx(t, source, sourceId));

/**
 * Queues a source to be posted — inside the business transaction, so the change and its posting can't drift apart.
 * Re-queuing an already-queued source just refreshes it (and holds it until this transaction commits, so the posting
 * can never run on data from before the change).
 */
export async function queuePosting(t: Tx | typeof db, source: string, sourceId: string) {
  await t.$executeRaw`
    INSERT INTO "LedgerQueue" ("source", "sourceId") VALUES (${source}, ${sourceId})
    ON CONFLICT ("source", "sourceId") DO UPDATE SET "queuedAt" = now(), "attempts" = 0, "error" = NULL`;
}

/**
 * A change to a store's trading on `day` (a till sale that synced late, a refund, a stock write-off): a past day's
 * store-day is re-posted (today's posts in the nightly run), and when the month is over its franchise statement too
 * (fees are on net sales).
 */
export async function queueStoreDay(t: Tx | typeof db, storeId: string, day: string, now = new Date()) {
  const today = dayKey(now);
  if (day < today) {
    await queuePosting(t, "store-day", `${storeId}:${day}`);
    await queuePosting(t, "points", day); // HQ's points for the day (stores HQ owns have no statement)
  }
  if (periodOf(day) < periodOf(today)) await queuePosting(t, "statement", `${storeId}:${periodOf(day)}`);
}

const MAX_ATTEMPTS = 8;

/** Posts queued sources, oldest first, each in its own transaction; a failure stays queued with its reason. */
export async function processLedgerQueue(opts: { limit?: number; deadline?: number } = {}) {
  const limit = opts.limit ?? 5000;
  const deadline = opts.deadline ?? Date.now() + 10 * 60_000;
  let posted = 0, failed = 0, journals = 0;
  const failedNow: { source: string; sourceId: string }[] = []; // tried again on the next run, not in a loop now
  while (posted + failed < limit && Date.now() < deadline) {
    const batch = await db.ledgerQueue.findMany({
      where: { attempts: { lt: MAX_ATTEMPTS }, NOT: failedNow },
      orderBy: { queuedAt: "asc" }, take: Math.min(200, limit - posted - failed), select: { source: true, sourceId: true },
    });
    if (!batch.length) break;
    let progress = false;
    for (const q of batch) {
      if (Date.now() >= deadline) break;
      try {
        const n = await tx(async (t) => {
          const [held] = await t.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok FROM "LedgerQueue" WHERE "source" = ${q.source} AND "sourceId" = ${q.sourceId} FOR UPDATE SKIP LOCKED`;
          if (!held) return -1; // being re-queued by a transaction still running, or posted meanwhile
          const js = await postSourceTx(t, q.source, q.sourceId);
          await t.ledgerQueue.delete({ where: { source_sourceId: q } });
          return js.length;
        });
        if (n >= 0) (posted++, (journals += n), (progress = true));
      } catch (e) {
        failed++;
        progress = true;
        failedNow.push(q);
        const why = String((e as Error)?.message ?? e).slice(0, 500);
        await reportError(e, { method: "QUEUE", path: `ledger ${q.source} ${q.sourceId}`, route: `ledger:${q.source}`, kind: "posting" }); // logged, and emailed to ops (throttled)
        await db.ledgerQueue.updateMany({ where: q, data: { attempts: { increment: 1 }, error: why } }).catch(() => {});
      }
    }
    if (!progress) break;
  }
  const stuck = await db.ledgerQueue.count({ where: { attempts: { gte: MAX_ATTEMPTS } } });
  return { posted, failed, journals, stuck };
}

// ── Manual journals, reversals and month locks ─────────────────────────────────

/** Sources people post by hand; everything else is automatic and corrected through its source, never reversed. */
export const MANUAL_SOURCES = ["manual", "opening"] as const;

export async function createManualJournal(a: {
  companyId: string; date: string; memo: string; source?: "manual" | "opening"; post: boolean; actor: Actor & { id: string };
  lines: JournalLineInput[];
}) {
  const memo = a.memo.trim().replace(/\s+/g, " ");
  if (memo.length < 3) throw new LedgerError("Say what the journal is for");
  return tx(async (t) => {
    const book = await booksFor(t, a.companyId);
    if (book.lockedThrough && periodOf(a.date) <= book.lockedThrough) throw new LedgerError(`${periodOf(a.date)} is closed. Date the journal in an open month, or reopen it first`);
    const ids = [...new Set(a.lines.map((l) => l.accountId))];
    const accounts = await t.ledgerAccount.findMany({ where: { id: { in: ids }, companyId: a.companyId, active: true }, select: { id: true, party: true } });
    if (accounts.length !== ids.length) throw new LedgerError("One of the accounts isn't in these books (or is inactive)");
    const party = new Map(accounts.map((x) => [x.id, x.party]));
    if (a.lines.some((l) => party.get(l.accountId) && !l.partyId)) throw new LedgerError("Lines on a debtors, creditors or franchisee account need the customer, supplier or company");
    if (a.lines.some((l) => l.storeId) && (await t.store.count({ where: { id: { in: a.lines.flatMap((l) => (l.storeId ? [l.storeId] : [])) }, companyId: { not: a.companyId } } })))
      throw new LedgerError("A store on the journal isn't one of this company's");
    const j = await writeJournal(t, {
      companyId: a.companyId, date: a.date, memo, source: a.source ?? "manual", status: a.post ? "POSTED" : "DRAFT", createdById: a.actor.id, approvedById: a.post ? a.actor.id : null, lines: a.lines,
    });
    await audit(t, a.actor, a.post ? "ledger.journal_post" : "ledger.journal_draft", { entity: "Journal", entityId: j.id, data: { companyId: a.companyId, number: j.number, date: a.date, source: j.source, cents: a.lines.filter((l) => l.cents > 0).reduce((s, l) => s + l.cents, 0) } });
    return j;
  });
}

/** A draft manual journal approved and posted (its balances added now). */
export async function approveJournal(id: string, companyId: string, actor: Actor & { id: string }) {
  return tx(async (t) => {
    const j = await t.journal.findFirst({ where: { id, companyId }, include: { lines: true } });
    if (!j) throw new LedgerError("Journal not found");
    if (j.status !== "DRAFT") throw new LedgerError(`Journal ${j.number} is already posted`);
    const lockedThrough = (await t.company.findUniqueOrThrow({ where: { id: companyId }, select: { booksLockedThrough: true } })).booksLockedThrough;
    if (lockedThrough && j.period <= lockedThrough) throw new LedgerError(`${j.period} is closed. Change the date or reopen the month`);
    const claimed = await t.journal.updateMany({ where: { id, status: "DRAFT" }, data: { status: "POSTED", approvedById: actor.id } });
    if (claimed.count !== 1) throw new LedgerError("This journal changed while you were working on it. Refresh and try again");
    await addBalances(t, companyId, j.period, j.lines.map((l) => ({ accountId: l.accountId, cents: l.amountCents, storeId: l.storeId })));
    await audit(t, actor, "ledger.journal_approve", { entity: "Journal", entityId: id, data: { companyId, number: j.number } });
    return j;
  });
}

export async function deleteDraft(id: string, companyId: string, actor: Actor & { id: string }) {
  const j = await db.journal.findFirst({ where: { id, companyId, status: "DRAFT" } });
  if (!j) throw new LedgerError("Only a draft journal can be deleted");
  // Only while it's still a draft: an approval that lands first wins.
  const { count } = await db.journal.deleteMany({ where: { id, companyId, status: "DRAFT" } });
  if (count !== 1) throw new LedgerError(`Journal ${j.number} was approved just now, so it can't be deleted. Reverse it instead`);
  await audit(db, actor, "ledger.journal_delete", { entity: "Journal", entityId: id, data: { companyId, number: j.number } });
}

/** Reverses a posted manual or opening journal (automatic ones correct themselves through their source). */
export async function reverseJournal(id: string, companyId: string, actor: Actor & { id: string }, date?: string) {
  return tx(async (t) => {
    const j = await t.journal.findFirst({ where: { id, companyId }, include: { lines: true } });
    if (!j) throw new LedgerError("Journal not found");
    if (j.status !== "POSTED") throw new LedgerError("Only a posted journal can be reversed");
    if (!(MANUAL_SOURCES as readonly string[]).includes(j.source)) throw new LedgerError("Automatic journals follow their source. Correct the sale, invoice or deposit instead");
    if (j.reversalOfId || (await t.journal.count({ where: { reversalOfId: id } }))) throw new LedgerError(`Journal ${j.number} is already reversed (or is itself a reversal)`);
    const book = await booksFor(t, companyId);
    const { day, late } = postingDay(date ?? dayKey(new Date()), book.lockedThrough);
    const r = await writeJournal(t, {
      companyId, date: day, late, memo: `Reversal of journal ${j.number}: ${j.memo}`, source: j.source, sourceId: j.sourceId, storeId: j.storeId, reversalOfId: id,
      createdById: actor.id, approvedById: actor.id, lines: j.lines.map((l) => ({ accountId: l.accountId, cents: -l.amountCents, storeId: l.storeId, partyId: l.partyId, memo: l.memo })),
    });
    await audit(t, actor, "ledger.journal_reverse", { entity: "Journal", entityId: id, data: { companyId, number: j.number, reversal: r.number } });
    return r;
  });
}

/** Closes the books through a month that's over (or, moving back, reopens months). Nothing posts into a closed month. */
export async function setBooksLock(companyId: string, through: string | null, actor: Actor & { id: string }, now = new Date()) {
  if (through && !/^\d{4}-\d{2}$/.test(through)) throw new LedgerError("Choose a month");
  if (through && through >= periodOf(dayKey(now))) throw new LedgerError("Only a month that's over can be closed");
  const before = (await db.company.findUniqueOrThrow({ where: { id: companyId }, select: { booksLockedThrough: true } })).booksLockedThrough;
  if (through && !before) {
    // The first close: closeMonth (admin.ts) has already given the queue its minute; this only picks up a straggler,
    // bounded the same way so a server action never runs into Cloudflare's 100-second cut-off.
    await processLedgerQueue({ limit: 20_000, deadline: Date.now() + 30_000 });
  }
  await db.company.update({ where: { id: companyId }, data: { booksLockedThrough: through } });
  await audit(db, actor, through && (!before || through > before) ? "ledger.close" : "ledger.reopen", { entity: "Company", entityId: companyId, data: { from: before, to: through } });
}

/** Nightly: every rule set's sources for the day just ended (and month ends), queued, then posted. */
export async function ledgerNightly(now = new Date()) {
  const { NIGHTLY } = await import("./sources");
  return queueAndPost(NIGHTLY.map((nightly) => nightly(now)), 20);
}

/** Every source with activity between two SAST days, queued, then posted: history (the demo seed) or a period re-posted. */
export async function ledgerBackfill(from: string, to: string) {
  const { BACKFILL } = await import("./sources");
  return queueAndPost(BACKFILL.map((list) => list(from, to)), 60);
}

async function queueAndPost(lists: Promise<{ source: string; sourceId: string }[]>[], minutes: number) {
  let queued = 0;
  for (const list of lists) {
    for (const s of await list) {
      await queuePosting(db, s.source, s.sourceId);
      queued++;
    }
  }
  return { queued, ...(await processLedgerQueue({ limit: 1_000_000, deadline: Date.now() + minutes * 60_000 })) };
}

export { SYSTEM };
