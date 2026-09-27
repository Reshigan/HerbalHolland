import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { getClasses } from "@/server/shop/access";
import { ARTICLES } from "@/components/shop/learn/articles";

const base = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Public pages only: licensed (medicine) products are never listed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const b = base();
  const classes = await getClasses();
  const [products, stores, categories] = await Promise.all([
    db.product.findMany({ where: { status: "ACTIVE", regClass: { in: classes.public } }, select: { slug: true, updatedAt: true } }),
    db.store.findMany({ where: { kind: "RETAIL", status: { in: ["ACTIVE", "OPENING_SOON"] } }, select: { slug: true } }),
    db.category.findMany({ where: { products: { some: { status: "ACTIVE", regClass: { in: classes.public } } } }, select: { slug: true } }),
  ]);
  const now = new Date();
  return [
    { url: `${b}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${b}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ...categories.map((c) => ({ url: `${b}/shop?category=${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${b}/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: `${b}/stores`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...stores.map((s) => ({ url: `${b}/stores/${s.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.6 })),
    { url: `${b}/learn`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    ...ARTICLES.map((a) => ({ url: `${b}/learn/${a.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.5 })),
    { url: `${b}/club/join`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...["terms", "privacy", "paia"].map((s) => ({ url: `${b}/legal/${s}`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
