import Link from "next/link";
import { insightsContext } from "@/server/insights";
import { hourlyHeat, kpis, topProducts } from "@/server/dashboard";
import { salesByChannel, salesByDay, salesByStore } from "@/server/finance";
import { resolveRange } from "@/lib/ranges";
import { fmtDay } from "@/lib/format";
import { pct, zar, zarCompact } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { Donut } from "@/components/charts/donut";
import { Heatmap } from "@/components/charts/heatmap";
import { InsightsShell, insightHref, type InsightParams } from "@/components/insights/ui";

const PATH = "/insights/sales";

export default async function SalesInsights({ searchParams }: { searchParams: Promise<InsightParams> }) {
  const sp = await searchParams;
  const ctx = await insightsContext(sp, PATH);
  const r = resolveRange(sp, "30d");
  const ids = ctx.storeIds;
  const [k, byStore, channels, days, products, heat] = await Promise.all([
    kpis(ids, r),
    salesByStore(ids, r),
    salesByChannel(ids, r),
    salesByDay(ids, r),
    topProducts(ids, r, 8),
    hourlyHeat(ids, { ...r, start: new Date(Math.max(r.start.getTime(), Date.now() - 28 * 86_400_000)) }),
  ]);
  const c = k.cur;
  const list = (extra: Record<string, string>) => insightHref(`${PATH}/list`, sp, extra);
  const stores = ctx.stores.map((s) => ({ ...s, netCents: byStore.get(s.id)?.netCents ?? 0, sales: byStore.get(s.id)?.sales ?? 0 })).filter((s) => s.sales).sort((a, b) => b.netCents - a.netCents).slice(0, 10);
  const bestDays = days.filter((d) => d.netCents > 0).sort((a, b) => b.netCents - a.netCents).slice(0, 7);
  const active = heat.filter((x) => x.value > 0).map((x) => x.hour);
  const hours = active.length ? Array.from({ length: Math.max(...active) - Math.min(...active) + 1 }, (_, i) => Math.min(...active) + i) : [];
  return (
    <InsightsShell tab="sales" path={PATH} ctx={ctx} sp={sp} r={r} title="Sales">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales (ex VAT)" value={zarCompact(c.netCents)} delta={k.deltas.net} />
        <Stat label="Transactions" value={c.sales.toLocaleString("en-ZA")} delta={k.deltas.tx} />
        <Stat label="Average basket" value={zar(c.atvCents)} delta={k.deltas.atv} />
        <Stat label="Gross margin" value={pct(c.marginPct)} sub={`${pct(c.memberRate, 0)} of sales by members`} />
      </div>
      {k.trend.labels.length > 1 && (
        <Card>
          <CardHeader title="Net sales by day" action={<Link href={list({})} className="text-sm font-semibold text-brand-700">All sales</Link>} />
          <CardBody>
            <AreaChart labels={k.trend.labels} series={[{ name: "Net sales", color: "var(--color-series-1)", values: k.trend.net }]} height={220} />
          </CardBody>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {!ctx.store && stores.length > 1 && (
          <Card>
            <CardHeader title="Stores" description="Tap a store to see only that store." />
            <CardBody>
              <BarList rows={stores.map((s) => ({ label: s.name, value: s.netCents, href: insightHref(PATH, { ...sp, store: s.code }) }))} compact />
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Top products" description="Tap a product for its trend and stores." />
          <CardBody>
            {products.length ? <BarList rows={products.map((p) => ({ label: p.name, value: p.netCents, sub: `${p.units.toLocaleString("en-ZA")} sold`, href: insightHref(`${PATH}/product/${p.variantId}`, sp) }))} compact /> : <Empty />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Channels" description="Tap a channel to list its sales." />
          <CardBody>
            {c.netCents ? <Donut data={channels.map((x) => ({ label: x.label, value: x.netCents, href: list({ channel: x.channel }) }))} centerLabel="Net sales" layout="row" /> : <Empty />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Best days" description="Tap a day to list its sales." />
          <CardBody>
            {bestDays.length ? <BarList rows={bestDays.map((d) => ({ label: fmtDay(`${d.date}T12:00:00Z`), value: d.netCents, sub: `${d.sales.toLocaleString("en-ZA")} sales`, href: insightHref(`${PATH}/list`, { store: sp.store }, { from: d.date, to: d.date }) }))} compact /> : <Empty />}
          </CardBody>
        </Card>
      </div>
      {hours.length > 0 && (
        <Card>
          <CardHeader title="When you trade" description="Sales by hour, last 28 days at most." />
          <CardBody>
            <Heatmap cells={heat} hours={hours} />
          </CardBody>
        </Card>
      )}
    </InsightsShell>
  );
}

const Empty = () => <p className="text-sm text-ink-500">No sales in this period.</p>;
