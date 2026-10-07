// Batch lookup at the till: the code printed on a pack (or its lab-certificate QR) → the batch's status, dates,
// potency and lab, and how many of that lot are on hand here. Read-only.
import { db } from "@/server/db";
import type { RegClass } from "@/lib/compliance";

export type BatchLookup = {
  code: string;
  status: "RELEASED" | "QUARANTINE" | "RECALLED";
  statusReason: string | null;
  packedAt: string;
  expiresAt: string | null;
  expired: boolean;
  supplier: string;
  labName: string | null;
  coaRef: string | null;
  thc: number | null;
  cbd: number | null;
  product: { id: string; slug: string; name: string; regClass: RegClass; strain: string | null };
  variant: { id: string; name: string; sku: string; active: boolean };
  onHandHere: number;
};

export async function batchLookup(storeId: string, raw: string): Promise<BatchLookup | null> {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{3,40}$/.test(code)) return null;
  const b = await db.batch.findUnique({
    where: { code },
    include: { variant: { select: { id: true, name: true, sku: true, active: true, product: { select: { id: true, slug: true, name: true, regClass: true, strain: true, status: true } } } } },
  });
  if (!b) return null;
  const here = await db.stockLevel.aggregate({ where: { storeId, batchId: b.id }, _sum: { onHand: true } });
  return {
    code: b.code,
    status: b.status,
    statusReason: b.statusReason,
    packedAt: b.packedAt.toISOString(),
    expiresAt: b.expiresAt?.toISOString() ?? null,
    expired: !!b.expiresAt && b.expiresAt < new Date(),
    supplier: b.supplier,
    labName: b.labName,
    coaRef: b.coaRef,
    thc: b.thc,
    cbd: b.cbd,
    product: { id: b.variant.product.id, slug: b.variant.product.slug, name: b.variant.product.name, regClass: b.variant.product.regClass, strain: b.variant.product.strain },
    variant: { id: b.variant.id, name: b.variant.name, sku: b.variant.sku, active: b.variant.active && b.variant.product.status === "ACTIVE" },
    onHandHere: here._sum.onHand ?? 0,
  };
}
