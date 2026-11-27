import { describe, expect, it } from "vitest";
import { allowanceLabel, anchorDayOf, claimProblem, cycleEndOf, isPastGrace, openWeek, perWeekCents, planProblem, splitCents, weekCents, weekIndexOf, weeksOf, type Cycle } from "@/lib/subscriptions";

const at = (s: string) => new Date(s);
const iso = (d: Date) => d.toISOString();

describe("subscriptions", () => {
  it("ends a monthly cycle on the anchor day, clamped to short months", () => {
    // 31 Jan 12:00 SAST, then the 31st again whenever the month has one.
    const jan31 = at("2026-01-31T10:00:00Z");
    expect(anchorDayOf(jan31)).toBe(31);
    const feb = cycleEndOf(jan31);
    expect(iso(feb)).toBe("2026-02-28T10:00:00.000Z");
    const mar = cycleEndOf(feb, 31);
    expect(iso(mar)).toBe("2026-03-31T10:00:00.000Z");
    expect(iso(cycleEndOf(mar, 31))).toBe("2026-04-30T10:00:00.000Z");
    // Leap year: February has a 29th.
    expect(iso(cycleEndOf(at("2028-01-30T10:00:00Z")))).toBe("2028-02-29T10:00:00.000Z");
    expect(iso(cycleEndOf(at("2026-03-15T00:00:00Z")))).toBe("2026-04-15T00:00:00.000Z");
    expect(iso(cycleEndOf(at("2026-12-31T08:00:00Z")))).toBe("2027-01-31T08:00:00.000Z");
  });

  it("counts the anchor on the SAST clock", () => {
    // 23:30 UTC on 31 Jan is already 1 Feb in South Africa.
    const d = at("2026-01-31T23:30:00Z");
    expect(anchorDayOf(d)).toBe(1);
    expect(iso(cycleEndOf(d))).toBe("2026-02-28T23:30:00.000Z"); // 1 Mar 01:30 SAST
  });

  it("splits a month into four weekly allowances", () => {
    const start = at("2026-01-31T10:00:00Z");
    const end = cycleEndOf(start);
    const w = weeksOf(start, end);
    expect(w.map((x) => iso(x.start))).toEqual(["2026-01-31T10:00:00.000Z", "2026-02-07T10:00:00.000Z", "2026-02-14T10:00:00.000Z", "2026-02-21T10:00:00.000Z"]);
    expect(iso(w[3].end)).toBe(iso(end));
    expect(weekIndexOf(start, end, at("2026-02-27T00:00:00Z"))).toBe(3);
    expect(weekIndexOf(start, end, end)).toBe(-1);
    expect(weekCents(10_001)).toEqual([2500, 2500, 2500, 2501]);
    expect(perWeekCents(40_000)).toBe(10_000);
  });

  it("opens the week covering now, with one week of rollover", () => {
    const start = at("2026-03-01T08:00:00Z");
    const c: Cycle = { periodStart: start, periodEnd: cycleEndOf(start), allowance: 3, priceCents: 40_000, claimed: [] };
    const wk2 = at("2026-03-09T00:00:00Z");
    expect(openWeek(c, wk2)).toMatchObject({ index: 1, allowance: 3, cents: 10_000, claimed: false, carryAllowance: 0 });
    // Week 1 unclaimed: it carries into week 2 once.
    expect(openWeek(c, wk2, true)).toMatchObject({ allowance: 6, cents: 20_000, carryAllowance: 3 });
    // Week 1 claimed: nothing to carry.
    const w = weeksOf(c.periodStart, c.periodEnd);
    expect(openWeek({ ...c, claimed: [w[0].start] }, wk2, true)).toMatchObject({ allowance: 3, carryAllowance: 0 });
    // Week 2 itself claimed.
    expect(openWeek({ ...c, claimed: [w[1].start] }, wk2, true)?.claimed).toBe(true);
    // Outside the month.
    expect(openWeek(c, at("2026-05-01T00:00:00Z"), true)).toBeNull();
    // Week 4 of the paid month before carries into week 1 of a month that follows straight on.
    const next: Cycle = { ...c, periodStart: c.periodEnd, periodEnd: cycleEndOf(c.periodEnd, 1) };
    const day1 = at("2026-04-02T00:00:00Z");
    expect(openWeek(next, day1, true, c)).toMatchObject({ index: 0, allowance: 6, carryAllowance: 3 });
    expect(openWeek(next, day1, true, { ...c, claimed: [w[3].start] })).toMatchObject({ allowance: 3 });
    // A gap between the months (lapsed, then restarted): no carry.
    const later: Cycle = { ...c, periodStart: at("2026-04-10T08:00:00Z"), periodEnd: cycleEndOf(at("2026-04-10T08:00:00Z")) };
    expect(openWeek(later, at("2026-04-11T00:00:00Z"), true, c)).toMatchObject({ allowance: 3 });
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

  it("grace, labels and plan rules", () => {
    const t = at("2026-01-01T00:00:00Z");
    expect(isPastGrace(t, 3, at("2026-01-04T00:00:00Z"))).toBe(false);
    expect(isPastGrace(t, 3, at("2026-01-04T00:00:01Z"))).toBe(true);
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
