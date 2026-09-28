import Link from "next/link";
import { Mail, MessageSquare, Smartphone, Bell, Users, Send } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { crmKpis, memberWhere, segmentCounts, tierCounts } from "@/server/hq/crm";
import { qs } from "@/server/hq/form";
import { TIERS, fmtPoints } from "@/lib/loyalty-rules";
import { SEGMENTS } from "@/lib/rfm";
import { zarWhole, pct } from "@/lib/money";
import { fmtDate, num, timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TierBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Donut } from "@/components/charts/donut";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { EmptyRow } from "@/components/hq/ui";

export const metadata = { title: "Members & CRM" };

type SP = { q?: string; tier?: string; segment?: string; store?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const s = scope.kind === "HQ" ? null : ids;
  const page = pageParam(sp.page);
  const pageSize = 25;
  const where = memberWhere(s, sp);
  const [k, segments, tiers, total, members, stores] = await Promise.all([
    crmKpis(s),
    segmentCounts(s),
    tierCounts(s),
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      select: {
        id: true, memberNo: true, firstName: true, lastName: true, tier: true, visits: true, lifetimeCents: true, lastPurchaseAt: true, points: true,
        consentSms: true, consentEmail: true, consentWhatsapp: true, consentPush: true, createdAt: true, homeStore: { select: { name: true, code: true } },
      },
      orderBy: sp.q ? { memberNo: "asc" } : [{ lastPurchaseAt: { sort: "desc", nulls: "last" } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.store.findMany({ where: { id: { in: ids }, kind: "RETAIL" }, select: { code: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const href = (p: Record<string, string | number | undefined>) => `/hq/customers${qs({ ...sp, ...p })}`;
  const reach = (n: number) => (k.members ? pct(n / k.members, 0) : "—");

  return (
    <>
      <PageHeader
        overline={scope.kind === "REGION" ? `Region · ${user.region?.name}` : "Herbal Holland Rewards"}
        title="Members & CRM"
        description={`${scope.kind === "HQ" ? "Every Rewards member across the network" : "Rewards members whose home store is in your region"}, segmented by recency and frequency. Consent is tracked per channel (POPIA s69) and every message respects the CPA contact windows.`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={num(k.members)} sub={`${fmtPoints(k.points)} outstanding`} />
        <Stat label="Active · 30 days" value={num(k.active30)} sub={`${reach(k.active30)} of members`} />
        <Stat label="New this month" value={num(k.newMonth)} />
        <Stat label="Reachable by SMS" value={num(k.sms)} sub={`${reach(k.sms)} opted in`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Segments" description="Recency × frequency. Each has a suggested play — send it to a campaign in one click." />
          <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {segments.map((g) => (
              <div key={g.key} className="flex flex-col rounded-2xl border border-ink-150 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={href({ segment: g.key, page: undefined })} className="font-display text-sm font-semibold text-ink-900 hover:text-brand-700">
                    {g.name}
                  </Link>
                  <span className="font-display text-xl font-semibold tnum text-ink-950">{num(g.count)}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">{g.blurb}</p>
                <p className="mt-2 flex-1 text-xs text-ink-700">
                  <span className="font-semibold text-brand-700">Play:</span> {g.play}
                </p>
                <Link href={`/hq/marketing/new?segment=${g.key}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-brand-700">
                  <Send className="h-3.5 w-3.5" /> Target this segment
                </Link>
              </div>
            ))}
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Tiers" description="Rolling 12-month spend" />
            <CardBody>
              <Donut format="number" data={TIERS.map((t) => ({ label: t.name, value: tiers.get(t.key) ?? 0 }))} centerLabel={num(k.members)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Consent reach" description="Members who can be sent marketing, per channel" />
            <CardBody className="space-y-2.5 text-sm">
              {(
                [
                  ["SMS", k.sms, <Smartphone key="s" className="h-4 w-4" />],
                  ["Email", k.email, <Mail key="e" className="h-4 w-4" />],
                  ["Push", k.push, <Bell key="p" className="h-4 w-4" />],
                  ["WhatsApp (utility only)", k.whatsapp, <MessageSquare key="w" className="h-4 w-4" />],
                ] as const
              ).map(([label, n, icon]) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-ink-700">
                      <span className="text-ink-400">{icon}</span>
                      {label}
                    </span>
                    <span className="tnum text-ink-600">
                      <b className="text-ink-900">{num(n)}</b> · {reach(n)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-100">
                    <div className="h-1.5 rounded-full bg-[var(--color-series-1)]" style={{ width: `${k.members ? (n / k.members) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Members" description={`${num(total)} matching`} />
        <div className="border-b border-ink-100 p-4">
          <FilterForm action="/hq/customers">
            <SearchField defaultValue={sp.q} placeholder="Name, mobile, email or member no." />
            <FilterSelect name="segment" label="Segment" defaultValue={sp.segment} options={Object.entries(SEGMENTS).map(([k, v]) => ({ value: k, label: v.name }))} />
            <FilterSelect name="tier" label="Tier" defaultValue={sp.tier} options={TIERS.map((t) => ({ value: t.key, label: t.name }))} />
            {stores.length > 1 && <FilterSelect name="store" label="Home store" defaultValue={sp.store} options={stores.map((x) => ({ value: x.code, label: x.name }))} />}
          </FilterForm>
        </div>
        <Table className="relative">
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Tier</Th>
              <Th className="hidden md:table-cell">Home store</Th>
              <Th align="right" className="hidden sm:table-cell">Visits</Th>
              <Th align="right">Lifetime</Th>
              <Th className="hidden lg:table-cell">Last purchase</Th>
              <Th align="right" className="hidden lg:table-cell">Points</Th>
              <Th className="hidden xl:table-cell">Consent</Th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <EmptyRow cols={8}>
                <Users className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                No members match. Search by full mobile number, email or member number for an exact match.
              </EmptyRow>
            )}
            {members.map((m) => (
              <Tr key={m.id}>
                <Td>
                  <Link href={`/hq/customers/${m.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {m.firstName} {m.lastName ?? ""}
                  </Link>
                  <span className="block font-mono text-xs text-ink-500">{m.memberNo}</span>
                </Td>
                <Td>
                  <TierBadge tier={m.tier} />
                </Td>
                <Td className="hidden text-ink-600 md:table-cell">{m.homeStore?.name ?? "—"}</Td>
                <Td align="right" className="hidden sm:table-cell">{num(m.visits)}</Td>
                <Td align="right">{m.lifetimeCents ? zarWhole(Math.round(m.lifetimeCents / 100) * 100) : "—"}</Td>
                <Td className="hidden whitespace-nowrap text-ink-600 lg:table-cell">{m.lastPurchaseAt ? timeAgo(m.lastPurchaseAt) : <span className="text-ink-400">Joined {fmtDate(m.createdAt)}</span>}</Td>
                <Td align="right" className="hidden lg:table-cell">{num(m.points)}</Td>
                <Td className="hidden xl:table-cell">
                  <span className="flex gap-1.5 text-ink-300" aria-label="Marketing consent">
                    <Smartphone className={`h-4 w-4 ${m.consentSms ? "text-leaf-600" : ""}`} aria-label={m.consentSms ? "SMS: yes" : "SMS: no"} />
                    <Mail className={`h-4 w-4 ${m.consentEmail ? "text-leaf-600" : ""}`} aria-label={m.consentEmail ? "Email: yes" : "Email: no"} />
                    <Bell className={`h-4 w-4 ${m.consentPush ? "text-leaf-600" : ""}`} aria-label={m.consentPush ? "Push: yes" : "Push: no"} />
                    <MessageSquare className={`h-4 w-4 ${m.consentWhatsapp ? "text-leaf-600" : ""}`} aria-label={m.consentWhatsapp ? "WhatsApp: yes" : "WhatsApp: no"} />
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
