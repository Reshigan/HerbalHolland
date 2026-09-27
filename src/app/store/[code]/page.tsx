import Link from "next/link";
import { AlertTriangle, ArrowRight, Boxes, Clock, FlaskConical, PackageX, ShoppingBag } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { kpis, orderQueue, pendingAnnouncements, stockAlerts, topProducts } from "@/server/dashboard";
import { db } from "@/server/db";
import { resolveRange } from "@/lib/ranges";
import { zar, zarCompact, pct } from "@/lib/money";
import { fmtTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Stat } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { AreaChart } from "@/components/charts/area-chart";
import { Donut } from "@/components/charts/donut";
import { BarList } from "@/components/charts/bar-list";

export const metadata = { title: "Store overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function StoreDashboard({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const r = resolveRange(sp, "30d");
  const ids = [store.id];
  const [k, top, alerts, queue, notes, shift] = await Promise.all([
    kpis(ids, r),
    topProducts(ids, r, 7),
    stockAlerts(ids),
    orderQueue(ids),
    pendingAnnouncements(store.id, store.format, store.region.code),
    db.shift.findFirst({ where: { storeId: store.id, closedAt: null }, orderBy: { openedAt: "desc" } }),
  ]);
  const c = k.cur;
  const openOrders = (queue.PLACED ?? 0) + (queue.PICKING ?? 0) + (queue.READY ?? 0);

  return (
    <>
      <PageHeader
        overline={`Herbal Holland ${store.name} · ${store.code}`}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={`${store.addressLine}, ${store.suburb}, ${store.city}`}
        actions={<RangeTabs path={`/store/${code}`} current={r.preset} />}
      />

      {notes.length > 0 && (
        <Link href={`/store/${code}/updates`} className="mb-6 flex items-center gap-3 rounded-2xl border border-oranje-200 bg-oranje-50 px-4 py-3 text-sm text-oranje-800 hover:bg-oranje-100">
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
          <CardHeader title="How customers paid" description="Share of takings incl. VAT" />
          <CardBody>
            <Donut data={k.payments} centerLabel={zarCompact(c.grossCents)} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Best sellers" description="Net sales, ex VAT" action={<ButtonLink href={`/store/${code}/reports/sales-by-product?range=${r.preset}`} variant="ghost" size="sm">All</ButtonLink>} />
          <CardBody>
            <BarList rows={top.map((t) => ({ label: t.name, value: t.netCents, sub: `${t.units} sold`, tip: `${t.name}\n${t.units} units · margin ${pct(t.marginPct)}` }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Stock health" description="Needs attention today" action={<ButtonLink href={`/store/${code}/inventory`} variant="ghost" size="sm">Inventory</ButtonLink>} />
          <CardBody className="space-y-2">
            <AlertRow href={`/store/${code}/purchasing/new`} icon={<Boxes className="h-4 w-4" />} tone={alerts.low ? "amber" : "ok"} label="At or below reorder point" value={`${alerts.low} SKUs`} action="Reorder" />
            <AlertRow href={`/store/${code}/reports/expiry`} icon={<Clock className="h-4 w-4" />} tone={alerts.expiringUnits ? "amber" : "ok"} label="Expiring within 30 days" value={`${alerts.expiringUnits} units`} action="Review" />
            <AlertRow href={`/store/${code}/batches`} icon={<FlaskConical className="h-4 w-4" />} tone={alerts.blockedUnits ? "red" : "ok"} label="Recalled or quarantined on hand" value={`${alerts.blockedUnits} units`} action="Resolve" />
            <AlertRow href={`/store/${code}/reports/negative-stock`} icon={<PackageX className="h-4 w-4" />} tone={alerts.negative ? "red" : "ok"} label="Negative stock lots" value={`${alerts.negative}`} action="Count" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Today at the counter" description={shift ? `Shift open since ${fmtTime(shift.openedAt)}` : "No shift open"} />
          <CardBody className="space-y-4">
            <Link href={`/store/${code}/orders`} className="flex items-center justify-between rounded-2xl bg-ink-950 p-4 text-white transition hover:bg-ink-900">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-oranje-500 text-ink-950">
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
                <div className="text-oranje-400">{queue.READY ?? 0} ready</div>
              </div>
            </Link>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-ink-50 p-3">
                <div className="text-xs text-ink-500">Online sales</div>
                <div className="font-display text-lg font-semibold">{zarCompact(k.online)}</div>
              </div>
              <div className="rounded-xl bg-ink-50 p-3">
                <div className="text-xs text-ink-500">Guilders issued</div>
                <div className="font-display text-lg font-semibold">ƒ{c.pointsIssued.toLocaleString()}</div>
              </div>
            </div>
            <ButtonLink href="/pos" className="w-full" variant="dark">
              Open the till
            </ButtonLink>
          </CardBody>
        </Card>
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
      {tone !== "ok" && <span className="text-xs font-semibold text-oranje-700">{action} →</span>}
    </Link>
  );
}
