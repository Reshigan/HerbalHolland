import { describe, expect, it } from "vitest";
import { dropBlock, opensFor, type DropRule } from "@/lib/drops";
import { heldTier, maxTier } from "@/lib/loyalty-rules";
import { QUESTS, publicQuest, questPassed } from "@/lib/quests";
import { applyPromotions, type PromoInput } from "@/lib/promotions";
import { buildStatement } from "@/lib/statement";
import { foundingPlaces } from "@/server/shop/launch-rules";

describe("tier floors (Founding Members)", () => {
  const at = new Date("2026-10-01T10:00:00Z");
  it("holds at least the floor until it lapses", () => {
    expect(maxTier("SEED", "SPROUT")).toBe("SPROUT");
    expect(maxTier("BLOOM", "SPROUT")).toBe("BLOOM");
    expect(heldTier("SEED", "SPROUT", new Date("2027-10-01"), at)).toBe("SPROUT");
    expect(heldTier("SEED", "SPROUT", new Date("2026-09-30"), at)).toBe("SEED");
    expect(heldTier("SEED", null, null, at)).toBe("SEED");
  });
});

describe("drops", () => {
  const d: DropRule = { name: "Windmill Tee No. 1", startsAt: new Date("2026-10-02T09:00:00+02:00"), endsAt: null, earlyTier: "BLOOM", earlyMinutes: 60, perMemberLimit: 2, membersOnly: true };
  const bloom = { member: true, tier: "BLOOM" as const, bought: 0 };
  const seed = { member: true, tier: "SEED" as const, bought: 0 };
  it("opens an hour early for Bloom and above", () => {
    expect(opensFor(d, "HARVEST").toISOString()).toBe("2026-10-02T06:00:00.000Z");
    expect(opensFor(d, "SEED").toISOString()).toBe("2026-10-02T07:00:00.000Z");
    const early = new Date("2026-10-02T08:30:00+02:00");
    expect(dropBlock(d, bloom, 1, early)).toBeNull();
    expect(dropBlock(d, seed, 1, early)).toMatch(/isn't open yet/);
  });
  it("is members-only and limited per member once open", () => {
    const live = new Date("2026-10-02T09:05:00+02:00");
    expect(dropBlock(d, { member: false, tier: null, bought: 0 }, 1, live)).toMatch(/members/);
    expect(dropBlock(d, { ...seed, bought: 1 }, 1, live)).toBeNull();
    expect(dropBlock(d, { ...seed, bought: 1 }, 2, live)).toMatch(/limit 2/);
    expect(dropBlock({ ...d, endsAt: new Date("2026-10-03T00:00:00+02:00") }, { ...seed, bought: 5 }, 1, new Date("2026-10-04T10:00:00+02:00"))).toBeNull();
  });
});

describe("Learn quests", () => {
  it("has a valid answer for every question and hides answers from the browser", () => {
    for (const q of Object.values(QUESTS)) for (const x of q.questions) expect(x.answer).toBeLessThan(x.options.length);
    expect(JSON.stringify(publicQuest("points"))).not.toContain("answer");
    expect(questPassed("points", [2, 0])).toBe(true);
    expect(questPassed("points", [0, 0])).toBe(false);
    expect(questPassed("points", [2])).toBe(false);
    expect(publicQuest("nope")).toBeNull();
  });
});

describe("promotion attribution (HQ-funded My Deals)", () => {
  it("breaks each line's discount down by promotion", () => {
    const base = { code: null, categoryIds: [] as string[], productIds: [] as string[], minSpendCents: 0 };
    const promos: PromoInput[] = [
      { ...base, id: "offer:1", name: "15% off Calm Oil", kind: "PERCENT", value: 15, productIds: ["oil"] },
      { ...base, id: "p10", name: "10% off", kind: "PERCENT", value: 10, categoryIds: ["acc"] },
    ];
    const r = applyPromotions(
      [
        { key: "a", productId: "oil", categoryId: "wellness", qty: 2, unitPriceCents: 50_000 },
        { key: "b", productId: "tray", categoryId: "acc", qty: 1, unitPriceCents: 28_000 },
      ],
      promos,
    );
    expect(r.lines[0].byPromo).toEqual({ "offer:1": 15_000 });
    expect(r.lines[1].byPromo).toEqual({ p10: 2_800 });
  });
  it("credits My Deals to the store on the franchise statement", () => {
    const zero = { netSalesExVatCents: 0, onlineSalesExVatCents: 0, onlineCollectedCents: 0, pointsIssuedCents: 0, pointsRedeemedCents: 0, wholesaleCents: 0, networkSoldCents: 0, networkBoughtCents: 0, royaltyBps: 0, levyBps: 0, ecomBps: 0 };
    expect(buildStatement({ ...zero, offersFundedCents: 12_345 }).net).toBe(12_345);
  });
});

describe("Founding places counter", () => {
  const base = { cap: 2026, firstYearMonths: 6, tierName: "Sprout", closes: "6 Dec 2026" };
  it("counts down and warns when places are going fast", () => {
    const p = foundingPlaces({ ...base, taken: 1000 });
    expect(p).toMatchObject({ left: 1026, full: false, nearly: false });
    expect(p.strip).toBe("1,026 of 2,026 Founding cards left");
    expect(foundingPlaces({ ...base, taken: 1900 })).toMatchObject({ nearly: true });
    expect(foundingPlaces({ ...base, taken: 1900 }).lead).toContain("going fast");
  });
  it("flips to First Year Members once every card is spoken for", () => {
    const p = foundingPlaces({ ...base, taken: 2500 });
    expect(p).toMatchObject({ left: 0, full: true });
    expect(p.strip).toContain("First Year Members still open");
    expect(p.lead).toContain("Sprout for 6 months");
    expect(foundingPlaces({ ...base, taken: 2500, firstYearMonths: 0 }).lead).toBe("All 2,026 Founding Member cards are spoken for.");
  });
});
