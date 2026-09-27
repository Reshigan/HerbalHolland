"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { audit } from "@/server/audit";
import { markOrderPaid } from "@/server/orders";
import { shortCode } from "@/server/counters";
import { onlineGateway } from "@/server/payments";

export type PayState = { error?: string };
const METHODS = { EFT: "Instant EFT", PAYSHAP: "PayShap", CARD: "Card" } as const;

/**
 * Simulated gateway confirmation. In production the gateway's signed webhook calls
 * markOrderPaid; this action only exists while ONLINE_GATEWAY is SIMULATED.
 */
export async function simulatePayment(orderId: string, _: PayState, form: FormData): Promise<PayState> {
  if (onlineGateway() !== "SIMULATED") return { error: "Payments are handled by our payment partner — please use their page." };
  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in again to pay for this order." };
  const order = await db.order.findFirst({ where: { id: orderId, customerId: customer.id }, select: { id: true, code: true, status: true, storeId: true, totalCents: true, pointsRedeemed: true } });
  if (!order) return { error: "We couldn't find that order." };
  if (order.status === "CANCELLED") return { error: "This order was cancelled because it wasn't paid in time. Your bag items are still available to order again." };
  if (order.status === "PENDING_PAYMENT") {
    const method = (Object.keys(METHODS) as (keyof typeof METHODS)[]).find((m) => m === form.get("method")) ?? "EFT";
    const reference = `SIM-${method}-${shortCode(8)}`;
    await markOrderPaid(order.id, reference);
    await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "order.pay_online", {
      storeId: order.storeId, entity: "Order", entityId: order.id, data: { gateway: "SIMULATED", method: METHODS[method], reference, amount: order.totalCents - order.pointsRedeemed * 100 },
    });
  }
  redirect(`/orders/${order.code}?paid=1`);
}
