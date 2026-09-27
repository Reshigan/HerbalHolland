// Part-to-whole: ring with 2px surface gaps between segments, legend with values.
import { ChartFrame } from "./chart-frame";
import { SERIES } from "./scale";
import { fmtValue, type ValueFormat } from "./format";

export function Donut({ data, format = "zar", centerLabel, layout = "stack", className }: { data: { label: string; value: number; color?: string }[]; format?: ValueFormat; centerLabel?: string; layout?: "stack" | "row"; className?: string }) {
  const items = data.filter((d) => d.value > 0).map((d, i) => ({ ...d, color: d.color ?? SERIES[i % SERIES.length] }));
  const total = items.reduce((s, d) => s + d.value, 0);
  const R = 52, C = 2 * Math.PI * R, gap = items.length > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <ChartFrame className={`flex items-center gap-5 ${layout === "row" ? "flex-row" : "flex-col"} ${className ?? ""}`}>
      <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0 -rotate-90" role="img" aria-label="Share breakdown">
        <circle cx={70} cy={70} r={R} fill="none" stroke="var(--color-ink-100)" strokeWidth={16} />
        {items.map((d) => {
          const len = total ? (d.value / total) * C : 0;
          const el = (
            <circle
              key={d.label}
              cx={70}
              cy={70}
              r={R}
              fill="none"
              stroke={d.color}
              strokeWidth={16}
              strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
              strokeDashoffset={-offset}
              data-tip={`${d.label}\n${fmtValue(d.value, format)} · ${((d.value / total) * 100).toFixed(1)}%`}
            />
          );
          offset += len;
          return el;
        })}
        {centerLabel && (
          <text x={70} y={70} textAnchor="middle" dy="0.35em" className="font-display" transform="rotate(90 70 70)" fontSize={15} fontWeight={600} fill="var(--color-ink-900)">
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className={`min-w-0 space-y-1.5 text-sm ${layout === "row" ? "flex-1" : "w-full"}`}>
        {items.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-3" data-tip={`${d.label}\n${fmtValue(d.value, format)}`}>
            <span className="inline-flex min-w-0 items-center gap-2 text-ink-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="tnum whitespace-nowrap text-ink-500">
              <span className="font-semibold text-ink-850">{total ? ((d.value / total) * 100).toFixed(0) : 0}%</span> · {fmtValue(d.value, format, true)}
            </span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
