// Peach Payments online payments (Peach Orchestration, Hosted Checkout), the pure parts: webhook signatures, what a
// webhook or a payment's status means for an order, and the payment we ask Peach for. The HTTP calls live in
// @/server/payments, the order changes in @/server/orders. Docs: playground.peachpayments.com (docs/INTEGRATIONS.md).
//
// Webhook signatures (Peach Orchestration → Webhooks → Implement signature verification): the `x-webhook-signature-512`
// header is hex(HMAC-SHA512(raw body)), keyed with the business profile's payment_response_hash_key.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cardLabel, type PaymentEventKind, type PaymentFacts } from "./online-payments";

export function verifyPeachWebhook(key: string, signature: string | null, rawBody: string | Buffer): boolean {
  if (!key || !signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", key).update(rawBody).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected); // constant time
}

/** The parts of a Peach payment we read: GET /payments/{id}, and a payment webhook's content.object. Amounts in cents. */
export type PeachPayment = {
  payment_id: string;
  status: string; // requires_payment_method | processing | succeeded | failed | cancelled | expired | …
  amount: number;
  amount_received?: number | null;
  currency: string;
  metadata?: Record<string, unknown> | null; // ours: { orderId, orderCode }
  merchant_order_reference_id?: string | null;
  payment_method?: string | null;
  payment_method_type?: string | null;
  payment_method_data?: { card?: { last4?: string | null; card_network?: string | null } | null } | null;
  payment_link?: { link: string; payment_link_id?: string } | null;
  expires_on?: string | null;
  error_message?: string | null;
};
export type PeachRefund = { refund_id: string; payment_id: string; amount: number; currency: string; status: string; metadata?: Record<string, unknown> | null; error_message?: string | null };

/** A webhook delivery: { merchant_id, event_id, event_type, content: { type: "payment_details" | "refund_details" | …, object }, timestamp }. */
export type PeachEvent = { event_id: string | null; event_type: string; timestamp?: string; content: { type: string; object: Record<string, unknown> } };

export function parsePeachEvent(rawBody: string): PeachEvent | null {
  try {
    const e = JSON.parse(rawBody) as PeachEvent;
    const ok = e && typeof e.event_type === "string" && e.content && typeof e.content.type === "string" && e.content.object && typeof e.content.object === "object";
    return ok ? { ...e, event_id: typeof e.event_id === "string" ? e.event_id : null } : null;
  } catch {
    return null;
  }
}

const text = (v: unknown) => (typeof v === "string" && v ? v : null);
const METHODS = new Map(
  Object.entries({ credit: "Card", debit: "Card", apple_pay: "Apple Pay", google_pay: "Google Pay", samsung_pay: "Samsung Pay", pay_shap: "PayShap", capitec_pay: "Capitec Pay", peach_eft: "Peach EFT", scan_to_pay: "Scan to Pay" }),
);

/** A payment in our terms: Peach's payment is the checkout (its id is the order's paymentRef). Card: scheme and last 4 only. */
export function peachPaymentFacts(p: PeachPayment, mode: string | null): PaymentFacts {
  const card = p.payment_method_data?.card;
  const type = text(p.payment_method_type) ?? text(p.payment_method);
  return {
    orderId: text(p.metadata?.orderId),
    checkoutId: text(p.payment_id),
    id: text(p.payment_id) ?? "",
    amountCents: typeof p.amount_received === "number" ? p.amount_received : typeof p.amount === "number" ? p.amount : null,
    currency: text(p.currency),
    mode,
    method: card?.last4 ? cardLabel(card.card_network, card.last4) : type && (METHODS.get(type) ?? type),
    failureReason: text(p.error_message),
  };
}

/** What a webhook says: a payment (or a refund of one, carrying our metadata). */
export function peachFacts(e: PeachEvent, mode: string | null): PaymentFacts {
  if (e.content.type !== "refund_details") return peachPaymentFacts(e.content.object as PeachPayment, mode);
  const r = e.content.object as PeachRefund;
  const amountCents = typeof r.amount === "number" ? r.amount : null;
  return { orderId: text(r.metadata?.orderId), checkoutId: text(r.payment_id), id: text(r.refund_id) ?? "", amountCents, currency: text(r.currency), mode, method: null, failureReason: text(r.error_message) };
}

const KINDS = new Map<string, PaymentEventKind>([["payment_succeeded", "paid"], ["payment_failed", "payment.failed"], ["refund_succeeded", "payment.refunded"], ["refund_failed", "payment.refund_failed"]]);
/** The Peach events we act on (payment_succeeded) or log; any other type is ignored. */
export const peachEventKind = (type: string) => KINDS.get(type);

/** Peach's page stays open at least this long, even when the order's payment window is nearly over. */
export const PEACH_MIN_SESSION_SECONDS = 5 * 60;

/**
 * The payment we ask Peach for: Hosted Checkout (payment_link, not confirmed, captured automatically), the amount due
 * after points in ZAR cents, our order code as the merchant reference and our order id in the metadata, and the
 * member's order page on our own site to come back to. `paymentId` makes the request idempotent (peachPaymentId);
 * `sessionExpiry` (seconds) closes Peach's page when the order's payment window does.
 */
export function peachPaymentRequest(o: { id: string; code: string; dueCents: number }, appUrl: string, opts: { paymentId: string; sessionExpiry: number; profileId?: string | null }) {
  return {
    payment_id: opts.paymentId,
    amount: o.dueCents,
    currency: "ZAR",
    confirm: false,
    capture_method: "automatic",
    payment_link: true,
    session_expiry: opts.sessionExpiry,
    return_url: `${appUrl.replace(/\/+$/, "")}/orders/${o.code}?pay=peach`,
    merchant_order_reference_id: o.code,
    description: `Herbal Holland order ${o.code}`,
    metadata: { orderId: o.id, orderCode: o.code },
    payment_link_config: { seller_name: "Herbal Holland", theme: "#F5913C" },
    ...(opts.profileId ? { profile_id: opts.profileId } : {}),
  };
}

/**
 * Our id for an order's next Peach payment, after `current` (the order's paymentRef). Peach takes a 30-character
 * merchant payment_id and never creates the same one twice, so two clicks at once open one payment, not two. A stem
 * derived from the order id, plus the attempt (0-9a-z): a new id only after the last payment failed or expired.
 * Null after 36 attempts.
 */
export function peachPaymentId(orderId: string, current: string | null): string | null {
  const stem = `pay_${createHash("sha256").update(orderId).digest("hex").slice(0, 25)}`;
  const n = current?.length === 30 && current.startsWith(stem) ? parseInt(current.slice(-1), 36) + 1 : 0;
  return n < 36 ? stem + n.toString(36) : null;
}

const UNPAID = ["requires_payment_method", "requires_confirmation"];
const UNDERWAY = ["processing", "requires_capture", "requires_merchant_action", "partially_captured", "partially_captured_and_capturable", "partially_authorized_and_requires_capture", "partially_captured_and_processing", "conflicted"];

/**
 * What the pay page does with the order's current Peach payment (from a status query). "paid": it went through (the
 * webhook just hasn't landed). "wait": Peach is still processing it, so don't open a second one. "reuse": nothing tried
 * yet and Peach's page stays open for at least another minute (the member left and came back). "new": none, or it
 * failed, was abandoned mid-authentication, cancelled or expired, or doesn't match the order.
 */
export function peachNextStep(p: PeachPayment | null, dueCents: number, now = Date.now()): "paid" | "wait" | "reuse" | "new" {
  if (!p) return "new";
  if (p.status === "succeeded") return "paid";
  if (UNDERWAY.includes(p.status)) return "wait";
  const open = Date.parse(p.expires_on ?? "") - now > 60_000;
  return UNPAID.includes(p.status) && open && !!p.payment_link?.link && p.amount === dueCents && p.currency === "ZAR" ? "reuse" : "new";
}

/**
 * Back from Peach's page (…/orders/<code>?pay=peach&status=…&payment_id=…): what to show the member, one of "success"
 * (waiting for confirmation), "failed" or "cancelled". Only a hint: the browser brought it, so the webhook (or a
 * status query) decides whether the order is paid.
 */
export function peachReturn(status: string | undefined): "success" | "cancelled" | "failed" {
  if (status === "succeeded" || UNDERWAY.includes(status ?? "")) return "success";
  return status === "failed" ? "failed" : "cancelled";
}
