import { describe, expect, it } from "vitest";
import { backHowTheyPaid, cashLeft, describeRefund, isTillManager, lineShare, moneyPartsOf, pointsBack, refundSplit, type MoneyPart } from "@/lib/pos-refund";

const part = (method: MoneyPart["method"], paidCents: number, refundedCents = 0, cardLast4: string | null = null): MoneyPart => ({ method, paidCents, refundedCents, cardLast4 });
const sum = (xs: { cents: number }[]) => xs.reduce((s, x) => s + x.cents, 0);

describe("till refunds", () => {
  it("only managers and owners approve", () => {
    expect(isTillManager("MANAGER")).toBe(true);
    expect(isTillManager("OWNER")).toBe(true);
    expect(isTillManager("BUDTENDER")).toBe(false);
    expect(isTillManager(null)).toBe(false);
  });

  it("reads the sale's money tenders: per method in tender order, net of earlier refunds, the card when one card paid", () => {
    const parts = moneyPartsOf({
      payments: [
        { method: "VOUCHER", amountCents: 5000 },
        { method: "CASH", amountCents: 10000 },
        { method: "CARD", amountCents: 20000, cardLast4: "0005" },
        { method: "CARD", amountCents: 9000, cardLast4: "0005" },
        { method: "LOYALTY", amountCents: 3000 },
        { method: "ACCOUNT", amountCents: 7000 },
      ],
      refunds: [{ payments: [{ method: "CASH", amountCents: -4000 }, { method: "VOUCHER", amountCents: -5000 }, { method: "EFT", amountCents: -100 }] }],
    });
    expect(parts).toEqual([part("CASH", 10000, 4000), part("CARD", 29000, 0, "0005")]); // an EFT refund on a sale EFT never paid is no part
    expect(moneyPartsOf({ payments: [{ method: "CARD", amountCents: 100, cardLast4: "1111" }, { method: "CARD", amountCents: 100, cardLast4: "2222" }] })[0].cardLast4).toBeNull();
  });

  it("splits back how they paid in proportion to what each tender has left, adding up exactly", () => {
    expect(refundSplit([part("CARD", 20000), part("CASH", 10000)], 9000)).toEqual({ parts: [{ method: "CARD", cents: 6000, cardLast4: null }, { method: "CASH", cents: 3000, cardLast4: null }], overCents: 0 });
    // Net of earlier refunds: the card has R50 left to give back, the cash R100.
    expect(refundSplit([part("CARD", 20000, 15000), part("CASH", 10000)], 6000).parts.map((p) => [p.method, p.cents])).toEqual([["CARD", 2000], ["CASH", 4000]]);
    // R100 cash and R290 on the card ending 0005, all of it back.
    const all = refundSplit([part("CASH", 10000), part("CARD", 29000, 0, "0005")], 39000);
    expect(describeRefund(all.parts)).toBe("R100.00 cash · R290.00 to the card ending 0005");
    expect(describeRefund([{ method: "PAYSHAP", cents: 150, cardLast4: null }, { method: "EFT", cents: 99, cardLast4: null }, { method: "CARD", cents: 1, cardLast4: null }])).toBe("R1.50 by PayShap · R0.99 by EFT · R0.01 to the card");
  });

  it("puts the odd cent on the largest tender", () => {
    // R10.01 over R100 cash and R290 card: 256.67c and 744.33c round down to 256 + 744; the odd cent goes to the card.
    const s = refundSplit([part("CASH", 10000), part("CARD", 29000)], 1001);
    expect(s.parts.map((p) => [p.method, p.cents])).toEqual([["CASH", 256], ["CARD", 745]]);
    expect(sum(s.parts)).toBe(1001);
    // Odd amounts over many tenders always add up.
    for (const cents of [1, 7, 333, 1001, 99_999]) expect(sum(refundSplit([part("CASH", 33_333), part("CARD", 33_333), part("EFT", 33_334)], cents).parts)).toBe(cents);
  });

  it("never gives more back on a tender than it paid less earlier refunds", () => {
    // Three tenders with 3c left each and 8c to give: the odd cents go largest-first, but never past what's left.
    const s = refundSplit([part("CASH", 3), part("CARD", 3), part("EFT", 3)], 8);
    expect(s.parts.map((p) => p.cents)).toEqual([3, 3, 2]);
    for (const p of s.parts) expect(p.cents).toBeLessThanOrEqual(3);
    // More than the tenders have left: each gives back what it has; the rest is over (rounding, older refunds).
    const over = refundSplit([part("CASH", 10000, 9000), part("CARD", 5000, 5000)], 1500);
    expect(over).toEqual({ parts: [{ method: "CASH", cents: 1000, cardLast4: null }], overCents: 500 });
    expect(refundSplit([], 1000)).toEqual({ parts: [], overCents: 1000 }); // vouchers and points only: no money tender
    expect(refundSplit([part("CASH", 1000)], 0)).toEqual({ parts: [], overCents: 0 });
  });

  it("posts any cents left over on the tender that paid most, and needs a manager's choice when no money paid", () => {
    expect(backHowTheyPaid([part("CASH", 10000, 10000), part("CARD", 29000, 28950, "0005")], 75)).toEqual([{ method: "CARD", cents: 75, cardLast4: "0005" }]);
    expect(backHowTheyPaid([part("CASH", 10000, 10000), part("CARD", 2000, 2000)], 40)).toEqual([{ method: "CASH", cents: 40, cardLast4: null }]);
    expect(backHowTheyPaid([], 33)).toBeNull();
    expect(backHowTheyPaid([], 0)).toEqual([]);
  });

  it("knows how much cash is left to give back", () => {
    expect(cashLeft([part("CASH", 10000, 2500), part("CARD", 5000)])).toBe(7500);
    expect(cashLeft([part("CARD", 5000)])).toBe(0);
  });

  it("refunds a line in parts to exactly what was paid for it", () => {
    // Two units on a R10.01 line: the first back is R5.01 (rounded), the last what's left, R5.00.
    expect(lineShare(1001, 2, 1, 0, 0)).toBe(501);
    expect(lineShare(1001, 2, 1, 1, 501)).toBe(500);
    expect(lineShare(1001, 2, 2, 0, 0)).toBe(1001);
    expect(lineShare(3000, 3, 1, 0, 0)).toBe(1000);
  });

  it("returns points in proportion to what's been refunded so far, every point paid by the last refund", () => {
    // R100: 30 points + R70 cash, refunded in three goes (R33.33, R33.33, R33.34).
    const a = { loyaltyPaidCents: 3000, totalCents: 10000 };
    const first = pointsBack({ ...a, loyaltyBackCents: 0, refundedCents: 0, amountCents: 3333 });
    const second = pointsBack({ ...a, loyaltyBackCents: first, refundedCents: 3333, amountCents: 3333 });
    const third = pointsBack({ ...a, loyaltyBackCents: first + second, refundedCents: 6666, amountCents: 3334 });
    expect([first, second, third]).toEqual([900, 1000, 1100]);
    expect(3333 - first + (3333 - second) + (3334 - third)).toBe(7000); // the money parts add up to the cash paid
    expect(pointsBack({ ...a, loyaltyBackCents: 3000, refundedCents: 10000, amountCents: 500 })).toBe(0); // never more than paid
    expect(pointsBack({ loyaltyPaidCents: 0, loyaltyBackCents: 0, totalCents: 10000, refundedCents: 0, amountCents: 10000 })).toBe(0);
  });
});
