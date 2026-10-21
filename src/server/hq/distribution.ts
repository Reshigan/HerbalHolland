// Distribution centre operations: stock health (on hand vs committed vs demand) and
// FEFO pick lists for approved store orders.
import { db } from "@/server/db";
import { allocate } from "@/lib/fefo";
import { addDays } from "@/lib/format";

export async function dcStockHealth(dcId: string) {
  const since = addDays(new Date(), -28);
  const [released, blocked, committed, shipped, lots] = await Promise.all([
    db.stockLevel.groupBy({ by: ["variantId"], where: { storeId: dcId, batch: { status: "RELEASED" } }, _sum: { onHand: true } }),
    db.stockLevel.groupBy({ by: ["variantId"], where: { storeId: dcId, onHand: { gt: 0 }, batch: { status: { not: "RELEASED" } } }, _sum: { onHand: true } }),
    db.$queryRaw<{ variantId: string; qty: number }[]>`
      SELECT l."variantId", SUM(l.qty) AS qty FROM "StockOrderLine" l JOIN "StockOrder" o ON o.id = l."stockOrderId"
      WHERE o."sellerId" = ${dcId} AND o.status IN ('SUBMITTED', 'APPROVED') GROUP BY 1`,
    db.$queryRaw<{ variantId: string; qty: number }[]>`
      SELECT l."variantId", SUM(l.qty) AS qty FROM "StockOrderLine" l JOIN "StockOrder" o ON o.id = l."stockOrderId"
      WHERE o."sellerId" = ${dcId} AND o.status IN ('SHIPPED', 'RECEIVED') AND o."shippedAt" >= ${since} GROUP BY 1`,
    db.stockLevel.findMany({
      where: { storeId: dcId, onHand: { gt: 0 }, batch: { status: "RELEASED", expiresAt: { not: null } } },
      select: { variantId: true, batch: { select: { expiresAt: true } } },
      orderBy: { batch: { expiresAt: "asc" } },
    }),
  ]);
  const ids = [...new Set([...released, ...blocked].map((r) => r.variantId).concat(committed.map((c) => c.variantId)))];
  const variants = await db.variant.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, name: true, product: { select: { name: true } } } });
  const m = <T extends { variantId: string }>(rows: T[], f: (r: T) => number) => new Map(rows.map((r) => [r.variantId, f(r)]));
  const onHand = m(released, (r) => r._sum.onHand ?? 0), held = m(blocked, (r) => r._sum.onHand ?? 0);
  const commit = m(committed, (r) => r.qty), demand = m(shipped, (r) => r.qty);
  const nextExpiry = new Map<string, Date>();
  for (const l of lots) if (!nextExpiry.has(l.variantId)) nextExpiry.set(l.variantId, l.batch.expiresAt!);
  return variants
    .map((v) => {
      const available = (onHand.get(v.id) ?? 0) - (commit.get(v.id) ?? 0);
      const perDay = (demand.get(v.id) ?? 0) / 28;
      const cover = perDay > 0 ? available / perDay : available > 0 ? Infinity : 0;
      return {
        variantId: v.id, sku: v.sku, name: `${v.product.name} · ${v.name}`,
        onHand: onHand.get(v.id) ?? 0, blocked: held.get(v.id) ?? 0, committed: commit.get(v.id) ?? 0, available,
        shipped28: demand.get(v.id) ?? 0, cover, low: cover < 14, nextExpiry: nextExpiry.get(v.id) ?? null,
      };
    })
    .sort((a, b) => a.cover - b.cover || a.name.localeCompare(b.name));
}
export type DcStockRow = Awaited<ReturnType<typeof dcStockHealth>>[number];

/** FEFO pick suggestion for each line of an order, from the seller's released lots. */
export async function pickList(order: { sellerId: string; lines: { id: string; variantId: string; qty: number }[] }) {
  const lots = await db.stockLevel.findMany({
    where: { storeId: order.sellerId, variantId: { in: order.lines.map((l) => l.variantId) }, onHand: { gt: 0 } },
    select: { variantId: true, batchId: true, onHand: true, unitCostCents: true, batch: { select: { code: true, status: true, expiresAt: true, packedAt: true } } },
  });
  return new Map(
    order.lines.map((line) => {
      const mine = lots.filter((l) => l.variantId === line.variantId);
      const { allocations, short } = allocate(
        mine.map((l) => ({ batchId: l.batchId, onHand: l.onHand, unitCostCents: l.unitCostCents, sellable: l.batch.status === "RELEASED", expiresAt: l.batch.expiresAt, packedAt: l.batch.packedAt })),
        line.qty,
      );
      const byId = new Map(mine.map((l) => [l.batchId, l.batch]));
      return [line.id, { picks: allocations.map((a) => ({ ...a, code: byId.get(a.batchId)?.code ?? "?", expiresAt: byId.get(a.batchId)?.expiresAt ?? null })), short }];
    }),
  );
}
