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
  const stores = await scopedStoreIds(scope, { kind: "RETAIL", status: "ACTIVE" });
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
        description={`Network reporting across ${stores.length} trading stores and the distribution centres. Every report can be narrowed to a region or a single store, charted and exported.`}
      />
      <ReportCatalogue groups={groups} featured={featured} />
    </>
  );
}
