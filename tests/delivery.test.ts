// Delivery estimates: working days only (no weekends, no SA public holidays), the same-day cut-off, and the labels.
import { describe, expect, it } from "vitest";
import { addWorkingDays, DEFAULT_DELIVERY_DAYS, deliveryEstimate, estimateLabel, isWorkingDay } from "@/lib/delivery";
import { dayKey } from "@/lib/format";

const sast = (s: string) => new Date(`${s}+02:00`);

describe("working days", () => {
  it("skip weekends and public holidays", () => {
    expect(isWorkingDay(sast("2026-09-24T10:00:00"))).toBe(false); // Heritage Day (Thursday)
    expect(isWorkingDay(sast("2026-09-26T10:00:00"))).toBe(false); // Saturday
    expect(isWorkingDay(sast("2026-09-29T10:00:00"))).toBe(true); // Tuesday
    expect(dayKey(addWorkingDays(sast("2026-09-23T10:00:00"), 2))).toBe("2026-09-28"); // Wed → skip Heritage Day, Fri counts, then Monday
    expect(dayKey(addWorkingDays(sast("2026-10-02T10:00:00"), 1))).toBe("2026-10-05"); // Friday → Monday
  });
});

describe("deliveryEstimate", () => {
  const days = DEFAULT_DELIVERY_DAYS;
  it("courier: province range from the next working day, from tomorrow after the cut-off", () => {
    const e = deliveryEstimate({ fulfilment: "COURIER", province: "GP", days, cutoffHour: 15, now: sast("2026-09-29T10:00:00") });
    expect([dayKey(e.earliest), dayKey(e.latest)]).toEqual(["2026-09-30", "2026-10-01"]);
    expect(e.label).toBe("Wed 30 Sep – Thu 1 Oct");
    const late = deliveryEstimate({ fulfilment: "COURIER", province: "GP", days, cutoffHour: 15, now: sast("2026-09-29T16:30:00") });
    expect([dayKey(late.earliest), dayKey(late.latest)]).toEqual(["2026-10-01", "2026-10-02"]);
    expect(late.note).toContain("next working day");
  });
  it("courier: unknown province falls back to 2–4 working days; weekends are skipped", () => {
    const e = deliveryEstimate({ fulfilment: "COURIER", province: null, days, cutoffHour: 15, now: sast("2026-10-01T09:00:00") }); // Thursday
    expect([dayKey(e.earliest), dayKey(e.latest)]).toEqual(["2026-10-05", "2026-10-07"]);
    expect(e.note).toBe("2–4 working days nationwide.");
  });
  it("same-day: today before the cut-off, the next working day after it or on a weekend", () => {
    expect(deliveryEstimate({ fulfilment: "SAME_DAY", cutoffHour: 15, now: sast("2026-09-29T14:59:00") }).label).toBe("Today");
    expect(deliveryEstimate({ fulfilment: "SAME_DAY", cutoffHour: 15, now: sast("2026-09-29T15:00:00") }).label).toBe("Tomorrow");
    expect(deliveryEstimate({ fulfilment: "SAME_DAY", cutoffHour: 15, now: sast("2026-10-03T10:00:00") }).label).toBe("Mon 5 Oct"); // Saturday
  });
  it("collect is usually ready within two hours", () => {
    expect(deliveryEstimate({ fulfilment: "COLLECT", cutoffHour: 15, now: sast("2026-09-29T10:00:00") }).label).toBe("Usually within 2 hours");
  });
  it("labels a range across a month boundary with both months", () => {
    expect(estimateLabel(sast("2026-09-30T00:00:00"), sast("2026-10-02T00:00:00"), sast("2026-09-28T00:00:00"))).toBe("Wed 30 Sep – Fri 2 Oct");
    expect(estimateLabel(sast("2026-10-05T00:00:00"), sast("2026-10-07T00:00:00"), sast("2026-10-01T00:00:00"))).toBe("Mon 5 – Wed 7 Oct");
  });
});
