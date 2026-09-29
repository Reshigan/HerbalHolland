// Delivery estimates for the checkout and the order tracker (pure). Courier orders count working days (Monday to
// Friday, never a South African public holiday) from the settings' per-province ranges; same-day delivery is today
// before the cut-off and the next working day after it. Estimates, not promises: the delivery policy says so.
import { addDays, dayKey, hourSA, weekdaySA } from "./format";
import { publicHolidays, type ProvinceCode } from "./sa";

export type DeliveryDays = Record<ProvinceCode, [number, number]>;
/** Working days door to door by province, from the main courier hubs (HQ → Online orders can change these). */
export const DEFAULT_DELIVERY_DAYS: DeliveryDays = { GP: [1, 2], WC: [2, 3], KZN: [2, 3], EC: [3, 4], FS: [2, 3], MP: [2, 3], NW: [2, 3], LP: [3, 4], NC: [3, 5] };
const FALLBACK: [number, number] = [2, 4];

export const isWorkingDay = (d: Date) => {
  const w = weekdaySA(d);
  const key = dayKey(d);
  return w !== 0 && w !== 6 && !publicHolidays(Number(key.slice(0, 4))).has(key);
};

/** `n` working days after `from` (the day itself never counts). */
export function addWorkingDays(from: Date, n: number) {
  let d = from;
  for (let left = n; left > 0; ) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

export type Fulfil = "COLLECT" | "SAME_DAY" | "COURIER";
export type Estimate = { earliest: Date; latest: Date; label: string; note: string };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (d: Date) => dayKey(d).split("-").map(Number) as [number, number, number];
/** "Wed 30 Sep" */
export const fmtEstimateDay = (d: Date) => {
  const [, m, day] = parts(d);
  return `${DAYS[weekdaySA(d)]} ${day} ${MON[m - 1]}`;
};
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);
const relative = (d: Date, now: Date) => (sameDay(d, now) ? "Today" : sameDay(d, addDays(now, 1)) ? "Tomorrow" : fmtEstimateDay(d));

/** A range of days in words: "Today", "Tomorrow", "Wed 30 Sep – Thu 1 Oct". */
export function estimateLabel(earliest: Date, latest: Date, now: Date) {
  if (sameDay(earliest, latest)) return relative(earliest, now);
  const [, m1] = parts(earliest);
  const [, m2, d2] = parts(latest);
  return m1 === m2 ? `${fmtEstimateDay(earliest).replace(/ \w+$/, "")} – ${DAYS[weekdaySA(latest)]} ${d2} ${MON[m2 - 1]}` : `${fmtEstimateDay(earliest)} – ${fmtEstimateDay(latest)}`;
}

/**
 * When an order placed now should arrive. `cutoffHour` is the same-day cut-off (SAST) and the courier's last
 * collection: an order after it leaves the next working day. Click & collect is usually ready within two hours.
 */
export function deliveryEstimate(a: { fulfilment: Fulfil; province?: ProvinceCode | null; days?: Partial<DeliveryDays> | null; cutoffHour: number; now?: Date }): Estimate {
  const now = a.now ?? new Date();
  if (a.fulfilment === "COLLECT") return { earliest: now, latest: now, label: "Usually within 2 hours", note: "We'll message you as soon as it's ready — during store hours." };
  const late = !isWorkingDay(now) || hourSA(now) >= a.cutoffHour;
  if (a.fulfilment === "SAME_DAY") {
    const d = late ? addWorkingDays(now, 1) : now;
    return { earliest: d, latest: d, label: relative(d, now), note: late ? `Order by ${a.cutoffHour}:00 on a working day for same-day delivery.` : `Ordered before ${a.cutoffHour}:00 — delivered today.` };
  }
  const [min, max] = (a.province && a.days?.[a.province]) ?? FALLBACK;
  const start = late ? addWorkingDays(now, 1) : now;
  const earliest = addWorkingDays(start, min);
  const latest = addWorkingDays(start, max);
  return { earliest, latest, label: estimateLabel(earliest, latest, now), note: `${min}–${max} working days${a.province ? "" : " nationwide"}${late ? ", leaving the next working day" : ""}.` };
}
