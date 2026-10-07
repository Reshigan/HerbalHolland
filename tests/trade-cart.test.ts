import { describe, expect, it } from "vitest";
import {
  addTradeLine, casesOf, minOrderProgress, parseTradeCart, removeTradeLine, serializeTradeCart, setTradeLine, tradeCartUnits,
  TRADE_CART_MAX_LINES, TRADE_CART_MAX_UNITS,
} from "@/lib/trade-cart";
import * as copy from "@/components/trade/copy";
import { CLASS_BLURB, CLASS_NAME, casePriceLine, fmtCases, stockState } from "@/components/trade/format";
import { screenCopy } from "@/lib/compliance";

const A = "clx0000000000000000a";
const B = "clx0000000000000000b";

describe("trade cart cookie", () => {
  it("round-trips lines and ignores junk", () => {
    const lines = [{ variantId: A, qty: 12 }, { variantId: B, qty: 6 }];
    const raw = serializeTradeCart(lines);
    expect(raw).toBe(`${A}_12.${B}_6`);
    expect(parseTradeCart(raw)).toEqual(lines);
    expect(parseTradeCart("")).toEqual([]);
    expect(parseTradeCart(null)).toEqual([]);
    expect(parseTradeCart(`bad.${A}_x.${A}_0.short_3.${B}_2`)).toEqual([{ variantId: B, qty: 2 }]);
  });
  it("merges a repeated id and caps per line and per cart", () => {
    expect(parseTradeCart(`${A}_5.${A}_7`)).toEqual([{ variantId: A, qty: 12 }]);
    expect(parseTradeCart(`${A}_99999`)[0].qty).toBe(TRADE_CART_MAX_UNITS);
    const many = Array.from({ length: TRADE_CART_MAX_LINES + 5 }, (_, i) => `clx${String(i).padStart(17, "0")}_1`).join(".");
    expect(parseTradeCart(many)).toHaveLength(TRADE_CART_MAX_LINES);
    expect(serializeTradeCart([{ variantId: "nope", qty: 1 }, { variantId: A, qty: 0 }])).toBe("");
  });
});

describe("trade cart lines are whole cases", () => {
  it("adds in case multiples, rounding up", () => {
    let lines = addTradeLine([], A, 1, 6);
    expect(lines).toEqual([{ variantId: A, qty: 6 }]);
    lines = addTradeLine(lines, A, 7, 6);
    expect(lines[0].qty).toBe(18); // 6 + 7 → next case up
    lines = addTradeLine(lines, B, 12, 12);
    expect(lines).toHaveLength(2);
    expect(tradeCartUnits(lines)).toBe(30);
  });
  it("sets, rounds and removes", () => {
    let lines = setTradeLine([], A, 10, 6);
    expect(lines).toEqual([{ variantId: A, qty: 12 }]);
    lines = setTradeLine(lines, A, 24, 6);
    expect(lines[0].qty).toBe(24);
    lines = setTradeLine(lines, A, 0, 6);
    expect(lines).toEqual([]);
    expect(removeTradeLine([{ variantId: A, qty: 6 }, { variantId: B, qty: 6 }], A)).toEqual([{ variantId: B, qty: 6 }]);
  });
  it("keeps the cap a whole number of cases and refuses a new line in a full cart", () => {
    const line = addTradeLine([], A, 50_000, 12)[0];
    expect(line.qty % 12).toBe(0);
    expect(line.qty).toBeLessThanOrEqual(TRADE_CART_MAX_UNITS);
    const full = Array.from({ length: TRADE_CART_MAX_LINES }, (_, i) => ({ variantId: `clx${String(i).padStart(17, "0")}`, qty: 1 }));
    expect(addTradeLine(full, A, 1)).toHaveLength(TRADE_CART_MAX_LINES);
    expect(addTradeLine(full, full[3].variantId, 2)[3].qty).toBe(3); // an existing line still grows
  });
  it("counts cases", () => {
    expect(casesOf(12, 6)).toBe(2);
    expect(casesOf(13, 6)).toBe(3);
    expect(casesOf(3, 1)).toBe(3);
    expect(casesOf(0, 6)).toBe(0);
    expect(fmtCases(12, 6)).toBe("2 cases (12 units)");
    expect(fmtCases(6, 6)).toBe("1 case (6 units)");
    expect(fmtCases(1, 1)).toBe("1 unit");
    expect(casePriceLine(18_000, 6)).toBe("R180.00 ex VAT each · case of 6 · R1,080.00 a case");
    expect(casePriceLine(18_000, 1)).toBe("R180.00 ex VAT each");
    expect([stockState(0, 6), stockState(5, 6), stockState(100, 6)]).toEqual(["out", "low", "in"]);
  });
});

describe("minimum order progress", () => {
  it("says how far short the basket is", () => {
    expect(minOrderProgress(150_000, 200_000)).toEqual({ reached: false, shortCents: 50_000, pct: 75 });
    expect(minOrderProgress(200_000, 200_000)).toEqual({ reached: true, shortCents: 0, pct: 100 });
    expect(minOrderProgress(0, 200_000)).toEqual({ reached: false, shortCents: 200_000, pct: 0 });
    expect(minOrderProgress(500, 0)).toEqual({ reached: true, shortCents: 0, pct: 100 });
  });
});

/** Every string in a module, with where it lives. */
function strings(value: unknown, path: string, out: [string, string][] = []) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  return out;
}

describe("trade portal copy", () => {
  it("passes the marketing screen (no medical claims, conditions, intoxication, minors or absolute claims)", () => {
    const all = [...strings(copy, ""), ...strings({ CLASS_NAME, CLASS_BLURB }, "format")];
    expect(all.length).toBeGreaterThan(30);
    const flagged = all.flatMap(([path, text]) => screenCopy(text).map((f) => `${path}: "${f.term}" (${f.reason})`));
    expect(flagged).toEqual([]);
  });
  it("says who it is for and that buyers are adults", () => {
    const text = strings(copy, "").map(([, t]) => t).join(" ");
    expect(text).toMatch(/18\+/);
    expect(text).toMatch(/ex VAT/);
    for (const who of ["Pharmac", "retailer", "Caf", "practice"]) expect(text).toMatch(new RegExp(who, "i"));
  });
});
