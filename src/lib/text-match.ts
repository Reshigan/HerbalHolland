/**
 * Every word of `q` appears in `hay`, case-insensitive, ignoring hyphens and spaces inside words:
 * "preroll" finds "Pre-roll", "pre roll" finds "Preroll", "hh0123" finds "HH-0123".
 */
export function textMatches(hay: string, q: string) {
  const h = hay.toLowerCase();
  const flat = h.replace(/[-\s]+/g, "");
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => h.includes(t) || flat.includes(t.replace(/-+/g, "")));
}
