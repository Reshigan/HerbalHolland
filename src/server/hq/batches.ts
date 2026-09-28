// Batch traceability. Sale lines record which batch lots they drew from
// (allocations JSON); lookups are bounded by the batch's variant (indexed) and by the
// date it was packed, so a recall query stays cheap on millions of lines.
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";

type Batch = { id: string; variantId: string; packedAt: Date };

const match = (b: Batch) => JSON.stringify([{ batchId: b.id }]);
const storeFilter = (storeIds: string[] | null) => (storeIds ? Prisma.sql`AND s."storeId" = ANY(${storeIds}::text[])` : Prisma.empty);

/** Totals for everyone who bought from the batch (units net of refunds). */
export async function traceSummary(b: Batch, storeIds: string[] | null) {
  const [r] = await db.$queryRaw<{ sales: number; customers: number; anonymous: number; units: number; stores: number }[]>`
    SELECT COUNT(DISTINCT s.id)::int AS sales,
           COUNT(DISTINCT s."customerId")::int AS customers,
           COUNT(DISTINCT s.id) FILTER (WHERE s."customerId" IS NULL)::int AS anonymous,
           COALESCE(SUM((SELECT SUM((a->>'qty')::int) FROM jsonb_array_elements(l.allocations) a WHERE a->>'batchId' = ${b.id}) * CASE WHEN s.kind = 'REFUND' THEN -1 ELSE 1 END), 0)::int AS units,
           COUNT(DISTINCT s."storeId")::int AS stores
    FROM "SaleLine" l JOIN "Sale" s ON s.id = l."saleId"
    WHERE l."variantId" = ${b.variantId} AND s."createdAt" >= ${b.packedAt} AND l.allocations @> ${match(b)}::jsonb ${storeFilter(storeIds)}`;
  return r ?? { sales: 0, customers: 0, anonymous: 0, units: 0, stores: 0 };
}

export type TraceRow = { saleId: string; number: string; createdAt: Date; kind: string; qty: number; storeCode: string; storeName: string; customerId: string | null; memberNo: string | null; firstName: string | null; lastName: string | null };

/** Sales that drew from the batch, newest first (paged). */
export async function traceSales(b: Batch, storeIds: string[] | null, page: number, pageSize: number) {
  return db.$queryRaw<TraceRow[]>`
    SELECT s.id AS "saleId", s.number, s."createdAt", s.kind::text AS kind,
           (SELECT COALESCE(SUM((a->>'qty')::int), 0) FROM jsonb_array_elements(l.allocations) a WHERE a->>'batchId' = ${b.id})::int AS qty,
           st.code AS "storeCode", st.name AS "storeName", c.id AS "customerId", c."memberNo", c."firstName", c."lastName"
    FROM "SaleLine" l JOIN "Sale" s ON s.id = l."saleId" JOIN "Store" st ON st.id = s."storeId" LEFT JOIN "Customer" c ON c.id = s."customerId"
    WHERE l."variantId" = ${b.variantId} AND s."createdAt" >= ${b.packedAt} AND l.allocations @> ${match(b)}::jsonb ${storeFilter(storeIds)}
    ORDER BY s."createdAt" DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
}

/** Distinct members (with a phone) who bought from the batch — the recall notification list. */
export async function affectedCustomers(b: Batch) {
  return db.$queryRaw<{ id: string; phone: string; firstName: string }[]>`
    SELECT DISTINCT c.id, c.phone, c."firstName"
    FROM "SaleLine" l JOIN "Sale" s ON s.id = l."saleId" JOIN "Customer" c ON c.id = s."customerId"
    WHERE l."variantId" = ${b.variantId} AND s."createdAt" >= ${b.packedAt} AND s.kind = 'SALE' AND l.allocations @> ${match(b)}::jsonb`;
}
