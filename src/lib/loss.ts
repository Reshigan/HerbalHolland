// Loss prevention rules (pure). Each turns a fact into a severity, or nothing; thresholds are HQ settings.
// Transparent on purpose: every alert has to be explainable to the franchisee and the person it's about.
export type Severity = "LOW" | "MEDIUM" | "HIGH";

export const DEFAULT_LOSS = {
  cashShortCents: 5_000, // a shift counted this much under expected raises an alert at once
  cashShortHighCents: 50_000, // …high severity from here
  repeatShorts: 3, // the same person short this many times in 30 days
  refundFactor: 3, // a person's refund rate this many times the network norm…
  refundMin: 5, // …with at least this many refunds in 30 days
  quickRefundMinutes: 30, // a refund this soon after the sale is a red flag
  writeOffFactor: 2.5, // a store's write-offs this week vs its own weekly norm…
  writeOffMinCents: 50_000, // …and at least this much
  memberRepeat: 4, // one member card on this many of one person's sales in a day (points skimming)
  offlineFactor: 3, // a store's offline share vs its own norm (bypasses the online checks)…
  offlineMin: 10, // …with at least this many offline sales in the week
  refundedShare: 0.1, // share of a person's own sales refunded this month (commission gaming)…
  refundedMin: 5, // …with at least this many refunds
};
export type LossSettings = typeof DEFAULT_LOSS;

/** Counted cash under expected (variance is counted − expected). */
export const cashShort = (varianceCents: number, s: LossSettings): Severity | null =>
  varianceCents <= -s.cashShortHighCents ? "HIGH" : varianceCents <= -s.cashShortCents ? "MEDIUM" : null;

/** A refund's red flags; one flag alone is normal retail, except a card sale paid back in cash. */
export function refundFlags(r: { cashForCard: boolean; otherPersonsSale: boolean; minutesAfterSale: number; minutesBeforeClose: number | null }, s: LossSettings) {
  const reasons: string[] = [];
  if (r.cashForCard) reasons.push("a card sale refunded in cash");
  if (r.otherPersonsSale) reasons.push("someone else's sale");
  if (r.minutesAfterSale < s.quickRefundMinutes) reasons.push(`refunded ${Math.max(0, Math.round(r.minutesAfterSale))} min after the sale`);
  if (r.minutesBeforeClose != null && r.minutesBeforeClose < 15) reasons.push("just before the shift was closed");
  const severity: Severity | null = r.cashForCard ? (reasons.length > 1 ? "HIGH" : "MEDIUM") : reasons.length > 1 ? "MEDIUM" : null;
  return { severity, reasons };
}

/** Well above normal: at least `factor` × the norm and at least `min` (with no norm yet, `min` alone). */
export const aboveNorm = (value: number, norm: number, factor: number, min: number) => value >= min && value >= norm * factor;

export function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0;
}
