import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { insightsContext, productInsight } from "@/server/insights";
import { resolveRange } from "@/lib/ranges";
import { fmtDay } from "@/lib/format";
import { pct, zarCompact } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { InsightsShell, insightHref, type InsightParams } from "@/components/insights/ui";

export default async function ProductInsight({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<InsightParams> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const path = `/insights/sales/product/${id}`;
  const ctx = await insightsContext(sp, path);
  const r = resolveRange(sp, "30d");
  const [variant, p] = await Promise.all([db.variant.findUnique({ where: { id }, select: { name: true, product: { select: { name: true } } } }), productInsight(id, ctx.storeIds, r)]);
  if (!variant) notFound();
  const name = new Map(ctx.stores.map((s) => [s.id, s]));
  const stores = p.stores.flatMap((s) => {
    const store = name.get(s.storeId);
    return store ? [{ label: store.name, value: s.netCents, sub: `${s.units.toLocaleString("en-ZA")} sold`, href: insightHref(path, { ...sp, store: store.code }) }] : [];
  });
  return (
    <InsightsShell tab="sales" path={path} ctx={ctx} sp={sp} r={r} title={`${variant.product.name} · ${variant.name}`} back={{ href: insightHref("/insights/sales", sp), label: "Sales" }}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Net sales (ex VAT)" value={zarCompact(p.netCents)} className="col-span-2 lg:col-span-1" />
        <Stat label="Units sold" value={p.units.toLocaleString("en-ZA")} />
        <Stat label="Gross margin" value={pct(p.marginPct)} />
      </div>
      {r.days > 1 && (
        <Card>
          <CardHeader title="Net sales by day" />
          <CardBody>
            <AreaChart labels={p.daily.map((d) => fmtDay(`${d.date}T12:00:00Z`))} series={[{ name: "Net sales", color: "var(--color-series-1)", values: p.daily.map((d) => d.netCents) }]} height={220} />
          </CardBody>
        </Card>
      )}
      {!ctx.store && stores.length > 1 && (
        <Card>
          <CardHeader title="Stores" description="Tap a store to see only that store." />
          <CardBody>
            <BarList rows={stores.slice(0, 10)} compact />
          </CardBody>
        </Card>
      )}
    </InsightsShell>
  );
}
