// Yoco online payments (Checkout API), the pure parts: webhook signatures, what an event means for an order, and the
// checkout we ask Yoco for. The HTTP calls live in @/server/payments, the order changes in @/server/orders.
//
// Webhook signatures (Yoco docs → Checkout API → Webhooks → Verifying the events; the Standard Webhooks scheme):
// signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`, key = the base64 part of the `whsec_…` secret,
// signature = base64(HMAC-SHA256). `webhook-signature` holds space-separated `v1,<signature>` entries; any may match.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cardLabel, decidePayment, type OrderDue, type PaymentEventKind, type PaymentFacts } from "./online-payments";

export type { PaymentDecision } from "./online-payments";

/** Webhook timestamps more than this far from our clock (either way) are refused: replays. */
export const YOCO_TOLERANCE_SECONDS = 5 * 60;
/** Yoco doesn't take online payments under R2.00. */
export const YOCO_MIN_CENTS = 200;

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export function verifyYocoWebhook(secret: string, h: WebhookHeaders, rawBody: string, now = Date.now()): boolean {
  if (!secret || !h.id || !h.timestamp || !h.signature || !/^\d{1,12}$/.test(h.timestamp)) return false;
  if (Math.abs(now / 1000 - Number(h.timestamp)) > YOCO_TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest("base64"));
  return h.signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    const given = Buffer.from(version === "v1" && sig ? sig : "");
    return given.length === expected.length && timingSafeEqual(given, expected); // constant time
  });
}

/** A Checkout API webhook event: payment.succeeded | payment.failed | refund.succeeded | refund.failed. */
export type YocoEvent = {
  id: string;
  type: string;
  createdDate?: string;
  payload: {
    id: string; // the payment (or refund)
    type?: string; // "payment" | "refund"
    createdDate?: string;
    status?: string;
    amount?: number; // cents
    currency?: string;
    mode?: "live" | "test";
    metadata?: Record<string, unknown>; // the checkout's metadata (our orderId/orderCode) plus Yoco's checkoutId
    paymentMethodDetails?: { type?: string; card?: { maskedCard?: string; scheme?: string } };
    failureReason?: string;
  };
};

export function parseYocoEvent(rawBody: string): YocoEvent | null {
  try {
    const e = JSON.parse(rawBody) as YocoEvent;
    return e && typeof e.type === "string" && e.payload && typeof e.payload === "object" ? e : null;
  } catch {
    return null;
  }
}

/** What an event says, in our terms. Card details are only the scheme and last four digits. */
export function yocoFacts(e: YocoEvent): PaymentFacts {
  const m = e.payload.metadata ?? {};
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  const card = e.payload.paymentMethodDetails?.card;
  const last4 = card?.maskedCard?.match(/(\d{4})\s*$/)?.[1];
  const method = e.payload.paymentMethodDetails?.type;
  return {
    orderId: text(m.orderId),
    checkoutId: text(m.checkoutId),
    id: e.payload.id,
    amountCents: typeof e.payload.amount === "number" ? e.payload.amount : null,
    currency: e.payload.currency ?? null,
    mode: e.payload.mode ?? null,
    method: last4 ? cardLabel(card?.scheme, last4) : method === "instant_eft" ? "Instant EFT" : (method ?? null),
    failureReason: text(e.payload.failureReason),
  };
}
export type YocoFacts = PaymentFacts;

const KINDS = new Map<string, PaymentEventKind>([["payment.succeeded", "paid"], ["payment.failed", "payment.failed"], ["refund.succeeded", "payment.refunded"], ["refund.failed", "payment.refund_failed"]]);
/** The Yoco events we act on (payment.succeeded) or log; any other type is ignored. */
export const yocoEventKind = (type: string) => KINDS.get(type);

/** What a payment.succeeded event does to an order: the shared rules (@/lib/online-payments), refunds in the Yoco portal. */
export const paymentDecision = (f: YocoFacts, o: OrderDue | null) => decidePayment(f, o, "the Yoco portal");

/**
 * The checkout we ask Yoco for: the amount due after points (in cents, ZAR), the member's order page on our own site
 * whatever happens, and our order id and code to reconcile with (Yoco adds its checkoutId to the metadata).
 */
export function yocoCheckoutRequest(o: { id: string; code: string; dueCents: number }, appUrl: string) {
  const back = (pay: "success" | "cancelled" | "failed") => `${appUrl.replace(/\/+$/, "")}/orders/${o.code}?pay=${pay}`;
  return {
    amount: o.dueCents,
    currency: "ZAR",
    successUrl: back("success"),
    cancelUrl: back("cancelled"),
    failureUrl: back("failed"),
    metadata: { orderId: o.id, orderCode: o.code },
    externalId: o.code,
  };
}
export type YocoCheckoutRequest = ReturnType<typeof yocoCheckoutRequest>;
