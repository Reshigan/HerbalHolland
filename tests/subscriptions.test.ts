import { describe, expect, it } from "vitest";
import { allowanceLabel, claimProblem, isPastGrace, monthlyCents, periodEndOf, planProblem, splitCents } from "@/lib/subscriptions";

describe("subscriptions", () => {
  it("ends periods", () => {
    const s = new Date("2026-01-31T10:00:00Z");
    expect(periodEndOf(s, "WEEKLY").toISOString()).toBe("2026-02-07T10:00:00.000Z");
    expect(periodEndOf(s, "FOUR_WEEKLY").toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(periodEndOf(s, "MONTHLY").toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(periodEndOf(new Date("2026-03-15T00:00:00Z"), "MONTHLY").toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(periodEndOf(new Date("2026-12-31T00:00:00Z"), "MONTHLY").toISOString()).toBe("2027-01-31T00:00:00.000Z");
  });

  it("checks a claim against the allowance", () => {
    expect(claimProblem("GRAMS", 3, [{ grams: 1, qty: 3 }])).toBeNull();
    expect(claimProblem("GRAMS", 3, [{ grams: 3.5, qty: 1 }])).toMatch(/more than your allowance/);
    expect(claimProblem("GRAMS", 3, [{ grams: null, qty: 1 }])).toMatch(/weighed/);
    expect(claimProblem("UNITS", 3, [{ grams: 0.5, qty: 2 }, { grams: null, qty: 1 }])).toBeNull();
    expect(claimProblem("UNITS", 3, [{ grams: null, qty: 4 }])).toMatch(/more than/);
    expect(claimProblem("UNITS", 3, [])).toMatch(/Choose/);
    expect(claimProblem("UNITS", 3, [{ grams: null, qty: 1.5 }])).toMatch(/whole/);
    expect(claimProblem("GRAMS", 0.3, [{ grams: 0.1, qty: 3 }])).toBeNull(); // float tolerance
  });

  it("splits cents exactly", () => {
    expect(splitCents(10_000, [1, 1, 1])).toEqual([3333, 3333, 3334]);
    expect(splitCents(999, [2, 1])).toEqual([666, 333]);
    expect(splitCents(500, [0, 0])).toEqual([0, 500]);
    expect(splitCents(500, [])).toEqual([]);
  });

  it("grace, MRR, labels and plan rules", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    expect(isPastGrace(at, 3, new Date("2026-01-04T00:00:00Z"))).toBe(false);
    expect(isPastGrace(at, 3, new Date("2026-01-04T00:00:01Z"))).toBe(true);
    expect(monthlyCents(12_000, "WEEKLY")).toBe(52_000);
    expect(monthlyCents(12_000, "FOUR_WEEKLY")).toBe(13_000);
    expect(monthlyCents(12_000, "MONTHLY")).toBe(12_000);
    expect(allowanceLabel("GRAMS", 3)).toBe("3 g");
    expect(allowanceLabel("UNITS", 3, "pre-rolls")).toBe("3 pre-rolls");
    expect(allowanceLabel("UNITS", 1, "pre-rolls")).toBe("1 pre-roll");
    const ok = { name: "Weekly 3", slug: "weekly-3", allowance: 3, priceCents: 30_000, eligibleCount: 2, active: true };
    expect(planProblem(ok)).toBeNull();
    expect(planProblem({ ...ok, slug: "Bad Slug" })).toMatch(/web address/);
    expect(planProblem({ ...ok, priceCents: 0 })).toMatch(/Price/);
    expect(planProblem({ ...ok, priceCents: 0, active: false })).toBeNull();
    expect(planProblem({ ...ok, eligibleCount: 0 })).toMatch(/at least one/);
    expect(planProblem({ ...ok, allowance: 0 })).toMatch(/allowance/);
  });
});
