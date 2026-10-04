import { describe, expect, it } from "vitest";
import { searchTerms, squash } from "@/lib/text-search";

describe("admin text search", () => {
  it("splits into words in any order and squashes punctuation", () => {
    expect(searchTerms("haze amnesia").map((t) => t.word)).toEqual(["haze", "amnesia"]);
    expect(searchTerms("Pre-roll")).toEqual([{ word: "Pre-roll", squashed: "preroll" }]);
    expect(searchTerms(" pre  roll, ")).toEqual([{ word: "pre", squashed: "pre" }, { word: "roll", squashed: "roll" }]);
    expect(searchTerms("- --")).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
  });
  it("squashes names the same way", () => {
    expect(squash("Pre-Roll 0.5g")).toBe("preroll05g");
    expect(squash("preroll")).toBe("preroll");
  });
});
