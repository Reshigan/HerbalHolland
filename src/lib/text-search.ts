// Admin list searches ("haze amnesia", "pre roll", "preroll"): split into words that must all match, in any order,
// each with a "squashed" form (letters and digits only) so punctuation and hyphens don't matter ("Pre-roll").
import { SHORT_SIMILARITY_THRESHOLD, WORD_SIMILARITY_THRESHOLD } from "./search";

export type SearchTerm = { word: string; squashed: string };

/** At most 6 words; punctuation-only words dropped. */
export function searchTerms(q: string | null | undefined): SearchTerm[] {
  return (q ?? "")
    .trim()
    .split(/[\s,;/]+/)
    .map((word) => ({ word: word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), squashed: squash(word) }))
    .filter((t) => t.squashed)
    .slice(0, 6);
}

/** "Pre-Roll 0.5g" → "preroll05g". */
export const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// ── Close matches (typos) ───────────────────────────────────────────────────
// When a product search finds nothing as typed, it runs again loosely: pg_trgm word similarity against product and
// variant names, measured as the shop's search measures it ("durbn" finds Durban Poison). See src/server/hq/catalogue.ts.
// Member searches loosen the same way (@/lib/member-search).

/** The most close matches a search shows. */
export const CLOSE_MATCHES = 50;

/**
 * A search to loosen into a close-match search: the text to compare (lower case, single spaces, at most 60 characters)
 * and how alike a name must be (word similarity, 0–1) — short queries need more ("tea" sits close to too much). Null
 * for fewer than three letters or digits.
 */
export function closeNeedle(q: string | null | undefined): { needle: string; threshold: number } | null {
  const needle = (q ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60).trim();
  const letters = squash(needle).length;
  if (letters < 3) return null;
  return { needle, threshold: letters <= 4 ? SHORT_SIMILARITY_THRESHOLD : WORD_SIMILARITY_THRESHOLD };
}

/** Rows in the order of `ids` (closest match first); rows whose id isn't listed are left out. */
export function inRankOrder<T>(rows: T[], ids: string[], idOf: (r: T) => string): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return rows.filter((r) => rank.has(idOf(r))).sort((a, b) => rank.get(idOf(a))! - rank.get(idOf(b))!);
}
