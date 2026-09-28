// Stock lookup at the till: on hand here, plus what nearby stores in the region can offer.
import { db } from "@/server/db";
import { availability, availKey } from "@/server/inventory";
import type { StockHit } from "./types";

const km = (a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }) => {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
};

export async function stockLookup(storeId: string, raw: string): Promise<StockHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId }, select: { id: true, regionId: true, lat: true, lng: true } });
  const variants = await db.variant.findMany({
    where: {
      active: true,
      product: { status: "ACTIVE" },
      OR: [
        { sku: { equals: q, mode: "insensitive" } },
        { barcode: q },
        { name: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        { product: { brand: { contains: q, mode: "insensitive" } } },
      ],
    },
    take: 12,
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    include: { product: { select: { id: true, slug: true, name: true, regClass: true, strain: true } }, storeVariants: { where: { storeId }, select: { priceCents: true } } },
  });
  if (!variants.length) return [];
  const others = await db.store.findMany({
    where: { regionId: store.regionId, kind: "RETAIL", status: "ACTIVE", id: { not: storeId } },
    select: { id: true, code: true, name: true, suburb: true, lat: true, lng: true },
  });
  const ids = variants.map((v) => v.id);
  const avail = await availability([storeId, ...others.map((o) => o.id)], ids);
  return variants.map((v) => {
    const here = avail.get(availKey(storeId, v.id)) ?? { onHand: 0, reserved: 0, available: 0 };
    const nearby = others
      .map((o) => ({ code: o.code, name: o.name, suburb: o.suburb, distanceKm: km(store, o), available: avail.get(availKey(o.id, v.id))?.available ?? 0 }))
      .filter((o) => o.available > 0)
      .sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9))
      .slice(0, 6);
    return {
      variantId: v.id,
      productId: v.product.id,
      slug: v.product.slug,
      name: v.product.name,
      variantName: v.name,
      sku: v.sku,
      barcode: v.barcode,
      regClass: v.product.regClass,
      strain: v.product.strain,
      priceCents: v.storeVariants[0]?.priceCents ?? v.priceCents,
      here,
      nearby,
    };
  });
}
