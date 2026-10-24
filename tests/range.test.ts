import { describe, expect, it } from "vitest";
import { HIDDEN_CATEGORIES, isHiddenCategory, SHOWN_RANGE } from "@/lib/range";

describe("hidden ranges", () => {
  it("hides skin care, protein and collagen; keeps THC, CBD, coffee, accessories, apparel and grow", () => {
    for (const s of ["skin-care", "protein-nutrition", "collagen-supplements"]) expect(isHiddenCategory(s)).toBe(true);
    for (const s of ["flower", "pre-rolls", "edibles", "vapes", "concentrates", "wellness", "coffee-drinks", "accessories", "apparel", "grow"]) expect(isHiddenCategory(s)).toBe(false);
  });
  it("filters products by category slug", () => {
    expect(SHOWN_RANGE).toEqual({ category: { slug: { notIn: HIDDEN_CATEGORIES } } });
  });
});
