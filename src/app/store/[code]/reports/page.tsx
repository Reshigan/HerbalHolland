import { requireStaff } from "@/server/auth";
import { scopeOf, storeWhere, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { catalogue } from "@/server/reports";
import { PageHeader } from "@/components/ui/page";
import { ReportCatalogue, type CatalogueReport } from "@/components/reports/catalogue";

export const metadata = { title: "Reports" };

const FEATURED = ["sales-overview", "sales-by-product", "low-stock", "pnl"];

export default async function StoreReports({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  // Owners (and HQ) who can see several of this company's stores also get store comparisons.
  const siblings = await db.store.count({ where: { AND: [storeWhere(scopeOf(user)), { companyId: store.companyId, kind: "RETAIL" }] } });
  const groups = catalogue("store", user.role, { multiStore: siblings > 1 }).map((g) => ({
    group: g.group,
    reports: g.reports.map((r): CatalogueReport => ({ key: r.key, title: r.title, description: r.description, personal: r.personal, href: `/store/${store.code}/reports/${r.key}` })),
  }));
  const all = groups.flatMap((g) => g.reports);
  const featured = FEATURED.flatMap((k) => all.filter((r) => r.key === k));
  return (
    <>
      <PageHeader
        overline={`Herbal Holland ${store.name} · ${store.code}`}
        title="Reports"
        description="Live reporting on your store's sales, stock, money, members and compliance. Open a report to filter it, see it charted and download it as a CSV."
      />
      <ReportCatalogue groups={groups} featured={featured} />
    </>
  );
}
