import { describe, expect, it } from "vitest";
import { priceBasket, redeemableCents, livePromotions, type PricingData } from "@/components/pos/lib/pricing";
import {
  classifyBlock, countCash, DENOMINATIONS, denomLabel, maskPhone, maxRedeemable, memberNoFrom, orderSla, parseOrderQr, parseRands, quickCash, receiptNumber, uuid,
} from "@/components/pos/lib/rules";
import { checkCompliance, DEFAULT_COMPLIANCE } from "@/lib/compliance";
import type { BootPromotion } from "@/server/pos/types";

const promo = (p: Partial<BootPromotion> & Pick<BootPromotion, "id" | "kind" | "value">): BootPromotion => ({
  name: p.id,
  description: null,
  code: null,
  categoryIds: [],
  productIds: [],
  minSpendCents: 0,
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: "2027-01-01T00:00:00Z",
  days: [],
  startMinute: null,
  endMinute: null,
  ...p,
});

const data = (over: Partial<PricingData> = {}): PricingData => ({
  storeId: "s1",
  regionId: "r1",
  vatRegistered: true,
  compliance: DEFAULT_COMPLIANCE,
  earnPer100: 5,
  tierSavingsPct: { SEED: 3, SPROUT: 5, BLOOM: 7, HARVEST: 10 },
  variants: {
    oil: { id: "oil", productId: "p-oil", categoryId: "wellness", regClass: "CBD", rrpCents: 59500, shelfCents: null, markdownPct: 0 },
    balm: { id: "balm", productId: "p-balm", categoryId: "wellness", regClass: "CBD", rrpCents: 38500, shelfCents: null, markdownPct: 0 },
    flower: { id: "flower", productId: "p-flower", categoryId: "flower", regClass: "THC", rrpCents: 62000, shelfCents: null, markdownPct: 0 },
    grinder: { id: "grinder", productId: "p-grinder", categoryId: "accessories", regClass: "ACCESSORY", rrpCents: 35000, shelfCents: 32900, markdownPct: 0 },
    tray: { id: "tray", productId: "p-tray", categoryId: "accessories", regClass: "ACCESSORY", rrpCents: 28000, shelfCents: null, markdownPct: 20 },
  },
  promotions: [],
  priceLists: [],
  ...over,
});

const AT = new Date("2026-09-27T10:00:00+02:00"); // a Sunday morning, SAST

describe("till pricing (offline price book)", () => {
  it("uses the franchisee's shelf price and near-expiry markdowns", () => {
    const q = priceBasket(data(), [{ variantId: "grinder", qty: 1 }, { variantId: "tray", qty: 1 }], { at: AT });
    expect(q.lines[0].unitPriceCents).toBe(32900);
    expect(q.lines[1].unitPriceCents).toBe(22400);
    expect(q.lines[1].priceRule).toBe("Near-expiry −20%");
    expect(q.totalCents).toBe(32900 + 22400);
    expect(q.vatCents).toBe(Math.round((32900 * 15) / 115) + Math.round((22400 * 15) / 115));
  });

  it("applies multi-buys and never discounts licensed medicines (s18A)", () => {
    const d = data({ promotions: [promo({ id: "cbd2", kind: "MULTIBUY", value: 80000, buyQty: 2, categoryIds: ["wellness"] }), promo({ id: "all10", kind: "PERCENT", value: 10 })] });
    const q = priceBasket(d, [{ variantId: "oil", qty: 1 }, { variantId: "balm", qty: 1 }, { variantId: "flower", qty: 1 }], { at: AT });
    const flower = q.lines.find((l) => l.variantId === "flower")!;
    expect(flower.discountCents).toBe(0);
    expect(flower.noEarn).toBe(true);
    expect(q.discountCents).toBe(59500 + 38500 - 80000);
    expect(q.applied.map((a) => a.id)).toContain("cbd2");
    expect(redeemableCents(q)).toBe(80000);
  });

  it("skips promotions outside their happy-hour window and date range", () => {
    const happy = promo({ id: "hh", kind: "PERCENT", value: 10, days: [1, 2, 3, 4, 5], startMinute: 16 * 60, endMinute: 18 * 60 });
    const expired = promo({ id: "old", kind: "PERCENT", value: 50, endsAt: "2026-09-01T00:00:00Z" });
    expect(livePromotions([happy, expired], AT)).toHaveLength(0);
    expect(livePromotions([happy], new Date("2026-09-28T16:30:00+02:00")).map((p) => p.id)).toEqual(["hh"]);
    expect(priceBasket(data({ promotions: [happy, expired] }), [{ variantId: "balm", qty: 1 }], { at: AT }).discountCents).toBe(0);
  });

  it("gives members their instant tier price (or a better member deal), never on medicines", () => {
    const member = {
      id: "m",
      name: "Rewards member price",
      kind: "MEMBER" as const,
      channel: null,
      tiers: ["BLOOM" as const, "HARVEST" as const],
      storeIds: [],
      regionIds: [],
      adjustPct: -5,
      startsAt: null,
      endsAt: null,
      active: true,
      priority: 0,
      items: [],
      createdAt: "2026-01-01T00:00:00Z",
    };
    const d = data({ priceLists: [member] });
    const items = [{ variantId: "balm", qty: 1 }, { variantId: "flower", qty: 1 }];
    const walkIn = priceBasket(d, items, { at: AT });
    const bloom = priceBasket(d, items, { at: AT, member: true, tier: "BLOOM" });
    const seed = priceBasket(d, items, { at: AT, member: true, tier: "SEED" });
    expect(walkIn.lines[0].unitPriceCents).toBe(38500);
    // Seed: 3% off instantly (the −5% member list is Bloom/Harvest only).
    expect(seed.lines[0].unitPriceCents).toBe(37345);
    expect(seed.lines[0].priceRule).toBe("Seed Rewards −3%");
    // Bloom: 7% tier price beats the −5% member list.
    expect(bloom.lines[0].unitPriceCents).toBe(35805);
    expect(bloom.lines[0].priceRule).toBe("Bloom Rewards −7%");
    expect(bloom.memberSavingsCents).toBe(38500 - 35805);
    expect(bloom.lines[1].unitPriceCents).toBe(62000);
    expect(bloom.lines[1].memberSavingsCents).toBe(0);
    expect(bloom.joinSavingsCents).toBe(0);
    // Walk-ins see what joining at Seed would save on this basket (not on the medicine).
    expect(walkIn.memberSavingsCents).toBe(0);
    expect(walkIn.joinSavingsCents).toBe(38500 - 37345);
    expect(bloom.pointsEstimate).toBeGreaterThan(0);
    expect(walkIn.pointsEstimate).toBe(0);
  });

  it("reports invalid promo codes and charges no VAT for non-VAT vendors", () => {
    const q = priceBasket(data({ vatRegistered: false }), [{ variantId: "balm", qty: 1 }], { at: AT, code: "NOPE" });
    expect(q.codeError).toBeTruthy();
    expect(q.vatCents).toBe(0);
  });
});

describe("till rules", () => {
  it("numbers receipts per device", () => {
    expect(receiptNumber("PTA01", "B", 42)).toBe("PTA01-B00042");
    expect(receiptNumber("CPT02", "A", 123456)).toBe("CPT02-A123456");
  });

  it("counts a cash drawer by denomination", () => {
    expect(DENOMINATIONS[0]).toBe(20000);
    expect(DENOMINATIONS.at(-1)).toBe(10);
    expect(countCash({ "20000": 2, "5000": 1, "500": 3, "10": 4, bogus: 9 } as Record<string, number>)).toBe(40000 + 5000 + 1500 + 40);
    expect(countCash({ "1000": -2 })).toBe(0);
    expect(denomLabel(20000)).toBe("R200");
    expect(denomLabel(50)).toBe("50c");
  });

  it("suggests likely cash tendered", () => {
    expect(quickCash(38500)).toEqual([38500, 39000, 40000, 50000]);
    expect(quickCash(10000)).toEqual([10000, 20000, 50000]);
    expect(quickCash(0)).toEqual([]);
  });

  it("classifies every compliance block the engine produces", () => {
    const flower = { name: "Sunset Kush · 3.5g", regClass: "THC" as const, grams: 3.5, qty: 1 };
    const a = checkCompliance({ items: [flower], channel: "POS", customer: null, storeLicences: ["THC"], staffCanDispense: false });
    expect(a.blocks.map(classifyBlock)).toEqual(["AGE", "PATIENT", "DISPENSER"]);
    const b = checkCompliance({ items: [{ ...flower, qty: 20 }], channel: "POS", customer: { ageVerified: true, patient: { active: true, remainingGrams: 10 } }, storeLicences: ["THC"], staffCanDispense: true });
    expect(b.blocks.map(classifyBlock)).toEqual(["QUANTITY"]);
    const c = checkCompliance({ items: [flower], channel: "POS", customer: { ageVerified: true, age: 17 }, storeLicences: [] });
    expect(c.blocks.map(classifyBlock)).toEqual(["LICENCE", "UNDERAGE", "PATIENT"]);
    expect(classifyBlock("Daily limit is 30g per customer (…)")).toBe("DAILY_LIMIT");
    expect(classifyBlock("Something new")).toBe("OTHER");
  });

  it("times online orders against the ready SLA", () => {
    const placed = new Date("2026-09-27T10:00:00Z");
    expect(orderSla(placed, null, new Date("2026-09-27T10:04:00Z"))).toEqual({ minutes: 4, state: "ok" });
    expect(orderSla(placed, null, new Date("2026-09-27T10:11:00Z")).state).toBe("warn");
    expect(orderSla(placed, null, new Date("2026-09-27T10:16:00Z")).state).toBe("late");
    expect(orderSla(placed, "2026-09-27T10:09:00Z", new Date("2026-09-27T12:00:00Z"))).toEqual({ minutes: 9, state: "ok" });
  });

  it("caps points redemption", () => {
    expect(maxRedeemable({ balance: 500, eligibleCents: 30000, dueCents: 45000, minRedeem: 20 })).toBe(300);
    expect(maxRedeemable({ balance: 120, eligibleCents: 30000, dueCents: 45000, minRedeem: 20 })).toBe(120);
    expect(maxRedeemable({ balance: 19, eligibleCents: 30000, dueCents: 45000, minRedeem: 20 })).toBe(0);
    expect(maxRedeemable({ balance: 500, eligibleCents: 0, dueCents: 45000, minRedeem: 20 })).toBe(0);
    expect(maxRedeemable({ balance: 500, eligibleCents: 30050, dueCents: 20099, minRedeem: 20 })).toBe(200);
  });

  it("reads order collection QR codes", () => {
    expect(parseOrderQr("HHORDER:TC9D34:122801")).toEqual({ orderCode: "TC9D34", collectionCode: "122801" });
    expect(parseOrderQr(" hhorder:tc9d34:122801 ")).toEqual({ orderCode: "TC9D34", collectionCode: "122801" });
    expect(parseOrderQr("HHORDER:TC9D34")).toBeNull();
    expect(parseOrderQr("HHORDER:TC9D34:12AB01")).toBeNull();
    expect(parseOrderQr("HH0012345")).toBeNull();
    expect(memberNoFrom("HHORDER:HH00123:1234567")).toBeNull();
  });

  it("masks phones, reads member QR codes and parses rand amounts", () => {
    expect(maskPhone("+27825551234")).toBe("082 ••• 1234");
    expect(memberNoFrom("HH0012345")).toBe("HH0012345");
    expect(memberNoFrom("hh://member/hh0100002?x=1")).toBe("HH0100002");
    expect(memberNoFrom("6001234000433")).toBeNull();
    expect(parseRands("R 1 234,50")).toBe(123450);
    expect(parseRands("385")).toBe(38500);
    expect(parseRands("12.345")).toBeNull();
    expect(parseRands("abc")).toBeNull();
  });

  it("generates v4 UUIDs for idempotent sale ids", () => {
    const id = uuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid()).not.toBe(id);
  });
});
