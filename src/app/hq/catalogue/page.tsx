import Link from "next/link";
import { LayoutGrid, Package, Plus, Upload } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { productList, CATALOGUE_SORTS, PRODUCT_STATUSES, REG_CLASSES } from "@/server/hq/catalogue";
import { titleCase } from "@/server/hq/stores";
import { qs } from "@/server/hq/form";
import { REG_CLASS_LABEL, validateProduct, type RegClass } from "@/lib/compliance";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CLASS_TONE } from "@/components/hq/tones";
import { StatusBadge } from "@/components/ui/status";
import { Table, Th, Td, Tr, SortableTh, TableEmpty, sortParams } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ProductArt } from "@/components/product/art";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { SavedViews } from "@/components/admin/saved-views";
import { PriceCell } from "./price-cell";

export const metadata = { title: "Catalogue" };

type SP = { q?: string; category?: string; cls?: string; status?: string; flag?: string; sort?: string; dir?: string; page?: string };

export default async function CataloguePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope, { kind: "RETAIL" });
  const page = pageParam(sp.page);
  const pageSize = 25;
  const { sort, dir } = sortParams(CATALOGUE_SORTS, sp.sort, sp.dir, "name");
  const sorted = (CATALOGUE_SORTS as readonly string[]).includes(sp.sort ?? "");
  const [list, categories, counts] = await Promise.all([
    productList(ids, sp, page, pageSize, { sort: sorted ? sort : null, dir }),
    db.category.findMany({ orderBy: { sortOrder: "asc" } }),
    db.product.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const href = (p: Record<string, string | number | undefined>) => `/hq/catalogue${qs({ ...sp, ...p })}`;
  const sortHref = (s: string, d: "asc" | "desc") => href({ sort: s, dir: d, page: undefined });
  const editPrices = can(user, "network");

  return (
    <>
      <PageHeader
        overline="Product"
        title="Catalogue"
        description={`${count("ACTIVE")} active products · ${count("DRAFT")} in draft · ${count("ARCHIVED")} archived. One national range with recommended retail prices; stores range what suits them.${editPrices ? " Click an RRP to change it in place." : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/hq/catalogue/categories" variant="outline">
              <LayoutGrid className="h-4 w-4" /> Categories
            </ButtonLink>
            {editPrices && (
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
        <div className="space-y-3 border-b border-ink-100 p-4">
          <FilterForm action="/hq/catalogue" keep={{ sort: sp.sort, dir: sp.dir }}>
            <SearchField defaultValue={sp.q} placeholder="Search name, SKU or barcode" />
            <FilterSelect name="category" label="Category" defaultValue={sp.category} options={categories.map((c) => ({ value: c.slug, label: c.name }))} />
            <FilterSelect name="cls" label="Class" defaultValue={sp.cls} options={REG_CLASSES.map((c) => ({ value: c, label: REG_CLASS_LABEL[c] }))} />
            <FilterSelect name="status" label="Status" defaultValue={sp.status} options={PRODUCT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
            <FilterSelect name="flag" label="Flag" defaultValue={sp.flag} options={[{ value: "heritage", label: "Heritage" }, { value: "featured", label: "Featured" }, { value: "tobacco", label: "Tobacco Bill related" }]} />
          </FilterForm>
          {list.close && (
            <p className="text-xs text-ink-500">
              <b className="text-ink-700">Showing close matches for “{sp.q}”</b> because nothing matched exactly.
            </p>
          )}
          <SavedViews pageKey="hq-catalogue" userKey={user.id} />
        </div>
        <Table className="relative" stickyFirst minWidth="60rem">
          <thead>
            <tr>
              <SortableTh label="Product" sortKey="name" sort={sorted ? sort : ""} dir={dir} href={sortHref} />
              <SortableTh label="Category" sortKey="category" sort={sorted ? sort : ""} dir={dir} href={sortHref} />
              <SortableTh label="Class" sortKey="cls" sort={sorted ? sort : ""} dir={dir} href={sortHref} />
              <Th align="right">Variants</Th>
              <Th align="right">RRP</Th>
              <Th align="right">Ranged at</Th>
              <SortableTh label="Status" sortKey="status" sort={sorted ? sort : ""} dir={dir} href={sortHref} />
              <SortableTh label="Updated" sortKey="updated" sort={sorted ? sort : ""} dir={dir} href={sortHref} align="right" />
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 && (
              <TableEmpty cols={8} icon={<Package className="h-5 w-5" aria-hidden />} title="No products match these filters">
                Try a broader search, or clear a filter.
              </TableEmpty>
            )}
            {list.rows.map((p) => (
              <Tr key={p.id} href={`/hq/catalogue/${p.id}`}>
                <Td>
                  <Link href={`/hq/catalogue/${p.id}`} className="group flex min-w-56 items-center gap-3">
                    <ProductArt slug={p.slug} strain={p.strain} regClass={p.regClass} className="h-9 w-9 shrink-0 overflow-hidden rounded-xl" label="" />
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
                <Td className="text-ink-600">{p.category.name}</Td>
                <Td>
                  <Badge tone={CLASS_TONE[p.regClass]}>{p.regClass}</Badge>
                </Td>
                <Td align="right">
                  {p.activeVariants}
                  {p.variants.length > p.activeVariants && <span className="text-ink-500"> / {p.variants.length}</span>}
                  {p.variants.some((v) => v.active && v.caseQty > 1) && (
                    <span className="block whitespace-nowrap text-xs text-ink-500">case of {[...new Set(p.variants.filter((v) => v.active && v.caseQty > 1).map((v) => v.caseQty))].sort((a, b) => a - b).join(" / ")}</span>
                  )}
                </Td>
                <Td align="right" data-no-row-link>
                  <PriceCell product={p.name} variants={p.variants} canEdit={editPrices && p.status !== "ARCHIVED"} />
                </Td>
                <Td align="right">
                  {p.stores} <span className="text-ink-500">/ {ids.length}</span>
                </Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <Td align="right" className="text-ink-600">{fmtDate(p.updatedAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={list.total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
