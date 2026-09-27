// South Africa specific rules: ID numbers, phones, provinces, public holidays and
// the Consumer Protection Act direct-marketing contact windows.
import { TZ, dayKey } from "./format";

export const PROVINCES = {
  GP: "Gauteng",
  WC: "Western Cape",
  KZN: "KwaZulu-Natal",
  EC: "Eastern Cape",
  FS: "Free State",
  LP: "Limpopo",
  MP: "Mpumalanga",
  NW: "North West",
  NC: "Northern Cape",
} as const;
export type ProvinceCode = keyof typeof PROVINCES;

export type IdCheck =
  | { valid: true; dob: Date; sex: "F" | "M"; citizen: boolean }
  | { valid: false; reason: string };

/** Validates a 13-digit SA ID number: YYMMDD SSSS C A Z (Luhn check digit). */
export function checkSaId(raw: string, now = new Date()): IdCheck {
  const id = raw.replace(/\s/g, "");
  if (!/^\d{13}$/.test(id)) return { valid: false, reason: "ID number must be 13 digits" };
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  const century = yy > now.getUTCFullYear() % 100 ? 1900 : 2000;
  const dob = new Date(Date.UTC(century + yy, mm - 1, dd));
  if (dob.getUTCMonth() !== mm - 1 || dob.getUTCDate() !== dd) return { valid: false, reason: "Date of birth in ID is not a real date" };
  const c = Number(id[10]);
  if (c > 2) return { valid: false, reason: "Invalid citizenship digit" };
  if (!luhn(id)) return { valid: false, reason: "Check digit does not match — please re-check the number" };
  return { valid: true, dob, sex: Number(id.slice(6, 10)) < 5000 ? "F" : "M", citizen: c === 0 };
}

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function ageOn(dob: Date, on = new Date()) {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Normalises SA mobile numbers to E.164 (+27XXXXXXXXX). Returns null if not a valid SA mobile. */
export function normalisePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+27")) d = d.slice(3);
  else if (d.startsWith("27") && d.length === 11) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^[6-8]\d{8}$/.test(d)) return null;
  return `+27${d}`;
}

export const displayPhone = (e164: string) =>
  e164.startsWith("+27") ? `0${e164.slice(3, 5)} ${e164.slice(5, 8)} ${e164.slice(8)}` : e164;

// ── Public holidays (Public Holidays Act 36 of 1994) ─────────────────────────

function easterSunday(year: number) {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function publicHolidays(year: number): Map<string, string> {
  const fixed: [string, string][] = [
    ["01-01", "New Year's Day"],
    ["03-21", "Human Rights Day"],
    ["04-27", "Freedom Day"],
    ["05-01", "Workers' Day"],
    ["06-16", "Youth Day"],
    ["08-09", "National Women's Day"],
    ["09-24", "Heritage Day"],
    ["12-16", "Day of Reconciliation"],
    ["12-25", "Christmas Day"],
    ["12-26", "Day of Goodwill"],
  ];
  const out = new Map<string, string>();
  for (const [md, name] of fixed) {
    const d = new Date(`${year}-${md}T00:00:00Z`);
    out.set(iso(d), name);
    // A holiday falling on a Sunday moves to the Monday.
    if (d.getUTCDay() === 0) out.set(iso(shift(d, 1)), `${name} (observed)`);
  }
  const easter = easterSunday(year);
  out.set(iso(shift(easter, -2)), "Good Friday");
  out.set(iso(shift(easter, 1)), "Family Day");
  return out;
}

export function holidayName(d: Date) {
  const key = dayKey(d);
  return publicHolidays(Number(key.slice(0, 4))).get(key) ?? null;
}

// ── CPA Regulation 4: permitted direct-marketing contact times ────────────────
// No contact on Sundays or public holidays; Saturdays 09:00–13:00; other days 08:00–20:00.

function localParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { weekday: get("weekday"), minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

export function marketingWindow(d: Date): { allowed: boolean; reason?: string } {
  const holiday = holidayName(d);
  if (holiday) return { allowed: false, reason: `Public holiday (${holiday})` };
  const { weekday, minutes } = localParts(d);
  if (weekday === "Sun") return { allowed: false, reason: "No direct marketing on Sundays" };
  if (weekday === "Sat")
    return minutes >= 9 * 60 && minutes < 13 * 60 ? { allowed: true } : { allowed: false, reason: "Saturdays only 09:00–13:00" };
  return minutes >= 8 * 60 && minutes < 20 * 60 ? { allowed: true } : { allowed: false, reason: "Weekdays only 08:00–20:00" };
}

/** Next moment (15-minute resolution) at which direct marketing may be sent. */
export function nextMarketingSlot(from: Date) {
  let t = new Date(Math.ceil(from.getTime() / 900_000) * 900_000);
  for (let i = 0; i < 4 * 24 * 10; i++, t = new Date(t.getTime() + 900_000)) if (marketingWindow(t).allowed) return t;
  return t;
}
