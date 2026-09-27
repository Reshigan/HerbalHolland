import { cn } from "@/lib/cn";
import { Sparkline } from "@/components/charts/sparkline";

/**
 * Stat tile: label · value · optional delta vs a named period · optional 12-point trend.
 * Delta colour = direction × whether up is good; it always ships with an arrow + text.
 */
export function Stat({ label, value, delta, deltaLabel = "vs previous period", upIsGood = true, sub, trend, className }: {
  label: string;
  value: React.ReactNode;
  delta?: number | null; // fraction, e.g. 0.12 = +12%
  deltaLabel?: string;
  upIsGood?: boolean;
  sub?: React.ReactNode;
  trend?: number[];
  className?: string;
}) {
  const good = delta == null ? null : (delta >= 0) === upIsGood;
  return (
    <div className={cn("rounded-2xl border border-ink-150 bg-white p-4 shadow-card", className)}>
      <div className="text-[0.78rem] font-medium text-ink-500">{label}</div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="font-display text-[1.65rem] font-semibold leading-none tracking-tight text-ink-950">{value}</div>
        {trend && trend.length > 1 && <Sparkline values={trend} className="h-8 w-24" />}
      </div>
      <div className="mt-2 flex min-h-5 items-center gap-2 text-xs">
        {delta != null && Number.isFinite(delta) && (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", good ? "text-leaf-600" : "text-rose-600")}>
            <span aria-hidden>{delta >= 0 ? "▲" : "▼"}</span>
            {Math.abs(delta * 100).toFixed(1)}%
            <span className="sr-only">{good ? "(good)" : "(needs attention)"}</span>
          </span>
        )}
        {delta != null && Number.isFinite(delta) && <span className="text-ink-400">{deltaLabel}</span>}
        {sub && <span className="text-ink-500">{sub}</span>}
      </div>
    </div>
  );
}

export function Meter({ value, max, tone = "orange", className }: { value: number; max: number; tone?: "orange" | "green" | "red" | "amber"; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const [track, fill] = { orange: ["bg-oranje-100", "bg-oranje-500"], green: ["bg-leaf-100", "bg-leaf-500"], red: ["bg-rose-100", "bg-rose-500"], amber: ["bg-amber-100", "bg-amber-500"] }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full", track, className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}
