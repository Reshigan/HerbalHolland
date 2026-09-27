// Drops admin read models: variant options (never licensed medicines), live/upcoming/past status and
// performance — watchers, units sold since the drop opened (variant rollups) and stock left (availability).
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { availability } from "@/server/inventory";
import { toLocalInput } from "@/server/hq/form";
import { incentiveExcluded } from "@/lib/compliance";
import { dateOnly } from "@/lib/format";
import type { Tone } from "@/components/ui/badge";
import type { Drop, RegClass } from "@/generated/prisma/client";
import { firstOpen, type DropPhase } from "@/server/hq/launch-rules";
import type { DropValues } from "./drop-form";

export { dropPhase, earlyLabel, firstOpen } from "@/server/hq/launch-rules";

/** Classes a drop may never carry: licensed medicines (and anything excluded from incentives). */
export async function blockedClasses() {
  const { compliance } = await getSettings();
  return [...new Set([...incentiveExcluded(compliance), ...compliance.licensedOnly])] as RegClass[];
}

export async function variantOptions(keep: string[] = []) {
  const blocked = await blockedClasses();
  const rows = await db.variant.findMany({
    where: { OR: [{ active: true, product: { status: { not: "ARCHIVED" }, regClass: { notIn: blocked } } }, { id: { in: keep } }] },
    select: { id: true, name: true, sku: true, product: { select: { name: true, status: true, regClass: true, category: { select: { name: true } } } } },
    orderBy: [{ product: { category: { sortOrder: "asc" } } }, { product: { name: "asc" } }, { sortOrder: "asc" }],
  });
  return rows.map((v) => ({
    value: v.id,
    label: `${v.product.name} — ${v.name}`,
    hint: blocked.includes(v.product.regClass) ? "Not allowed" : v.product.status === "DRAFT" ? "Draft" : v.sku,
    group: v.product.category.name,
  }));
}

export const PHASE: Record<DropPhase, [string, Tone]> = {
  live: ["Live", "green"],
  early: ["Early access", "orange"],
  upcoming: ["Upcoming", "blue"],
  past: ["Ended", "neutral"],
};

/**
 * Watchers, units sold since opening (net of refunds, from the daily variant rollups; up to the end for past drops)
 * and stock available in the scoped stores and DCs, per drop and per variant.
 */
export async function dropStats(drops: Drop[], storeIds: string[], now = new Date()) {
  const ids = drops.map((d) => d.id);
  const variantIds = [...new Set(drops.flatMap((d) => d.variantIds))];
  const [watch, stores, sold] = await Promise.all([
    ids.length ? db.dropWatch.groupBy({ by: ["dropId"], where: { dropId: { in: ids } }, _count: true }) : [],
    db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, kind: true } }),
    Promise.all(
      drops.map(async (d) => {
        const from = firstOpen(d);
        if (from > now || !d.variantIds.length) return [] as { variantId: string; units: number }[];
        const to = d.endsAt && d.endsAt < now ? d.endsAt : now;
        const rows = await db.dailyVariantStat.groupBy({
          by: ["variantId"],
          where: { variantId: { in: d.variantIds }, storeId: { in: storeIds }, date: { gte: dateOnly(from), lte: dateOnly(to) } },
          _sum: { units: true },
        });
        return rows.map((r) => ({ variantId: r.variantId, units: r._sum.units ?? 0 }));
      }),
    ),
  ]);
  const retail = stores.filter((s) => s.kind === "RETAIL").map((s) => s.id);
  const dcs = stores.filter((s) => s.kind !== "RETAIL").map((s) => s.id);
  const [shelf, dc] = variantIds.length ? await Promise.all([availability(retail, variantIds), availability(dcs, variantIds)]) : [new Map(), new Map()];
  const sum = (m: Map<string, { available: number }>, variantId: string) => {
    let n = 0;
    for (const [k, a] of m) if (k.endsWith(`:${variantId}`)) n += Math.max(0, a.available);
    return n;
  };
  const watchers = new Map(watch.map((w) => [w.dropId, w._count]));
  return new Map(
    drops.map((d, i) => {
      const variants = d.variantIds.map((v) => ({ variantId: v, sold: sold[i].find((r) => r.variantId === v)?.units ?? 0, inStores: sum(shelf, v), atDcs: sum(dc, v) }));
      return [
        d.id,
        {
          watchers: watchers.get(d.id) ?? 0,
          sold: variants.reduce((s, v) => s + v.sold, 0),
          inStores: variants.reduce((s, v) => s + v.inStores, 0),
          atDcs: variants.reduce((s, v) => s + v.atDcs, 0),
          variants,
        },
      ];
    }),
  );
}

export function dropValues(d: Drop | null): DropValues {
  if (!d) {
    // Default: next Friday 09:00 SAST, inside the CPA contact window.
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + ((5 - next.getUTCDay() + 7) % 7 || 7));
    const start = new Date(`${next.toISOString().slice(0, 10)}T09:00:00+02:00`);
    return { name: "", slug: "", blurb: "", variantIds: [], startsAt: toLocalInput(start), endsAt: "", earlyTier: "", earlyMinutes: "60", perMemberLimit: "1", membersOnly: true };
  }
  return {
    name: d.name,
    slug: d.slug,
    blurb: d.blurb,
    variantIds: d.variantIds,
    startsAt: toLocalInput(d.startsAt),
    endsAt: toLocalInput(d.endsAt),
    earlyTier: d.earlyTier ?? "",
    earlyMinutes: String(d.earlyMinutes || 60),
    perMemberLimit: String(d.perMemberLimit),
    membersOnly: d.membersOnly,
  };
}
