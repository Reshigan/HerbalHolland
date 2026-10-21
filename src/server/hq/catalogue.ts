// Catalogue queries: paginated product list with variant counts, price ranges and
// ranging reach; per-variant ranging by store format for the ranging tool.
import { CLOSE_MATCHES, closeNeedle, inRankOrder, searchTerms } from "@/lib/text-search";
import { SIMILARITY_CANDIDATES, likePatterns, likeTerm, wordSimilarity } from "@/lib/search";
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
  const terms = searchTerms(f.q).map((t) => ({ ...t, word: likeTerm(t.word) }));
  return {
    AND: [
      f.category ? { category: { slug: f.category } } : {},
      f.cls && REG_CLASSES.includes(f.cls as RegClass) ? { regClass: f.cls as RegClass } : {},
      f.status && PRODUCT_STATUSES.includes(f.status as ProductStatus) ? { status: f.status as ProductStatus } : {},
      f.flag === "heritage" ? { heritage: true } : f.flag === "featured" ? { featured: true } : f.flag === "tobacco" ? { tobaccoRelated: true } : {},
      ...terms.map((t, i) => ({
        OR: [
          { name: { contains: t.word } },
          { slug: { contains: t.word } },
          { variants: { some: { OR: [{ sku: { contains: t.word } }, { barcode: t.word }] } } },
          ...(squashed?.[i]?.length ? [{ id: { in: squashed[i] } }] : []),
        ],
      })),
    ],
  };
}

// A product name with its spaces and the usual punctuation taken out (SQLite has no regexp_replace): "Pre-Roll 0.5g" → "preroll05g".
const SQUASHED_NAME = Prisma.raw(
  [" ", "-", "'", "’", ".", ",", "/", "&", "(", ")", "+", ":", "_"].reduce((e, ch) => `replace(${e}, '${ch.replace(/'/g, "''")}', '')`, "lower(name)"),
);

/** Per search word, the products whose name contains it once punctuation and spaces are ignored. */
export async function squashedNameMatches(q: string | undefined) {
  return Promise.all(
    searchTerms(q).map(async (t) =>
      t.squashed.length < 3
        ? []
        : (await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Product" WHERE ${SQUASHED_NAME} LIKE ${`%${likeTerm(t.squashed)}%`} LIMIT 500`).map((r) => r.id),
    ),
  );
}

/** `col` satisfies any of the patterns. */
const likeAny = (col: string, patterns: string[]) => Prisma.join(patterns.map((p) => Prisma.sql`${Prisma.raw(col)} LIKE ${p}`), " OR ");

/**
 * Products whose name, or one of whose variants' names, is close to `q` (trigram word similarity, measured as the shop's
 * search measures it: "durbn" finds Durban Poison, "nothern lights" Northern Lights), closest first then by name: at
 * most CLOSE_MATCHES ids, within `productIds` when given. For a search that found nothing as typed; any product status.
 * SQLite has no trigram index: the database prefilters candidates by `likePatterns` (at most SIMILARITY_CANDIDATES,
 * by name) and the similarity is measured in code (@/lib/search).
 */
export async function closeProducts(q: string | undefined, productIds?: string[]): Promise<string[]> {
  const c = closeNeedle(q);
  if (!c || productIds?.length === 0) return [];
  const patterns = likePatterns(c.needle);
  if (!patterns.length) return [];
  const rows = await db.$queryRaw<{ id: string; name: string; variants: string }[]>`
      SELECT p.id, p.name, json_group_array(v.name) AS variants
      FROM "Product" p LEFT JOIN "Variant" v ON v."productId" = p.id
      WHERE (${likeAny("p.name", patterns)} OR ${likeAny("v.name", patterns)}) ${productIds ? Prisma.sql`AND p.id IN (SELECT value FROM json_each(${JSON.stringify(productIds)}))` : Prisma.empty}
      GROUP BY p.id
      ORDER BY p.name
      LIMIT ${SIMILARITY_CANDIDATES}`;
  const scored: { id: string; name: string; sim: number }[] = [];
  for (const r of rows) {
    const variants = (JSON.parse(String(r.variants)) as (string | null)[]).filter((v): v is string => !!v);
    const sim = Math.max(wordSimilarity(c.needle, r.name), ...variants.map((v) => wordSimilarity(c.needle, v)));
    if (sim >= c.threshold) scored.push({ id: r.id, name: r.name, sim });
  }
  scored.sort((a, b) => b.sim - a.sim || a.name.localeCompare(b.name));
  return scored.slice(0, CLOSE_MATCHES).map((r) => r.id);
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
        SELECT v."productId", COUNT(DISTINCT sv."storeId") AS stores
        FROM "StoreVariant" sv JOIN "Variant" v ON v.id = sv."variantId"
        WHERE v."productId" IN (SELECT value FROM json_each(${JSON.stringify(productIds)})) AND sv."storeId" IN (SELECT value FROM json_each(${JSON.stringify(retailIds)}))
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
          SELECT sv."variantId", s.format, COUNT(*) AS n
          FROM "StoreVariant" sv JOIN "Store" s ON s.id = sv."storeId"
          WHERE sv."variantId" IN (SELECT value FROM json_each(${JSON.stringify(variantIds)})) AND s.id IN (SELECT value FROM json_each(${JSON.stringify(retailIds)})) AND s.status <> 'CLOSED'
          GROUP BY 1, 2`
      : [],
    db.store.groupBy({ by: ["format"], where: { id: { in: retailIds }, status: { not: "CLOSED" } }, _count: true }),
  ]);
  const byVariant = new Map<string, Partial<Record<StoreFormat, number>>>();
  for (const r of rows) byVariant.set(r.variantId, { ...byVariant.get(r.variantId), [r.format]: r.n });
  return { byVariant, totals: Object.fromEntries(totals.map((t) => [t.format, t._count])) as Partial<Record<StoreFormat, number>> };
}
