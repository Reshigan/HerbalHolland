// Admin list searches ("haze amnesia", "pre roll", "preroll"): split into words that must all match, in any order,
// each with a "squashed" form (letters and digits only) so punctuation and hyphens don't matter ("Pre-roll").

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
