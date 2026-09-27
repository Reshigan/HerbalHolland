// Storefront reads for the launch programme: drops, events and tickets, welcome gifts and My Deals.
// Business rules live in the domain services (drops, events, offers, launch); this shapes their data for pages.
import { db } from "@/server/db";
import { availability, availKey } from "@/server/inventory";
import { activePromotions } from "@/server/pricing";
import { activeOffers, offerPromo } from "@/server/offers";
import { getClasses } from "./access";
import { getNetwork } from "./catalogue";
import { STORE_SELECT } from "./context";
import { dropPhase } from "./launch-rules";
import { describePromo } from "@/lib/promotions";
import type { TierKey } from "@/lib/loyalty-rules";
import type { Drop, Prisma } from "@/generated/prisma/client";

// ── Drops ────────────────────────────────────────────────────────────────────
export type DropView = Awaited<ReturnType<typeof withDropDetails>>[number];

/** Adds the shopper's phase, the drop's (public) products for artwork and units left across the network. */
async function withDropDetails(drops: Drop[], tier: TierKey | null, at: Date) {
  const ids = [...new Set(drops.flatMap((d) => d.variantIds))];
  if (!ids.length) return drops.map((d) => ({ ...d, ...dropPhase(d, tier, at), products: [], left: 0 }));
  const [variants, classes, net] = await Promise.all([
    db.variant.findMany({ where: { id: { in: ids } }, select: { id: true, product: { select: { id: true, slug: true, name: true, strain: true, regClass: true, status: true } } } }),
    getClasses(),
    getNetwork(),
  ]);
  const avail = await availability(net.all, ids);
  const byId = new Map(variants.map((v) => [v.id, v.product]));
  return drops.map((d) => {
    // Drops never carry medicines; never show one on a public card even if misconfigured.
    const products = [...new Map(d.variantIds.map((id) => byId.get(id)).filter((p) => !!p && p.status === "ACTIVE" && classes.public.includes(p.regClass)).map((p) => [p!.id, p!])).values()];
    const left = d.variantIds.reduce((s, v) => s + net.all.reduce((t, st) => t + Math.max(0, avail.get(availKey(st, v))?.available ?? 0), 0), 0);
    return { ...d, ...dropPhase(d, tier, at), products, left };
  });
}

/** /drops: live and upcoming drops (all), past drops paginated. */
export async function listDrops(tier: TierKey | null, page: number, pageSize = 12, at = new Date()) {
  const current: Prisma.DropWhereInput = { OR: [{ endsAt: null }, { endsAt: { gt: at } }] };
  const past: Prisma.DropWhereInput = { endsAt: { lte: at } };
  const [open, ended, total] = await Promise.all([
    db.drop.findMany({ where: current, orderBy: { startsAt: "asc" }, take: 48 }),
    db.drop.findMany({ where: past, orderBy: { endsAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.drop.count({ where: past }),
  ]);
  const [openV, endedV] = await Promise.all([withDropDetails(open, tier, at), withDropDetails(ended, tier, at)]);
  return {
    live: openV.filter((d) => d.phase !== "upcoming").reverse(), // newest first
    upcoming: openV.filter((d) => d.phase === "upcoming"),
    past: endedV,
    pastTotal: total,
  };
}

export async function getDrop(slug: string, tier: TierKey | null, at = new Date()) {
  const d = await db.drop.findUnique({ where: { slug } });
  return d ? (await withDropDetails([d], tier, at))[0] : null;
}

/** The drop to feature: live now (newest), else the next one to open. */
export async function featuredDrop(tier: TierKey | null, at = new Date()) {
  const [live, next] = await Promise.all([
    db.drop.findFirst({ where: { startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] }, orderBy: { startsAt: "desc" } }),
    db.drop.findFirst({ where: { startsAt: { gt: at } }, orderBy: { startsAt: "asc" } }),
  ]);
  const d = live ?? next;
  return d ? (await withDropDetails([d], tier, at))[0] : null;
}

export const isWatching = (dropId: string, customerId: string) => db.dropWatch.findUnique({ where: { dropId_customerId: { dropId, customerId } } }).then(Boolean);

// ── Events ───────────────────────────────────────────────────────────────────
const EVENT_STORE = { select: { name: true, slug: true, code: true, suburb: true, city: true, status: true } } as const;

/** Events that haven't ended, soonest first (optionally at one store, or with a member's home store first). */
export async function upcomingEvents(opts: { storeId?: string; homeStoreId?: string | null; take?: number } = {}, at = new Date()) {
  const take = opts.take ?? 6;
  const rows = await db.storeEvent.findMany({
    where: { endsAt: { gt: at }, ...(opts.storeId ? { storeId: opts.storeId } : { store: { status: { in: ["ACTIVE", "OPENING_SOON"] } } }) },
    orderBy: { startsAt: "asc" },
    take: opts.homeStoreId ? take * 4 : take,
    include: { store: EVENT_STORE, _count: { select: { rsvps: true } } },
  });
  const home = opts.homeStoreId;
  const ordered = home ? [...rows].sort((a, b) => Number(b.storeId === home) - Number(a.storeId === home)) : rows; // stable: soonest first within each
  return ordered.slice(0, take).map(({ _count, ...e }) => ({ ...e, left: Math.max(0, e.capacity - _count.rsvps) }));
}
export type EventCard = Awaited<ReturnType<typeof upcomingEvents>>[number];

export async function getEvent(slug: string, customerId?: string | null) {
  const e = await db.storeEvent.findUnique({ where: { slug }, include: { store: { select: STORE_SELECT }, _count: { select: { rsvps: true } } } });
  if (!e) return null;
  const mine = customerId ? await db.rsvp.findUnique({ where: { eventId_customerId: { eventId: e.id, customerId } } }) : null;
  const { _count, ...rest } = e;
  return { ...rest, left: Math.max(0, e.capacity - _count.rsvps), mine };
}

/** A member's tickets for events that haven't ended. */
export const memberTickets = (customerId: string, at = new Date()) =>
  db.rsvp.findMany({
    where: { customerId, event: { endsAt: { gt: at } } },
    orderBy: { event: { startsAt: "asc" } },
    take: 12,
    include: { event: { include: { store: EVENT_STORE } } },
  });

// ── Welcome gifts & My Deals ─────────────────────────────────────────────────
/** Live first-purchase gifts for a member who hasn't bought yet (the pricing engine applies them). */
export async function welcomeGifts(c: { visits: number } | null | undefined, storeId?: string | null) {
  if (!c || c.visits > 0) return [];
  const [promos, classes] = await Promise.all([activePromotions({ channel: "ONLINE", storeId }), getClasses()]);
  const gifts = promos.filter((p) => p.firstPurchaseOnly && !p.code);
  const ids = gifts.flatMap((g) => g.rewardProductIds);
  const products = ids.length
    ? await db.product.findMany({
        where: { id: { in: ids }, status: "ACTIVE", regClass: { in: classes.public } },
        select: { id: true, slug: true, name: true, strain: true, regClass: true, variants: { where: { active: true }, orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } } },
      })
    : [];
  return gifts.flatMap((g) => {
    const p = products.find((x) => g.rewardProductIds.includes(x.id) && x.variants.length);
    if (g.rewardProductIds.length && !p) return []; // reward not available to the public: don't advertise it
    return [{ id: g.id, name: g.name, description: g.description, product: p ? { slug: p.slug, name: p.name, strain: p.strain, regClass: p.regClass, variantId: p.variants[0].id } : null }];
  });
}
export type WelcomeGift = Awaited<ReturnType<typeof welcomeGifts>>[number];

/** The member's live My Deals with a plain label ("15% off") and the product they're for. */
export async function memberDeals(customerId: string) {
  const offers = await activeOffers(customerId);
  const ids = [...new Set(offers.flatMap((o) => o.productIds))];
  const products = ids.length ? await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true, strain: true, regClass: true } }) : [];
  return offers.map((o) => ({ ...o, label: describePromo(offerPromo(o)), product: products.find((p) => o.productIds.includes(p.id)) ?? null }));
}
