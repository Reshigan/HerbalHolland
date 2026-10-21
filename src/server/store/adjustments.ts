// Adjustment picker data (items with their batches) and the write-off history.
import { db } from "@/server/db";
import { inBatches } from "@/lib/json-list";
import { Prisma, type AdjustReason, type MovementType } from "@/generated/prisma/client";
import { fmtDate, type DateRange } from "@/lib/format";
import { stockRows } from "./inventory";

export type AdjustItem = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string;
  onHand: number;
  batches: { id: string; code: string; onHand: number; unitCostCents: number; expires: string | null; status: string; atStore: boolean }[];
};

/** Every SKU ranged or held at the store, with its batches (lots here first). */
export async function adjustableItems(storeId: string): Promise<AdjustItem[]> {
  const rows = await stockRows(storeId);
  const ids = rows.map((r) => r.variantId);
  const [lots, batches] = await Promise.all([
    inBatches(ids, (part) => db.stockLevel.findMany({ where: { storeId, variantId: { in: part } }, select: { variantId: true, batchId: true, onHand: true, unitCostCents: true } })),
    inBatches(ids, (part) => db.batch.findMany({ where: { variantId: { in: part } }, select: { id: true, code: true, variantId: true, expiresAt: true, status: true, packedAt: true }, orderBy: { packedAt: "asc" } })),
  ]);
  const lot = new Map(lots.map((l) => [`${l.variantId}:${l.batchId}`, l]));
  return rows
    .map((r) => ({
      id: r.variantId,
      name: r.name,
      sku: r.sku,
      barcode: r.barcode,
      category: r.category,
      onHand: r.onHand,
      batches: batches
        .filter((b) => b.variantId === r.variantId)
        .map((b) => {
          const l = lot.get(`${r.variantId}:${b.id}`);
          return { id: b.id, code: b.code, onHand: l?.onHand ?? 0, unitCostCents: l?.unitCostCents ?? r.wholesaleCents, expires: b.expiresAt ? fmtDate(b.expiresAt) : null, status: b.status, atStore: !!l };
        })
        .sort((a, b) => Number(b.atStore) - Number(a.atStore) || Number(b.onHand > 0) - Number(a.onHand > 0)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type HistoryFilter = { types: MovementType[]; reason?: AdjustReason | null; q?: string; range: DateRange };

function historyWhere(storeId: string, f: HistoryFilter) {
  const words = (f.q ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    storeId,
    type: { in: f.types },
    createdAt: { gte: f.range.start, lt: f.range.end },
    ...(f.reason && { reason: f.reason }),
    ...(words.length && {
      AND: words.map((w) => ({
        OR: [
          { variant: { sku: { contains: w } } },
          { variant: { name: { contains: w } } },
          { variant: { product: { name: { contains: w } } } },
          { batch: { code: { contains: w } } },
        ],
      })),
    }),
  } satisfies Prisma.StockMovementWhereInput;
}

export async function adjustmentHistory(storeId: string, f: HistoryFilter, page: number, pageSize: number) {
  const where = historyWhere(storeId, f);
  const [total, rows] = await Promise.all([
    db.stockMovement.count({ where }),
    db.stockMovement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { batch: { select: { code: true } }, variant: { select: { sku: true, name: true, product: { select: { name: true } } } } },
    }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  return { total, rows: rows.map((r) => ({ ...r, user: r.userId ? name.get(r.userId) ?? null : null })) };
}

/** Units and value by reason for the filter (value at the cost posted on each movement). */
export async function adjustmentTotals(storeId: string, f: Omit<HistoryFilter, "reason" | "q">) {
  return db.$queryRaw<{ reason: AdjustReason | null; units: number; value: number; n: number }[]>`
    SELECT reason, SUM(qty) AS units, SUM(qty * 1.0 * "unitCostCents") AS value, COUNT(*) AS n
    FROM "StockMovement"
    WHERE "storeId" = ${storeId} AND type IN (SELECT value FROM json_each(${JSON.stringify(f.types)})) AND "createdAt" >= ${f.range.start} AND "createdAt" < ${f.range.end}
    GROUP BY reason`;
}
