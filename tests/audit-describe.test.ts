import { describe, expect, it } from "vitest";
import { describeAction, describeData } from "@/lib/audit-describe";

describe("audit descriptions", () => {
  it("reads actions as plain English", () => {
    expect(describeAction("trade.account.hold")).toBe("Trade account put on hold");
    expect(describeAction("stockorder.create")).toBe("Stock order created");
    expect(describeAction("sale.refund")).toBe("Sale refunded");
    expect(describeAction("trade.order")).toBe("Trade order");
    expect(describeAction("supplier_invoice.pay")).toBe("Supplier invoice paid");
    expect(describeAction("settings.loyalty")).toBe("Loyalty settings changed");
  });
  it("summarises data with money in rand and no ids", () => {
    expect(describeData({ of: "S-1001", amount: 12500, reason: "Damaged", saleId: "abc" })).toBe("Of: S-1001 · Amount: R125.00 · Reason: Damaged");
    expect(describeData({ priceCents: 9900, royaltyBps: 650 })).toBe("Price: R99.00 · Royalty: 6.5%");
    expect(describeData({ redeemed: 1200, balance: 800 })).toContain("Redeemed: 1,200 pts");
    expect(describeData({ recipients: ["a@x", "b@x", "c@x", "d@x"], active: false })).toBe("Recipients: a@x, b@x, c@x +1 · Active: no");
    expect(describeData(null)).toBe("");
    expect(describeData({ nested: { a: 1 } })).toBe("");
  });
});
