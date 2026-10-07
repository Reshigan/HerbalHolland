// Stock-take read models: list with progress/variance, the count sheet, and the
// live variance review (counted vs on hand right now: what approval will post).
import { db } from "@/server/db";

export async function scopeLabels() {
  const cats = await db.category.findMany({ select: { slug: true, name: true }, orderBy: { sortOrder: "asc" } });
  const map = new Map(cats.map((c) => [c.slug, c.name]));
  return { cats, label: (scope: string) => (scope === "FULL" ? "Full count" : `${map.get(scope) ?? scope} cycle count`) };
}

export async function stockTakeList(storeId: string, page: number, pageSize: number) {
  const where = { storeId };
  const [total, takes] = await Promise.all([
    db.stockTake.count({ where }),
    db.stockTake.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const ids = takes.map((t) => t.id);
  const [stats, users] = await Promise.all([
    ids.length
      ? db.$queryRaw<{ stockTakeId: string; lines: number; counted: number; netUnits: number; absUnits: number; netValue: number }[]>`
          SELECT "stockTakeId", COUNT(*)::int AS lines, COUNT("countedQty")::int AS counted,
                 COALESCE(SUM("varianceQty"), 0)::int AS "netUnits", COALESCE(SUM(ABS("varianceQty")), 0)::int AS "absUnits",
                 COALESCE(SUM("varianceQty"::float8 * "unitCostCents"), 0)::float8 AS "netValue"
          FROM "StockTakeLine" WHERE "stockTakeId" = ANY(${ids}::text[]) GROUP BY 1`
      : Promise.resolve([]),
    db.user.findMany({ where: { id: { in: takes.flatMap((t) => [t.createdById, t.approvedById]).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
  ]);
  const s = new Map(stats.map((x) => [x.stockTakeId, x]));
  const u = new Map(users.map((x) => [x.id, x.name]));
  return {
    total,
    rows: takes.map((t) => ({
      ...t,
      stats: s.get(t.id) ?? { lines: 0, counted: 0, netUnits: 0, absUnits: 0, netValue: 0 },
      createdBy: t.createdById ? u.get(t.createdById) ?? null : null,
      approvedBy: t.approvedById ? u.get(t.approvedById) ?? null : null,
    })),
  };
}

/** The take plus its lines with item and batch details, sorted category → product → expiry. */
export async function stockTakeSheet(storeId: string, id: string) {
  const take = await db.stockTake.findFirst({
    where: { id, storeId },
    include: {
      lines: {
        include: {
          variant: {
            select: { sku: true, barcode: true, name: true, sortOrder: true, product: { select: { name: true, category: { select: { name: true, sortOrder: true } } } } },
          },
        },
      },
    },
  });
  if (!take) return null;
  const [batches, users] = await Promise.all([
    db.batch.findMany({ where: { id: { in: [...new Set(take.lines.map((l) => l.batchId))] } }, select: { id: true, code: true, expiresAt: true, status: true } }),
    db.user.findMany({ where: { id: { in: [take.createdById, take.approvedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
  ]);
  const b = new Map(batches.map((x) => [x.id, x]));
  const u = new Map(users.map((x) => [x.id, x.name]));
  const lines = take.lines
    .map((l) => ({
      id: l.id,
      variantId: l.variantId,
      batchId: l.batchId,
      sku: l.variant.sku,
      barcode: l.variant.barcode,
      productName: l.variant.product.name,
      variantName: l.variant.name,
      category: l.variant.product.category.name,
      catOrder: l.variant.product.category.sortOrder,
      batchCode: b.get(l.batchId)?.code ?? "—",
      batchStatus: b.get(l.batchId)?.status ?? "RELEASED",
      expiresAt: b.get(l.batchId)?.expiresAt ?? null,
      expectedQty: l.expectedQty,
      countedQty: l.countedQty,
      varianceQty: l.varianceQty,
      unitCostCents: l.unitCostCents,
      sortOrder: l.variant.sortOrder,
    }))
    .sort(
      (x, y) =>
        x.catOrder - y.catOrder ||
        x.productName.localeCompare(y.productName) ||
        x.sortOrder - y.sortOrder ||
        (x.expiresAt?.getTime() ?? Infinity) - (y.expiresAt?.getTime() ?? Infinity),
    );
  return { take, lines, createdBy: take.createdById ? u.get(take.createdById) ?? null : null, approvedBy: take.approvedById ? u.get(take.approvedById) ?? null : null };
}

/** On-hand now for each line's lot: approval posts counted − this. */
export async function currentOnHand(storeId: string, lines: { variantId: string; batchId: string }[]) {
  const rows = await db.stockLevel.findMany({
    where: { storeId, variantId: { in: [...new Set(lines.map((l) => l.variantId))] } },
    select: { variantId: true, batchId: true, onHand: true, unitCostCents: true },
  });
  return new Map(rows.map((r) => [`${r.variantId}:${r.batchId}`, r]));
}
