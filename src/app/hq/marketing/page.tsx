import Link from "next/link";
import { Megaphone, MessageSquare, Plus, ShieldBan } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { campaignResults, segmentLabel } from "@/server/marketing";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { zar, zarCompact } from "@/lib/money";
import { fmtDateTime, num, addDays } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { Field, Textarea, Select } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { EmptyRow, ViewOnly } from "@/components/hq/ui";
import { CHANNEL_LABEL } from "@/components/hq/tones";
import { importSuppressions } from "./actions";
import { MarketingTabs } from "./tabs";
import type { CampaignStatus, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Campaigns" };

type SP = { tab?: string; status?: string; channel?: string; q?: string; page?: string };
const mask = (v: string) => (v.includes("@") ? v.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : v.replace(/^(\+27\d{2})\d{3}(\d{4})$/, "$1 ••• $2"));

const SOURCE_LABEL: Record<string, string> = { NCC_REGISTRY: "NCC registry", REFUSED: "Refused", STOP_REPLY: "STOP reply", COMPLAINT: "Complaint" };
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s.replaceAll("_", " ").toLowerCase();

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const suppressionTab = sp.tab === "suppression";
  const page = pageParam(sp.page);
  const pageSize = 20;
  const since = addDays(new Date(), -30);
  const visible: Prisma.CampaignWhereInput = scope.kind === "HQ" ? {} : { OR: [{ storeId: null }, { storeId: { in: ids } }] };

  if (suppressionTab) {
    const q = sp.q?.trim().toLowerCase();
    const where: Prisma.SuppressionWhereInput = q ? { value: { contains: q } } : {};
    const [total, rows, bySource] = await Promise.all([
      db.suppression.count({ where }),
      db.suppression.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25 }),
      db.suppression.groupBy({ by: ["source"], _count: true }),
    ]);
    return (
      <>
        <Header canCreate={can(user, "network")} />
        <MarketingTabs current="suppression" />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Do-not-contact list" description={bySource.map((s) => `${sourceLabel(s.source)}: ${num(s._count)}`).join(" · ") || "Empty"} />
            <div className="mt-4 border-y border-ink-100 p-4">
              <FilterForm action="/hq/marketing" keep={{ tab: "suppression" }}>
                <SearchField defaultValue={sp.q} placeholder="Find a number or email" />
              </FilterForm>
            </div>
            <Table stickyFirst className="relative">
              <thead>
                <tr>
                  <Th>Value</Th>
                  <Th>Channel</Th>
                  <Th>Source</Th>
                  <Th className="hidden sm:table-cell">Added</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <EmptyRow cols={4}>Nothing on the list{q ? " matches" : " yet"}.</EmptyRow>}
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-mono text-xs">{mask(r.value)}</Td>
                    <Td>{r.channel ? CHANNEL_LABEL[r.channel] : "All channels"}</Td>
                    <Td>
                      <Badge tone={r.source === "NCC_REGISTRY" ? "blue" : r.source === "COMPLAINT" ? "red" : "neutral"}>{sourceLabel(r.source)}</Badge>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 sm:table-cell">{fmtDateTime(r.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={25} total={total} href={(p) => `/hq/marketing${qs({ tab: "suppression", q: sp.q, page: p })}`} />
          </Card>
          <Card>
            <CardHeader title="Import" description="Cleanse monthly against the NCC opt-out registry (CPA regulations, Apr 2026). Every send is checked against this list." />
            <CardBody>
              {!can(user, "network") ? (
                <ViewOnly>Imports are run by HQ marketing.</ViewOnly>
              ) : (
                <ActionForm action={importSuppressions} resetOnSuccess className="space-y-4">
                  <Field label="Numbers or emails" htmlFor="values" hint="Paste the registry CSV or one per line. SA mobiles in any format.">
                    <Textarea id="values" name="values" className="min-h-40 font-mono text-xs" placeholder={"msisdn\n082 123 4567\n+27831234567"} />
                    <FieldError name="values" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Source" htmlFor="source">
                      <Select id="source" name="source" defaultValue="NCC_REGISTRY">
                        <option value="NCC_REGISTRY">NCC registry</option>
                        <option value="REFUSED">Refused / objected</option>
                        <option value="COMPLAINT">Complaint</option>
                      </Select>
                    </Field>
                    <Field label="Channel" htmlFor="channel">
                      <Select id="channel" name="channel" defaultValue="">
                        <option value="">All channels</option>
                        <option value="SMS">SMS</option>
                        <option value="EMAIL">Email</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="PUSH">Push</option>
                      </Select>
                    </Field>
                  </div>
                  <SubmitButton pendingLabel="Importing…" className="w-full">
                    <ShieldBan className="h-4 w-4" /> Add to do-not-contact list
                  </SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  const q = sp.q?.trim();
  const where: Prisma.CampaignWhereInput = {
    AND: [
      visible,
      ["DRAFT", "SCHEDULED", "SENT", "CANCELLED"].includes(sp.status ?? "") ? { status: sp.status as CampaignStatus } : {},
      sp.channel && sp.channel in CHANNEL_LABEL ? { channel: sp.channel as never } : {},
      q ? { name: { contains: q, mode: "insensitive" } } : {},
    ],
  };
  const [total, campaigns, recent] = await Promise.all([
    db.campaign.count({ where }),
    db.campaign.findMany({ where, include: { store: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.campaign.aggregate({ where: { AND: [visible, { status: "SENT", sentAt: { gte: since } }] }, _count: true, _sum: { sentCount: true, costCents: true } }),
  ]);
  const cids = campaigns.map((c) => c.id);
  const [results, failed] = await Promise.all([
    campaignResults(cids),
    cids.length ? db.messageLog.groupBy({ by: ["campaignId"], where: { campaignId: { in: cids }, status: "FAILED" }, _count: true }) : [],
  ]);
  const failedBy = new Map(failed.map((f) => [f.campaignId, f._count]));
  const recentRevenue = [...results.values()].reduce((s, r) => s + r.revenueCents, 0);
  const href = (p: Record<string, string | number | undefined>) => `/hq/marketing${qs({ ...sp, ...p })}`;

  return (
    <>
      <Header canCreate={can(user, "view")} />
      <MarketingTabs current="campaigns" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Campaigns sent · 30 days" value={num(recent._count)} />
        <Stat label="Messages delivered · 30 days" value={num(recent._sum.sentCount ?? 0)} />
        <Stat label="Attributed revenue" value={zarCompact(recentRevenue)} sub="campaigns on this page" />
        <Stat label="Spend · 30 days" value={zarCompact(recent._sum.costCents ?? 0)} sub="from the marketing fund" />
      </div>
      <Card>
        <div className="border-b border-ink-100 p-4">
          <FilterForm action="/hq/marketing">
            <SearchField defaultValue={sp.q} placeholder="Search campaigns" />
            <FilterSelect name="status" label="Status" defaultValue={sp.status} options={[{ value: "DRAFT", label: "Draft" }, { value: "SCHEDULED", label: "Scheduled" }, { value: "SENT", label: "Sent" }, { value: "CANCELLED", label: "Cancelled" }]} />
            <FilterSelect name="channel" label="Channel" defaultValue={sp.channel} options={Object.entries(CHANNEL_LABEL).map(([value, label]) => ({ value, label }))} />
          </FilterForm>
        </div>
        <Table stickyFirst className="relative">
          <thead>
            <tr>
              <Th>Campaign</Th>
              <Th className="hidden md:table-cell">Audience</Th>
              <Th>Status</Th>
              <Th align="right" className="hidden sm:table-cell">Sent</Th>
              <Th align="right">Revenue</Th>
              <Th align="right" className="hidden lg:table-cell">ROI</Th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && (
              <EmptyRow cols={6}>
                <Megaphone className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                No campaigns yet.
              </EmptyRow>
            )}
            {campaigns.map((c) => {
              const r = results.get(c.id);
              const f = failedBy.get(c.id) ?? 0;
              return (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/hq/marketing/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {c.name}
                    </Link>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                      <Badge tone={c.channel === "WHATSAPP" ? "amber" : "neutral"}>{CHANNEL_LABEL[c.channel]}</Badge>
                      <span className="max-w-72 truncate">{c.message}</span>
                    </span>
                  </Td>
                  <Td className="hidden text-ink-600 md:table-cell">
                    {segmentLabel(c.segment)}
                    {c.store && <span className="block text-xs text-ink-500">Home store: {c.store.name}</span>}
                  </Td>
                  <Td>
                    <StatusBadge status={c.status} />
                    <span className="mt-0.5 block whitespace-nowrap text-xs text-ink-500">{c.sentAt ? fmtDateTime(c.sentAt) : c.scheduledAt ? fmtDateTime(c.scheduledAt) : ""}</span>
                  </Td>
                  <Td align="right" className="hidden sm:table-cell">
                    {c.status === "SENT" ? num(c.sentCount) : "—"}
                    {c.status === "SENT" && <span className="block text-xs text-ink-500">{num(c.suppressedCount)} suppressed</span>}
                    {f > 0 && <span className="block text-xs font-medium text-rose-600">{num(f)} failed</span>}
                  </Td>
                  <Td align="right">
                    {r ? zarCompact(r.revenueCents) : "—"}
                    {r && <span className="block text-xs text-ink-500">{num(r.orders)} sales</span>}
                  </Td>
                  <Td align="right" className="hidden lg:table-cell">
                    {c.costCents && r ? `${(r.revenueCents / c.costCents).toFixed(1)}×` : "—"}
                    {c.costCents > 0 && <span className="block text-xs text-ink-500">cost {zar(c.costCents)}</span>}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}

function Header({ canCreate }: { canCreate: boolean }) {
  return (
    <PageHeader
      overline="Members"
      title="Campaigns"
      description="SMS, email and push to Rewards members, with consent checked per channel, the do-not-contact list applied, CPA send windows enforced and every sale attributed."
      actions={
        <>
          <ButtonLink href="/hq/messages" variant="outline">
            <MessageSquare className="h-4 w-4" /> Message log
          </ButtonLink>
          {canCreate && (
            <ButtonLink href="/hq/marketing/new">
              <Plus className="h-4 w-4" /> New campaign
            </ButtonLink>
          )}
        </>
      }
    />
  );
}
