import Link from "next/link";
import { Download } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { kpis, hourlyHeat, stockAlerts, todayTakings, monthToDate, tradingToday, orderQueue, openAlerts, newLeads, statementsDue, storeExceptions, tradeQueue, type StoreException } from "@/server/dashboard";
import { salesByStore } from "@/server/finance";
import { db } from "@/server/db";
import { resolveRange, delta, previousRange } from "@/lib/ranges";
import { zar, zarCompact, pct } from "@/lib/money";
import { fmtMonth } from "@/lib/format";
import { fmtPoints, POINT_VALUE_CENTS } from "@/lib/loyalty-rules";
import { PageHeader } from "@/components/ui/page";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { AreaChart } from "@/components/charts/area-chart";
import { Donut } from "@/components/charts/donut";
import { BarList } from "@/components/charts/bar-list";
import { Heatmap } from "@/components/charts/heatmap";

export const metadata = { title: "Network overview" };

export default async function HqOverview({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const region = scope.kind === "REGION";
  const hqTeam = user.role === "HQ_ADMIN" || user.role === "HQ_STAFF";
  const r = resolveRange(sp, "30d");
  const ids = await scopedStoreIds(scope);
  const now = new Date();
  const [k, byStore, byStorePrev, stores, heat, alerts, liability, active30, pendingPOs, recalls, takings, mtd, trading, queue, open, leads, statements, trade] = await Promise.all([
    kpis(ids, r),
    salesByStore(ids, r),
    salesByStore(ids, previousRange(r)),
    db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, city: true, kind: true, status: true, region: { select: { name: true, code: true } } } }),
    hourlyHeat(ids, { ...r, start: new Date(Math.max(r.start.getTime(), Date.now() - 28 * 86_400_000)) }),
    stockAlerts(ids),
    db.customer.aggregate({ where: scope.kind === "HQ" ? {} : { homeStoreId: { in: ids } }, _sum: { points: true }, _count: true }),
    db.customer.count({ where: { lastPurchaseAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, ...(scope.kind === "HQ" ? {} : { homeStoreId: { in: ids } }) } }),
    db.stockOrder.count({ where: { status: "SUBMITTED", kind: "WHOLESALE", buyerId: { in: ids } } }),
    db.batch.count({ where: { status: { in: ["RECALLED", "QUARANTINE"] } } }),
    todayTakings(ids, now),
    monthToDate(ids, now),
    tradingToday(ids, now),
    orderQueue(ids),
    openAlerts(user, ids),
    hqTeam ? newLeads() : null,
    hqTeam ? statementsDue(ids, now) : null,
    tradeQueue(ids, scope.kind === "HQ"),
  ]);
  const c = k.cur;
  const retail = stores.filter((s) => s.kind === "RETAIL");
  const active = retail.filter((s) => s.status === "ACTIVE");
  const activeIds = new Set(active.map((s) => s.id));
  // Distribution centres ring up courier and trade orders: only retail stores count as "trading".
  const tradingStores = [...trading].filter((id) => activeIds.has(id)).length;
  const growthOf = (id: string) => delta(byStore.get(id)?.netCents ?? 0, byStorePrev.get(id)?.netCents ?? 0);
  // Network view: the ten stores falling furthest behind the previous period (bounded, so exceptions stay cheap at 1,000 stores).
  const behind = region
    ? []
    : active
        .map((s) => ({ s, g: growthOf(s.id) }))
        .filter((x): x is { s: (typeof active)[number]; g: number } => x.g != null && x.g < 0)
        .sort((a, b) => a.g - b.g)
        .slice(0, 10);
  const exceptions = await storeExceptions(user, region ? active : behind.map((x) => x.s), now);
  const exceptionBy = new Map(exceptions.map((x) => [x.storeId, x]));
  const rangeQS = r.preset === "custom" ? `from=${r.from}&to=${r.to}` : `range=${r.preset}`;
  const regions = new Map<string, { label: string; value: number; href: string }>();
  for (const s of retail) {
    const g = regions.get(s.region.code) ?? { label: s.region.name, value: 0, href: `/hq/reports/sales-by-store?stores=region:${s.region.code}&${rangeQS}` };
    regions.set(s.region.code, { ...g, value: g.value + (byStore.get(s.id)?.netCents ?? 0) });
  }
  const league = active
    .map((s) => ({ s, net: byStore.get(s.id)?.netCents ?? 0, prev: byStorePrev.get(s.id)?.netCents ?? 0, atv: byStore.get(s.id)?.atvCents ?? 0, margin: byStore.get(s.id)?.marginPct ?? 0, ex: exceptionBy.get(s.id) }))
    .sort((a, b) => b.net - a.net);
  const hours = Array.from({ length: 12 }, (_, i) => i + 9);
  const openOrders = (queue.PLACED ?? 0) + (queue.PICKING ?? 0) + (queue.READY ?? 0);
  const takingsDelta = takings.prev.grossCents ? takings.delta : null;
  const worst = !region ? [] : exceptions.filter((x) => x.score > 0).slice(0, 8);
  const storeBy = new Map(stores.map((s) => [s.id, s]));

  return (
    <>
      <PageHeader
        overline={region ? `Region · ${user.region?.name}` : "Herbal Holland network"}
        title={region ? `${user.region?.name} overview` : "Network overview"}
        description={`${active.length} trading stores · ${retail.filter((s) => s.status === "OPENING_SOON").length} opening soon · ${liability._count.toLocaleString()} Herbal Holland Rewards members`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RangeTabs path="/hq" current={r.preset} />
            <a href={`/api/reports/sales-by-store?scope=hq&${rangeQS}`} className={buttonClass("outline", "sm")} download>
              <Download className="h-3.5 w-3.5" /> Export stores
            </a>
          </div>
        }
      />

      {/* Today, before the range: the numbers HQ and area managers act on first. */}
      <section aria-label="Today" className={hqTeam ? "mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8" : "mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"}>
        <Stat
          label={region ? "Region sales today" : "Network sales today"}
          value={zarCompact(takings.cur.grossCents)}
          delta={takingsDelta}
          deltaLabel="vs same day last week"
          sub={[takingsDelta == null ? `${takings.cur.sales.toLocaleString()} sales so far` : null, takings.tradeCents ? `of which trade ${zarCompact(takings.tradeCents)}` : null].filter(Boolean).join(" · ") || undefined}
        />
        <Stat label="Net sales · month to date" value={zarCompact(mtd.cur.netCents)} delta={mtd.prev.netCents ? mtd.delta : null} deltaLabel="vs last month, same days" />
        <Stat label="Stores trading today" value={`${tradingStores} of ${active.length}`} sub={tradingStores < active.length ? <Link href={`/hq/stores?status=ACTIVE&range=today&sort=sales&dir=asc`} className="font-semibold text-brand-700 hover:underline">{active.length - tradingStores} with no sale yet →</Link> : "every store has sold today"} />
        <Stat label="Online orders open" value={openOrders.toLocaleString()} sub={<Link href="/hq/orders?status=OPEN" className="font-semibold text-brand-700 hover:underline">{queue.PLACED ?? 0} new · {queue.READY ?? 0} ready →</Link>} />
        {/* The trade channel: orders to fulfil, EFT pro formas waiting for HQ, accounts on hold. Links appear with the work. */}
        <Stat
          label="Trade orders open"
          value={trade.open.toLocaleString()}
          sub={
            trade.open || trade.pendingEft || trade.onHold ? (
              <span className="flex flex-wrap gap-x-2">
                {trade.open > 0 && (
                  <Link href="/hq/trade/orders" className="font-semibold text-brand-700 hover:underline">
                    {trade.ready ? `${trade.ready} ready to collect` : "to fulfil"} →
                  </Link>
                )}
                {trade.pendingEft > 0 && (
                  <Link href="/hq/trade" className="font-semibold text-brand-700 hover:underline">
                    {trade.pendingEft} awaiting EFT →
                  </Link>
                )}
                {trade.onHold > 0 && (
                  <Link href="/hq/trade/accounts?status=ON_HOLD" className="font-semibold text-rose-600 hover:underline">
                    {trade.onHold} account{trade.onHold === 1 ? "" : "s"} on hold →
                  </Link>
                )}
              </span>
            ) : (
              "no trade orders waiting"
            )
          }
        />
        <Stat
          label="Loss-prevention alerts"
          value={open.open.toLocaleString()}
          sub={open.open ? <Link href="/hq/loss-prevention" className={`font-semibold hover:underline ${open.high ? "text-rose-600" : "text-brand-700"}`}>{open.high ? `${open.high} high severity · ` : ""}review →</Link> : "nothing open"}
        />
        {hqTeam && leads != null && <Stat label="New franchise leads" value={leads.toLocaleString()} sub={leads ? <Link href="/hq/franchise?status=NEW" className="font-semibold text-brand-700 hover:underline">first reply within a day →</Link> : "inbox clear"} />}
        {hqTeam && statements && (
          <Stat
            label="Statements to email"
            value={statements.due.toLocaleString()}
            sub={statements.due ? <Link href={`/hq/statements?month=${statements.month}`} className="font-semibold text-brand-700 hover:underline">{fmtMonth(`${statements.month}-01`)} · {statements.of} stores →</Link> : `${fmtMonth(`${statements.month}-01`)} all sent`}
          />
        )}
      </section>

      {region && (
        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader title="Your stores, ranked" description={`Net sales ex VAT · ${r.from} to ${r.to} · open a store to work it`} action={<ButtonLink href={`/hq/reports/sales-by-store?${rangeQS}`} variant="ghost" size="sm">Full table</ButtonLink>} />
            <Table className="mt-3" stickyFirst minWidth="44rem">
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th align="right">Net sales</Th>
                  <Th align="right">Growth</Th>
                  <Th align="right">ATV</Th>
                  <Th>Exceptions</Th>
                </tr>
              </thead>
              <tbody>
                {league.map((x, i) => {
                  const g = delta(x.net, x.prev);
                  return (
                    <Tr key={x.s.id} href={`/store/${x.s.code}?${rangeQS}`}>
                      <Td>
                        <Link href={`/store/${x.s.code}?${rangeQS}`} className="font-medium text-ink-900 hover:text-brand-700">
                          <span className="tnum mr-2 text-ink-500">{String(i + 1).padStart(2, "0")}</span>
                          {x.s.name}
                        </Link>
                        <div className="pl-7 text-xs text-ink-500">{x.s.city}</div>
                      </Td>
                      <Td align="right" className="font-medium text-ink-900">{zarCompact(x.net)}</Td>
                      <Td align="right" className={g == null ? "text-ink-500" : g >= 0 ? "text-leaf-700" : "text-rose-600"}>{g == null ? "—" : `${g >= 0 ? "▲" : "▼"}${pct(Math.abs(g))}`}</Td>
                      <Td align="right">{x.atv ? zar(x.atv) : "—"}</Td>
                      <Td>
                        <ExceptionBadges x={x.ex} />
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
          <Card className="min-w-0">
            <CardHeader title="Exceptions" description="Most urgent first — cash past its banking deadline, alerts, negative stock, quiet stores" />
            <CardBody className="space-y-2">
              {worst.length === 0 && <p className="rounded-xl bg-leaf-50 px-3 py-2.5 text-sm text-leaf-700">Nothing out of the ordinary across your region today.</p>}
              {worst.map((x) => {
                const s = storeBy.get(x.storeId)!;
                return (
                  <Link key={x.storeId} href={`/store/${s.code}`} className="block rounded-xl border border-ink-150 px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50">
                    <span className="block text-sm font-medium text-ink-900">{s.name}</span>
                    <span className="mt-1 block">
                      <ExceptionBadges x={x} />
                    </span>
                  </Link>
                );
              })}
            </CardBody>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Net sales (ex VAT)" value={zarCompact(c.netCents)} delta={k.deltas.net} trend={k.trend.net.slice(-12)} sub={k.trade ? `of which trade ${zarCompact(k.trade)}` : undefined} className="col-span-2" />
        <Stat label="Transactions" value={c.sales.toLocaleString()} delta={k.deltas.tx} />
        <Stat label="Average basket" value={zar(c.atvCents)} delta={k.deltas.atv} />
        <Stat label="Online share" value={pct(c.netCents ? k.online / c.netCents : 0)} sub={zarCompact(k.online)} />
        <Stat label="Active members" value={active30.toLocaleString()} sub="bought in 30 days" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title={region ? "Region net sales" : "Network net sales"} description="Daily, ex VAT, all channels" />
          <CardBody>
            <AreaChart labels={k.trend.labels} series={[{ name: "Net sales", color: "var(--color-series-1)", values: k.trend.net }]} />
          </CardBody>
        </Card>
        <Card className="min-w-0">
          <CardHeader title={region ? "Sales by store" : "Sales by region"} description={region ? "Net sales, ex VAT · share of the region" : "Net sales, ex VAT · open a region for its stores"} />
          <CardBody>
            <Donut data={region ? league.slice(0, 8).map((x) => ({ label: x.s.name, value: x.net, href: `/store/${x.s.code}?${rangeQS}` })) : [...regions.values()]} centerLabel={zarCompact(c.netCents)} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {!region && (
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader title="Store league" description="Ranked by net sales" action={<ButtonLink href={`/hq/reports/sales-by-store?${rangeQS}`} variant="ghost" size="sm">Full table</ButtonLink>} />
            <CardBody>
              <BarList
                compact
                rows={league.slice(0, 10).map((x, i) => ({
                  label: (
                    <Link href={`/store/${x.s.code}?${rangeQS}`} className="hover:text-brand-700">
                      <span className="tnum mr-2 text-ink-500">{String(i + 1).padStart(2, "0")}</span>
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
        )}
        <Card className={region ? "min-w-0 lg:col-span-3" : "min-w-0"}>
          <CardHeader title="Needs attention" description="Across your stores" />
          <CardBody className={region ? "grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5" : "space-y-3 text-sm"}>
            <Attention href="/hq/distribution" n={pendingPOs} label="Store orders awaiting DC approval" />
            <Attention href="/hq/batches" n={recalls} label="Batches recalled or in quarantine" danger />
            <Attention href="/hq/reports/low-stock" n={alerts.low} label="SKU-store lines at or below reorder point" />
            <Attention href="/hq/reports/negative-stock" n={alerts.negative} label="Negative stock lots" danger />
            <div className="rounded-xl bg-ink-950 p-4 text-white">
              <div className="text-xs text-ink-300">Rewards liability</div>
              <div className="font-display text-2xl font-semibold">{zar((liability._sum.points ?? 0) * POINT_VALUE_CENTS)}</div>
              <div className="text-xs text-ink-400">{fmtPoints(liability._sum.points ?? 0)} outstanding</div>
            </div>
          </CardBody>
        </Card>
      </div>

      {!region && (
        <Card className="mt-6 min-w-0">
          <CardHeader
            title="Falling behind"
            description={`Biggest drop in net sales against the previous ${r.days} day${r.days === 1 ? "" : "s"} · with what's open at each store`}
            action={<ButtonLink href={`/hq/reports/sales-by-store?${rangeQS}&sort=growth&dir=asc`} variant="ghost" size="sm">Full table</ButtonLink>}
          />
          {behind.length === 0 ? (
            <CardBody>
              <p className="rounded-xl bg-leaf-50 px-3 py-2.5 text-sm text-leaf-700">No store is behind the previous period.</p>
            </CardBody>
          ) : (
            <Table className="mt-3" stickyFirst minWidth="44rem">
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th align="right">Net sales</Th>
                  <Th align="right">Previous period</Th>
                  <Th align="right">Growth</Th>
                  <Th>Why to look</Th>
                </tr>
              </thead>
              <tbody>
                {behind.map((x) => (
                  <Tr key={x.s.id} href={`/store/${x.s.code}?${rangeQS}`}>
                    <Td>
                      <Link href={`/store/${x.s.code}?${rangeQS}`} className="font-medium text-ink-900 hover:text-brand-700">
                        {x.s.name}
                      </Link>
                      <div className="text-xs text-ink-500">
                        {x.s.city} · {x.s.region.name}
                      </div>
                    </Td>
                    <Td align="right" className="font-medium text-ink-900">{zarCompact(byStore.get(x.s.id)?.netCents ?? 0)}</Td>
                    <Td align="right">{zarCompact(byStorePrev.get(x.s.id)?.netCents ?? 0)}</Td>
                    <Td align="right" className="text-rose-600">▼{pct(Math.abs(x.g))}</Td>
                    <Td>
                      <ExceptionBadges x={exceptionBy.get(x.s.id)} clear="Nothing open — check footfall and stock" />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Busiest hours" description="Transactions by weekday and hour · last 28 days" />
        <CardBody>
          <Heatmap cells={heat} hours={hours} />
        </CardBody>
      </Card>
    </>
  );
}

function ExceptionBadges({ x, clear = "All clear" }: { x?: StoreException; clear?: string }) {
  if (!x || x.score === 0) return <Badge tone="green">{clear}</Badge>;
  return (
    <span className="flex flex-wrap gap-1">
      {x.overdueCash > 0 && <Badge tone="red">{x.overdueCash} cash-up{x.overdueCash === 1 ? "" : "s"} overdue</Badge>}
      {x.highAlerts > 0 && <Badge tone="red">{x.highAlerts} high alert{x.highAlerts === 1 ? "" : "s"}</Badge>}
      {x.alerts - x.highAlerts > 0 && <Badge tone="amber">{x.alerts - x.highAlerts} alert{x.alerts - x.highAlerts === 1 ? "" : "s"}</Badge>}
      {x.negativeLots > 0 && <Badge tone="red">{x.negativeLots} negative</Badge>}
      {x.quiet && <Badge tone="amber">No sales yet today</Badge>}
      {x.lowStock > 0 && <Badge>{x.lowStock} low stock</Badge>}
    </span>
  );
}

function Attention({ href, n, label, danger }: { href: string; n: number; label: string; danger?: boolean }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-xl border border-ink-150 px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50">
      <span className="text-ink-700">{label}</span>
      <span className={`tnum shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${n ? (danger ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700") : "bg-leaf-50 text-leaf-700"}`}>{n}</span>
    </Link>
  );
}
