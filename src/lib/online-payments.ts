// Online payments, whichever hosted gateway takes them (Yoco, Peach Payments): the rules that don't depend on the
// gateway. What a gateway's notification says, in our terms, and what a successful payment does to an order.
// The gateways' own parts live beside this (@/lib/yoco, @/lib/peach); HTTP calls in @/server/payments.
import { zar } from "./money";

/** A gateway notification (or status query) in our terms. checkoutId is what the order keeps as its paymentRef. */
export type PaymentFacts = {
  orderId: string | null;
  checkoutId: string | null;
  id: string; // the gateway's payment (or refund) id
  amountCents: number | null;
  currency: string | null;
  mode: string | null; // "live" | "test"
  method: string | null; // "Visa •••• 4242", "Instant EFT", …
  failureReason: string | null;
};

/** What an event means for us: a payment that went through, or something only worth logging (audit action). */
export type PaymentEventKind = "paid" | "payment.failed" | "payment.refunded" | "payment.refund_failed";

export type PaymentDecision = { action: "pay" | "repeat" | "ignore" | "review"; reason: string };
export type OrderDue = { status: string; paymentStatus: string; paymentRef: string | null; dueCents: number };

/**
 * What a successful payment does to an order. "pay": mark it paid. "repeat": already recorded (redelivered).
 * "ignore": not one of our orders (the webhook sees every payment on the account). "review": money that doesn't fit
 * the order — another checkout, another amount, or paid after the order was cancelled — for a person to sort out,
 * refunding in `refundIn` (the gateway's portal) if need be.
 */
export function decidePayment(f: Pick<PaymentFacts, "checkoutId" | "amountCents" | "currency">, o: OrderDue | null, refundIn: string): PaymentDecision {
  if (!o) return { action: "ignore", reason: "No Herbal Holland order for this payment" };
  if (!f.checkoutId || f.checkoutId !== o.paymentRef) return { action: "review", reason: `Paid on checkout ${f.checkoutId ?? "(none)"}, but the order's checkout is ${o.paymentRef ?? "(none)"}` };
  if (o.paymentStatus !== "UNPAID") return { action: "repeat", reason: `Payment already recorded (${o.paymentStatus.toLowerCase()})` };
  if (f.currency !== "ZAR" || f.amountCents !== o.dueCents)
    return { action: "review", reason: `Paid ${f.amountCents == null ? "an unknown amount" : f.currency === "ZAR" ? zar(f.amountCents) : `${f.amountCents} ${f.currency}`}, but ${zar(o.dueCents)} is due` };
  if (o.status === "CANCELLED") return { action: "review", reason: `Paid after the order was cancelled: refund the member in ${refundIn}` };
  if (o.status !== "PENDING_PAYMENT") return { action: "review", reason: `Paid while the order was ${o.status.toLowerCase()}` };
  return { action: "pay", reason: "Checkout and amount match the order" };
}

const SCHEMES = new Map(
  Object.entries({ visa: "Visa", visaelectron: "Visa Electron", mastercard: "Mastercard", maestro: "Maestro", amex: "Amex", americanexpress: "Amex", diners: "Diners", dinersclub: "Diners" }),
);

/** "Yoco's page", "Peach Payments' page". */
export const possessive = (name: string) => `${name}${name.endsWith("s") ? "'" : "'s"}`;

/** Card details we keep: only the scheme and the last four digits. */
export const cardLabel = (scheme: string | null | undefined, last4: string) => `${SCHEMES.get((scheme ?? "").toLowerCase()) ?? "Card"} •••• ${last4}`;
