// Club subscriptions: the pure rules. A plan gives a member an allowance each period (grams of product, or a number of
// items such as pre-rolls) for a fixed price; each period is paid as its own order, and the allowance opens once paid.
export type PlanUnit = "GRAMS" | "UNITS";
export type BillingPeriod = "WEEKLY" | "FOUR_WEEKLY" | "MONTHLY";

export const PERIOD_LABEL: Record<BillingPeriod, string> = { WEEKLY: "week", FOUR_WEEKLY: "4 weeks", MONTHLY: "month" };
export const PERIOD_ADVERB: Record<BillingPeriod, string> = { WEEKLY: "weekly", FOUR_WEEKLY: "every 4 weeks", MONTHLY: "monthly" };

/** When a period that starts at `start` ends (a month is a calendar month, clamped to the month's last day). */
export function periodEndOf(start: Date, period: BillingPeriod): Date {
  if (period === "WEEKLY") return new Date(start.getTime() + 7 * 86_400_000);
  if (period === "FOUR_WEEKLY") return new Date(start.getTime() + 28 * 86_400_000);
  const d = new Date(start);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d;
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

/** An unpaid period's order is past its grace days. */
export const isPastGrace = (billedAt: Date, graceDays: number, now: Date) => now.getTime() - billedAt.getTime() > graceDays * 86_400_000;

/** A period's price as a monthly amount (for MRR): weekly × 52/12, four-weekly × 13/12. */
export function monthlyCents(priceCents: number, period: BillingPeriod) {
  return Math.round(period === "WEEKLY" ? (priceCents * 52) / 12 : period === "FOUR_WEEKLY" ? (priceCents * 13) / 12 : priceCents);
}

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
