// Member search box: what a typed query means. Staff type names either way round ("Abrahams, Mpho"),
// the tail of a phone ("9585"), or a member number without its HH or padding ("100001").
import { normalisePhone } from "./sa";

/** Member numbers are HH + 7 digits (HH0100001). */
export const MEMBER_NO_DIGITS = 7;

export type MemberQuery =
  | { kind: "empty" }
  | { kind: "phone"; phone: string }
  | { kind: "email"; email: string }
  /** "HH100001": a member number only. */
  | { kind: "memberNo"; memberNo: string }
  /** Digits only: a member number (padded) and, with 4+ digits, the end of a phone or member number. */
  | { kind: "digits"; digits: string; memberNo: string | null; tail: string | null }
  /** Names in any order: every word must start a first or last name. */
  | { kind: "names"; words: string[] };

const padMemberNo = (digits: string) => (digits.length <= MEMBER_NO_DIGITS ? `HH${digits.padStart(MEMBER_NO_DIGITS, "0")}` : null);

export function parseMemberQuery(raw: string | undefined | null): MemberQuery {
  const q = (raw ?? "").trim();
  if (!q) return { kind: "empty" };
  if (q.includes("@")) return { kind: "email", email: q.toLowerCase() };
  const compact = q.replace(/[\s()+-]/g, "");
  if (/^\d+$/.test(compact) && compact.length >= 9) {
    const phone = normalisePhone(q);
    if (phone) return { kind: "phone", phone };
  }
  const hh = /^HH(\d+)$/i.exec(compact);
  if (hh) return { kind: "memberNo", memberNo: padMemberNo(hh[1]) ?? `HH${hh[1]}` };
  if (/^\d+$/.test(compact)) return { kind: "digits", digits: compact, memberNo: padMemberNo(compact), tail: compact.length >= 4 ? compact : null };
  const words = q
    .replace(/[,;.]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length ? { kind: "names", words } : { kind: "empty" };
}

/**
 * A looser search to offer when nothing matched a name search (likely a typo in one word):
 * the longest word, or the first four letters of a single long word. Null when there's nothing looser.
 */
export function looserMemberQuery(q: MemberQuery): string | null {
  if (q.kind !== "names") return null;
  if (q.words.length > 1) return [...q.words].sort((a, b) => b.length - a.length)[0];
  const w = q.words[0];
  return w.length > 4 ? w.slice(0, 4) : null;
}

// ── Close matches (typos) ───────────────────────────────────────────────────
// When a name search finds nobody, the search runs again loosely: pg_trgm word similarity against first and last names
// ("Abrahms" finds Abrahams, "ndlovo" Ndlovu). The database does the matching (src/server/hq/crm.ts closeNameMatches).

/** How alike a typed word and a first or last name must be (pg_trgm word_similarity, 0–1). */
export const NAME_SIMILARITY = 0.4;

/** The words of a search worth matching loosely against names: those with letters and no digits, at most four. */
export function nameWords(raw: string | undefined | null): string[] {
  const q = (raw ?? "").trim();
  if (!q || q.includes("@")) return [];
  return q
    .replace(/[,;.]/g, " ")
    .split(/\s+/)
    .filter((w) => !/\d/.test(w))
    .map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 4);
}
