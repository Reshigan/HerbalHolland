// Storefront catalogue: product cards with display prices (price lists and member
// prices, exactly as quote() resolves them online), live deal badges, stock at the
// shopper's store or across the network, and verified-review ratings.
import { cache } from "react";
import { db } from "@/server/db";
import { activePriceLists, activePromotions } from "@/server/pricing";
import { availability, availKey } from "@/server/inventory";
import { getClasses } from "./access";
import { STORE_SELECT } from "./context";
import { resolvePrice, type PriceContext } from "@/lib/pricing-rules";
import { describePromo, type PromoInput } from "@/lib/promotions";
import { distanceKm } from "@/lib/routing";
import type { RegClass } from "@/lib/compliance";
import type { Prisma, Promotion } from "@/generated/prisma/client";

export const PRODUCT_INCLUDE = {
  category: { select: { id: true, slug: true, name: true, sortOrder: true, icon: true } },
  variants: { where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sku: true, grams: true, priceCents: true } },
} satisfies Prisma.ProductInclude;
export type CatalogueProduct = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export type Shopper = { tier: string | null; storeId?: string | null; storeName?: string | null };

// ── Pricing & deals ──────────────────────────────────────────────────────────
/** Price lists, live online deals and the price context for a shopper (memoised per request). */
export const getPricing = cache(async (tier: string | null) => {
  const [lists, promos, classes] = await Promise.all([activePriceLists(), activePromotions({ channel: "ONLINE" }), getClasses()]);
  const ctx: PriceContext = { storeId: null, regionId: null, channel: "ONLINE", member: tier != null, tier: tier as PriceContext["tier"], at: new Date() };
  // Code-only promotions are private to the people who were given the code.
  return { lists, promos: promos.filter((p) => !p.code), ctx, noIncentives: classes.noIncentives };
});
export type Pricing = Awaited<ReturnType<typeof getPricing>>;

export function variantPrice(v: { id: string; priceCents: number }, regClass: RegClass, pr: Pricing) {
  return resolvePrice({ variantId: v.id, rrpCents: v.priceCents, qty: 1, incentives: !pr.noIncentives.includes(regClass) }, pr.lists, pr.ctx);
}

const qualifies = (d: Promotion, p: { id: string; categoryId: string }) => d.productIds.includes(p.id) || d.categoryIds.includes(p.categoryId);
const rewards = (d: Promotion, p: { id: string; categoryId: string }) => d.rewardProductIds.includes(p.id) || d.rewardCategoryIds.includes(p.categoryId);

/** Targeted, live online deals that involve a product. Medicines never carry deals (s18A). */
export function dealsFor(p: { id: string; categoryId: string; regClass: string }, pr: Pricing) {
  if (pr.noIncentives.includes(p.regClass as RegClass)) return [];
  return pr.promos.filter((d) => d.kind !== "MULTIPLIER" && (qualifies(d, p) || rewards(d, p)));
}

export const dealLabel = (d: Promotion) => (d.kind === "BUY_X_GET_Y" ? "Bonus buy" : describePromo(d as unknown as PromoInput));

// ── Stock ────────────────────────────────────────────────────────────────────
export const getNetwork = cache(async () => {
  const rows = await db.store.findMany({ where: { status: "ACTIVE" }, select: { id: true, kind: true } });
  return { all: rows.map((r) => r.id), dcs: rows.filter((r) => r.kind === "WAREHOUSE").map((r) => r.id) };
});

export type StockBadge =
  | { kind: "store"; store: string; low: boolean }
  | { kind: "ships"; low: boolean }
  | { kind: "collect"; store: string | null; stores: number }
  | { kind: "out" };

// ── Cards ────────────────────────────────────────────────────────────────────
export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  regClass: RegClass;
  strain: string | null;
  heritage: boolean;
  featured: boolean;
  category: { slug: string; name: string; sortOrder: number };
  effects: string[];
  priceCents: number;
  wasCents: number | null;
  priceNote: string | null;
  variantCount: number;
  firstVariantId: string;
  deal: { name: string; label: string } | null;
  stock: StockBadge;
  rating: { avg: number; count: number } | null;
  createdAt: Date;
  search: string;
};

async function ratingsFor(productIds: string[]) {
  if (!productIds.length) return new Map<string, { avg: number; count: number }>();
  const rows = await db.review.groupBy({ by: ["productId"], where: { productId: { in: productIds }, verified: true }, _avg: { rating: true }, _count: true });
  return new Map(rows.map((r) => [r.productId, { avg: r._avg.rating ?? 0, count: r._count }]));
}

export async function buildCards(products: CatalogueProduct[], who: Shopper): Promise<ProductCard[]> {
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const [pr, net, ratings, classes] = await Promise.all([getPricing(who.tier), getNetwork(), ratingsFor(products.map((p) => p.id)), getClasses()]);
  const avail = variantIds.length ? await availability(net.all, variantIds) : new Map();
  const qty = (storeId: string, variantId: string) => Math.max(0, avail.get(availKey(storeId, variantId))?.available ?? 0);

  return products
    .filter((p) => p.variants.length > 0)
    .map((p) => {
      const priced = p.variants.map((v) => ({ v, price: variantPrice(v, p.regClass, pr) })).sort((a, b) => a.price.unitCents - b.price.unitCents);
      const cheapest = priced[0];
      let priceCents = cheapest.price.unitCents;
      let wasCents: number | null = cheapest.price.rrpCents > priceCents ? cheapest.price.rrpCents : null;
      let priceNote = cheapest.price.rule;
      const deals = dealsFor(p, pr);
      const direct = deals.find((d) => (d.kind === "PERCENT" || d.kind === "FIXED") && !d.minSpendCents && qualifies(d, p));
      if (direct) {
        const cut = direct.kind === "PERCENT" ? Math.round((priceCents * direct.value) / 100) : Math.min(priceCents, direct.value);
        wasCents = wasCents ?? priceCents;
        priceCents -= cut;
        priceNote = direct.name;
      }
      const deal = direct ?? deals[0];

      const licensed = classes.licensed.includes(p.regClass);
      let stock: StockBadge;
      const atStore = who.storeId ? p.variants.reduce((s, v) => s + qty(who.storeId!, v.id), 0) : 0;
      if (licensed) {
        const stores = net.all.filter((id) => !net.dcs.includes(id) && p.variants.some((v) => qty(id, v.id) > 0)).length;
        stock = atStore > 0 ? { kind: "collect", store: who.storeName ?? null, stores } : stores ? { kind: "collect", store: null, stores } : { kind: "out" };
      } else if (atStore > 0) stock = { kind: "store", store: who.storeName ?? "your store", low: atStore <= 3 };
      else {
        const network = p.variants.reduce((s, v) => s + net.all.reduce((t, id) => t + qty(id, v.id), 0), 0);
        stock = network > 0 ? { kind: "ships", low: network <= 5 } : { kind: "out" };
      }

      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        regClass: p.regClass,
        strain: p.strain,
        heritage: p.heritage,
        featured: p.featured,
        category: { slug: p.category.slug, name: p.category.name, sortOrder: p.category.sortOrder },
        effects: p.effects.map((e) => e.toLowerCase()),
        priceCents,
        wasCents: wasCents && wasCents > priceCents ? wasCents : null,
        priceNote,
        variantCount: p.variants.length,
        firstVariantId: cheapest.v.id,
        deal: deal ? { name: deal.name, label: dealLabel(deal) } : null,
        stock,
        rating: ratings.get(p.id) ?? null,
        createdAt: p.createdAt,
        search: [p.name, p.tagline, p.description, p.category.name, ...p.effects, ...p.flavours, p.origin, p.lineage].filter(Boolean).join(" ").toLowerCase(),
      };
    });
}

/** Cards for arbitrary products, restricted to the given classes. */
export async function cardsWhere(where: Prisma.ProductWhereInput, classes: RegClass[], who: Shopper, take?: number) {
  const products = await db.product.findMany({
    where: { AND: [where, { status: "ACTIVE", regClass: { in: classes } }] },
    include: PRODUCT_INCLUDE,
    orderBy: [{ featured: "desc" }, { heritage: "desc" }, { name: "asc" }],
    take,
  });
  return buildCards(products, who);
}

// ── Listing ──────────────────────────────────────────────────────────────────
export const SORTS = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "rating", label: "Top rated" },
  { key: "new", label: "Newest" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

export type ListQuery = { category?: string; mood?: string; sort?: SortKey; min?: number; max?: number; q?: string; page: number };
export const PAGE_SIZE = 24;

export async function listCatalogue(scope: "public" | "licensed", q: ListQuery, who: Shopper) {
  const classes = await getClasses();
  const products = await db.product.findMany({
    where: { status: "ACTIVE", regClass: { in: scope === "public" ? classes.public : classes.licensed } },
    include: PRODUCT_INCLUDE,
  });
  const all = await buildCards(products, who);

  const categories = [...new Map(all.map((c) => [c.category.slug, c.category])).values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ ...c, count: all.filter((x) => x.category.slug === c.slug).length }));
  const moodCounts = new Map<string, number>();
  for (const c of all) for (const e of c.effects) moodCounts.set(e, (moodCounts.get(e) ?? 0) + 1);
  const moods = [...moodCounts].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));

  let rows = all;
  if (q.category) rows = rows.filter((c) => c.category.slug === q.category);
  if (q.mood) rows = rows.filter((c) => c.effects.includes(q.mood!));
  if (q.min != null) rows = rows.filter((c) => c.priceCents >= q.min! * 100);
  if (q.max != null) rows = rows.filter((c) => c.priceCents <= q.max! * 100);
  if (q.q) {
    const words = q.q.toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((c) => words.every((w) => c.search.includes(w)));
  }
  const byName = (a: ProductCard, b: ProductCard) => a.name.localeCompare(b.name);
  const sorters: Record<SortKey, (a: ProductCard, b: ProductCard) => number> = {
    featured: (a, b) => Number(b.featured) - Number(a.featured) || Number(b.heritage) - Number(a.heritage) || a.category.sortOrder - b.category.sortOrder || byName(a, b),
    "price-asc": (a, b) => a.priceCents - b.priceCents || byName(a, b),
    "price-desc": (a, b) => b.priceCents - a.priceCents || byName(a, b),
    rating: (a, b) => (b.rating?.avg ?? 0) - (a.rating?.avg ?? 0) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0) || byName(a, b),
    new: (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byName(a, b),
  };
  rows = [...rows].sort(sorters[q.sort ?? "featured"]);
  const prices = all.map((c) => c.priceCents);
  return {
    items: rows.slice((q.page - 1) * PAGE_SIZE, q.page * PAGE_SIZE),
    total: rows.length,
    categories,
    moods,
    priceBounds: { min: prices.length ? Math.floor(Math.min(...prices) / 100) : 0, max: prices.length ? Math.ceil(Math.max(...prices) / 100) : 0 },
  };
}

// ── Product detail helpers ───────────────────────────────────────────────────
export async function getProductBySlug(slug: string) {
  return db.product.findUnique({
    where: { slug },
    include: { category: true, variants: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
}

/** The lot a shopper is most likely to receive: next-to-sell (FEFO) at their store, else at the DCs. */
export async function currentBatch(variantId: string, storeId?: string | null) {
  const net = await getNetwork();
  const lot = await db.stockLevel.findFirst({
    where: { variantId, storeId: { in: storeId ? [storeId] : net.dcs }, onHand: { gt: 0 }, batch: { status: "RELEASED" } },
    orderBy: [{ batch: { expiresAt: "asc" } }, { batch: { packedAt: "asc" } }],
    select: { batch: true },
  });
  return lot?.batch ?? db.batch.findFirst({ where: { variantId, status: "RELEASED" }, orderBy: { packedAt: "desc" } });
}

/** Trading stores with sellable stock of a variant, nearest to the reference point first. */
export async function storesWithStock(variantIds: string[], from?: { lat: number | null; lng: number | null } | null) {
  const stores = await db.store.findMany({ where: { kind: "RETAIL", status: "ACTIVE" }, select: STORE_SELECT });
  const avail = variantIds.length ? await availability(stores.map((s) => s.id), variantIds) : new Map();
  const origin = from?.lat != null && from?.lng != null ? { lat: from.lat, lng: from.lng } : null;
  return stores
    .map((s) => ({
      store: s,
      qty: Object.fromEntries(variantIds.map((v) => [v, Math.max(0, avail.get(availKey(s.id, v))?.available ?? 0)])) as Record<string, number>,
      km: origin && s.lat != null && s.lng != null ? distanceKm(origin, { lat: s.lat, lng: s.lng }) : null,
    }))
    .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.store.city.localeCompare(b.store.city) || a.store.name.localeCompare(b.store.name));
}

export async function productReviews(productId: string, take: number) {
  const where = { productId, verified: true };
  const [agg, rows, dist] = await Promise.all([
    db.review.aggregate({ where, _avg: { rating: true }, _count: true }),
    db.review.findMany({ where, orderBy: { createdAt: "desc" }, take, include: { customer: { select: { firstName: true, lastName: true } } } }),
    db.review.groupBy({ by: ["rating"], where, _count: true }),
  ]);
  return {
    avg: agg._avg.rating ?? 0,
    count: agg._count,
    rows,
    distribution: [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: dist.find((d) => d.rating === r)?._count ?? 0 })),
  };
}
