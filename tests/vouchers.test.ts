// Gift voucher rules: codes, the three-year validity (CPA s63), and when a voucher can pay.
import { describe, expect, it } from "vitest";
import { allocateRefund, allocateRefundAcross, makeVoucherCode, normaliseVoucherCode, voucherApply, voucherCodeFrom, voucherExpiry, voucherProblem, voucherSku, isVoucherSku, VOUCHER_AMOUNTS_CENTS } from "@/lib/vouchers";

describe("voucher codes", () => {
  it("are HH-XXXX-XXXX-XXXX without confusable characters, and normalise from how people type them", () => {
    let i = 0;
    const code = makeVoucherCode(() => ((i += 7) % 32) / 32);
    expect(code).toMatch(/^HH-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normaliseVoucherCode(code.toLowerCase().replace(/-/g, " "))).toBe(code);
    expect(normaliseVoucherCode("HH K7PM 3QXR 9ZAB")).toBe("HH-K7PM-3QXR-9ZAB");
    expect(normaliseVoucherCode("SUMMER20")).toBeNull();
    expect(normaliseVoucherCode("")).toBeNull();
  });
  it("name the virtual product's SKUs by amount", () => {
    expect(VOUCHER_AMOUNTS_CENTS.map(voucherSku)).toEqual(["GIFT-200", "GIFT-500", "GIFT-1000"]);
    expect(isVoucherSku("GIFT-500")).toBe(true);
    expect(isVoucherSku("WEL-OIL-30")).toBe(false);
  });
});

describe("validity", () => {
  it("is three years from issue, to the end of that day in South Africa", () => {
    expect(voucherExpiry(new Date("2026-09-29T22:30:00Z")).toISOString()).toBe("2029-09-30T21:59:59.000Z"); // 00:30 SAST on the 30th → 30 Sep 2029 23:59:59 SAST
    expect(voucherExpiry(new Date("2026-02-28T10:00:00Z")).toISOString()).toBe("2029-02-28T21:59:59.000Z");
  });
  it("says why a voucher can't pay", () => {
    const now = new Date("2026-09-29T10:00:00Z");
    const ok = { status: "ACTIVE" as const, balanceCents: 5_000, expiresAt: new Date("2029-09-29T21:59:59Z") };
    expect(voucherProblem(ok, now)).toBeNull();
    expect(voucherProblem(null, now)).toMatch(/don't recognise/);
    expect(voucherProblem({ ...ok, status: "PENDING" }, now)).toMatch(/hasn't been paid/);
    expect(voucherProblem({ ...ok, status: "CANCELLED" }, now)).toMatch(/cancelled/);
    expect(voucherProblem({ ...ok, expiresAt: new Date("2026-09-01T00:00:00Z") }, now, () => "1 Sep 2026")).toBe("That voucher expired on 1 Sep 2026.");
    expect(voucherProblem({ ...ok, balanceCents: 0 }, now)).toMatch(/used up/);
    expect(voucherProblem({ ...ok, status: "REDEEMED" }, now)).toMatch(/used up/);
  });
  it("applies no more than the balance or the amount due", () => {
    expect(voucherApply(50_000, 32_900)).toBe(32_900);
    expect(voucherApply(5_000, 32_900)).toBe(5_000);
    expect(voucherApply(5_000, 0)).toBe(0);
  });
});

describe("the till", () => {
  it("recognises a scanned or typed voucher code, and nothing else", () => {
    expect(voucherCodeFrom("HH-K7PM-3QXR-9ZAB")).toBe("HH-K7PM-3QXR-9ZAB");
    expect(voucherCodeFrom("hh k7pm 3qxr 9zab")).toBe("HH-K7PM-3QXR-9ZAB");
    expect(voucherCodeFrom(" HHK7PM3QXR9ZAB ")).toBe("HH-K7PM-3QXR-9ZAB");
    expect(voucherCodeFrom("https://shop.herbalholland.com/gift?check=HH-K7PM-3QXR-9ZAB")).toBe("HH-K7PM-3QXR-9ZAB"); // the balance-check link's QR
    expect(voucherCodeFrom("HH0000123")).toBeNull(); // a member number
    expect(voucherCodeFrom("6001234567890")).toBeNull(); // a barcode
    expect(voucherCodeFrom("HHORDER:ABC123:123456")).toBeNull(); // an order QR
    expect(voucherCodeFrom("DUPO0-35G-2605A")).toBeNull(); // a batch code
    expect(voucherCodeFrom("HH-K7PM-3QXR-9ZAB extra")).toBeNull(); // only the code itself
    expect(voucherCodeFrom("HH-K7PM-3QXR-9ZA0")).toBeNull(); // 0 is never in a code
  });
  it("refunds onto the voucher first, up to what it paid, and never cashes it out", () => {
    expect(allocateRefund({ refundCents: 30_000, voucherPaidCents: 50_000, voucherRefundedCents: 0 })).toEqual({ toVoucher: 30_000, toTender: 0 });
    expect(allocateRefund({ refundCents: 30_000, voucherPaidCents: 20_000, voucherRefundedCents: 0 })).toEqual({ toVoucher: 20_000, toTender: 10_000 });
    expect(allocateRefund({ refundCents: 30_000, voucherPaidCents: 20_000, voucherRefundedCents: 15_000 })).toEqual({ toVoucher: 5_000, toTender: 25_000 });
    expect(allocateRefund({ refundCents: 30_000, voucherPaidCents: 20_000, voucherRefundedCents: 20_000 })).toEqual({ toVoucher: 0, toTender: 30_000 });
    expect(allocateRefund({ refundCents: 30_000, voucherPaidCents: 0, voucherRefundedCents: 0 })).toEqual({ toVoucher: 0, toTender: 30_000 });
    expect(allocateRefund({ refundCents: 0, voucherPaidCents: 20_000, voucherRefundedCents: 0 })).toEqual({ toVoucher: 0, toTender: 0 });
    expect(allocateRefund({ refundCents: -5, voucherPaidCents: 20_000, voucherRefundedCents: 0 })).toEqual({ toVoucher: 0, toTender: 0 });
  });
  it("shares a refund across the vouchers on a sale in the order they were tendered", () => {
    const r = allocateRefundAcross(25_000, [
      { code: "A", paidCents: 10_000, refundedCents: 10_000 },
      { code: "B", paidCents: 20_000, refundedCents: 5_000 },
      { code: "C", paidCents: 8_000, refundedCents: 0 },
    ]);
    expect(r.parts.map((p) => [p.code, p.cents])).toEqual([["B", 15_000], ["C", 8_000]]);
    expect(r.toTender).toBe(2_000);
    expect(allocateRefundAcross(1_000, [])).toEqual({ parts: [], toTender: 1_000 });
  });
});
