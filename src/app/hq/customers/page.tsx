import Link from "next/link";
import { Mail, MessageSquare, Smartphone, Bell, Users, Send } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { crmKpis, memberWhere, segmentCounts, tierCounts } from "@/server/hq/crm";
import { qs } from "@/server/hq/form";
import { looserMemberQuery, parseMemberQuery } from "@/lib/member-search";
import { TIERS, fmtPoints } from "@/lib/loyalty-rules";
import { SEGMENTS } from "@/lib/rfm";
import { zarWhole, pct } from "@/lib/money";
import { fmtDate, num, timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TierBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr, SortableTh, TableEmpty, sortParams } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Donut } from "@/components/charts/donut";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { SavedViews } from "@/components/admin/saved-views";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Members & CRM" };

type SP = {
  q?: string;
  tier?: string;
  segment?: string;
  store?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

const SORTS = ["last", "name", "tier", "visits", "lifetime", "points", "joined"] as const;
const ORDER_BY: Record<(typeof SORTS)[number], (d: "asc" | "desc") => Prisma.CustomerOrderByWithRelationInput[]> = {
  last: (d) => [{ lastPurchaseAt: { sort: d, nulls: "last" } }, { memberNo: "asc" }],
  name: (d) => [{ firstName: d }, { lastName: d }, { memberNo: "asc" }],
  tier: (d) => [{ tier: d }, { memberNo: "asc" }],
  visits: (d) => [{ visits: d }, { memberNo: "asc" }],
  lifetime: (d) => [{ lifetimeCents: d }, { memberNo: "asc" }],
  points: (d) => [{ points: d }, { memberNo: "asc" }],
  joined: (d) => [{ createdAt: d }, { memberNo: "asc" }],
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const s = scope.kind === "HQ" ? null : ids;
  const page = pageParam(sp.page);
  const pageSize = 25;
  const where = memberWhere(s, sp);
  // A search lists exact matches by member number; otherwise the most recent shoppers first. Headers override both.
  const { sort, dir } = sortParams(SORTS, sp.sort, sp.dir, "last", "desc");
  const orderBy = sp.q && !sp.sort ? [{ memberNo: "asc" as const }] : ORDER_BY[sort](dir);
  const [k, segments, tiers, total, members, stores] = await Promise.all([
    crmKpis(s),
    segmentCounts(s),
    tierCounts(s),
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      select: {
        id: true,
        memberNo: true,
        firstName: true,
        lastName: true,
        tier: true,
        visits: true,
        lifetimeCents: true,
        lastPurchaseAt: true,
        points: true,
        consentSms: true,
        consentEmail: true,
        consentWhatsapp: true,
        consentPush: true,
        createdAt: true,
        homeStore: { select: { name: true, code: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.store.findMany({
      where: { id: { in: ids }, kind: "RETAIL" },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const href = (p: Record<string, string | number | undefined>) => `/hq/customers${qs({ ...sp, ...p })}`;
  const sortHref = (key: string, d: "asc" | "desc") => href({ sort: key, dir: d, page: undefined });
  const reach = (n: number) => (k.members ? pct(n / k.members, 0) : "—");
  const searching = !!sp.q?.trim();
  // Nothing found for a name: likely a typo in one word — offer a looser search.
  const looser = searching && total === 0 ? looserMemberQuery(parseMemberQuery(sp.q)) : null;

  const membersCard = (
    <Card className={searching ? undefined : "mt-6"}>
      <CardHeader title={searching ? `Members matching “${sp.q!.trim()}”` : "Members"} description={`${num(total)} matching`} />
      <div className="space-y-3 border-b border-ink-100 p-4">
        <FilterForm action="/hq/customers" keep={{ q: sp.q, sort: sp.sort, dir: sp.dir }}>
          <FilterSelect
            name="segment"
            label="Segment"
            defaultValue={sp.segment}
            options={Object.entries(SEGMENTS).map(([k, v]) => ({
              value: k,
              label: v.name,
            }))}
          />
          <FilterSelect name="tier" label="Tier" defaultValue={sp.tier} options={TIERS.map((t) => ({ value: t.key, label: t.name }))} />
          {stores.length > 1 && <FilterSelect name="store" label="Home store" defaultValue={sp.store} options={stores.map((x) => ({ value: x.code, label: x.name }))} />}
        </FilterForm>
        <SavedViews pageKey="hq-members" userKey={user.id} />
      </div>
      <Table className="relative" stickyFirst minWidth="64rem">
        <thead>
          <tr>
            <SortableTh label="Member" sortKey="name" sort={sp.q && !sp.sort ? "" : sort} dir={dir} href={sortHref} />
            <SortableTh label="Tier" sortKey="tier" sort={sort} dir={dir} href={sortHref} />
            <Th>Home store</Th>
            <SortableTh label="Visits" sortKey="visits" sort={sort} dir={dir} href={sortHref} align="right" />
            <SortableTh label="Lifetime" sortKey="lifetime" sort={sort} dir={dir} href={sortHref} align="right" />
            <SortableTh label="Last purchase" sortKey="last" sort={sp.q && !sp.sort ? "" : sort} dir={dir} href={sortHref} />
            <SortableTh label="Points" sortKey="points" sort={sort} dir={dir} href={sortHref} align="right" />
            <Th>Consent</Th>
          </tr>
        </thead>
        <tbody>
          {members.length === 0 && (
            <TableEmpty
              cols={8}
              icon={<Users className="h-5 w-5" aria-hidden />}
              title="No members match"
              action={
                looser ? (
                  <Link href={href({ q: looser, page: undefined })} className="text-sm font-semibold text-brand-700 hover:underline">
                    Search for “{looser}” instead →
                  </Link>
                ) : undefined
              }
            >
              Names work in any order; a mobile number, the last four digits of one, or a member number (with or without HH) all find a member.
            </TableEmpty>
          )}
          {members.map((m) => (
            <Tr key={m.id} href={`/hq/customers/${m.id}`}>
              <Td>
                <Link href={`/hq/customers/${m.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                  {m.firstName} {m.lastName ?? ""}
                </Link>
                <span className="block font-mono text-xs text-ink-500">{m.memberNo}</span>
              </Td>
              <Td>
                <TierBadge tier={m.tier} />
              </Td>
              <Td className="text-ink-600">{m.homeStore?.name ?? "—"}</Td>
              <Td align="right">{num(m.visits)}</Td>
              <Td align="right">{m.lifetimeCents ? zarWhole(Math.round(m.lifetimeCents / 100) * 100) : "—"}</Td>
              <Td className="whitespace-nowrap text-ink-600">{m.lastPurchaseAt ? timeAgo(m.lastPurchaseAt) : <span className="text-ink-500">Joined {fmtDate(m.createdAt)}</span>}</Td>
              <Td align="right">{num(m.points)}</Td>
              <Td>
                <span
                  className="flex gap-1.5 text-ink-500"
                  role="img"
                  aria-label={`Marketing consent: SMS ${m.consentSms ? "yes" : "no"}, email ${m.consentEmail ? "yes" : "no"}, push ${m.consentPush ? "yes" : "no"}, WhatsApp ${m.consentWhatsapp ? "yes" : "no"}`}
                >
                  <Smartphone className={`h-4 w-4 ${m.consentSms ? "text-leaf-600" : ""}`} aria-hidden />
                  <Mail className={`h-4 w-4 ${m.consentEmail ? "text-leaf-600" : ""}`} aria-hidden />
                  <Bell className={`h-4 w-4 ${m.consentPush ? "text-leaf-600" : ""}`} aria-hidden />
                  <MessageSquare className={`h-4 w-4 ${m.consentWhatsapp ? "text-leaf-600" : ""}`} aria-hidden />
                </span>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
    </Card>
  );

  return (
    <>
      <PageHeader
        overline={scope.kind === "REGION" ? `Region · ${user.region?.name}` : "Herbal Holland Rewards"}
        title="Members & CRM"
        description={`${scope.kind === "HQ" ? "Every Rewards member across the network" : "Rewards members whose home store is in your region"}, segmented by recency and frequency. Consent is tracked per channel (POPIA s69) and every message respects the CPA contact windows.`}
      />
      {/* Finding a member is the most common job here: the search sits at the top, and its results come first. */}
      <FilterForm
        action="/hq/customers"
        keep={{
          segment: sp.segment,
          tier: sp.tier,
          store: sp.store,
          sort: sp.sort,
          dir: sp.dir,
        }}
        className="mb-6"
      >
        <SearchField defaultValue={sp.q} label="Find a member" placeholder="Find a member: name (any order), mobile or its last digits, member no." className="max-w-2xl" />
      </FilterForm>
      {searching && membersCard}
      <div className={searching ? "mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" : "grid grid-cols-2 gap-3 lg:grid-cols-4"}>
        <Stat label="Members" value={num(k.members)} sub={`${fmtPoints(k.points)} outstanding`} />
        <Stat label="Active · 30 days" value={num(k.active30)} sub={`${reach(k.active30)} of members`} />
        <Stat label="New this month" value={num(k.newMonth)} />
        <Stat label="Reachable by SMS" value={num(k.sms)} sub={`${reach(k.sms)} opted in`} />
      </div>

      {!searching && (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="min-w-0 xl:col-span-2">
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
                <Donut
                  format="number"
                  data={TIERS.map((t) => ({
                    label: t.name,
                    value: tiers.get(t.key) ?? 0,
                  }))}
                  centerLabel={num(k.members)}
                />
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
                        <span className="text-ink-500">{icon}</span>
                        {label}
                      </span>
                      <span className="tnum text-ink-600">
                        <b className="text-ink-900">{num(n)}</b> · {reach(n)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink-100">
                      <div
                        className="h-1.5 rounded-full bg-[var(--color-series-1)]"
                        style={{
                          width: `${k.members ? (n / k.members) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {!searching && membersCard}
    </>
  );
}
