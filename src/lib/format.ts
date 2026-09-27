export const TZ = "Africa/Johannesburg";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD in South African time — the business day used for rollups and reports. */
export const dayKey = (d: Date) => dayFmt.format(d);

/** Midnight SAST of the business day containing `d`, as a UTC Date (SAST is UTC+2, no DST). */
export const startOfDaySA = (d: Date) => new Date(`${dayKey(d)}T00:00:00+02:00`);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** A DATE column value for a business day (UTC midnight of that calendar date). */
export const dateOnly = (d: Date) => new Date(`${dayKey(d)}T00:00:00Z`);

export function hourSA(d: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)) % 24;
}
export function weekdaySA(d: Date) {
  // 0 = Sunday
  return new Date(`${dayKey(d)}T12:00:00Z`).getUTCDay();
}

export const fmtDate = (d: Date | string) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
export const fmtDay = (d: Date | string) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(d));
export const fmtTime = (d: Date | string) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
export const fmtDateTime = (d: Date | string) => `${fmtDate(d)}, ${fmtTime(d)}`;
export const fmtMonth = (d: Date | string) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, month: "long", year: "numeric" }).format(new Date(d));

export function timeAgo(d: Date | string, now = new Date()) {
  const s = Math.round((now.getTime() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days < 30 ? `${days}d ago` : fmtDate(d);
}

export const num = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** Inclusive date range → [from 00:00 SAST, to+1 00:00 SAST). Accepts YYYY-MM-DD strings. */
export function rangeFromParams(sp: { from?: string; to?: string }, defaultDays = 30, now = new Date()) {
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : dayKey(now);
  const from =
    sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : dayKey(addDays(new Date(`${to}T12:00:00+02:00`), -(defaultDays - 1)));
  return {
    from,
    to,
    start: new Date(`${from}T00:00:00+02:00`),
    end: addDays(new Date(`${to}T00:00:00+02:00`), 1),
    fromDate: new Date(`${from}T00:00:00Z`),
    toDate: new Date(`${to}T00:00:00Z`),
    days: Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1,
  };
}
export type DateRange = ReturnType<typeof rangeFromParams>;
