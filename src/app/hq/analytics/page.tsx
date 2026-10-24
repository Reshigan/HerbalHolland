import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { siteAnalytics } from "@/server/analytics";
import { JOINED_AT } from "@/server/reports/customers";
import { resolveRange } from "@/lib/ranges";
import { pct } from "@/lib/money";
import { addDays, dayKey, fmtDate, fmtDay, num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Stat } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";

export const metadata = { title: "Analytics" };

const TOP = 10;

// The shop and the Rewards app: first-party page views (no cookies, no personal details; src/lib/analytics.ts), and
// the members who joined. Page views have no store, so they're network-wide; joins follow the viewer's scope.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const r = resolveRange(sp, "30d");
  const home: Prisma.CustomerWhereInput = scope.kind === "HQ" ? {} : { homeStoreId: { in: await scopedStoreIds(scope) } };
  const [a, joins] = await Promise.all([
    siteAnalytics(r, TOP),
    db.customer.groupBy({ by: ["joinedVia", "source"], where: { AND: [home, { createdAt: { gte: r.start, lt: r.end } }] }, _count: true }),
  ]);

  // Every day in the range (zero when nobody came), web and app visitors side by side.
  const days = Array.from({ length: r.days }, (_, i) => dayKey(addDays(new Date(`${r.from}T12:00:00+02:00`), i)));
  const on = (day: string, app: boolean) => a.daily.find((d) => d.day === day && d.app === app)?.visitors ?? 0;
  const by = new Map<string, number>();
  for (const g of joins) {
    const label = g.joinedVia ?? JOINED_AT[g.source ?? ""] ?? "Direct";
    by.set(label, (by.get(label) ?? 0) + g._count);
  }
  const joined = joins.reduce((s, g) => s + g._count, 0);
  const joinRows = [...by].sort((x, y) => y[1] - x[1]).slice(0, 15);
  const query = new URLSearchParams(Object.entries({ range: sp.range, from: sp.from, to: sp.to }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHeader
        overline="Shop & Rewards app"
        title="Analytics"
        description={`Visitors, installs and joins on the shop and the Rewards app · ${fmtDate(r.start)} – ${fmtDate(addDays(r.end, -1))}`}
        actions={<RangeTabs path="/hq/analytics" current={r.preset} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Visitors" value={num(a.visitors)} sub={`${num(a.visits)} visits`} />
        <Stat label="Page views" value={num(a.views)} sub={a.visits ? `${(a.views / a.visits).toFixed(1)} a visit` : undefined} />
        <Stat label="In the app" value={a.visitors ? pct(a.appVisitors / a.visitors, 0) : "–"} sub={`${num(a.appVisitors)} visitors opened the installed app`} />
        <Stat label="Installs" value={num(a.installs)} sub="Added to a home screen or desktop" />
        <Stat label="New members" value={num(joined)} sub={scope.kind === "HQ" ? "Joined Rewards" : "Joined Rewards, your stores"} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Visitors each day" description="On the web and in the installed app (someone who used both that day counts in each)" />
        <CardBody>
          <AreaChart
            format="number"
            labels={days.map((d) => fmtDay(`${d}T12:00:00Z`))}
            series={[
              { name: "Web", color: "var(--color-series-1)", values: days.map((d) => on(d, false)) },
              { name: "App", color: "var(--color-series-2)", values: days.map((d) => on(d, true)) },
            ]}
          />
        </CardBody>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Where visits come from" description="The ?src= tag on the link, else the site that sent them" />
          <CardBody>
            {a.sources.length ? <BarList format="number" rows={a.sources.map((s) => ({ label: s.source, value: s.visits, sub: a.visits ? pct(s.visits / a.visits, 0) : undefined }))} /> : <p className="text-sm text-ink-500">No visits in this period.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Top pages" description="Page views" />
          <CardBody>
            {a.pages.length ? <BarList format="number" rows={a.pages.map((p) => ({ label: p.path, value: p.views }))} /> : <p className="text-sm text-ink-500">No page views in this period.</p>}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Where members joined"
          description="Tagged join links and QR codes, else where they signed up"
          action={<Link href={`/hq/reports/join-sources?${query}`} className="text-sm font-semibold text-brand-700 hover:underline">Full report</Link>}
        />
        <Table>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th align="right">New members</Th>
              <Th align="right">Share</Th>
            </tr>
          </thead>
          <tbody>
            {joinRows.length ? (
              joinRows.map(([label, n]) => (
                <Tr key={label}>
                  <Td className="font-medium text-ink-900">{label}</Td>
                  <Td align="right" className="tnum">{num(n)}</Td>
                  <Td align="right" className="tnum text-ink-500">{pct(n / joined, 0)}</Td>
                </Tr>
              ))
            ) : (
              <TableEmpty cols={3} title="No new members in this period" />
            )}
          </tbody>
        </Table>
      </Card>
      <p className="mt-4 text-xs text-ink-500">
        Counted on our own servers: no cookies, no personal details and no third parties. A visitor is a browser (a random id it keeps), so one person on two devices counts twice. Page views are kept for 400 days.
      </p>
    </>
  );
}
