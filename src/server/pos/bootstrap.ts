// Everything a till needs to keep selling without a connection: store (licences, VAT
// status), staff tiles, catalogue with this store's shelf prices and stock, the price
// lists and promotions that may apply in the next 24 hours, the limited drops governing
// its products (live or upcoming), and compliance/loyalty rules.
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { availability, availKey } from "@/server/inventory";
import { tapProvider } from "@/server/payments";
import { dropsFor } from "@/server/drops";
import { addDays } from "@/lib/format";
import { PRODUCT_FACTS, type RegClass } from "@/lib/compliance";
import { asList } from "@/lib/json-list";
import { promotionRow, promoRunsAt } from "@/server/pricing";
import { staffTiles } from "./session";
import type { PosDevice } from "./http";
import type { BootData, BootShift, TierKey } from "./types";

export async function currentShift(device: { id: string; storeId: string }): Promise<BootShift | null> {
  const s = await db.shift.findFirst({ where: { storeId: device.storeId, deviceId: device.id, closedAt: null }, orderBy: { openedAt: "desc" } });
  if (!s) return null;
  const by = await db.user.findUnique({ where: { id: s.openedById }, select: { name: true } });
  return { id: s.id, openedAt: s.openedAt.toISOString(), openingFloatCents: s.openingFloatCents, openedBy: by?.name ?? "—" };
}

/** Near-expiry markdown % per variant, judged on the next lot to sell (FEFO). Mirrors quote(). */
async function markdowns(storeId: string, at: Date, days: number, pct: number) {
  const out = new Map<string, number>();
  if (!pct) return out;
  const lots = await db.stockLevel.findMany({
    where: { storeId, onHand: { gt: 0 }, batch: { status: "RELEASED", expiresAt: { not: null } } },
    select: { variantId: true, batch: { select: { expiresAt: true } } },
    orderBy: { batch: { expiresAt: "asc" } },
  });
  for (const l of lots) if (!out.has(l.variantId)) out.set(l.variantId, l.batch.expiresAt! <= addDays(at, days) ? pct : 0);
  return out;
}

export async function buildBootstrap(device: PosDevice, origin: string): Promise<BootData> {
  const now = new Date();
  const horizon = addDays(now, 1);
  const store = await db.store.findUniqueOrThrow({ where: { id: device.storeId }, include: { company: true } });
  const settings = await getSettings();
  const [categories, products, ranged, avail, promos, lists, marks, shift, staff, fresh] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true, icon: true } }),
    db.product.findMany({
      where: { status: "ACTIVE" },
      include: { variants: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: [{ featured: "desc" }, { name: "asc" }],
    }),
    db.storeVariant.findMany({ where: { storeId: store.id }, select: { variantId: true, priceCents: true } }),
    availability([store.id]),
    // Channel, store and region are JSON lists: the few promotions and price lists live in the window are matched here.
    db.promotion
      .findMany({ where: { active: true, startsAt: { lte: horizon }, endsAt: { gte: now } }, orderBy: { createdAt: "desc" } })
      .then((rows) => rows.map(promotionRow).filter((p) => promoRunsAt(p, "POS", store.id))),
    db.priceList
      .findMany({
        where: { active: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: horizon } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
        include: { items: { select: { variantId: true, priceCents: true, minQty: true } } },
      })
      .then((rows) =>
        rows
          .map((l) => ({ ...l, tiers: asList<TierKey>(l.tiers), storeIds: asList<string>(l.storeIds), regionIds: asList<string>(l.regionIds) }))
          .filter((l) => (!l.storeIds.length && !l.regionIds.length) || l.storeIds.includes(store.id) || l.regionIds.includes(store.regionId)),
      ),
    markdowns(store.id, now, settings.pricing.markdownDays, settings.pricing.markdownPct),
    currentShift(device),
    staffTiles(store.id),
    db.device.findUniqueOrThrow({ where: { id: device.id }, select: { seq: true } }),
  ]);
  // The store's next event: the till's quiet-hours dashboard and customer display mention it.
  const nextEvent = await db.storeEvent.findFirst({ where: { storeId: store.id, endsAt: { gte: now } }, orderBy: { startsAt: "asc" }, select: { title: true, startsAt: true, endsAt: true } });

  const shelf = new Map(ranged.map((r) => [r.variantId, r.priceCents]));
  const licensedOnly = settings.compliance.licensedOnly;
  const licences = asList<RegClass>(store.licences);
  const catalogue = products
    // Licence-gated classes only appear where the store holds the licence.
    .filter((p) => !licensedOnly.includes(p.regClass) || licences.includes(p.regClass))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      tagline: p.tagline,
      categoryId: p.categoryId,
      regClass: p.regClass,
      strain: p.strain,
      tobaccoRelated: p.tobaccoRelated,
      featured: p.featured,
      facts: PRODUCT_FACTS[p.regClass] ? { netContent: p.netContent, netUnit: p.netUnit, ingredients: p.ingredients, allergens: asList<string>(p.allergens) } : null,
      variants: p.variants
        .filter((v) => shelf.has(v.id) || (avail.get(availKey(store.id, v.id))?.onHand ?? 0) !== 0)
        .map((v) => {
          const a = avail.get(availKey(store.id, v.id));
          return {
            id: v.id,
            sku: v.sku,
            barcode: v.barcode,
            name: v.name,
            grams: v.grams,
            rrpCents: v.priceCents,
            shelfCents: shelf.get(v.id) ?? null,
            markdownPct: marks.get(v.id) ?? 0,
            onHand: a?.onHand ?? 0,
            available: a?.available ?? 0,
          };
        }),
    }))
    .filter((p) => p.variants.length > 0);
  const onTill = new Set(catalogue.flatMap((p) => p.variants.map((v) => v.id)));
  const drops = await dropsFor([...onTill], now);

  return {
    version: 1,
    fetchedAt: now.toISOString(),
    device: { id: device.id, name: device.name, prefix: device.prefix, seq: fresh.seq },
    store: {
      id: store.id,
      code: store.code,
      name: store.name,
      legalName: store.company.legalName,
      vatNumber: store.company.vatNumber,
      vatRegistered: !!store.company.vatNumber,
      addressLine: store.addressLine,
      suburb: store.suburb,
      city: store.city,
      postalCode: store.postalCode,
      phone: store.phone,
      email: store.email,
      licences,
      licenceRef: store.licenceRef,
      receiptFooter: store.receiptFooter,
      regionId: store.regionId,
      payshapId: store.payshapId,
    },
    staff,
    categories,
    products: catalogue,
    promotions: promos.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      code: p.code,
      kind: p.kind,
      value: p.value,
      categoryIds: p.categoryIds,
      productIds: p.productIds,
      minSpendCents: p.minSpendCents,
      buyQty: p.buyQty,
      getQty: p.getQty,
      rewardPercent: p.rewardPercent,
      rewardCategoryIds: p.rewardCategoryIds,
      rewardProductIds: p.rewardProductIds,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      days: p.days,
      startMinute: p.startMinute,
      endMinute: p.endMinute,
      firstPurchaseOnly: p.firstPurchaseOnly,
    })),
    drops: drops.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      variantIds: asList<string>(d.variantIds).filter((id) => onTill.has(id)),
      startsAt: d.startsAt.toISOString(),
      endsAt: d.endsAt?.toISOString() ?? null,
      earlyTier: (d.earlyTier as TierKey | null) ?? null,
      earlyMinutes: d.earlyMinutes,
      perMemberLimit: d.perMemberLimit,
      membersOnly: d.membersOnly,
    })),
    priceLists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      channel: l.channel,
      tiers: l.tiers,
      storeIds: l.storeIds,
      regionIds: l.regionIds,
      adjustPct: l.adjustPct,
      active: l.active,
      priority: l.priority,
      items: l.items,
      startsAt: l.startsAt?.toISOString() ?? null,
      endsAt: l.endsAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
    settings: {
      compliance: settings.compliance,
      loyalty: {
        earnPer100: settings.loyalty.earnPer100,
        minRedeem: settings.loyalty.minRedeem,
        maxRedeemPct: settings.loyalty.maxRedeemPct,
        tierSavingsPct: settings.loyalty.tierSavingsPct,
      },
    },
    shift,
    nextEvent: nextEvent ? { title: nextEvent.title, startsAt: nextEvent.startsAt.toISOString(), endsAt: nextEvent.endsAt.toISOString() } : null,
    tapProvider: tapProvider(),
    joinUrl: `${process.env.APP_URL ?? origin}/club/join?store=${encodeURIComponent(store.code)}`,
  };
}
