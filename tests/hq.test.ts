import { describe, expect, it } from "vitest";
import { explainPrice, whyNot } from "@/server/hq/price-explain";
import { parseRand, parsePctToBps, parseLocal, toLocalInput, parseClock, clock, parseSuppressionList, slugify, qs, splitList } from "@/server/hq/form";
import { normalisePhone } from "@/lib/sa";
import type { PriceListRule, PriceContext } from "@/lib/pricing-rules";

const at = new Date("2026-09-27T10:00:00Z");
const list = (over: Partial<PriceListRule>): PriceListRule => ({
  id: over.name ?? "l", name: "List", kind: "ZONE", channel: null, tiers: [], storeIds: [], regionIds: [], adjustPct: null,
  startsAt: null, endsAt: null, active: true, priority: 0, createdAt: new Date("2026-01-01T00:00:00Z"), items: [], ...over,
});
const ctx = (over: Partial<PriceContext> = {}): PriceContext => ({ storeId: "s1", regionId: "r1", channel: "POS", member: false, tier: null, at, ...over });

describe("hq form parsing", () => {
  it("parses rand amounts to cents", () => {
    expect(parseRand("R1,234.50")).toBe(123450);
    expect(parseRand(" 99 ")).toBe(9900);
    expect(parseRand("12.345")).toBeNull();
    expect(parseRand("abc")).toBeNull();
    expect(parseRand("")).toBeNull();
  });
  it("parses percentages to basis points", () => {
    expect(parsePctToBps("6")).toBe(600);
    expect(parsePctToBps("6.5%")).toBe(650);
    expect(parsePctToBps("-1")).toBeNull();
  });
  it("round-trips SAST datetime-local values", () => {
    const d = parseLocal("2026-10-02T08:00")!;
    expect(d.toISOString()).toBe("2026-10-02T06:00:00.000Z");
    expect(toLocalInput(d)).toBe("2026-10-02T08:00");
    expect(parseLocal("nope")).toBeNull();
  });
  it("parses happy-hour clock times", () => {
    expect(parseClock("16:30")).toBe(990);
    expect(parseClock("24:00")).toBeNull();
    expect(clock(990)).toBe("16:30");
  });
  it("builds slugs and query strings", () => {
    expect(slugify("Rooibos & Honey Gummies")).toBe("rooibos-and-honey-gummies");
    expect(qs({ a: "1", b: "", c: undefined, page: 2 })).toBe("?a=1&page=2");
    expect(splitList("calm, focus\ncalm")).toEqual(["calm", "focus"]);
  });
  it("parses an NCC opt-out registry paste", () => {
    const r = parseSuppressionList("msisdn\n082 123 4567\n+27831234567, Someone@Example.co.za\nnot-a-number", normalisePhone);
    expect(r.values).toEqual(["+27821234567", "+27831234567", "someone@example.co.za"]);
    expect(r.rejected).toEqual(["not-a-number"]);
  });
});

describe("pricing simulator explanation", () => {
  const v = { variantId: "v1", rrpCents: 39000, qty: 1, incentives: true };

  it("says why a list doesn't apply", () => {
    expect(whyNot(list({ active: false }), ctx())).toBe("Switched off");
    expect(whyNot(list({ startsAt: new Date("2026-10-01T00:00:00Z") }), ctx())).toBe("Not started yet");
    expect(whyNot(list({ channel: "ONLINE" }), ctx())).toBe("Online only");
    expect(whyNot(list({ storeIds: ["other"] }), ctx())).toBe("Not for this store or region");
    expect(whyNot(list({ kind: "MEMBER" }), ctx())).toBe("Members only");
    expect(whyNot(list({ kind: "MEMBER", tiers: ["HARVEST"] }), ctx({ member: true, tier: "SEED" }))).toBe("Not for this tier");
    expect(whyNot(list({ regionIds: ["r1"] }), ctx())).toBeNull();
  });

  it("picks the highest-priority zone list for the shelf price", () => {
    const lists = [list({ name: "Zone A", priority: 1, adjustPct: 5 }), list({ name: "Zone B", priority: 2, items: [{ variantId: "v1", priceCents: 41000, minQty: 1 }] })];
    const e = explainPrice(v, lists, ctx());
    expect(e.result.unitCents).toBe(41000);
    expect(e.verdicts.find((x) => x.name === "Zone B")?.won).toBe(true);
    expect(e.verdicts.find((x) => x.name === "Zone A")?.won).toBe(false);
  });

  it("lets the franchisee shelf price win in store", () => {
    const e = explainPrice({ ...v, storeShelfCents: 37000 }, [list({ name: "Zone", adjustPct: 5 })], ctx());
    expect(e.result.unitCents).toBe(37000);
    expect(e.steps[1].label).toBe("Store shelf price");
  });

  it("applies the instant tier saving, and a member list only when it's lower", () => {
    const t = explainPrice(v, [], ctx({ member: true, tier: "BLOOM", tierPct: 7 }));
    expect(t.result.unitCents).toBe(36270);
    expect(t.steps.at(-1)?.label).toBe("Bloom Rewards price");
    const cheaper = list({ name: "Club special", kind: "MEMBER", items: [{ variantId: "v1", priceCents: 35000, minQty: 1 }] });
    const m = explainPrice(v, [cheaper], ctx({ member: true, tier: "BLOOM", tierPct: 7 }));
    expect(m.result.unitCents).toBe(35000);
    expect(m.verdicts[0].won).toBe(true);
  });

  it("applies member prices and quantity breaks, but not to excluded medicines", () => {
    const member = list({ name: "Rewards member price", kind: "MEMBER", tiers: ["BLOOM", "HARVEST"], adjustPct: -5 });
    const volume = list({ name: "Volume", items: [{ variantId: "v1", priceCents: 35000, minQty: 3 }] });
    const m = explainPrice(v, [member, volume], ctx({ member: true, tier: "BLOOM" }));
    expect(m.result.unitCents).toBe(37050);
    expect(m.verdicts.find((x) => x.kind === "MEMBER")?.won).toBe(true);
    const q = explainPrice({ ...v, qty: 3 }, [member, volume], ctx({ member: true, tier: "BLOOM" }));
    expect(q.result.unitCents).toBe(35000);
    expect(q.lineCents).toBe(105000);
    const med = explainPrice({ ...v, qty: 3, incentives: false }, [member, volume], ctx({ member: true, tier: "BLOOM" }));
    expect(med.result.unitCents).toBe(39000);
    expect(med.verdicts.every((x) => !x.won)).toBe(true);
  });
});
