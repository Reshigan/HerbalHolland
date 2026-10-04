import { describe, expect, it } from "vitest";
import { cashRefundAllowed, defaultRefundMethod, isTillManager, refundSplit } from "@/lib/pos-refund";

describe("till refunds", () => {
  it("only managers and owners approve", () => {
    expect(isTillManager("MANAGER")).toBe(true);
    expect(isTillManager("OWNER")).toBe(true);
    expect(isTillManager("BUDTENDER")).toBe(false);
    expect(isTillManager(null)).toBe(false);
  });
  it("splits the money part over the sale's tenders in proportion, adding up exactly", () => {
    const paid = [{ method: "CARD", amountCents: 20000 }, { method: "CASH", amountCents: 10000 }, { method: "VOUCHER", amountCents: 5000 }];
    expect(refundSplit(paid, 9000)).toEqual([{ method: "CARD", cents: 6000 }, { method: "CASH", cents: 3000 }]);
    const odd = refundSplit(paid, 1001);
    expect(odd.reduce((s, p) => s + p.cents, 0)).toBe(1001);
    expect(refundSplit([{ method: "VOUCHER", amountCents: 5000 }], 1000)).toEqual([]);
  });
  it("defaults to the tender that paid most, and keeps cash for cash sales", () => {
    expect(defaultRefundMethod([{ method: "CASH", amountCents: 100 }, { method: "CARD", amountCents: 900 }])).toBe("CARD");
    expect(defaultRefundMethod([{ method: "ACCOUNT", amountCents: 900 }])).toBe("CARD");
    expect(cashRefundAllowed([{ method: "CARD", amountCents: 900 }])).toBe(false);
    expect(cashRefundAllowed([{ method: "CASH", amountCents: 900 }])).toBe(true);
  });
});
