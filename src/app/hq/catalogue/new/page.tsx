import { redirect } from "next/navigation";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { incentiveExcluded } from "@/lib/compliance";
import { can } from "@/server/hq/guard";
import { PageHeader } from "@/components/ui/page";
import { BackLink } from "@/components/hq/ui";
import { saveProduct } from "../actions";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  await scopedStoreIds(scope);
  if (!can(user, "network")) redirect("/hq/catalogue");
  const [categories, claimRows, settings] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.$queryRaw<{ claim: string }[]>`SELECT DISTINCT j.value AS claim FROM "Product" p, json_each(p.claims) j ORDER BY 1 LIMIT 200`,
    getSettings(),
  ]);
  return (
    <>
      <BackLink href="/hq/catalogue">Catalogue</BackLink>
      <PageHeader overline="Product" title="New product" description="Start in draft: add the story, compliance data and variants, then publish and range it." />
      <ProductForm action={saveProduct.bind(null, null)} product={null} categories={categories} claimLibrary={claimRows.map((c) => c.claim)} noIncentiveClasses={incentiveExcluded(settings.compliance)} announce />
    </>
  );
}
