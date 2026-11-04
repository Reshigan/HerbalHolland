import Link from "next/link";
import { db } from "@/server/db";
import { homeWhere, insightsContext, newMembersByDay } from "@/server/insights";
import { crmKpis, segmentCounts, tierCounts } from "@/server/hq/crm";
import { JOINED_AT } from "@/server/reports/customers";
import { TIERS } from "@/lib/loyalty-rules";
import { delta, previousRange, resolveRange } from "@/lib/ranges";
import { fmtDay } from "@/lib/format";
import { zar } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { AreaChart } from "@/components/charts/area-chart";
import { BarList } from "@/components/charts/bar-list";
import { Donut } from "@/components/charts/donut";
import { TierBadge } from "@/components/ui/status";
import { InsightsShell, Row, insightHref, memberName, type InsightParams } from "@/components/insights/ui";

const PATH = "/insights/members";
const n = (v: number) => v.toLocaleString("en-ZA");

export default async function MemberInsights({ searchParams }: { searchParams: Promise<InsightParams> }) {
  const sp = await searchParams;
  const ctx = await insightsContext(sp, PATH);
  const r = resolveRange(sp, "30d");
  const s = ctx.members;
  const home = homeWhere(s);
  const before = previousRange(r);
  const [k, segments, tiers, growth, previous, sources, top, homes] = await Promise.all([
    crmKpis(s),
    segmentCounts(s),
    tierCounts(s),
    newMembersByDay(s, r),
    db.customer.count({ where: { AND: [home, { createdAt: { gte: before.start, lt: before.end } }] } }),
    db.customer.groupBy({ by: ["joinedVia", "source"], where: { AND: [home, { createdAt: { gte: r.start, lt: r.end } }] }, _count: true }),
    db.customer.findMany({ where: home, orderBy: [{ lifetimeCents: "desc" }, { memberNo: "asc" }], take: 6, select: { id: true, firstName: true, lastName: true, memberNo: true, tier: true, lifetimeCents: true, visits: true } }),
    ctx.store ? [] : db.customer.groupBy({ by: ["homeStoreId"], where: home, _count: true }),
  ]);
  const joined = growth.reduce((sum, d) => sum + d.n, 0);
  const list = (extra: Record<string, string>) => insightHref(`${PATH}/list`, { store: sp.store }, extra);
  const bySource = new Map<string, number>();
  for (const g of sources) {
    const label = g.joinedVia ?? JOINED_AT[g.source ?? ""] ?? "Direct";
    bySource.set(label, (bySource.get(label) ?? 0) + g._count);
  }
  const homeCount = new Map(homes.map((h) => [h.homeStoreId, h._count]));
  const stores = ctx.stores.map((x) => ({ label: x.name, value: homeCount.get(x.id) ?? 0, href: insightHref(PATH, { ...sp, store: x.code }) })).filter((x) => x.value).sort((a, b) => b.value - a.value).slice(0, 10);
  return (
    <InsightsShell tab="members" path={PATH} ctx={ctx} sp={sp} r={r} title="Members">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={n(k.members)} />
        <Stat label="Bought in 30 days" value={n(k.active30)} sub={k.members ? `${Math.round((k.active30 / k.members) * 100)}% of members` : undefined} />
        <Stat label="New in this period" value={n(joined)} delta={previous ? delta(joined, previous) : null} />
        <Stat label="Points unspent" value={n(k.points)} />
      </div>
      {r.days > 1 && (
        <Card>
          <CardHeader title="New members by day" action={<Link href={list({})} className="text-sm font-semibold text-brand-700">All members</Link>} />
          <CardBody>
            <AreaChart labels={growth.map((d) => fmtDay(`${d.date}T12:00:00Z`))} series={[{ name: "New members", color: "var(--color-series-1)", values: growth.map((d) => d.n) }]} format="number" height={220} />
          </CardBody>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Segments" description="Tap a segment to see who is in it." />
          <CardBody>
            <BarList rows={segments.map((x) => ({ label: x.name, value: x.count, tip: x.blurb, href: list({ segment: x.key }) }))} format="number" />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tiers" description="Tap a tier to see who is in it." />
          <CardBody>
            {k.members ? <Donut data={TIERS.map((t) => ({ label: t.name, value: tiers.get(t.key) ?? 0, href: list({ tier: t.key }) }))} format="number" centerLabel="Members" layout="row" /> : <p className="text-sm text-ink-500">No members yet.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Where they joined" description="Members who joined in this period." />
          <CardBody>
            {bySource.size ? <BarList rows={[...bySource].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} format="number" /> : <p className="text-sm text-ink-500">Nobody joined in this period.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Who can be reached" description="Members who said yes to each channel." />
          <CardBody>
            <BarList rows={[{ label: "SMS", value: k.sms }, { label: "Email", value: k.email }, { label: "WhatsApp", value: k.whatsapp }, { label: "App push", value: k.push }]} format="number" />
          </CardBody>
        </Card>
        {stores.length > 1 && (
          <Card>
            <CardHeader title="Home stores" description="Tap a store to see only that store." />
            <CardBody>
              <BarList rows={stores} format="number" />
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Top spenders" description="Lifetime spend." className="pb-4" />
          <ul className="border-t border-ink-150">
            {top.map((c) => (
              <Row key={c.id} href={insightHref(`${PATH}/${c.id}`, sp)} title={memberName(c)} sub={<TierBadge tier={c.tier} />} value={zar(c.lifetimeCents)} valueSub={`${n(c.visits)} visits`} />
            ))}
          </ul>
        </Card>
      </div>
    </InsightsShell>
  );
}
