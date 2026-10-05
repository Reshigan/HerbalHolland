import { describe, expect, it } from "vitest";
import {
  CHART, chartFor, diffLines, fiscalYearEnd, fiscalYearStart, isBalanced, monthEnd, monthsBetween, netLines, postingDay, splitLarge, supplierParty, vatPeriodOf, addMonths,
} from "@/lib/ledger";

describe("chart of accounts", () => {
  it("has unique codes and keys, and gives each side of the network only its own accounts", () => {
    expect(new Set(CHART.map((r) => r.code)).size).toBe(CHART.length);
    const keys = CHART.flatMap((r) => (r.key ? [r.key] : []));
    expect(new Set(keys).size).toBe(keys.length);
    const hq = chartFor("FRANCHISOR").map((r) => r.key);
    const fr = chartFor("FRANCHISEE").map((r) => r.key);
    expect(hq).toContain("franchisees");
    expect(hq).not.toContain("hq");
    expect(fr).toContain("hq");
    expect(fr).not.toContain("debtors");
    for (const k of ["bank", "cash", "stock", "vat.input", "vat.output", "cogs", "exp.OTHER", "retained"]) {
      expect(hq).toContain(k);
      expect(fr).toContain(k);
    }
  });
});

describe("posting lines", () => {
  it("nets lines by account, store and party and drops zeros", () => {
    const lines = netLines([
      { key: "cash", cents: 1000, storeId: "s1" },
      { key: "cash", cents: 500, storeId: "s1" },
      { key: "cash", cents: 200, storeId: "s2" },
      { key: "sales.pos", cents: -1700 },
      { key: "card", cents: 0 },
    ]);
    expect(lines).toEqual([
      { key: "cash", cents: 1500, storeId: "s1", partyId: null },
      { key: "cash", cents: 200, storeId: "s2", partyId: null },
      { key: "sales.pos", cents: -1700, storeId: null, partyId: null },
    ]);
    expect(isBalanced(lines)).toBe(true);
    expect(() => netLines([{ key: "cash", cents: 1.5 }])).toThrow("whole cents");
  });

  it("posts only the difference between what a source should show and what's already posted", () => {
    const posted = [{ key: "cash", cents: 1000 }, { key: "sales.pos", cents: -1000 }];
    expect(diffLines(posted, posted)).toEqual([]);
    // A late sale of R5 adds R5 to the day; a correction to nothing reverses it all.
    expect(diffLines([{ key: "cash", cents: 1500 }, { key: "sales.pos", cents: -1500 }], posted)).toEqual([
      { key: "cash", cents: 500, storeId: null, partyId: null },
      { key: "sales.pos", cents: -500, storeId: null, partyId: null },
    ]);
    expect(diffLines([], posted)).toEqual([
      { key: "sales.pos", cents: 1000, storeId: null, partyId: null },
      { key: "cash", cents: -1000, storeId: null, partyId: null },
    ]);
  });

  it("stores an amount over a line's limit as several lines on the same account", () => {
    expect(splitLarge([{ key: "capital", cents: -45, storeId: "s1" }, { key: "bank", cents: 45 }, { key: "fees", cents: 7 }], 20)).toEqual([
      { key: "capital", cents: -20, storeId: "s1" },
      { key: "capital", cents: -20, storeId: "s1" },
      { key: "capital", cents: -5, storeId: "s1" },
      { key: "bank", cents: 20 },
      { key: "bank", cents: 20 },
      { key: "bank", cents: 5 },
      { key: "fees", cents: 7 },
    ]);
  });
});

describe("months, years and VAT periods", () => {
  it("knows month ends, month arithmetic and ranges", () => {
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthEnd("2026-11")).toBe("2026-11-30");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -13)).toBe("2025-12");
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("moves a posting into the first open month once its own is closed", () => {
    expect(postingDay("2026-10-05", null)).toEqual({ day: "2026-10-05", late: false });
    expect(postingDay("2026-10-05", "2026-09")).toEqual({ day: "2026-10-05", late: false });
    expect(postingDay("2026-09-30", "2026-09")).toEqual({ day: "2026-10-01", late: true });
    expect(postingDay("2026-08-12", "2026-12")).toEqual({ day: "2027-01-01", late: true });
  });

  it("names the financial year by its last month", () => {
    expect(fiscalYearEnd("2026-02", 2)).toBe("2026-02");
    expect(fiscalYearEnd("2026-03", 2)).toBe("2027-02");
    expect(fiscalYearEnd("2026-12", 12)).toBe("2026-12");
    expect(fiscalYearStart("2027-02")).toBe("2026-03");
  });

  it("finds the SARS VAT period for each category", () => {
    expect(vatPeriodOf("2026-10", "B")).toEqual({ from: "2026-09", to: "2026-10" });
    expect(vatPeriodOf("2026-09", "B")).toEqual({ from: "2026-09", to: "2026-10" });
    expect(vatPeriodOf("2026-10", "A")).toEqual({ from: "2026-10", to: "2026-11" });
    expect(vatPeriodOf("2027-01", "A")).toEqual({ from: "2026-12", to: "2027-01" });
    expect(vatPeriodOf("2026-10", "C")).toEqual({ from: "2026-10", to: "2026-10" });
  });

  it("matches supplier names however they were typed", () => {
    expect(supplierParty("  ACME (Pty)   Ltd ")).toBe(supplierParty("acme (pty) ltd"));
  });
});
