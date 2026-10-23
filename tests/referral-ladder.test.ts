// The referral ladder: rungs on qualified referrals (first purchases), and the tier floor the 3-friend rung writes.
import { describe, expect, it } from "vitest";
import { BOOST_DAYS, floorFor, ladderStep, nextRung, RUNGS, windmillCrew } from "@/lib/referral-ladder";
import { screenCopy } from "@/lib/compliance";

const now = new Date("2026-10-23T10:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("referral ladder rungs", () => {
  it("fires only on the exact count", () => {
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

describe("floorFor", () => {
  it("gives the next tier up for 30 days", () => {
    expect(floorFor("SEED", null, null, now)).toEqual({ tier: "SPROUT", until: days(BOOST_DAYS), name: "Sprout" });
    expect(floorFor("BLOOM", null, null, now)?.tier).toBe("HARVEST");
  });

  it("never goes above Harvest", () => {
    expect(floorFor("HARVEST", null, null, now)).toMatchObject({ tier: "HARVEST", until: days(30) });
  });

  it("ignores a lapsed floor", () => {
    expect(floorFor("SEED", "BLOOM", days(-1), now)?.tier).toBe("SPROUT");
  });

  it("climbs from an active floor above the earned tier", () => {
    expect(floorFor("SEED", "SPROUT", days(10), now)).toMatchObject({ tier: "BLOOM", until: days(30) });
  });

  it("never shortens a longer floor (a founding member's guarantee stays)", () => {
    expect(floorFor("SPROUT", "SPROUT", days(200), now)).toBeNull();
    expect(floorFor("HARVEST", "HARVEST", days(30), now)).toBeNull();
  });

  it("extends a shorter top-tier floor", () => {
    expect(floorFor("HARVEST", "HARVEST", days(5), now)).toMatchObject({ tier: "HARVEST", until: days(30) });
  });
});
