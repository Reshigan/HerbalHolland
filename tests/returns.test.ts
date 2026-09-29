// Returns rules: the CPA s56 and ECTA s44 windows, what may come back, what is refunded, and the messages members get.
import { describe, expect, it } from "vitest";
import {
  NO_COOLING_OFF_CLASSES,
  OPEN_RETURN_STATUSES,
  RETURN_MOVES,
  RETURN_REASON,
  RETURN_STATUS,
  RETURN_WINDOWS,
  SEALED_CLASSES,
  canMoveReturn,
  refundBreakdown,
  restockByDefault,
  returnEligibility,
  returnNumber,
  returnStatusMessage,
  returnWindowEnds,
  validateReturnItems,
  type ReturnOrder,
} from "@/lib/returns";
import { screenCopy } from "@/lib/compliance";

const sast = (s: string) => new Date(`${s}+02:00`);
const delivered = sast("2026-09-20T14:10:00");
const order = (over: Partial<ReturnOrder> = {}): ReturnOrder => ({
  status: "COMPLETED",
  completedAt: delivered,
  lines: [
    { variantId: "oil", name: "Calm CBD Oil · 30ml", qty: 2, totalCents: 119_000, regClass: "CBD", madeToOrder: false, requested: 0 },
    { variantId: "grinder", name: "Sunset Grinder", qty: 1, totalCents: 34_900, regClass: "ACCESSORY", madeToOrder: false, requested: 0 },
    { variantId: "tee", name: "Heritage Tee · L", qty: 1, totalCents: 45_000, regClass: "APPAREL", madeToOrder: true, requested: 0 },
  ],
  ...over,
});

describe("windows", () => {
  it("gives 7 days for a change of mind and 6 months for faults, to the end of the SAST day", () => {
    expect(RETURN_WINDOWS).toEqual({ coolingOffDays: 7, defectMonths: 6 });
    expect(returnWindowEnds(delivered, "COOLING_OFF").toISOString()).toBe(sast("2026-09-27T23:59:59.999").toISOString());
    expect(returnWindowEnds(delivered, "DEFECTIVE").toISOString()).toBe(sast("2027-03-20T23:59:59.999").toISOString());
    // The 31st of a month lands on the last day of a shorter month.
    expect(returnWindowEnds(sast("2026-08-31T10:00:00"), "DAMAGED").toISOString()).toBe(sast("2027-02-28T23:59:59.999").toISOString());
  });
});

describe("eligibility", () => {
  it("needs a delivered or collected order", () => {
    expect(returnEligibility(order({ status: "OUT_FOR_DELIVERY", completedAt: null }), "DEFECTIVE", sast("2026-09-21T10:00:00"))).toMatchObject({ ok: false, reason: expect.stringContaining("delivered or collected") });
    expect(returnEligibility(order({ status: "CANCELLED" }), "COOLING_OFF", sast("2026-09-21T10:00:00"))).toMatchObject({ ok: false });
  });

  it("lets everything except made-to-order merch come back for a change of mind within 7 days, sealed consumables only", () => {
    const e = returnEligibility(order(), "COOLING_OFF", sast("2026-09-27T20:00:00"));
    expect(e.ok).toBe(true);
    expect(e.lines).toEqual([
      { variantId: "oil", name: "Calm CBD Oil · 30ml", qty: 2, blocked: null, sealed: true },
      { variantId: "grinder", name: "Sunset Grinder", qty: 1, blocked: null, sealed: false },
      { variantId: "tee", name: "Heritage Tee · L", qty: 0, blocked: expect.stringContaining("Made to order"), sealed: false },
    ]);
    expect(SEALED_CLASSES).toEqual(["CBD", "CBD_FOOD", "CBD_TOPICAL", "SUPPLEMENT"]);
    expect(NO_COOLING_OFF_CLASSES).toEqual(["THC"]);
  });

  it("closes the cooling-off window after 7 days but points to the 6-month fault rights", () => {
    const e = returnEligibility(order(), "COOLING_OFF", sast("2026-09-28T00:00:01"));
    expect(e.ok).toBe(false);
    expect(e.reason).toMatch(/closed on 27 Sep 2026\. If something is faulty, choose that instead: you have 6 months/);
    expect(returnEligibility(order(), "DEFECTIVE", sast("2026-09-28T00:00:01")).ok).toBe(true);
    expect(returnEligibility(order(), "DEFECTIVE", sast("2027-03-21T00:00:01"))).toMatchObject({ ok: false, reason: expect.stringContaining("closed on 20 Mar 2027") });
  });

  it("leaves out units already in a return request, and faulty made-to-order merch can come back", () => {
    const e = returnEligibility(order({ lines: order().lines.map((l) => (l.variantId === "oil" ? { ...l, requested: 2 } : l)) }), "DEFECTIVE", sast("2026-10-01T10:00:00"));
    expect(e.lines.map((l) => [l.variantId, l.qty, l.blocked])).toEqual([
      ["oil", 0, "Already in a return request"],
      ["grinder", 1, null],
      ["tee", 1, null],
    ]);
    const all = returnEligibility(order({ lines: order().lines.map((l) => ({ ...l, requested: l.qty })) }), "DEFECTIVE", sast("2026-10-01T10:00:00"));
    expect(all).toMatchObject({ ok: false, reason: "Every item on this order is already in a return request." });
  });

  it("checks what the member ticked against what may come back", () => {
    const e = returnEligibility(order(), "COOLING_OFF", sast("2026-09-21T10:00:00"));
    expect(validateReturnItems([{ variantId: "oil", qty: "1" }, { variantId: "grinder", qty: 0 }], e)).toEqual({ ok: true, items: [{ variantId: "oil", qty: 1 }] });
    expect(validateReturnItems([{ variantId: "oil", qty: 3 }], e)).toMatchObject({ ok: false, error: "Calm CBD Oil · 30ml: only 2 can be returned." });
    expect(validateReturnItems([{ variantId: "tee", qty: 1 }], e)).toMatchObject({ ok: false, error: expect.stringMatching(/^Heritage Tee · L: made to order/) });
    expect(validateReturnItems([{ variantId: "nope", qty: 1 }], e)).toMatchObject({ ok: false, error: "One of the items isn't on this order." });
    expect(validateReturnItems([], e)).toMatchObject({ ok: false, error: "Choose at least one item to return." });
  });
});

describe("refunds", () => {
  const lines = [
    { variantId: "oil", qty: 2, totalCents: 119_000 },
    { variantId: "grinder", qty: 1, totalCents: 34_900 },
  ];

  it("refunds each unit's share of its line; the delivery fee stays on a partial return", () => {
    const r = refundBreakdown({ lines, items: [{ variantId: "oil", qty: 1 }], deliveryCents: 9_900, reason: "DEFECTIVE" });
    expect(r).toMatchObject({ linesCents: 59_500, deliveryCents: 0, totalCents: 59_500, wholeOrder: false, capped: false });
    expect(r.note).toContain("delivery fee stays");
  });

  it("refunds the delivery fee too when the whole order comes back because of us, not for a change of mind", () => {
    const whole = [{ variantId: "oil", qty: 2 }, { variantId: "grinder", qty: 1 }];
    expect(refundBreakdown({ lines, items: whole, deliveryCents: 9_900, reason: "DAMAGED" })).toMatchObject({ linesCents: 153_900, deliveryCents: 9_900, totalCents: 163_800, wholeOrder: true });
    const cool = refundBreakdown({ lines, items: whole, deliveryCents: 9_900, reason: "COOLING_OFF" });
    expect(cool).toMatchObject({ linesCents: 153_900, deliveryCents: 0, totalCents: 153_900, wholeOrder: true });
    expect(cool.note).toContain("covers the courier that collects the parcel");
    // Free delivery: nothing to say about the fee.
    expect(refundBreakdown({ lines, items: whole, deliveryCents: 0, reason: "COOLING_OFF" }).note).toBe("");
  });

  it("counts units refunded by earlier returns: the last request that completes the order refunds the delivery fee", () => {
    const second = refundBreakdown({ lines: lines.map((l) => (l.variantId === "oil" ? { ...l, returned: 1 } : l)), items: [{ variantId: "oil", qty: 1 }, { variantId: "grinder", qty: 1 }], deliveryCents: 9_900, reason: "DEFECTIVE" });
    expect(second).toMatchObject({ linesCents: 94_400, deliveryCents: 9_900, totalCents: 104_300, wholeOrder: true });
    expect(refundBreakdown({ lines, items: [{ variantId: "oil", qty: 1 }, { variantId: "grinder", qty: 1 }], deliveryCents: 9_900, reason: "DEFECTIVE" })).toMatchObject({ wholeOrder: false, deliveryCents: 0 });
  });

  it("never refunds more money than was paid in money (points come back as points)", () => {
    const r = refundBreakdown({ lines, items: [{ variantId: "oil", qty: 2 }, { variantId: "grinder", qty: 1 }], deliveryCents: 9_900, reason: "DEFECTIVE", paidCents: 150_000 });
    expect(r).toMatchObject({ totalCents: 150_000, capped: true });
    expect(r.note).toContain("Capped at what was paid in money");
  });

  it("restocks a change of mind or a wrong item, never faulty or damaged goods", () => {
    expect(restockByDefault("COOLING_OFF")).toBe(true);
    expect(restockByDefault("WRONG_ITEM")).toBe(true);
    expect(restockByDefault("DEFECTIVE")).toBe(false);
    expect(restockByDefault("DAMAGED")).toBe(false);
  });
});

describe("statuses and messages", () => {
  it("moves forward only, and declining is possible until the money moves", () => {
    expect(RETURN_MOVES.REQUESTED).toEqual(["APPROVED", "DECLINED"]);
    expect(canMoveReturn("RECEIVED", "REFUNDED")).toBe(true);
    expect(canMoveReturn("REFUNDED", "DECLINED")).toBe(false);
    expect(canMoveReturn("DECLINED", "APPROVED")).toBe(false);
    expect(OPEN_RETURN_STATUSES).toEqual(["REQUESTED", "APPROVED", "COLLECTION_BOOKED", "RECEIVED"]);
    expect(returnNumber(7)).toBe("RT-000007");
  });

  it("tells the member what happened at every step, in words that pass the copy screen", () => {
    const base = { number: "RT-000007", orderCode: "7K2M9P" };
    const msgs = [
      returnStatusMessage({ ...base, status: "REQUESTED" }),
      returnStatusMessage({ ...base, status: "APPROVED" }),
      returnStatusMessage({ ...base, status: "COLLECTION_BOOKED", courier: "The Courier Guy", waybill: "TCG123" }),
      returnStatusMessage({ ...base, status: "RECEIVED" }),
      returnStatusMessage({ ...base, status: "REFUNDED", refundCents: 59_500 }),
      returnStatusMessage({ ...base, status: "DECLINED", decisionNote: "the seal was broken" }),
    ];
    expect(msgs[2].text).toContain("(The Courier Guy, waybill TCG123)");
    expect(msgs[4].text).toContain("refunded R595.00");
    expect(msgs[5].text).toContain("We can't accept return RT-000007 for order 7K2M9P: the seal was broken");
    const texts = [...msgs.flatMap((m) => [m.subject, m.text]), ...Object.values(RETURN_REASON).flatMap((r) => [r.label, r.hint]), ...Object.values(RETURN_STATUS).flatMap((s) => [s.label, s.member, s.hint])];
    expect(texts.flatMap((t) => screenCopy(t).map((f) => `“${f.term}” in: ${t}`))).toEqual([]);
    expect(texts.filter((t) => /\b(customers?|shoppers?|clients?)\b/i.test(t))).toEqual([]);
  });
});
