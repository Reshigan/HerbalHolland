import { zar, zarCompact } from "@/lib/money";

export type ValueFormat = "zar" | "number" | "pct" | "units";
export function fmtValue(v: number, f: ValueFormat, compact = false) {
  switch (f) {
    case "zar":
      return compact ? zarCompact(v) : zar(v);
    case "pct":
      return `${(v * 100).toFixed(1)}%`;
    case "units":
      return `${Math.round(v).toLocaleString("en-US")} units`;
    default:
      return compact && Math.abs(v) >= 10_000 ? `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}k` : Math.round(v).toLocaleString("en-US");
  }
}
