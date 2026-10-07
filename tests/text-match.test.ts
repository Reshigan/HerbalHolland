import { describe, expect, it } from "vitest";
import { textMatches } from "@/lib/text-match";

describe("textMatches", () => {
  it("ignores case, hyphens and spacing", () => {
    expect(textMatches("Blue Dream Pre-roll 1g", "preroll")).toBe(true);
    expect(textMatches("Blue Dream Preroll", "pre-roll")).toBe(true);
    expect(textMatches("HH-0123 Gummies", "hh0123 gumm")).toBe(true);
    expect(textMatches("Blue Dream", "blue haze")).toBe(false);
    expect(textMatches("anything", "")).toBe(true);
  });
});
