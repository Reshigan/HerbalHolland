// Named date ranges for reports and dashboards (SAST business days).
import { addDays, dayKey, rangeFromParams, type DateRange } from "./format";

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "mtd", label: "Month to date" },
  { key: "90d", label: "90 days" },
  { key: "lastmonth", label: "Last month" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];

export function resolveRange(sp: { range?: string; from?: string; to?: string }, fallback: PresetKey = "30d", now = new Date()): DateRange & { preset: string } {
  if (sp.from || sp.to) return { ...rangeFromParams(sp, 30, now), preset: "custom" };
  const key = (PRESETS.find((p) => p.key === sp.range)?.key ?? fallback) as PresetKey;
  const today = dayKey(now);
  const d = (n: number) => dayKey(addDays(new Date(`${today}T12:00:00+02:00`), n));
  const r = (() => {
    switch (key) {
      case "today":
        return rangeFromParams({ from: today, to: today });
      case "7d":
        return rangeFromParams({ from: d(-6), to: today });
      case "30d":
        return rangeFromParams({ from: d(-29), to: today });
      case "90d":
        return rangeFromParams({ from: d(-89), to: today });
      case "mtd":
        return rangeFromParams({ from: `${today.slice(0, 7)}-01`, to: today });
      case "lastmonth": {
        const first = new Date(`${today.slice(0, 7)}-01T12:00:00+02:00`);
        const lastPrev = dayKey(addDays(first, -1));
        return rangeFromParams({ from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev });
      }
    }
  })();
  return { ...r, preset: key };
}

/** The equal-length period immediately before `r` (for deltas). */
export function previousRange(r: DateRange): DateRange {
  const to = dayKey(addDays(new Date(`${r.from}T12:00:00+02:00`), -1));
  const from = dayKey(addDays(new Date(`${r.from}T12:00:00+02:00`), -r.days));
  return rangeFromParams({ from, to });
}

export const delta = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : null);
