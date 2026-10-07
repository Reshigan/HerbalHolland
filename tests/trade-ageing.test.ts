import { describe, expect, it } from "vitest";
import { AGE_BUCKETS, ageBucket, ageLedger, ageTradeLedger, daysPastDue, sumAgedBalances, type LedgerEntry } from "@/lib/trade-ageing";

const NOW = new Date("2026-10-03T12:00:00+02:00");
const DAY = 86_400_000;
const day = (n: number) => new Date(NOW.getTime() + n * DAY);
let seq = 0;
const inv = (cents: number, dueIn: number, raisedDaysAgo = dueIn - 30, account = "A"): LedgerEntry => ({ tradeAccountId: account, kind: "INVOICE", cents, dueAt: day(dueIn), createdAt: day(-Math.max(0, -raisedDaysAgo) - seq++ / 1000) });
const pay = (cents: number, account = "A"): LedgerEntry => ({ tradeAccountId: account, kind: "PAYMENT", cents: -cents, createdAt: NOW });
const credit = (cents: number, account = "A"): LedgerEntry => ({ tradeAccountId: account, kind: "CREDIT_NOTE", cents: -cents, createdAt: NOW });

describe("trade ageing (FIFO by due date)", () => {
  it("buckets by days past due", () => {
    expect(ageBucket(-5)).toBe("current");
    expect(ageBucket(0)).toBe("current");
    expect(ageBucket(1)).toBe("d30");
    expect(ageBucket(30)).toBe("d30");
    expect(ageBucket(31)).toBe("d60");
    expect(ageBucket(60)).toBe("d60");
    expect(ageBucket(61)).toBe("d90plus");
    expect(ageBucket(91)).toBe("d90plus");
    expect(daysPastDue(day(-45), NOW)).toBe(45);
    expect(daysPastDue(day(10), NOW)).toBe(-10);
    expect(AGE_BUCKETS.map((b) => b.key)).toEqual(["current", "d30", "d60", "d90plus"]);
  });

  it("an invoice not yet due is current; a part-paid overdue one ages for what is left", () => {
    expect(ageLedger([inv(10_000, 10)], NOW)).toMatchObject({ current: 10_000, overdue: 0, total: 10_000, oldestDue: null, daysOverdue: 0, openItems: 1 });
    const b = ageLedger([inv(10_000, -45), pay(4_000)], NOW);
    expect(b).toMatchObject({ current: 0, d30: 0, d60: 6_000, d90plus: 0, overdue: 6_000, total: 6_000, daysOverdue: 45, openItems: 1 });
    expect(b.oldestDue).toBe("2026-08-19");
  });

  it("applies payments and credit notes to the oldest invoice first", () => {
    const b = ageLedger([inv(5_000, -20), inv(10_000, -100), pay(8_000), credit(4_000)], NOW);
    // 12,000 of credit clears the 100-day-old invoice (10,000) and 2,000 of the 20-day-old one.
    expect(b).toMatchObject({ d90plus: 0, d30: 3_000, overdue: 3_000, total: 3_000, daysOverdue: 20, openItems: 1 });
    // The same entries in any order give the same answer.
    expect(ageLedger([credit(4_000), inv(10_000, -100), pay(8_000), inv(5_000, -20)], NOW)).toEqual(b);
  });

  it("an overpayment is a credit balance in current, so the total is still the ledger balance", () => {
    const b = ageLedger([inv(1_000, -10), pay(1_500)], NOW);
    expect(b).toMatchObject({ current: -500, d30: 0, overdue: 0, total: -500, openItems: 0, oldestDue: null });
  });

  it("adjustments count both ways, and anything without a due date is due when raised", () => {
    const up: LedgerEntry = { tradeAccountId: "A", kind: "ADJUSTMENT", cents: 2_000, createdAt: day(-70) };
    const down: LedgerEntry = { tradeAccountId: "A", kind: "ADJUSTMENT", cents: -500, createdAt: NOW };
    const noDue: LedgerEntry = { tradeAccountId: "A", kind: "INVOICE", cents: 3_000, dueAt: null, createdAt: day(-5) };
    const b = ageLedger([up, down, noDue], NOW);
    expect(b).toMatchObject({ d90plus: 1_500, d30: 3_000, overdue: 4_500, total: 4_500, daysOverdue: 70, openItems: 2 });
  });

  it("ages each account on its own and sums them", () => {
    const aged = ageTradeLedger([inv(1_000, 5, 0, "A"), inv(2_000, -35, 0, "B"), pay(500, "B"), inv(4_000, -95, 0, "C")], NOW);
    expect(aged.get("A")).toMatchObject({ current: 1_000, total: 1_000 });
    expect(aged.get("B")).toMatchObject({ d60: 1_500, total: 1_500 });
    expect(aged.get("C")).toMatchObject({ d90plus: 4_000, total: 4_000, daysOverdue: 95 });
    const t = sumAgedBalances(aged.values());
    expect(t).toMatchObject({ current: 1_000, d60: 1_500, d90plus: 4_000, overdue: 5_500, total: 6_500, daysOverdue: 95, openItems: 3 });
    expect(t.oldestDue).toBe(aged.get("C")!.oldestDue);
  });
});
