// A store's live, in-stock menu at its own shelf prices (franchisees set their own
// prices in store), grouped by category. Shared by the store page and the TV menu board.
import { SHOWN_RANGE } from "@/lib/range";
import { db } from "@/server/db";
import { activePriceLists, activePromotions } from "@/server/pricing";
import { availability, availKey } from "@/server/inventory";
import { getClasses } from "./access";
import { resolvePrice, type PriceContext } from "@/lib/pricing-rules";
import type { RegClass } from "@/lib/compliance";

export type MenuItem = {
  productId: string;
  slug: string;
  name: string;
  tagline: string | null;
  strain: string | null;
  regClass: RegClass;
  heritage: boolean;
  variantId: string;
  variant: string;
  priceCents: number;
  wasCents: number | null;
  qty: number;
};

export async function storeMenu(storeId: string, opts: { tier?: string | null; includeLicensed?: boolean } = {}) {
  const classes = await getClasses();
  const regClasses = opts.includeLicensed ? [...classes.public, ...classes.licensed] : classes.public;
  const [store, ranged, lists] = await Promise.all([
    db.store.findUniqueOrThrow({ where: { id: storeId }, select: { id: true, regionId: true } }),
    db.storeVariant.findMany({
      where: { storeId, variant: { active: true, product: { status: "ACTIVE", regClass: { in: regClasses }, ...SHOWN_RANGE } } },
      select: {
        priceCents: true,
        variant: {
          select: {
            id: true, name: true, priceCents: true, sortOrder: true,
            product: { select: { id: true, slug: true, name: true, tagline: true, strain: true, regClass: true, heritage: true, category: { select: { slug: true, name: true, sortOrder: true, blurb: true } } } },
          },
        },
      },
    }),
    activePriceLists(),
  ]);
  const avail = await availability([storeId], ranged.map((r) => r.variant.id));
  const ctx: PriceContext = { storeId, regionId: store.regionId, channel: "POS", member: opts.tier != null, tier: (opts.tier ?? null) as PriceContext["tier"], at: new Date() };

  const cats = new Map<string, { slug: string; name: string; blurb: string | null; sortOrder: number; items: MenuItem[] }>();
  for (const r of ranged) {
    const qty = Math.max(0, avail.get(availKey(storeId, r.variant.id))?.available ?? 0);
    if (qty <= 0) continue;
    const p = r.variant.product;
    const price = resolvePrice(
      { variantId: r.variant.id, rrpCents: r.variant.priceCents, storeShelfCents: r.priceCents, qty: 1, incentives: !classes.noIncentives.includes(p.regClass) },
      lists,
      ctx,
    );
    const c = cats.get(p.category.slug) ?? { slug: p.category.slug, name: p.category.name, blurb: p.category.blurb, sortOrder: p.category.sortOrder, items: [] };
    c.items.push({
      productId: p.id, slug: p.slug, name: p.name, tagline: p.tagline, strain: p.strain, regClass: p.regClass, heritage: p.heritage,
      variantId: r.variant.id, variant: r.variant.name, priceCents: price.unitCents, wasCents: price.shelfCents > price.unitCents ? price.shelfCents : null, qty,
    });
    cats.set(p.category.slug, c);
  }
  return [...cats.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => ({ ...c, items: c.items.sort((a, b) => Number(b.heritage) - Number(a.heritage) || a.name.localeCompare(b.name) || a.priceCents - b.priceCents) }));
}

/** Deals running in this store today (network-wide or store-specific), never on medicines. */
export async function storeDeals(storeId: string) {
  const promos = await activePromotions({ storeId, channel: "POS" });
  return promos.filter((p) => !p.code);
}
