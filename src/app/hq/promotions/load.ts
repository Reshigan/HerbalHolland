// Shared loaders for the promotion editor pages (options + form values).
import { db } from "@/server/db";
import { clock, toLocalInput } from "@/server/hq/form";
import { centsToInput } from "@/lib/money";
import type { Promotion } from "@/generated/prisma/client";
import type { PromoValues } from "./promotion-form";

export async function promoOptions() {
  const [categories, products, stores] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, name: true, regClass: true, category: { select: { name: true, sortOrder: true } } }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }] }),
    db.store.findMany({ where: { kind: "RETAIL", status: { not: "CLOSED" } }, select: { id: true, code: true, name: true, region: { select: { name: true } } }, orderBy: { name: "asc" } }),
  ]);
  return {
    categories: categories.map((c) => ({ value: c.id, label: c.name })),
    products: products.map((p) => ({ value: p.id, label: p.name, hint: p.regClass === "THC" ? "Licensed" : undefined, group: p.category.name })),
    stores: stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})`, hint: s.region.name })),
  };
}

export function promoValues(p: Promotion | null): PromoValues {
  const nextHour = new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000);
  if (!p)
    return {
      name: "", description: "", kind: "PERCENT", percent: "", amount: "", multiplier: "2", bundlePrice: "", buyQty: "", getQty: "1", rewardPercent: "100",
      minSpend: "", categoryIds: [], productIds: [], rewardCategoryIds: [], rewardProductIds: [], channels: ["POS", "ONLINE"], storeIds: [], days: [],
      startTime: "", endTime: "", startsAt: toLocalInput(nextHour), endsAt: toLocalInput(new Date(nextHour.getTime() + 30 * 86_400_000)),
      code: "", maxUses: "", active: true, firstPurchaseOnly: false,
    };
  return {
    name: p.name, description: p.description ?? "", kind: p.kind,
    percent: p.kind === "PERCENT" ? String(p.value) : "", amount: p.kind === "FIXED" ? centsToInput(p.value) : "",
    multiplier: p.kind === "MULTIPLIER" ? String(p.value / 100) : "2", bundlePrice: p.kind === "MULTIBUY" ? centsToInput(p.value) : "",
    buyQty: p.buyQty?.toString() ?? "", getQty: p.getQty?.toString() ?? "1", rewardPercent: p.rewardPercent?.toString() ?? "100",
    minSpend: p.minSpendCents ? centsToInput(p.minSpendCents) : "", categoryIds: p.categoryIds, productIds: p.productIds,
    rewardCategoryIds: p.rewardCategoryIds, rewardProductIds: p.rewardProductIds, channels: p.channels, storeIds: p.storeIds, days: p.days,
    startTime: clock(p.startMinute), endTime: clock(p.endMinute), startsAt: toLocalInput(p.startsAt), endsAt: toLocalInput(p.endsAt),
    code: p.code ?? "", maxUses: p.maxUses?.toString() ?? "", active: p.active, firstPurchaseOnly: p.firstPurchaseOnly,
  };
}
