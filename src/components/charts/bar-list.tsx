// Ranked horizontal bars (top products, store league tables). HTML for crisp text.
import Link from "next/link";
import { ChartFrame } from "./chart-frame";
import { fmtValue, type ValueFormat } from "./format";

export function BarList({ rows, format = "zar", compact = false, color = "var(--color-series-1)", className }: { rows: { label: React.ReactNode; value: number; sub?: React.ReactNode; tip?: string; href?: string }[]; format?: ValueFormat; /** Rand without cents (R1.2m) for large values. */ compact?: boolean; color?: string; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const bar = (r: (typeof rows)[number]) => (
    <>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-ink-800 group-hover:text-brand-700">{r.label}</span>
            <span className="tnum shrink-0 text-ink-600">
              {fmtValue(r.value, format, compact)}
              {r.sub && <span className="ml-2 text-xs text-ink-500">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-ink-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: color }} />
          </div>
    </>
  );
  return (
    <ChartFrame className={className}>
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={i} data-tip={r.tip}>
            {r.href ? <Link href={r.href} className="group -my-1 block py-1">{bar(r)}</Link> : bar(r)}
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
