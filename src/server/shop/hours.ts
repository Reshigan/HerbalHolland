// Store opening hours in South African time (pure, shared by the store finder,
// store pages and the in-store menu board). Hours are stored per weekday as
// { mon: ["09:00", "20:00"], … }; a missing or null day means closed.
import { TZ } from "@/lib/format";

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type Hours = Partial<Record<DayKey, [string, string] | null>>;

const DAY_NAME: Record<DayKey, string> = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates the JSON column; anything malformed is treated as closed. */
export function parseHours(raw: unknown): Hours {
  const out: Hours = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of DAY_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (Array.isArray(v) && v.length === 2 && TIME.test(String(v[0])) && TIME.test(String(v[1]))) out[k] = [String(v[0]), String(v[1])];
  }
  return out;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function sastNow(at: Date) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minute: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

export type OpenState = {
  open: boolean;
  /** Short status for badges, e.g. "Open until 20:00" or "Opens tomorrow 09:00". */
  label: string;
  today: [string, string] | null;
};

export function openState(hours: Hours, at = new Date()): OpenState {
  const { day, minute } = sastNow(at);
  const today = hours[DAY_KEYS[day]] ?? null;
  if (today) {
    const [o, c] = today.map(toMin);
    const close = c <= o ? 24 * 60 : c;
    if (minute >= o && minute < close) return { open: true, label: `Open until ${today[1]}`, today };
    if (minute < o) return { open: false, label: `Opens today ${today[0]}`, today };
  }
  for (let i = 1; i <= 7; i++) {
    const k = DAY_KEYS[(day + i) % 7];
    const h = hours[k];
    if (h) return { open: false, label: `Opens ${i === 1 ? "tomorrow" : DAY_NAME[k]} ${h[0]}`, today };
  }
  return { open: false, label: "Temporarily closed", today };
}

/** Monday-first rows for an opening-hours table. */
export function weekRows(hours: Hours, at = new Date()) {
  const { day } = sastNow(at);
  return [1, 2, 3, 4, 5, 6, 0].map((i) => {
    const k = DAY_KEYS[i];
    const h = hours[k];
    return { key: k, label: DAY_NAME[k], span: h ? `${h[0]}–${h[1]}` : "Closed", today: i === day };
  });
}

/**
 * When a click & collect order placed now will be ready: within 2 hours while the store is open for at least that
 * long, otherwise from the next opening ("Ready tomorrow from 09:00").
 */
export function collectReady(hours: Hours, at = new Date()): { soon: boolean; label: string } {
  const { day, minute } = sastNow(at);
  const today = hours[DAY_KEYS[day]] ?? null;
  if (today) {
    const [o, c] = today.map(toMin);
    const close = c <= o ? 24 * 60 : c;
    if (minute >= o && close - minute >= 120) return { soon: true, label: "Usually ready within 2 hours" };
    if (minute < o) return { soon: false, label: `Ready today from ${today[0]}` };
  }
  for (let i = 1; i <= 7; i++) {
    const k = DAY_KEYS[(day + i) % 7];
    const h = hours[k];
    if (h) return { soon: false, label: `Ready ${i === 1 ? "tomorrow" : DAY_NAME[k]} from ${h[0]}` };
  }
  return { soon: false, label: "Ready when the store reopens" };
}
