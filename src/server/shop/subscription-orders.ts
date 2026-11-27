// The hooks the order flow calls for club subscriptions (kept apart from ./subscriptions so orders.ts can import them
// without a cycle). A month's billing order carries one `SUB-` line; a weekly claim order carries paymentRef `SUB:<claimId>`.
import type { Tx } from "@/server/db";
import { anchorDayOf, cycleEndOf } from "@/lib/subscriptions";

export const SUB_SKU = "SUB-";
export const SUB_REF = "SUB:";

export const isSubscriptionClaim = (o: { paymentRef: string | null }) => !!o.paymentRef?.startsWith(SUB_REF);

/** A month's order was paid: the month opens its weekly allowances and the plan is active. A first month (or the month
 *  that restarts a past-due plan) begins when it's paid, and that day becomes the plan's billing day. */
export async function onSubscriptionPaidTx(t: Tx, orderId: string, paidAt: Date) {
  const p = await t.subscriptionPeriod.findUnique({ where: { billingOrderId: orderId }, include: { subscription: { select: { id: true, status: true } } } });
  if (!p) return;
  const s = p.subscription;
  const restart = s.status === "PENDING" || s.status === "PAST_DUE";
  const start = restart ? paidAt : p.periodStart;
  const end = restart ? cycleEndOf(paidAt) : p.periodEnd;
  const { count } = await t.subscriptionPeriod.updateMany({ where: { id: p.id, status: { in: ["DUE", "LAPSED"] } }, data: { status: "PAID", paidAt, periodStart: start, periodEnd: end } });
  if (!count || !restart) return;
  await t.subscription.updateMany({
    where: { id: s.id, status: s.status },
    data: { status: "ACTIVE", periodStart: start, periodEnd: end, anchorDay: anchorDayOf(start), ...(s.status === "PENDING" && { startedAt: start }) },
  });
}

/** A weekly claim order was cancelled: that week's allowance is open again. */
export async function onSubscriptionClaimCancelledTx(t: Tx, orderId: string) {
  await t.subscriptionClaim.deleteMany({ where: { orderId } });
}
