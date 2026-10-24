// The in-store menu board's data: this store's ranged public catalogue with live availability, walk-in prices and
// the member price where the law lets us offer one (never on licensed medicines or CBD supplements; see incentiveExcluded).
// Sold-out items stay on the board, greyed, so the screen doesn't jump; /menu/[slug]/live serves the 60 s refresh.
import { SHOWN_RANGE } from "@/lib/range";
import { db } from "./db";
import { availability, availKey } from "./inventory";
import { activePriceLists } from "./pricing";
import { getSettings } from "./settings";
import { getClasses } from "./shop/access";
import { resolvePrice, type PriceContext } from "@/lib/pricing-rules";
import type { RegClass } from "@/lib/compliance";

export type BoardItem = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  tagline: string | null;
  strain: string | null;
  regClass: RegClass;
  heritage: boolean;
  variant: string;
  priceCents: number;
  wasCents: number | null;
  /** The entry-tier member price, or null where incentives aren't allowed on this class (or it saves nothing). */
  memberCents: number | null;
  qty: number;
};
export type BoardCategory = { slug: string; name: string; blurb: string | null; items: BoardItem[] };

/** A live stock/price snapshot for the client script: v = variant id, q = available, p = price, m = member price. */
export type BoardLive = { at: string; items: { v: string; q: number; p: number; m: number | null }[] };

export function boardStore(slug: string) {
  return db.store.findFirst({
    where: { slug, kind: "RETAIL", status: { in: ["ACTIVE", "OPENING_SOON"] } },
    select: { id: true, code: true, name: true, slug: true, hours: true, addressLine: true, suburb: true, city: true, licences: true },
  });
}

async function priced(storeId: string, includeLicensed: boolean) {
  const [classes, settings] = await Promise.all([getClasses(), getSettings()]);
  const regClasses = includeLicensed ? [...classes.public, ...classes.licensed] : classes.public;
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
  const at = new Date();
  const walkIn: PriceContext = { storeId, regionId: store.regionId, channel: "POS", member: false, tier: null, at };
  const member: PriceContext = { ...walkIn, member: true, tier: "SEED", tierPct: settings.loyalty.tierSavingsPct.SEED };
  return ranged.map((r) => {
    const p = r.variant.product;
    const incentives = !classes.noIncentives.includes(p.regClass);
    const v = { variantId: r.variant.id, rrpCents: r.variant.priceCents, storeShelfCents: r.priceCents, qty: 1, incentives };
    const price = resolvePrice(v, lists, walkIn);
    const mine = incentives ? resolvePrice(v, lists, member) : null;
    const item: BoardItem = {
      productId: p.id, slug: p.slug, name: p.name, tagline: p.tagline, strain: p.strain, regClass: p.regClass, heritage: p.heritage,
      variantId: r.variant.id, variant: r.variant.name,
      priceCents: price.unitCents,
      wasCents: price.shelfCents > price.unitCents ? price.shelfCents : null,
      memberCents: mine && mine.unitCents < price.unitCents ? mine.unitCents : null,
      qty: Math.max(0, avail.get(availKey(storeId, r.variant.id))?.available ?? 0),
    };
    return { item, category: p.category, sortOrder: r.variant.sortOrder };
  });
}

/** Categories in menu order; in-stock and heritage lines first, sold-out lines kept (greyed on the board). */
export async function boardMenu(storeId: string, opts: { includeLicensed: boolean }): Promise<BoardCategory[]> {
  const rows = await priced(storeId, opts.includeLicensed);
  const cats = new Map<string, BoardCategory & { sortOrder: number }>();
  for (const { item, category } of rows) {
    const c = cats.get(category.slug) ?? { slug: category.slug, name: category.name, blurb: category.blurb, sortOrder: category.sortOrder, items: [] };
    c.items.push(item);
    cats.set(category.slug, c);
  }
  return [...cats.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _s, ...c }) => ({ ...c, items: c.items.sort((a, b) => Number(b.qty > 0) - Number(a.qty > 0) || Number(b.heritage) - Number(a.heritage) || a.name.localeCompare(b.name) || a.priceCents - b.priceCents) }));
}

export async function boardLive(storeId: string, opts: { includeLicensed: boolean }): Promise<BoardLive> {
  const rows = await priced(storeId, opts.includeLicensed);
  return { at: new Date().toISOString(), items: rows.map(({ item }) => ({ v: item.variantId, q: item.qty, p: item.priceCents, m: item.memberCents })) };
}
