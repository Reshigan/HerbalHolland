import Link from "next/link";
import { AlertTriangle, ArrowRight, Boxes, ChevronRight, Clock, Download, FlaskConical, PackageX, ShoppingBag } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { scopeOf, storeForUser, storeWhere } from "@/server/scope";
import { kpis, orderQueue, pendingAnnouncements, stockAlerts, topProducts } from "@/server/dashboard";
import { salesByStore } from "@/server/finance";
import { db } from "@/server/db";
import { delta, previousRange, resolveRange } from "@/lib/ranges";
import { zar, zarCompact, pct } from "@/lib/money";
import { fmtTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { PageHeader } from "@/components/ui/page";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Stat } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { AreaChart } from "@/components/charts/area-chart";
import { Donut } from "@/components/charts/donut";
import { BarList } from "@/components/charts/bar-list";

export const metadata = { title: "Store overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function StoreDashboard({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ range?: string; stores?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const r = resolveRange(sp, "30d");
  // Owners (and HQ) can consolidate every store of this company they may see; managers only ever see their own store.
  const siblings = await db.store.findMany({
    where: { AND: [storeWhere(scopeOf(user)), { companyId: store.companyId, kind: "RETAIL" }] },
    select: { id: true, code: true, name: true, city: true },
    orderBy: { name: "asc" },
  });
  const company = siblings.length > 1 && sp.stores === "company";
  const ids = company ? siblings.map((x) => x.id) : [store.id];
  const [k, top, alerts, queue, notes, shift, byStore, byStorePrev] = await Promise.all([
    kpis(ids, r),
    topProducts(ids, r, 7),
    stockAlerts(ids),
    orderQueue(ids),
    pendingAnnouncements(store.id, store.format, store.region.code),
    db.shift.findFirst({ where: { storeId: store.id, closedAt: null }, orderBy: { openedAt: "desc" } }),
    company ? salesByStore(ids, r) : null,
    company ? salesByStore(ids, previousRange(r)) : null,
  ]);
  const c = k.cur;
  const openOrders = (queue.PLACED ?? 0) + (queue.PICKING ?? 0) + (queue.READY ?? 0);
  const keep = { range: r.preset === "custom" ? undefined : r.preset, stores: company ? "company" : undefined };
  const rangeQS = r.preset === "custom" ? `from=${r.from}&to=${r.to}` : `range=${r.preset}`;
  const reportQS = `${rangeQS}${company ? "&stores=company" : ""}`;
  const league = company
    ? siblings
        .map((x) => ({ ...x, s: byStore!.get(x.id), prev: byStorePrev!.get(x.id)?.netCents ?? 0 }))
        .sort((a, b) => (b.s?.netCents ?? 0) - (a.s?.netCents ?? 0))
    : [];

  return (
    <>
      <PageHeader
        overline={company ? `${store.company.name} · ${siblings.length} stores` : `Herbal Holland ${store.name} · ${store.code}`}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={company ? "All your stores together. Open a store below to see it on its own." : `${store.addressLine}, ${store.suburb}, ${store.city}`}
        actions={<RangeTabs path={`/store/${code}`} current={r.preset} params={{ stores: keep.stores }} />}
      />
      {siblings.length > 1 && (
        <TabLinks
          className="mb-6"
          current={`/store/${code}?${reportQS}`}
          tabs={[
            { href: `/store/${code}?${rangeQS}`, label: `${store.name} only` },
            { href: `/store/${code}?${rangeQS}&stores=company`, label: `All my stores (${siblings.length})` },
          ]}
        />
      )}

      {notes.length > 0 && (
        <Link href={`/store/${code}/updates`} className="mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 hover:bg-brand-100">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <b>{notes.length} HQ update{notes.length > 1 ? "s" : ""} need your acknowledgement</b> — latest: {notes[0].title}
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Net sales (ex VAT)" value={zarCompact(c.netCents)} delta={k.deltas.net} trend={k.trend.net.slice(-12)} className="col-span-2 lg:col-span-1" />
        <Stat label="Transactions" value={c.sales.toLocaleString()} delta={k.deltas.tx} />
        <Stat label="Average basket" value={zar(c.atvCents)} delta={k.deltas.atv} />
        <Stat label="Gross margin" value={pct(c.marginPct)} sub={zarCompact(c.grossProfitCents) + " profit"} />
        <Stat label="Member sales" value={pct(c.memberRate, 0)} sub="of transactions" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Net sales" description={`Daily, ex VAT · ${r.from} to ${r.to}`} />
          <CardBody>
            <AreaChart labels={k.trend.labels} series={[{ name: "Net sales", color: "var(--color-series-1)", values: k.trend.net }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="How sales were paid" description="Share of takings incl. VAT" />
          <CardBody>
            <Donut data={k.payments} centerLabel={zarCompact(c.grossCents)} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Best sellers" description="Net sales, ex VAT" action={<ButtonLink href={`/store/${code}/reports/sales-by-product?${reportQS}`} variant="ghost" size="sm">All</ButtonLink>} />
          <CardBody>
            <BarList rows={top.map((t) => ({ label: t.name, value: t.netCents, sub: `${t.units} sold`, tip: `${t.name}\n${t.units} units · margin ${pct(t.marginPct)}` }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Stock health" description="Needs attention today" action={<ButtonLink href={company ? `/store/${code}/reports/stock-valuation?by=store&${reportQS}` : `/store/${code}/inventory`} variant="ghost" size="sm">Inventory</ButtonLink>} />
          <CardBody className="space-y-2">
            <AlertRow href={company ? `/store/${code}/reports/low-stock?${reportQS}` : `/store/${code}/purchasing/new`} icon={<Boxes className="h-4 w-4" />} tone={alerts.low ? "amber" : "ok"} label="At or below reorder point" value={`${alerts.low} SKUs`} action="Reorder" />
            <AlertRow href={`/store/${code}/reports/expiry?${reportQS}`} icon={<Clock className="h-4 w-4" />} tone={alerts.expiringUnits ? "amber" : "ok"} label="Expiring within 30 days" value={`${alerts.expiringUnits} units`} action="Review" />
            <AlertRow href={company ? `/store/${code}/reports/recalls?${reportQS}` : `/store/${code}/batches`} icon={<FlaskConical className="h-4 w-4" />} tone={alerts.blockedUnits ? "red" : "ok"} label="Recalled or quarantined on hand" value={`${alerts.blockedUnits} units`} action="Resolve" />
            <AlertRow href={`/store/${code}/reports/negative-stock?${reportQS}`} icon={<PackageX className="h-4 w-4" />} tone={alerts.negative ? "red" : "ok"} label="Negative stock lots" value={`${alerts.negative}`} action="Count" />
          </CardBody>
        </Card>

        {company ? (
          <Card>
            <CardHeader
              title="Your stores"
              description="Net sales ex VAT · open a store to drill in"
              action={
                <a href={`/api/reports/sales-by-store?store=${code}&${reportQS}`} className={buttonClass("ghost", "sm")} download>
                  <Download className="h-3.5 w-3.5" /> CSV
                </a>
              }
            />
            <Table>
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th align="right">Net sales</Th>
                  <Th align="right">Growth</Th>
                  <Th align="right">Margin</Th>
                </tr>
              </thead>
              <tbody>
                {league.map((x) => {
                  const g = delta(x.s?.netCents ?? 0, x.prev);
                  return (
                    <Tr key={x.id}>
                      <Td>
                        <Link href={`/store/${x.code}?${rangeQS}`} className="group inline-flex items-center gap-1 font-medium text-ink-900 hover:text-brand-700">
                          {x.name} <ChevronRight className="h-3.5 w-3.5 text-ink-300 group-hover:text-brand-600" aria-hidden />
                        </Link>
                        <div className="text-xs text-ink-500">{x.city}</div>
                      </Td>
                      <Td align="right" className="tnum">{zarCompact(x.s?.netCents ?? 0)}</Td>
                      <Td align="right" className={`tnum ${g == null ? "text-ink-400" : g >= 0 ? "text-leaf-700" : "text-rose-600"}`}>{g == null ? "—" : `${g >= 0 ? "▲" : "▼"}${pct(Math.abs(g))}`}</Td>
                      <Td align="right" className="tnum">{x.s?.netCents ? pct(x.s.marginPct) : "—"}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Today at the counter" description={shift ? `Shift open since ${fmtTime(shift.openedAt)}` : "No shift open"} />
            <CardBody className="space-y-4">
              <Link href={`/store/${code}/orders`} className="flex items-center justify-between rounded-2xl bg-ink-950 p-4 text-white transition hover:bg-ink-900">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-ink-950">
                    <ShoppingBag className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="font-display text-2xl font-semibold leading-none">{openOrders}</div>
                    <div className="mt-1 text-xs text-ink-300">online orders to fulfil</div>
                  </div>
                </div>
                <div className="text-right text-xs text-ink-300">
                  <div>{queue.PLACED ?? 0} new</div>
                  <div>{queue.PICKING ?? 0} picking</div>
                  <div className="text-brand-400">{queue.READY ?? 0} ready</div>
                </div>
              </Link>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-ink-50 p-3">
                  <div className="text-xs text-ink-500">Online sales</div>
                  <div className="font-display text-lg font-semibold">{zarCompact(k.online)}</div>
                </div>
                <div className="rounded-xl bg-ink-50 p-3">
                  <div className="text-xs text-ink-500">Points issued</div>
                  <div className="font-display text-lg font-semibold">{fmtPoints(c.pointsIssued)}</div>
                </div>
              </div>
              <ButtonLink href="/pos" className="w-full" variant="dark">
                Open the till
              </ButtonLink>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

function AlertRow({ href, icon, label, value, action, tone }: { href: string; icon: React.ReactNode; label: string; value: string; action: string; tone: "ok" | "amber" | "red" }) {
  const ring = { ok: "bg-leaf-50 text-leaf-700", amber: "bg-amber-50 text-amber-700", red: "bg-rose-50 text-rose-600" }[tone];
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-ink-50">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${ring}`}>{icon}</span>
      <span className="flex-1 text-sm">
        <span className="block font-medium text-ink-850">{value}</span>
        <span className="text-xs text-ink-500">{label}</span>
      </span>
      {tone !== "ok" && <span className="text-xs font-semibold text-brand-700">{action} →</span>}
    </Link>
  );
}
