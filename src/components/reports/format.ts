// Screen formatting for report cells and stat tiles (the CSV uses @/lib/csv instead).
import { zar, zarWhole } from "@/lib/money";
import { TZ, fmtDate, fmtDateTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import type { Format } from "@/server/reports/types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dayFmt = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const asDate = (v: unknown) => (typeof v === "string" && DATE_ONLY.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v as string | number | Date));

export const NUMERIC: Format[] = ["zar", "number", "pct", "points"];
export const isNumeric = (f?: Format) => !!f && NUMERIC.includes(f);

export function fmtCell(v: unknown, f?: Format): string {
  if (v == null || v === "" || (typeof v === "number" && !Number.isFinite(v))) return "—";
  switch (f) {
    case "zar":
      return zar(Math.round(Number(v)));
    case "pct":
      return `${(Number(v) * 100).toFixed(1)}%`;
    case "number":
      return Number(v).toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(Number(v)) ? 0 : 1 });
    case "points":
      return fmtPoints(Math.round(Number(v)));
    case "date":
      return fmtDate(asDate(v));
    case "day":
      return dayFmt.format(asDate(v));
    case "datetime":
      return fmtDateTime(asDate(v));
    default:
      return String(v);
  }
}

/** Stat tiles: whole rands (the table carries the cents). */
export function fmtTile(v: number | string | null, f?: Format): string {
  if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "—";
  if (typeof v === "string") return v;
  if (f === "zar") return Math.abs(v) >= 10_000 ? zarWhole(Math.round(v / 100) * 100) : zar(v);
  if (f === "number") return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return fmtCell(v, f);
}
