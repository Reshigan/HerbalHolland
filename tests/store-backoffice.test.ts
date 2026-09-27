import { describe, expect, it } from "vitest";
import {
  checkAdjustment,
  coverLabel,
  expiryState,
  hoursJson,
  hrefWith,
  overstockUnits,
  parseClock,
  parseDay,
  parseRand,
  parseWhole,
  readHours,
  receiptCheck,
  scopesOverlap,
  stockStatus,
  targetStock,
  varianceSummary,
  cashTone,
  toLocalInput,
  parseLocal,
  scheduleLabel,
} from "@/server/store/rules";

describe("stock status", () => {
  const base = { onHand: 10, available: 10, reorderPoint: 4, parLevel: 12, avgDaily: 0 };
  it("classifies out, low, healthy and over", () => {
    expect(stockStatus({ ...base, available: 0 })).toBe("OUT");
    expect(stockStatus({ ...base, available: 4 })).toBe("LOW");
    expect(stockStatus({ ...base, available: 10 })).toBe("HEALTHY");
    expect(stockStatus({ ...base, available: 18 })).toBe("HEALTHY");
    expect(stockStatus({ ...base, available: 19 })).toBe("OVER");
  });
  it("flags negative stock before anything else", () => {
    expect(stockStatus({ ...base, onHand: -2, available: -2 })).toBe("NEGATIVE");
    expect(stockStatus({ ...base, negativeLots: 1 })).toBe("NEGATIVE");
  });
  it("treats reserved stock as unavailable", () => {
    expect(stockStatus({ ...base, onHand: 3, available: -1 })).toBe("OUT");
  });
  it("raises the target for fast sellers", () => {
    expect(targetStock(12, 2)).toBe(34);
    expect(stockStatus({ ...base, available: 40, avgDaily: 2 })).toBe("HEALTHY");
    expect(overstockUnits(40, 12, 2)).toBe(6);
    expect(overstockUnits(5, 12, 0)).toBe(0);
  });
  it("labels days of cover", () => {
    expect(coverLabel(Infinity)).toBe("No sales");
    expect(coverLabel(0.4)).toBe("<1 d");
    expect(coverLabel(12.6)).toBe("13 d");
  });
});

describe("expiry", () => {
  const now = new Date("2026-09-27T10:00:00Z");
  it("counts down and flags expired lots", () => {
    expect(expiryState(null, now).label).toBe("No expiry");
    expect(expiryState(new Date("2026-10-07T10:00:00Z"), now)).toMatchObject({ days: 10, tone: "amber" });
    expect(expiryState(new Date("2026-09-20T10:00:00Z"), now)).toMatchObject({ days: -7, tone: "red" });
    expect(expiryState(new Date("2027-09-27T10:00:00Z"), now).label).toBe("12 mo left");
  });
});

describe("adjustments", () => {
  it("signs the quantity from the reason", () => {
    expect(checkAdjustment({ reason: "DAMAGED", qty: 2, onHand: 5 })).toEqual({ delta: -2 });
    expect(checkAdjustment({ reason: "FOUND", qty: 3, onHand: 0 })).toEqual({ delta: 3 });
    expect(checkAdjustment({ reason: "CORRECTION", qty: 1, direction: "IN", onHand: 0, note: "Mis-scan" })).toEqual({ delta: 1 });
  });
  it("won't remove more than the batch holds", () => {
    expect(checkAdjustment({ reason: "THEFT", qty: 6, onHand: 5 })).toMatchObject({ field: "qty" });
  });
  it("requires a witness for destruction and a note for corrections", () => {
    expect(checkAdjustment({ reason: "DESTROYED", qty: 1, onHand: 5 })).toMatchObject({ field: "witness" });
    expect(checkAdjustment({ reason: "DESTROYED", qty: 1, onHand: 5, witness: "Sipho Dlamini" })).toEqual({ delta: -1 });
    expect(checkAdjustment({ reason: "CORRECTION", qty: 1, direction: "OUT", onHand: 5 })).toMatchObject({ field: "note" });
    expect(checkAdjustment({ reason: "CORRECTION", qty: 1, onHand: 5, note: "Typo" })).toMatchObject({ field: "direction" });
  });
  it("rejects zero, fractional and silly quantities", () => {
    expect(checkAdjustment({ reason: "FOUND", qty: 0, onHand: 0 })).toMatchObject({ field: "qty" });
    expect(checkAdjustment({ reason: "FOUND", qty: 1.5, onHand: 0 })).toMatchObject({ field: "qty" });
    expect(checkAdjustment({ reason: "FOUND", qty: 20_000, onHand: 0 })).toMatchObject({ field: "qty" });
  });
});

describe("stock-take variance", () => {
  it("summarises over, short, value and accuracy", () => {
    const s = varianceSummary([
      { counted: 10, system: 10, unitCostCents: 1000 },
      { counted: 8, system: 10, unitCostCents: 1000 },
      { counted: 3, system: 2, unitCostCents: 500 },
      { counted: null, system: 4, unitCostCents: 100 },
    ]);
    expect(s).toMatchObject({ counted: 3, uncounted: 1, exact: 1, overUnits: 1, shortUnits: 2, netUnits: -1, overValue: 500, shortValue: 2000, netValue: -1500 });
    expect(s.accuracy).toBeCloseTo(1 / 3);
  });
  it("detects overlapping counts", () => {
    expect(scopesOverlap("FULL", "flower")).toBe(true);
    expect(scopesOverlap("flower", "flower")).toBe(true);
    expect(scopesOverlap("flower", "edibles")).toBe(false);
  });
});

describe("receiving", () => {
  it("separates short-shipped from short-received", () => {
    expect(receiptCheck([{ ordered: 10, shipped: 8, received: 8 }, { ordered: 4, shipped: 4, received: 3 }])).toEqual({ units: 11, shortShipped: 2, shortReceived: 1, clean: false });
    expect(receiptCheck([{ ordered: 2, shipped: 2, received: 2 }]).clean).toBe(true);
  });
});

describe("cash-ups", () => {
  it("colours variances", () => {
    expect(cashTone(0)).toBe("green");
    expect(cashTone(-4_000)).toBe("amber");
    expect(cashTone(12_000)).toBe("red");
    expect(cashTone(null)).toBe("neutral");
  });
});

describe("trading hours", () => {
  it("reads stored hours and treats missing days as closed", () => {
    const h = readHours({ mon: ["09:00", "17:00"], sun: null });
    expect(h.mon).toEqual({ open: "09:00", close: "17:00" });
    expect(h.sun).toBeNull();
    expect(h.tue).toBeNull();
  });
  it("validates times", () => {
    const week = readHours({ mon: ["09:00", "17:00"] });
    expect(hoursJson(week)).toMatchObject({ json: { mon: ["09:00", "17:00"], tue: null } });
    expect(hoursJson({ ...week, mon: { open: "18:00", close: "09:00" } })).toMatchObject({ error: expect.stringContaining("Monday") });
    expect(hoursJson({ ...week, mon: { open: "9am", close: "17:00" } })).toMatchObject({ error: expect.any(String) });
  });
});

describe("form parsing", () => {
  it("parses rand amounts", () => {
    expect(parseRand("R1,234.50")).toBe(123450);
    expect(parseRand("12,50")).toBe(1250);
    expect(parseRand(" 1 234 ")).toBe(123400);
    expect(parseRand("")).toBeNull();
    expect(parseRand("abc")).toBeNull();
    expect(parseRand("1.234")).toBeNull();
  });
  it("parses whole numbers within bounds", () => {
    expect(parseWhole("12")).toBe(12);
    expect(parseWhole("-1")).toBeNull();
    expect(parseWhole("-1", -5, 5)).toBe(-1);
    expect(parseWhole("1.5")).toBeNull();
    expect(parseWhole("")).toBeNull();
  });
  it("parses SAST days, clocks and datetime-local values", () => {
    expect(parseDay("2026-09-27")?.toISOString()).toBe("2026-09-26T22:00:00.000Z");
    expect(parseDay("27/09/2026")).toBeNull();
    expect(parseClock("16:30")).toBe(990);
    expect(parseClock("24:00")).toBeNull();
    const d = parseLocal("2026-09-27T14:05");
    expect(d?.toISOString()).toBe("2026-09-27T12:05:00.000Z");
    expect(toLocalInput(d)).toBe("2026-09-27T14:05");
  });
});

describe("urls", () => {
  it("merges query params", () => {
    expect(hrefWith("/x", { q: "gum", page: "3" }, { page: null, status: "LOW" })).toBe("/x?q=gum&status=LOW");
    expect(hrefWith("/x", {}, {})).toBe("/x");
  });
});

describe("promotion schedules", () => {
  it("describes days and happy hours", () => {
    expect(scheduleLabel([])).toBe("Every day");
    expect(scheduleLabel([5, 1, 2, 3, 4], 960, 1080)).toBe("Weekdays · 16:00–18:00");
    expect(scheduleLabel([0, 6])).toBe("Weekends");
    expect(scheduleLabel([0, 3, 1])).toBe("Mon, Wed, Sun");
  });
});
