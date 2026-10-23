// The referral ladder: rungs on qualified referrals (first purchases), the 3-friend boost and the tier a member holds.
import { describe, expect, it } from "vitest";
import { BOOST_DAYS, activeHold, boostDue, boostFor, effectiveTier, holdingGuarantee, ladderStep, nextRung, RUNGS, windmillCrew } from "@/lib/referral-ladder";
import { screenCopy } from "@/lib/compliance";

const now = new Date("2026-10-23T10:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("referral ladder rungs", () => {
  it("names the rung reached on the exact count", () => {
    expect([0, 1, 2, 4, 9, 11, 30].map(ladderStep)).toEqual(Array(7).fill(null));
    expect(ladderStep(3)?.kind).toBe("BOOST");
    expect(ladderStep(10)?.kind).toBe("CREW");
  });

  it("names the next rung and how many friends are left", () => {
    expect(nextRung(0)).toMatchObject({ at: 3, remaining: 3, kind: "BOOST" });
    expect(nextRung(2)).toMatchObject({ at: 3, remaining: 1 });
    expect(nextRung(3)).toMatchObject({ at: 10, remaining: 7, kind: "CREW" });
    expect(nextRung(10)).toBeNull();
    expect(nextRung(25)).toBeNull();
  });

  it("derives Windmill Crew from the count", () => {
    expect(windmillCrew(9)).toBe(false);
    expect(windmillCrew(10)).toBe(true);
    expect(windmillCrew(40)).toBe(true);
  });

  it("rewards pass the copy screen", () => {
    expect(RUNGS.flatMap((r) => screenCopy(r.reward))).toEqual([]);
  });
});

describe("boostDue", () => {
  it("is due from 3 qualified referrals until it has been given", () => {
    expect([0, 1, 2].map((n) => boostDue(n, false))).toEqual([false, false, false]);
    expect(boostDue(3, false)).toBe(true);
  });

  it("awards at 4 when nothing was given at 3 (a member already past 3 when the ladder started)", () => {
    expect(boostDue(4, false)).toBe(true);
    expect(boostDue(12, false)).toBe(true);
  });

  it("never gives it twice once the marker exists", () => {
    expect([3, 4, 10, 30].map((n) => boostDue(n, true))).toEqual([false, false, false, false]);
  });
});

describe("boostFor", () => {
  it("gives the next tier up for 30 days", () => {
    expect(boostFor("SEED", now)).toEqual({ tier: "SPROUT", until: days(BOOST_DAYS), name: "Sprout" });
    expect(boostFor("BLOOM", now).tier).toBe("HARVEST");
  });

  it("never goes above Harvest (Harvest keeps Harvest for 30 days)", () => {
    expect(boostFor("HARVEST", now)).toMatchObject({ tier: "HARVEST", until: days(30) });
  });

  it("climbs from the effective tier, so a founding floor is the base", () => {
    expect(boostFor(effectiveTier("SEED", "SPROUT", days(200), null, null, now), now)).toMatchObject({ tier: "BLOOM", until: days(30) });
  });
});

describe("effectiveTier", () => {
  it("is the spend tier with nothing held", () => {
    expect(effectiveTier("SPROUT", null, null, null, null, now)).toBe("SPROUT");
  });

  it("is the highest of spend, an active floor and an active boost", () => {
    expect(effectiveTier("SEED", "SPROUT", days(10), null, null, now)).toBe("SPROUT");
    expect(effectiveTier("SEED", null, null, "BLOOM", days(10), now)).toBe("BLOOM");
    expect(effectiveTier("HARVEST", "SPROUT", days(10), "BLOOM", days(10), now)).toBe("HARVEST");
    expect(effectiveTier("SEED", "SPROUT", days(200), "BLOOM", days(30), now)).toBe("BLOOM");
  });

  it("ignores what has lapsed", () => {
    expect(effectiveTier("SEED", "BLOOM", days(-1), "HARVEST", now, now)).toBe("SEED");
  });

  it("a boost above a founding floor, then back to the floor when the boost ends", () => {
    const boost = boostFor(effectiveTier("SEED", "SPROUT", days(200), null, null, now), now);
    expect(effectiveTier("SEED", "SPROUT", days(200), boost.tier, boost.until, now)).toBe("BLOOM");
    expect(effectiveTier("SEED", "SPROUT", days(200), boost.tier, boost.until, days(31))).toBe("SPROUT");
    expect(effectiveTier("SEED", "SPROUT", days(200), boost.tier, boost.until, days(201))).toBe("SEED");
  });

  it("keeps an active boost when the floor ends", () => {
    expect(effectiveTier("SEED", "BLOOM", days(5), "SPROUT", days(30), days(6))).toBe("SPROUT");
    expect(effectiveTier("SEED", "BLOOM", days(5), "SPROUT", days(30), days(31))).toBe("SEED");
  });
});

describe("holdingGuarantee", () => {
  it("names whichever of floor and boost holds higher, or none", () => {
    expect(holdingGuarantee(null, null, null, null, now)).toBeNull();
    expect(holdingGuarantee("SPROUT", days(200), "BLOOM", days(30), now)).toEqual({ tier: "BLOOM", until: days(30), kind: "BOOST" });
    expect(holdingGuarantee("SPROUT", days(200), "BLOOM", days(30), days(40))).toEqual({ tier: "SPROUT", until: days(200), kind: "FLOOR" });
    expect(holdingGuarantee("HARVEST", days(10), "HARVEST", days(30), now)?.kind).toBe("BOOST"); // runs longer
    expect(activeHold("SPROUT", days(-1), now)).toBeNull();
  });
});
