// Catalogue queries: paginated product list with variant counts, price ranges and
// ranging reach; per-variant ranging by store format for the ranging tool.
import { db } from "@/server/db";
import { REG_CLASSES } from "@/lib/compliance";
import type { Prisma, ProductStatus, RegClass, StoreFormat } from "@/generated/prisma/client";

export const PRODUCT_STATUSES: ProductStatus[] = ["ACTIVE", "DRAFT", "ARCHIVED"];
export { PRODUCT_LINES as LINES } from "@/lib/catalogue-import";
export { REG_CLASSES };

export type CatalogueFilters = { q?: string; category?: string; cls?: string; status?: string; flag?: string };

export const CATALOGUE_SORTS = ["name", "category", "cls", "status", "updated"] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];

/** Column sorts for the list; the default groups active products first, by category order, then name. */
export function productOrderBy(sort: CatalogueSort | null, dir: "asc" | "desc"): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return [{ name: dir }];
    case "category":
      return [{ category: { sortOrder: dir } }, { name: "asc" }];
    case "cls":
      return [{ regClass: dir }, { name: "asc" }];
    case "status":
      return [{ status: dir }, { name: "asc" }];
    case "updated":
      return [{ updatedAt: dir }];
    default:
      return [{ status: "asc" }, { category: { sortOrder: "asc" } }, { name: "asc" }];
  }
}

export function productWhere(f: CatalogueFilters): Prisma.ProductWhereInput {
  const q = f.q?.trim();
  return {
    AND: [
      f.category ? { category: { slug: f.category } } : {},
      f.cls && REG_CLASSES.includes(f.cls as RegClass) ? { regClass: f.cls as RegClass } : {},
      f.status && PRODUCT_STATUSES.includes(f.status as ProductStatus) ? { status: f.status as ProductStatus } : {},
      f.flag === "heritage" ? { heritage: true } : f.flag === "featured" ? { featured: true } : f.flag === "tobacco" ? { tobaccoRelated: true } : {},
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { variants: { some: { OR: [{ sku: { contains: q, mode: "insensitive" } }, { barcode: q }] } } },
            ],
          }
        : {},
    ],
  };
}

export async function productList(retailIds: string[], f: CatalogueFilters, page: number, pageSize: number, order: { sort: CatalogueSort | null; dir: "asc" | "desc" } = { sort: null, dir: "asc" }) {
  const where = productWhere(f);
  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: { category: { select: { name: true } }, variants: { select: { id: true, name: true, sku: true, priceCents: true, active: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: productOrderBy(order.sort, order.dir),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const productIds = products.map((p) => p.id);
  const reach = productIds.length
    ? await db.$queryRaw<{ productId: string; stores: number }[]>`
        SELECT v."productId", COUNT(DISTINCT sv."storeId")::int AS stores
        FROM "StoreVariant" sv JOIN "Variant" v ON v.id = sv."variantId"
        WHERE v."productId" = ANY(${productIds}::text[]) AND sv."storeId" = ANY(${retailIds}::text[])
        GROUP BY 1`
    : [];
  const reachBy = new Map(reach.map((r) => [r.productId, r.stores]));
  return {
    total,
    rows: products.map((p) => {
      const prices = p.variants.filter((v) => v.active).map((v) => v.priceCents);
      return { ...p, activeVariants: prices.length, minPrice: prices.length ? Math.min(...prices) : null, maxPrice: prices.length ? Math.max(...prices) : null, stores: reachBy.get(p.id) ?? 0 };
    }),
  };
}

/** For each variant of a product: stores ranged, by format, within the given retail stores. */
export async function rangingSummary(variantIds: string[], retailIds: string[]) {
  const [rows, totals] = await Promise.all([
    variantIds.length
      ? db.$queryRaw<{ variantId: string; format: StoreFormat; n: number }[]>`
          SELECT sv."variantId", s.format, COUNT(*)::int AS n
          FROM "StoreVariant" sv JOIN "Store" s ON s.id = sv."storeId"
          WHERE sv."variantId" = ANY(${variantIds}::text[]) AND s.id = ANY(${retailIds}::text[]) AND s.status <> 'CLOSED'
          GROUP BY 1, 2`
      : [],
    db.store.groupBy({ by: ["format"], where: { id: { in: retailIds }, status: { not: "CLOSED" } }, _count: true }),
  ]);
  const byVariant = new Map<string, Partial<Record<StoreFormat, number>>>();
  for (const r of rows) byVariant.set(r.variantId, { ...byVariant.get(r.variantId), [r.format]: r.n });
  return { byVariant, totals: Object.fromEntries(totals.map((t) => [t.format, t._count])) as Partial<Record<StoreFormat, number>> };
}
