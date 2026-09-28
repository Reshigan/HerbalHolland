// Cash banking rules: what a cash-up hands to the bank, and by when.
import { publicHolidays } from "./sa";
import { dayKey } from "./format";

/** Cash a closed cash-up hands to the bank: what was counted, less the float that stays in the till. */
export const cashToBank = (s: { countedCashCents: number | null; openingFloatCents: number }) => Math.max(0, (s.countedCashCents ?? 0) - s.openingFloatCents);

/** Weekdays that aren't public holidays (SAST). */
export function isBusinessDay(key: string) {
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !publicHolidays(Number(key.slice(0, 4))).has(key);
}

/** The day (YYYY-MM-DD, SAST) cash counted at `closedAt` must be in the bank: the Nth business day after it. */
export function bankBy(closedAt: Date, businessDays: number) {
  let key = dayKey(closedAt);
  for (let n = 0; n < Math.max(1, businessDays); ) {
    key = new Date(new Date(`${key}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    if (isBusinessDay(key)) n++;
  }
  return key;
}

/** Overdue once the due day has passed in SAST. */
export const isOverdue = (closedAt: Date, businessDays: number, now = new Date()) => dayKey(now) > bankBy(closedAt, businessDays);

/** The latest close day (SAST) whose cash is overdue at `now`: every cash-up closed on or before it should be banked. */
export function lastDueDay(now: Date, businessDays: number) {
  const today = dayKey(now);
  let key = today;
  do key = new Date(new Date(`${key}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  while (bankBy(new Date(`${key}T12:00:00+02:00`), businessDays) >= today);
  return key;
}
