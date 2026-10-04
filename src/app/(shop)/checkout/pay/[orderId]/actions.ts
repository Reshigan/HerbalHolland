"use server";
import { redirect, RedirectType } from "next/navigation";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { audit } from "@/server/audit";
import { markOrderPaid, onlineCheckoutFor, type OnlineCheckout } from "@/server/orders";
import { shortCode } from "@/server/counters";
import { APP_URL } from "@/server/invoices";
import { simulationAllowed, hostedGateway, HOSTED_GATEWAYS, onlineGateway, PaymentError } from "@/server/payments";
import { possessive } from "@/lib/online-payments";
import { orderDue } from "@/server/shop/vouchers";

export type PayState = { error?: string };
const METHODS = { EFT: "Instant EFT", PAYSHAP: "PayShap", CARD: "Card" } as const;

async function unpaidOrder(orderId: string) {
  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in again to pay for this order." } as const;
  const order = await db.order.findFirst({
    where: { id: orderId, customerId: customer.id },
    select: { id: true, code: true, status: true, storeId: true, createdAt: true, totalCents: true, pointsRedeemed: true, paymentRef: true },
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
  if (!simulationAllowed()) return { error: "Online payment isn't switched on yet — please choose click & collect and pay in store." };
  const r = await unpaidOrder(orderId);
  if ("error" in r) return r;
  const { customer, order } = r;
  if (order.status === "PENDING_PAYMENT") {
    const method = (Object.keys(METHODS) as (keyof typeof METHODS)[]).find((m) => m === form.get("method")) ?? "EFT";
    const reference = `SIM-${method}-${shortCode(8)}`;
    await markOrderPaid(order.id, reference);
    await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "order.pay_online", {
      storeId: order.storeId, entity: "Order", entityId: order.id, data: { gateway: "SIMULATED", method: METHODS[method], reference, amount: await orderDue(order) },
    });
  }
  redirect(`/orders/${order.code}?paid=1`);
}

/**
 * Peach Payments or Yoco: opens the order's checkout (or reopens the same one) and sends the member to the gateway's
 * payment page. The page is left from our own site by the browser (Yoco checks the referring domain on live payments),
 * and replaces this one in the history so Back doesn't bounce the member straight back to the gateway. Paid is decided
 * by the gateway (its webhook, or a Peach status query that finds the payment already went through), never by the browser.
 */
export async function payOnline(orderId: string, _: PayState): Promise<PayState> {
  const gateway = hostedGateway();
  if (!gateway) return { error: "Online payments aren't open yet." };
  const r = await unpaidOrder(orderId);
  if ("error" in r) return r;
  const { customer, order } = r;
  if (order.status !== "PENDING_PAYMENT") redirect(`/orders/${order.code}`);
  const name = HOSTED_GATEWAYS[gateway];
  let c: OnlineCheckout;
  try {
    c = await onlineCheckoutFor(gateway, order, APP_URL());
  } catch (e) {
    if (!(e instanceof PaymentError)) throw e;
    console.error(`[${gateway.toLowerCase()}] checkout for ${order.code}: ${e.message}`);
    if (/start at|Too many/.test(e.message)) return { error: `${e.message}, so this order can't be paid online. Please contact us and quote order ${order.code}.` };
    return { error: `We couldn't open ${possessive(name)} payment page just now. Please try again in a minute.` };
  }
  if (c.step === "review") return { error: `A payment on this order needs a quick check by our team, so please don't pay again. We'll be in touch — quote order ${order.code}.` };
  // Paid already (applied just now) or still processing: the order page shows it, and waits for the gateway if need be.
  if (c.step !== "open") redirect(`/orders/${order.code}?pay=success`);
  if (c.created)
    await audit(db, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "order.checkout", {
      storeId: order.storeId, entity: "Order", entityId: order.id, data: { gateway, checkoutId: c.checkoutId, amount: c.dueCents, mode: c.mode },
    });
  redirect(c.url, RedirectType.replace);
}
