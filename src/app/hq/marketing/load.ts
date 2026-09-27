// Composer options shared by the new-campaign and draft pages.
import { db } from "@/server/db";
import { senderFooter } from "@/server/marketing";
import { describePromo, type PromoInput } from "@/lib/promotions";

export async function composerOptions(storeIds: string[]) {
  const [stores, promos, email, text, push] = await Promise.all([
    db.store.findMany({ where: { id: { in: storeIds }, kind: "RETAIL", status: { not: "CLOSED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.promotion.findMany({ where: { active: true, endsAt: { gte: new Date() } }, orderBy: { startsAt: "desc" }, take: 100 }),
    senderFooter("EMAIL"),
    senderFooter("SMS"),
    senderFooter("PUSH"),
  ]);
  return {
    stores,
    promotions: promos.map((p) => ({ id: p.id, code: p.code, label: `${p.name} — ${describePromo(p as PromoInput)}${p.code ? ` · ${p.code}` : " · no code"}` })),
    footers: { email, text, push },
  };
}
