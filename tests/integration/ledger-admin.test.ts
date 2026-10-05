import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, tx } from "@/server/db";
import { syncPosting } from "@/server/ledger/core";
import { putStock } from "@/server/inventory";
import {
  addAccountant, approveDraft, closeMonth, createAccount, deleteDraftJournal, importOpeningBalances, renameAccount, reopenMonth, resetAccountantPassword, retryPosting,
  reverseManual, saveBooksSettings, saveJournal, setAccountActive, setAccountantActive, sourceLink,
} from "@/server/ledger/admin";
import { booksChecks, booksHealth, queueCounts, type BooksCheck } from "@/server/ledger/checks";
import { addMonths, monthStart, periodOf } from "@/lib/ledger";
import { dayKey } from "@/lib/format";
import { buildWorld, resetDb, type World } from "./world";
import type { User } from "@/generated/prisma/client";

let w: World;
let owner: User, hqAdmin: User, area: User, accountant: User;
const today = dayKey(new Date());
const P = periodOf(today);
// Midday on the 1st of next month: this month is over, so it can be closed and its month-end checks run.
const later = new Date(`${monthStart(addMonths(P, 1))}T12:00:00+02:00`);
const account = async (companyId: string, key: string) => (await db.ledgerAccount.findFirstOrThrow({ where: { companyId, key } })).id;
const pick = (checks: BooksCheck[], key: string) => checks.find((c) => c.key === key)!;
const pay = (debit: string, credit: string, cents: number, extra: { store?: string; party?: string } = {}) => [
  { account: debit, debitCents: cents, creditCents: 0, ...extra },
  { account: credit, debitCents: 0, creditCents: cents },
];

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  owner = await db.user.create({ data: { name: "Olivia Owner", email: "owner@test.co.za", role: "OWNER", companyId: w.owner.id } });
  hqAdmin = await db.user.create({ data: { name: "Hannah HQ", email: "hq@test.co.za", role: "HQ_ADMIN", companyId: w.hq.id } });
  area = await db.user.create({ data: { name: "Andile Area", role: "AREA_MANAGER", regionId: w.region.id } });
});
afterAll(async () => {
  await db.$disconnect();
});

describe("Chart of accounts", () => {
  it("adds accounts with free four-digit codes, renames system ones, and only switches off what's empty", async () => {
    const fr = w.owner.id;
    const added = await createAccount(owner, fr, { code: "6550", name: " Cleaning   services ", type: "EXPENSE" });
    expect(added).toMatchObject({ code: "6550", name: "Cleaning services", type: "EXPENSE", key: null, party: null, active: true });
    await expect(createAccount(owner, fr, { code: "6550", name: "Again", type: "EXPENSE" })).rejects.toThrow("already used");
    await expect(createAccount(owner, fr, { code: "6000", name: "Rent twice", type: "EXPENSE" })).rejects.toThrow("already used"); // the template's
    await expect(createAccount(owner, fr, { code: "65", name: "Short", type: "EXPENSE" })).rejects.toThrow("four-digit");
    await expect(createAccount(owner, fr, { code: "6551", name: "Odd", type: "PROFIT" })).rejects.toThrow("what kind of account");

    const rent = await account(fr, "exp.RENT");
    expect((await renameAccount(owner, fr, rent, { name: "Rent and parking" })).name).toBe("Rent and parking");
    await expect(renameAccount(owner, fr, rent, { type: "ASSET" })).rejects.toThrow("keeps its type");
    expect((await renameAccount(owner, fr, added.id, { type: "ASSET" })).type).toBe("ASSET");
    await renameAccount(owner, fr, added.id, { type: "EXPENSE" });

    const bank = await account(fr, "bank");
    await saveJournal(owner, fr, { date: today, memo: "Cleaners for the month", post: true, lines: pay(added.id, bank, 50_000, { store: w.store.id }) });
    await expect(renameAccount(owner, fr, added.id, { type: "ASSET" })).rejects.toThrow("has postings");
    await expect(setAccountActive(owner, fr, rent, false)).rejects.toThrow("system account");
    await expect(setAccountActive(owner, fr, added.id, false)).rejects.toThrow("still has a balance of R500.00");
    await saveJournal(owner, fr, { date: today, memo: "Cleaners refunded", post: true, lines: pay(bank, added.id, 50_000) });
    expect((await setAccountActive(owner, fr, added.id, false)).active).toBe(false);
    await expect(saveJournal(owner, fr, { date: today, memo: "Cleaners again", post: true, lines: pay(added.id, bank, 100) })).rejects.toThrow("switched off");
    await setAccountActive(owner, fr, added.id, true);
    expect(await db.auditLog.count({ where: { action: { startsWith: "ledger.account_" } } })).toBe(6); // create, 3 renames, off, on
  });
});

describe("Accountants", () => {
  it("are added by the owner with a temporary password; they draft, the owner approves", async () => {
    const fr = w.owner.id;
    const added = await addAccountant(owner, fr, { name: "Priya Naidoo", email: " Priya@Books.co.za " });
    accountant = added.accountant;
    expect(accountant).toMatchObject({ role: "ACCOUNTANT", companyId: fr, storeId: null, email: "priya@books.co.za", mustChangePassword: true, active: true });
    expect(added.password).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    await expect(addAccountant(owner, fr, { name: "Priya Again", email: "priya@books.co.za" })).rejects.toThrow("already signs in");
    await expect(addAccountant(hqAdmin, fr, { name: "Not Theirs", email: "x@example.co.za" })).rejects.toThrow("Only the owner");

    const lines = pay("6000", "1000", 1_200_000, { store: "tst01" });
    await expect(saveJournal(accountant, fr, { date: today, memo: "Rent", post: true, lines })).rejects.toThrow("Only the owner posts journals");
    const draft = await saveJournal(accountant, fr, { date: today, memo: "Rent", post: false, lines });
    expect(draft).toMatchObject({ status: "DRAFT", source: "manual", createdById: accountant.id, approvedById: null });
    await expect(approveDraft(accountant, fr, draft.id)).rejects.toThrow("Only the owner");
    await approveDraft(owner, fr, draft.id);
    expect(await db.journal.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "POSTED", approvedById: owner.id });
    const line = await db.journalLine.findFirstOrThrow({ where: { journalId: draft.id, amountCents: { gt: 0 } } });
    expect(line.storeId).toBe(w.store.id); // the store by its code

    const typo = await saveJournal(accountant, fr, { date: today, memo: "Typo", post: false, lines });
    await deleteDraftJournal(accountant, fr, typo.id);
    await expect(reverseManual(accountant, fr, draft.id)).rejects.toThrow("Only the owner");
    const reversal = await reverseManual(owner, fr, draft.id, today);
    expect(reversal.reversalOfId).toBe(draft.id);

    const reset = await resetAccountantPassword(owner, fr, accountant.id);
    expect(reset.password).not.toBe(added.password);
    await setAccountantActive(owner, fr, accountant.id, false);
    await expect(resetAccountantPassword(owner, fr, accountant.id)).rejects.toThrow("deactivated");
    await setAccountantActive(owner, fr, accountant.id, true);
    expect(await db.auditLog.findMany({ where: { entityId: accountant.id }, orderBy: { at: "asc" }, select: { action: true } })).toEqual(
      ["user.create", "user.password_reset", "user.deactivate", "user.reactivate"].map((action) => ({ action })),
    );
    await expect(saveJournal(accountant, fr, { date: today, memo: "Unbalanced", post: false, lines: [lines[0], { ...lines[1], creditCents: 1 }] })).rejects.toThrow("doesn't balance");
  });
});

describe("Opening balances", () => {
  it("post a balanced trial balance with parties, once, and refuse what doesn't fit the company", async () => {
    const ta = await db.tradeAccount.create({ data: { number: "TA-000001", name: "Green Leaf Pharmacy", legalName: "Green Leaf (Pty) Ltd", email: "accounts@greenleaf.co.za", addressLine: "1 Main Rd", city: "Pretoria", province: "GP", postalCode: "0001" } });
    await db.tradeLedgerEntry.create({ data: { tradeAccountId: ta.id, kind: "INVOICE", cents: 10_000, reference: "INV-1" } });
    const csv = "Account,Name,Debit,Credit,Party\n1000,Bank,2500.00,,\n1200,Trade debtors,100.00,,ta-000001\n1160,Franchisees,50,,test retail (pty) ltd\n2000,Creditors,,150,ACME  Supplies\n3000,Capital,,2500.00,\n";
    const hq = await importOpeningBalances(hqAdmin, w.hq.id, { text: csv, date: today });
    expect(hq).toMatchObject({ rows: 5, skipped: 0, debitCents: 265_000, posted: true });
    expect(hq.journal).toMatchObject({ source: "opening", status: "POSTED" });
    const parties = await db.journalLine.findMany({ where: { journalId: hq.journal.id, partyId: { not: null } }, select: { partyId: true }, orderBy: { amountCents: "desc" } });
    expect(parties.map((p) => p.partyId)).toEqual([ta.id, w.owner.id, "acme supplies"]);
    await expect(importOpeningBalances(hqAdmin, w.hq.id, { text: csv, date: today })).rejects.toThrow("already in");
    await expect(importOpeningBalances(hqAdmin, w.hq.id, { text: "1200,1,,TA-999999\n3000,,1,\n", date: today, addToExisting: true })).rejects.toThrow("Row 1: there's no trade account TA-999999.");
    // A balance far over what one line holds: the core splits it into several lines on the account.
    const big = await importOpeningBalances(hqAdmin, w.hq.id, { text: "1000,\"50,000,000.00\",,\n3100,,\"50,000,000.00\",\n", date: today, addToExisting: true });
    expect(await db.journalLine.aggregate({ where: { journalId: big.journal.id, amountCents: { gt: 0 } }, _sum: { amountCents: true }, _count: true })).toMatchObject({ _sum: { amountCents: 5_000_000_000 }, _count: 3 });

    const fr = w.owner.id;
    await expect(importOpeningBalances(hqAdmin, fr, { text: csv, date: today })).rejects.toThrow("can read these books, but not change them");
    await expect(importOpeningBalances(owner, fr, { text: "account,debit,credit\n1000,100,\n3000,,90\n", date: today })).rejects.toThrow("don't balance");
    await expect(importOpeningBalances(owner, fr, { text: "account,debit,credit,party\n9999,100,,\n2000,,100,\n", date: today })).rejects.toThrow(
      "Row 2: there's no account 9999 in these books. Row 3: 2000 Trade creditors needs the supplier's name.",
    );
    await expect(importOpeningBalances(owner, fr, { text: "account,debit,credit,party,store\n1300,100,,,NOPE\n3000,,100,,\n", date: today })).rejects.toThrow("store NOPE isn't one of this company's");
    await expect(importOpeningBalances(owner, fr, { text: "account,debit,credit,party\n1000,100,,Someone\n3000,,100,\n", date: today })).rejects.toThrow("doesn't take a supplier");

    // The owner's posts; an accountant's waits as a draft. Opening stock equals the stock take (Σ on hand × cost).
    const stock = await importOpeningBalances(owner, fr, { text: "account,debit,credit,store\n1300,8450.00,,TST01\n3000,,8450.00,\n", date: today });
    expect(stock.posted).toBe(true);
    const more = await importOpeningBalances(accountant, fr, { text: "1050,100,,,\n3000,,100,,\n", date: today, addToExisting: true });
    expect(more).toMatchObject({ posted: false, journal: { status: "DRAFT", source: "opening" } });
    expect(await db.auditLog.count({ where: { action: "ledger.opening_import" } })).toBe(4);
  });
});

describe("Reconciliation checks", () => {
  it("find a franchisee's books in order, and name a deliberate mismatch", async () => {
    await db.ledgerQueue.deleteMany();
    const fr = w.owner.id;
    let checks = await booksChecks(fr, P, later);
    expect(pick(checks, "trial-balance")).toMatchObject({ ok: true, difference: 0 });
    expect(pick(checks, "running-balances").ok).toBe(true);
    expect(pick(checks, `stock:${w.store.id}`)).toMatchObject({ ok: true, expected: 845_000, actual: 845_000 });
    expect(pick(checks, `statement:${w.store.id}`)).toMatchObject({ ok: true, expected: 0, actual: 0 });
    expect(pick(checks, "queue")).toMatchObject({ ok: true, actual: 0 });
    expect(pick(checks, "bank-lines")).toMatchObject({ ok: true, actual: 0 });

    // Stock that isn't on the shelf; a statement payment not yet in the books; a failed posting; an unmatched bank line.
    await saveJournal(owner, fr, { date: today, memo: "Stock found", post: true, lines: pay("1300", "1000", 100, { store: w.store.id }) });
    await db.statementPayment.create({ data: { storeId: w.store.id, companyId: fr, month: P, amountCents: 100_000, paidOn: new Date(`${today}T00:00:00Z`), reference: "EFT 1", createdById: owner.id } });
    await db.ledgerQueue.createMany({ data: [{ source: "store-day", sourceId: `${w.store.id}:${today}`, attempts: 2, error: "boom" }, { source: "store-day", sourceId: `${w.dc.id}:${today}` }] });
    const bankAccount = await db.bankAccount.create({ data: { companyId: fr, accountId: await account(fr, "bank"), bank: "FNB", name: "Cheque", number: "1234" } });
    const line = await db.bankLine.create({ data: { companyId: fr, bankAccountId: bankAccount.id, date: new Date(`${today}T00:00:00Z`), amountCents: -2_500, description: "Bank charges", hash: "h1" } });
    checks = await booksChecks(fr, P, later);
    expect(pick(checks, `stock:${w.store.id}`)).toMatchObject({ ok: false, expected: 845_000, actual: 845_100, difference: 100 });
    expect(pick(checks, `statement:${w.store.id}`)).toMatchObject({ ok: false, expected: 100_000, actual: 0, difference: -100_000 });
    expect(pick(checks, "queue")).toMatchObject({ ok: false, unit: "count", actual: 1, detail: "1 posting waiting, 1 of them failed and is being retried." }); // the DC's isn't theirs
    expect(pick(checks, "bank-lines")).toMatchObject({ ok: false, actual: 1 });
    expect(await queueCounts(w.hq.id)).toEqual({ waiting: 2, failed: 1 });

    // The payment, as its posting would record it: the store paid HQ.
    await saveJournal(owner, fr, { date: today, memo: "Statement paid", post: true, lines: pay("1150", "1000", 100_000, { store: w.store.id }) });
    expect(pick(await booksChecks(fr, P, later), `statement:${w.store.id}`).ok).toBe(true);
    expect(await sourceLink({ companyId: fr, source: "bank", sourceId: line.id }, accountant)).toEqual({ label: expect.stringContaining("Bank charges"), href: `/books/${fr}/bank/${bankAccount.id}?line=${line.id}` });

    // Stock received into a lot at another cost re-averages it; taken back to a day before, the valuation is exact.
    await tx((t) => putStock(t, { storeId: w.store.id, variantId: w.flowerV.id, batchId: w.flowerOld.id, qty: 3, unitCostCents: 30_001, type: "RECEIVE" }));
    expect((await db.stockMovement.findFirstOrThrow({ where: { storeId: w.store.id, unitCostCents: 30_001 } })).revalueCents).toBe(3);
    expect(pick(await booksChecks(fr, "2026-03", new Date("2026-03-20T12:00:00+02:00")), `stock:${w.store.id}`)).toMatchObject({ ok: true, expected: 0, actual: 0 });
  });

  it("set HQ's books against the franchisees' books and the registers", async () => {
    const hq = w.hq.id;
    const voucher = await db.giftVoucher.create({ data: { code: "GV-TEST-1", amountCents: 50_000, balanceCents: 25_000, status: "ACTIVE", issuedAt: new Date(), expiresAt: new Date(Date.now() + 365 * 86_400_000) } });
    await db.voucherRedemption.create({ data: { voucherId: voucher.id, cents: 20_000 } });
    // An online order still being picked: checkout took R50 off the voucher and 50 points; the books move at handover.
    const order = await db.order.create({
      data: { code: "HHT0001", customerId: w.walkIn.id, storeId: w.store.id, status: "PICKING", fulfilment: "COLLECT", subtotalCents: 10_000, totalCents: 10_000, vatCents: 1_304, payMethod: "VOUCHER", collectionCode: "4321", events: [], pointsRedeemed: 50 },
    });
    await db.voucherRedemption.create({ data: { voucherId: voucher.id, orderId: order.id, cents: 5_000 } });
    await db.loyaltyEntry.create({ data: { customerId: w.walkIn.id, points: -50, kind: "REDEEM", orderId: order.id, storeId: w.store.id } });
    await db.customer.update({ where: { id: w.walkIn.id }, data: { points: { decrement: 50 } } });
    // An EFT trade order paid ahead: it goes through prepaid, never the trade account.
    const ta = await db.tradeAccount.findFirstOrThrow();
    const eft = await db.tradeOrder.create({ data: { number: "TO-000001", tradeAccountId: ta.id, storeId: w.dc.id, payMethod: "EFT", subtotalCents: 6_087, vatCents: 913, totalCents: 7_000, events: [], paidAt: new Date(), paymentRef: "EFT-77" } });
    await db.tradeLedgerEntry.create({ data: { tradeAccountId: ta.id, kind: "PAYMENT", cents: -7_000, reference: "EFT-77", tradeOrderId: eft.id } });
    let checks = await booksChecks(hq, P, later);
    expect(pick(checks, "trial-balance").ok).toBe(true);
    expect(pick(checks, "debtors")).toMatchObject({ ok: true, expected: 10_000, actual: 10_000 }); // the opening balance
    expect(pick(checks, "vouchers")).toMatchObject({ ok: false, expected: 30_000, actual: 0 });
    expect(pick(checks, "points")).toMatchObject({ ok: false, expected: 20_000, actual: 0 }); // Wally's 200 points
    // The franchisee's Herbal Holland account moved R1,000 (the payment) and HQ's mirror didn't.
    expect(pick(checks, `franchisees:${w.owner.id}`)).toMatchObject({ ok: false, label: "Test Retail: HQ's account vs their books", expected: -100_000, actual: 0 });
    expect(pick(checks, `stock:${w.dc.id}`)).toMatchObject({ ok: false, expected: 3_385_000, actual: 0 });
    expect(pick(checks, "queue")).toMatchObject({ ok: false, actual: 1, href: `/books/${hq}/close#failed` });

    await saveJournal(hqAdmin, hq, { date: today, memo: "Vouchers sold before go-live", post: true, lines: pay("1000", "2300", 30_000) });
    await saveJournal(hqAdmin, hq, { date: today, memo: "Points owed at go-live", post: true, lines: pay("6310", "2310", 20_000) });
    // HQ's side of the payment, as the statement-payment rules post it (per franchisee and store).
    await tx((t) => syncPosting(t, "test-payment", "p1", hq, { companyId: hq, date: today, memo: "Statement payment", lines: [{ key: "bank", cents: 100_000 }, { key: "franchisees", cents: -100_000, storeId: w.store.id, partyId: w.owner.id }] }));
    checks = await booksChecks(hq, P, later);
    for (const key of ["vouchers", "points", "franchisees", "debtors", "trial-balance", "running-balances"]) expect(pick(checks, key)).toMatchObject({ ok: true });
    // Only the known timing items differ, so they agree — and say so.
    expect(pick(checks, "vouchers")).toMatchObject({ expected: 30_000, detail: expect.stringContaining("plus R50.00 taken at checkout for online orders not handed over yet") });
    expect(pick(checks, "points")).toMatchObject({ expected: 20_000, detail: expect.stringContaining("Members held 150 points") });
    expect(pick(checks, "debtors").detail).toContain("Entries for EFT orders are left out");
    await db.tradeLedgerEntry.create({ data: { tradeAccountId: ta.id, kind: "PAYMENT", cents: -4_000, reference: "EFT" } });
    expect(pick(await booksChecks(hq, P, later), `debtors:${ta.id}`)).toMatchObject({ ok: false, expected: 6_000, actual: 10_000 });

    const health = await booksHealth([{ id: hq, kind: "FRANCHISOR" }, { id: w.owner.id, kind: "FRANCHISEE" }], later);
    expect(health.get(hq)).toEqual({ drafts: 0, issues: ["1 posting failed"] });
    expect(health.get(w.owner.id)).toEqual({ drafts: 1, issues: ["1 posting failed", "1 unmatched bank line"] });

    // In a month under way, points franchisee stores issued wait for the month's statements: a timing item too.
    await db.dailyStoreStat.create({ data: { storeId: w.store.id, date: new Date("2026-03-10T00:00:00Z"), channel: "POS", pointsIssued: 30 } });
    await db.loyaltyEntry.create({ data: { customerId: w.walkIn.id, points: 30, kind: "EARN", storeId: w.store.id, createdAt: new Date("2026-03-10T10:00:00+02:00") } });
    await db.customer.update({ where: { id: w.walkIn.id }, data: { points: { increment: 30 } } });
    const march = pick(await booksChecks(hq, "2026-03", new Date("2026-03-20T12:00:00+02:00")), "points");
    expect(march).toMatchObject({ ok: true, expected: 0, actual: 0, detail: expect.stringContaining("Members held 30 points on 19 Mar 2026, less 30 issued at franchisee stores this month") });
  });
});

describe("Month end", () => {
  it("closes a month that's over and reopens it, for the owner only", async () => {
    await db.ledgerQueue.deleteMany();
    const fr = w.owner.id;
    await db.journal.deleteMany({ where: { companyId: fr, status: "DRAFT" } });
    await expect(closeMonth(accountant, fr, P, later)).rejects.toThrow("Only the owner");
    await expect(closeMonth(owner, fr, P)).rejects.toThrow("month that's over");
    await closeMonth(owner, fr, P, later);
    expect((await db.company.findUniqueOrThrow({ where: { id: fr } })).booksLockedThrough).toBe(P);
    await expect(saveJournal(owner, fr, { date: today, memo: "Too late", post: true, lines: pay("6000", "1000", 100) })).rejects.toThrow(`${P} is closed`);
    await expect(closeMonth(owner, fr, P, later)).rejects.toThrow("already closed");
    await expect(reopenMonth(area, fr, later)).rejects.toThrow("Only the owner");
    expect(await reopenMonth(owner, fr, later)).toBe(P);
    expect((await db.company.findUniqueOrThrow({ where: { id: fr } })).booksLockedThrough).toBeNull(); // nothing before P
    expect(await db.auditLog.count({ where: { action: { in: ["ledger.close", "ledger.reopen"] }, entityId: fr } })).toBe(2);
  });
});

describe("Rights", () => {
  it("give a manager no books, HQ read-only franchisee books, and an accountant no approvals", async () => {
    const fr = w.owner.id;
    await expect(createAccount(w.manager, fr, { code: "6560", name: "Nope", type: "EXPENSE" })).rejects.toThrow("You don't have access to these books");
    await expect(saveJournal(w.manager, fr, { date: today, memo: "Nope", post: false, lines: pay("6000", "1000", 100) })).rejects.toThrow("You don't have access");
    await expect(createAccount(hqAdmin, fr, { code: "6560", name: "Nope", type: "EXPENSE" })).rejects.toThrow("can read these books, but not change them");
    await expect(saveJournal(area, fr, { date: today, memo: "Nope", post: false, lines: pay("6000", "1000", 100) })).rejects.toThrow("can read these books");
    await expect(saveBooksSettings(accountant, fr, { vatCategory: "B", yearEndMonth: 2 })).rejects.toThrow("Only the owner");
    await expect(addAccountant(accountant, fr, { name: "Friend", email: "friend@books.co.za" })).rejects.toThrow("Only the owner");
    await expect(saveBooksSettings(owner, fr, { vatCategory: null, yearEndMonth: 2 })).rejects.toThrow("VAT category");
    expect(await saveBooksSettings(owner, fr, { vatCategory: "C", yearEndMonth: 6 })).toBe(true);
    expect(await db.company.findUniqueOrThrow({ where: { id: fr } })).toMatchObject({ vatCategory: "C", yearEndMonth: 6 });

    // The queue is network-wide: retried from HQ's books only.
    await db.ledgerQueue.create({ data: { source: "store-day", sourceId: `${w.store.id}:2026-01-01`, attempts: 3, error: "boom" } });
    await expect(retryPosting(owner, fr, "store-day", `${w.store.id}:2026-01-01`)).rejects.toThrow("Herbal Holland's books");
    await retryPosting(hqAdmin, w.hq.id, "store-day", `${w.store.id}:2026-01-01`);
    expect(await db.ledgerQueue.findFirstOrThrow()).toMatchObject({ attempts: 0, error: null });
    expect(await db.auditLog.count({ where: { action: "ledger.retry" } })).toBe(1);
    await db.ledgerQueue.deleteMany();
  });

  it("link an automatic journal to its origin only where the viewer may go", async () => {
    const fr = w.owner.id;
    const day = { companyId: fr, source: "store-day", sourceId: `${w.store.id}:${today}`, storeId: w.store.id };
    expect(await sourceLink(day, owner)).toEqual({ label: expect.stringContaining("Test Store · trading on"), href: `/store/TST01/finance?from=${today}&to=${today}` });
    expect(await sourceLink(day, accountant)).toBeNull(); // the books only
    const statement = { ...day, source: "statement", sourceId: `${w.store.id}:${P}` };
    expect(await sourceLink({ ...statement, companyId: w.hq.id }, hqAdmin)).toMatchObject({ href: `/hq/statements?month=${P}&store=TST01` }); // HQ's side
    expect(await sourceLink(statement, owner)).toMatchObject({ href: `/store/TST01/statement?month=${P}` });
    expect(await sourceLink({ ...day, source: "manual", sourceId: null }, owner)).toBeNull();
    expect(await sourceLink({ ...day, source: "points", sourceId: today }, owner)).toBeNull();
    expect(await sourceLink({ ...day, source: "vat-period", sourceId: `${fr}:${P}` }, accountant)).toMatchObject({ href: `/books/${fr}/vat?period=${P}` });
  });
});
