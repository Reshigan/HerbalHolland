// The affiliate share: a referrer earns a % of their friend's net (ex-VAT) spend as rand credit, rounded down to the cent.
import { describe, expect, it } from "vitest";
import { affiliateCents, affiliateClawback, netOfVat } from "@/lib/loyalty-rules";
import { referralCreditProblem } from "@/lib/vouchers";

describe("affiliate share", () => {
  it("is 5% of net spend in cents, rounded down", () => {
    expect(affiliateCents(100_000, 5)).toBe(5_000); // R1,000 ex VAT → R50
    expect(affiliateCents(1_999, 5)).toBe(99);
    expect(affiliateCents(19, 5)).toBe(0);
  });
  it("earns nothing when off, negative or empty", () => {
    expect(affiliateCents(100_000, 0)).toBe(0);
    expect(affiliateCents(0, 5)).toBe(0);
    expect(affiliateCents(-5_000, 5)).toBe(0);
  });
  it("takes VAT off what was paid in the sale's own proportion", () => {
    expect(netOfVat(11_500, 11_500, 1_500)).toBe(10_000); // 15% VAT
    expect(netOfVat(5_750, 11_500, 1_500)).toBe(5_000); // half paid in points
    expect(netOfVat(11_500, 11_500, 0)).toBe(11_500); // non-VAT vendor
    expect(netOfVat(0, 0, 0)).toBe(0);
  });
  it("a refund takes back its share of the credit, never more", () => {
    expect(affiliateClawback(500, 11_500, 11_500)).toBe(500);
    expect(affiliateClawback(500, 5_750, 11_500)).toBe(250);
    expect(affiliateClawback(500, 20_000, 11_500)).toBe(500);
    expect(affiliateClawback(500, 100, 0)).toBe(0);
  });
});

describe("referral credit at the till", () => {
  const base = { ownerId: "m1", customerId: "m1", cents: 3_000, eligibleCents: 5_000 };
  it("pays for its owner on non-medicine lines", () => expect(referralCreditProblem(base)).toBeNull());
  it("refuses another member or no member", () => {
    expect(referralCreditProblem({ ...base, customerId: "m2" })).toMatch(/its member/);
    expect(referralCreditProblem({ ...base, customerId: null })).toMatch(/its member/);
  });
  it("never pays for medicines", () => expect(referralCreditProblem({ ...base, eligibleCents: 2_000 })).toMatch(/not on medicines/));
});
