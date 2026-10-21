// Inventory control: batch-level stock, FEFO picking, FIFO cost, immutable ledger.
import { db, Prisma, type Tx } from "./db";
import { allocate, allocationCost, type Allocation } from "@/lib/fefo";
import { dayKey } from "@/lib/format";
import { queueStoreDay } from "./ledger/core";
import type { AdjustReason, MovementType } from "@/generated/prisma/client";

export class StockError extends Error {}

export const OPEN_ORDER_STATUSES = ["PENDING_PAYMENT", "PLACED", "PICKING", "READY"] as const;
/** Trade orders that hold stock at their fulfilling store (an EFT order reserves nothing until HQ confirms the payment). */
export const OPEN_TRADE_ORDER_STATUSES = ["PLACED", "PICKING", "READY"] as const;

export type Avail = { onHand: number; reserved: number; available: number };
export const availKey = (storeId: string, variantId: string) => `${storeId}:${variantId}`;

/**
 * Sellable stock = released on-hand − open online reservations − open trade-order reservations (confirmed, not yet
 * shipped or collected). `client`: a transaction that holds the stock locks (checkout re-checks under them).
 */
export async function availability(storeIds: string[], variantIds?: string[], client: Tx | typeof db = db) {
  const variantFilter = variantIds ? { variantId: { in: variantIds } } : {};
  const levelsQ = () =>
    client.stockLevel.groupBy({
      by: ["storeId", "variantId"],
      where: { storeId: { in: storeIds }, ...variantFilter, batch: { status: "RELEASED" } },
      _sum: { onHand: true },
    });
  const onlineQ = () =>
    client.$queryRaw<{ storeId: string; variantId: string; qty: number }[]>`
      SELECT o."storeId", l."variantId", SUM(l.qty) AS qty
      FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId"
      WHERE o.status IN (${Prisma.join([...OPEN_ORDER_STATUSES])}) AND o."storeId" IN (SELECT value FROM json_each(${JSON.stringify(storeIds)}))
      GROUP BY 1, 2`;
  const tradeQ = () =>
    client.$queryRaw<{ storeId: string; variantId: string; qty: number }[]>`
      SELECT o."storeId", l."variantId", SUM(l.qty) AS qty
      FROM "TradeOrderLine" l JOIN "TradeOrder" o ON o.id = l."tradeOrderId"
      WHERE o.status IN (${Prisma.join([...OPEN_TRADE_ORDER_STATUSES])}) AND o."storeId" IN (SELECT value FROM json_each(${JSON.stringify(storeIds)}))
      GROUP BY 1, 2`;
  // In parallel on the pool; one after another inside a transaction (its single connection can't run them at once).
  const [levels, reservedOnline, reservedTrade] = client === db ? await Promise.all([levelsQ(), onlineQ(), tradeQ()]) : [await levelsQ(), await onlineQ(), await tradeQ()];
  const map = new Map<string, Avail>();
  for (const l of levels) {
    const onHand = l._sum.onHand ?? 0;
    map.set(availKey(l.storeId, l.variantId), { onHand, reserved: 0, available: onHand });
  }
  for (const r of [...reservedOnline, ...reservedTrade]) {
    if (variantIds && !variantIds.includes(r.variantId)) continue;
    const k = availKey(r.storeId, r.variantId);
    const a = map.get(k) ?? { onHand: 0, reserved: 0, available: 0 };
    a.reserved += r.qty;
    a.available = a.onHand - a.reserved;
    map.set(k, a);
  }
  return map;
}

type LockedLot = { id: string; batchId: string; onHand: number; unitCostCents: number; status: string; expiresAt: Date | null; packedAt: Date };

async function lockLots(t: Tx, storeId: string, variantId: string) {
  return t.$queryRaw<LockedLot[]>`
    SELECT s.id, s."batchId", s."onHand", s."unitCostCents", b.status AS status, b."expiresAt", b."packedAt"
    FROM "StockLevel" s JOIN "Batch" b ON b.id = s."batchId"
    WHERE s."storeId" = ${storeId} AND s."variantId" = ${variantId}
    ORDER BY s.id`; // lot order, as locks.lockStock reads them (no row locks on D1: writes are serialised)
}

// `at`: when the movement happened, if not now (a till sale queued offline moves stock at the time it was made).
type Refs = { saleId?: string; orderId?: string; stockOrderId?: string; stockTakeId?: string; userId?: string | null; note?: string; at?: Date };

/**
 * Removes stock FEFO. The till is never blocked: with `allowNegative`, any shortfall
 * lands on the newest lot as negative on-hand and surfaces in the exceptions report.
 */
export async function takeStock(
  t: Tx,
  a: { storeId: string; variantId: string; qty: number; type: MovementType; allowNegative?: boolean } & Refs,
): Promise<Allocation[]> {
  const lots = await lockLots(t, a.storeId, a.variantId);
  const { allocations, short } = allocate(
    lots.map((l) => ({ ...l, sellable: l.status === "RELEASED" })),
    a.qty,
  );
  if (short > 0) {
    if (!a.allowNegative) throw new StockError(`Only ${a.qty - short} available`);
    const newest = [...lots].filter((l) => l.status === "RELEASED").sort((x, y) => y.packedAt.getTime() - x.packedAt.getTime())[0];
    if (newest) {
      const existing = allocations.find((x) => x.batchId === newest.batchId);
      if (existing) existing.qty += short;
      else allocations.push({ batchId: newest.batchId, qty: short, unitCostCents: newest.unitCostCents });
    } else {
      const batch = await t.batch.findFirst({ where: { variantId: a.variantId, status: "RELEASED" }, orderBy: { packedAt: "desc" }, include: { variant: true } });
      if (!batch) throw new StockError("No batch on record for this item");
      await t.stockLevel.create({ data: { storeId: a.storeId, variantId: a.variantId, batchId: batch.id, onHand: 0, unitCostCents: batch.variant.wholesaleCents } });
      allocations.push({ batchId: batch.id, qty: short, unitCostCents: batch.variant.wholesaleCents });
    }
  }
  for (const al of allocations) {
    await t.stockLevel.update({
      where: { storeId_variantId_batchId: { storeId: a.storeId, variantId: a.variantId, batchId: al.batchId } },
      data: { onHand: { decrement: al.qty } },
    });
    await t.stockMovement.create({
      data: {
        storeId: a.storeId, variantId: a.variantId, batchId: al.batchId, qty: -al.qty, type: a.type,
        unitCostCents: al.unitCostCents, saleId: a.saleId, orderId: a.orderId, stockOrderId: a.stockOrderId, userId: a.userId, note: a.note, createdAt: a.at,
      },
    });
  }
  return allocations;
}

/** Adds stock to a specific batch lot (receipts, transfers in, refunds, found stock). Weighted-average cost per lot. */
export async function putStock(
  t: Tx,
  a: { storeId: string; variantId: string; batchId: string; qty: number; unitCostCents: number; type: MovementType; reason?: AdjustReason } & Refs,
) {
  const [lot] = await t.$queryRaw<{ id: string; onHand: number; unitCostCents: number }[]>`
    SELECT id, "onHand", "unitCostCents" FROM "StockLevel"
    WHERE "storeId" = ${a.storeId} AND "variantId" = ${a.variantId} AND "batchId" = ${a.batchId}`;
  let revalueCents = 0; // re-averaging the lot's cost moves its value by more than this movement (rounding, a negative lot)
  if (lot) {
    const base = Math.max(lot.onHand, 0);
    const cost = base + a.qty > 0 ? Math.round((base * lot.unitCostCents + a.qty * a.unitCostCents) / (base + a.qty)) : a.unitCostCents;
    revalueCents = (lot.onHand + a.qty) * cost - lot.onHand * lot.unitCostCents - a.qty * a.unitCostCents;
    await t.stockLevel.update({ where: { id: lot.id }, data: { onHand: { increment: a.qty }, unitCostCents: cost } });
  } else {
    await t.stockLevel.create({ data: { storeId: a.storeId, variantId: a.variantId, batchId: a.batchId, onHand: a.qty, unitCostCents: a.unitCostCents } });
  }
  await t.stockMovement.create({
    data: {
      storeId: a.storeId, variantId: a.variantId, batchId: a.batchId, qty: a.qty, type: a.type, reason: a.reason,
      unitCostCents: a.unitCostCents, revalueCents, saleId: a.saleId, orderId: a.orderId, stockOrderId: a.stockOrderId,
      stockTakeId: a.stockTakeId, userId: a.userId, note: a.note,
    },
  });
}

/** Manual adjustment against a specific lot, with a mandatory reason code. */
export async function adjustStock(
  t: Tx,
  a: { storeId: string; variantId: string; batchId: string; delta: number; reason: AdjustReason; userId?: string | null; note?: string; type?: MovementType; stockTakeId?: string; allowNegative?: boolean },
) {
  const [lot] = await t.$queryRaw<{ id: string; onHand: number; unitCostCents: number }[]>`
    SELECT id, "onHand", "unitCostCents" FROM "StockLevel"
    WHERE "storeId" = ${a.storeId} AND "variantId" = ${a.variantId} AND "batchId" = ${a.batchId}`;
  const variant = await t.variant.findUniqueOrThrow({ where: { id: a.variantId } });
  const cost = lot?.unitCostCents ?? variant.wholesaleCents;
  if (a.delta < 0 && !a.allowNegative && (lot?.onHand ?? 0) + a.delta < 0) throw new StockError(`Only ${lot?.onHand ?? 0} on hand in that batch`);
  if (lot) await t.stockLevel.update({ where: { id: lot.id }, data: { onHand: { increment: a.delta } } });
  else await t.stockLevel.create({ data: { storeId: a.storeId, variantId: a.variantId, batchId: a.batchId, onHand: a.delta, unitCostCents: cost } });
  await t.stockMovement.create({
    data: {
      storeId: a.storeId, variantId: a.variantId, batchId: a.batchId, qty: a.delta, type: a.type ?? "ADJUST",
      reason: a.reason, unitCostCents: cost, userId: a.userId, note: a.note, stockTakeId: a.stockTakeId,
    },
  });
  await queueStoreDay(t, a.storeId, dayKey(new Date())); // write-offs and stock-take counts post with the store's day
  return cost;
}

export { allocationCost };

// ── Stock takes (full or cycle counts, blind by default) ─────────────────────

export async function startStockTake(storeId: string, scope: string, blind: boolean, userId: string | null, number: string) {
  const levels = await db.stockLevel.findMany({
    where: {
      storeId,
      ...(scope !== "FULL" && { variant: { product: { category: { slug: scope } } } }),
      OR: [{ onHand: { not: 0 } }, { variant: { storeVariants: { some: { storeId } } } }],
    },
    select: { variantId: true, batchId: true, onHand: true, unitCostCents: true },
  });
  return db.stockTake.create({
    data: {
      number, storeId, scope, blind, createdById: userId,
      lines: { create: levels.map((l) => ({ variantId: l.variantId, batchId: l.batchId, expectedQty: l.onHand, unitCostCents: l.unitCostCents })) },
    },
  });
}

/** Approving posts COUNT movements for the difference between counted and current on-hand. */
/** Saves counts, snapshotting on-hand as each line is counted so sales during the count don't read as variance. */
export async function recordCounts(storeId: string, stockTakeId: string, counts: { lineId: string; qty: number | null }[]) {
  const lines = await db.stockTakeLine.findMany({ where: { stockTakeId, id: { in: counts.map((c) => c.lineId) } }, select: { id: true, variantId: true, batchId: true } });
  const levels = await db.stockLevel.findMany({
    where: { storeId, variantId: { in: [...new Set(lines.map((l) => l.variantId))] } },
    select: { variantId: true, batchId: true, onHand: true },
  });
  const onHand = new Map(levels.map((l) => [`${l.variantId}:${l.batchId}`, l.onHand]));
  const byId = new Map(lines.map((l) => [l.id, l]));
  await db.$transaction(
    counts
      .filter((c) => byId.has(c.lineId))
      .map((c) => {
        const l = byId.get(c.lineId)!;
        const data = c.qty == null ? { countedQty: null } : { countedQty: c.qty, expectedQty: onHand.get(`${l.variantId}:${l.batchId}`) ?? 0 };
        return db.stockTakeLine.update({ where: { id: c.lineId }, data });
      }),
  );
}

/** Cancels a count that's still open, once: an approval (or another cancel) that got there first wins. */
export async function cancelStockTake(t: Tx, storeId: string, stockTakeId: string) {
  const { count } = await t.stockTake.updateMany({ where: { id: stockTakeId, storeId, status: "COUNTING" }, data: { status: "CANCELLED" } });
  if (count !== 1) throw new StockError("This stock take was closed a moment ago, so refresh to see it");
}

export async function approveStockTake(t: Tx, stockTakeId: string, userId: string | null) {
  // Closed once: only the approval that moves it out of COUNTING posts the variances.
  const claimed = await t.stockTake.updateMany({ where: { id: stockTakeId, status: "COUNTING" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: userId } });
  if (claimed.count !== 1) throw new StockError("Stock take is already closed");
  const st = await t.stockTake.findUniqueOrThrow({ where: { id: stockTakeId }, include: { lines: true } });
  let varianceValue = 0;
  for (const line of st.lines) {
    if (line.countedQty == null) continue;
    // Against stock when the line was counted (recordCounts); later sales and deliveries stay on top.
    const delta = line.countedQty - line.expectedQty;
    await t.stockTakeLine.update({ where: { id: line.id }, data: { varianceQty: delta } });
    if (delta === 0) continue;
    const cost = await adjustStock(t, {
      storeId: st.storeId, variantId: line.variantId, batchId: line.batchId, delta,
      reason: delta > 0 ? "FOUND" : "LOST", type: "COUNT", userId, stockTakeId, allowNegative: true,
      note: `Stock take ${st.number}`,
    });
    varianceValue += delta * cost;
  }
  return varianceValue;
}
