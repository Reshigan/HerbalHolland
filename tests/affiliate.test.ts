// The affiliate share: a referrer earns a % of their friend's net (ex-VAT) spend as points, 1 point = R1, rounded down.
import { describe, expect, it } from "vitest";
import { affiliatePoints, netOfVat } from "@/lib/loyalty-rules";

describe("affiliate share", () => {
  it("is 5% of net spend in whole points, rounded down", () => {
    expect(affiliatePoints(100_000, 5)).toBe(50); // R1,000 ex VAT → R50
    expect(affiliatePoints(1_999, 5)).toBe(0); // R19.99 → 99c → 0 points
    expect(affiliatePoints(2_000, 5)).toBe(1);
  });
  it("earns nothing when off, negative or empty", () => {
    expect(affiliatePoints(100_000, 0)).toBe(0);
    expect(affiliatePoints(0, 5)).toBe(0);
    expect(affiliatePoints(-5_000, 5)).toBe(0);
  });
  it("takes VAT off what was paid in the sale's own proportion", () => {
    expect(netOfVat(11_500, 11_500, 1_500)).toBe(10_000); // 15% VAT
    expect(netOfVat(5_750, 11_500, 1_500)).toBe(5_000); // half paid in points
    expect(netOfVat(11_500, 11_500, 0)).toBe(11_500); // non-VAT vendor
    expect(netOfVat(0, 0, 0)).toBe(0);
  });
});
