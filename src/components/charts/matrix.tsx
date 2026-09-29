// Matrix heatmap (rows × columns, e.g. cohort × months since joining) on the single-hue orange ramp, with row and
// column labels in ink colours and a hover tooltip per cell. Blank cells are "not applicable", not zero.
import { ChartFrame } from "./chart-frame";
import { fmtValue, type ValueFormat } from "./format";

const RAMP = ["#fff5ec", "#ffe6d1", "#fdcba1", "#f9ae6d", "#f5913c", "#e27623", "#c05f18", "#974a15"];

export type MatrixCell = { row: number; col: number; value: number | null; tip?: string };

export function MatrixHeatmap({ rows, cols, cells, format = "number", className }: { rows: string[]; cols: string[]; cells: MatrixCell[]; format?: ValueFormat; className?: string }) {
  const max = Math.max(1e-9, ...cells.map((c) => c.value ?? 0));
  const byKey = new Map(cells.map((c) => [`${c.row}:${c.col}`, c]));
  return (
    <ChartFrame className={className}>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `minmax(7rem, auto) repeat(${cols.length}, minmax(2.6rem, 1fr))` }}>
        <span />
        {cols.map((c) => (
          <span key={c} className="tnum truncate text-center text-[0.65rem] font-medium text-ink-500">
            {c}
          </span>
        ))}
        {rows.map((label, ri) => (
          <div key={label} className="contents">
            <span className="tnum self-center truncate pr-2 text-[0.72rem] font-medium text-ink-700">{label}</span>
            {cols.map((_, ci) => {
              const cell = byKey.get(`${ri}:${ci}`);
              const v = cell?.value ?? null;
              const step = v == null ? -1 : v <= 0 ? 0 : Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1)) + 1);
              return (
                <span
                  key={ci}
                  className={`tnum grid h-8 place-items-center rounded-[5px] text-[0.68rem] font-semibold ${step >= 5 ? "text-white" : "text-ink-900"}`}
                  style={{ background: step < 0 ? "transparent" : RAMP[step], border: step < 0 ? "1px dashed var(--color-ink-150)" : undefined }}
                  data-tip={cell?.tip ?? (v == null ? undefined : `${label} · ${cols[ci]}\n${fmtValue(v, format)}`)}
                  aria-label={v == null ? undefined : `${label}, ${cols[ci]}: ${fmtValue(v, format)}`}
                >
                  {v == null ? "" : fmtValue(v, format)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[0.65rem] text-ink-400">
        Fewer
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
