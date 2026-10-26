// Date of birth from three pickers (day, month, year): month length and the YYYY-MM-DD value the join form sends.

/** Days in a month (1-12); a year of 0 (not chosen yet) counts as a leap year, so 29 February stays pickable. */
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year || 2000, month || 1, 0)).getUTCDate();

/** The day kept within the month: 31 January → April becomes 30 April, 29 February → 2001 becomes 28 February. */
export const clampDay = (year: number, month: number, day: number) => Math.min(day, daysInMonth(year, month));

/** YYYY-MM-DD once all three are chosen, else "". */
export function dobValue(year: number, month: number, day: number) {
  if (!year || !month || !day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(clampDay(year, month, day)).padStart(2, "0")}`;
}
