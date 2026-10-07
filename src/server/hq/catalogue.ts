// Catalogue queries: paginated product list with variant counts, price ranges and
// ranging reach; per-variant ranging by store format for the ranging tool.
import { CLOSE_MATCHES, closeNeedle, inRankOrder, searchTerms } from "@/lib/text-search";
import { db } from "@/server/db";
import { REG_CLASSES } from "@/lib/compliance";
import { Prisma, type ProductStatus, type RegClass, type StoreFormat } from "@/generated/prisma/client";

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

/**
 * Every search word must match (any order) a product's name, slug, a variant's SKU or barcode. Through `squashed`
 * (ids per word from `squashedNameMatches`), it may also match the name with punctuation ignored ("preroll" finds
 * "Pre-roll").
 */
export function productWhere(f: CatalogueFilters, squashed?: string[][]): Prisma.ProductWhereInput {
  const terms = searchTerms(f.q);
  return {
    AND: [
      f.category ? { category: { slug: f.category } } : {},
      f.cls && REG_CLASSES.includes(f.cls as RegClass) ? { regClass: f.cls as RegClass } : {},
      f.status && PRODUCT_STATUSES.includes(f.status as ProductStatus) ? { status: f.status as ProductStatus } : {},
      f.flag === "heritage" ? { heritage: true } : f.flag === "featured" ? { featured: true } : f.flag === "tobacco" ? { tobaccoRelated: true } : {},
      ...terms.map((t, i) => ({
        OR: [
          { name: { contains: t.word, mode: "insensitive" as const } },
          { slug: { contains: t.word, mode: "insensitive" as const } },
          { variants: { some: { OR: [{ sku: { contains: t.word, mode: "insensitive" as const } }, { barcode: t.word }] } } },
          ...(squashed?.[i]?.length ? [{ id: { in: squashed[i] } }] : []),
        ],
      })),
    ],
  };
}

/** Per search word, the products whose name contains it once punctuation and spaces are ignored. */
export async function squashedNameMatches(q: string | undefined) {
  return Promise.all(
    searchTerms(q).map(async (t) =>
      t.squashed.length < 3
        ? []
        : (await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Product" WHERE regexp_replace(lower(name), '[^[:alnum:]]+', '', 'g') LIKE ${`%${t.squashed}%`} LIMIT 500`).map((r) => r.id),
    ),
  );
}

/**
 * Products whose name, or one of whose variants' names, is close to `q` (pg_trgm word similarity, measured as the shop's
 * search measures it: "durbn" finds Durban Poison, "nothern lights" Northern Lights), closest first: at most
 * CLOSE_MATCHES ids, within `productIds` when given. For a search that found nothing as typed; any product status.
 */
export async function closeProducts(q: string | undefined, productIds?: string[]): Promise<string[]> {
  const c = closeNeedle(q);
  if (!c || productIds?.length === 0) return [];
  const rows = await db.$transaction(async (t) => {
    await t.$executeRawUnsafe(`SET LOCAL pg_trgm.word_similarity_threshold = ${c.threshold}`);
    return t.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Product" p LEFT JOIN "Variant" v ON v."productId" = p.id
      WHERE (${c.needle} <% p.name OR ${c.needle} <% v.name) ${productIds ? Prisma.sql`AND p.id = ANY(${productIds}::text[])` : Prisma.empty}
      GROUP BY p.id, p.name
      ORDER BY GREATEST(word_similarity(${c.needle}, p.name), COALESCE(MAX(word_similarity(${c.needle}, v.name)), 0)) DESC, p.name
      LIMIT ${CLOSE_MATCHES}`;
  });
  return rows.map((r) => r.id);
}

/** A page of the catalogue; `close` when nothing matched the search as typed and these are the closest names instead. */
export async function productList(retailIds: string[], f: CatalogueFilters, page: number, pageSize: number, order: { sort: CatalogueSort | null; dir: "asc" | "desc" } = { sort: null, dir: "asc" }) {
  const include = { category: { select: { name: true } }, variants: { select: { id: true, name: true, sku: true, priceCents: true, active: true, caseQty: true }, orderBy: { sortOrder: "asc" } } } as const;
  const skip = (page - 1) * pageSize;
  const where = productWhere(f, f.q?.trim() ? await squashedNameMatches(f.q) : undefined);
  let [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, include, orderBy: productOrderBy(order.sort, order.dir), skip, take: pageSize }),
  ]);
  // Nothing as typed (a typo): the closest names that pass the other filters, closest first unless a column is sorted.
  const closeIds = !total && f.q?.trim() ? await closeProducts(f.q) : [];
  if (closeIds.length) {
    const near = { AND: [productWhere({ ...f, q: undefined }), { id: { in: closeIds } }] };
    total = await db.product.count({ where: near });
    products = order.sort
      ? await db.product.findMany({ where: near, include, orderBy: productOrderBy(order.sort, order.dir), skip, take: pageSize })
      : inRankOrder(await db.product.findMany({ where: near, include }), closeIds, (p) => p.id).slice(skip, skip + pageSize);
  }
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
    close: closeIds.length > 0 && total > 0,
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
