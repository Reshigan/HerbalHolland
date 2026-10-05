import { describe, expect, it } from "vitest";
import {
  HQ_POINT_KINDS, onlinePaymentLines, orderCancelledAt, orderPaidAt, pointsLines, POINTS_SOURCE_KINDS, statementLines, statementOutstanding, statementPaymentLines, tradeEftLines,
  tradeEntryLines, voucherLines,
} from "@/lib/ledger-hq";
import { isBalanced, sumCents, type Line } from "@/lib/ledger";
import { buildStatement } from "@/lib/statement";

const amount = (lines: Line[], key: string, partyId?: string) => sumCents(lines.filter((l) => l.key === key && (partyId === undefined || l.partyId === partyId)));

describe("franchise statement", () => {
  // R12,000 net sales (R2,000 of them online) at 6% / 2% / 10%, 500 points issued, R100 of My Deals.
  const st = buildStatement({
    netSalesExVatCents: 1_200_000, onlineSalesExVatCents: 200_000, onlineCollectedCents: 0, pointsIssuedCents: 50_000, pointsRedeemedCents: 0, offersFundedCents: 10_000,
    wholesaleCents: 0, networkSoldCents: 0, networkBoughtCents: 0, royaltyBps: 600, levyBps: 200, ecomBps: 1000,
  });
  const figures = { royalty: st.royalty, levy: st.levy, ecom: st.ecom, feesVat: st.feesVat, pointsIssuedCents: 50_000, offersFundedCents: 10_000, storeId: "s1", franchiseeId: "co1" };

  it("posts the fees, VAT, points and My Deals in both books, each balanced, the current accounts mirroring each other", () => {
    const { franchisee, hq } = statementLines(figures, { franchisee: true, hq: true });
    expect(isBalanced(franchisee) && isBalanced(hq)).toBe(true);
    expect(franchisee.every((l) => l.storeId === "s1")).toBe(true);
    expect(hq.every((l) => l.storeId === "s1")).toBe(true);
    expect([amount(franchisee, "fees.royalty"), amount(franchisee, "fees.levy"), amount(franchisee, "fees.ecom"), amount(franchisee, "vat.input")]).toEqual([72_000, 24_000, 20_000, 17_400]);
    expect([amount(franchisee, "points.issued"), amount(franchisee, "offers.recovered")]).toEqual([50_000, -10_000]);
    // The current account moves by exactly the statement's own lines: −fees − VAT − points + My Deals.
    expect(amount(franchisee, "hq")).toBe(10_000 - 133_400 - 50_000);
    expect(amount(hq, "franchisees", "co1")).toBe(-amount(franchisee, "hq"));
    expect([amount(hq, "royalty"), amount(hq, "levy"), amount(hq, "ecom"), amount(hq, "vat.output"), amount(hq, "points"), amount(hq, "offers.funded")]).toEqual([-72_000, -24_000, -20_000, -17_400, -50_000, 10_000]);
  });

  it("keeps a non-vendor's VAT on fees as a cost, and treats VAT a non-vendor HQ charged as income", () => {
    const nonVendor = statementLines(figures, { franchisee: false, hq: true });
    expect(amount(nonVendor.franchisee, "vat.input")).toBe(0);
    expect(amount(nonVendor.franchisee, "vat.nonclaimable")).toBe(17_400);
    expect(amount(nonVendor.hq, "vat.output")).toBe(-17_400);
    const hqNot = statementLines(figures, { franchisee: true, hq: false });
    expect(amount(hqNot.franchisee, "vat.nonclaimable")).toBe(17_400);
    expect(amount(hqNot.hq, "vat.output")).toBe(0);
    expect(amount(hqNot.hq, "other.income")).toBe(-17_400);
    expect(isBalanced(nonVendor.franchisee) && isBalanced(hqNot.hq)).toBe(true);
  });

  it("drops what's zero and handles a month of refunds (negative fees)", () => {
    const quiet = statementLines({ ...figures, royalty: 0, levy: 0, ecom: 0, feesVat: 0, pointsIssuedCents: 0, offersFundedCents: 0 }, { franchisee: true, hq: true });
    expect(quiet).toEqual({ franchisee: [], hq: [] });
    const back = statementLines({ ...figures, royalty: -600, levy: -200, ecom: 0, feesVat: -120, pointsIssuedCents: -500, offersFundedCents: 0 }, { franchisee: true, hq: true });
    expect(amount(back.franchisee, "hq")).toBe(1_420);
    expect(amount(back.hq, "franchisees")).toBe(-1_420);
    expect(isBalanced(back.franchisee) && isBalanced(back.hq)).toBe(true);
  });

  it("settles with payments either way, and knows what's still outstanding", () => {
    const paid = statementPaymentLines({ amountCents: 173_400, storeId: "s1", franchiseeId: "co1" });
    expect(paid.franchisee).toEqual([
      { key: "hq", cents: 173_400, storeId: "s1", partyId: null },
      { key: "bank", cents: -173_400, storeId: "s1", partyId: null },
    ]);
    expect(paid.hq).toEqual([
      { key: "bank", cents: 173_400, storeId: "s1", partyId: null },
      { key: "franchisees", cents: -173_400, storeId: "s1", partyId: "co1" },
    ]);
    const hqPaid = statementPaymentLines({ amountCents: -5_000, storeId: "s1", franchiseeId: "co1" });
    expect(amount(hqPaid.franchisee, "bank")).toBe(5_000);
    expect(amount(hqPaid.hq, "franchisees", "co1")).toBe(5_000);
    // A statement where the store owes HQ R1,734 (net −173,400): paid in full, part-paid, overpaid; and one where HQ pays.
    expect(statementOutstanding(-173_400, [{ amountCents: 173_400 }])).toBe(0);
    expect(statementOutstanding(-173_400, [{ amountCents: 100_000 }])).toBe(-73_400);
    expect(statementOutstanding(-173_400, [{ amountCents: 200_000 }])).toBe(26_600);
    expect(statementOutstanding(50_000, [{ amountCents: -50_000 }])).toBe(0);
    expect(statementOutstanding(50_000, [])).toBe(50_000);
  });
});

describe("online payments and gift vouchers", () => {
  it("holds online money as prepaid until the store fulfils the order, and takes a refund back out", () => {
    expect(onlinePaymentLines(22_900, "s1")).toEqual([
      { key: "gateway", cents: 22_900, storeId: "s1", partyId: null },
      { key: "prepaid", cents: -22_900, storeId: "s1", partyId: null },
    ]);
    expect(onlinePaymentLines(-22_900, "s1")).toEqual([
      { key: "prepaid", cents: 22_900, storeId: "s1", partyId: null },
      { key: "gateway", cents: -22_900, storeId: "s1", partyId: null },
    ]);
    expect(onlinePaymentLines(0)).toEqual([]);
  });

  it("sells a voucher into the liability and expires what's left of it as breakage", () => {
    const sold = voucherLines({ soldCents: 50_000 });
    expect([amount(sold, "gateway"), amount(sold, "vouchers")]).toEqual([50_000, -50_000]);
    const expired = voucherLines({ expiredCents: 12_500 });
    expect([amount(expired, "vouchers"), amount(expired, "breakage")]).toEqual([12_500, -12_500]);
    expect(isBalanced(sold) && isBalanced(expired)).toBe(true);
    expect(voucherLines({ expiredCents: 0 })).toEqual([]);
  });

  it("dates an online payment when the order left PENDING_PAYMENT (placed paid: when it was placed), and a cancellation by its event", () => {
    const created = new Date("2026-09-30T21:50:00Z");
    const events = [
      { status: "PENDING_PAYMENT", at: "2026-09-30T21:50:00.000Z" },
      { status: "PLACED", at: "2026-09-30T22:10:00.000Z" }, // 00:10 SAST on 1 October
      { status: "CANCELLED", at: "2026-10-02T08:00:00.000Z" },
    ];
    expect(orderPaidAt(events, created).toISOString()).toBe("2026-09-30T22:10:00.000Z");
    expect(orderPaidAt([{ status: "PLACED", at: "2026-09-30T21:50:00.000Z" }], created)).toBe(created);
    expect(orderPaidAt([{ status: "PENDING_PAYMENT", at: "2026-09-30T21:50:00.000Z" }, { status: "COMPLETED", at: "2026-09-30T21:55:00.000Z" }], created).toISOString()).toBe("2026-09-30T21:55:00.000Z");
    expect(orderCancelledAt(events)?.toISOString()).toBe("2026-10-02T08:00:00.000Z");
    expect(orderCancelledAt(events.slice(0, 2))).toBeNull();
  });
});

describe("points and the trade ledger", () => {
  it("charges points HQ gives (and its own stores issue) to HQ, and expires forfeited points as breakage", () => {
    expect(HQ_POINT_KINDS).not.toContain("EARN");
    expect(POINTS_SOURCE_KINDS).toEqual([...HQ_POINT_KINDS, "EXPIRE"]);
    const day = pointsLines({ givenCents: 7_000, expiredCents: 3_000, ownStores: [{ storeId: "dc", cents: 4_000 }] });
    expect(isBalanced(day)).toBe(true);
    expect(amount(day, "points.hq")).toBe(11_000);
    expect(amount(day, "breakage")).toBe(-3_000);
    expect(amount(day, "points")).toBe(-11_000 + 3_000);
    expect(day.filter((l) => l.storeId === "dc").map((l) => [l.key, l.cents])).toEqual([["points.hq", 4_000], ["points", -4_000]]);
    expect(pointsLines({ givenCents: 0, expiredCents: 0 })).toEqual([]);
  });

  it("mirrors payments, credit notes and adjustments on the account's debtor, and leaves invoices to the store's day", () => {
    expect(tradeEntryLines({ kind: "PAYMENT", cents: -100_000, tradeAccountId: "ta1" })).toEqual([
      { key: "bank", cents: 100_000, storeId: null, partyId: null },
      { key: "debtors", cents: -100_000, storeId: null, partyId: "ta1" },
    ]);
    expect(tradeEntryLines({ kind: "CREDIT_NOTE", cents: -5_000, tradeAccountId: "ta1" })).toEqual([
      { key: "bad.debts", cents: 5_000, storeId: null, partyId: null },
      { key: "debtors", cents: -5_000, storeId: null, partyId: "ta1" },
    ]);
    const up = tradeEntryLines({ kind: "ADJUSTMENT", cents: 2_500, tradeAccountId: "ta1" });
    expect([amount(up, "debtors", "ta1"), amount(up, "bad.debts")]).toEqual([2_500, -2_500]);
    expect(tradeEntryLines({ kind: "INVOICE", cents: 336_000, tradeAccountId: "ta1" })).toEqual([]);
    const eft = tradeEftLines(386_400, "dc");
    expect([amount(eft, "bank"), amount(eft, "prepaid")]).toEqual([386_400, -386_400]);
    expect(isBalanced(tradeEftLines(-386_400, "dc"))).toBe(true);
  });
});
