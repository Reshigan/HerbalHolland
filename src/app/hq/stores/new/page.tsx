import { redirect } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { titleCase } from "@/server/hq/stores";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { NewStoreForm } from "./new-store-form";

export const metadata = { title: "Onboard a store" };

export default async function NewStorePage() {
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  if (!can(user, "admin")) redirect("/hq/stores");
  const [companies, regions, dcs, templates] = await Promise.all([
    db.company.findMany({ where: { kind: "FRANCHISEE" }, select: { id: true, name: true, vatNumber: true, _count: { select: { stores: true } } }, orderBy: { name: "asc" } }),
    db.region.findMany({ orderBy: { name: "asc" } }),
    db.store.findMany({ where: { kind: "WAREHOUSE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.store.findMany({
      where: { id: { in: ids }, kind: "RETAIL", storeVariants: { some: {} } },
      select: { id: true, name: true, code: true, format: true, _count: { select: { storeVariants: true } } },
      orderBy: [{ format: "asc" }, { name: "asc" }],
    }),
  ]);
  return (
    <>
      <BackLink href="/hq/stores">All stores</BackLink>
      <PageHeader overline="Network growth" title="Onboard a store" description="Set up a new franchise store: owner company, territory, fees and a starting range. Staff logins and tills are added from the store's back office." />
      <NewStoreForm
        companies={companies.map((c) => ({ id: c.id, name: c.name, hint: `${c._count.stores} store${c._count.stores === 1 ? "" : "s"}${c.vatNumber ? "" : " · non-VAT"}` }))}
        regions={regions.map((r) => ({ id: r.id, name: r.name }))}
        dcs={dcs}
        templates={templates.map((t) => ({ id: t.id, name: `${t.name} (${t.code})`, hint: `${titleCase(t.format)} · ${t._count.storeVariants} SKUs` }))}
      />
    </>
  );
}
