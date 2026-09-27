// Pure FormData / input parsing for HQ server actions. Everything the browser sends is
// untrusted text: these helpers normalise it and never throw.

export const str = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
export const opt = (fd: FormData, name: string) => str(fd, name) || null;
export const bool = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
};
export const list = (fd: FormData, name: string) => [...new Set(fd.getAll(name).map((v) => String(v).trim()).filter(Boolean))];

/** "R1,234.50" / "1234.5" / "1 234" → cents. null when empty or not a number. */
export function parseRand(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").replace(/[R\s,]/gi, "");
  if (!s) return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** "6" / "6.5%" → basis points (600 / 650). */
export function parsePctToBps(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").replace(/[%\s]/g, "");
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function parseNum(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").replace(/[\s,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseInt10(raw: string | null | undefined): number | null {
  const n = parseNum(raw);
  return n != null && Number.isInteger(n) ? n : null;
}

/** <input type="date"> (SAST calendar day) → start of that day in SAST as a UTC Date. */
export function parseDay(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+02:00`) : null;
}

/** <input type="datetime-local"> (SAST wall clock) → UTC Date. */
export function parseLocal(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+02:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const localFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});

/** Date → "YYYY-MM-DDTHH:mm" in SAST, for datetime-local defaults. */
export function toLocalInput(d: Date | null | undefined) {
  if (!d) return "";
  const p = Object.fromEntries(localFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** "16:30" → minutes after midnight. */
export function parseClock(raw: string | null | undefined): number | null {
  const m = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export const clock = (minutes: number | null | undefined) =>
  minutes == null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Comma or newline separated text → trimmed unique values. */
export const splitList = (raw: string) => [...new Set(raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/** Builds a query string from params, dropping empty values. */
export function qs(params: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * NCC opt-out registry / refusal list import: one value per line or comma separated.
 * Phones are normalised to E.164 (+27…), emails lower-cased; anything else is rejected.
 */
export function parseSuppressionList(raw: string, normalisePhone: (s: string) => string | null) {
  const values = new Set<string>();
  const rejected: string[] = [];
  for (const cell of raw.split(/[\n,;\t]/).map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean)) {
    if (/^(phone|msisdn|mobile|email|number|value)$/i.test(cell)) continue; // header row
    if (cell.includes("@")) {
      const e = cell.toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) values.add(e);
      else rejected.push(cell);
      continue;
    }
    const p = normalisePhone(cell);
    if (p) values.add(p);
    else rejected.push(cell);
  }
  return { values: [...values], rejected };
}
