// The affiliate share: a referrer earns a % of their friend's net (ex-VAT) spend as rand credit, rounded down to the cent.
import { describe, expect, it } from "vitest";
import { affiliateCents, affiliateClawback, netOfVat } from "@/lib/loyalty-rules";
import { referralCreditProblem, referralPayoutProblem } from "@/lib/vouchers";
import { referralPayoutLines } from "@/lib/ledger-store";

describe("affiliate share", () => {
  it("is 3% of net spend in cents, rounded down", () => {
    expect(affiliateCents(100_000, 3)).toBe(3_000); // R1,000 ex VAT → R30
    expect(affiliateCents(100_000, 5)).toBe(5_000);
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

describe("referral credit paid out in cash", () => {
  const ok = { cents: 5_000, balanceCents: 8_000, inDrawerCents: 100_000, status: "ACTIVE", expiresAt: new Date("2099-01-01") };
  it("pays up to the balance from the drawer", () => expect(referralPayoutProblem(ok)).toBeNull());
  it("refuses more than the balance, the cap or the drawer", () => {
    expect(referralPayoutProblem({ ...ok, cents: 9_000 })).toMatch(/only 80.00/);
    expect(referralPayoutProblem({ ...ok, cents: 250_000, balanceCents: 300_000, inDrawerCents: 500_000 })).toMatch(/at most 2000.00/);
    expect(referralPayoutProblem({ ...ok, inDrawerCents: 1_000 })).toMatch(/drawer/);
  });
  it("refuses less than HQ's least cash payout", () => {
    expect(referralPayoutProblem({ ...ok, minCents: 6_000 })).toMatch(/at least 60.00/);
    expect(referralPayoutProblem({ ...ok, minCents: 5_000 })).toBeNull();
  });
  it("refuses nothing, a void or an expired wallet", () => {
    expect(referralPayoutProblem({ ...ok, cents: 0 })).toMatch(/amount/);
    expect(referralPayoutProblem({ ...ok, status: "VOID" })).toMatch(/isn't active/);
    expect(referralPayoutProblem({ ...ok, expiresAt: new Date("2020-01-01") })).toMatch(/isn't active/);
  });
});

describe("referral payout in the books", () => {
  const sum = (lines: { cents: number }[]) => lines.reduce((s, l) => s + l.cents, 0);
  it("a franchisee's till pays on HQ's behalf", () => {
    const out = referralPayoutLines({ store: { storeId: "s1", companyId: "c1", hqOwned: false, vendor: true }, hqCompanyId: "hq", cents: 5_000 });
    const c1 = out.find((c) => c.companyId === "c1")!, hq = out.find((c) => c.companyId === "hq")!;
    expect(sum(c1.lines)).toBe(0);
    expect(sum(hq.lines)).toBe(0);
    expect(c1.lines.find((l) => l.key === "cash")?.cents).toBe(-5_000);
    expect(hq.lines.find((l) => l.key === "vouchers")?.cents).toBe(5_000);
    expect(hq.lines.find((l) => l.key === "franchisees")?.partyId).toBe("c1");
  });
  it("an HQ store settles the liability from its own cash", () => {
    const out = referralPayoutLines({ store: { storeId: "hs", companyId: "hq", hqOwned: true, vendor: true }, hqCompanyId: "hq", cents: 5_000 });
    expect(out).toHaveLength(1);
    expect(out[0].lines.map((l) => [l.key, l.cents]).sort()).toEqual([["cash", -5_000], ["vouchers", 5_000]]);
  });
});
