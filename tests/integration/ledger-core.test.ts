import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, tx } from "@/server/db";
import {
  approveJournal, booksFor, createManualJournal, deleteDraft, LedgerError, processLedgerQueue, queuePosting, reverseJournal, setBooksLock, syncPosting, writeJournal,
} from "@/server/ledger/core";
import { booksRole } from "@/server/ledger/access";
import { chartFor } from "@/lib/ledger";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
const actor = () => ({ type: "USER" as const, id: w.manager.id, name: "Mia" });
const balance = async (companyId: string, key: string, period?: string) => {
  const acc = await db.ledgerAccount.findFirstOrThrow({ where: { companyId, key } });
  const rows = await db.ledgerBalance.findMany({ where: { companyId, accountId: acc.id, ...(period && { period }) } });
  return rows.reduce((s, r) => s + Number(r.debitCents) - Number(r.creditCents), 0);
};

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(async () => {
  await db.$disconnect();
});

describe("Books", () => {
  it("start from the template, each side of the network with its own accounts, once", async () => {
    const fr = await tx((t) => booksFor(t, w.owner.id));
    const hq = await tx((t) => booksFor(t, w.hq.id));
    expect(fr.kind).toBe("FRANCHISEE");
    expect(fr.accounts.has("hq")).toBe(true);
    expect(fr.accounts.has("franchisees")).toBe(false);
    expect(hq.accounts.has("franchisees")).toBe(true);
    expect(await db.ledgerAccount.count({ where: { companyId: w.owner.id } })).toBe(chartFor("FRANCHISEE").length);
    await tx((t) => booksFor(t, w.owner.id));
    expect(await db.ledgerAccount.count({ where: { companyId: w.owner.id } })).toBe(chartFor("FRANCHISEE").length);
  });
});

describe("Automatic postings", () => {
  const day = "2026-09-14";
  const post = (cash: number) => ({ companyId: w.owner.id, date: day, memo: "Trading day", storeId: w.store.id, lines: [{ key: "cash", cents: cash, storeId: w.store.id }, { key: "sales.pos", cents: -cash, storeId: w.store.id }] });

  it("post only what changed: first the day, then a late sale, then nothing again", async () => {
    const first = await tx((t) => syncPosting(t, "test-day", "d1", w.owner.id, post(10_000)));
    expect(first).toMatchObject({ source: "test-day", sourceId: "d1", period: "2026-09", status: "POSTED", late: false, memo: "Trading day" });
    expect(await tx((t) => syncPosting(t, "test-day", "d1", w.owner.id, post(10_000)))).toBeNull();
    const second = await tx((t) => syncPosting(t, "test-day", "d1", w.owner.id, post(12_500)));
    expect(second?.memo).toBe("Trading day — updated");
    expect((await db.journalLine.findMany({ where: { journalId: second!.id } })).map((l) => l.amountCents).sort((a, b) => a - b)).toEqual([-2_500, 2_500]);
    expect(await balance(w.owner.id, "cash")).toBe(12_500);
    expect(await balance(w.owner.id, "sales.pos")).toBe(-12_500);
  });

  it("goes into the first open month once its own is closed, and reverses a source that's gone", async () => {
    await setBooksLock(w.owner.id, "2026-09", actor(), new Date("2026-10-05T10:00:00+02:00"));
    const late = await tx((t) => syncPosting(t, "test-day", "d1", w.owner.id, post(13_000)));
    expect(late).toMatchObject({ period: "2026-10", late: true });
    expect(late!.date.toISOString().slice(0, 10)).toBe("2026-10-01");
    const gone = await tx((t) => syncPosting(t, "test-day", "d1", w.owner.id, null));
    expect(gone?.memo).toBe("Trading day — reversed");
    expect(await balance(w.owner.id, "cash")).toBe(0);
    expect(await balance(w.owner.id, "cash", "2026-09")).toBe(12_500); // the closed month is untouched
    await setBooksLock(w.owner.id, null, actor(), new Date("2026-10-05T10:00:00+02:00"));
    expect(await db.auditLog.count({ where: { action: { in: ["ledger.close", "ledger.reopen"] }, entityId: w.owner.id } })).toBe(2);
  });

  it("refuses what doesn't balance, unknown accounts and closing a month that isn't over", async () => {
    await expect(tx((t) => syncPosting(t, "test-day", "d2", w.owner.id, { ...post(100), lines: [{ key: "cash", cents: 100 }, { key: "sales.pos", cents: -99 }] }))).rejects.toThrow("doesn't balance");
    await expect(tx((t) => syncPosting(t, "test-day", "d2", w.owner.id, { ...post(100), lines: [{ key: "nope", cents: 100 }, { key: "sales.pos", cents: -100 }] }))).rejects.toThrow('no account "nope"');
    const cash = (await tx((t) => booksFor(t, w.owner.id))).accounts.get("cash")!;
    await expect(tx((t) => writeJournal(t, { companyId: w.owner.id, date: day, memo: "x", source: "manual", lines: [{ accountId: cash, cents: 1 }, { accountId: cash, cents: 0 }] }))).rejects.toThrow("at least two lines");
    await expect(setBooksLock(w.owner.id, "2026-10", actor(), new Date("2026-10-05T10:00:00+02:00"))).rejects.toThrow("month that's over");
  });
});

describe("Manual journals", () => {
  it("wait as drafts until approved, post balances only then, and reverse cleanly", async () => {
    const b = await tx((t) => booksFor(t, w.owner.id));
    const rent = b.accounts.get("exp.RENT")!;
    const bank = b.accounts.get("bank")!;
    const lines = [{ accountId: rent, cents: 1_500_000, storeId: w.store.id }, { accountId: bank, cents: -1_500_000 }];
    const draft = await createManualJournal({ companyId: w.owner.id, date: "2026-10-01", memo: "October rent", post: false, actor: actor(), lines });
    expect(draft.status).toBe("DRAFT");
    expect(await balance(w.owner.id, "exp.RENT")).toBe(0);
    await approveJournal(draft.id, w.owner.id, actor());
    expect(await balance(w.owner.id, "exp.RENT")).toBe(1_500_000);
    await expect(approveJournal(draft.id, w.owner.id, actor())).rejects.toThrow("already posted");
    const r = await reverseJournal(draft.id, w.owner.id, actor(), "2026-10-02");
    expect(r.memo).toBe(`Reversal of journal ${draft.number}: October rent`);
    expect(await balance(w.owner.id, "exp.RENT")).toBe(0);
    await expect(reverseJournal(draft.id, w.owner.id, actor())).rejects.toThrow("already reversed");
    const other = await createManualJournal({ companyId: w.owner.id, date: "2026-10-01", memo: "Typo", post: false, actor: actor(), lines });
    await deleteDraft(other.id, w.owner.id, actor());
    expect(await db.journal.count({ where: { id: other.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: { startsWith: "ledger.journal_" } } })).toBe(5);
  });

  it("refuse closed months, other companies' accounts and control accounts without a party", async () => {
    const b = await tx((t) => booksFor(t, w.owner.id));
    const hq = await tx((t) => booksFor(t, w.hq.id));
    const base = { companyId: w.owner.id, date: "2026-10-03", memo: "Test journal", post: true, actor: actor() };
    await expect(createManualJournal({ ...base, lines: [{ accountId: hq.accounts.get("bank")!, cents: 100 }, { accountId: b.accounts.get("bank")!, cents: -100 }] })).rejects.toThrow("isn't in these books");
    await expect(createManualJournal({ ...base, lines: [{ accountId: b.accounts.get("creditors")!, cents: 100 }, { accountId: b.accounts.get("bank")!, cents: -100 }] })).rejects.toThrow("need the customer, supplier or company");
    await setBooksLock(w.owner.id, "2026-09", actor(), new Date("2026-10-05T10:00:00+02:00"));
    await expect(createManualJournal({ ...base, date: "2026-09-30", lines: [{ accountId: b.accounts.get("exp.OTHER")!, cents: 100 }, { accountId: b.accounts.get("bank")!, cents: -100 }] })).rejects.toThrow("2026-09 is closed");
    await expect(reverseJournal((await db.journal.findFirstOrThrow({ where: { source: "test-day" } })).id, w.owner.id, actor())).rejects.toThrow("Automatic journals follow their source");
    await setBooksLock(w.owner.id, null, actor(), new Date("2026-10-05T10:00:00+02:00"));
    expect(LedgerError).toBeTruthy();
  });
});

describe("Queue and access", () => {
  it("keeps a source that fails queued, with its reason", async () => {
    await queuePosting(db, "no-such-source", "x1");
    const r = await processLedgerQueue({ limit: 10 });
    expect(r).toMatchObject({ posted: 0, failed: 1 });
    expect(await db.ledgerQueue.findUniqueOrThrow({ where: { source_sourceId: { source: "no-such-source", sourceId: "x1" } } })).toMatchObject({ attempts: 1, error: 'Unknown ledger source "no-such-source"' });
    await queuePosting(db, "no-such-source", "x1"); // re-queued: tried afresh
    expect((await db.ledgerQueue.findUniqueOrThrow({ where: { source_sourceId: { source: "no-such-source", sourceId: "x1" } } })).attempts).toBe(0);
    await db.ledgerQueue.deleteMany();
  });

  it("gives owners, accountants, HQ and area managers the right books", async () => {
    const fr = { id: w.owner.id, kind: "FRANCHISEE" };
    const hq = { id: w.hq.id, kind: "FRANCHISOR" };
    const u = (role: string, companyId: string | null = null, regionId: string | null = null) => ({ role, companyId, regionId }) as Parameters<typeof booksRole>[0];
    expect(await booksRole(u("OWNER", w.owner.id), fr)).toEqual({ read: true, write: true, approve: true });
    expect(await booksRole(u("OWNER", w.owner.id), hq)).toEqual({ read: false, write: false, approve: false });
    expect(await booksRole(u("ACCOUNTANT", w.owner.id), fr)).toEqual({ read: true, write: true, approve: false });
    expect(await booksRole(u("HQ_ADMIN", w.hq.id), fr)).toEqual({ read: true, write: false, approve: false });
    expect(await booksRole(u("HQ_ADMIN", w.hq.id), hq)).toEqual({ read: true, write: true, approve: true });
    expect(await booksRole(u("AREA_MANAGER", null, w.region.id), fr)).toEqual({ read: true, write: false, approve: false });
    expect(await booksRole(u("AREA_MANAGER", null, "elsewhere"), fr)).toEqual({ read: false, write: false, approve: false });
    expect(await booksRole(u("MANAGER", w.owner.id), fr)).toEqual({ read: false, write: false, approve: false });
    expect(await booksRole(u("HQ_STAFF", w.hq.id), hq)).toEqual({ read: false, write: false, approve: false });
  });
});
