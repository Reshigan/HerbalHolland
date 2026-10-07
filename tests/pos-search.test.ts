import { describe, expect, it } from "vitest";
import { normaliseSearch, search, searchIndex, stem, withinOneEdit } from "@/lib/pos-search";

const products = [
  { id: "dp", name: "Durban Poison", tagline: "The KwaZulu-Natal landrace", category: "Flower", cls: "Licensed (THC)", variants: ["1g", "3.5g"], sku: "DP-35", barcode: "6001234500012" },
  { id: "nl", name: "Northern Lights", tagline: "Pure, calm, classic indica", category: "Flower", cls: "Licensed (THC)", variants: ["1g", "3.5g"], sku: "NL-35", barcode: null },
  { id: "pr", name: "Windmill Haze Pre-roll", tagline: "Our signature", category: "Pre-rolls", cls: "Licensed (THC)", variants: ["1 × 1g"], sku: "WH-PR1", barcode: null },
  { id: "gm", name: "Rooibos & Honey Gummies", tagline: "Precisely dosed", category: "Edibles", cls: "Licensed (THC)", variants: ["20 × 5mg"], sku: "RHG-20", barcode: null },
  { id: "vp", name: "Durban Poison Disposable", tagline: "The landrace, anywhere", category: "Vapes", cls: "Licensed (THC)", variants: ["0.5ml"], sku: "DPD-05", barcode: null },
  { id: "gr", name: "Sunset Grinder", tagline: null, category: "Accessories", cls: "Accessory", variants: ["One size"], sku: "SG-1", barcode: null },
];
const idx = searchIndex(products, (p) => [p.name, p.tagline, p.category, p.cls, ...p.variants, p.sku, p.barcode]);
const ids = (q: string) => search(idx, q).map((p) => p.id);

describe("till product search", () => {
  it("normalises separators and the decimal comma", () => {
    expect(normaliseSearch("3,5g Pre-Roll")).toBe("3.5g pre roll");
    expect(stem("gummies")).toBe("gummy");
    expect(stem("prerolls")).toBe("preroll");
    expect(stem("glass")).toBe("glass");
  });
  it("matches exact words, SKUs and barcodes", () => {
    expect(ids("durban")).toEqual(["dp", "vp"]);
    expect(ids("nl-35")).toEqual(["nl"]);
    expect(ids("6001234500012")).toEqual(["dp"]);
  });
  it("finds category and class words, singular or plural", () => {
    expect(ids("edible")).toEqual(["gm"]);
    expect(ids("gummy")).toEqual(["gm"]);
    expect(ids("flower")).toEqual(["dp", "nl"]);
    expect(ids("vape")).toEqual(["vp"]);
    expect(ids("accessories")).toEqual(["gr"]);
  });
  it("ignores hyphens and spaces inside words", () => {
    expect(ids("preroll")).toEqual(["pr"]);
    expect(ids("pre roll")).toEqual(["pr"]);
  });
  it("reads a comma as the decimal mark", () => {
    expect(ids("durban 3,5g")).toEqual(["dp"]);
  });
  it("forgives one typo per word of 4+ letters when nothing matches exactly", () => {
    expect(ids("durbn")).toEqual(["dp", "vp"]);
    expect(ids("nothern lights")).toEqual(["nl"]);
    expect(ids("xyz")).toEqual([]);
    expect(withinOneEdit("ab", "ba")).toBe(true);
    expect(withinOneEdit("abc", "abde")).toBe(false);
  });
});
