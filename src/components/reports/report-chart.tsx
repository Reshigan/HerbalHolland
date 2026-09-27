// Renders a report's chart spec with the shared chart components. Series colours come
// from the validated categorical order (--color-series-1..8); a single series needs no legend.
import { AreaChart } from "@/components/charts/area-chart";
import { ColumnChart } from "@/components/charts/bar-chart";
import { BarList } from "@/components/charts/bar-list";
import { Donut } from "@/components/charts/donut";
import { Heatmap } from "@/components/charts/heatmap";
import { SERIES } from "@/components/charts/scale";
import type { ReportChart as Spec } from "@/server/reports/types";

export function ReportChart({ chart }: { chart: Spec }) {
  const format = chart.format ?? "number";
  switch (chart.kind) {
    case "area":
      return <AreaChart labels={chart.labels} format={format} series={chart.series.map((s, i) => ({ ...s, color: SERIES[i % SERIES.length] }))} />;
    case "column":
      return <ColumnChart data={chart.data} format={format} labelEvery={1} />;
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
  }
}
