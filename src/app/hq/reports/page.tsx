import { HQ_ROLES, requireStaff } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { catalogue } from "@/server/reports";
import { PageHeader } from "@/components/ui/page";
import { ReportCatalogue, type CatalogueReport } from "@/components/reports/catalogue";

export const metadata = { title: "Reports" };

const FEATURED = ["sales-by-store", "sales-overview", "stock-valuation", "statements"];

export default async function HqReports() {
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const [stores, dcs] = await Promise.all([scopedStoreIds(scope, { kind: "RETAIL", status: "ACTIVE" }), scopedStoreIds(scope, { kind: "WAREHOUSE" })]);
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
      <ReportCatalogue groups={groups} featured={featured} />
    </>
  );
}
