import Link from "next/link";
import { Play, ShieldCheck } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { RULES, visibleAlerts } from "@/server/loss";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { zar, zarCompact } from "@/lib/money";
import { addDays, dayKey, fmtDay, num, startOfDaySA, weekdaySA } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ColumnChart } from "@/components/charts/bar-chart";
import { BarList } from "@/components/charts/bar-list";
import { FilterForm, FilterSelect } from "@/components/hq/filter-form";
import { ActionButton } from "@/components/ui/action-form";
import { ViewOnly } from "@/components/hq/ui";
import { AlertTable, type AlertRow } from "@/components/loss/alert-table";
import { WatchList } from "@/components/loss/watch-list";
import { ACTIVE, SEVERITIES, SEVERITY, VIEWS, isSeverity, statusWhere, viewOf } from "@/components/loss/labels";
import { RULE_KEYS, isRule, ruleLabel } from "@/components/loss/rules";
import { RulesForm } from "./rules-form";
import { runChecks } from "./actions";
import type { AlertSeverity, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Loss prevention" };
const PAGE_SIZE = 25;
type SP = { status?: string; severity?: string; rule?: string; page?: string };

export default async function HqLossPreventionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope); // area managers: their region only
  // Every query: stores in scope, never an alert about the person looking.
  const vis = visibleAlerts(user, ids);
  const all = (...parts: Prisma.AlertWhereInput[]): Prisma.AlertWhereInput => ({ AND: [vis, ...parts] });
  const admin = can(user, "admin");
  const now = new Date();
  const monthStart = new Date(`${dayKey(now).slice(0, 7)}-01T00:00:00+02:00`);
  const monday = addDays(startOfDaySA(now), -((weekdaySA(now) + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(monday, -7 * (7 - i));
    return { start, end: addDays(start, 7) };
  });

  const view = viewOf(sp.status);
  const severity = sp.severity && isSeverity(sp.severity) ? sp.severity : null;
  const rule = sp.rule && isRule(sp.rule) ? sp.rule : null;
  const page = pageParam(sp.page);
  const where = all(statusWhere(view), severity ? { severity } : {}, rule ? { rule } : {});

  const [open, resolvedMonth, dismissedMonth, perWeek, total, alerts, settings] = await Promise.all([
    db.alert.groupBy({ by: ["storeId", "severity", "status"], where: all({ status: { in: ACTIVE } }), _count: true, _sum: { amountCents: true } }),
    db.alert.count({ where: all({ status: "RESOLVED", closedAt: { gte: monthStart } }) }),
    db.alert.count({ where: all({ status: "DISMISSED", closedAt: { gte: monthStart } }) }),
    Promise.all(weeks.map((w) => db.alert.groupBy({ by: ["severity"], where: all({ createdAt: { gte: w.start, lt: w.end } }), _count: true }))),
    db.alert.count({ where }),
    db.alert.findMany({
      where,
      orderBy: view === "active" ? [{ severity: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { store: { select: { code: true, name: true } } },
    }),
    getSettings(),
  ]);

  // Store risk: open alerts weighted high 3, medium 2, low 1.
  const risk = new Map<string, { score: number; open: number; high: number; medium: number; low: number; cents: number }>();
  for (const g of open) {
    const r = risk.get(g.storeId) ?? { score: 0, open: 0, high: 0, medium: 0, low: 0, cents: 0 };
    r.score += SEVERITY[g.severity].weight * g._count;
    r.open += g._count;
    r[g.severity === "HIGH" ? "high" : g.severity === "MEDIUM" ? "medium" : "low"] += g._count;
    r.cents += g._sum.amountCents ?? 0;
    risk.set(g.storeId, r);
  }
  const top = [...risk].sort(([, a], [, b]) => b.score - a.score || b.high - a.high || b.cents - a.cents).slice(0, 15);
  const people = [...new Set(alerts.flatMap((a) => (a.userId ? [a.userId] : [])))];
  const [topStores, names] = await Promise.all([
    top.length ? db.store.findMany({ where: { id: { in: top.map(([id]) => id) } }, select: { id: true, code: true, name: true } }) : [],
    people.length ? db.user.findMany({ where: { id: { in: people } }, select: { id: true, name: true } }) : [],
  ]);
  const storeOf = new Map(topStores.map((s) => [s.id, s]));
  const nameOf = new Map(names.map((u) => [u.id, u.name]));

  const count = <T extends { _count: number }>(xs: T[], keep: (x: T) => boolean = () => true) => xs.filter(keep).reduce((t, x) => t + x._count, 0);
  const openTotal = count(open);
  const openHigh = count(open, (g) => g.severity === "HIGH");
  const investigating = count(open, (g) => g.status === "INVESTIGATING");
  const atRisk = open.reduce((t, g) => t + (g._sum.amountCents ?? 0), 0);
  const weekly = weeks.map((w, i) => {
    const g = perWeek[i];
    const n = (s: AlertSeverity) => count(g, (x) => x.severity === s);
    return { label: i === weeks.length - 1 ? "This week" : fmtDay(w.start), from: fmtDay(w.start), to: fmtDay(addDays(w.end, -1)), total: count(g), high: n("HIGH"), medium: n("MEDIUM"), low: n("LOW"), current: i === weeks.length - 1 };
  });

  const rows: AlertRow[] = alerts.map((a) => {
    const base = `/store/${a.store.code}/loss-prevention`;
    return {
      id: a.id,
      href: `${base}/${a.id}`,
      severity: a.severity,
      title: a.title,
      ruleLabel: ruleLabel(a.rule),
      status: a.status,
      amountCents: a.amountCents,
      createdAt: a.createdAt,
      store: a.store,
      person: a.userId ? { name: nameOf.get(a.userId) ?? "Former staff member", href: `${base}${qs({ person: a.userId })}` } : null,
    };
  });
  const area = scope.kind === "REGION" ? `your region (${user.region?.name ?? "region"})` : "the network";

  return (
    <>
      <PageHeader
        overline={scope.kind === "REGION" ? `Region · ${user.region?.name ?? ""}` : "Governance"}
        title="Loss prevention"
        description={`Automatic checks on cash-ups, banking, refunds, stock and the tills across ${area}. High severity is emailed at once to the owner and area manager; the rest arrive in a daily digest. Nobody sees an alert about themselves.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open, high severity" value={num(openHigh)} sub={openHigh ? "work these first" : "none waiting"} />
        <Stat label="Open alerts" value={num(openTotal)} sub={`${num(investigating)} being investigated`} />
        <Stat label="Resolved this month" value={num(resolvedMonth)} sub={`${num(dismissedMonth)} dismissed as false alarms`} />
        <Stat label="Value at risk, open" value={zarCompact(atRisk)} sub="cash, refunds and stock" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Alerts raised per week" description="Last 8 weeks, Monday to Sunday · this week so far" />
          <CardBody>
            {/* On a phone keep the chart legible and scroll it sideways. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="min-w-[30rem]">
                <ColumnChart
                  labelEvery={1}
                  data={weekly.map((w) => ({
                    label: w.label,
                    value: w.total,
                    tip: `${w.from} – ${w.to}${w.current ? " (so far)" : ""}\n${num(w.total)} alert${w.total === 1 ? "" : "s"}\n${w.high} high · ${w.medium} medium · ${w.low} low`,
                  }))}
                />
              </div>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-ink-500 hover:text-ink-800">Show as a table</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-ink-500">
                      <th className="py-1.5 pr-4 font-semibold">Week</th>
                      <th className="py-1.5 pr-4 text-right font-semibold">Alerts</th>
                      <th className="py-1.5 pr-4 text-right font-semibold">High</th>
                      <th className="py-1.5 pr-4 text-right font-semibold">Medium</th>
                      <th className="py-1.5 text-right font-semibold">Low</th>
                    </tr>
                  </thead>
                  <tbody className="tnum text-ink-700">
                    {weekly.map((w) => (
                      <tr key={w.from} className="border-t border-ink-100">
                        <td className="py-1.5 pr-4">{w.from} – {w.to}{w.current ? " (so far)" : ""}</td>
                        <td className="py-1.5 pr-4 text-right font-medium text-ink-900">{w.total}</td>
                        <td className="py-1.5 pr-4 text-right">{w.high}</td>
                        <td className="py-1.5 pr-4 text-right">{w.medium}</td>
                        <td className="py-1.5 text-right">{w.low}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </CardBody>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Store risk ranking" description="Score: open alerts weighted high 3, medium 2, low 1 · top 15" />
          <CardBody>
            {top.length ? (
              <BarList
                format="number"
                rows={top.map(([id, r]) => {
                  const s = storeOf.get(id);
                  return {
                    label: s ? (
                      <Link href={`/store/${s.code}/loss-prevention`} className="hover:text-brand-700 hover:underline">
                        {s.name}
                      </Link>
                    ) : (
                      "Store"
                    ),
                    value: r.score,
                    sub: `${r.open} open`,
                    tip: `${s?.name ?? "Store"}\nScore ${r.score}\n${r.high} high · ${r.medium} medium · ${r.low} low${r.cents ? `\n${zar(r.cents)} at risk` : ""}`,
                  };
                })}
              />
            ) : (
              <p className="py-6 text-center text-sm text-ink-500">No open alerts in {area}.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6 min-w-0">
        <CardHeader title="Alert queue" description={`${VIEWS[view].label} · rows open the alert at its store`} />
        <div className="mt-4 border-y border-ink-100 p-4">
          <FilterForm action="/hq/loss-prevention">
            <FilterSelect
              name="status"
              label="Status"
              defaultValue={view === "active" ? "" : view}
              allLabel={VIEWS.active.label}
              options={[
                { value: "resolved", label: VIEWS.resolved.label },
                { value: "dismissed", label: VIEWS.dismissed.label },
                { value: "all", label: "Any status" },
              ]}
            />
            <FilterSelect name="severity" label="Severity" defaultValue={severity ?? ""} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY[s].label }))} />
            <FilterSelect name="rule" label="Rule" defaultValue={rule ?? ""} options={RULE_KEYS.map((r) => ({ value: r, label: RULES[r] }))} />
          </FilterForm>
        </div>
        {rows.length ? (
          <AlertTable rows={rows} showStore />
        ) : (
          <EmptyState icon={<ShieldCheck className="h-5 w-5" aria-hidden />} title={view === "active" && !severity && !rule ? "Nothing open" : "No alerts match these filters"}>
            {view === "active" && !severity && !rule ? `No open alerts in ${area}. The checks run every night.` : "Try another status, severity or rule."}
          </EmptyState>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => `/hq/loss-prevention${qs({ ...sp, page: p })}`} />
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {admin ? (
          <Card className="min-w-0 xl:col-span-2">
            <CardHeader title="Rules & thresholds" description="What raises an alert. Changes are audited and apply from the next check." />
            <CardBody>
              <RulesForm loss={settings.loss} banking={settings.banking} />
            </CardBody>
          </Card>
        ) : null}
        <div className={admin ? "min-w-0 space-y-6" : "min-w-0 space-y-6 xl:col-span-3"}>
          {admin && (
            <Card>
              <CardHeader title="Run the checks now" description="They run every night, at each shift close and when cash is banked. Run them now after changing a threshold. Alerts already raised aren't raised twice." />
              <CardBody>
                <ActionButton action={runChecks} variant="dark" size="md" pendingLabel="Running the checks…">
                  <Play className="h-4 w-4" aria-hidden />
                  Run checks now
                </ActionButton>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="What the checks watch" description="Every rule in plain words, with today's thresholds" />
            <CardBody>
              {!admin && <ViewOnly className="mb-4">View only: the thresholds are set by the HQ administrator.</ViewOnly>}
              <WatchList settings={settings} columns={admin ? 1 : 2} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
