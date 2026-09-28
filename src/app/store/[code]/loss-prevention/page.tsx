import { ChevronDown, ShieldCheck, X } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { visibleAlerts } from "@/server/loss";
import { hrefWith, plural, sp1 } from "@/server/store/rules";
import { addDays } from "@/lib/format";
import { zar, zarCompact } from "@/lib/money";
import { PageHeader, EmptyState, Notice } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { TabLinks } from "@/components/ui/tabs";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { BarList } from "@/components/charts/bar-list";
import { Chips } from "@/components/store/ui";
import { MiniStat } from "@/components/hq/ui";
import { AlertTable, type AlertRow } from "@/components/loss/alert-table";
import { WatchList } from "@/components/loss/watch-list";
import { ACTIVE, CLOSED, ROLE_LABEL, SEVERITIES, SEVERITY, VIEWS, VIEW_KEYS, isSeverity, statusWhere, viewOf, type View } from "@/components/loss/labels";
import { RULE_KEYS, isRule, ruleLabel } from "@/components/loss/rules";
import { ALERT_ROLES } from "./access";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Loss prevention" };
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;
type Where = (...parts: Prisma.AlertWhereInput[]) => Prisma.AlertWhereInput;

const EMPTY_TITLE: Record<View, string> = { active: "Nothing open at this store", resolved: "Nothing resolved yet", dismissed: "Nothing dismissed", all: "No alerts yet" };
const EMPTY_WORD: Record<View, string> = { active: "open", resolved: "resolved", dismissed: "dismissed", all: "" };
const sum = <T extends { _count: number }>(xs: T[], keep: (x: T) => boolean = () => true) => xs.filter(keep).reduce((t, x) => t + x._count, 0);

export default async function LossPreventionPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(ALERT_ROLES);
  const store = await storeForUser(user, code);
  const path = `/store/${store.code}/loss-prevention`;
  // Every query: this store's alerts, never one about the person looking.
  const vis = visibleAlerts(user, [store.id]);
  const all: Where = (...parts) => ({ AND: [vis, ...parts] });
  const now = new Date();
  const view = viewOf(sp1(sp.status));
  const sevParam = sp1(sp.severity);
  const severity = isSeverity(sevParam) ? sevParam : null;
  const ruleParam = sp1(sp.rule);
  const rule = isRule(ruleParam) ? ruleParam : null;
  const personId = sp1(sp.person);
  const page = pageParam(sp.page);

  const person = personId ? await profile(all, personId, now) : null;
  const f = {
    status: statusWhere(view),
    severity: severity ? { severity } : {},
    rule: rule ? { rule } : {},
    person: person ? { userId: person.id } : {},
  };
  const where = all(f.status, f.severity, f.rule, f.person);
  const [total, alerts, byStatus, bySeverity, byRule, open, closed30, settings] = await Promise.all([
    db.alert.count({ where }),
    db.alert.findMany({
      where,
      // The open queue is worked highest severity first; history reads newest first.
      orderBy: view === "active" ? [{ severity: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.alert.groupBy({ by: ["status"], where: all(f.severity, f.rule, f.person), _count: true }),
    db.alert.groupBy({ by: ["severity"], where: all(f.status, f.rule, f.person), _count: true }),
    db.alert.groupBy({ by: ["rule"], where: all(f.status, f.severity, f.person), _count: true }),
    db.alert.groupBy({ by: ["status", "severity"], where: all({ status: { in: ACTIVE } }), _count: true, _sum: { amountCents: true } }),
    db.alert.groupBy({ by: ["status"], where: all({ status: { in: CLOSED }, closedAt: { gte: addDays(now, -30) } }), _count: true }),
    getSettings(),
  ]);
  const ids = [...new Set(alerts.flatMap((a) => (a.userId ? [a.userId] : [])))];
  const names = new Map((ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const rows: AlertRow[] = alerts.map((a) => ({
    id: a.id,
    href: `${path}/${a.id}`,
    severity: a.severity,
    title: a.title,
    ruleLabel: ruleLabel(a.rule),
    status: a.status,
    amountCents: a.amountCents,
    createdAt: a.createdAt,
    person: a.userId ? { name: names.get(a.userId) ?? "Former staff member", href: hrefWith(path, {}, { person: a.userId }) } : null,
  }));

  const keep: SP = { ...sp, person: person?.id }; // links keep the filters, but not a profile that isn't available
  const tabHref = (v: View) => hrefWith(path, keep, { status: v === "active" ? null : v, page: null });
  const viewCount = (v: View) => {
    const s = VIEWS[v].statuses;
    return sum(byStatus, (g) => !s || s.includes(g.status));
  };
  const ruleCount = new Map(byRule.map((g) => [g.rule, g._count]));
  const ruleChips = RULE_KEYS.filter((r) => ruleCount.get(r) || r === rule);
  const filtered = !!(severity || rule || person);
  const resolved30 = sum(closed30, (g) => g.status === "RESOLVED");
  const dismissed30 = sum(closed30, (g) => g.status === "DISMISSED");
  const highOpen = sum(open, (g) => g.severity === "HIGH");

  return (
    <>
      <PageHeader
        overline={`Insight · ${store.name}`}
        title="Loss prevention"
        description="Automatic checks on cash-ups, banking, refunds, stock and the tills — every night, at each shift close and when cash is banked. Each alert shows its evidence, and nobody sees an alert about themselves."
      />

      {personId && !person && <Notice className="mb-6">That profile isn&apos;t available here, so everyone&apos;s alerts are shown.</Notice>}

      {person ? (
        <PersonCard p={person} clearHref={hrefWith(path, keep, { person: null, page: null })} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Open alerts" value={sum(open).toLocaleString()} sub={`${sum(open, (g) => g.status === "INVESTIGATING").toLocaleString()} being investigated`} />
          <Stat label="High severity, open" value={highOpen.toLocaleString()} sub={highOpen ? "deal with these first" : "none waiting"} />
          <Stat label="Value at risk, open" value={zarCompact(open.reduce((t, g) => t + (g._sum.amountCents ?? 0), 0))} sub="cash, refunds and stock" />
          <Stat label="Closed, last 30 days" value={(resolved30 + dismissed30).toLocaleString()} sub={`${resolved30} resolved · ${plural(dismissed30, "false alarm")}`} />
        </div>
      )}

      <TabLinks className="mt-6" current={tabHref(view)} tabs={VIEW_KEYS.map((v) => ({ href: tabHref(v), label: VIEWS[v].label, count: viewCount(v) }))} />
      <Card className="mt-4 min-w-0">
        <div className="space-y-3 border-b border-ink-100 p-4 sm:px-5">
          <Chips
            label="Severity"
            current={severity ?? "ALL"}
            items={[
              { key: "ALL", label: "Any severity", count: sum(bySeverity), href: hrefWith(path, keep, { severity: null, page: null }) },
              ...SEVERITIES.map((s) => ({ key: s, label: SEVERITY[s].label, tone: SEVERITY[s].tone, count: sum(bySeverity, (g) => g.severity === s), href: hrefWith(path, keep, { severity: s, page: null }) })),
            ]}
          />
          {ruleChips.length > 0 && (
            <Chips
              label="Rule"
              current={rule ?? "ALL"}
              items={[
                { key: "ALL", label: "All rules", href: hrefWith(path, keep, { rule: null, page: null }) },
                ...ruleChips.map((r) => ({ key: r, label: ruleLabel(r), count: ruleCount.get(r) ?? 0, href: hrefWith(path, keep, { rule: r, page: null }) })),
              ]}
            />
          )}
        </div>
        {rows.length > 0 ? (
          <AlertTable rows={rows} />
        ) : severity || rule ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
            title="No alerts match these filters"
            action={
              <ButtonLink href={hrefWith(path, keep, { severity: null, rule: null, page: null })} variant="outline" size="sm">
                Clear filters
              </ButtonLink>
            }
          >
            Try another status, severity or rule.
          </EmptyState>
        ) : person ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
            title={`No ${EMPTY_WORD[view] ? `${EMPTY_WORD[view]} ` : ""}alerts for ${person.firstName}`}
            action={
              view !== "all" && (
                <ButtonLink href={hrefWith(path, keep, { status: "all", page: null })} variant="outline" size="sm">
                  See all their alerts
                </ButtonLink>
              )
            }
          />
        ) : (
          <EmptyState icon={<ShieldCheck className="h-5 w-5" aria-hidden />} title={EMPTY_TITLE[view]} action={<WatchList settings={settings} className="mx-auto mt-2 max-w-3xl" />}>
            The checks run every night, at each shift close and when cash is banked. This is what they watch for:
          </EmptyState>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, keep, { page: p })} />
        </div>
      </Card>

      {(rows.length > 0 || filtered) && (
        <Card className="mt-6">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block font-display text-[0.95rem] font-semibold text-ink-900">What the checks watch</span>
                <span className="mt-0.5 block text-[0.8rem] text-ink-500">
                  High severity is emailed at once to the owner and area manager; the rest arrive in a daily digest. Thresholds are set by HQ.
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-ink-100 px-5 py-5">
              <WatchList settings={settings} />
            </div>
          </details>
        </Card>
      )}
    </>
  );
}

type Profile = NonNullable<Awaited<ReturnType<typeof profile>>>;

/** A person's alerts at this store. Only someone the viewer has a visible alert about — so never the viewer themselves. */
async function profile(all: Where, id: string, now: Date) {
  if (!(await db.alert.count({ where: all({ userId: id }) }))) return null;
  const [u, groups, openNow] = await Promise.all([
    db.user.findUnique({ where: { id }, select: { name: true, role: true, active: true, store: { select: { name: true } } } }),
    db.alert.groupBy({ by: ["rule", "status"], where: all({ userId: id, createdAt: { gte: addDays(now, -90) } }), _count: true, _sum: { amountCents: true } }),
    db.alert.count({ where: all({ userId: id, status: { in: ACTIVE } }) }),
  ]);
  const byRule = new Map<string, { count: number; cents: number }>();
  for (const g of groups) {
    const r = byRule.get(g.rule) ?? { count: 0, cents: 0 };
    r.count += g._count;
    if (g.status !== "DISMISSED") r.cents += g._sum.amountCents ?? 0; // a false alarm put nothing at risk
    byRule.set(g.rule, r);
  }
  const rules = [...byRule].map(([rule, r]) => ({ rule, ...r })).sort((a, b) => b.count - a.count || b.cents - a.cents);
  return {
    id,
    name: u?.name ?? "Former staff member",
    firstName: u?.name.split(/\s+/)[0] || "They",
    detail: [u ? ROLE_LABEL[u.role] ?? u.role : null, u?.store?.name].filter(Boolean).join(" · "),
    active: u?.active ?? false,
    openNow,
    alerts90: rules.reduce((t, r) => t + r.count, 0),
    dismissed90: sum(groups, (g) => g.status === "DISMISSED"),
    atRisk90: rules.reduce((t, r) => t + r.cents, 0),
    rules,
  };
}

function PersonCard({ p, clearHref }: { p: Profile; clearHref: string }) {
  return (
    <Card>
      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <Avatar name={p.name} className="h-11 w-11 text-sm" />
            <div className="min-w-0 flex-1">
              <div className="eyebrow text-brand-700">Person profile</div>
              <h2 className="font-display text-lg font-semibold text-ink-950">{p.name}</h2>
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
                {p.detail || "Staff member"}
                {!p.active && <Badge>No longer active</Badge>}
              </p>
            </div>
            <ButtonLink href={clearHref} variant="ghost" size="sm" className="shrink-0">
              <X className="h-4 w-4" aria-hidden />
              Everyone
            </ButtonLink>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniStat label="Alerts, 90 days" value={p.alerts90.toLocaleString()} sub={p.dismissed90 ? plural(p.dismissed90, "false alarm") : undefined} />
            <MiniStat label="At risk, 90 days" value={zarCompact(p.atRisk90)} sub="excl. false alarms" />
            <MiniStat label="Open now" value={p.openNow.toLocaleString()} />
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 text-[0.78rem] font-semibold text-ink-700">Their alerts by rule, last 90 days</div>
          {p.rules.length ? (
            <BarList
              format="number"
              rows={p.rules.map((r) => ({
                label: ruleLabel(r.rule),
                value: r.count,
                sub: r.cents ? zar(r.cents) : undefined,
                tip: `${ruleLabel(r.rule)}\n${plural(r.count, "alert")}${r.cents ? `\n${zar(r.cents)} at risk` : ""}`,
              }))}
            />
          ) : (
            <p className="text-sm text-ink-500">No alerts in the last 90 days.</p>
          )}
        </div>
      </div>
      <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
        An alert is a prompt to check, not a finding. {p.firstName} doesn&apos;t see these alerts, so hear their side before drawing conclusions.
      </p>
    </Card>
  );
}
