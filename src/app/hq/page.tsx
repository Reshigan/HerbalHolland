import Link from "next/link";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { kpis, hourlyHeat, stockAlerts } from "@/server/dashboard";
import { salesByStore } from "@/server/finance";
import { db } from "@/server/db";
import { resolveRange } from "@/lib/ranges";
import { zar, zarCompact, pct } from "@/lib/money";
import { guilders, POINT_VALUE_CENTS } from "@/lib/loyalty-rules";
import { PageHeader } from "@/components/ui/page";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Stat } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { AreaChart } from "@/components/charts/area-chart";
import { Donut } from "@/components/charts/donut";
import { BarList } from "@/components/charts/bar-list";
import { Heatmap } from "@/components/charts/heatmap";

export const metadata = { title: "Network overview" };

export default async function HqOverview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const r = resolveRange(sp, "30d");
  const ids = await scopedStoreIds(scope);
  const [k, byStore, stores, heat, alerts, liability, active30, pendingPOs, recalls] = await Promise.all([
    kpis(ids, r),
    salesByStore(ids, r),
    db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, kind: true, status: true, region: { select: { name: true } } } }),
    hourlyHeat(ids, { ...r, start: new Date(Math.max(r.start.getTime(), Date.now() - 28 * 86_400_000)) }),
    stockAlerts(ids),
    db.customer.aggregate({ where: scope.kind === "HQ" ? {} : { homeStoreId: { in: ids } }, _sum: { points: true }, _count: true }),
    db.customer.count({ where: { lastPurchaseAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, ...(scope.kind === "HQ" ? {} : { homeStoreId: { in: ids } }) } }),
    db.stockOrder.count({ where: { status: "SUBMITTED", kind: "WHOLESALE", buyerId: { in: ids } } }),
    db.batch.count({ where: { status: { in: ["RECALLED", "QUARANTINE"] } } }),
  ]);
  const c = k.cur;
  const retail = stores.filter((s) => s.kind === "RETAIL");
  const regions = new Map<string, number>();
  for (const s of retail) regions.set(s.region.name, (regions.get(s.region.name) ?? 0) + (byStore.get(s.id)?.netCents ?? 0));
  const league = retail
    .map((s) => ({ s, net: byStore.get(s.id)?.netCents ?? 0, atv: byStore.get(s.id)?.atvCents ?? 0 }))
    .filter((x) => x.s.status === "ACTIVE")
    .sort((a, b) => b.net - a.net);
  const hours = Array.from({ length: 12 }, (_, i) => i + 9);

  return (
    <>
      <PageHeader
        overline={scope.kind === "REGION" ? `Region · ${user.region?.name}` : "Herbal Holland network"}
        title="Network overview"
        description={`${retail.filter((s) => s.status === "ACTIVE").length} trading stores · ${retail.filter((s) => s.status === "OPENING_SOON").length} opening soon · ${liability._count.toLocaleString()} Oranje Club members`}
        actions={<RangeTabs path="/hq" current={r.preset} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Net sales (ex VAT)" value={zarCompact(c.netCents)} delta={k.deltas.net} trend={k.trend.net.slice(-12)} className="col-span-2" />
        <Stat label="Transactions" value={c.sales.toLocaleString()} delta={k.deltas.tx} />
        <Stat label="Average basket" value={zar(c.atvCents)} delta={k.deltas.atv} />
        <Stat label="Online share" value={pct(c.netCents ? k.online / c.netCents : 0)} sub={zarCompact(k.online)} />
        <Stat label="Active members" value={active30.toLocaleString()} sub="bought in 30 days" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Network net sales" description="Daily, ex VAT, all channels" />
          <CardBody>
            <AreaChart labels={k.trend.labels} series={[{ name: "Net sales", color: "var(--color-series-1)", values: k.trend.net }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sales by region" description="Net sales, ex VAT" />
          <CardBody>
            <Donut data={[...regions].map(([label, value]) => ({ label, value }))} centerLabel={zarCompact(c.netCents)} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Store league" description="Ranked by net sales" action={<ButtonLink href={`/hq/reports/sales-by-store?range=${r.preset}`} variant="ghost" size="sm">Full table</ButtonLink>} />
          <CardBody>
            <BarList
              rows={league.slice(0, 10).map((x, i) => ({
                label: (
                  <Link href={`/store/${x.s.code}`} className="hover:text-oranje-700">
                    <span className="tnum mr-2 text-ink-400">{String(i + 1).padStart(2, "0")}</span>
                    {x.s.name}
                  </Link>
                ),
                value: x.net,
                sub: `ATV ${zar(x.atv)}`,
                tip: `${x.s.name} (${x.s.code})\n${zar(x.net)} net · ${x.s.region.name}`,
              }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Needs attention" description="Across your stores" />
          <CardBody className="space-y-3 text-sm">
            <Attention href="/hq/distribution" n={pendingPOs} label="Store orders awaiting DC approval" />
            <Attention href="/hq/batches" n={recalls} label="Batches recalled or in quarantine" danger />
            <Attention href="/hq/reports/low-stock" n={alerts.low} label="SKU-store lines at or below reorder point" />
            <Attention href="/hq/reports/negative-stock" n={alerts.negative} label="Negative stock lots" danger />
            <div className="rounded-xl bg-ink-950 p-4 text-white">
              <div className="text-xs text-ink-300">Oranje Club liability</div>
              <div className="font-display text-2xl font-semibold">{zar((liability._sum.points ?? 0) * POINT_VALUE_CENTS)}</div>
              <div className="text-xs text-ink-400">{guilders(liability._sum.points ?? 0)} outstanding</div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="When customers shop" description="Transactions by weekday and hour · last 28 days" />
        <CardBody>
          <Heatmap cells={heat} hours={hours} />
        </CardBody>
      </Card>
    </>
  );
}

function Attention({ href, n, label, danger }: { href: string; n: number; label: string; danger?: boolean }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-xl border border-ink-150 px-3 py-2.5 transition hover:border-oranje-300 hover:bg-oranje-50">
      <span className="text-ink-700">{label}</span>
      <span className={`tnum rounded-full px-2 py-0.5 text-xs font-bold ${n ? (danger ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700") : "bg-leaf-50 text-leaf-700"}`}>{n}</span>
    </Link>
  );
}
