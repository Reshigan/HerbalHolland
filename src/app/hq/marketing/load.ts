// Composer options shared by the new-campaign and draft pages.
import { db } from "@/server/db";
import { senderFooter } from "@/server/marketing";
import { describePromo, type PromoInput } from "@/lib/promotions";

/** Stores load on demand in the composer (a network can have 1,000): only the regions and the chosen store come here. */
export async function composerOptions(storeIds: string[], storeId?: string | null) {
  const [selected, regions, promos, email, text, push] = await Promise.all([
    storeId ? db.store.findFirst({ where: { id: storeId, AND: [{ id: { in: storeIds } }] }, select: { id: true, name: true, code: true, city: true } }) : null,
    db.region.findMany({ where: { stores: { some: { id: { in: storeIds }, kind: "RETAIL" } } }, select: { code: true, name: true }, orderBy: { name: "asc" } }),
    db.promotion.findMany({ where: { active: true, endsAt: { gte: new Date() } }, orderBy: { startsAt: "desc" }, take: 100 }),
    senderFooter("EMAIL"),
    senderFooter("SMS"),
    senderFooter("PUSH"),
  ]);
  return {
    selectedStore: selected,
    regions,
    promotions: promos.map((p) => ({ id: p.id, code: p.code, label: `${p.name} — ${describePromo(p as PromoInput)}${p.code ? ` · ${p.code}` : " · no code"}` })),
    footers: { email, text, push },
  };
}
