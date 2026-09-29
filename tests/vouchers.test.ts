// Gift voucher rules: codes, the three-year validity (CPA s63), and when a voucher can pay.
import { describe, expect, it } from "vitest";
import { makeVoucherCode, normaliseVoucherCode, voucherApply, voucherExpiry, voucherProblem, voucherSku, isVoucherSku, VOUCHER_AMOUNTS_CENTS } from "@/lib/vouchers";

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
