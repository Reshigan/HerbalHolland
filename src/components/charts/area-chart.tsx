"use client";
// Time series: 2px lines, 10% area wash for the first series, crosshair + tooltip.
import { useRef, useState } from "react";
import { niceTicks } from "./scale";
import { fmtValue, type ValueFormat } from "./format";
import { Legend } from "./chart-frame";

export function AreaChart({
  labels,
  series,
  format = "zar",
  height = 240,
  className,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  format?: ValueFormat;
  height?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 760, H = height, padL = 58, padR = 14, padT = 12, padB = 26;
  const { max, ticks } = niceTicks(Math.max(0, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (W - padL - padR)) / (n - 1));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const every = Math.ceil(n / 7);

  const onMove = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      {series.length > 1 && <Legend className="mb-2" items={series.map((s) => ({ label: s.name, color: s.color }))} />}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-ink-200)" : "var(--color-ink-100)"} />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-ink-400)" className="tnum">
              {fmtValue(t, format, true)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="var(--color-ink-400)">
              {l}
            </text>
          ) : null,
        )}
        {series[0] && <path d={`${path(series[0].values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={series[0].color} opacity={0.1} />}
        {series.map((s) => (
          <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map((s) => (
          <circle key={s.name} cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} fill={s.color} stroke="white" strokeWidth={2} />
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--color-ink-300)" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke="white" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-6 z-20 min-w-36 rounded-xl bg-ink-900/95 px-3 py-2 text-xs text-white shadow-lift"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > n * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
          role="tooltip"
        >
          <div className="font-semibold">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="mt-1 flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-ink-200">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tnum font-semibold">{fmtValue(s.values[hover] ?? 0, format)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
