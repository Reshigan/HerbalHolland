// Club subscriptions: the pure rules. A plan gives a member a weekly allowance (grams of product, or a number of items
// such as pre-rolls) for a fixed monthly price, paid upfront. Each month is a billing cycle from the day it was first paid
// to the same day next month; it holds four weekly allowances, and opens them once its order is paid.
export type PlanUnit = "GRAMS" | "UNITS";

const DAY = 86_400_000;
const SAST = 2 * 3_600_000; // South Africa keeps UTC+2 all year, so calendar days are counted on that clock

/** The day of the month (SAST) a cycle starting at `d` is anchored on. */
export const anchorDayOf = (d: Date) => new Date(d.getTime() + SAST).getUTCDate();

/** When a cycle starting at `start` ends: the anchor day next month (SAST), clamped to the month's last day, at the same
 *  time of day. Keeping the anchor apart from `start` stops a 31st from drifting to the 28th after February. */
export function cycleEndOf(start: Date, anchorDay = anchorDayOf(start)): Date {
  const d = new Date(start.getTime() + SAST);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out = new Date(d);
  out.setUTCFullYear(y, m, Math.min(anchorDay, last));
  return new Date(out.getTime() - SAST);
}

/** The four weekly allowances of a cycle: weeks start 0, 7, 14 and 21 days in; the last runs to the cycle's end. */
export function weeksOf(start: Date, end: Date): { start: Date; end: Date }[] {
  return [0, 1, 2, 3].map((i) => ({ start: new Date(start.getTime() + i * 7 * DAY), end: i === 3 ? end : new Date(start.getTime() + (i + 1) * 7 * DAY) }));
}

/** The week of a cycle that covers `now`, or -1. */
export const weekIndexOf = (start: Date, end: Date, now: Date) => weeksOf(start, end).findIndex((w) => now >= w.start && now < w.end);

/** What each week's allowance was paid for: the month's price split over its four weeks (the rounding on the last). */
export const weekCents = (priceCents: number) => splitCents(priceCents, [1, 1, 1, 1]);

/** A monthly price as the per-week figure members see as helper text (four allowances a month). */
export const perWeekCents = (priceCents: number) => Math.round(priceCents / 4);

/** A paid month as the claim rules see it: its dates, weekly allowance, price, and the weeks already claimed. */
export type Cycle = { periodStart: Date; periodEnd: Date; allowance: number; priceCents: number; claimed: Date[] };

/** The week of a paid month open at `now`: its allowance and what it was paid for. With rollover, an unclaimed paid
 *  week just before it (in this month, or week 4 of the paid month that ended as this one began) adds its own base
 *  allowance once; a carried week never carries again. null when `now` is outside the month. */
export function openWeek(cycle: Cycle, now: Date, rollover = false, prev: Cycle | null = null) {
  const weeks = weeksOf(cycle.periodStart, cycle.periodEnd);
  const i = weeks.findIndex((w) => now >= w.start && now < w.end);
  if (i < 0) return null;
  const has = (c: Cycle, d: Date) => c.claimed.some((x) => x.getTime() === d.getTime());
  const cents = weekCents(cycle.priceCents);
  let carry = { allowance: 0, cents: 0 };
  if (rollover && i > 0 && !has(cycle, weeks[i - 1].start)) carry = { allowance: cycle.allowance, cents: cents[i - 1] };
  else if (rollover && i === 0 && prev && prev.periodEnd.getTime() === cycle.periodStart.getTime()) {
    const last = weeksOf(prev.periodStart, prev.periodEnd)[3];
    if (!has(prev, last.start)) carry = { allowance: prev.allowance, cents: weekCents(prev.priceCents)[3] };
  }
  const w = weeks[i];
  return { index: i, start: w.start, end: w.end, claimed: has(cycle, w.start), allowance: cycle.allowance + carry.allowance, cents: cents[i] + carry.cents, carryAllowance: carry.allowance };
}

/** "3 g" or "3 pre-rolls"-style allowance text (UNITS uses the plan's own word, default "items"). */
export function allowanceLabel(unit: PlanUnit, n: number, itemWord = "items") {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit === "GRAMS" ? `${v} g` : `${v} ${n === 1 ? itemWord.replace(/s$/, "") : itemWord}`;
}

/** What a choice of items uses of the allowance: grams × qty, or the number of items. */
export function allowanceUsed(unit: PlanUnit, items: { grams: number | null; qty: number }[]) {
  return items.reduce((s, i) => s + (unit === "GRAMS" ? (i.grams ?? 0) * i.qty : i.qty), 0);
}

/** Why a choice can't be claimed, or null. Floating-point grams are compared to a hundredth. */
export function claimProblem(unit: PlanUnit, allowance: number, items: { grams: number | null; qty: number }[]): string | null {
  if (!items.length || items.every((i) => i.qty <= 0)) return "Choose what you'd like this time";
  if (items.some((i) => !Number.isInteger(i.qty) || i.qty < 0)) return "Choose whole quantities";
  if (unit === "GRAMS" && items.some((i) => i.qty > 0 && !i.grams)) return "That item can't be weighed against your allowance";
  const used = allowanceUsed(unit, items);
  if (used - allowance > 0.005) return `That's more than your allowance (${allowanceLabel(unit, used)} of ${allowanceLabel(unit, allowance)})`;
  return null;
}

/** Splits `cents` across lines in proportion to their weights; the rounding goes on the last line so the sum is exact. */
export function splitCents(cents: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  if (total <= 0) return weights.map((_, i) => (i === weights.length - 1 ? cents : 0));
  const out = weights.map((w) => Math.floor((cents * w) / total));
  out[out.length - 1] += cents - out.reduce((a, b) => a + b, 0);
  return out;
}

/** An unpaid month's order is past its grace days. */
export const isPastGrace = (billedAt: Date, graceDays: number, now: Date) => now.getTime() - billedAt.getTime() > graceDays * 86_400_000;

/** Why a plan can't go live (or be saved), or null. */
export function planProblem(p: { name: string; slug: string; allowance: number; priceCents: number; eligibleCount: number; active: boolean }): string | null {
  if (!p.name.trim()) return "Give the plan a name";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) return "The web address may use lowercase letters, digits and dashes";
  if (!(p.allowance > 0) || p.allowance > 1000) return "Set an allowance above zero";
  if (!Number.isInteger(p.priceCents) || p.priceCents < 0) return "Set a price";
  if (p.active && p.priceCents < 100) return "Price the plan before it goes live";
  if (p.active && !p.eligibleCount) return "Choose at least one product members can pick from";
  return null;
}
