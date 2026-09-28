import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { getClasses } from "@/server/shop/access";
import { ARTICLES } from "@/components/shop/learn/articles";
import { LEGAL_DOCS } from "@/lib/policies";
import { siteUrl } from "@/lib/seo";

// Rendered per request: always current, and the build (e.g. in Docker) needs no database.
export const dynamic = "force-dynamic";

// Bounds keep one request cheap at network scale (Google reads at most 50,000 URLs per sitemap anyway).
const MAX_PRODUCTS = 20_000;
const MAX_STORES = 5_000;

// Public pages only: licensed (medicine) products are never listed. lastModified is set only where a real timestamp
// exists (Product.updatedAt, the newest product in a category, article dates); stores, categories and static pages
// have none, and a made-up "now" would only teach crawlers to ignore the field.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const b = siteUrl();
  const classes = await getClasses();
  const now = new Date();
  const publicProduct = { status: "ACTIVE" as const, regClass: { in: classes.public } };
  const [products, stores, categoryStamps, drops, events] = await Promise.all([
    db.product.findMany({ where: publicProduct, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: MAX_PRODUCTS }),
    db.store.findMany({ where: { kind: "RETAIL", status: { in: ["ACTIVE", "OPENING_SOON"] } }, select: { slug: true }, orderBy: { slug: "asc" }, take: MAX_STORES }),
    db.product.groupBy({ by: ["categoryId"], where: publicProduct, _max: { updatedAt: true } }),
    db.drop.findMany({ where: { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }, select: { slug: true }, take: 100 }),
    db.storeEvent.findMany({ where: { endsAt: { gte: now } }, select: { slug: true }, take: 100 }),
  ]);
  const categories = categoryStamps.length ? await db.category.findMany({ where: { id: { in: categoryStamps.map((c) => c.categoryId) } }, select: { id: true, slug: true }, orderBy: { sortOrder: "asc" } }) : [];
  const stamp = new Map(categoryStamps.map((c) => [c.categoryId, c._max.updatedAt ?? undefined]));
  const learnUpdated = ARTICLES.map((a) => a.updated).sort().at(-1);
  return [
    { url: `${b}/`, changeFrequency: "daily", priority: 1 },
    { url: `${b}/shop`, changeFrequency: "daily", priority: 0.9 },
    ...categories.map((c) => ({ url: `${b}/shop?category=${c.slug}`, lastModified: stamp.get(c.id), changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${b}/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: `${b}/stores`, changeFrequency: "weekly", priority: 0.7 },
    ...stores.map((s) => ({ url: `${b}/stores/${s.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
    { url: `${b}/drops`, changeFrequency: "daily", priority: 0.7 },
    ...drops.map((d) => ({ url: `${b}/drops/${d.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...events.map((e) => ({ url: `${b}/events/${e.slug}`, changeFrequency: "daily" as const, priority: 0.5 })),
    { url: `${b}/learn`, lastModified: learnUpdated, changeFrequency: "monthly", priority: 0.6 },
    ...ARTICLES.map((a) => ({ url: `${b}/learn/${a.slug}`, lastModified: a.updated, changeFrequency: "monthly" as const, priority: 0.5 })),
    { url: `${b}/club/join`, changeFrequency: "monthly", priority: 0.5 },
    ...Object.keys(LEGAL_DOCS).map((s) => ({ url: `${b}/legal/${s}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
