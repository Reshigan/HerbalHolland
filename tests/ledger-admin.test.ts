import { describe, expect, it } from "vitest";
import { accountCodeProblem, checkDate, differences, firstProblems, keyFigures, natural, profitOf, readCents, readOpeningCsv, sourceLabel } from "@/lib/ledger-admin";

describe("opening balances CSV", () => {
  it("reads a trial balance with a header, by column name, ignoring other columns", () => {
    const r = readOpeningCsv("Account,Name,Debit,Credit,Party,Store\n1000,Bank,\"12,500.00\",,,\n2000 Trade creditors,,,2500,ACME (Pty) Ltd,\n3000,Capital,,10000,,tst01\n1300,Stock,0,,,\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { line: 2, code: "1000", cents: 1_250_000, party: null, store: null },
      { line: 3, code: "2000", cents: -250_000, party: "ACME (Pty) Ltd", store: null },
      { line: 4, code: "3000", cents: -1_000_000, party: null, store: "TST01" },
    ]);
    expect(r).toMatchObject({ debitCents: 1_250_000, creditCents: 1_250_000, skipped: 1 });
  });

  it("takes the columns in order without a header, semicolons and decimal commas included", () => {
    const r = readOpeningCsv("1000;R 1 234,50;;;\r\n3000;;1234,50;;\r\n");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.code, x.cents])).toEqual([["1000", 123_450], ["3000", -123_450]]);
  });

  it("names each bad row, and refuses a file that doesn't balance", () => {
    const bad = readOpeningCsv("account,debit,credit\n10,100,\n1000,-5,\n1100,5,5\n1200,abc,\n");
    expect(bad.errors).toEqual([
      "Row 2: “10” isn't a four-digit account code.",
      "Row 3: debit: a negative amount (put it in the other column).",
      "Row 4: both a debit and a credit (use one column per row).",
      "Row 5: debit: not a number.",
    ]);
    expect(readOpeningCsv("account,debit,credit\n1000,100,\n3000,,99.99\n").errors).toEqual(["The debits (R100.00) and credits (R99.99) don't balance: they're out by R0.01."]);
    expect(readOpeningCsv("").errors).toEqual(["The file is empty."]);
    expect(readOpeningCsv("account,name\n1000,Bank\n").errors[0]).toMatch(/no debit or credit columns/);
    expect(readOpeningCsv("account,debit,credit\n1000,,\n").errors).toEqual(["Every row's amount is empty or zero."]);
  });

  it("reads rand amounts to the cent, within what a line holds", () => {
    expect(readCents("")).toBe(0);
    expect(readCents("R1,234.56")).toBe(123_456);
    expect(readCents("ZAR 99")).toBe(9_900);
    expect(() => readCents("1.234")).toThrow(/two ways/);
    expect(() => readCents("0.001")).toThrow(/two decimals/);
    expect(() => readCents("(50)")).toThrow(/other column/);
    expect(readCents("50,000,000.00")).toBe(5_000_000_000); // a big opening balance: the core splits the line
    expect(() => readCents("100000000000.01")).toThrow(/check the amount/);
  });

  it("shortens long problem lists", () => {
    expect(firstProblems(["a", "b", "c"], 2)).toBe("a b … and 1 more.");
    expect(firstProblems(["a"])).toBe("a");
  });
});

describe("accounts and figures", () => {
  it("checks codes, labels sources and reads balances the natural way", () => {
    expect(accountCodeProblem("6550")).toBeNull();
    expect(accountCodeProblem("655")).toMatch(/four-digit/);
    expect(sourceLabel("store-day")).toBe("Trading day");
    expect(sourceLabel("vat-period")).toBe("VAT period closed");
    expect(sourceLabel("some-new-source")).toBe("Some new source");
    expect(natural("ASSET", 500)).toBe(500);
    expect(natural("INCOME", -500)).toBe(500);
  });

  it("sums the overview's key balances", () => {
    const f = keyFigures(
      [
        { id: "a", key: "bank", type: "ASSET", cents: 10_000 },
        { id: "b", key: "cash", type: "ASSET", cents: 2_000 },
        { id: "c", key: null, type: "ASSET", cents: 3_000 }, // a second bank account
        { id: "d", key: "hq", type: "ASSET", cents: -4_000 }, // the store owes HQ
        { id: "e", key: "creditors", type: "LIABILITY", cents: -1_500 },
        { id: "f", key: "vat.output", type: "LIABILITY", cents: -1_500 },
        { id: "g", key: "vat.input", type: "ASSET", cents: 600 },
        { id: "h", key: "stock", type: "ASSET", cents: 7_000 },
        { id: "i", key: "transit", type: "ASSET", cents: 500 },
        { id: "j", key: "sales.pos", type: "INCOME", cents: -9_000 },
      ],
      new Set(["c"]),
    );
    expect(f).toEqual({ cash: 15_000, owedToUs: 0, owedByUs: 5_500, vatDue: 900, stock: 7_500 });
    expect(keyFigures([{ id: "x", key: "franchisees", type: "ASSET", cents: 8_000 }, { id: "y", key: "debtors", type: "ASSET", cents: 1_000 }]).owedToUs).toBe(9_000);
    expect(profitOf([{ type: "INCOME", cents: -9_000 }, { type: "EXPENSE", cents: 6_000 }, { type: "ASSET", cents: 1 }])).toEqual({ revenue: 9_000, expenses: 6_000, profit: 3_000 });
  });
});

describe("check dates", () => {
  it("compare a month that's over at its last day, and the current month at yesterday", () => {
    expect(checkDate("2026-09", "2026-10-05")).toEqual({ asAt: "2026-09-30", cutoff: new Date("2026-10-01T00:00:00+02:00"), over: true });
    expect(checkDate("2026-10", "2026-10-05")).toEqual({ asAt: "2026-10-04", cutoff: new Date("2026-10-05T00:00:00+02:00"), over: false });
    expect(checkDate("2026-10", "2026-10-01").asAt).toBe("2026-09-30");
  });

  it("list only the differences", () => {
    expect(differences(new Map([["a", 5], ["b", 7]]), new Map([["a", 5], ["c", 1]]))).toEqual([
      { key: "b", expected: 7, actual: 0, difference: -7 },
      { key: "c", expected: 0, actual: 1, difference: 1 },
    ]);
  });
});
