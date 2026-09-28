// Yoco online payments (Checkout API), the pure parts: webhook signatures, what an event means for an order, and the
// checkout we ask Yoco for. The HTTP calls live in @/server/payments, the order changes in @/server/orders.
//
// Webhook signatures (Yoco docs → Checkout API → Webhooks → Verifying the events; the Standard Webhooks scheme):
// signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`, key = the base64 part of the `whsec_…` secret,
// signature = base64(HMAC-SHA256). `webhook-signature` holds space-separated `v1,<signature>` entries; any may match.
import { createHmac, timingSafeEqual } from "node:crypto";
import { zar } from "./money";

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

const SCHEMES: Record<string, string> = { visa: "Visa", visaelectron: "Visa Electron", mastercard: "Mastercard", maestro: "Maestro", amex: "Amex" };

/** What an event says, in our terms. Card details are only the scheme and last four digits. */
export function yocoFacts(e: YocoEvent) {
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
    method: last4 ? `${SCHEMES[card?.scheme ?? ""] ?? "Card"} •••• ${last4}` : method === "instant_eft" ? "Instant EFT" : (method ?? null),
    failureReason: text(e.payload.failureReason),
  };
}
export type YocoFacts = ReturnType<typeof yocoFacts>;

export type PaymentDecision = { action: "pay" | "repeat" | "ignore" | "review"; reason: string };

/**
 * What a payment.succeeded event does to an order. "pay": mark it paid. "repeat": already recorded (Yoco redelivered).
 * "ignore": not one of our orders (the webhook sees every payment on the Yoco account). "review": money that doesn't fit
 * the order — another checkout, another amount, or paid after the order was cancelled — for a person to sort out.
 */
export function paymentDecision(f: YocoFacts, o: { status: string; paymentStatus: string; paymentRef: string | null; dueCents: number } | null): PaymentDecision {
  if (!o) return { action: "ignore", reason: "No Herbal Holland order for this payment" };
  if (!f.checkoutId || f.checkoutId !== o.paymentRef) return { action: "review", reason: `Paid on checkout ${f.checkoutId ?? "(none)"}, but the order's checkout is ${o.paymentRef ?? "(none)"}` };
  if (o.paymentStatus !== "UNPAID") return { action: "repeat", reason: `Payment already recorded (${o.paymentStatus.toLowerCase()})` };
  if (f.currency !== "ZAR" || f.amountCents !== o.dueCents)
    return { action: "review", reason: `Paid ${f.amountCents == null ? "an unknown amount" : f.currency === "ZAR" ? zar(f.amountCents) : `${f.amountCents} ${f.currency}`}, but ${zar(o.dueCents)} is due` };
  if (o.status === "CANCELLED") return { action: "review", reason: "Paid after the order was cancelled: refund the member in the Yoco portal" };
  if (o.status !== "PENDING_PAYMENT") return { action: "review", reason: `Paid while the order was ${o.status.toLowerCase()}` };
  return { action: "pay", reason: "Checkout and amount match the order" };
}

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
