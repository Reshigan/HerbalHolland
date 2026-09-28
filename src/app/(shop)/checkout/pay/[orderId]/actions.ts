"use server";
import { redirect, RedirectType } from "next/navigation";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { audit } from "@/server/audit";
import { markOrderPaid, yocoCheckoutFor } from "@/server/orders";
import { shortCode } from "@/server/counters";
import { APP_URL } from "@/server/invoices";
import { onlineGateway, PaymentError } from "@/server/payments";

export type PayState = { error?: string };
const METHODS = { EFT: "Instant EFT", PAYSHAP: "PayShap", CARD: "Card" } as const;

async function unpaidOrder(orderId: string) {
  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in again to pay for this order." } as const;
  const order = await db.order.findFirst({
    where: { id: orderId, customerId: customer.id },
    select: { id: true, code: true, status: true, storeId: true, totalCents: true, pointsRedeemed: true, paymentRef: true },
  });
  if (!order) return { error: "We couldn't find that order." } as const;
  if (order.status === "CANCELLED") return { error: "This order was cancelled because it wasn't paid in time. Your bag items are still available to order again." } as const;
  return { customer, order };
}

/**
 * Simulated gateway confirmation. In production the gateway's signed webhook calls
 * markOrderPaid; this action only exists while ONLINE_GATEWAY is SIMULATED.
 */
export async function simulatePayment(orderId: string, _: PayState, form: FormData): Promise<PayState> {
  if (onlineGateway() !== "SIMULATED") return { error: "Payments are handled by our payment partner — please use their page." };
  const r = await unpaidOrder(orderId);
  if ("error" in r) return r;
  const { customer, order } = r;
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

/**
 * Yoco: opens the order's checkout (or reopens the same one) and sends the member to Yoco's payment page. The page is
 * left from our own site by the browser (Yoco checks the referring domain on live payments), and replaces this one in
 * the history so Back doesn't bounce the member straight back to Yoco. Paid is decided by the webhook, never here.
 */
export async function payWithYoco(orderId: string, _: PayState): Promise<PayState> {
  if (onlineGateway() !== "YOCO") return { error: "Online payments aren't open yet." };
  const r = await unpaidOrder(orderId);
  if ("error" in r) return r;
  const { customer, order } = r;
  if (order.status !== "PENDING_PAYMENT") redirect(`/orders/${order.code}`);
  let url: string;
  try {
    const { checkout, created, dueCents } = await yocoCheckoutFor(order, APP_URL());
    if (created)
      await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "order.checkout", {
        storeId: order.storeId, entity: "Order", entityId: order.id, data: { gateway: "YOCO", checkoutId: checkout.id, amount: dueCents, mode: checkout.processingMode ?? null },
      });
    url = checkout.redirectUrl;
  } catch (e) {
    if (!(e instanceof PaymentError)) throw e;
    console.error(`[yoco] checkout for ${order.code}: ${e.message}`);
    return { error: /start at/.test(e.message) ? `${e.message}, so this order can't be paid online. Please contact us and quote order ${order.code}.` : "We couldn't open Yoco's payment page just now. Please try again in a minute." };
  }
  redirect(url, RedirectType.replace);
}
