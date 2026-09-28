import { notFound } from "next/navigation";
import { HQ_ROLES, requireStaff } from "@/server/auth";
import { canRun, getReport } from "@/server/reports";
import { reportContext } from "@/server/reports/context";
import { ReportDenied, ReportView } from "@/components/reports/report-view";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const def = getReport((await params).key);
  return { title: def ? `${def.title} · Reports` : "Reports" };
}

export default async function HqReport({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const def = getReport(key);
  if (!def || !def.scopes.includes("hq")) notFound();
  const base = "/hq/reports";
  if (!canRun(def, user.role)) return <ReportDenied title={def.title} catalogueHref={base} />;

  // Store ids come from the user's scope (HQ: network, area manager: their region), narrowed by the store filter.
  const r = await reportContext({ def, scope: "hq", user, sp, mode: "screen", basePath: base });
  const result = await def.run(r.ctx);
  return (
    <ReportView
      def={{ key: def.key, title: def.title, description: def.description, group: def.group, personal: def.personal }}
      result={result}
      controls={r.controls}
      query={r.query}
      path={`${base}/${def.key}`}
      catalogueHref={base}
      csvHref={`/api/reports/${def.key}?${new URLSearchParams({ scope: "hq", ...r.query })}`}
      scopeLabel={r.scopeLabel}
      rangeLabel={r.rangeLabel}
      clamped={r.clamped}
    />
  );
}
