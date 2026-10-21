// Shop search: the query parser (words, measures with units, class words), the ranking and "Did you mean…".
import { describe, expect, it } from "vitest";
import { didYouMean, similarityFloor, measureMatches, measuresIn, normalise, parseQuery, rankSearch, withRecentSearch, RECENT_SEARCHES_MAX, likePatterns, trigramsOf, trigramSimilarity, wordSimilarity, type SearchDoc } from "@/lib/search";

const docs: SearchDoc[] = [
  { id: "oil600", name: "Calm CBD Oil 600", tagline: "Full-spectrum drops for the evening", category: "CBD wellness", cbdMgPerPack: 600, netContent: 30, netUnit: "ml", variants: [{ name: "30ml" }] },
  { id: "oil300", name: "Calm CBD Oil 300", tagline: "A gentler strength", category: "CBD wellness", cbdMgPerPack: 300, netContent: 30, netUnit: "ml", variants: [{ name: "30ml" }] },
  { id: "balm", name: "Recover CBD Muscle Balm", tagline: "Arnica and wintergreen for after the gym", category: "Skin care", cbdMgPerPack: 500, netContent: 50, netUnit: "g", variants: [{ name: "50g" }] },
  { id: "coffee", name: "Morning CBD Coffee", tagline: "Arabica beans with hemp flower", category: "Coffee & drinks", cbdMgPerPack: 15, netContent: 250, netUnit: "g", variants: [{ name: "250g" }] },
  { id: "grinder", name: "Sunset Grinder", tagline: "Four-piece aluminium grinder", category: "Accessories", variants: [{ name: "One size" }] },
  { id: "flower", name: "Durban Haze", tagline: "Heritage sativa", category: "Flower", variants: [{ name: "3.5g", grams: 3.5 }, { name: "7g", grams: 7 }] },
  { id: "tee", name: "Heritage Tee", tagline: "Organic cotton, embroidered", category: "Apparel", words: ["orange"], variants: [{ name: "M" }, { name: "L" }] },
];

describe("query parsing", () => {
  it("normalises text and splits words, measures and class words", () => {
    expect(normalise("  Café  CRÈME! ")).toBe("cafe creme");
    const q = parseQuery("calm oil 600mg");
    expect(q.terms).toEqual(["calm", "oil"]);
    expect(q.measures).toEqual([{ value: 600, unit: "mg", raw: "600mg" }]);
    expect(q.classes).toEqual(["oil"]);
  });

  it("reads numbers with and without units, decimals with a point or a comma, and litres or kilograms as ml or g", () => {
    expect(measuresIn("600")).toEqual([{ value: 600, unit: null, raw: "600" }]);
    expect(measuresIn("3.5g")).toEqual([{ value: 3.5, unit: "g", raw: "3.5g" }]);
    expect(measuresIn("3,5 g")).toEqual([{ value: 3.5, unit: "g", raw: "3,5 g" }]);
    expect(measuresIn("30 ml")).toEqual([{ value: 30, unit: "ml", raw: "30 ml" }]);
    expect(measuresIn("1l")).toEqual([{ value: 1000, unit: "ml", raw: "1l" }]);
    expect(measuresIn("2kg")).toEqual([{ value: 2000, unit: "g", raw: "2kg" }]);
    expect(measuresIn("600mg 30ml")).toHaveLength(2);
    expect(measuresIn("tee l")).toEqual([]); // a size, not a litre
    expect(parseQuery("600").terms).toEqual([]);
  });

  it("drops stop words and one-letter tokens, keeps class words as terms too", () => {
    const q = parseQuery("a cream for the gym");
    expect(q.terms).toEqual(["cream", "gym"]);
    expect(q.classes).toEqual(["cream"]);
    expect(parseQuery("balm").classes).toEqual(["cream"]);
    expect(parseQuery("x".repeat(80)).norm).toHaveLength(60);
  });
});

describe("measures against products", () => {
  it("matches strength, size and grams, with or without a unit", () => {
    const oil = docs[0];
    expect(measureMatches({ value: 600, unit: "mg", raw: "" }, oil)).toBe(true);
    expect(measureMatches({ value: 600, unit: null, raw: "" }, oil)).toBe(true);
    expect(measureMatches({ value: 30, unit: "ml", raw: "" }, oil)).toBe(true);
    expect(measureMatches({ value: 30, unit: "g", raw: "" }, oil)).toBe(false);
    expect(measureMatches({ value: 300, unit: "mg", raw: "" }, oil)).toBe(false);
    expect(measureMatches({ value: 3.5, unit: "g", raw: "" }, docs[5])).toBe(true);
    expect(measureMatches({ value: 7, unit: null, raw: "" }, docs[5])).toBe(true);
    expect(measureMatches({ value: 250, unit: "g", raw: "" }, docs[3])).toBe(true);
  });
});

describe("ranking", () => {
  const rank = (q: string, sims: Record<string, number> = {}) => rankSearch(parseQuery(q), docs.map((d) => ({ ...d, sim: sims[d.id] ?? 0 })));

  it("puts the exact name first, then prefixes, then products with the words in their name", () => {
    const r = rank("calm cbd oil 600");
    expect(r[0]).toMatchObject({ id: "oil600", kind: "exact" });
    expect(r[1]).toMatchObject({ id: "oil300" });
    expect(r.map((x) => x.id)).not.toContain("grinder");
    expect(rank("calm cbd")[0]).toMatchObject({ kind: "prefix" });
    expect(rank("grinder")[0]).toMatchObject({ id: "grinder", kind: "word" });
  });

  it("uses a measure to pick the right strength or size", () => {
    expect(rank("oil 600")[0].id).toBe("oil600");
    expect(rank("oil 300mg")[0].id).toBe("oil300");
    expect(rank("calm 30ml").map((x) => x.id).slice(0, 2).sort()).toEqual(["oil300", "oil600"]);
    expect(rank("3.5g")[0]).toMatchObject({ id: "flower", kind: "measure" });
  });

  it("finds products by a class word or by their tagline, below name matches", () => {
    const cream = rank("cream");
    expect(cream[0].id).toBe("balm"); // balm is a cream-class word
    const gym = rank("after the gym");
    expect(gym[0]).toMatchObject({ id: "balm", kind: "text" });
    expect(rank("beans")[0].id).toBe("coffee");
  });

  it("ranks typos by similarity from the database and offers a correction", () => {
    const ranked = rank("calm oli", { oil600: 0.55, oil300: 0.5 });
    expect(ranked[0]).toMatchObject({ id: "oil600" });
    // "calm" is a word in the name, so this isn't a fuzzy-only match: no correction needed.
    expect(didYouMean(ranked, docs, parseQuery("calm oli"))).toBeNull();
    const fuzzy = rank("grindr", { grinder: 0.6 });
    expect(fuzzy[0]).toMatchObject({ id: "grinder", kind: "fuzzy" });
    expect(didYouMean(fuzzy, docs, parseQuery("grindr"))).toBe("Sunset Grinder");
    expect(rank("grindr", { grinder: 0.1 })).toEqual([]); // below the threshold: nothing
    expect(didYouMean([], docs, parseQuery("zzz"))).toBeNull();
  });
});

describe("recent searches", () => {
  it("keeps the newest first, without duplicates, up to the limit, and survives junk in storage", () => {
    expect(withRecentSearch(null, "oil")).toEqual(["oil"]);
    expect(withRecentSearch(["oil", "tee"], "Tee")).toEqual(["Tee", "oil"]);
    expect(withRecentSearch(["a", 1, null, " b "], "c")).toEqual(["c", "a", "b"]);
    const many = withRecentSearch(Array.from({ length: 10 }, (_, i) => `q${i}`), "new");
    expect(many).toHaveLength(RECENT_SEARCHES_MAX);
    expect(many[0]).toBe("new");
    expect(withRecentSearch(["x"], "   ")).toEqual(["x"]);
  });
});

describe("search fixes from the shopper review", () => {
  const more: SearchDoc[] = [
    { id: "calm", name: "Calm CBD Oil 600mg", tagline: "Our everyday oil", description: "x".repeat(80), words: ["calm", "focus", "Citrus"], effects: ["calm", "focus"], variants: [{ name: "30ml" }] },
    { id: "rest", name: "Rest CBD Oil 300mg", tagline: "A gentler oil for the evening routine and beyond", description: "Hemp seed oil base with a long description", words: ["rest", "calm"], effects: ["rest", "calm"], variants: [{ name: "30ml" }] },
    { id: "softgel", name: "CBD Softgels 10mg", tagline: "One a day", category: "CBD wellness", words: ["focus", "calm"], effects: ["focus", "calm"], variants: [{ name: "30 caps" }] },
    { id: "tea", name: "Rooibos & CBD Tea", tagline: "Caffeine-free", category: "Coffee & drinks", effects: ["rest"], variants: [{ name: "20 bags" }] },
    { id: "tent", name: "Grow Tent 80 × 80", tagline: "Reflective, zip-sealed", category: "Grow", variants: [{ name: "One size" }] },
    { id: "soil", name: "Living Soil Mix", tagline: "Pre-amended and ready to plant", category: "Grow", variants: [{ name: "50L" }] },
    { id: "whey", name: "CBD Whey Protein", tagline: "For after training", category: "Protein & nutrition", description: "Whey with hemp seed protein", effects: ["recover"], variants: [{ name: "1kg" }] },
    { id: "seeds", name: "Durban Poison Heritage Seeds", tagline: "Feminised", category: "Grow", variants: [{ name: "5 seeds" }] },
    { id: "tee", name: "Windmill Tee", tagline: "Organic cotton", category: "Apparel", variants: [{ name: "M" }] },
    { id: "preroll", name: "Windmill Haze Pre-roll", tagline: "Ready to go", category: "Pre-rolls", variants: [{ name: "1 x 0.5g" }] },
  ];
  const rank = (q: string, sims: Record<string, number> = {}) => rankSearch(parseQuery(q), more.map((d) => ({ ...d, sim: sims[d.id] ?? 0 }))).map((r) => r.id);

  it("searches all of a product's text, not just the first 60 characters", () => {
    expect(rank("citrus")).toEqual(["calm"]);
    expect(rank("calm").sort()).toEqual(["calm", "rest", "softgel"]);
  });

  it("finds products by everyday mood words", () => {
    expect(parseQuery("something for sleep").moods).toEqual(["rest"]);
    expect(rank("sleep").sort()).toEqual(["rest", "tea"]);
    expect(rank("relax").sort()).toEqual(["calm", "rest", "softgel"]);
  });

  it("matches word starts only, needs every word for a text match, and prefers name matches to text or typos", () => {
    expect(rank("rooibos te")).toEqual(["tea"]);
    expect(rank("pre roll")).toEqual(["preroll"]);
    expect(rank("preroll")).toEqual(["preroll"]);
    expect(rank("pre-roll")).toEqual(["preroll"]);
    expect(rank("pre rolls")).toEqual(["preroll"]);
    expect(rank("seeds")[0]).toBe("seeds");
    expect(rank("seeds")).not.toContain("whey");
    expect(rank("tea", { tee: 0.5 })).toEqual(["tea"]);
  });

  it("asks more similarity of short queries", () => {
    expect(similarityFloor("tea")).toBeGreaterThan(similarityFloor("grindr"));
    expect(rank("tee", { tea: 0.5 })).toEqual(["tee"]);
    expect(rank("tez", { tea: 0.5 })).toEqual([]);
  });
});

describe("product types written apart (\"pre roll\")", () => {
  const shelf: SearchDoc[] = [
    { id: "tray", name: "Rolling Tray", tagline: "Bamboo, with a lip", category: "Accessories", variants: [{ name: "Large" }] },
    { id: "papers", name: "King Size Rolling Papers", tagline: "Unbleached", category: "Accessories", variants: [{ name: "32 leaves" }] },
  ];
  const rank = (q: string, sims: Record<string, number> = {}) => rankSearch(parseQuery(q), shelf.map((d) => ({ ...d, sim: sims[d.id] ?? 0 }))).map((r) => r.id);

  it("keeps the type as one word that a product must be", () => {
    expect(parseQuery("pre roll").terms).toEqual(["preroll"]);
    expect(parseQuery("Pre-Roll 0.5g").required).toEqual(["preroll"]);
    expect(parseQuery("rolling tray").required).toBeUndefined();
    expect(parseQuery("pre rolls").required).toEqual(["preroll"]); // plural or singular, the product only has to be one
    const single = { id: "pr", name: "Durban Poison Pre-Roll", category: "Flower", variants: [{ name: "1 × 0.5 g" }] };
    expect(rankSearch(parseQuery("pre rolls"), [...shelf, { ...single, sim: 0.5 }]).map((r) => r.id)).toEqual(["pr"]);
  });

  it("finds no rolling tray or papers for a pre-roll, even when the names look alike", () => {
    expect(rank("pre roll")).toEqual([]);
    expect(rank("preroll", { tray: 0.44, papers: 0.3 })).toEqual([]);
    expect(rank("pre-rolls")).toEqual([]);
    expect(rank("rolling").sort()).toEqual(["papers", "tray"]); // the words themselves still find them
    expect(rank("roll").sort()).toEqual(["papers", "tray"]);
  });
});


describe("trigram similarity (pg_trgm's rules)", () => {
  it("pads each word with two spaces before and one after, lower-cased, letters and digits only", () => {
    expect(trigramsOf("Cat")).toEqual(["  c", " ca", "cat", "at "]);
    expect(trigramsOf("a")).toEqual(["  a", " a "]);
    expect(trigramsOf("Pre-roll 0.5g")).toEqual(trigramsOf("pre roll 0 5g"));
    expect(trigramsOf("  ")).toEqual([]);
  });

  it("measures similarity as Postgres does: shared trigrams over the union", () => {
    expect(trigramSimilarity("word", "two words")).toBeCloseTo(4 / 11, 6); // pg_trgm's documented example: 0.363636
    expect(trigramSimilarity("Grinder", "grinder")).toBe(1);
    expect(trigramSimilarity("", "")).toBe(0);
    expect(trigramSimilarity("xqzvw", "Abrahams")).toBe(0);
  });

  it("measures word similarity against the closest run of the longer text", () => {
    expect(wordSimilarity("word", "two words")).toBeCloseTo(0.8, 6); // pg_trgm's documented example
    expect(wordSimilarity("durbn", "Durban Poison")).toBeCloseTo(4 / 6, 6);
    expect(wordSimilarity("Abrahms", "Abrahams")).toBeCloseTo(5 / 8, 6); // "abrah" is the closest run
    expect(wordSimilarity("ndlovo", "Ndlovu")).toBeCloseTo(5 / 7, 6);
    expect(wordSimilarity("nothern lights", "Northern Lights")).toBeGreaterThanOrEqual(0.5);
    expect(wordSimilarity("og", "OG Kush")).toBe(1);
    expect(wordSimilarity("grindr", "Sunset Grinder")).toBeGreaterThanOrEqual(0.5);
    expect(wordSimilarity("tez", "tea")).toBeLessThan(0.6);
    expect(wordSimilarity("xqzvw", "Abrahams")).toBe(0);
    expect(wordSimilarity("", "Abrahams")).toBe(0);
  });

  it("prefilters candidates by the first two letters of a word at a word start, or the whole word anywhere", () => {
    expect(likePatterns("calm oli")).toEqual(["ca%", "% ca%", "%calm oli%", "%calm%", "ol%", "% ol%", "%oli%"]);
    expect(likePatterns("og")).toEqual(["og%", "% og%"]);
    expect(likePatterns("a")).toEqual(["a%", "% a%"]);
    expect(likePatterns(" % ")).toEqual([]);
    expect(likePatterns("50%_off")).toEqual(["50%", "% 50%", "%50off%"]);
    expect(likePatterns("x".repeat(60))[2]).toHaveLength(42); // a LIKE pattern is at most 50 bytes
  });
});
