import { describe, expect, it } from "vitest";
import { allocateProportionally, exVat, vatOf, zar, zarCompact } from "@/lib/money";
import { checkSaId, normalisePhone, publicHolidays, marketingWindow, nextMarketingSlot, ageOn } from "@/lib/sa";
import { allocate } from "@/lib/fefo";
import { checkCompliance, DEFAULT_COMPLIANCE, screenCopy, validateProduct } from "@/lib/compliance";
import { applyPromotions, describePromo, type PromoInput } from "@/lib/promotions";
import { promoWindowOpen, resolvePrice, type PriceListRule } from "@/lib/pricing-rules";
import { pointsFor, tierFor, nextTier, tierBenefits, DEFAULT_TIER_SAVINGS } from "@/lib/loyalty-rules";
import { routeOrder, type RouteCandidate } from "@/lib/routing";
import { suggestQty } from "@/lib/replenish";
import { interestsFrom, isAudience, segmentOf } from "@/lib/rfm";
import { buildStatement } from "@/lib/statement";
import { dayKey, rangeFromParams } from "@/lib/format";

/** Build a valid SA ID from 12 digits by appending the Luhn check digit. */
function withCheckDigit(first12: string) {
  for (let d = 0; d <= 9; d++) if (checkSaId(first12 + d).valid) return first12 + d;
  throw new Error("no check digit");
}

describe("money", () => {
  it("splits VAT out of inclusive prices", () => {
    expect(vatOf(11500)).toBe(1500);
    expect(exVat(11500)).toBe(10000);
  });
  it("formats rands", () => {
    expect(zar(123450)).toBe("R1,234.50");
    expect(zar(-500)).toBe("-R5.00");
    expect(zarCompact(1_234_567_00)).toBe("R1.23m");
  });
  it("allocates proportionally without losing cents", () => {
    const parts = allocateProportionally(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe("South Africa rules", () => {
  it("validates SA ID numbers and extracts date of birth", () => {
    const id = withCheckDigit("900215500908");
    const r = checkSaId(id);
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.dob.toISOString().slice(0, 10)).toBe("1990-02-15");
      expect(r.sex).toBe("M");
      expect(r.citizen).toBe(true);
    }
    const bad = id.slice(0, 12) + ((Number(id[12]) + 1) % 10);
    expect(checkSaId(bad).valid).toBe(false);
    expect(checkSaId("9002305009081").valid).toBe(false); // 30 Feb
  });
  it("computes age", () => {
    expect(ageOn(new Date("2008-09-28T00:00:00Z"), new Date("2026-09-27T00:00:00Z"))).toBe(17);
    expect(ageOn(new Date("2008-09-27T00:00:00Z"), new Date("2026-09-27T00:00:00Z"))).toBe(18);
  });
  it("normalises mobile numbers", () => {
    expect(normalisePhone("082 555 1234")).toBe("+27825551234");
    expect(normalisePhone("+27 71 000 0000")).toBe("+27710000000");
    expect(normalisePhone("011 555 1234")).toBeNull();
  });
  it("knows public holidays incl. Easter and Sunday observance", () => {
    const h2026 = publicHolidays(2026);
    expect(h2026.get("2026-04-03")).toBe("Good Friday");
    expect(h2026.get("2026-04-06")).toBe("Family Day");
    expect(h2026.get("2026-08-10")).toContain("observed"); // Women's Day 9 Aug 2026 is a Sunday
  });
  it("enforces CPA direct-marketing windows", () => {
    expect(marketingWindow(new Date("2026-09-28T10:00:00+02:00")).allowed).toBe(true); // Monday
    expect(marketingWindow(new Date("2026-09-28T21:00:00+02:00")).allowed).toBe(false);
    expect(marketingWindow(new Date("2026-09-26T12:30:00+02:00")).allowed).toBe(true); // Saturday
    expect(marketingWindow(new Date("2026-09-26T14:00:00+02:00")).allowed).toBe(false);
    expect(marketingWindow(new Date("2026-09-27T10:00:00+02:00")).allowed).toBe(false); // Sunday
    expect(marketingWindow(new Date("2026-09-24T10:00:00+02:00")).allowed).toBe(false); // Heritage Day
    expect(marketingWindow(new Date("2026-11-04T10:00:00+02:00"))).toEqual({ allowed: false, reason: "Public holiday (Local government elections)" }); // proclaimed
    expect(marketingWindow(new Date("2026-11-05T10:00:00+02:00")).allowed).toBe(true);
    expect(nextMarketingSlot(new Date("2026-09-27T10:00:00+02:00")).toISOString()).toBe("2026-09-28T06:00:00.000Z");
  });
  it("uses SAST business days", () => {
    expect(dayKey(new Date("2026-09-27T22:30:00Z"))).toBe("2026-09-28");
    const r = rangeFromParams({ from: "2026-09-01", to: "2026-09-30" });
    expect(r.days).toBe(30);
    expect(r.start.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });
});

describe("FEFO allocation", () => {
  const lots = [
    { batchId: "late", onHand: 10, unitCostCents: 100, sellable: true, expiresAt: new Date("2027-06-01"), packedAt: new Date("2026-06-01") },
    { batchId: "early", onHand: 3, unitCostCents: 90, sellable: true, expiresAt: new Date("2026-12-01"), packedAt: new Date("2026-05-01") },
    { batchId: "recalled", onHand: 50, unitCostCents: 80, sellable: false, expiresAt: new Date("2026-10-01"), packedAt: new Date("2026-04-01") },
  ];
  it("picks earliest expiry first and skips unsellable lots", () => {
    const r = allocate(lots, 5);
    expect(r.allocations).toEqual([
      { batchId: "early", qty: 3, unitCostCents: 90 },
      { batchId: "late", qty: 2, unitCostCents: 100 },
    ]);
    expect(r.short).toBe(0);
  });
  it("reports shortfall", () => expect(allocate(lots, 20).short).toBe(7));
});

describe("compliance", () => {
  const flower = { name: "Durban Poison 3.5g", regClass: "THC" as const, grams: 3.5, qty: 2 };
  const oil = { name: "CBD Oil 600mg", regClass: "CBD" as const, qty: 1 };
  const papers = { name: "King Size Papers", regClass: "ACCESSORY" as const, qty: 1, tobaccoRelated: true };
  const adult = { ageVerified: true, age: 30 };
  it("blocks licence-gated products at unlicensed stores", () => {
    const r = checkCompliance({ items: [flower], channel: "POS", customer: adult });
    expect(r.ok).toBe(false);
    expect(r.blocks[0]).toContain("licence");
  });
  it("medical mode: needs a valid patient authorisation, quantity headroom and a dispenser", () => {
    const patient = { ageVerified: true, age: 40, patient: { active: true, remainingGrams: 10 } };
    expect(checkCompliance({ items: [flower], channel: "POS", customer: adult, storeLicences: ["THC"], staffCanDispense: true }).blocks[0]).toContain("authorisation");
    expect(checkCompliance({ items: [flower], channel: "POS", customer: patient, storeLicences: ["THC"], staffCanDispense: true }).ok).toBe(true);
    expect(checkCompliance({ items: [flower], channel: "POS", customer: patient, storeLicences: ["THC"], staffCanDispense: false }).ok).toBe(false);
    const over = checkCompliance({ items: [{ ...flower, qty: 3 }], channel: "COLLECT", customer: patient, storeLicences: ["THC"] });
    expect(over.blocks[0]).toContain("authorised quantity");
  });
  it("adult-use mode: verified adults within the daily limit", () => {
    const settings = { ...DEFAULT_COMPLIANCE, thcMode: "ADULT_USE" as const };
    expect(checkCompliance({ items: [flower], channel: "COLLECT", customer: adult, storeLicences: ["THC"], settings }).ok).toBe(true);
    const over = checkCompliance({ items: [flower], channel: "POS", customer: adult, storeLicences: ["THC"], gramsToday: 25, settings });
    expect(over.ok).toBe(false);
    expect(over.gramsInCart).toBe(7);
  });
  it("never ships licence-gated products by courier", () => {
    const r = checkCompliance({ items: [flower], channel: "COURIER", customer: adult, storeLicences: ["THC"] });
    expect(r.blocks.join()).toContain("courier");
  });
  it("sells to members only, unless HQ switches the rule off", () => {
    expect(checkCompliance({ items: [oil], channel: "POS", customer: null, ageCheckedAtCounter: true }).blocks).toEqual(["Members only: add the member to the sale, or sign them up, first"]);
    expect(checkCompliance({ items: [oil], channel: "POS", customer: null, ageCheckedAtCounter: true, settings: { ...DEFAULT_COMPLIANCE, membersOnly: false } }).ok).toBe(true);
  });
  it("requires an age check for CBD unless ID was checked at the counter", () => {
    const unverified = { ageVerified: false }; // e.g. a member taken from their card while the till was offline
    expect(checkCompliance({ items: [oil], channel: "POS", customer: unverified }).blocks.join()).toContain("Age verification");
    expect(checkCompliance({ items: [oil], channel: "POS", customer: unverified, ageCheckedAtCounter: true }).ok).toBe(true);
  });
  it("blocks minors even when an ID was sighted", () => {
    const r = checkCompliance({ items: [oil], channel: "POS", customer: { ageVerified: true, age: 17 }, ageCheckedAtCounter: true });
    expect(r.blocks.join()).toContain("Under 18");
  });
  it("keeps Tobacco-Bill related products in-store when that mode is on", () => {
    const settings = { ...DEFAULT_COMPLIANCE, tobaccoBillMode: true };
    expect(checkCompliance({ items: [papers], channel: "COURIER", customer: adult, settings }).ok).toBe(false);
    expect(checkCompliance({ items: [papers], channel: "POS", customer: adult, settings }).ok).toBe(true);
  });
  it("validates Schedule 0 CBD master data", () => {
    const facts = { ingredients: "MCT oil, broad-spectrum hemp extract", allergens: ["none"] }; // CBD supplements declare these too
    expect(validateProduct({ regClass: "CBD", cbdMgPerPack: 600, cbdMgPerDay: 20, claims: ["Supports everyday calm"], ...facts })).toEqual([]);
    expect(validateProduct({ regClass: "CBD", cbdMgPerPack: 1000, cbdMgPerDay: 40, ...facts })).toHaveLength(2);
    expect(validateProduct({ regClass: "CBD", cbdMgPerPack: 300, cbdMgPerDay: 10, claims: ["Cures anxiety"], ...facts }).length).toBeGreaterThan(0);
  });
  it("screens marketing copy", () => {
    expect(screenCopy("Double Points this weekend on all CBD wellness")).toEqual([]);
    expect(screenCopy("Get stoned with our new drop").length).toBeGreaterThan(0);
    expect(screenCopy("This oil cures insomnia").length).toBe(2);
  });
});

describe("promotions", () => {
  const lines = [
    { key: "a", productId: "p1", categoryId: "flower", qty: 2, unitPriceCents: 30000 },
    { key: "b", productId: "p2", categoryId: "acc", qty: 1, unitPriceCents: 10000 },
  ];
  const base = { code: null, categoryIds: [] as string[], productIds: [] as string[], minSpendCents: 0 };
  const promos: PromoInput[] = [
    { ...base, id: "p10", name: "10% flower", kind: "PERCENT", value: 10, categoryIds: ["flower"] },
    { ...base, id: "p20", name: "20% everything", kind: "PERCENT", value: 20, code: "WINDMILL20" },
    { ...base, id: "f50", name: "R50 off R500", kind: "FIXED", value: 5000, minSpendCents: 50000 },
    { ...base, id: "x2", name: "Double Points", kind: "MULTIPLIER", value: 200 },
  ];
  it("applies the best line discount plus cart-level fixed, and multipliers", () => {
    const r = applyPromotions(lines, promos);
    expect(r.lines[0].promoId).toBe("p10");
    expect(r.discountCents).toBe(6000 + 5000); // 10% on flower + R50 spread across the basket
    expect(r.pointsMultiplier).toBe(2);
    expect(r.totalCents).toBe(70000 - 11000);
  });
  it("only applies code promos when the code is entered", () => {
    const r = applyPromotions(lines, promos, "windmill20");
    expect(r.lines[1].promoId).toBe("p20");
    expect(r.discountCents).toBe(14000 + 5000);
    expect(applyPromotions(lines, promos).lines[1].promoId).toBeUndefined();
    expect(applyPromotions(lines, promos, "NOPE").codeError).toBeTruthy();
  });
  const prerolls = (qty: number) => [{ key: "pr", productId: "pr1", categoryId: "pre-rolls", qty, unitPriceCents: 19000 }];
  it("mix & match multibuy: any 3 pre-rolls for R500, and suggests completing the set", () => {
    const multi: PromoInput = { ...base, id: "m3", name: "Any 3 pre-rolls for R500", kind: "MULTIBUY", value: 50000, buyQty: 3, categoryIds: ["pre-rolls"] };
    const r = applyPromotions(prerolls(3), [multi]);
    expect(r.totalCents).toBe(50000);
    const two = applyPromotions(prerolls(2), [multi]);
    expect(two.discountCents).toBe(0);
    expect(two.suggestions[0].message).toContain("Add 1 more");
  });
  it("buy 2 get 1 free rewards the cheapest unit", () => {
    const b2g1: PromoInput = { ...base, id: "b2g1", name: "Buy 2 get 1 free", kind: "BUY_X_GET_Y", value: 0, buyQty: 2, getQty: 1, rewardPercent: 100, categoryIds: ["edibles"] };
    const mixed = [
      { key: "e1", productId: "e1", categoryId: "edibles", qty: 2, unitPriceCents: 28000 },
      { key: "e2", productId: "e2", categoryId: "edibles", qty: 1, unitPriceCents: 24000 },
    ];
    const r = applyPromotions(mixed, [b2g1]);
    expect(r.discountCents).toBe(24000);
    expect(r.lines[1].promoId).toBe("b2g1");
  });
  it("complementary deal: buy any flower, get papers 50% off — or prompts to add them", () => {
    const comp: PromoInput = {
      ...base, id: "comp", name: "Papers half price with flower", kind: "BUY_X_GET_Y", value: 0, buyQty: 1, getQty: 1, rewardPercent: 50,
      categoryIds: ["flower"], rewardProductIds: ["papers"],
    };
    const withPapers = [...lines, { key: "c", productId: "papers", categoryId: "acc", qty: 1, unitPriceCents: 3500 }];
    const r = applyPromotions(withPapers, [comp]);
    expect(r.lines[2].discountCents).toBe(1750);
    const prompt = applyPromotions(lines, [comp]);
    expect(prompt.suggestions[0].productIds).toEqual(["papers"]);
    // Without the reward in the basket, the flower keeps its own line deal.
    const both = applyPromotions(lines, [comp, promos[0]]);
    expect(both.lines[0]).toMatchObject({ discountCents: 6000, promoId: "p10" });
  });
  it("doesn't suggest multi-buys when nothing in the basket qualifies", () => {
    const multi: PromoInput = { ...base, id: "m3", name: "Any 3 pre-rolls for R500", kind: "MULTIBUY", value: 50000, buyQty: 3, categoryIds: ["pre-rolls"] };
    expect(applyPromotions(lines, [multi]).suggestions).toEqual([]);
  });
  it("gift with purchase: spend R600, get the grinder free", () => {
    const gift: PromoInput = { ...base, id: "gift", name: "Free grinder over R600", kind: "BUY_X_GET_Y", value: 0, minSpendCents: 60000, getQty: 1, rewardPercent: 100, rewardProductIds: ["grinder"] };
    const basket = [...lines, { key: "g", productId: "grinder", categoryId: "acc", qty: 1, unitPriceCents: 35000 }];
    expect(applyPromotions(basket, [gift]).lines[2].discountCents).toBe(35000);
    expect(applyPromotions([lines[1]], [gift]).lines[0].discountCents).toBe(0);
  });
  it("excluded lines (medicines, s18A) neither get nor unlock deals", () => {
    const med = [{ key: "m", productId: "thc", categoryId: "flower", qty: 2, unitPriceCents: 30000, noPromo: true }, lines[1]];
    const r = applyPromotions(med, promos);
    expect(r.lines[0].discountCents).toBe(0);
    expect(r.applied.find((a) => a.id === "f50")).toBeUndefined(); // R500 threshold not met without the medicine
    expect(r.subtotalCents).toBe(70000);
  });
  it("describes deals in plain English", () => {
    expect(describePromo({ ...base, id: "x", name: "", kind: "MULTIBUY", value: 50000, buyQty: 3 })).toBe("Any 3 for R500");
    expect(describePromo({ ...base, id: "x", name: "", kind: "BUY_X_GET_Y", value: 0, buyQty: 2, getQty: 1, rewardPercent: 100 })).toBe("Buy 2, get 1 free");
  });
});

describe("price rules", () => {
  const at = new Date("2026-09-28T10:00:00+02:00");
  const mk = (over: Partial<PriceListRule>): PriceListRule => ({
    id: "l", name: "List", kind: "ZONE", tiers: [], storeIds: [], regionIds: [], active: true, priority: 0, createdAt: at, items: [], ...over,
  });
  const v = { variantId: "v", rrpCents: 65000, qty: 1 };
  const ctx = { storeId: "s1", regionId: "WC", channel: "POS" as const, member: false, at };
  it("uses zone prices, but the franchisee's shelf price wins in store", () => {
    const zone = mk({ id: "z", regionIds: ["WC"], items: [{ variantId: "v", priceCents: 69000, minQty: 1 }] });
    expect(resolvePrice(v, [zone], ctx).shelfCents).toBe(69000);
    expect(resolvePrice({ ...v, storeShelfCents: 62000 }, [zone], ctx).unitCents).toBe(62000);
    expect(resolvePrice(v, [zone], { ...ctx, regionId: "GPN" }).shelfCents).toBe(65000);
  });
  it("applies member and tier prices only to members", () => {
    const member = mk({ id: "m", name: "Member price", kind: "MEMBER", adjustPct: -5 });
    const harvest = mk({ id: "o", name: "Harvest price", kind: "MEMBER", tiers: ["HARVEST"], adjustPct: -10 });
    expect(resolvePrice(v, [member, harvest], ctx).unitCents).toBe(65000);
    expect(resolvePrice(v, [member, harvest], { ...ctx, member: true, tier: "SEED" })).toMatchObject({ unitCents: 61750, rule: "Member price" });
    expect(resolvePrice(v, [member, harvest], { ...ctx, member: true, tier: "HARVEST" })).toMatchObject({ unitCents: 58500, rule: "Harvest price" });
  });
  it("gives members their tier's instant saving, unless a member deal or volume price is lower", () => {
    const seed = { ...ctx, member: true, tier: "SEED" as const, tierPct: 3 };
    const harvest = { ...ctx, member: true, tier: "HARVEST" as const, tierPct: 10 };
    expect(resolvePrice(v, [], { ...ctx, tierPct: 10 }).unitCents).toBe(65000);
    expect(resolvePrice(v, [], seed)).toMatchObject({ unitCents: 63050, rule: "Seed Rewards −3%" });
    expect(resolvePrice({ ...v, storeShelfCents: 60000 }, [], harvest)).toMatchObject({ unitCents: 54000, rule: "Harvest Rewards −10%" });
    const deal = mk({ id: "d", name: "Rewards deal", kind: "MEMBER", items: [{ variantId: "v", priceCents: 55000, minQty: 1 }] });
    expect(resolvePrice(v, [deal], seed)).toMatchObject({ unitCents: 55000, rule: "Rewards deal" });
    expect(resolvePrice(v, [deal], harvest)).toMatchObject({ unitCents: 55000, rule: "Rewards deal" });
    expect(resolvePrice({ ...v, incentives: false }, [deal], harvest).unitCents).toBe(65000); // medicines: no incentives (s18A)
    expect(resolvePrice({ ...v, markdownPct: 20 }, [], harvest).unitCents).toBe(46800); // clearance stacks on the member price
  });
  it("applies quantity breaks and scheduled windows", () => {
    const breaks = mk({ id: "b", name: "Volume", items: [{ variantId: "v", priceCents: 60000, minQty: 3 }] });
    expect(resolvePrice({ ...v, qty: 2 }, [breaks], ctx).unitCents).toBe(65000);
    expect(resolvePrice({ ...v, qty: 3 }, [breaks], ctx)).toMatchObject({ unitCents: 60000, rule: "Volume (3+)" });
    const future = mk({ id: "f", startsAt: new Date("2026-10-01T00:00:00+02:00"), items: [{ variantId: "v", priceCents: 68000, minQty: 1 }] });
    expect(resolvePrice(v, [future], ctx).shelfCents).toBe(65000);
  });
  it("skips incentive rules when incentives are not allowed", () => {
    const member = mk({ id: "m", name: "Member price", kind: "MEMBER", adjustPct: -5 });
    expect(resolvePrice({ ...v, incentives: false, markdownPct: 20 }, [member], { ...ctx, member: true }).unitCents).toBe(65000);
  });
  it("marks down near-expiry stock", () => {
    expect(resolvePrice({ ...v, markdownPct: 20 }, [], ctx)).toMatchObject({ unitCents: 52000, rule: "Near-expiry −20%" });
  });
  it("opens happy-hour windows in SAST", () => {
    const happy = { days: [5], startMinute: 16 * 60, endMinute: 18 * 60 }; // Fridays 16:00–18:00
    expect(promoWindowOpen(happy, new Date("2026-10-02T16:30:00+02:00"))).toBe(true);
    expect(promoWindowOpen(happy, new Date("2026-10-02T18:30:00+02:00"))).toBe(false);
    expect(promoWindowOpen(happy, new Date("2026-10-01T16:30:00+02:00"))).toBe(false);
  });
});

describe("loyalty", () => {
  it("earns the same points in every tier (tiers save instantly instead); promotions multiply", () => {
    expect(pointsFor(100_00, "SEED")).toBe(5);
    expect(pointsFor(100_00, "HARVEST")).toBe(5);
    expect(pointsFor(100_00, "SEED", 2)).toBe(10);
  });
  it("lists a tier's benefits headline first", () => {
    expect(tierBenefits("BLOOM", DEFAULT_TIER_SAVINGS, 5).slice(0, 2)).toEqual(["7% off instantly", "5 points per R100"]);
    expect(tierBenefits("SEED", { ...DEFAULT_TIER_SAVINGS, SEED: 0 }, 0)[0]).toBe("Birthday bonus");
  });
  it("computes tiers and progress", () => {
    expect(tierFor(0).key).toBe("SEED");
    expect(tierFor(800_000).key).toBe("BLOOM");
    expect(nextTier(1_000_000)?.tier.key).toBe("HARVEST");
    expect(nextTier(2_000_000)).toBeNull();
  });
});

describe("routing", () => {
  const c = (id: string, over: Partial<RouteCandidate>): RouteCandidate => ({
    id, name: id, kind: "RETAIL", city: "Pretoria", province: "GP", sameDay: true, clickCollect: true, active: true, available: { v: 5 }, ...over,
  });
  const cands = [c("hatfield", {}), c("menlyn", { available: { v: 0 } }), c("dc", { kind: "WAREHOUSE", city: "Midrand" }), c("cpt", { city: "Cape Town", province: "WC" })];
  it("keeps click & collect at the chosen store, or suggests alternatives", () => {
    expect(routeOrder({ fulfilment: "COLLECT", storeId: "hatfield", lines: [{ variantId: "v", qty: 2 }] }, cands)).toMatchObject({ ok: true, storeId: "hatfield" });
    const r = routeOrder({ fulfilment: "COLLECT", storeId: "menlyn", city: "Pretoria", province: "GP", lines: [{ variantId: "v", qty: 2 }] }, cands);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.alternatives[0].id).toBe("hatfield");
  });
  it("routes same-day to the nearest capable store and courier to a DC", () => {
    expect(routeOrder({ fulfilment: "SAME_DAY", city: "Cape Town", province: "WC", lines: [{ variantId: "v", qty: 1 }] }, cands)).toMatchObject({ storeId: "cpt" });
    expect(routeOrder({ fulfilment: "COURIER", city: "Durban", province: "KZN", lines: [{ variantId: "v", qty: 1 }] }, cands)).toMatchObject({ storeId: "dc" });
  });
});

describe("replenishment", () => {
  it("orders up to par when below reorder point", () => {
    expect(suggestQty({ available: 3, onOrder: 0, reorderPoint: 4, parLevel: 12, avgDaily: 0.2 })).toBe(9);
  });
  it("uses velocity when it beats par", () => {
    expect(suggestQty({ available: 5, onOrder: 0, reorderPoint: 4, parLevel: 12, avgDaily: 2 })).toBe(29);
  });
  it("does nothing when stock position is healthy", () => {
    expect(suggestQty({ available: 20, onOrder: 0, reorderPoint: 4, parLevel: 12, avgDaily: 1 })).toBe(0);
  });
});

describe("segments", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
  it("classifies customers", () => {
    expect(segmentOf({ visits: 0 }, now)).toBe("PROSPECT");
    expect(segmentOf({ visits: 12, lastPurchaseAt: ago(3), firstPurchaseAt: ago(300) }, now)).toBe("CHAMPION");
    expect(segmentOf({ visits: 1, lastPurchaseAt: ago(3), firstPurchaseAt: ago(3) }, now)).toBe("NEW");
    expect(segmentOf({ visits: 6, lastPurchaseAt: ago(90), firstPurchaseAt: ago(300) }, now)).toBe("AT_RISK");
    expect(segmentOf({ visits: 6, lastPurchaseAt: ago(200), firstPurchaseAt: ago(300) }, now)).toBe("LAPSED");
  });
  it("keeps interests to the known list; campaigns can target an interest", () => {
    expect(interestsFrom(["CBD", "CBD", "GROW", "THC", "toString", 7])).toEqual(["CBD", "GROW"]);
    for (const a of ["ALL", "CHAMPION", "tier:BLOOM", "interest:CBD"]) expect(isAudience(a)).toBe(true);
    for (const a of ["interest:THC", "interest:toString", "constructor", "tier:GOLD", ""]) expect(isAudience(a)).toBe(false);
  });
});

describe("franchise statement", () => {
  it("nets credits and debits", () => {
    const s = buildStatement({
      netSalesExVatCents: 1_000_000_00, onlineSalesExVatCents: 100_000_00, onlineCollectedCents: 115_000_00,
      pointsIssuedCents: 5_000_00, pointsRedeemedCents: 3_000_00, wholesaleCents: 400_000_00,
      networkSoldCents: 10_000_00, networkBoughtCents: 0, royaltyBps: 600, levyBps: 200, ecomBps: 1000,
    });
    expect(s.royalty).toBe(60_000_00);
    expect(s.levy).toBe(20_000_00);
    expect(s.ecom).toBe(10_000_00);
    expect(s.feesVat).toBe(13_500_00);
    expect(s.net).toBe(128_000_00 - (60_000_00 + 20_000_00 + 10_000_00 + 13_500_00 + 5_000_00 + 400_000_00));
  });
});
