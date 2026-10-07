// Till product search (client-side, ~1k variants): forgiving about how people type at a busy counter.
// Matches name, brand, strain, tagline, variant names, SKU, barcode, category and class words; ignores
// hyphens and spaces inside words ("preroll" = "pre-roll"), singular/plural ("gummy" = "gummies"), a comma
// as the decimal mark ("3,5g" = "3.5g"); when nothing matches exactly, allows one typo per word of 4+ letters.

type Entry<T> = { item: T; text: string; tokens: string[] };
export type SearchIndex<T> = Entry<T>[];

/** Lower case, accents off, "3,5" → "3.5", every other separator (hyphen, slash, ×…) → a space. */
export function normaliseSearch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, " ")
    .trim();
}

/** Singular form, near enough for product words: gummies → gummy, pre-rolls → roll, brushes → brush, glass stays. */
export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (/(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

const words = (s: string) => normaliseSearch(s).split(" ").filter(Boolean).map(stem);

/** Builds the index once per catalogue: `fields` gives the text a person might type for each item. */
export function searchIndex<T>(items: T[], fields: (item: T) => (string | null | undefined)[]): SearchIndex<T> {
  return items.map((item) => {
    const tokens = fields(item).flatMap((f) => (f ? words(f) : []));
    // Neighbouring words joined too, so "preroll" and "livestock" style typing finds "pre-roll".
    const joined = tokens.slice(1).map((t, i) => tokens[i] + t);
    const all = [...new Set([...tokens, ...joined])];
    return { item, tokens: all, text: ` ${all.join(" ")}` };
  });
}

/** At most one edit (insert, delete, substitute, or swap two neighbours) between a and b. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** A typed word (4+ letters) one typo away from a word in the item, or from the start of one ("durbn" → "durban"). */
const fuzzyHit = (w: string, tokens: string[]) =>
  tokens.some((t) => withinOneEdit(w, t) || (t.length > w.length && (withinOneEdit(w, t.slice(0, w.length)) || withinOneEdit(w, t.slice(0, w.length + 1)))));

/** Items matching every typed word (as the start of, or inside, a word); one typo per 4+ letter word when none match. */
export function search<T>(index: SearchIndex<T>, query: string): T[] {
  const ws = words(query);
  if (!ws.length) return index.map((e) => e.item);
  const exact = index.filter((e) => ws.every((w) => e.text.includes(w)));
  if (exact.length) return exact.map((e) => e.item);
  return index.filter((e) => ws.every((w) => e.text.includes(w) || (w.length >= 4 && /[a-z]/.test(w) && fuzzyHit(w, e.tokens)))).map((e) => e.item);
}
