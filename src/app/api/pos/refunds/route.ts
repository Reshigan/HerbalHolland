// Refunds selected lines of a sale at this store (domain: sales.refundSale — restock toggle, reason, and where the
// money goes: back to how they paid by default, or one tender). Idempotent on the client-generated refund id.
import { z } from "zod";
import { db } from "@/server/db";
import { refundSale, SaleError } from "@/server/sales";
import { shortCode } from "@/server/counters";
import { json, readBody, withStaff, PosError } from "@/server/pos/http";
import { Uuid } from "@/server/pos/schemas";
import { receipt } from "@/server/pos/receipts";
import { cashLeft, isTillManager, moneyPartsOf } from "@/lib/pos-refund";

const Body = z.object({
  id: Uuid,
  number: z.string().regex(/^[A-Z0-9]{2,12}-[A-Z0-9]{1,3}\d{3,9}$/, "Invalid receipt number"),
  seq: z.number().int().min(1).optional(),
  saleId: z.string().min(1),
  lines: z.array(z.object({ saleLineId: z.string().min(1), qty: z.number().int().min(0).max(999), restock: z.boolean() })).min(1),
  // ORIGINAL: back to how they paid (split over the sale's money tenders). One tender instead is the approving manager's call.
  method: z.enum(["ORIGINAL", "CARD", "CASH", "PAYSHAP", "EFT"]).default("ORIGINAL"),
  reason: z.string().trim().min(3, "Give a reason for the refund").max(200),
});

export const POST = withStaff(async (req, pos) => {
  // Money going back out is a manager's call: the till signs a manager in (PIN) before it posts the refund.
  if (!isTillManager(pos.user.role)) throw new PosError("A manager must approve refunds. Sign in with a manager's PIN", 403, "MANAGER_ONLY");
  const b = await readBody(req, Body);
  const storeId = pos.device.storeId;
  const orig = await db.sale.findUnique({ where: { id: b.saleId }, select: { storeId: true, payments: true, refunds: { select: { payments: true } } } });
  if (!orig || orig.storeId !== storeId) throw new PosError("Sale not found at this store", 404);
  // Cash goes out of this till's drawer: a cash refund, or back how they paid when the sale still has cash to give back.
  const shift = await db.shift.findFirst({ where: { storeId, deviceId: pos.device.id, closedAt: null }, select: { id: true } });
  if (!shift && (b.method === "CASH" || (b.method === "ORIGINAL" && cashLeft(moneyPartsOf(orig)) > 0))) throw new PosError("Open a shift before paying out cash", 409, "NO_SHIFT");

  const taken = await db.sale.findUnique({ where: { number: b.number }, select: { id: true } });
  const number = taken && taken.id !== b.id ? `${b.number}-${shortCode(3)}` : b.number;
  const refund = await refundSale({
    id: b.id,
    number,
    saleId: b.saleId,
    lines: b.lines,
    method: b.method,
    reason: b.reason,
    staffId: pos.user.id,
    staffName: pos.user.name,
    deviceId: pos.device.id,
    shiftId: shift?.id ?? null,
    capCash: true, // never more cash back than the sale was paid in cash (less cash already refunded)
  }).catch((e) => {
    if (e instanceof SaleError && e.code) throw new PosError(e.message, 422, e.code);
    throw e;
  });
  if (b.seq) await db.device.updateMany({ where: { id: pos.device.id, seq: { lt: b.seq } }, data: { seq: b.seq } });
  return json({ receipt: await receipt(refund.id, storeId) }, 201);
});
