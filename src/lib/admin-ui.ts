// Pure rules behind the admin shell's keyboard shortcuts, command palette, saved views and the message log's
// recipient masking. No I/O, so they're unit-tested (tests/admin-ui.test.ts).

// ── Keyboard shortcuts ───────────────────────────────────────────────────────

/** `g` then a letter within this many ms jumps to a section. */
export const CHORD_MS = 900;

export type Jump = { key: string; label: string; store: (code: string) => string; hq: string };

/** The "go to" chords. Store and HQ each map the same letter to their own screen. */
export const JUMPS: Jump[] = [
  { key: "h", label: "Overview", store: (c) => `/store/${c}`, hq: "/hq" },
  { key: "o", label: "Orders", store: (c) => `/store/${c}/orders`, hq: "/hq/orders" },
  { key: "i", label: "Inventory", store: (c) => `/store/${c}/inventory`, hq: "/hq/catalogue" },
  { key: "r", label: "Reports", store: (c) => `/store/${c}/reports`, hq: "/hq/reports" },
  { key: "m", label: "Members", store: (c) => `/store/${c}/customers`, hq: "/hq/customers" },
];

export type Chord = { at: number } | null;

/**
 * Feeds one key press into the chord state. Returns the destination when `g` + letter completed within CHORD_MS,
 * the new pending state after a `g`, or null when nothing matched.
 */
export function chord(pending: Chord, key: string, now: number, area: "store" | "hq", storeCode?: string): { next: Chord; href?: string } {
  if (pending && now - pending.at <= CHORD_MS) {
    const j = JUMPS.find((x) => x.key === key);
    if (j) return { next: null, href: area === "hq" ? j.hq : j.store(storeCode ?? "") };
    return { next: null };
  }
  if (key === "g") return { next: { at: now } };
  return { next: null };
}

/** True when a key press belongs to a text control, where single-letter shortcuts must not fire. */
export function inTextField(el: { tagName?: string; isContentEditable?: boolean; getAttribute?: (n: string) => string | null } | null | undefined) {
  if (!el?.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.getAttribute?.("type") ?? "text").toLowerCase();
    return !["checkbox", "radio", "button", "submit", "reset", "range", "file", "color"].includes(type);
  }
  return !!el.isContentEditable;
}

// ── Command palette ──────────────────────────────────────────────────────────

export type PaletteItem = {
  href: string;
  label: string;
  group?: string;
  /** Extra words that find it (synonyms, a report's question, a store code); matched, never shown. */
  keywords?: string;
  kind: "nav" | "recent" | "jump" | "report" | "store" | "search";
};

/** Every query word must appear in the label, group or keywords; exact label prefixes rank first, then shorter labels. */
export function searchPalette(items: PaletteItem[], query: string, limit = 12): PaletteItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.slice(0, limit);
  const score = (i: PaletteItem) => {
    const label = i.label.toLowerCase();
    const hay = `${label} ${i.group?.toLowerCase() ?? ""} ${i.keywords?.toLowerCase() ?? ""}`;
    if (!words.every((w) => hay.includes(w))) return null;
    return (label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2) * 100 + label.length;
  };
  return items
    .map((i) => [i, score(i)] as const)
    .filter((x): x is readonly [PaletteItem, number] => x[1] != null)
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([i]) => i);
}

/**
 * Record searches offered under every palette query, so a name, phone, SKU or order code typed into the palette
 * always goes somewhere. HQ searches the network; a store searches its own members, stock and orders.
 */
export function paletteSearches(query: string, area: "store" | "hq", storeCode?: string): PaletteItem[] {
  const q = query.trim();
  if (!q) return [];
  const e = encodeURIComponent(q);
  const base = area === "hq" ? "/hq" : `/store/${storeCode ?? ""}`;
  return [
    { href: `${base}/customers?q=${e}`, label: `Search members for “${q}”`, group: "Search", kind: "search" },
    area === "hq"
      ? { href: `/hq/catalogue?q=${e}`, label: `Search catalogue for “${q}”`, group: "Search", kind: "search" }
      : { href: `${base}/inventory?q=${e}`, label: `Search stock for “${q}”`, group: "Search", kind: "search" },
    { href: `${base}/orders?q=${e}`, label: `Find order “${q}”`, group: "Search", kind: "search" },
  ];
}

/** The same section at another store: /store/PTA01/orders/abc?range=7d&q=x → /store/PTA02/orders?range=7d (records don't carry across). */
export function switchStorePath(path: string, search: string, to: string) {
  const section = path.split("/")[3];
  const keep = new URLSearchParams([...new URLSearchParams(search)].filter(([k]) => k === "range" || k === "from" || k === "to"));
  const qs = keep.toString();
  return `/store/${to}${section ? `/${section}` : ""}${qs ? `?${qs}` : ""}`;
}

export type Recent = { href: string; title: string; at: number };

/** Adds a visit to the front of the recent-pages list (one entry per URL, newest first, capped). */
export function pushRecent(list: Recent[], entry: Recent, max = 8): Recent[] {
  return [entry, ...list.filter((r) => r.href !== entry.href)].slice(0, max);
}

/** "Members & CRM · Herbal Holland" → "Members & CRM". */
export const pageTitle = (documentTitle: string) => documentTitle.replace(/\s*[·|–-]\s*Herbal Holland.*$/i, "").trim() || documentTitle.trim();

// ── Saved views ──────────────────────────────────────────────────────────────

export type SavedView = { name: string; query: string; at: number };

export const VIEWS_MAX = 12;

export const viewsKey = (userKey: string, pageKey: string) => `hh.views.${userKey}.${pageKey}`;
export const recentKey = (userKey: string) => `hh.recent.${userKey}`;

/** Parses stored JSON defensively: anything that isn't a list of {name, query} is dropped. */
export function parseViews(raw: string | null | undefined): SavedView[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x.name === "string" && typeof x.query === "string" && x.name.trim())
      .map((x) => ({ name: String(x.name).slice(0, 60), query: normaliseQuery(String(x.query)), at: Number(x.at) || 0 }))
      .slice(0, VIEWS_MAX);
  } catch {
    return [];
  }
}

/** A query string without its leading "?" or a page number, with keys in a stable order (so two views compare). */
export function normaliseQuery(q: string) {
  const p = new URLSearchParams(q.startsWith("?") ? q.slice(1) : q);
  p.delete("page");
  p.delete("m");
  const entries = [...p.entries()].filter(([, v]) => v !== "").sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(entries).toString();
}

/** Adds or replaces a view by name (case-insensitive), newest first, capped. */
export function saveView(list: SavedView[], view: SavedView): SavedView[] {
  const name = view.name.trim().slice(0, 60);
  if (!name) return list;
  const query = normaliseQuery(view.query);
  return [{ name, query, at: view.at }, ...list.filter((v) => v.name.toLowerCase() !== name.toLowerCase())].slice(0, VIEWS_MAX);
}

// ── Message log ──────────────────────────────────────────────────────────────

/**
 * Masks a recipient for the message log: enough to recognise, never the whole address.
 *   "thabo@example.com" → "th•••@example.com", "+27821234567" → "+27 82 ••• 4567", anything else as is.
 */
export function maskRecipient(to: string) {
  const v = to.trim();
  if (v.includes("@")) {
    const [user, domain] = v.split("@");
    return `${user.slice(0, 2)}•••@${domain}`;
  }
  const digits = v.replace(/[^\d+]/g, "");
  if (/^\+?\d{9,15}$/.test(digits)) {
    const m = digits.match(/^(\+?\d{2})(\d{2})\d+(\d{4})$/);
    if (m) return `${m[1]} ${m[2]} ••• ${m[3]}`;
  }
  return v;
}
