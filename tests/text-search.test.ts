import { describe, expect, it } from "vitest";
import { closeNeedle, inRankOrder, searchTerms, squash } from "@/lib/text-search";
import { SHORT_SIMILARITY_THRESHOLD, WORD_SIMILARITY_THRESHOLD } from "@/lib/search";

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

describe("close-match product search", () => {
  it("compares the query in lower case with single spaces; short queries need closer names", () => {
    expect(closeNeedle("  Nothern   Lights ")).toEqual({ needle: "nothern lights", threshold: WORD_SIMILARITY_THRESHOLD });
    expect(closeNeedle("durbn")).toEqual({ needle: "durbn", threshold: WORD_SIMILARITY_THRESHOLD });
    expect(closeNeedle("kusj")).toEqual({ needle: "kusj", threshold: SHORT_SIMILARITY_THRESHOLD });
    expect(closeNeedle("x".repeat(80))?.needle).toHaveLength(60);
  });
  it("doesn't loosen searches of fewer than three letters or digits", () => {
    expect(closeNeedle("og")).toBeNull();
    expect(closeNeedle(" - ")).toBeNull();
    expect(closeNeedle(undefined)).toBeNull();
  });
  it("orders rows by rank, closest first, leaving out the unranked", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "b" }];
    expect(inRankOrder(rows, ["c", "b"], (r) => r.id)).toEqual([{ id: "c" }, { id: "b" }, { id: "b" }]);
    expect(inRankOrder(rows, [], (r) => r.id)).toEqual([]);
  });
});
