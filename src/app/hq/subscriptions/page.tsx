import Link from "next/link";
import { Pause, Play, Plus, Repeat, X } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { hqTotals } from "@/server/shop/subscriptions";
import { allowanceLabel, PERIOD_ADVERB } from "@/lib/subscriptions";
import { zar, zarWhole } from "@/lib/money";
import { fmtDate, num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ConfirmAction } from "@/components/ui/action-form";
import { Flash } from "@/components/hq/flash";
import { EmptyRow, Pill } from "@/components/hq/ui";
import { actOnSubscription } from "./actions";

export const metadata = { title: "Subscriptions" };

const PAGE_SIZE = 20;
const PLAN_TONE = { DRAFT: ["Draft", "neutral"], ACTIVE: ["Live", "green"], ARCHIVED: ["Archived", "dark"] } as const;
const SUB_TONE = { ACTIVE: ["Active", "green"], PAUSED: ["Paused", "amber"], PAST_DUE: ["Payment overdue", "red"], CANCELLED: ["Cancelled", "neutral"] } as const;

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; m?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  // HQ sees everything: no store filter, so the id list never hits D1's bound-parameter limit.
  const ids = scope.kind === "HQ" ? null : await scopedStoreIds(scope);
  const tab = sp.tab === "members" ? "members" : "plans";
  const page = pageParam(sp.page);
  const subWhere = ids ? { storeId: { in: ids } } : {};
  const edit = can(user, "network");

  const [totals, planCount, subCount, plans, subs] = await Promise.all([
    hqTotals(ids),
    db.subscriptionPlan.count(),
    db.subscription.count({ where: subWhere }),
    tab === "plans" ? db.subscriptionPlan.findMany({ orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { name: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { _count: { select: { subscriptions: { where: { status: { not: "CANCELLED" } } } } } } }) : [],
    tab === "members" ? db.subscription.findMany({ where: subWhere, orderBy: [{ status: "asc" }, { periodEnd: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { plan: { select: { name: true, unit: true, allowance: true, itemWord: true, period: true } } } }) : [],
  ]);
  const [customers, stores] = subs.length
    ? await Promise.all([
        db.customer.findMany({ where: { id: { in: [...new Set(subs.map((s) => s.customerId))] } }, select: { id: true, firstName: true, lastName: true, memberNo: true } }),
        db.store.findMany({ where: { id: { in: [...new Set(subs.map((s) => s.storeId))] } }, select: { id: true, name: true } }),
      ])
    : [[], []];
  const who = new Map(customers.map((c) => [c.id, c]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const href = (t: string, p?: number) => `/hq/subscriptions${qs({ tab: t === "plans" ? undefined : t, page: p && p > 1 ? p : undefined })}`;

  return (
    <>
      <PageHeader
        overline="Launch programme"
        title="Subscriptions"
        description="Club plans for adult members: a set allowance each period, paid as its own order, collected at the member's store or delivered. The allowance opens only once the period is paid."
        actions={
          edit && (
            <ButtonLink href="/hq/subscriptions/new">
              <Plus className="h-4 w-4" /> New plan
            </ButtonLink>
          )
        }
      />
      <Flash message={sp.m} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active members" value={num(totals.active)} sub={`${num(totals.paused)} paused · ${num(totals.pastDue)} overdue`} />
        <Stat label="Monthly recurring" value={zarWhole(totals.mrrCents)} sub="Active plans, VAT incl." />
        <Stat label="To collect this week" value={num(totals.toCollect)} sub="Paid allowances not yet collected" />
        <Stat label="Awaiting payment" value={num(totals.unpaid)} sub="Periods raised, not yet paid" />
      </div>
      <TabLinks className="mb-4" current={href(tab)} tabs={[{ label: "Plans", count: planCount, href: href("plans") }, { label: "Members", count: subCount, href: href("members") }]} />
      <Card>
        {tab === "plans" ? (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th>Allowance</Th>
                <Th align="right">Price</Th>
                <Th align="right" className="hidden sm:table-cell">Members</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 && (
                <EmptyRow cols={5}>
                  <Repeat className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                  No plans yet. Create one, price it and set it live.
                </EmptyRow>
              )}
              {plans.map((p) => (
                <Tr key={p.id}>
                  <Td className="min-w-44">
                    <Link href={`/hq/subscriptions/${p.id}`} className="font-medium text-ink-900 hover:text-brand-700">
                      {p.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-ink-500">{p.slug}</span>
                      {p.rollover && <Pill>Carries over</Pill>}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">{allowanceLabel(p.unit, p.allowance, p.itemWord)} {PERIOD_ADVERB[p.period]}</Td>
                  <Td align="right" className="tnum">{zar(p.priceCents)}</Td>
                  <Td align="right" className="hidden sm:table-cell">{num(p._count.subscriptions)}</Td>
                  <Td>
                    <Badge tone={PLAN_TONE[p.status][1]} dot>{PLAN_TONE[p.status][0]}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Plan</Th>
                <Th className="hidden md:table-cell">Store</Th>
                <Th className="hidden sm:table-cell">Period ends</Th>
                <Th>Status</Th>
                {edit && <Th align="right">Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && <EmptyRow cols={edit ? 6 : 5}>No members on a plan yet.</EmptyRow>}
              {subs.map((s) => {
                const c = who.get(s.customerId);
                return (
                  <Tr key={s.id}>
                    <Td className="min-w-40">
                      <span className="font-medium text-ink-900">{c ? `${c.firstName} ${c.lastName}`.trim() : "Member"}</span>
                      {c?.memberNo && <span className="block font-mono text-xs text-ink-500">{c.memberNo}</span>}
                    </Td>
                    <Td>
                      {s.plan.name}
                      <span className="block text-xs text-ink-500">
                        {allowanceLabel(s.plan.unit, s.plan.allowance, s.plan.itemWord)} · {zar(s.priceCents)} {PERIOD_ADVERB[s.plan.period]}
                      </span>
                    </Td>
                    <Td className="hidden md:table-cell">
                      {storeName.get(s.storeId) ?? "—"}
                      {s.fulfilment === "COURIER" && <span className="block text-xs text-ink-500">Delivered</span>}
                    </Td>
                    <Td className="hidden whitespace-nowrap sm:table-cell">
                      {fmtDate(s.periodEnd)}
                      {s.cancelAtPeriodEnd && s.status !== "CANCELLED" && <span className="block text-xs text-ink-500">Ends then</span>}
                    </Td>
                    <Td>
                      <Badge tone={SUB_TONE[s.status][1]} dot>{SUB_TONE[s.status][0]}</Badge>
                    </Td>
                    {edit && (
                      <Td align="right">
                        <span className="inline-flex flex-wrap justify-end gap-2">
                          {(s.status === "ACTIVE" || s.status === "PAST_DUE") && (
                            <ConfirmAction action={actOnSubscription.bind(null, s.id, "pause")} label="Pause" title="Pause this plan?" confirmLabel="Pause" size="sm" icon={<Pause className="h-4 w-4" />}>
                              Nothing is billed while it's paused. A period already paid for can still be collected.
                            </ConfirmAction>
                          )}
                          {s.status === "PAUSED" && (
                            <ConfirmAction action={actOnSubscription.bind(null, s.id, "resume")} label="Resume" title="Resume this plan?" confirmLabel="Resume" size="sm" icon={<Play className="h-4 w-4" />}>
                              A new period starts now and the member gets a payment link for it.
                            </ConfirmAction>
                          )}
                          {s.status !== "CANCELLED" && !s.cancelAtPeriodEnd && (
                            <ConfirmAction action={actOnSubscription.bind(null, s.id, "cancel")} label="Cancel" title="Cancel this plan?" confirmLabel="Cancel plan" variant="danger" size="sm" icon={<X className="h-4 w-4" />}>
                              Billing stops. Anything already paid for can still be collected until the period ends.
                            </ConfirmAction>
                          )}
                        </span>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={tab === "plans" ? planCount : subCount} href={(p) => href(tab, p)} />
      </Card>
    </>
  );
}
