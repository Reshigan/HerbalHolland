// Hands a READY trade click & collect order over at this store (domain: trade/orders.advanceTradeOrder "collect"):
// the 6-digit collection code must match the order's and the collector's ID (18+) must have been checked. That
// posts the WHOLESALE sale at this store with the handling fee (FEFO lots, the TI-… tax invoice, the ledger
// invoice) on this till's open shift when there is one, and emails the buyer. Nothing is paid at the till: the
// money was collected by HQ (EFT) or is on the account's terms.
import { z } from "zod";
import { db } from "@/server/db";
import { advanceTradeOrder } from "@/server/trade/orders";
import { json, readBody, withStaff, actorOf, PosError } from "@/server/pos/http";
import { tradeCodeMatches } from "@/components/pos/lib/rules";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  code: z.string().trim().max(20),
  idChecked: z.boolean(),
});

export const POST = withStaff<Ctx>(async (req, pos, { params }) => {
  const { id } = await params;
  const b = await readBody(req, Body);
  const order = await db.tradeOrder.findUnique({ where: { id }, select: { storeId: true, number: true, status: true, fulfilment: true, collectionCode: true } });
  if (!order || order.storeId !== pos.device.storeId) throw new PosError("Trade order not found at this store", 404);
  if (order.fulfilment !== "COLLECT") throw new PosError(`${order.number} is a courier order — it ships from the DC, it isn't handed over here`, 422);
  if (order.status === "COLLECTED") throw new PosError(`${order.number} has already been collected`, 409);
  if (order.status !== "READY") throw new PosError(`${order.number} isn't ready yet — it's packed and marked ready in the back office first`, 409);
  if (!b.idChecked) throw new PosError("Tick the ID check — the person collecting must be 18 or older", 422);
  if (!tradeCodeMatches(order.collectionCode, b.code)) throw new PosError(`That code doesn't match ${order.number} — ask for the 6-digit collection code from the buyer's email or text`, 422, "BAD_CODE");

  const shift = await db.shift.findFirst({ where: { storeId: pos.device.storeId, deviceId: pos.device.id, closedAt: null }, select: { id: true } });
  const updated = await advanceTradeOrder(id, "collect", actorOf(pos), { idChecked: true, staffId: pos.user.id, deviceId: pos.device.id, shiftId: shift?.id ?? null });
  return json({ order: { id: updated.id, number: updated.number, status: updated.status, invoiceNumber: updated.invoiceNumber, saleId: updated.saleId } });
});
