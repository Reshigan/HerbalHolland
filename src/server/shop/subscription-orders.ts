// The hooks the order flow calls for club subscriptions (kept apart from ./subscriptions so orders.ts can import them
// without a cycle). A period's billing order carries one `SUB-` line; a collection order carries paymentRef `SUB:<periodId>`.
import type { Tx } from "@/server/db";

export const SUB_SKU = "SUB-";
export const SUB_REF = "SUB:";

export const isSubscriptionClaim = (o: { paymentRef: string | null }) => !!o.paymentRef?.startsWith(SUB_REF);

/** A period's order was paid: the period opens its allowance, and a past-due subscription is active again. */
export async function onSubscriptionPaidTx(t: Tx, orderId: string, paidAt: Date) {
  const p = await t.subscriptionPeriod.findUnique({ where: { billingOrderId: orderId }, select: { subscriptionId: true } });
  if (!p) return;
  await t.subscriptionPeriod.updateMany({ where: { billingOrderId: orderId, status: { in: ["DUE", "LAPSED"] } }, data: { status: "PAID", paidAt } });
  await t.subscription.updateMany({ where: { id: p.subscriptionId, status: "PAST_DUE" }, data: { status: "ACTIVE" } });
}

/** A collection order was cancelled: the period's allowance is open again. */
export async function onSubscriptionClaimCancelledTx(t: Tx, orderId: string) {
  await t.subscriptionPeriod.updateMany({ where: { claimOrderId: orderId, status: "COLLECTED" }, data: { status: "PAID", claimOrderId: null, collectedAt: null } });
}
