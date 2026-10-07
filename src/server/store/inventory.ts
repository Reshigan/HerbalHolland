// Store inventory read models: stock on hand per SKU (ranged items plus anything
// physically on hand), lots, the movement ledger with running balance, velocity.
// Everything is bounded to one store; per-SKU maths lives in ./rules.
import { db } from "@/server/db";
import { availability, availKey, OPEN_ORDER_STATUSES } from "@/server/inventory";
import { addDays, dateOnly, dayKey, fmtDay } from "@/lib/format";
import { daysOfCover } from "@/lib/replenish";
import { textMatches } from "@/lib/text-match";
import { inRankOrder } from "@/lib/text-search";
import { closeProducts } from "@/server/hq/catalogue";
import { stockStatus, overstockUnits, type StockStatus } from "./rules";
import type { RegClass } from "@/lib/compliance";

type LotAgg = { variantId: string; onHand: number; blocked: number; value: number; negativeLots: number; nextExpiry: Date | null };

export type StockRow = {
  variantId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  productName: string;
  variantName: string;
  slug: string;
  strain: string | null;
  regClass: RegClass;
  category: string;
  categorySlug: string;
  ranged: boolean;
  reorderPoint: number;
  parLevel: number;
  rrpCents: number;
  shelfCents: number | null;
  wholesaleCents: number;
  onHand: number; // all lots, incl. blocked batches
  blocked: number; // units in recalled / quarantined lots
  reserved: number; // open online orders
  available: number; // released − reserved
  valueCents: number; // at cost (FIFO lot cost)
  negativeLots: number;
  nextExpiry: Date | null;
  sold28: number;
  avgDaily: number;
  cover: number;
  status: StockStatus;
  overUnits: number;
};

/** One row per SKU ranged at the store or holding stock there. */
export async function stockRows(storeId: string): Promise<StockRow[]> {
  const since = dateOnly(addDays(new Date(), -28));
  const [ranged, lots, sold] = await Promise.all([
    db.storeVariant.findMany({ where: { storeId }, select: { variantId: true, reorderPoint: true, parLevel: true, priceCents: true } }),
    db.$queryRaw<LotAgg[]>`
      SELECT sl."variantId",
             SUM(sl."onHand")::int AS "onHand",
             COALESCE(SUM(sl."onHand") FILTER (WHERE b.status <> 'RELEASED' AND sl."onHand" > 0), 0)::int AS blocked,
             COALESCE(SUM(sl."onHand"::float8 * sl."unitCostCents"), 0)::float8 AS value,
             COUNT(*) FILTER (WHERE sl."onHand" < 0)::int AS "negativeLots",
             MIN(b."expiresAt") FILTER (WHERE sl."onHand" > 0 AND b.status = 'RELEASED') AS "nextExpiry"
      FROM "StockLevel" sl JOIN "Batch" b ON b.id = sl."batchId"
      WHERE sl."storeId" = ${storeId}
      GROUP BY 1`,
    db.dailyVariantStat.groupBy({ by: ["variantId"], where: { storeId, date: { gte: since } }, _sum: { units: true } }),
  ]);
  const rangedBy = new Map(ranged.map((r) => [r.variantId, r]));
  const lotBy = new Map(lots.map((l) => [l.variantId, l]));
  const soldBy = new Map(sold.map((s) => [s.variantId, s._sum.units ?? 0]));
  const ids = [...new Set([...rangedBy.keys(), ...lots.filter((l) => l.onHand !== 0 || l.blocked > 0 || l.negativeLots > 0).map((l) => l.variantId)])];
  const [variants, avail] = await Promise.all([
    db.variant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, productId: true, sku: true, barcode: true, name: true, priceCents: true, wholesaleCents: true,
        product: { select: { name: true, slug: true, strain: true, regClass: true, category: { select: { name: true, slug: true } } } },
      },
    }),
    availability([storeId], ids),
  ]);

  return variants.map((v) => {
    const sv = rangedBy.get(v.id);
    const lot = lotBy.get(v.id);
    const a = avail.get(availKey(storeId, v.id)) ?? { onHand: 0, reserved: 0, available: 0 };
    const sold28 = soldBy.get(v.id) ?? 0;
    const avgDaily = sold28 / 28;
    const reorderPoint = sv?.reorderPoint ?? 0;
    const parLevel = sv?.parLevel ?? 0;
    const onHand = lot?.onHand ?? 0;
    const negativeLots = lot?.negativeLots ?? 0;
    return {
      variantId: v.id,
      productId: v.productId,
      sku: v.sku,
      barcode: v.barcode,
      name: `${v.product.name} · ${v.name}`,
      productName: v.product.name,
      variantName: v.name,
      slug: v.product.slug,
      strain: v.product.strain,
      regClass: v.product.regClass,
      category: v.product.category.name,
      categorySlug: v.product.category.slug,
      ranged: !!sv,
      reorderPoint,
      parLevel,
      rrpCents: v.priceCents,
      shelfCents: sv?.priceCents ?? null,
      wholesaleCents: v.wholesaleCents,
      onHand,
      blocked: lot?.blocked ?? 0,
      reserved: a.reserved,
      available: a.available,
      valueCents: Math.round(lot?.value ?? 0),
      negativeLots,
      nextExpiry: lot?.nextExpiry ?? null,
      sold28,
      avgDaily,
      cover: daysOfCover(Math.max(0, a.available), avgDaily),
      status: stockStatus({ onHand, available: a.available, reorderPoint, parLevel, avgDaily, negativeLots }),
      overUnits: sv ? overstockUnits(a.available, parLevel, avgDaily) : 0,
    };
  });
}

export const STOCK_SORTS = ["name", "status", "onHand", "reserved", "available", "reorder", "cover", "sold", "value", "price"] as const;
export type StockSort = (typeof STOCK_SORTS)[number];
const SEVERITY: Record<StockStatus, number> = { NEGATIVE: 0, OUT: 1, LOW: 2, OVER: 3, HEALTHY: 4 };

export function sortStock(rows: StockRow[], sort: StockSort, dir: "asc" | "desc") {
  const key: Record<StockSort, (r: StockRow) => number | string> = {
    name: (r) => r.name.toLowerCase(),
    status: (r) => SEVERITY[r.status],
    onHand: (r) => r.onHand,
    reserved: (r) => r.reserved,
    available: (r) => r.available,
    reorder: (r) => r.available - r.reorderPoint,
    cover: (r) => (Number.isFinite(r.cover) ? r.cover : 1e9),
    sold: (r) => r.sold28,
    value: (r) => r.valueCents,
    price: (r) => r.shelfCents ?? r.rrpCents,
  };
  const k = key[sort];
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = k(a), y = k(b);
    return (x < y ? -1 : x > y ? 1 : 0) * m || a.name.localeCompare(b.name);
  });
}

export function matchesSearch(r: Pick<StockRow, "name" | "sku" | "barcode" | "category">, q: string) {
  return !q || textMatches(`${r.name} ${r.sku} ${r.barcode ?? ""} ${r.category}`, q);
}

/**
 * The rows a search finds: those matching as typed or, when none do (a typo: "durbn"), the rows whose product name or
 * variant name is close to it (closeProducts, bounded to these rows' products), closest first. `close` says which.
 */
export async function searchStock<R extends Pick<StockRow, "productId" | "name" | "sku" | "barcode" | "category">>(rows: R[], q: string) {
  const hits = rows.filter((r) => matchesSearch(r, q));
  if (!q || hits.length) return { rows: hits, close: false };
  const ids = await closeProducts(q, [...new Set(rows.map((r) => r.productId))]);
  const near = inRankOrder(rows, ids, (r) => r.productId);
  return { rows: near, close: near.length > 0 };
}

// ── Variant detail ───────────────────────────────────────────────────────────

export async function variantHeader(storeId: string, variantId: string) {
  return db.variant.findUnique({
    where: { id: variantId },
    include: {
      product: { select: { name: true, slug: true, strain: true, regClass: true, category: { select: { name: true, slug: true } } } },
      storeVariants: { where: { storeId } },
    },
  });
}

export async function variantLots(storeId: string, variantId: string) {
  const lots = await db.stockLevel.findMany({
    where: { storeId, variantId },
    include: { batch: { select: { code: true, packedAt: true, expiresAt: true, status: true, statusReason: true, supplier: true, thc: true, cbd: true } } },
  });
  // FEFO order: the lot the till sells first comes first.
  return lots.sort((a, b) => (a.batch.expiresAt?.getTime() ?? Infinity) - (b.batch.expiresAt?.getTime() ?? Infinity) || a.batch.packedAt.getTime() - b.batch.packedAt.getTime());
}

/** Paginated movement ledger (newest first) with the running on-hand balance after each movement. */
export async function ledger(storeId: string, variantId: string, page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  const [total, rows, onHand, newer] = await Promise.all([
    db.stockMovement.count({ where: { storeId, variantId } }),
    db.stockMovement.findMany({
      where: { storeId, variantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      include: { batch: { select: { code: true } } },
    }),
    db.stockLevel.aggregate({ where: { storeId, variantId }, _sum: { onHand: true } }),
    skip
      ? db.$queryRaw<{ s: number }[]>`
          SELECT COALESCE(SUM(qty), 0)::int AS s FROM (
            SELECT qty FROM "StockMovement" WHERE "storeId" = ${storeId} AND "variantId" = ${variantId}
            ORDER BY "createdAt" DESC, id DESC LIMIT ${skip}) x`
      : Promise.resolve([{ s: 0 }]),
  ]);
  const ids = (k: "userId" | "saleId" | "orderId" | "stockOrderId" | "stockTakeId") => [...new Set(rows.map((r) => r[k]).filter((x): x is string => !!x))];
  const [users, sales, orders, stockOrders, stockTakes] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids("userId") } }, select: { id: true, name: true } }),
    db.sale.findMany({ where: { id: { in: ids("saleId") } }, select: { id: true, number: true } }),
    db.order.findMany({ where: { id: { in: ids("orderId") } }, select: { id: true, code: true } }),
    db.stockOrder.findMany({ where: { id: { in: ids("stockOrderId") } }, select: { id: true, number: true } }),
    db.stockTake.findMany({ where: { id: { in: ids("stockTakeId") } }, select: { id: true, number: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const sale = new Map(sales.map((s) => [s.id, s.number]));
  const order = new Map(orders.map((o) => [o.id, o.code]));
  const po = new Map(stockOrders.map((o) => [o.id, o.number]));
  const st = new Map(stockTakes.map((s) => [s.id, s.number]));
  let balance = (onHand._sum.onHand ?? 0) - newer[0].s;
  return {
    total,
    rows: rows.map((r) => {
      const after = balance;
      balance -= r.qty;
      return {
        ...r,
        balance: after,
        user: r.userId ? name.get(r.userId) ?? null : null,
        saleNumber: r.saleId ? sale.get(r.saleId) ?? null : null,
        orderCode: r.orderId ? order.get(r.orderId) ?? null : null,
        poNumber: r.stockOrderId ? po.get(r.stockOrderId) ?? null : null,
        stNumber: r.stockTakeId ? st.get(r.stockTakeId) ?? null : null,
      };
    }),
  };
}

/** Daily units sold over the last `days` days (rollups), oldest first. */
export async function velocity(storeId: string, variantId: string, days = 28) {
  const from = dateOnly(addDays(new Date(), -(days - 1)));
  const rows = await db.dailyVariantStat.findMany({ where: { storeId, variantId, date: { gte: from } }, select: { date: true, units: true, netCents: true } });
  const by = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
  return Array.from({ length: days }, (_, i) => {
    const d = dayKey(addDays(new Date(), -(days - 1 - i)));
    const r = by.get(d);
    return { label: fmtDay(`${d}T12:00:00Z`), units: r?.units ?? 0, netCents: r?.netCents ?? 0 };
  });
}

export async function reservingOrders(storeId: string, variantId: string) {
  return db.orderLine.findMany({
    where: { variantId, order: { storeId, status: { in: [...OPEN_ORDER_STATUSES] } } },
    select: { qty: true, order: { select: { id: true, code: true, status: true, createdAt: true, fulfilment: true } } },
    orderBy: { order: { createdAt: "asc" } },
  });
}
