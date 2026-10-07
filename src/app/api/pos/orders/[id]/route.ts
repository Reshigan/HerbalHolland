// Moves an online order along (domain: orders.advanceOrder). Handover needs the customer's
// collection code (or their collection QR, never the order code), an 18+ ID check, a dispenser for licensed items and
// payment if unpaid; delivery orders are dispatched with a courier/driver and tracking.
import { z } from "zod";
import { db } from "@/server/db";
import { advanceOrder } from "@/server/orders";
import { getSettings } from "@/server/settings";
import { json, readBody, withStaff, actorOf, PosError } from "@/server/pos/http";
import { MoneyTender } from "@/server/pos/schemas";
import { codeMatches } from "@/server/pos/orders";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  to: z.enum(["PICKING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"]),
  code: z.string().trim().max(60).optional(), // the 6-digit collection code, or the collection QR's text
  idChecked: z.boolean().optional(),
  payments: z.array(MoneyTender).max(6).optional(),
  courier: z.string().trim().max(60).optional(),
  trackingNo: z.string().trim().max(60).optional(),
  note: z.string().trim().max(200).optional(),
  check: z.boolean().optional(), // verify the handover (code etc.) without changing the order, before taking payment
});

export const POST = withStaff<Ctx>(async (req, pos, { params }) => {
  const { id } = await params;
  const b = await readBody(req, Body);
  const order = await db.order.findUnique({ where: { id }, select: { storeId: true, code: true, collectionCode: true, fulfilment: true, status: true, paymentStatus: true } });
  if (!order || order.storeId !== pos.device.storeId) throw new PosError("Order not found at this store", 404);

  const handover = b.to === "COMPLETED" && order.fulfilment === "COLLECT";
  if (handover && !codeMatches(order, b.code ?? "")) throw new PosError("That code doesn't match this order. Ask for the 6-digit collection code", 422, "BAD_CODE");
  if (b.to === "CANCELLED" && !b.note) throw new PosError("Give a reason for cancelling", 422);

  const shift = await db.shift.findFirst({ where: { storeId: pos.device.storeId, deviceId: pos.device.id, closedAt: null }, select: { id: true } });
  if (b.check) {
    const { compliance } = await getSettings();
    const licensed = await db.orderLine.count({ where: { orderId: id, variant: { product: { regClass: { in: compliance.licensedOnly } } } } });
    if (handover && licensed && compliance.thcMode === "MEDICAL" && !pos.user.canDispense)
      throw new PosError("An authorised dispenser must hand over this order", 422, "DISPENSER");
    if (handover && order.paymentStatus !== "PAID" && !shift) throw new PosError("Open a shift before taking payment", 409, "NO_SHIFT");
    return json({ ok: true });
  }
  if (b.payments?.length && !shift) throw new PosError("Open a shift before taking payment", 409, "NO_SHIFT");
  if (b.to === "OUT_FOR_DELIVERY" && !b.courier) throw new PosError("Choose the courier or driver", 422);

  const updated = await advanceOrder(id, b.to, actorOf(pos), {
    payments: b.payments,
    idChecked: b.idChecked,
    staffId: pos.user.id,
    staffCanDispense: pos.user.canDispense,
    deviceId: pos.device.id,
    shiftId: shift?.id ?? null,
    courier: b.courier,
    trackingNo: b.trackingNo || undefined,
    note: b.note,
  });
  return json({ order: { id: updated.id, code: updated.code, status: updated.status, trackingNo: updated.trackingNo, courier: updated.courier } });
});
