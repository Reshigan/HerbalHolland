import { HQ_ROLES, requireStaff } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { catalogue, getReport } from "@/server/reports";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { db } from "@/server/db";
import { fmtRun, scheduleLabel } from "@/server/exports";
import { PageHeader } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ActionButton } from "@/components/ui/action-form";
import { unscheduleExport } from "./[key]/actions";
import { ReportCatalogue, type CatalogueReport } from "@/components/reports/catalogue";
import { asList } from "@/lib/json-list";

export const metadata = { title: "Reports" };

const FEATURED = ["sales-by-store", "sales-overview", "stock-valuation", "statements"];

export default async function HqReports() {
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const [stores, dcs, schedules] = await Promise.all([
    scopedStoreIds(scope, { kind: "RETAIL", status: "ACTIVE" }),
    scopedStoreIds(scope, { kind: "WAREHOUSE" }),
    db.scheduledExport.findMany({ where: { userId: user.id, active: true }, orderBy: { createdAt: "asc" }, take: 20 }),
  ]);
  // Where each schedule's report opens, with the filters it was scheduled with.
  const scheduleHref = (s: (typeof schedules)[number]) => {
    const { scope: sc, store, ...rest } = (s.params ?? {}) as Record<string, string>;
    const qs = new URLSearchParams(rest).toString();
    const base = sc === "store" && store ? `/store/${store}/reports/${s.reportKey}` : `/hq/reports/${s.reportKey}`;
    return qs ? `${base}?${qs}` : base;
  };
  const groups = catalogue("hq", user.role).map((g) => ({
    group: g.group,
    reports: g.reports.map((r): CatalogueReport => ({ key: r.key, title: r.title, description: r.description, personal: r.personal, href: `/hq/reports/${r.key}` })),
  }));
  const all = groups.flatMap((g) => g.reports);
  const featured = FEATURED.flatMap((k) => all.filter((r) => r.key === k));
  return (
    <>
      <PageHeader
        overline={scope.kind === "REGION" ? `Region · ${user.region?.name}` : "Herbal Holland network"}
        title="Reports"
        description={`Reporting across ${stores.length} trading stores${dcs.length ? ` and ${dcs.length} distribution centre${dcs.length === 1 ? "" : "s"}` : ""}. Narrow any report to ${scope.kind === "HQ" ? "a region or " : ""}a single store, see it charted and export it.`}
      />
      {schedules.length > 0 && (
        <Card className="mb-6 min-w-0">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-brand-700" aria-hidden /> Your scheduled exports
              </span>
            }
            description="Reports emailed as a CSV link after the 03:00 run. Stop one here, or add one from any report's “Email me this”."
          />
          <Table className="mt-3" minWidth="40rem">
            <thead>
              <tr>
                <Th>Report</Th>
                <Th>When</Th>
                <Th>To</Th>
                <Th>Last sent</Th>
                <Th align="right">
                  <span className="sr-only">Stop</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <Link href={scheduleHref(s)} className="font-medium text-ink-900 hover:text-brand-700">
                      {getReport(s.reportKey)?.title ?? s.reportKey}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{scheduleLabel(s)}</Td>
                  <Td className="max-w-64 truncate text-ink-600" title={asList(s.recipients).join(", ")}>
                    {asList(s.recipients).join(", ")}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">{fmtRun(s.lastRunAt)}</Td>
                  <Td align="right">
                    <ActionButton action={unscheduleExport.bind(null, s.reportKey, s.id)} variant="ghost" pendingLabel="Stopping…">
                      Stop
                    </ActionButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <ReportCatalogue groups={groups} featured={featured} />
    </>
  );
}
