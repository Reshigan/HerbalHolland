import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ConfirmAction } from "@/components/ui/action-form";
import { BackLink, EmptyRow, ViewOnly } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { categoryIcon } from "@/components/product/category-icons";
import { deleteCategory, moveCategory, saveCategory } from "./actions";
import { CategoryForm } from "./category-form";

export const metadata = { title: "Categories" };

type SP = { edit?: string; page?: string; m?: string };
const PAGE_SIZE = 50;

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  await scopedStoreIds(scopeOf(user));
  const network = can(user, "network");
  const page = pageParam(sp.page);
  const [total, categories, editing] = await Promise.all([
    db.category.count(),
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    network && sp.edit ? db.category.findUnique({ where: { id: sp.edit } }) : null,
  ]);
  if (network && sp.edit && !editing) notFound();
  const ids = categories.map((c) => c.id);
  const counts = await db.product.groupBy({ by: ["categoryId", "status"], where: { categoryId: { in: ids } }, _count: true });
  const count = (id: string, status?: string) => counts.filter((c) => c.categoryId === id && (!status || c.status === status)).reduce((s, c) => s + c._count, 0);
  const position = (i: number) => (page - 1) * PAGE_SIZE + i;
  const href = (p: Record<string, string | number | undefined>) => `/hq/catalogue/categories${qs({ page: sp.page, ...p })}`;

  return (
    <>
      <BackLink href="/hq/catalogue">Catalogue</BackLink>
      <PageHeader
        overline="Product"
        title="Categories"
        description="How the range is grouped in the shop, on the tills and on the menu boards, in this order. A category shows to members once it has an active product."
      />
      <Flash message={sp.m} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <Table stickyFirst>
            <thead>
              <tr>
                {network && (
                  <Th className="w-24">
                    <span className="sr-only">Order</span>
                  </Th>
                )}
                <Th>Category</Th>
                <Th align="right">Products</Th>
                {network && (
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 && (
                <EmptyRow cols={network ? 4 : 2}>
                  <LayoutGrid className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                  No categories yet. Add the first one.
                </EmptyRow>
              )}
              {categories.map((c, i) => {
                const Icon = categoryIcon(c.icon);
                const all = count(c.id);
                const active = count(c.id, "ACTIVE");
                const at = position(i);
                return (
                  <Tr key={c.id} className={editing?.id === c.id ? "bg-brand-50/60" : undefined}>
                    {network && (
                      <Td className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <form action={moveCategory.bind(null, c.id, -1)}>
                            <button type="submit" disabled={at === 0} aria-label={`Move ${c.name} up`} title="Move up" className="grid h-9 w-9 place-items-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30">
                              <ArrowUp className="h-4 w-4" aria-hidden />
                            </button>
                          </form>
                          <form action={moveCategory.bind(null, c.id, 1)}>
                            <button type="submit" disabled={at === total - 1} aria-label={`Move ${c.name} down`} title="Move down" className="grid h-9 w-9 place-items-center rounded-full text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30">
                              <ArrowDown className="h-4 w-4" aria-hidden />
                            </button>
                          </form>
                        </div>
                      </Td>
                    )}
                    <Td className="min-w-64">
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-brand-500">
                          <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-ink-900">{c.name}</span>
                          <span className="block font-mono text-xs text-ink-500">/shop?category={c.slug}</span>
                          {c.blurb && <span className="mt-0.5 block text-xs text-ink-600">{c.blurb}</span>}
                        </span>
                      </div>
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      {all ? (
                        <Link href={`/hq/catalogue${qs({ category: c.slug })}`} className="font-medium text-ink-900 hover:text-brand-700">
                          {num(all)}
                        </Link>
                      ) : (
                        <span className="text-ink-500">0</span>
                      )}
                      <span className="block text-xs text-ink-500">{num(active)} active</span>
                    </Td>
                    {network && (
                      <Td align="right">
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          <Link href={href({ edit: c.id })} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-700 hover:bg-ink-100">
                            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                          </Link>
                          {all === 0 ? (
                            <ConfirmAction action={deleteCategory.bind(null, c.id)} label="Delete" icon={<Trash2 className="h-3.5 w-3.5" />} triggerVariant="ghost" title={`Delete ${c.name}?`} confirmLabel="Delete" className="max-w-xs text-left">
                              <p>It holds no products. Links to /shop?category={c.slug} will show the whole range.</p>
                            </ConfirmAction>
                          ) : (
                            <span className="inline-flex h-8 items-center px-3 text-xs text-ink-500" title="Move its products to another category first">
                              Not empty
                            </span>
                          )}
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => href({ page: p, edit: sp.edit })} />
        </Card>

        <Card className="self-start">
          <CardHeader
            title={editing ? `Edit ${editing.name}` : "New category"}
            description={editing ? "Changes show in the shop and on the tills straight away" : "Name, a line of copy and an icon. You can reorder it in the list."}
          />
          <CardBody>
            {!network ? (
              <ViewOnly>Categories are managed by the HQ merchandising team.</ViewOnly>
            ) : (
              <CategoryForm
                key={`${editing?.id ?? "new"}:${sp.m ?? ""}`}
                action={saveCategory.bind(null, editing?.id ?? null)}
                category={editing ? { name: editing.name, slug: editing.slug, blurb: editing.blurb, icon: editing.icon } : null}
                cancelHref={editing ? href({ edit: undefined }) : undefined}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
