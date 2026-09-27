// Online-order detail for the fulfilling store: lines with live availability and the
// FEFO lots to pick from, compliance flags, and the event timeline.
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { availability, availKey } from "@/server/inventory";
import { allocate } from "@/lib/fefo";

export type OrderEvent = { status: string; at: string; note?: string };

export async function orderForStore(storeId: string, id: string) {
  const o = await db.order.findFirst({
    where: { id, storeId },
    include: {
      customer: true,
      lines: { include: { variant: { select: { id: true, sku: true, name: true, grams: true, product: { select: { name: true, regClass: true } } } } } },
      sale: { select: { id: true, number: true, staff: { select: { name: true } } } },
    },
  });
  if (!o) return null;
  const variantIds = o.lines.map((l) => l.variantId);
  const [settings, avail, lots] = await Promise.all([
    getSettings(),
    availability([storeId], variantIds),
    db.stockLevel.findMany({
      where: { storeId, variantId: { in: variantIds }, onHand: { gt: 0 }, batch: { status: "RELEASED" } },
      select: { variantId: true, batchId: true, onHand: true, unitCostCents: true, batch: { select: { code: true, expiresAt: true, packedAt: true } } },
    }),
  ]);
  const c = settings.compliance;
  const lines = o.lines.map((l) => {
    const mine = lots.filter((x) => x.variantId === l.variantId);
    const pick = allocate(
      mine.map((x) => ({ batchId: x.batchId, onHand: x.onHand, unitCostCents: x.unitCostCents, sellable: true, expiresAt: x.batch.expiresAt, packedAt: x.batch.packedAt })),
      l.qty,
    );
    const code = new Map(mine.map((x) => [x.batchId, x.batch]));
    return {
      ...l,
      onHand: avail.get(availKey(storeId, l.variantId))?.onHand ?? 0,
      pick: pick.allocations.map((a) => ({ code: code.get(a.batchId)?.code ?? "—", expiresAt: code.get(a.batchId)?.expiresAt ?? null, qty: a.qty })),
      short: pick.short,
      licensed: c.licensedOnly.includes(l.variant.product.regClass),
    };
  });
  return {
    order: o,
    lines,
    events: ((o.events as OrderEvent[] | null) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at)),
    licensed: lines.some((l) => l.licensed),
    ageRestricted: o.lines.some((l) => c.ageRestricted.includes(l.variant.product.regClass)),
    medical: c.thcMode === "MEDICAL",
  };
}
