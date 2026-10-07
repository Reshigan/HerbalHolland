import { notFound } from "next/navigation";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { canRun, getReport } from "@/server/reports";
import { reportContext } from "@/server/reports/context";
import { ReportDenied, ReportView } from "@/components/reports/report-view";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const def = getReport((await params).key);
  return { title: def ? `${def.title} · Reports` : "Reports" };
}

export default async function StoreReport({ params, searchParams }: { params: Promise<{ code: string; key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code, key }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const def = getReport(key);
  if (!def || !def.scopes.includes("store")) notFound();
  const base = `/store/${store.code}/reports`;
  if (!canRun(def, user.role)) return <ReportDenied title={def.title} catalogueHref={base} />;

  const r = await reportContext({ def, scope: "store", user, store, sp, mode: "screen", basePath: base });
  const result = await def.run(r.ctx);
  return (
    <ReportView
      def={{ key: def.key, title: def.title, description: def.description, group: def.group, personal: def.personal }}
      result={result}
      controls={r.controls}
      query={r.query}
      path={`${base}/${def.key}`}
      catalogueHref={base}
      csvHref={`/api/reports/${def.key}?${new URLSearchParams({ store: store.code, ...r.query })}`}
      scopeLabel={r.scopeLabel}
      rangeLabel={r.rangeLabel}
      clamped={r.clamped}
      sort={typeof sp.sort === "string" ? sp.sort : undefined}
      dir={typeof sp.dir === "string" ? sp.dir : undefined}
    />
  );
}
