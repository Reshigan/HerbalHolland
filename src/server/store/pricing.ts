// Shelf-price workbench: every ranged SKU with its RRP, the list price that applies at
// this store (zones, scheduled changes), the franchisee's own price and the margin.
import { db } from "@/server/db";
import { activePriceLists } from "@/server/pricing";
import { listApplies, marginPct, resolvePrice } from "@/lib/pricing-rules";

export type PriceRow = {
  variantId: string;
  sku: string;
  name: string;
  category: string;
  categorySlug: string;
  rrpCents: number;
  listCents: number;
  listName: string | null;
  shelfCents: number | null;
  effectiveCents: number;
  wholesaleCents: number;
  margin: number;
};

export async function priceRows(store: { id: string; regionId: string }): Promise<PriceRow[]> {
  const at = new Date();
  const [ranged, lists] = await Promise.all([
    db.storeVariant.findMany({
      where: { storeId: store.id, variant: { active: true } },
      select: {
        priceCents: true,
        variant: { select: { id: true, sku: true, name: true, priceCents: true, wholesaleCents: true, product: { select: { name: true, category: { select: { name: true, slug: true } } } } } },
      },
    }),
    activePriceLists(at),
  ]);
  const ctx = { storeId: store.id, regionId: store.regionId, channel: "POS" as const, member: false, tier: null, at };
  const live = lists.filter((l) => l.kind !== "MEMBER" && listApplies(l, ctx)).sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime());
  return ranged
    .map(({ priceCents, variant: v }) => {
      const list = resolvePrice({ variantId: v.id, rrpCents: v.priceCents, storeShelfCents: null, qty: 1, incentives: false }, lists, ctx).shelfCents;
      const source = live.find((l) => l.items.some((i) => i.variantId === v.id && i.minQty <= 1) || l.adjustPct != null);
      const effective = priceCents ?? list;
      return {
        variantId: v.id,
        sku: v.sku,
        name: `${v.product.name} · ${v.name}`,
        category: v.product.category.name,
        categorySlug: v.product.category.slug,
        rrpCents: v.priceCents,
        listCents: list,
        listName: list !== v.priceCents ? source?.name ?? null : null,
        shelfCents: priceCents,
        effectiveCents: effective,
        wholesaleCents: v.wholesaleCents,
        margin: marginPct(effective, v.wholesaleCents),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
