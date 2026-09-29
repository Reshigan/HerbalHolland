// Renders a report's chart spec with the shared chart components. Series colours come
// from the validated categorical order (--color-series-1..8); a single series needs no legend.
import { AreaChart } from "@/components/charts/area-chart";
import { ColumnChart } from "@/components/charts/bar-chart";
import { BarList } from "@/components/charts/bar-list";
import { Donut } from "@/components/charts/donut";
import { Heatmap } from "@/components/charts/heatmap";
import { MatrixHeatmap } from "@/components/charts/matrix";
import { SERIES } from "@/components/charts/scale";
import type { ReportChart as Spec } from "@/server/reports/types";

// SVG charts scale with their box: on a phone keep a minimum width (scrolling sideways)
// so axis labels stay legible instead of shrinking to a few pixels.
function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="min-w-[34rem]">{children}</div>
    </div>
  );
}

export function ReportChart({ chart }: { chart: Spec }) {
  const format = chart.format ?? "number";
  switch (chart.kind) {
    case "area":
      return (
        <Scroll>
          <AreaChart labels={chart.labels} format={format} series={chart.series.map((s, i) => ({ ...s, color: SERIES[i % SERIES.length] }))} />
        </Scroll>
      );
    case "column":
      return (
        <Scroll>
          <ColumnChart data={chart.data} format={format} labelEvery={1} />
        </Scroll>
      );
    case "bar":
      return <BarList rows={chart.rows} format={format} />;
    case "donut":
      return <Donut data={chart.data} format={format} centerLabel={chart.center} layout="stack" className="sm:flex-row sm:items-center" />;
    case "heatmap":
      return (
        <div className="overflow-x-auto">
          <Heatmap cells={chart.cells} hours={chart.hours} format={format} className="min-w-[36rem]" />
        </div>
      );
    case "matrix":
      return (
        <div className="overflow-x-auto">
          <MatrixHeatmap rows={chart.rows} cols={chart.cols} cells={chart.cells} format={format} className="min-w-[36rem]" />
        </div>
      );
  }
}
