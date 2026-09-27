import { describe, expect, it } from "vitest";
import { CART_MAX_LINES, CART_MAX_QTY, cartCount, parseCart, redeemableGuilders, serializeCart, withItem, withQty } from "@/server/shop/cart-codec";
import { openState, parseHours, weekRows } from "@/server/shop/hours";
import { readPhoneToken, signPhone } from "@/server/shop/phone-token";

const A = "3f2a9c1e-5b7d-4e0a-9c1f-2b3d4e5f6a7b"; // seeded ids are UUIDs
const B = "clx9z8y7w6v5u4t3s2r1q0p9";            // app-created ids are cuids

describe("bag cookie codec", () => {
  it("round-trips lines", () => {
    const items = [{ variantId: A, qty: 2 }, { variantId: B, qty: 1 }];
    expect(parseCart(serializeCart(items))).toEqual(items);
  });
  it("ignores junk, merges duplicates and caps quantities", () => {
    expect(parseCart(`${A}_2.${A}_3.<script>_1.${B}_x.${B}_-1`)).toEqual([{ variantId: A, qty: 5 }]);
    expect(parseCart(`${A}_999`)).toEqual([{ variantId: A, qty: CART_MAX_QTY }]);
    expect(parseCart(undefined)).toEqual([]);
  });
  it("adds, updates and removes lines", () => {
    let bag = withItem([], A, 1);
    bag = withItem(bag, A, 2);
    bag = withItem(bag, B, 1);
    expect(bag).toEqual([{ variantId: A, qty: 3 }, { variantId: B, qty: 1 }]);
    expect(cartCount(bag)).toBe(4);
    expect(withQty(bag, A, 0)).toEqual([{ variantId: B, qty: 1 }]);
    expect(withQty(bag, B, 50)[1].qty).toBe(CART_MAX_QTY);
  });
  it("limits the number of lines", () => {
    let bag: { variantId: string; qty: number }[] = [];
    for (let i = 0; i < CART_MAX_LINES + 5; i++) bag = withItem(bag, `variant-${String(i).padStart(4, "0")}`, 1);
    expect(bag).toHaveLength(CART_MAX_LINES);
  });
});

describe("Guilders redemption cap", () => {
  it("caps at the balance and the share of incentive-eligible spend", () => {
    expect(redeemableGuilders({ balance: 500, eligibleCents: 40_000, maxPct: 50, min: 20 })).toBe(200);
    expect(redeemableGuilders({ balance: 80, eligibleCents: 40_000, maxPct: 50, min: 20 })).toBe(80);
  });
  it("excludes medicines and respects the minimum", () => {
    expect(redeemableGuilders({ balance: 500, eligibleCents: 0, maxPct: 50, min: 20 })).toBe(0);
    expect(redeemableGuilders({ balance: 15, eligibleCents: 90_000, maxPct: 50, min: 20 })).toBe(0);
  });
});

describe("store hours (SAST)", () => {
  const hours = parseHours({ mon: ["09:00", "20:00"], tue: ["09:00", "20:00"], sat: ["09:00", "13:00"], sun: null, bogus: ["x"] });
  it("parses and drops malformed days", () => {
    expect(hours.mon).toEqual(["09:00", "20:00"]);
    expect(hours.sun).toBeUndefined();
    expect(parseHours("nope")).toEqual({});
  });
  it("knows when a store is open", () => {
    // Monday 28 Sep 2026, 10:30 SAST = 08:30 UTC
    expect(openState(hours, new Date("2026-09-28T08:30:00Z"))).toMatchObject({ open: true, label: "Open until 20:00" });
    // Monday 07:00 SAST — opens later today
    expect(openState(hours, new Date("2026-09-28T05:00:00Z"))).toMatchObject({ open: false, label: "Opens today 09:00" });
    // Monday 21:00 SAST — opens tomorrow
    expect(openState(hours, new Date("2026-09-28T19:00:00Z")).label).toBe("Opens tomorrow 09:00");
    // Saturday 14:00 SAST — closed Sunday, opens Monday
    expect(openState(hours, new Date("2026-10-03T12:00:00Z")).label).toBe("Opens Monday 09:00");
  });
  it("renders a Monday-first week", () => {
    const rows = weekRows(hours, new Date("2026-09-28T08:30:00Z"));
    expect(rows[0]).toMatchObject({ label: "Monday", span: "09:00–20:00", today: true });
    expect(rows[6]).toMatchObject({ label: "Sunday", span: "Closed" });
  });
});

describe("verified-phone token", () => {
  it("accepts its own signature until it expires", () => {
    const t = signPhone("+27825551234", 20, 1_000);
    expect(readPhoneToken(t, 2_000)).toBe("+27825551234");
    expect(readPhoneToken(t, 1_000 + 21 * 60_000)).toBeNull();
  });
  it("rejects tampering", () => {
    const t = signPhone("+27825551234");
    expect(readPhoneToken(t.replace("+2782", "+2783"))).toBeNull();
    expect(readPhoneToken("garbage")).toBeNull();
  });
});
