// Refunds selected lines of a sale at this store (domain: sales.refundSale — restock
// toggle, reason, tender). Idempotent on the client-generated refund id.
import { z } from "zod";
import { db } from "@/server/db";
import { refundSale } from "@/server/sales";
import { shortCode } from "@/server/counters";
import { json, readBody, withStaff, PosError } from "@/server/pos/http";
import { Uuid } from "@/server/pos/schemas";
import { receipt } from "@/server/pos/receipts";
import { cashRefundAllowed, isTillManager } from "@/lib/pos-refund";

const Body = z.object({
  id: Uuid,
  number: z.string().regex(/^[A-Z0-9]{2,12}-[A-Z0-9]{1,3}\d{3,9}$/, "Invalid receipt number"),
  seq: z.number().int().min(1).optional(),
  saleId: z.string().min(1),
  lines: z.array(z.object({ saleLineId: z.string().min(1), qty: z.number().int().min(0).max(999), restock: z.boolean() })).min(1),
  method: z.enum(["CARD", "CASH", "PAYSHAP", "EFT"]),
  reason: z.string().trim().min(3, "Give a reason for the refund").max(200),
});

export const POST = withStaff(async (req, pos) => {
  // Money going back out is a manager's call: the till signs a manager in (PIN) before it posts the refund.
  if (!isTillManager(pos.user.role)) throw new PosError("A manager must approve refunds — sign in with a manager's PIN", 403, "MANAGER_ONLY");
  const b = await readBody(req, Body);
  const storeId = pos.device.storeId;
  const orig = await db.sale.findUnique({ where: { id: b.saleId }, select: { storeId: true, payments: { select: { method: true, amountCents: true } } } });
  if (!orig || orig.storeId !== storeId) throw new PosError("Sale not found at this store", 404);
  if (b.method === "CASH" && !cashRefundAllowed(orig.payments))
    throw new PosError("No cash was paid on this sale — refund it to the card or account it was paid with", 422, "NO_CASH_PAID");
  const shift = await db.shift.findFirst({ where: { storeId, deviceId: pos.device.id, closedAt: null }, select: { id: true } });
  if (!shift && b.method === "CASH") throw new PosError("Open a shift before paying out cash", 409, "NO_SHIFT");

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
  });
  if (b.seq) await db.device.updateMany({ where: { id: pos.device.id, seq: { lt: b.seq } }, data: { seq: b.seq } });
  return json({ receipt: await receipt(refund.id, storeId) }, 201);
});
