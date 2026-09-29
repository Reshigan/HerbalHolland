// Cohort and retention shaping: members by join month × months since joining, with the share who bought in each
// month; repeat-purchase and 90-day retention rates; the average order value trend. The SQL in
// @/server/reports/cohorts produces the counts; everything here is pure and unit-tested.
export type CohortSize = { cohort: string; members: number };
export type CohortCell = { cohort: string; month: number; buyers: number };
export type CohortRow = { cohort: string; label: string; members: number; rates: (number | null)[]; buyers: (number | null)[] };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" → "Sep ’26". */
export const monthLabel = (ym: string) => `${MON[Number(ym.slice(5, 7)) - 1]} ’${ym.slice(2, 4)}`;

/** Whole months from one YYYY-MM to another (negative when `to` is earlier). */
export function monthsBetween(from: string, to: string) {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
}

/** Every month YYYY-MM from `from` to `to` inclusive (both YYYY-MM or YYYY-MM-DD). */
export function monthRange(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const end = to.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym >= end) break;
    m++;
    if (m > 12) (m = 1), y++;
  }
  return out;
}

/**
 * The cohort grid: one row per join month (oldest first), one column per months-since-join (0 = the join month).
 * A cell is buyers ÷ cohort size, or null when that month hasn't started yet as of `asOf` (YYYY-MM).
 */
export function cohortGrid(sizes: CohortSize[], cells: CohortCell[], opts: { asOf: string; maxMonths?: number }): { rows: CohortRow[]; months: number[] } {
  const maxMonths = Math.max(1, Math.min(opts.maxMonths ?? 12, 24));
  const months = Array.from({ length: maxMonths }, (_, i) => i);
  const byCell = new Map(cells.map((c) => [`${c.cohort}:${c.month}`, c.buyers]));
  const rows = [...sizes]
    .sort((a, b) => a.cohort.localeCompare(b.cohort))
    .map((s) => {
      const elapsed = monthsBetween(s.cohort, opts.asOf);
      const buyers = months.map((m) => (m > elapsed ? null : byCell.get(`${s.cohort}:${m}`) ?? 0));
      return {
        cohort: s.cohort,
        label: monthLabel(s.cohort),
        members: s.members,
        buyers,
        rates: buyers.map((b) => (b == null || !s.members ? null : b / s.members)),
      };
    });
  return { rows, months };
}

/** Members-weighted average rate per months-since-join across the cohorts that have reached that month. */
export function averageRetention(rows: CohortRow[], months: number[]) {
  return months.map((m) => {
    let members = 0, buyers = 0;
    for (const r of rows) if (r.buyers[m] != null) (members += r.members), (buyers += r.buyers[m]!);
    return members ? buyers / members : null;
  });
}

export const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Share of buyers who bought more than once in the period. */
export const repeatRate = (buyers: number, repeatBuyers: number) => ratio(repeatBuyers, buyers);

/**
 * 90-day retention: of the members who joined long enough ago to have had 90 days, the share who bought again
 * after the day they joined and within 90 days.
 */
export const retention90 = (eligible: number, retained: number) => ratio(retained, eligible);

/** Average order value by month (gross incl. VAT ÷ sales), for the trend line. */
export function aovSeries(rows: { month: string; grossCents: number; sales: number }[]) {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  return { labels: sorted.map((r) => monthLabel(r.month)), values: sorted.map((r) => (r.sales ? Math.round(r.grossCents / r.sales) : 0)) };
}
