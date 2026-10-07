import { describe, expect, it } from "vitest";
import { CHART, fiscalYearEnd, fiscalYearStart } from "@/lib/ledger";
import { toCsv } from "@/lib/csv";
import {
  ageBalance, ageBounds, ageDays, ageKey, ageLines, balanceSheetLayout, booksHref, cashFlowClass, cashFlowLayout, csvHead, csvRow, debitCredit, fmtRatio,
  incomeStatementLayout, isCashAccount, isDay, isMonth, keyRatios, lastYearRange, LEDGER_CSV, monthEndLabel, monthLabel, monthRange, param, periodChoices,
  previousRange, rangeLabel, sectionOf, sumAged, vat201Rows, vatInputGroup, vatPeriodChoices, yearToDate, financialYear, type Aged, type ReportAccount,
} from "@/lib/ledger-reports";

// The template chart as report accounts (id = key, or the code for accounts without one).
const ACCOUNTS: ReportAccount[] = CHART.map((r) => ({ id: r.key ?? r.code, code: r.code, name: r.name, type: r.type, key: r.key ?? null, party: r.party ?? null }));
const acc = (id: string) => ACCOUNTS.find((a) => a.id === id)!;

describe("statement sections", () => {
  it("place accounts by type and code range", () => {
    const at = (id: string) => sectionOf(acc(id));
    expect(["sales.pos", "sales.wholesale", "royalty", "breakage", "offers.recovered"].map(at)).toEqual(Array(5).fill("revenue"));
    expect(at("other.income")).toBe("otherIncome");
    expect(["cogs", "stock.loss", "stock.count", "stock.transit"].map(at)).toEqual(Array(4).fill("costOfSales"));
    expect(["exp.RENT", "fees.royalty", "card.fees", "6500", "vat.nonclaimable"].map(at)).toEqual(Array(5).fill("operatingExpenses"));
    expect(["1500", "1510"].map(at)).toEqual(["nonCurrentAssets", "nonCurrentAssets"]);
    expect(["bank", "hq", "franchisees", "stock", "vat.input", "1600"].map(at)).toEqual(Array(6).fill("currentAssets"));
    expect(at("2600")).toBe("nonCurrentLiabilities");
    expect(["creditors", "vat.output", "vat.control", "2500"].map(at)).toEqual(Array(4).fill("currentLiabilities"));
    expect(["capital", "retained", "3200"].map(at)).toEqual(["equity", "equity", "equity"]);
    expect(sectionOf({ type: "INCOME", code: "8100" })).toBe("otherIncome");
    expect(sectionOf({ type: "LIABILITY", code: "2700" })).toBe("nonCurrentLiabilities");
  });
});

// A small set of books: journals as [date, lines by account id]. Balances as at a month are summed from them.
type J = [string, [string, number][]];
const BOOKS: J[] = [
  ["2025-03-01", [["bank", 100_000], ["stock", 40_000], ["capital", -140_000]]],
  ["2025-06-15", [["cash", 11_500], ["sales.pos", -10_000], ["vat.output", -1_500], ["cogs", 4_000], ["stock", -4_000]]],
  ["2025-11-30", [["exp.RENT", 5_000], ["vat.input", 750], ["bank", -5_750]]],
  ["2026-07-10", [["cash", 23_000], ["sales.pos", -20_000], ["vat.output", -3_000], ["cogs", 8_000], ["stock", -8_000]]],
  ["2026-08-05", [["exp.SUPPLIES", 2_000], ["vat.input", 300], ["creditors", -2_300]]],
  ["2026-09-01", [["bank", 50_000], ["2600", -50_000]]],
  ["2026-09-10", [["1500", 30_000], ["vat.input", 4_500], ["bank", -34_500]]],
  ["2026-09-20", [["other.income", -700], ["bank", 700]]],
];
function balancesAsAt(asOf: string, yearEndMonth = 2) {
  const fyStart = fiscalYearStart(fiscalYearEnd(asOf, yearEndMonth));
  const balances = new Map<string, number[]>();
  let priorYears = 0, thisYear = 0;
  for (const [date, lines] of BOOKS) {
    if (date.slice(0, 7) > asOf) continue;
    for (const [id, cents] of lines) {
      const type = acc(id).type;
      if (type === "INCOME" || type === "EXPENSE") {
        if (date.slice(0, 7) < fyStart) priorYears -= cents;
        else thisYear -= cents;
      } else balances.set(id, [(balances.get(id)?.[0] ?? 0) + cents]);
    }
  }
  return { balances, priorYears: [priorYears], thisYear: [thisYear] };
}

describe("income statement", () => {
  it("shows income positive and costs negative, with gross and net profit, dropping empty accounts and sections", () => {
    const balances = new Map<string, number[]>([
      ["sales.pos", [-30_000, -10_000]],
      ["sales.online", [0, 0]],
      ["cogs", [12_000, 4_000]],
      ["other.income", [-700, 0]],
      ["exp.RENT", [5_000, 5_000]],
      ["exp.SUPPLIES", [2_000, 0]],
      ["bank", [99, 99]], // not a P&L account: ignored
    ]);
    const s = incomeStatementLayout(ACCOUNTS, balances, 2);
    expect(s.revenue).toEqual([30_000, 10_000]);
    expect(s.costOfSales).toEqual([-12_000, -4_000]);
    expect(s.grossProfit).toEqual([18_000, 6_000]);
    expect(s.otherIncome).toEqual([700, 0]);
    expect(s.operatingExpenses).toEqual([-7_000, -5_000]);
    expect(s.netProfit).toEqual([11_700, 1_000]);
    expect(s.lines.map((l) => l.key)).toEqual([
      "revenue", "sales.pos", "revenue.total", "costOfSales", "cogs", "costOfSales.total", "grossProfit",
      "otherIncome", "other.income", "otherIncome.total", "operatingExpenses", "exp.RENT", "exp.SUPPLIES", "operatingExpenses.total", "netProfit",
    ]);
    const empty = incomeStatementLayout(ACCOUNTS, new Map(), 1);
    expect(empty.lines.map((l) => l.key)).toEqual(["grossProfit", "netProfit"]);
    expect(empty.netProfit).toEqual([0]);
    expect(Object.is(empty.netProfit[0], -0)).toBe(false);
  });
});

describe("balance sheet", () => {
  it("balances, with earlier years' profit in retained earnings and this year's as profit so far", () => {
    // As at October 2026 (year end February): FY2026's profit (R10,000 − R4,000 − R5,000 = R1,000) is retained.
    const { balances, priorYears, thisYear } = balancesAsAt("2026-10");
    expect(priorYears).toEqual([1_000]);
    expect(thisYear).toEqual([20_000 - 8_000 - 2_000 + 700]);
    const bs = balanceSheetLayout(ACCOUNTS, balances, 1, { priorYears, thisYear });
    expect(bs.difference).toEqual([0]);
    expect(bs.assets).toEqual(bs.liabilities.map((l, i) => l + bs.equity[i]));
    const retained = bs.lines.find((l) => l.key === "retained");
    expect(retained).toMatchObject({ kind: "account", values: [1_000], note: "Includes the profit of earlier financial years" });
    expect(bs.lines.find((l) => l.key === "profitThisYear")).toMatchObject({ kind: "item", label: "Profit for the year so far", values: [10_700] });
    expect(bs.nonCurrentAssets).toEqual([30_000]);
    expect(bs.nonCurrentLiabilities).toEqual([50_000]);
    expect(bs.currentLiabilities).toEqual([1_500 + 3_000 + 2_300]);
    // A year earlier, the same books balance with nothing retained yet.
    const before = balancesAsAt("2025-12");
    expect(before.priorYears).toEqual([0]);
    expect(balanceSheetLayout(ACCOUNTS, before.balances, 1, before).difference).toEqual([0]);
  });

  it("names the difference for a slice that needn't balance on its own", () => {
    const balances = new Map([["cash", [5_000]], ["vat.output", [-600]]]);
    const off = balanceSheetLayout(ACCOUNTS, balances, 1, { priorYears: [0], thisYear: [4_000] });
    expect(off.difference).toEqual([400]);
    const store = balanceSheetLayout(ACCOUNTS, balances, 1, { priorYears: [0], thisYear: [4_000] }, "Funded by the rest of the company");
    expect(store.difference).toEqual([0]);
    expect(store.lines.find((l) => l.key === "balancing")).toMatchObject({ values: [400] });
  });
});

describe("cash flow", () => {
  it("classifies by the counter-account and recognises cash accounts", () => {
    expect(cashFlowClass(acc("1500"))).toBe("investing");
    expect(cashFlowClass(acc("2600"))).toBe("financing");
    expect(cashFlowClass(acc("capital"))).toBe("financing");
    expect(cashFlowClass(acc("3200"))).toBe("financing");
    expect(["sales.pos", "vat.output", "creditors", "exp.RENT", "hq", "stock"].map((id) => cashFlowClass(acc(id)))).toEqual(Array(6).fill("operating"));
    expect(["bank", "cash", "card", "gateway"].every((k) => isCashAccount(acc(k)))).toBe(true);
    expect(isCashAccount(acc("hq"))).toBe(false);
    expect(isCashAccount({ id: "acc_fnb", key: null }, new Set(["acc_fnb"]))).toBe(true);
  });

  it("ties the flows to the change in cash, naming what moved against lines outside the view", () => {
    const flows = [
      { account: acc("sales.pos"), values: [20_000] },
      { account: acc("vat.output"), values: [3_000] },
      { account: acc("exp.RENT"), values: [-5_000] },
      { account: acc("1500"), values: [-30_000] },
      { account: acc("2600"), values: [50_000] },
    ];
    const cf = cashFlowLayout(flows, [10_000], [48_000], 1);
    expect(cf).toMatchObject({ operating: [18_000], investing: [-30_000], financing: [50_000], net: [38_000], other: [0] });
    expect(cf.lines.filter((l) => l.kind === "section").map((l) => l.key)).toEqual(["operating", "investing", "financing"]);
    // Receipts and payments read first, then working capital.
    expect(cf.lines.slice(1, 4).map((l) => l.key)).toEqual(["sales.pos", "exp.RENT", "vat.output"]);
    const store = cashFlowLayout(flows, [10_000], [40_000], 1);
    expect(store.other).toEqual([-8_000]);
    expect(store.net).toEqual([30_000]);
    expect(store.lines.find((l) => l.key === "other")).toMatchObject({ label: "Moved to or from the company's other accounts", values: [-8_000] });
  });
});

describe("ageing", () => {
  const asOf = "2026-10-05";
  const day = (n: number) => new Date(Date.parse(`${asOf}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

  // Credits settle the oldest debits first; what's left open is bucketed by its own date.
  function naiveFifo(lines: { date: string; cents: number }[], on: string): Aged {
    const seen = lines.filter((l) => l.date <= on);
    const balance = seen.reduce((s, l) => s + l.cents, 0);
    const sign = balance < 0 ? -1 : 1;
    const items = seen.filter((l) => sign * l.cents > 0).map((l) => ({ date: l.date, left: sign * l.cents })).sort((a, b) => a.date.localeCompare(b.date));
    let credit = seen.filter((l) => sign * l.cents < 0).reduce((s, l) => s - sign * l.cents, 0);
    for (const it of items) {
      const take = Math.min(credit, it.left);
      it.left -= take;
      credit -= take;
    }
    const out: Aged = { current: 0, d30: 0, d60: 0, d90plus: 0, total: balance };
    for (const it of items) if (it.left > 0) out[ageKey(ageDays(it.date, on))] += sign * it.left;
    return out;
  }

  it("buckets by age: up to 30 days current, then 31–60, 61–90 and over 90", () => {
    expect([0, 30, 31, 60, 61, 90, 91, 400].map(ageKey)).toEqual(["current", "current", "d30", "d30", "d60", "d60", "d90plus", "d90plus"]);
    expect(ageDays("2026-09-05", asOf)).toBe(30);
    expect(ageBounds(asOf)).toEqual({ current: "2026-09-05", d30: "2026-08-06", d60: "2026-07-07" });
  });

  it("applies credits to the oldest debits first", () => {
    // R1,150 invoiced 126 days ago, R2,300 61 days ago, R1,150 5 days ago; R1,000 paid last week.
    const lines = [{ date: day(126), cents: 1_150 }, { date: day(61), cents: 2_300 }, { date: day(5), cents: 1_150 }, { date: day(7), cents: -1_000 }];
    expect(ageLines(lines, asOf)).toEqual({ current: 1_150, d30: 0, d60: 2_300, d90plus: 150, total: 3_600 });
    // Lines after the date don't count yet.
    expect(ageLines([...lines, { date: "2026-10-06", cents: -3_600 }], asOf).total).toBe(3_600);
    expect(ageLines([], asOf)).toEqual({ current: 0, d30: 0, d60: 0, d90plus: 0, total: 0 });
  });

  it("ages an overpayment from the newest credits, as a negative balance", () => {
    expect(ageLines([{ date: day(100), cents: 1_000 }, { date: day(45), cents: -1_500 }, { date: day(2), cents: -200 }], asOf)).toEqual({ current: -200, d30: -500, d60: 0, d90plus: 0, total: -700 });
    expect(ageBalance(-700, { current: 0, d30: 0, d60: 0 }, { current: 200, d30: 100, d60: 0 })).toEqual({ current: -200, d30: -100, d60: 0, d90plus: -400, total: -700 });
  });

  it("agrees with line-by-line FIFO on random ledgers", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 300; n++) {
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => ({ date: day(Math.floor(rnd() * 220) - 10), cents: Math.round((rnd() - 0.4) * 50_000) }));
      expect(ageLines(lines, asOf)).toEqual(naiveFifo(lines, asOf));
    }
  });

  it("sums aged balances", () => {
    expect(sumAged([{ current: 1, d30: 2, d60: 3, d90plus: 4, total: 10 }, { current: -1, d30: 0, d60: 0, d90plus: 5, total: 4 }])).toEqual({ current: 0, d30: 2, d60: 3, d90plus: 9, total: 14 });
  });
});

describe("VAT201", () => {
  it("puts each journal's input tax on its VAT201 line", () => {
    expect(vatInputGroup("statement")).toBe("fees");
    expect(vatInputGroup("stock-receive")).toBe("stock");
    expect(vatInputGroup("stock-ship")).toBe("stock");
    expect(vatInputGroup("supplier-invoice", { stock: true })).toBe("stock");
    expect(vatInputGroup("supplier-invoice")).toBe("expenses");
    expect(vatInputGroup("expense")).toBe("expenses");
    expect(vatInputGroup("manual")).toBe("other");
    expect(vatInputGroup("manual", { capital: true })).toBe("capital");
    expect(vatInputGroup("supplier-invoice", { capital: true, stock: true })).toBe("capital");
  });

  it("lays out the working with the VAT201 fields, payable or refundable", () => {
    const rows = vat201Rows({ suppliesInclCents: 34_500, outputCents: 4_500, input: { stock: 0, expenses: 300, fees: 270 } });
    expect(rows.map((r) => [r.field ?? "", r.vat ?? null])).toEqual([
      ["", null], ["1 · 4", 4_500], ["", null], ["15", 0], ["15", 300], ["15", 270], ["19", 570], ["20", 3_930],
    ]);
    expect(rows[1]).toMatchObject({ amount: 34_500 });
    expect(rows.at(-1)!.line).toBe("VAT payable to SARS");
    const refund = vat201Rows({ suppliesInclCents: 0, outputCents: 0, input: { capital: 4_500, expenses: 150 } });
    expect(refund.map((r) => r.field ?? "")).toEqual(["", "1 · 4", "", "14", "15", "15", "15", "19", "20"]);
    expect(refund.at(-1)).toMatchObject({ line: "VAT refundable by SARS", vat: 4_650, style: "strong" });
  });
});

describe("ranges of months", () => {
  it("read ?from=&to= safely, in order and at most three years", () => {
    const fb = { from: "2026-03", to: "2026-10" };
    expect(monthRange({}, fb)).toEqual(fb);
    expect(monthRange({ from: "2026-13", to: "nope" }, fb)).toEqual(fb);
    expect(monthRange({ from: "2026-08", to: "2026-05" }, fb)).toEqual({ from: "2026-05", to: "2026-08" });
    expect(monthRange({ from: "2020-01", to: "2026-10" }, fb)).toEqual({ from: "2023-11", to: "2026-10" });
    expect([isMonth("2026-02"), isMonth("2026-2"), isDay("2026-02-28"), isDay("2026-02-30"), isDay("2026-10-05")]).toEqual([true, false, true, false, true]);
    expect([param(["a", "b"]), param(""), param(undefined)]).toEqual(["a", undefined, undefined]);
  });

  it("compare with the period before, a year earlier, and the financial year", () => {
    expect(previousRange({ from: "2026-03", to: "2026-05" })).toEqual({ from: "2025-12", to: "2026-02" });
    expect(lastYearRange({ from: "2026-03", to: "2026-05" })).toEqual({ from: "2025-03", to: "2025-05" });
    expect(yearToDate("2026-10", 2)).toEqual({ from: "2026-03", to: "2026-10" });
    expect(yearToDate("2026-02", 2)).toEqual({ from: "2025-03", to: "2026-02" });
    expect(financialYear("2026-10", 6)).toEqual({ from: "2026-07", to: "2027-06" });
  });

  it("label months and ranges", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("2026-10", true)).toBe("Oct 2026");
    expect(monthEndLabel("2028-02")).toBe("29 February 2028");
    expect(rangeLabel({ from: "2026-10", to: "2026-10" })).toBe("October 2026");
    expect(rangeLabel({ from: "2026-03", to: "2026-10" })).toBe("March – October 2026");
    expect(rangeLabel({ from: "2025-11", to: "2026-02" })).toBe("Nov 2025 – Feb 2026");
  });

  it("offer months, financial quarters and years", () => {
    const c = periodChoices("2026-10", 2);
    expect(c.filter((x) => x.group === "Months")).toHaveLength(12);
    expect(c[0]).toEqual({ group: "Months", label: "October 2026 (so far)", from: "2026-10", to: "2026-10" });
    expect(c.filter((x) => x.group === "Quarters").map((x) => [x.from, x.to])).toEqual([
      ["2026-09", "2026-10"], ["2026-06", "2026-08"], ["2026-03", "2026-05"], ["2025-12", "2026-02"], ["2025-09", "2025-11"], ["2025-06", "2025-08"], ["2025-03", "2025-05"],
    ]);
    expect(c.find((x) => x.from === "2026-09" && x.group === "Quarters")?.label).toBe("September – November 2026 (so far)");
    expect(c.filter((x) => x.group === "Financial years").map((x) => [x.label, x.from, x.to])).toEqual([
      ["This financial year (to Oct 2026)", "2026-03", "2026-10"],
      ["Year ended 28 February 2026", "2025-03", "2026-02"],
      ["Year ended 28 February 2025", "2024-03", "2025-02"],
      ["Year ended 29 February 2024", "2023-03", "2024-02"],
    ]);
  });

  it("list VAT periods by category, newest first", () => {
    expect(vatPeriodChoices("2026-10", "B", 3).map((p) => [p.from, p.to, p.label])).toEqual([
      ["2026-09", "2026-10", "September – October 2026"], ["2026-07", "2026-08", "July – August 2026"], ["2026-05", "2026-06", "May – June 2026"],
    ]);
    expect(vatPeriodChoices("2026-10", "A", 2).map((p) => [p.from, p.to])).toEqual([["2026-10", "2026-11"], ["2026-08", "2026-09"]]);
    expect(vatPeriodChoices("2026-01", "C", 2).map((p) => [p.from, p.to])).toEqual([["2026-01", "2026-01"], ["2025-12", "2025-12"]]);
  });
});

describe("key ratios", () => {
  it("divide safely and format", () => {
    const r = keyRatios({ revenue: 100_000, grossProfit: 40_000, netProfit: 10_000, operatingExpenses: -30_000, currentAssets: 50_000, currentLiabilities: 25_000, stock: 20_000, liabilities: 60_000, equity: 40_000 });
    expect(Object.fromEntries(r.map((x) => [x.key, fmtRatio(x)]))).toEqual({
      grossMargin: "40.0%", netMargin: "10.0%", expenseRatio: "30.0%", currentRatio: "2.00×", quickRatio: "1.20×", debtToEquity: "1.50×",
    });
    const none = keyRatios({ revenue: 0, grossProfit: 0, netProfit: -5, operatingExpenses: -5, currentAssets: 10, currentLiabilities: 0, stock: 0, liabilities: 10, equity: -10 });
    expect(none.map(fmtRatio)).toEqual(["—", "—", "—", "—", "—", "—"]);
  });
});

describe("links and CSV", () => {
  it("builds books links and debit/credit columns", () => {
    expect(booksHref("c1", "reports/ledger", { account: "a1", from: "2026-03", store: null, party: "" })).toBe("/books/c1/reports/ledger?account=a1&from=2026-03");
    expect(booksHref("c1", "")).toBe("/books/c1");
    expect(debitCredit(500)).toEqual({ debit: 500, credit: null });
    expect(debitCredit(-500)).toEqual({ debit: null, credit: 500 });
  });

  it("encodes rows exactly as toCsv does, ready to stream", () => {
    const rows = [
      { date: "2026-10-01", number: 12, source: "Manual journal", memo: '=HYPERLINK("x"), "quoted"', store: "TST01", party: null, debit: 123_456, credit: null, balance: -50 },
      { date: new Date("2026-10-02T00:00:00Z"), number: 13, source: "Trading day", memo: "Line\nbreak", store: "", party: "acme", debit: null, credit: 99, balance: -149 },
    ];
    expect(csvHead(LEDGER_CSV) + rows.map((r) => csvRow(LEDGER_CSV, r)).join("")).toBe(toCsv({ columns: LEDGER_CSV, rows }, { bom: false }));
    expect(csvRow(LEDGER_CSV, rows[0])).toBe(`2026-10-01,12,Manual journal,"'=HYPERLINK(""x""), ""quoted""",TST01,,1234.56,,-0.50\r\n`);
  });
});
