// Shop search that understands typos and units. The query is parsed into words, measures ("600", "600mg", "30ml",
// "3.5g") and product-class words (oil, cream, coffee, gummies…); trigram similarity (the pg_trgm rules, computed
// here over the candidates the database prefilters) covers the typo side; ranking puts exact names first, then
// prefixes, then similar names, then taglines. Pure: safe on the server, in the browser and in tests (tests/search.test.ts).

export type Unit = "mg" | "g" | "ml";
export type Measure = { value: number; unit: Unit | null; raw: string };
/** `moods`: the shop moods (product effects) the query asks for ("sleep" → rest). */
export type ParsedQuery = { raw: string; norm: string; terms: string[]; measures: Measure[]; classes: string[]; moods?: string[]; required?: string[] };

export const QUERY_MAX = 60;

/**
 * Product types written as one word, apart or hyphenated ("pre roll", "pre-roll", "preroll"), to the stem a product
 * must have to be one. The query keeps them as one word: "pre roll" never finds a rolling tray by the start of "rolling".
 */
const JOINED = new Map([["preroll", "preroll"], ["prerolls", "preroll"], ["prerolled", "preroll"]]);

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
  tea: ["tea", "teas", "infusion", "chai"],
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

/**
 * Everyday words for the shop's moods (the effects products are tagged with). Search only: they find products by
 * mood, they never claim anything about them.
 */
export const MOOD_WORDS: Record<string, string[]> = {
  rest: ["rest", "restful", "sleep", "sleepy", "sleeping", "bedtime", "night", "nighttime", "evening", "wind-down", "winddown", "unwind"],
  calm: ["calm", "calming", "relax", "relaxed", "relaxing", "chill", "mellow", "unwind"],
  focus: ["focus", "focused", "work", "study", "concentrate"],
  recover: ["recover", "recovery", "gym", "training", "workout"],
  uplifted: ["uplift", "uplifted", "uplifting", "upbeat", "energy", "energised", "energized", "energetic"],
  social: ["social", "party"],
  creative: ["creative", "creativity"],
  happy: ["happy", "euphoric"],
};
/** The product effects that count as each mood. */
const MOOD_EFFECTS: Record<string, string[]> = {
  rest: ["rest", "sleepy"],
  calm: ["calm", "relaxed"],
  focus: ["focus", "focused", "clear"],
  recover: ["recover"],
  uplifted: ["uplifted", "energised"],
  social: ["social"],
  creative: ["creative"],
  happy: ["happy", "euphoric"],
};
const MOODS_OF = new Map<string, string[]>();
for (const [k, words] of Object.entries(MOOD_WORDS)) for (const w of words) MOODS_OF.set(w, [...(MOODS_OF.get(w) ?? []), k]);

/** Lower-case, no accents, one space between words (no length cap: for product text). */
export const normaliseText = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.,%&+'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A query: normalised as above, at most QUERY_MAX characters. */
export const normalise = (s: string) => normaliseText(s).slice(0, QUERY_MAX).trim();

/** Every measure written in a text ("600mg", "3.5 g", "30ml", a bare "600"). */
export function measuresIn(text: string): Measure[] {
  const out: Measure[] = [];
  for (const m of normaliseText(text).matchAll(MEASURE)) {
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
  // "pre roll" → "preroll": adjacent words that make a known product type become that one word.
  const joined: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const pair = i + 1 < words.length ? squash(words[i] + words[i + 1]) : "";
    if (JOINED.has(pair)) (joined.push(pair), i++);
    else joined.push(words[i]);
  }
  const terms = [...new Set(joined)];
  const required = [...new Set(terms.map((t) => JOINED.get(squash(t))).filter((r): r is string => !!r))];
  const classes = [...new Set(terms.map((t) => CLASS_OF.get(t)).filter((c): c is string => !!c))];
  const moods = [...new Set(terms.flatMap((t) => MOODS_OF.get(t) ?? []))];
  return { raw, norm, terms, measures, classes, moods, ...(required.length && { required }) };
}

// ── Trigram similarity (pg_trgm's rules, in code) ───────────────────────────
// Postgres's pg_trgm measured typos for us; SQLite has nothing like it, so the same measure runs here over a bounded
// set of candidate names the database prefilters (src/server/shop/search.ts, src/server/hq/catalogue.ts, crm.ts).

/** The words of a text as pg_trgm sees them: lower case, runs of letters and digits; everything else separates. */
const trigramWords = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** The trigrams of a text in order, repeats kept: each word padded with two spaces before and one after. */
export function trigramsOf(s: string): string[] {
  const out: string[] = [];
  for (const w of trigramWords(s)) {
    const padded = `  ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm `similarity(a, b)`: shared trigrams over all distinct trigrams of both (0–1). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = new Set(trigramsOf(a));
  const tb = new Set(trigramsOf(b));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const union = ta.size + tb.size - common;
  return union ? common / union : 0;
}

/**
 * pg_trgm `word_similarity(a, b)`: the greatest similarity between a's trigrams and any continuous run of b's
 * trigrams, so a word typed close to one word of a longer name scores as if against that word ("durbn" against
 * "Durban Poison"). Runs only start and end on trigrams a has: others can only lower the score.
 */
export function wordSimilarity(a: string, b: string): number {
  const ta = new Set(trigramsOf(a));
  const tb = trigramsOf(b);
  if (!ta.size || !tb.length) return 0;
  let best = 0;
  for (let i = 0; i < tb.length; i++) {
    if (!ta.has(tb[i])) continue;
    const seen = new Set<string>();
    let found = 0;
    for (let j = i; j < tb.length; j++) {
      const t = tb[j];
      const hit = ta.has(t);
      if (!seen.has(t)) {
        seen.add(t);
        if (hit) found++;
      }
      if (hit) best = Math.max(best, found / (ta.size + seen.size - found));
    }
  }
  return best;
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
  /** The moods the product is tagged with (Product.effects). */
  effects?: string[];
  netContent?: number | null;
  netUnit?: string | null; // "g" | "ml"
  cbdMgPerPack?: number | null;
  variants: SearchVariant[];
  /** Trigram similarity to the query (0–1), when it was computed for this product (`similarProducts`). */
  sim?: number | null;
};
export type MatchKind = "exact" | "prefix" | "word" | "mood" | "measure" | "fuzzy" | "text";
export type Ranked = { id: string; score: number; kind: MatchKind };

/** Similarity below this is noise: the similarity search ignores it and so does the ranking. */
export const SIMILARITY_THRESHOLD = 0.25;
/** A whole query word inside a name (word_similarity) counts from here. */
export const WORD_SIMILARITY_THRESHOLD = 0.5;
/** Short queries ("tea") are close to too many words ("tee"): they need this much similarity. */
export const SHORT_SIMILARITY_THRESHOLD = 0.6;
/** The similarity a query needs before a product counts as a typo match. */
export const similarityFloor = (norm: string) => (norm.replace(/\s/g, "").length <= 4 ? SHORT_SIMILARITY_THRESHOLD : SIMILARITY_THRESHOLD);

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

/** Hyphens and apostrophes don't matter: "pre-roll", "preroll" and "pre roll" are the same. */
const squash = (w: string) => w.replace(/[-']/g, "");

/** The words of a text a query word can match: each word, its hyphen-free form, its hyphen parts, and adjacent pairs joined. */
function keysOf(text: string): string[] {
  const words = normaliseText(text)
    .split(" ")
    .map((w) => w.replace(/^[.,'-]+|[.,'-]+$/g, ""))
    .filter(Boolean);
  const keys = new Set<string>();
  words.forEach((w, i) => {
    keys.add(squash(w));
    for (const part of w.split("-")) if (part) keys.add(squash(part));
    if (i > 0) keys.add(squash(words[i - 1] + w));
  });
  return [...keys];
}

/** A whole word, or (for words of 3+ letters) the start of one: word starts only, never the middle of a word. */
const hit = (keys: string[], t: string) => keys.includes(t) || (t.length >= 3 && keys.some((k) => k.startsWith(t)));

const STRONG: MatchKind[] = ["exact", "prefix", "word", "mood", "measure"];

/**
 * Scores every document against the query and returns the matches, best first. Exact name > name prefix > every word
 * in the name > mood > similar name (typos) > tagline and other text. Measures and class words add to whatever matched.
 * Words match on word starts; words under 3 letters only as whole words (or, last in a longer query, to break ties).
 * When some products match by name, mood or measure, products found only in their text, a class word or by
 * similarity are left out; a text-only match needs every word of the query, and when some product matches every
 * word, those matching only some are left out.
 */
export function rankSearch(q: ParsedQuery, docs: SearchDoc[]): Ranked[] {
  const terms = q.terms.map(squash).filter(Boolean);
  const long = terms.filter((t) => t.length >= 3);
  const short = terms.filter((t) => t.length < 3);
  const countable = long.length ? long : terms;
  const phrase = terms.length > 1 ? terms.join("") : null;
  const floor = similarityFloor(q.norm);
  const moods = q.moods ?? [];
  const scored: (Ranked & { covered: number })[] = [];
  for (const d of docs) {
    const name = normaliseText(d.name);
    const nameKeys = keysOf(d.name);
    const taglineKeys = keysOf(d.tagline ?? "");
    const variantKeys = keysOf(d.variants.map((v) => v.name).join(" "));
    const categoryKeys = keysOf(d.category ?? "");
    const restKeys = keysOf([d.description ?? "", d.category ?? "", ...(d.words ?? [])].join(" "));
    const effects = new Set((d.effects ?? []).map((e) => normaliseText(e)));
    const moodOf = (t: string) => (MOODS_OF.get(t) ?? []).some((m) => moods.includes(m) && (MOOD_EFFECTS[m] ?? [m]).some((e) => effects.has(e)));
    const classIn = (t: string, keys: string[]) => {
      const c = CLASS_OF.get(t);
      return !!c && (CLASS_WORDS[c] ?? []).some((w) => keys.includes(squash(w)));
    };
    // A product type the query names ("pre roll") must be what the product is, not a near-miss by name or typo.
    if (q.required?.some((r) => ![nameKeys, taglineKeys, variantKeys, categoryKeys, restKeys].some((keys) => keys.some((k) => k.startsWith(r))))) continue;
    let score = 0;
    let kind: MatchKind | null = null;
    let covered = 0;
    let moodHit = false;

    if (q.norm && name === q.norm) (score += 1000), (kind = "exact");
    else if (q.norm && name.startsWith(q.norm)) (score += 500), (kind = "prefix");

    let inName = 0;
    for (const t of long.length ? long : short) {
      let found = true;
      if (nameKeys.includes(t)) (inName++, (score += 120));
      else if (hit(nameKeys, t)) (inName++, (score += 90));
      else if (moodOf(t)) (moodHit = true), (score += 80);
      else if (classIn(t, nameKeys)) score += 60; // "balm" for "cream": shown when nothing is called a cream
      else if (hit(taglineKeys, t)) score += 40;
      else if (classIn(t, categoryKeys)) score += 30;
      else if (hit(variantKeys, t)) score += 30;
      else if (t.length >= 3 && hit(restKeys, t)) score += 15;
      else found = false;
      if (found) covered++;
    }
    // Short words in a longer query ("rooibos te"): only a whole word, or the start of a name word, and only as a tie-break.
    if (long.length && score > 0)
      for (const t of short) {
        if (nameKeys.includes(t) || taglineKeys.includes(t)) score += 20;
        else if (nameKeys.some((k) => k.startsWith(t))) score += 10;
      }
    if (phrase && (nameKeys.includes(phrase) || taglineKeys.includes(phrase))) (score += 150), (inName = Math.max(inName, countable.length));
    if (inName && countable.length && inName >= countable.length) (score += 100), (covered = countable.length); // every word of the query is in the name
    if (inName && !kind) kind = "word";
    if (moodHit && !kind) kind = "mood";

    const sim = d.sim ?? 0;
    if (sim >= floor) {
      score += Math.round(sim * 200);
      if (!kind) kind = "fuzzy";
    }

    let measured = 0;
    for (const m of q.measures)
      if (measureMatches(m, d)) (measured++, (score += 150));
      else if (score > 0) score -= 40; // the product is about the right thing, but not that size or strength
    if (measured && !kind) kind = "measure";

    if (score <= 0) continue;
    if (!kind) kind = "text";
    if (kind === "text" && covered < countable.length) continue; // text alone must match every word
    scored.push({ id: d.id, score, kind, covered });
  }
  const strong = scored.some((r) => STRONG.includes(r.kind));
  // When some product matches every word ("cbd oil"), products matching only some of them are left out.
  const full = countable.length > 1 && scored.some((r) => STRONG.includes(r.kind) && r.covered >= countable.length);
  const out: Ranked[] = scored
    .filter((r) => (!strong || STRONG.includes(r.kind)) && (!full || r.covered >= countable.length || r.kind === "exact" || r.kind === "prefix"))
    .map(({ id, score, kind }) => ({ id, score, kind }));
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
