// Column chart (one series): ≤24px columns, 4px rounded data-end, hairline grid, hover tips.
import { ChartFrame } from "./chart-frame";
import { columnPath, niceTicks } from "./scale";
import { fmtValue, type ValueFormat } from "./format";

export function ColumnChart({
  data,
  format = "number",
  height = 220,
  color = "var(--color-series-1)",
  highlightLast = false,
  labelEvery,
  className,
}: {
  data: { label: string; value: number; tip?: string }[];
  format?: ValueFormat;
  height?: number;
  color?: string;
  highlightLast?: boolean;
  labelEvery?: number;
  className?: string;
}) {
  const W = 760, H = height, padL = 54, padR = 8, padT = 12, padB = 26;
  const { max, ticks } = niceTicks(Math.max(0, ...data.map((d) => d.value)));
  const band = (W - padL - padR) / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(3, band - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const every = labelEvery ?? Math.ceil(data.length / 8);
  return (
    <ChartFrame className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Column chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-ink-200)" : "var(--color-ink-100)"} strokeWidth={1} />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tnum" fontSize={11} fill="var(--color-ink-400)">
              {fmtValue(t, format, true)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * band + (band - bw) / 2;
          const top = y(Math.max(0, d.value));
          return (
            <g key={i} data-tip={d.tip ?? `${d.label}\n${fmtValue(d.value, format)}`}>
              <rect x={padL + i * band} y={padT} width={band} height={H - padT - padB} fill="transparent" />
              <path d={columnPath(x, top, bw, y(0) - top)} fill={color} opacity={highlightLast && i < data.length - 1 ? 0.55 : 1} />
              {i % every === 0 && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-ink-400)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
