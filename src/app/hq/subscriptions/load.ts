import { db } from "@/server/db";
import { planCandidates } from "@/server/shop/subscriptions";
import type { PickOption } from "@/components/hq/multi-pick";

/** The plan editor's choices: products a plan may offer (plus any already on it) and the open stores. */
export async function planOptions(keep: string[] = []) {
  const [candidates, kept, stores] = await Promise.all([
    planCandidates(),
    keep.length ? db.variant.findMany({ where: { id: { in: keep } }, select: { id: true, sku: true, name: true, product: { select: { name: true } } } }) : [],
    db.store.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 2000 }),
  ]);
  const seen = new Set<string>();
  const products: PickOption[] = [...candidates, ...kept]
    .filter((v) => !seen.has(v.id) && seen.add(v.id))
    .map((v) => ({ value: v.id, label: `${v.product.name} · ${v.name}`, hint: v.sku }));
  return { products, stores: stores.map((s): PickOption => ({ value: s.id, label: s.name, hint: s.code })) };
}
