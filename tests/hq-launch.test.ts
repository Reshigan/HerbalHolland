import { describe, expect, it } from "vitest";
import { countdown, dropPhase, earlyLabel, eventPhase, firstOpen, welcomeLine } from "@/server/hq/launch-rules";

const at = (s: string) => new Date(s);
const drop = { startsAt: at("2026-10-02T07:00:00Z"), endsAt: at("2026-10-09T07:00:00Z"), earlyTier: "HARVEST", earlyMinutes: 120 };

describe("drop phases", () => {
  it("opens early for the early-access tier", () => {
    expect(firstOpen(drop).toISOString()).toBe("2026-10-02T05:00:00.000Z");
    expect(firstOpen({ ...drop, earlyTier: null }).toISOString()).toBe("2026-10-02T07:00:00.000Z");
  });
  it("moves from upcoming through early access and live to past", () => {
    expect(dropPhase(drop, at("2026-10-02T04:59:00Z"))).toBe("upcoming");
    expect(dropPhase(drop, at("2026-10-02T05:00:00Z"))).toBe("early");
    expect(dropPhase(drop, at("2026-10-02T07:00:00Z"))).toBe("live");
    expect(dropPhase(drop, at("2026-10-09T07:00:00Z"))).toBe("past");
    expect(dropPhase({ ...drop, endsAt: null }, at("2027-01-01T00:00:00Z"))).toBe("live");
  });
  it("labels early access", () => {
    expect(earlyLabel("HARVEST", 120)).toBe("Harvest 2 h early");
    expect(earlyLabel("BLOOM", 90)).toBe("Bloom 90 min early");
    expect(earlyLabel(null, 60)).toBeNull();
    expect(earlyLabel("BLOOM", 0)).toBeNull();
  });
});

describe("event phases", () => {
  const e = { startsAt: at("2026-10-01T16:00:00Z"), endsAt: at("2026-10-01T18:30:00Z") };
  it("is upcoming, on now, then ended", () => {
    expect(eventPhase(e, at("2026-10-01T15:59:00Z"))).toBe("upcoming");
    expect(eventPhase(e, at("2026-10-01T16:00:00Z"))).toBe("on");
    expect(eventPhase(e, at("2026-10-01T18:30:00Z"))).toBe("ended");
  });
});

describe("launch countdown", () => {
  const now = at("2026-09-27T08:00:00Z");
  it("reads in days and hours, then hours and minutes", () => {
    expect(countdown(at("2026-10-09T12:00:00Z"), now)).toBe("12 days, 4 hours");
    expect(countdown(at("2026-09-28T08:00:00Z"), now)).toBe("1 day");
    expect(countdown(at("2026-09-27T11:20:00Z"), now)).toBe("3 hours, 20 min");
    expect(countdown(at("2026-09-27T08:05:00Z"), now)).toBe("5 min");
    expect(countdown(at("2026-09-26T08:00:00Z"), now)).toBe("0 min");
  });
});

describe("welcome gifts", () => {
  const gift = { firstPurchaseOnly: true, kind: "BUY_X_GET_Y", buyQty: null, minSpendCents: 0, getQty: 1, rewardPercent: 100 };
  it("describes a no-trigger gift instead of “Spend R0”", () => {
    expect(welcomeLine(gift)).toBe("1 free with a member's first purchase");
    expect(welcomeLine({ ...gift, rewardPercent: 50 })).toBe("1 at 50% off with a member's first purchase");
  });
  it("leaves other deals to describePromo", () => {
    expect(welcomeLine({ ...gift, firstPurchaseOnly: false })).toBeNull();
    expect(welcomeLine({ ...gift, minSpendCents: 20_000 })).toBeNull();
    expect(welcomeLine({ ...gift, kind: "PERCENT" })).toBeNull();
  });
});
