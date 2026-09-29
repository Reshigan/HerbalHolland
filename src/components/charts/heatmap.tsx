// Hour × weekday heatmap on a single-hue (orange) sequential ramp.
import { ChartFrame } from "./chart-frame";
import { fmtValue, type ValueFormat } from "./format";

const RAMP = ["#fff5ec", "#ffe6d1", "#fdcba1", "#f9ae6d", "#f5913c", "#e27623", "#c05f18", "#974a15"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Heatmap({ cells, hours, format = "number", className }: { cells: { day: number; hour: number; value: number }[]; hours: number[]; format?: ValueFormat; className?: string }) {
  const max = Math.max(1, ...cells.map((c) => c.value));
  const get = (d: number, h: number) => cells.find((c) => c.day === d && c.hour === h)?.value ?? 0;
  return (
    <ChartFrame className={className}>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))` }}>
        <span />
        {hours.map((h) => (
          <span key={h} className="tnum text-center text-[0.65rem] text-ink-500">
            {String(h).padStart(2, "0")}
          </span>
        ))}
        {[1, 2, 3, 4, 5, 6, 0].map((d, row) => (
          <div key={d} className="contents">
            <span className="self-center text-[0.7rem] font-medium text-ink-500">{DAYS[row]}</span>
            {hours.map((h) => {
              const v = get(d, h);
              const step = v ? Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1)) + 1) : 0;
              return <span key={h} className="h-7 rounded-[5px]" style={{ background: v ? RAMP[step] : "var(--color-ink-50)" }} data-tip={`${DAYS[row]} ${String(h).padStart(2, "0")}:00\n${fmtValue(v, format)}`} />;
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[0.65rem] text-ink-500">
        Less
        <span className="flex gap-[2px]">
          {RAMP.slice(1).map((c) => (
            <span key={c} className="h-2.5 w-4 rounded-[2px]" style={{ background: c }} />
          ))}
        </span>
        More
      </div>
    </ChartFrame>
  );
}
