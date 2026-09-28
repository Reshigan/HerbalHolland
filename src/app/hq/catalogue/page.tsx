import Link from "next/link";
import { LayoutGrid, Package, Plus, Upload } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { productList, PRODUCT_STATUSES, REG_CLASSES } from "@/server/hq/catalogue";
import { titleCase } from "@/server/hq/stores";
import { qs } from "@/server/hq/form";
import { zarWhole } from "@/lib/money";
import { REG_CLASS_LABEL, validateProduct, type RegClass } from "@/lib/compliance";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CLASS_TONE } from "@/components/hq/tones";
import { StatusBadge } from "@/components/ui/status";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ProductArt } from "@/components/product/art";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { EmptyRow } from "@/components/hq/ui";

export const metadata = { title: "Catalogue" };

type SP = { q?: string; category?: string; cls?: string; status?: string; flag?: string; page?: string };

export default async function CataloguePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope, { kind: "RETAIL" });
  const page = pageParam(sp.page);
  const pageSize = 25;
  const [list, categories, counts] = await Promise.all([
    productList(ids, sp, page, pageSize),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.product.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const href = (p: Record<string, string | number | undefined>) => `/hq/catalogue${qs({ ...sp, ...p })}`;

  return (
    <>
      <PageHeader
        overline="Product"
        title="Catalogue"
        description={`${count("ACTIVE")} active products · ${count("DRAFT")} in draft · ${count("ARCHIVED")} archived. One national range with recommended retail prices; stores range what suits them.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/hq/catalogue/categories" variant="outline">
              <LayoutGrid className="h-4 w-4" /> Categories
            </ButtonLink>
            {can(user, "network") && (
              <>
                <ButtonLink href="/hq/catalogue/import" variant="outline">
                  <Upload className="h-4 w-4" /> Import
                </ButtonLink>
                <ButtonLink href="/hq/catalogue/new">
                  <Plus className="h-4 w-4" /> New product
                </ButtonLink>
              </>
            )}
          </div>
        }
      />
      <Card>
        <div className="border-b border-ink-100 p-4">
          <FilterForm action="/hq/catalogue">
            <SearchField defaultValue={sp.q} placeholder="Search name, SKU or barcode" />
            <FilterSelect name="category" label="Category" defaultValue={sp.category} options={categories.map((c) => ({ value: c.slug, label: c.name }))} />
            <FilterSelect name="cls" label="Class" defaultValue={sp.cls} options={REG_CLASSES.map((c) => ({ value: c, label: REG_CLASS_LABEL[c] }))} />
            <FilterSelect name="status" label="Status" defaultValue={sp.status} options={PRODUCT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
            <FilterSelect name="flag" label="Flag" defaultValue={sp.flag} options={[{ value: "heritage", label: "Heritage" }, { value: "featured", label: "Featured" }, { value: "tobacco", label: "Tobacco Bill related" }]} />
          </FilterForm>
        </div>
        <Table className="relative">
          <thead>
            <tr>
              <Th>Product</Th>
              <Th className="hidden md:table-cell">Category</Th>
              <Th>Class</Th>
              <Th align="right" className="hidden sm:table-cell">Variants</Th>
              <Th align="right">RRP</Th>
              <Th align="right" className="hidden lg:table-cell">Ranged at</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 && (
              <EmptyRow cols={7}>
                <Package className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                No products match these filters.
              </EmptyRow>
            )}
            {list.rows.map((p) => (
              <Tr key={p.id}>
                <Td>
                  <Link href={`/hq/catalogue/${p.id}`} className="group flex min-w-56 items-center gap-3">
                    <ProductArt slug={p.slug} strain={p.strain} regClass={p.regClass} className="h-10 w-10 shrink-0 overflow-hidden rounded-xl" label="" />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink-900 group-hover:text-brand-700">{p.name}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                        {p.line && <span>{titleCase(p.line)}</span>}
                        {p.heritage && <Badge tone="orange">Heritage</Badge>}
                        {p.featured && <Badge tone="dark">Featured</Badge>}
                        {p.tobaccoRelated && <Badge tone="amber">Tobacco Bill</Badge>}
                        {p.status !== "ARCHIVED" && validateProduct({ ...p, regClass: p.regClass as RegClass }).length > 0 && <Badge tone="red">Compliance data incomplete</Badge>}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td className="hidden text-ink-600 md:table-cell">{p.category.name}</Td>
                <Td>
                  <Badge tone={CLASS_TONE[p.regClass]}>{p.regClass}</Badge>
                </Td>
                <Td align="right" className="hidden sm:table-cell">
                  {p.activeVariants}
                  {p.variants.length > p.activeVariants && <span className="text-ink-400"> / {p.variants.length}</span>}
                </Td>
                <Td align="right" className="whitespace-nowrap">
                  {p.minPrice == null ? "—" : p.minPrice === p.maxPrice ? zarWhole(p.minPrice) : `${zarWhole(p.minPrice)}–${zarWhole(p.maxPrice!)}`}
                </Td>
                <Td align="right" className="hidden lg:table-cell">
                  {p.stores} <span className="text-ink-400">/ {ids.length}</span>
                </Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={list.total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
