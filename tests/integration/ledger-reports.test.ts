// The books' reports on real journals: a franchisee's two financial years at two stores, its suppliers, HQ's
// statement and HQ's side of it. The trial balance sums to zero, the balance sheet balances with computed retained
// earnings, the income statement and cash flow tie to the ledger, creditors and the franchise accounts age FIFO, a VAT
// period's return closes (for approvers only) without touching the next one, and the CSV exports agree.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));

import { db, tx } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { COOKIE } from "@/server/auth";
import { booksFor, createManualJournal, writeJournal } from "@/server/ledger/core";
import { accountLedger, ageing, balanceSheet, cashFlow, chartOf, closeVatPeriod, incomeStatement, trialBalance, vatReturn } from "@/server/ledger/reports";
import { supplierParty } from "@/lib/ledger";
import { closeVatPeriodAction } from "@/app/books/[companyId]/vat/actions";
import { GET as exportCsv } from "@/app/books/[companyId]/export/[kind]/route";
import { buildWorld, resetDb, type World } from "./world";

const NOW = new Date("2026-10-05T10:00:00+02:00");
const ACME = supplierParty("Acme Supplies (Pty) Ltd");
const BRAVO = supplierParty("Bravo Security");
const YEAR = { from: "2026-03", to: "2026-10" }; // the financial year to date (year end February)

let w: World;
let fr: string, hq: string, s1: string, s2: string;
let owner: { id: string; name: string }, accountant: { id: string }, area: { id: string }, hqAdmin: { id: string };
const actor = () => ({ type: "USER" as const, id: owner.id, name: owner.name });

type L = [account: string, cents: number, storeId?: string | null, partyId?: string | null];
const accountId = async (companyId: string, keyOrCode: string) => (await chartOf(companyId)).find((a) => a.key === keyOrCode || a.code === keyOrCode)!.id;
/** A journal as an automatic source posts it: lines by account key (or code, for accounts without one). */
async function post(companyId: string, date: string, source: string, memo: string, lines: L[]) {
  return tx(async (t) => {
    const b = await booksFor(t, companyId);
    const codes = new Map((await t.ledgerAccount.findMany({ where: { companyId }, select: { id: true, code: true } })).map((a) => [a.code, a.id]));
    return writeJournal(t, {
      companyId, date, memo, source, sourceId: `${source}:${date}`,
      lines: lines.map(([k, cents, storeId, partyId]) => ({ accountId: b.accounts.get(k) ?? codes.get(k)!, cents, storeId: storeId ?? null, partyId: partyId ?? null })),
    });
  });
}
/** A journal the owner posts by hand (or leaves as a draft). */
async function manual(date: string, memo: string, lines: L[], o: { source?: "manual" | "opening"; post?: boolean } = {}) {
  const ids = await Promise.all(lines.map(([k]) => accountId(fr, k)));
  return createManualJournal({
    companyId: fr, date, memo, source: o.source ?? "manual", post: o.post ?? true, actor: actor(),
    lines: lines.map(([, cents, storeId, partyId], i) => ({ accountId: ids[i], cents, storeId: storeId ?? null, partyId: partyId ?? null })),
  });
}
async function signIn(u: { id: string }) {
  const token = `ledger-reports-${u.id}-${Math.random()}`;
  await db.session.create({ data: { id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  jar.set(COOKIE.staff, token);
}
const download = (kind: string, qs: string, companyId = fr) => exportCsv(new Request(`http://localhost/books/${companyId}/export/${kind}?${qs}`), { params: Promise.resolve({ companyId, kind }) });
/** CSV text → rows of cells (quoted cells unquoted; no line breaks inside cells in these books). */
function readCsv(text: string) {
  return text.replace(/^﻿/, "").trimEnd().split("\r\n").map((line) => {
    const out: string[] = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") out.push(cur), (cur = "");
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  fr = w.owner.id;
  hq = w.hq.id;
  s1 = w.store.id;
  s2 = (await db.store.create({
    data: { code: "TST02", slug: "tst02", name: "Test Store Two", companyId: fr, regionId: w.region.id, dcId: w.dc.id, addressLine: "2 Church St", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083" },
  })).id;
  await db.company.update({ where: { id: fr }, data: { vatCategory: "B" } }); // two-monthly, periods ending in even months
  owner = await db.user.create({ data: { name: "Olive Owner", role: "OWNER", companyId: fr, email: "olive@books.example" } });
  accountant = await db.user.create({ data: { name: "Abe Accountant", role: "ACCOUNTANT", companyId: fr, email: "abe@books.example" } });
  area = await db.user.create({ data: { name: "Ari Area", role: "AREA_MANAGER", regionId: w.region.id, email: "ari@books.example" } });
  hqAdmin = await db.user.create({ data: { name: "Hana Admin", role: "HQ_ADMIN", companyId: hq, email: "hana@books.example" } });
  await db.supplierInvoice.create({
    data: { storeId: s1, supplierName: "Acme Supplies (Pty) Ltd ", number: "A-1", invoiceDate: new Date("2026-06-01"), dueDate: new Date("2026-07-01"), totalCents: 115_000, vatCents: 15_000, createdById: owner.id },
  });

  // Financial year to February 2026: opening balances, a trading day and rent, for a profit of R1,000.
  await manual("2025-03-01", "Opening balances", [["bank", 10_000_000], ["stock", 4_000_000, s1], ["capital", -14_000_000]], { source: "opening" });
  await post(fr, "2025-06-15", "store-day", "Trading day", [["cash", 1_150_000, s1], ["sales.pos", -1_000_000, s1], ["vat.output", -150_000, s1], ["cogs", 400_000, s1], ["stock", -400_000, s1]]);
  await post(fr, "2025-11-30", "expense", "Rent", [["exp.RENT", 500_000, s1], ["vat.input", 75_000, s1], ["bank", -575_000, s1]]);
  // This financial year: trading at both stores, suppliers, HQ's statement, a loan and shopfitting.
  await post(fr, "2026-06-01", "supplier-invoice", "Acme: cleaning", [["exp.OTHER", 100_000, s1], ["vat.input", 15_000, s1], ["creditors", -115_000, null, ACME]]);
  await post(fr, "2026-07-10", "store-day", "Trading day", [["cash", 2_300_000, s1], ["sales.pos", -2_000_000, s1], ["vat.output", -300_000, s1], ["cogs", 800_000, s1], ["stock", -800_000, s1]]);
  await post(fr, "2026-07-11", "deposit", "Cash banked", [["bank", 2_000_000], ["cash", -2_000_000, s1]]);
  await post(fr, "2026-07-12", "store-day", "Trading day", [["card", 1_150_000, s2], ["sales.pos", -1_000_000, s2], ["vat.output", -150_000, s2]]);
  await post(fr, "2026-07-31", "statement", "July statement", [["fees.royalty", 180_000, s1], ["vat.input", 27_000, s1], ["hq", -207_000, s1]]);
  await post(fr, "2026-08-05", "supplier-invoice", "Acme: supplies", [["exp.SUPPLIES", 200_000, s2], ["vat.input", 30_000, s2], ["creditors", -230_000, null, ACME]]);
  await post(fr, "2026-08-20", "supplier-payment", "Paid Acme", [["creditors", 100_000, null, ACME], ["bank", -100_000]]);
  await manual("2026-09-01", "Bank loan", [["bank", 5_000_000], ["2600", -5_000_000]]);
  await manual("2026-09-10", "Shopfitting", [["1500", 3_000_000, s2], ["vat.input", 450_000, s2], ["bank", -3_450_000]]);
  await post(fr, "2026-09-30", "supplier-invoice", "Bravo: guarding", [["exp.SECURITY", 100_000, s1], ["vat.input", 15_000, s1], ["creditors", -115_000, null, BRAVO]]);
  await post(fr, "2026-09-30", "store-day", "Online orders", [["hq", 230_000, s1], ["sales.online", -200_000, s1], ["vat.output", -30_000, s1]]);
  await manual("2026-08-15", "Not approved yet", [["exp.OTHER", 999_900], ["bank", -999_900]], { post: false });
  // HQ's side: the statement it charged, and the online orders it collected for the store.
  await post(hq, "2026-07-31", "statement", "July statement", [["franchisees", 207_000, s1, fr], ["royalty", -180_000, s1], ["vat.output", -27_000, s1]]);
  await post(hq, "2026-09-30", "store-day", "Online orders", [["prepaid", 230_000, s1], ["franchisees", -230_000, s1, fr]]);
});
afterAll(async () => {
  await db.$disconnect();
});

describe("Trial balance", () => {
  it("sums to zero, carries earlier years' profit in retained earnings and leaves drafts out", async () => {
    const tb = await trialBalance(fr, YEAR);
    expect(tb.totals.opening).toBe(0);
    expect(tb.totals.closing).toBe(0);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    const row = (k: string) => tb.rows.find((r) => r.account.key === k || r.account.code === k);
    expect(tb.earlierProfit).toBe(100_000);
    expect(row("retained")).toMatchObject({ opening: -100_000, debit: 0, credit: 0, closing: -100_000 });
    expect(row("sales.pos")).toMatchObject({ opening: 0, debit: 0, credit: 3_000_000, closing: -3_000_000 });
    expect(row("exp.RENT")).toBeUndefined(); // last year's rent is in retained earnings now
    expect(row("exp.OTHER")).toMatchObject({ debit: 100_000, closing: 100_000 }); // not the draft
    expect(row("bank")).toMatchObject({ opening: 9_425_000, debit: 7_000_000, credit: 3_550_000, closing: 12_875_000 });
    // Mid-year, income and expenses open with the year so far.
    const mid = await trialBalance(fr, { from: "2026-07", to: "2026-08" });
    expect(mid.totals).toMatchObject({ opening: 0, closing: 0 });
    expect(mid.rows.find((r) => r.account.key === "exp.OTHER")).toMatchObject({ opening: 100_000, debit: 0, closing: 100_000 });
    expect((await trialBalance(hq, YEAR)).totals).toMatchObject({ opening: 0, closing: 0, debit: 437_000, credit: 437_000 });
  });

  it("shows one store's slice, which needn't balance", async () => {
    const tb = await trialBalance(fr, { ...YEAR, storeId: s2 });
    expect(tb.rows.map((r) => [r.account.key ?? r.account.code, r.closing])).toEqual([
      ["card", 1_150_000], ["vat.input", 480_000], ["1500", 3_000_000], ["vat.output", -150_000], ["sales.pos", -1_000_000], ["exp.SUPPLIES", 200_000],
    ]);
    expect(tb.totals.closing).toBe(3_680_000);
  });
});

describe("Balance sheet", () => {
  it("balances, with earlier years' profit in retained earnings and this year's as profit so far", async () => {
    const bs = await balanceSheet(fr, "2026-10", { compareTo: "2026-02" });
    expect(bs.columns.map((c) => c.label)).toEqual(["31 October 2026", "28 February 2026"]);
    expect(bs.difference).toEqual([0, 0]);
    expect(bs.assets).toEqual([21_910_000, 14_250_000]);
    expect(bs.liabilities).toEqual([5_990_000, 150_000]);
    expect(bs.equity).toEqual([15_920_000, 14_100_000]);
    expect(bs.nonCurrentAssets).toEqual([3_000_000, 0]);
    expect(bs.nonCurrentLiabilities).toEqual([5_000_000, 0]);
    expect(bs.lines.find((l) => l.kind === "account" && l.account.key === "retained")).toMatchObject({ values: [100_000, 0], note: "Includes the profit of earlier financial years" });
    expect(bs.lines.find((l) => l.key === "profitThisYear")).toMatchObject({ label: "Profit for the year so far", values: [1_820_000, 100_000] });
  });

  it("names what the rest of the company funded in one store's slice", async () => {
    const bs = await balanceSheet(fr, "2026-10", { storeId: s2 });
    expect(bs.difference).toEqual([0]);
    expect(bs.lines.find((l) => l.key === "balancing")).toMatchObject({ label: "Funded by the rest of the company", values: [3_680_000] });
  });
});

describe("Income statement", () => {
  it("adds up to the profit the balance sheet shows", async () => {
    const is = await incomeStatement(fr, YEAR);
    expect(is).toMatchObject({ revenue: [3_200_000], costOfSales: [-800_000], grossProfit: [2_400_000], operatingExpenses: [-580_000], netProfit: [1_820_000] });
    expect(is.lines.filter((l) => l.kind === "account").map((l) => l.label)).toEqual(["Sales in store", "Online sales", "Cost of sales", "Security", "Supplies", "Other expenses", "Royalties"]);
  });

  it("splits by month against last year, and by store", async () => {
    const m = await incomeStatement(fr, { from: "2026-06", to: "2026-09", by: "month", compare: "lastYear" });
    expect(m.columns.map((c) => c.key)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "total", "compare"]);
    expect(m.columns.at(-1)!.label).toBe("June – September 2025");
    expect(m.revenue).toEqual([0, 3_000_000, 0, 200_000, 3_200_000, 1_000_000]);
    expect(m.netProfit).toEqual([-100_000, 2_020_000, -200_000, 100_000, 1_820_000, 600_000]);
    const s = await incomeStatement(fr, { ...YEAR, by: "store", compare: "previous" });
    expect(s.columns.map((c) => c.key)).toEqual([s1, s2, "total", "compare"]); // nothing off-store: no "not one store" column
    expect(s.revenue).toEqual([2_200_000, 1_000_000, 3_200_000, 0]);
    expect(s.netProfit).toEqual([1_020_000, 800_000, 1_820_000, -500_000]);
    expect((await incomeStatement(fr, { ...YEAR, storeId: s2 })).netProfit).toEqual([800_000]);
  });
});

describe("Cash flow", () => {
  it("ties the flows to the cash accounts, by activity", async () => {
    const cf = await cashFlow(fr, YEAR);
    expect(cf).toMatchObject({ opening: [10_575_000], closing: [15_475_000], operating: [2_900_000], investing: [-3_000_000], financing: [5_000_000], net: [4_900_000], other: [0] });
    expect(cf.cashAccounts.map((a) => a.key)).toEqual(["bank", "cash", "card"]);
    const tb = await trialBalance(fr, YEAR);
    const cash = tb.rows.filter((r) => ["bank", "cash", "card"].includes(r.account.key ?? ""));
    expect(cash.reduce((s, r) => s + r.closing - r.opening, 0)).toBe(cf.net[0]);
    const flow = (k: string) => cf.lines.flatMap((l) => (l.kind === "account" && (l.account.key === k || l.account.code === k) ? l.values : []))[0];
    expect([flow("sales.pos"), flow("vat.output"), flow("creditors"), flow("vat.input"), flow("1500"), flow("2600")]).toEqual([3_000_000, 450_000, -100_000, -450_000, -3_000_000, 5_000_000]);
    expect([flow("cogs"), flow("stock")]).toEqual([undefined, undefined]); // the stock a trading day sold moved no cash
    expect(flow("exp.OTHER")).toBeUndefined(); // the draft paid nothing
  });

  it("shows a store's cash banked into the company's account as moved to the company", async () => {
    const cf = await cashFlow(fr, { from: "2026-07", to: "2026-07", storeId: s1 });
    expect(cf).toMatchObject({ opening: [575_000], closing: [875_000], operating: [300_000], net: [300_000], other: [-2_000_000] });
  });
});

describe("General ledger", () => {
  it("lists an account's lines with the running balance, a page at a time", async () => {
    const bank = await accountId(fr, "bank");
    const l = await accountLedger(fr, bank, YEAR);
    expect(l).toMatchObject({ opening: 9_425_000, debit: 7_000_000, credit: 3_550_000, closing: 12_875_000, total: 4, page: 1 });
    expect(l!.lines.map((x) => [x.date, x.source, x.cents, x.balance])).toEqual([
      ["2026-07-11", "deposit", 2_000_000, 11_425_000],
      ["2026-08-20", "supplier-payment", -100_000, 11_325_000],
      ["2026-09-01", "manual", 5_000_000, 16_325_000],
      ["2026-09-10", "manual", -3_450_000, 12_875_000],
    ]);
    expect(await accountLedger(fr, bank, YEAR, 2)).toMatchObject({ total: 4, lines: [] });
    expect(await accountLedger(fr, await accountId(hq, "bank"), YEAR)).toBeNull(); // another company's account
    // Retained earnings open with earlier years' profit.
    expect(await accountLedger(fr, await accountId(fr, "retained"), YEAR)).toMatchObject({ opening: -100_000, total: 0, closing: -100_000 });
  });

  it("follows one party, named as on its invoices", async () => {
    const acme = await accountLedger(fr, await accountId(fr, "creditors"), { ...YEAR, partyId: ACME });
    expect(acme).toMatchObject({ opening: 0, debit: 100_000, credit: 345_000, closing: -245_000, total: 3 });
    expect(acme!.parties.get(ACME)).toBe("Acme Supplies (Pty) Ltd");
    expect(acme!.lines.every((x) => x.partyId === ACME)).toBe(true);
  });
});

describe("Ageing", () => {
  it("ages creditors FIFO by supplier", async () => {
    const a = await ageing(fr, "creditors", "2026-10-05");
    expect(a.rows).toEqual([
      // R1,000 paid against the June invoice leaves R150 of it (126 days) and all of August's (61 days).
      { partyId: ACME, name: "Acme Supplies (Pty) Ltd", current: 0, d30: 0, d60: 230_000, d90plus: 15_000, total: 245_000 },
      { partyId: BRAVO, name: "Bravo Security", current: 115_000, d30: 0, d60: 0, d90plus: 0, total: 115_000 }, // no invoice on file: its name, capitalised
    ]);
    expect(a.totals).toEqual({ current: 115_000, d30: 0, d60: 230_000, d90plus: 15_000, total: 360_000 });
    const tb = await trialBalance(fr, YEAR);
    expect(-tb.rows.find((r) => r.account.key === "creditors")!.closing).toBe(a.totals.total);
    // As at an earlier day, later lines don't count yet.
    expect((await ageing(fr, "creditors", "2026-08-10")).rows[0]).toMatchObject({ current: 230_000, d60: 115_000, total: 345_000 });
  });

  it("ages the franchise current accounts on both sides, and has no trade debtors at a franchisee", async () => {
    expect((await ageing(fr, "franchise", "2026-10-05")).rows).toEqual([{ partyId: null, name: "Herbal Holland", current: 23_000, d30: 0, d60: 0, d90plus: 0, total: 23_000 }]);
    expect((await ageing(hq, "franchise", "2026-10-05")).rows).toEqual([{ partyId: fr, name: "Test Retail", current: -23_000, d30: 0, d60: 0, d90plus: 0, total: -23_000 }]);
    expect(await ageing(fr, "debtors", "2026-10-05")).toMatchObject({ account: null, rows: [] });
  });
});

describe("CSV exports", () => {
  it("give the trial balance, a ledger and the journals to those who may read the books, audited", async () => {
    await signIn(w.manager); // a store manager keeps no books
    expect((await download("trial-balance", "from=2026-03&to=2026-10")).status).toBe(404);
    await signIn(hqAdmin); // HQ's administrator reads every franchisee's books
    const res = await download("trial-balance", "from=2026-03&to=2026-10");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="herbal-holland_Test-Retail_trial-balance_2026-03_2026-10.csv"');
    const tb = readCsv(await res.text());
    expect(tb[0]).toEqual(["Code", "Account", "Type", "Opening balance (debit + / credit −)", "Debits", "Credits", "Closing balance (debit + / credit −)"]);
    expect(tb.find((r) => r[0] === "1000")).toEqual(["1000", "Bank", "Asset", "94250.00", "70000.00", "35500.00", "128750.00"]);
    expect(tb.find((r) => r[0] === "1500")?.[1]).toBe("Furniture, fittings and equipment");
    const total = tb.at(-1)!;
    expect([total[0], total[3], total[6], total[4] === total[5]]).toEqual(["Total", "0.00", "0.00", true]);

    const bank = await accountId(fr, "bank");
    const ledger = readCsv(await (await download("ledger", `account=${bank}&from=2026-03&to=2026-10`)).text());
    const shopfitting = (await db.journal.findFirstOrThrow({ where: { companyId: fr, memo: "Shopfitting" } })).number;
    expect(ledger).toHaveLength(6);
    expect(ledger[1]).toEqual(["", "", "", "Opening balance", "", "", "", "", "94250.00"]);
    expect(ledger.at(-1)).toEqual(["2026-09-10", String(shopfitting), "Manual journal", "Shopfitting", "", "", "", "34500.00", "128750.00"]);
    const acme = readCsv(await (await download("ledger", `account=${await accountId(fr, "creditors")}&party=${encodeURIComponent(ACME)}&from=2026-03&to=2026-10`)).text());
    expect(acme.slice(1).map((r) => r[5])).toEqual(["", "Acme Supplies (Pty) Ltd", "Acme Supplies (Pty) Ltd", "Acme Supplies (Pty) Ltd"]);
    expect(acme.at(-1)![8]).toBe("-2450.00");
    expect((await download("ledger", `account=${await accountId(hq, "bank")}`)).status).toBe(404); // not these books' account

    const journals = readCsv(await (await download("journals", "from=2026-08&to=2026-08")).text());
    const body = journals.slice(1).map((r) => [r[2], r[6], r[7], r[9], r[10]]);
    expect(body).toHaveLength(5);
    expect(body).toEqual(expect.arrayContaining([
      ["Supplier invoice", "Supplies", "TST02", "2000.00", ""],
      ["Supplier invoice", "VAT input", "TST02", "300.00", ""],
      ["Supplier invoice", "Trade creditors", "", "", "2300.00"],
      ["Supplier payment", "Trade creditors", "", "1000.00", ""],
      ["Supplier payment", "Bank", "", "", "1000.00"],
    ]));
    expect(body.slice(0, 3).every((r) => r[0] === "Supplier invoice")).toBe(true); // in journal order
    expect(journals.flat()).not.toContain("Not approved yet");
    expect(await db.auditLog.count({ where: { action: "ledger.export", actorId: hqAdmin.id, entityId: fr } })).toBe(4);
  });
});

describe("VAT", () => {
  it("works out a two-monthly return from the ledger, by VAT201 field", async () => {
    const v = await vatReturn(fr, "2026-07", NOW);
    if (!v.vendor) throw new Error("expected a VAT vendor");
    expect(v.period).toEqual({ from: "2026-07", to: "2026-08" });
    expect(v).toMatchObject({ status: "due", output: 450_000, input: 57_000, payable: 393_000, suppliesEx: 3_000_000, suppliesIncl: 3_450_000, outputGap: 0, inputBy: { fees: 27_000, expenses: 30_000 } });
    expect(v.supplies.map((s) => [s.account.key, s.exVat])).toEqual([["sales.pos", 3_000_000]]);
    expect(v.rows.map((r) => [r.field ?? "", r.vat ?? null])).toEqual([["", null], ["1 · 4", 450_000], ["", null], ["15", 0], ["15", 30_000], ["15", 27_000], ["19", 57_000], ["20", 393_000]]);
    // September–October: still open; the shopfitting is capital goods (field 14), so SARS owes the company.
    expect(await vatReturn(fr, "2026-10", NOW)).toMatchObject({ status: "open", output: 30_000, input: 465_000, payable: -435_000, suppliesEx: 200_000, inputBy: { capital: 450_000, expenses: 15_000 } });
    expect(await vatReturn(fr, "2026-04", NOW)).toMatchObject({ status: "nil", output: 0, input: 0 });
  });

  it("has nothing to file for a company that isn't a VAT vendor", async () => {
    await db.company.update({ where: { id: fr }, data: { vatNumber: null } });
    expect(await vatReturn(fr, "2026-07", NOW)).toMatchObject({ vendor: false });
    await expect(closeVatPeriod(fr, "2026-08", actor(), NOW)).rejects.toThrow("isn't a VAT vendor");
    await db.company.update({ where: { id: fr }, data: { vatNumber: "4410000000" } });
  });

  it("closes a period that's over into VAT due to SARS, store by store, leaving the next return as it was", async () => {
    await expect(closeVatPeriod(fr, "2026-10", actor(), NOW)).rejects.toThrow("isn't over yet");
    const next = await vatReturn(fr, "2026-09", NOW);
    const r = await closeVatPeriod(fr, "2026-08", actor(), NOW);
    expect(r.journal).toMatchObject({ source: "vat-period", sourceId: `${fr}:2026-08`, period: "2026-08", memo: "VAT period July – August 2026 closed" });
    expect(r.journal!.date.toISOString().slice(0, 10)).toBe("2026-08-31");
    const [out, inp, ctl] = await Promise.all(["vat.output", "vat.input", "vat.control"].map((k) => accountId(fr, k)));
    const lines = await db.journalLine.findMany({ where: { journalId: r.journal!.id }, select: { accountId: true, storeId: true, amountCents: true } });
    expect(new Set(lines.map((l) => `${l.accountId === out ? "output" : l.accountId === inp ? "input" : l.accountId === ctl ? "control" : "?"}|${l.storeId === s1 ? "s1" : "s2"}|${l.amountCents}`))).toEqual(
      new Set(["output|s1|300000", "output|s2|150000", "input|s1|-27000", "input|s2|-30000", "control|s1|-273000", "control|s2|-120000"]),
    );
    const closed = await vatReturn(fr, "2026-08", NOW);
    expect(closed).toMatchObject({ status: "closed", output: 450_000, input: 57_000, payable: 393_000, pendingPayable: 0 });
    expect(await vatReturn(fr, "2026-09", NOW)).toEqual(next);
    const tb = await trialBalance(fr, { from: "2026-07", to: "2026-08" });
    expect(tb.totals).toMatchObject({ opening: 0, closing: 0 });
    expect(tb.rows.find((r) => r.account.key === "vat.control")).toMatchObject({ closing: -393_000 });
    // Closing again moves nothing more.
    expect((await closeVatPeriod(fr, "2026-08", actor(), NOW)).journal).toBeNull();
    expect(await db.auditLog.count({ where: { action: "ledger.vat_close", entityId: fr } })).toBe(2);
  });

  it("lets only the books' approvers close a period", async () => {
    for (const u of [accountant, area, hqAdmin]) {
      await signIn(u);
      expect(await closeVatPeriodAction(fr, "2026-06", {})).toMatchObject({ error: "You don't have permission to close VAT periods in these books." });
    }
    expect(await db.journal.count({ where: { source: "vat-period", sourceId: `${fr}:2026-06` } })).toBe(0);
    await signIn(owner);
    expect(await closeVatPeriodAction(fr, "2026-06", {})).toMatchObject({ ok: expect.stringContaining("May – June 2026 is closed") });
    expect(await db.journal.count({ where: { source: "vat-period", sourceId: `${fr}:2026-06` } })).toBe(1);
    expect(await vatReturn(fr, "2026-06", NOW)).toMatchObject({ status: "closed", input: 15_000, payable: -15_000 });
  });

  it("flags VAT posted into a closed period, and closing again moves just that", async () => {
    await post(fr, "2026-08-25", "store-day", "Trading day (late sale)", [["cash", 11_500, s1], ["sales.pos", -10_000, s1], ["vat.output", -1_500, s1]]);
    expect(await vatReturn(fr, "2026-08", NOW)).toMatchObject({ status: "changed", output: 451_500, pendingPayable: 1_500 });
    const again = await closeVatPeriod(fr, "2026-08", actor(), NOW);
    expect(again.journal?.memo).toBe("VAT period July – August 2026 closed · updated");
    expect(await vatReturn(fr, "2026-08", NOW)).toMatchObject({ status: "closed", payable: 394_500, pendingPayable: 0 });
    expect((await trialBalance(fr, YEAR)).rows.find((r) => r.account.key === "vat.control")).toMatchObject({ closing: -379_500 });
  });
});
