// Banking in the books: bank accounts (the first carries the books' Bank account), statement imports that match what's
// already posted and add nothing the second time, allocations (bank charges with VAT, card payouts net of fees,
// transfers between the company's own accounts), undoing each, the reconciliation, and who may change any of it.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "hh-ledger-bank-"));

import { db, tx } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { COOKIE } from "@/server/auth";
import { booksFor, createManualJournal, setBooksLock, syncPosting } from "@/server/ledger/core";
import {
  allocateLine, autoMatch, bankAccountsOf, bankLinePage, bankToDo, BankError, createBankAccount, ignoreLine, importStatement, matchLine, reconciliation,
  setBankAccountActive, unallocateLine, unignoreLine, unmatchLine, updateBankAccount,
} from "@/server/ledger/bank";
import { allocate as allocateAction } from "@/app/books/[companyId]/bank/[bankAccountId]/actions";
import { addBankAccount } from "@/app/books/[companyId]/bank/actions";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let owner: { id: string; name: string }, accountant: { id: string }, hqAdmin: { id: string }, area: { id: string };
let fnb: { id: string; accountId: string }, capitec: { id: string; accountId: string };
let n = 0;
const signIn = async (u: { id: string }) => {
  const token = `ledger-bank-${u.id}-${++n}`;
  await db.session.create({ data: { id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  jar.set(COOKIE.staff, token);
};
const csv = (name: string, text: string) => new File([text], name, { type: "text/csv" });
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const key = async (k: string) => (await tx((t) => booksFor(t, w.owner.id))).accounts.get(k)!;
/** An account's balance in the books (debit positive), from the running totals. */
const balance = async (accountId: string) => {
  const r = await db.ledgerBalance.aggregate({ where: { companyId: w.owner.id, accountId }, _sum: { debitCents: true, creditCents: true } });
  return Number(r._sum.debitCents ?? 0n) - Number(r._sum.creditCents ?? 0n);
};
const lineOf = (bankAccountId: string, description: string) => db.bankLine.findFirstOrThrow({ where: { bankAccountId, description: { contains: description } } });
/** Posts a source the way the store-side rules will. */
const post = (source: string, sourceId: string, date: string, memo: string, lines: { key: string; cents: number }[]) =>
  tx((t) => syncPosting(t, source, sourceId, w.owner.id, { companyId: w.owner.id, date, memo, storeId: w.store.id, lines: lines.map((l) => ({ ...l, storeId: w.store.id })) }));

// FNB's transaction download for the first days of October: a cash deposit, the monthly fee, a card payout (net of the
// acquirer's fee) and two PayShap payments the till took on the 3rd.
const OCTOBER = [
  "2,'62012345678','Gold Business Account','TEST RETAIL'",
  "5,'Number','Date','Description1','Description2','Description3','Amount','Balance','Accrued Charges'",
  "5,1,'01 Oct 2026','Magtape Credit','TST01-261001','Cash Deposit',5000.00,15000.00,0.00",
  "5,2,'02 Oct 2026','#Monthly Account Fee','','',-150.00,14850.00,0.00",
  "5,3,'03 Oct 2026','Merchant Settlement','YOCO 0012345','',1121.50,15971.50,0.00",
  "5,4,'04 Oct 2026','PayShap Credit','TST01 SALE 41','',300.00,16271.50,0.00",
  "5,5,'04 Oct 2026','PayShap Credit','TST01 SALE 42','',200.00,16471.50,0.00",
].join("\r\n");

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  owner = await db.user.create({ data: { name: "Olga Owner", role: "OWNER", companyId: w.owner.id, email: "olga@bank.example" } });
  accountant = await db.user.create({ data: { name: "Anil Accountant", role: "ACCOUNTANT", companyId: w.owner.id, email: "anil@bank.example" } });
  hqAdmin = await db.user.create({ data: { name: "Hanna Admin", role: "HQ_ADMIN", companyId: w.hq.id, email: "hanna@bank.example" } });
  area = await db.user.create({ data: { name: "Ari Area", role: "AREA_MANAGER", regionId: w.region.id, email: "ari@bank.example" } });
  await signIn(owner);
  // The books before the first statement: R10,000 in the bank at go-live.
  const capital = await key("capital");
  await createManualJournal({
    companyId: w.owner.id, date: "2026-09-30", memo: "Opening balances", source: "opening", post: true, actor: { type: "USER", id: owner.id, name: owner.name },
    lines: [{ accountId: await key("bank"), cents: 1_000_000 }, { accountId: capital, cents: -1_000_000 }],
  });
  // What the store side posts: the deposit banked on the 1st, the 3rd's trading (PayShap R500 to the bank, R1,150 on card).
  await post("deposit", "dep-1", "2026-10-01", "Deposit DEP-000001 · Test Store", [{ key: "bank", cents: 500_000 }, { key: "cash", cents: -500_000 }]);
  await post("store-day", `${w.store.id}:2026-10-03`, "2026-10-03", "Trading 3 Oct · Test Store", [
    { key: "bank", cents: 50_000 }, { key: "card", cents: 115_000 }, { key: "sales.pos", cents: -143_478 }, { key: "vat.output", cents: -21_522 },
  ]);
});
afterAll(async () => {
  await db.$disconnect();
});

describe("Bank accounts", () => {
  it("the first carries the books' Bank account; the next gets one of its own, from 1001", async () => {
    fnb = await createBankAccount(w.owner.id, { bank: "FNB", name: "FNB Business Cheque", number: "6201 2345 678", storeId: w.store.id });
    expect(fnb).toMatchObject({ accountId: await key("bank"), number: "5678", storeId: w.store.id, bank: "FNB" });
    capitec = await createBankAccount(w.owner.id, { bank: "CAPITEC", name: "Capitec Savings", number: "1501234567" });
    expect(await db.ledgerAccount.findUniqueOrThrow({ where: { id: capitec.accountId } })).toMatchObject({ companyId: w.owner.id, code: "1001", name: "Capitec Savings", type: "ASSET", key: null });
    await expect(createBankAccount(w.owner.id, { bank: "FNB", name: "Elsewhere", number: "1234", storeId: w.dc.id })).rejects.toThrow("Choose one of this company's stores");
    await expect(createBankAccount(w.owner.id, { bank: "MONZO", name: "Nope", number: "1234" })).rejects.toThrow("Choose the bank");
    await expect(createBankAccount(w.owner.id, { bank: "FNB", name: "Short", number: "12" })).rejects.toThrow("last four digits");
  });

  it("renames (its own ledger account follows; the books' Bank keeps its name), closes and reopens, audited", async () => {
    await updateBankAccount(w.owner.id, capitec.id, { name: "Capitec Business Savings", number: "1501234567" });
    expect((await db.ledgerAccount.findUniqueOrThrow({ where: { id: capitec.accountId } })).name).toBe("Capitec Business Savings");
    await updateBankAccount(w.owner.id, fnb.id, { name: "FNB Cheque", number: "5678", storeId: w.store.id });
    expect((await db.ledgerAccount.findUniqueOrThrow({ where: { id: fnb.accountId } })).name).toBe("Bank");
    await setBankAccountActive(w.owner.id, capitec.id, false);
    await expect(importStatement(w.owner.id, capitec.id, { file: csv("x.csv", "Date,Description,Amount\n2026-10-01,x,1"), format: "AUTO" })).rejects.toThrow("is closed");
    await setBankAccountActive(w.owner.id, capitec.id, true);
    expect(await db.auditLog.count({ where: { action: { startsWith: "bank.account." } } })).toBe(6);
  });
});

describe("Importing a statement", () => {
  it("adds the lines, keeps the file, and matches the deposit by itself", async () => {
    const r = await importStatement(w.owner.id, fnb.id, { file: csv("fnb-oct.csv", OCTOBER), format: "AUTO" });
    expect(r).toMatchObject({ format: "FNB", lines: 5, added: 5, duplicates: 0, failed: [], matched: 1, from: "2026-10-01", to: "2026-10-04" });
    const deposit = await lineOf(fnb.id, "Magtape");
    const depositJournal = await db.journal.findFirstOrThrow({ where: { source: "deposit", sourceId: "dep-1" } });
    expect(deposit).toMatchObject({ status: "MATCHED", journalId: depositJournal.id, amountCents: 500_000, balanceCents: 1_500_000n, matchedById: owner.id });
    expect(await db.bankLine.count({ where: { bankAccountId: fnb.id, status: "UNMATCHED" } })).toBe(4);
    const upload = await db.upload.findUniqueOrThrow({ where: { id: deposit.uploadId! } });
    expect(upload).toMatchObject({ fileName: "fnb-oct.csv", contentType: "text/csv", storeId: w.store.id, uploadedById: owner.id });
    expect(await db.auditLog.findFirst({ where: { action: "bank.statement.add" } })).toMatchObject({ actorId: owner.id, data: { added: 5, duplicates: 0, format: "FNB" } });
  });

  it("adds nothing the second time (and keeps no second copy of the file)", async () => {
    const uploads = await db.upload.count();
    const r = await importStatement(w.owner.id, fnb.id, { file: csv("fnb-oct-again.csv", OCTOBER), format: "FNB" });
    expect(r).toMatchObject({ lines: 5, added: 0, duplicates: 5, matched: 0 });
    expect(await db.bankLine.count({ where: { bankAccountId: fnb.id } })).toBe(5);
    expect(await db.upload.count()).toBe(uploads);
  });

  it("refuses another account's statement and files it can't read", async () => {
    const other = OCTOBER.replace("62012345678", "62099999999");
    await expect(importStatement(w.owner.id, fnb.id, { file: csv("other.csv", other), format: "AUTO" })).rejects.toThrow("is for the account ending 9999, not FNB Cheque (ending 5678)");
    await expect(importStatement(w.owner.id, fnb.id, { file: csv("junk.csv", "hello,world\n1,2"), format: "AUTO" })).rejects.toThrow("We don't recognise this file");
    await expect(importStatement(w.owner.id, fnb.id, { file: new File([new Uint8Array([0x50, 0x4b, 3, 4])], "stmt.xlsx"), format: "AUTO" })).rejects.toThrow("spreadsheet workbook");
  });
});

describe("Settling lines", () => {
  it("allocates the bank charge with its VAT to bank charges", async () => {
    const fee = await lineOf(fnb.id, "Monthly Account Fee");
    const r = await allocateLine(w.owner.id, fee.id, { kind: "account", accountId: await key("exp.BANK_FEES"), vatCents: 1_957 });
    const j = await db.journal.findFirstOrThrow({ where: { source: "bank", sourceId: fee.id }, include: { lines: true } });
    expect(r.number).toBe(j.number);
    expect(j).toMatchObject({ date: new Date("2026-10-02T00:00:00Z"), memo: "Bank: #Monthly Account Fee" });
    const by = Object.fromEntries(j.lines.map((l) => [l.accountId, l.amountCents]));
    expect(by).toEqual({ [fnb.accountId]: -15_000, [await key("exp.BANK_FEES")]: 13_043, [await key("vat.input")]: 1_957 });
    expect(await db.bankLine.findUniqueOrThrow({ where: { id: fee.id } })).toMatchObject({ status: "ALLOCATED", journalId: j.id });
  });

  it("allocates the card payout: the net to the bank, the fee to card fees, the gross clears card payments", async () => {
    const payout = await lineOf(fnb.id, "Merchant Settlement");
    await allocateLine(w.owner.id, payout.id, { kind: "payout", feeCents: 2_850, feeVatCents: 372 });
    expect(await balance(await key("card"))).toBe(0);
    expect(await balance(await key("card.fees"))).toBe(2_478);
    expect(await balance(await key("vat.input"))).toBe(1_957 + 372);
    await expect(allocateLine(w.owner.id, payout.id, { kind: "payout", feeCents: 0 })).rejects.toThrow("already allocated");
  });

  it("matches several PayShap lines to the day's trading, never more than it holds", async () => {
    const day = await db.journal.findFirstOrThrow({ where: { source: "store-day" } });
    const [a, b] = [await lineOf(fnb.id, "SALE 41"), await lineOf(fnb.id, "SALE 42")];
    const page = await bankLinePage(w.owner.id, fnb, "todo", 1, 25);
    expect(page.rows.map((r) => r.description)).toEqual(["PayShap Credit TST01 SALE 41", "PayShap Credit TST01 SALE 42"]);
    // No posting of exactly R300: the day's trading it could be part of.
    expect(page.rows[0].suggestions).toMatchObject([{ number: day.number, part: true, leftCents: 50_000 }]);
    await matchLine(w.owner.id, a.id, { number: day.number });
    await expect(matchLine(w.owner.id, b.id, { number: 9999 })).rejects.toThrow("There's no posted journal 9999");
    const deposit = await db.journal.findFirstOrThrow({ where: { source: "deposit" } });
    await expect(matchLine(w.owner.id, b.id, { id: deposit.id })).rejects.toThrow("already matched in full");
    expect((await bankLinePage(w.owner.id, fnb, "todo", 1, 25)).rows[0].suggestions).toMatchObject([{ number: day.number, leftCents: 20_000, part: false }]);
    await matchLine(w.owner.id, b.id, { number: day.number });
    expect(await db.bankLine.count({ where: { bankAccountId: fnb.id, status: "UNMATCHED" } })).toBe(0);
  });

  it("unmatches and un-allocates: the line is open again and the allocation reversed; a closed month takes the reversal late", async () => {
    const deposit = await lineOf(fnb.id, "Magtape");
    await unmatchLine(w.owner.id, deposit.id);
    expect(await db.bankLine.findUniqueOrThrow({ where: { id: deposit.id } })).toMatchObject({ status: "UNMATCHED", journalId: null, matchedById: null });
    expect(await autoMatch(w.owner.id, fnb.id)).toBe(1);

    const fee = await lineOf(fnb.id, "Monthly Account Fee");
    const r = await unallocateLine(w.owner.id, fee.id);
    expect(r.reversal).toBeGreaterThan(0);
    expect(await balance(await key("exp.BANK_FEES"))).toBe(0);
    expect(await db.bankLine.findUniqueOrThrow({ where: { id: fee.id } })).toMatchObject({ status: "UNMATCHED", journalId: null });
    await expect(unallocateLine(w.owner.id, fee.id)).rejects.toThrow("isn't allocated");
    // Allocated again (without VAT this time): a new journal for the full amount.
    await allocateLine(w.owner.id, fee.id, { kind: "account", accountId: await key("exp.BANK_FEES"), memo: "FNB monthly fee" });
    expect(await balance(await key("exp.BANK_FEES"))).toBe(15_000);

    // October closed: taking the payout back lands in November, flagged late.
    await setBooksLock(w.owner.id, "2026-10", { type: "USER", id: owner.id, name: owner.name }, new Date("2026-11-05T10:00:00+02:00"));
    const payout = await lineOf(fnb.id, "Merchant Settlement");
    const back = await unallocateLine(w.owner.id, payout.id);
    expect(await db.journal.findFirstOrThrow({ where: { number: back.reversal! } })).toMatchObject({ period: "2026-11", late: true });
    await allocateLine(w.owner.id, payout.id, { kind: "payout", feeCents: 2_850, feeVatCents: 372 });
    await setBooksLock(w.owner.id, null, { type: "USER", id: owner.id, name: owner.name }, new Date("2026-11-05T10:00:00+02:00"));
    expect(await balance(await key("card"))).toBe(0);
  });

  it("ignores and restores a line; refuses accounts kept by their own records and this bank itself", async () => {
    const extra = await importStatement(w.owner.id, fnb.id, {
      file: csv("fnb-5th.csv", OCTOBER.split("\r\n").slice(0, 2).concat("5,6,'05 Oct 2026','Debit Order Return','','',-75.00,16396.50,0.00").join("\r\n")), format: "AUTO",
    });
    expect(extra).toMatchObject({ added: 1, matched: 0 });
    const line = await lineOf(fnb.id, "Debit Order Return");
    await expect(allocateLine(w.owner.id, line.id, { kind: "account", accountId: await key("hq") })).rejects.toThrow("recorded as statement payments");
    await expect(allocateLine(w.owner.id, line.id, { kind: "account", accountId: fnb.accountId })).rejects.toThrow("this bank account itself");
    await expect(allocateLine(w.owner.id, line.id, { kind: "payout", feeCents: 0 })).rejects.toThrow("A card payout is money in");
    await ignoreLine(w.owner.id, line.id, "Reversed the next day");
    expect((await db.bankLine.findUniqueOrThrow({ where: { id: line.id } })).status).toBe("IGNORED");
    expect(await db.auditLog.findFirst({ where: { action: "bank.line.ignore", entityId: line.id } })).toMatchObject({ data: { reason: "Reversed the next day" } });
    await unignoreLine(w.owner.id, line.id);
    // A supplier nobody captured: on creditors, with the supplier as the party.
    await allocateLine(w.owner.id, line.id, { kind: "account", accountId: await key("creditors"), party: "Acme  Packaging (Pty) Ltd" });
    const j = await db.journal.findFirstOrThrow({ where: { source: "bank", sourceId: line.id }, include: { lines: true } });
    expect(j.lines.find((l) => l.partyId)).toMatchObject({ accountId: await key("creditors"), partyId: "acme packaging (pty) ltd", amountCents: 7_500 });
    await expect(allocateLine(w.owner.id, line.id, { kind: "account", accountId: await key("creditors") })).rejects.toThrow("already allocated");
  });

  it("a transfer between the company's own accounts: allocated on one statement, it matches the other by itself", async () => {
    const out = await importStatement(w.owner.id, capitec.id, {
      file: csv("capitec.csv", "Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,1501234567,2026-10-05,2026-10-05,FNB,Transfer to FNB Cheque,Transfers,Transfers,,-1000.00,,4000.00"),
      format: "AUTO",
    });
    expect(out).toMatchObject({ format: "CAPITEC", added: 1, matched: 0 });
    await allocateLine(w.owner.id, (await lineOf(capitec.id, "Transfer to FNB")).id, { kind: "account", accountId: fnb.accountId });
    const into = await importStatement(w.owner.id, fnb.id, {
      file: csv("fnb-6th.csv", OCTOBER.split("\r\n").slice(0, 2).concat("5,7,'06 Oct 2026','Transfer From','Capitec 4567','',1000.00,17396.50,0.00").join("\r\n")), format: "AUTO",
    });
    expect(into).toMatchObject({ added: 1, matched: 1 });
    expect((await lineOf(fnb.id, "Transfer From")).status).toBe("MATCHED");
    await expect(unallocateLine(w.owner.id, (await lineOf(capitec.id, "Transfer to FNB")).id)).rejects.toThrow("matched on FNB Cheque's statement. Unmatch it there first");
  });

  it("matches by itself step by step: a line's only posting first, then what that leaves the next line", async () => {
    const topUp = (id: string, date: string) =>
      tx((t) => syncPosting(t, "test-savings", id, w.owner.id, { companyId: w.owner.id, date, memo: `Savings top-up ${id}`, lines: [{ accountId: capitec.accountId, cents: 70_000 }, { key: "capital", cents: -70_000 }] }));
    const [s1, s2] = [await topUp("s1", "2026-10-01"), await topUp("s2", "2026-10-09")];
    // The 1st's line can only be s1 (s2 is 8 days off); the 5th's could be either, until s1 is taken.
    const r = await importStatement(w.owner.id, capitec.id, {
      file: csv("savings.csv", "When;What;Value\n2026-10-01;Owner top-up A;700,00\n2026-10-05;Owner top-up B;700,00"), format: "CSV", map: { date: "When", description: "What", amount: "Value" },
    });
    expect(r).toMatchObject({ format: "CSV", added: 2, matched: 2 });
    expect((await lineOf(capitec.id, "Owner top-up A")).journalId).toBe(s1!.id);
    expect((await lineOf(capitec.id, "Owner top-up B")).journalId).toBe(s2!.id);
  });
});

describe("The reconciliation", () => {
  it("explains the books from the statement at a date, with nothing unexplained", async () => {
    // A deposit on the 6th that isn't on the statement yet, and a line still to do.
    await post("deposit", "dep-2", "2026-10-06", "Deposit DEP-000002 · Test Store", [{ key: "bank", cents: 250_000 }, { key: "cash", cents: -250_000 }]);
    await unmatchLine(w.owner.id, (await lineOf(fnb.id, "SALE 42")).id);
    const r = (await reconciliation(w.owner.id, fnb.id, "2026-10-06"))!;
    // Books: 10,000 opening + 5,000 + 500 PayShap − 150 + 1,121.50 − 75 + 1,000 + 2,500 = 19,896.50
    expect(r.ledgerCents).toBe(1_989_650);
    expect(r.statement).toEqual({ cents: 1_739_650, asOf: "2026-10-06", later: 0 });
    expect(r).toMatchObject({ start: "2026-10-01", openingCents: 1_000_000, broughtForwardCents: 1_000_000, openingDiffCents: 0, differenceCents: 250_000, unexplainedCents: 0 });
    expect(r.outstanding.items.map((o) => [o.memo, o.leftCents])).toEqual([
      ["Trading 3 Oct · Test Store", 20_000],
      ["Deposit DEP-000002 · Test Store", 250_000],
    ]);
    expect(r.notInBooks).toMatchObject({ count: 1, cents: 20_000, unmatched: { count: 1, cents: 20_000 } });
    expect(r.notInBooks.lines.map((l) => l.description)).toEqual(["PayShap Credit TST01 SALE 42"]);

    // At the 2nd: before the deposit of the 6th and the PayShap lines; the fee and the deposit settled.
    const early = (await reconciliation(w.owner.id, fnb.id, "2026-10-02"))!;
    expect(early).toMatchObject({ ledgerCents: 1_485_000, statement: { cents: 1_485_000, asOf: "2026-10-02" }, outstanding: { count: 0 }, notInBooks: { count: 0 }, unexplainedCents: 0 });

    // A line without a balance: the balance before it is carried on.
    await db.bankLine.updateMany({ where: { description: "Debit Order Return" }, data: { balanceCents: null } });
    const kept = (await reconciliation(w.owner.id, fnb.id, "2026-10-05"))!;
    expect(kept).toMatchObject({ statement: { cents: 1_639_650, asOf: "2026-10-04", later: 1 }, unexplainedCents: 0 });
    await matchLine(w.owner.id, (await lineOf(fnb.id, "SALE 42")).id, { number: (await db.journal.findFirstOrThrow({ where: { source: "store-day" } })).number });
    expect(await bankToDo(w.owner.id)).toEqual({ count: 0, cents: 0 });
  });

  it("the index shows each account's books balance, statement balance and what's to do", async () => {
    const rows = await bankAccountsOf(w.owner.id);
    expect(rows.map((r) => [r.name, r.ledgerCents, r.statement?.cents, r.todo])).toEqual([
      ["FNB Cheque", 1_989_650, 1_739_650, 0],
      ["Capitec Business Savings", 40_000, 470_000, 0],
    ]);
  });

  it("every company's books still balance", async () => {
    for (const companyId of [w.owner.id, w.hq.id]) {
      const r = await db.ledgerBalance.aggregate({ where: { companyId }, _sum: { debitCents: true, creditCents: true } });
      expect(Number(r._sum.debitCents ?? 0n) - Number(r._sum.creditCents ?? 0n)).toBe(0);
      const lines = await db.journalLine.aggregate({ where: { companyId, journal: { status: "POSTED" } }, _sum: { amountCents: true } });
      expect(lines._sum.amountCents ?? 0).toBe(0);
    }
  });
});

describe("A year's statement", () => {
  it("imports thousands of lines at once, and none of them twice", async () => {
    const big = await createBankAccount(w.owner.id, { bank: "OTHER", name: "Call deposit", number: "99887766" });
    const rows = Array.from({ length: 2_500 }, (_, i) => `${new Date(Date.UTC(2026, 0, 1) + (i % 270) * 86_400_000).toISOString().slice(0, 10)},Interest ${i % 7},${(i % 13) + 1}.25`);
    const file = () => csv("year.csv", ["Date,Description,Amount", ...rows].join("\n"));
    expect(await importStatement(w.owner.id, big.id, { file: file(), format: "AUTO" })).toMatchObject({ format: "CSV", lines: 2_500, added: 2_500, matched: 0 });
    expect(await importStatement(w.owner.id, big.id, { file: file(), format: "AUTO" })).toMatchObject({ added: 0, duplicates: 2_500 });
    expect(await db.bankLine.count({ where: { bankAccountId: big.id } })).toBe(2_500);
    await setBankAccountActive(w.owner.id, big.id, false);
  });
});

describe("Who may change it", () => {
  it("the accountant may; HQ and the area manager only look", async () => {
    await signIn(accountant);
    const a = await createBankAccount(w.owner.id, { bank: "NEDBANK", name: "Nedbank Call Account", number: "1987654321" });
    expect((await db.ledgerAccount.findUniqueOrThrow({ where: { id: a.accountId } })).code).toBe("1003");
    const before = await db.journal.count();
    const line = await lineOf(fnb.id, "Transfer From");
    for (const u of [hqAdmin, area]) {
      await signIn(u);
      await expect(createBankAccount(w.owner.id, { bank: "FNB", name: "Sneaky", number: "1234" })).rejects.toThrow(BankError);
      await expect(importStatement(w.owner.id, fnb.id, { file: csv("fnb.csv", OCTOBER), format: "AUTO" })).rejects.toThrow("You don't have permission to change these books.");
      await expect(unmatchLine(w.owner.id, line.id)).rejects.toThrow("You don't have permission");
      await expect(allocateLine(w.owner.id, line.id, { kind: "account", accountId: await key("other.income") })).rejects.toThrow("You don't have permission");
      expect(await allocateAction(w.owner.id, fnb.id, line.id, "", {}, form({ mode: "account", accountId: await key("other.income") }))).toMatchObject({ error: "You don't have permission to change these books." });
      expect(await addBankAccount(w.owner.id, {}, form({ bank: "FNB", name: "Sneaky", number: "1234" }))).toMatchObject({ error: "You don't have permission to change these books." });
    }
    expect(await db.journal.count()).toBe(before);
    expect((await db.bankLine.findUniqueOrThrow({ where: { id: line.id } })).status).toBe("MATCHED");
    expect(await db.bankAccount.count({ where: { name: "Sneaky" } })).toBe(0);
  });

  it("ids from another company's books are refused", async () => {
    await signIn(owner);
    const other = await db.company.create({ data: { kind: "FRANCHISEE", name: "Other Retail", legalName: "Other Retail (Pty) Ltd" } });
    const otherOwner = await db.user.create({ data: { name: "Rita Rival", role: "OWNER", companyId: other.id, email: "rita@bank.example" } });
    await signIn(otherOwner);
    const line = await lineOf(fnb.id, "Transfer From");
    await expect(unmatchLine(other.id, line.id)).rejects.toThrow("isn't in these books");
    await expect(importStatement(other.id, fnb.id, { file: csv("fnb.csv", OCTOBER), format: "AUTO" })).rejects.toThrow("Choose one of these books' bank accounts");
    await expect(updateBankAccount(other.id, fnb.id, { name: "Mine now", number: "5678" })).rejects.toThrow("isn't in these books");
    expect(await reconciliation(other.id, fnb.id, "2026-10-06")).toBeNull();
  });
});
