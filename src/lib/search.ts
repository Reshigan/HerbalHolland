// Shop search that understands typos and units. The query is parsed into words, measures ("600", "600mg", "30ml",
// "3.5g") and product-class words (oil, cream, coffee, gummies…); the database supplies trigram similarity
// (pg_trgm) for the typo side; ranking puts exact names first, then prefixes, then similar names, then taglines.
// Pure: safe on the server, in the browser and in tests (tests/search.test.ts).

export type Unit = "mg" | "g" | "ml";
export type Measure = { value: number; unit: Unit | null; raw: string };
export type ParsedQuery = { raw: string; norm: string; terms: string[]; measures: Measure[]; classes: string[] };

export const QUERY_MAX = 60;

/** Words that carry no meaning on their own. */
const STOP = new Set(["a", "an", "and", "the", "for", "of", "with", "in", "to", "my", "some", "any"]);

const UNITS: Record<string, { unit: Unit; factor: number }> = {
  mg: { unit: "mg", factor: 1 },
  milligram: { unit: "mg", factor: 1 },
  milligrams: { unit: "mg", factor: 1 },
  g: { unit: "g", factor: 1 },
  gr: { unit: "g", factor: 1 },
  gram: { unit: "g", factor: 1 },
  grams: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 },
  ml: { unit: "ml", factor: 1 },
  millilitre: { unit: "ml", factor: 1 },
  millilitres: { unit: "ml", factor: 1 },
  milliliter: { unit: "ml", factor: 1 },
  milliliters: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 },
  litre: { unit: "ml", factor: 1000 },
  litres: { unit: "ml", factor: 1000 },
  liter: { unit: "ml", factor: 1000 },
  liters: { unit: "ml", factor: 1000 },
};
const MEASURE = /(\d+(?:[.,]\d+)?)\s*(mg|milligrams?|kg|grams?|gr|g|ml|millilit(?:re|er)s?|lit(?:re|er)s?|l)?(?![a-z])/g;

/** Words that name a kind of product, and the category or product words they stand for. */
export const CLASS_WORDS: Record<string, string[]> = {
  oil: ["oil", "oils", "tincture", "tinctures", "drops", "dropper"],
  cream: ["cream", "creams", "balm", "balms", "salve", "lotion", "topical", "skin"],
  coffee: ["coffee", "espresso", "beans", "brew"],
  tea: ["tea", "teas", "rooibos", "infusion", "chai"],
  gummies: ["gummy", "gummies", "sweets", "jellies", "edible", "edibles"],
  capsules: ["capsule", "capsules", "softgel", "softgels", "caps", "tablets"],
  protein: ["protein", "whey", "collagen", "shake", "powder"],
  grinder: ["grinder", "grinders"],
  papers: ["papers", "rolling", "cones", "cone", "filters", "tips"],
  apparel: ["tee", "tees", "t-shirt", "tshirt", "shirt", "hoodie", "hoodies", "cap", "beanie", "apparel", "merch"],
  grow: ["seed", "seeds", "soil", "nutrients", "grow", "tent", "light", "lights", "pot", "pots"],
  vape: ["vape", "vapes", "vaporiser", "vaporizer"],
};
const CLASS_OF = new Map<string, string>();
for (const [k, words] of Object.entries(CLASS_WORDS)) for (const w of words) CLASS_OF.set(w, k);

/** Lower-case, no accents, one space between words, at most QUERY_MAX characters. */
export const normalise = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.,%&+'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, QUERY_MAX)
    .trim();

/** Every measure written in a text ("600mg", "3.5 g", "30ml", a bare "600"). */
export function measuresIn(text: string): Measure[] {
  const out: Measure[] = [];
  for (const m of normalise(text).matchAll(MEASURE)) {
    const value = Number(m[1].replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) continue;
    const u = m[2] ? UNITS[m[2]] : null;
    out.push({ value: u ? value * u.factor : value, unit: u?.unit ?? null, raw: m[0].trim() });
  }
  return out;
}

export function parseQuery(raw: string): ParsedQuery {
  const norm = normalise(raw);
  const measures = measuresIn(norm);
  const words = norm
    .replace(MEASURE, " ")
    .split(/[\s,]+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));
  const terms = [...new Set(words)];
  const classes = [...new Set(terms.map((t) => CLASS_OF.get(t)).filter((c): c is string => !!c))];
  return { raw, norm, terms, measures, classes };
}

// ── Ranking ─────────────────────────────────────────────────────────────────

export type SearchVariant = { name: string; grams?: number | null };
export type SearchDoc = {
  id: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string | null;
  words?: string[]; // effects, flavours, origin…
  netContent?: number | null;
  netUnit?: string | null; // "g" | "ml"
  cbdMgPerPack?: number | null;
  variants: SearchVariant[];
  /** Trigram similarity from the database (0–1), when it was computed for this product. */
  sim?: number | null;
};
export type MatchKind = "exact" | "prefix" | "word" | "measure" | "fuzzy" | "text";
export type Ranked = { id: string; score: number; kind: MatchKind };

/** Similarity below this is noise: the database ignores it and so does the ranking. */
export const SIMILARITY_THRESHOLD = 0.25;
/** A whole query word inside a name (word_similarity) counts from here. */
export const WORD_SIMILARITY_THRESHOLD = 0.5;

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Does a measure from the query describe this product (one of its variants, its net content or its CBD per pack)? */
export function measureMatches(m: Measure, doc: Pick<SearchDoc, "netContent" | "netUnit" | "cbdMgPerPack" | "variants">) {
  const facts: Measure[] = [];
  for (const v of doc.variants) {
    if (v.grams != null) facts.push({ value: v.grams, unit: "g", raw: "" });
    facts.push(...measuresIn(v.name));
  }
  if (doc.netContent != null && (doc.netUnit === "g" || doc.netUnit === "ml")) facts.push({ value: doc.netContent, unit: doc.netUnit, raw: "" });
  if (doc.cbdMgPerPack != null) facts.push({ value: doc.cbdMgPerPack, unit: "mg", raw: "" });
  return facts.some((f) => near(f.value, m.value) && (m.unit == null || f.unit == null || f.unit === m.unit));
}

const wordsOf = (s: string) => normalise(s).split(" ").filter(Boolean);

/**
 * Scores every document against the query and returns the matches, best first. Exact name > name prefix > every word
 * in the name > similar name (typos) > tagline and other text. Measures and class words add to whatever matched.
 */
export function rankSearch(q: ParsedQuery, docs: SearchDoc[]): Ranked[] {
  const out: Ranked[] = [];
  for (const d of docs) {
    const name = normalise(d.name);
    const nameWords = wordsOf(d.name);
    const tagline = normalise(d.tagline ?? "");
    const rest = normalise([d.description ?? "", d.category ?? "", ...(d.words ?? [])].join(" "));
    const variantText = normalise(d.variants.map((v) => v.name).join(" "));
    let score = 0;
    let kind: MatchKind | null = null;

    if (q.norm && name === q.norm) (score += 1000), (kind = "exact");
    else if (q.norm && name.startsWith(q.norm)) (score += 500), (kind = "prefix");

    let inName = 0;
    for (const t of q.terms) {
      if (nameWords.some((w) => w === t)) (inName++, (score += 120));
      else if (nameWords.some((w) => w.startsWith(t))) (inName++, (score += 90));
      else if (name.includes(t)) (inName++, (score += 50));
      else if (tagline.split(" ").some((w) => w.startsWith(t))) score += 40;
      else if (variantText.includes(t)) score += 30;
      else if (rest.includes(t)) score += 15;
    }
    if (inName && q.terms.length && inName === q.terms.length) score += 100; // every word of the query is in the name
    if (inName && !kind) kind = "word";

    const sim = d.sim ?? 0;
    if (sim >= SIMILARITY_THRESHOLD) {
      score += Math.round(sim * 200);
      if (!kind) kind = "fuzzy";
    }

    let measured = 0;
    for (const m of q.measures)
      if (measureMatches(m, d)) (measured++, (score += 150));
      else if (score > 0) score -= 40; // the product is about the right thing, but not that size or strength
    if (measured && !kind) kind = "measure";

    for (const c of q.classes) {
      const words = CLASS_WORDS[c] ?? [];
      const hay = `${name} ${tagline} ${rest}`.split(" ");
      if (words.some((w) => hay.includes(w))) score += 60;
    }

    if (score <= 0 || !kind) {
      if (score > 0) kind = "text";
      else continue;
    }
    out.push({ id: d.id, score, kind });
  }
  const byName = new Map(docs.map((d) => [d.id, d.name]));
  return out.sort((a, b) => b.score - a.score || (byName.get(a.id) ?? "").localeCompare(byName.get(b.id) ?? ""));
}

/**
 * "Did you mean …?": when the best match was found only by similarity (the member typed something close to a name,
 * not a word of it), suggest that product's name. Null when the top hit matched on words, or when there is none.
 */
export function didYouMean(ranked: Ranked[], docs: SearchDoc[], q: ParsedQuery): string | null {
  const top = ranked[0];
  if (!top || top.kind !== "fuzzy") return null;
  const name = docs.find((d) => d.id === top.id)?.name ?? null;
  return name && normalise(name) !== q.norm ? name : null;
}

// ── Recent searches (the browser keeps them; members only) ──────────────────

export const RECENT_SEARCHES_KEY = "hh:recent-searches";
export const RECENT_SEARCHES_MAX = 6;

/** The list with `q` moved to the front, de-duplicated, at most RECENT_SEARCHES_MAX long. */
export function withRecentSearch(list: unknown, q: string): string[] {
  const clean = normalise(q);
  const prior = Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];
  if (!clean) return prior.slice(0, RECENT_SEARCHES_MAX);
  return [q.trim(), ...prior.filter((x) => normalise(x) !== clean)].slice(0, RECENT_SEARCHES_MAX);
}
