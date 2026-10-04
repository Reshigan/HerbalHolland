// Payment rails.
//
// Card present — the till's card tender (NEXT_PUBLIC_TAP_PROVIDER):
//   HALO_APPLINK  Halo Dot Halo.Link tap on glass via Android app-to-app intent; each store is merchant of record with
//                 its own credentials. Backend: POST /consumer/intentTransaction { merchantId, amount, reference }
//                 → { transactionId, token }; POS launches intent `za.co.synthesis.halo.transaction`, reads
//                 `result_transaction_type`; PWA: POST /consumer/applink (deep link) or /consumer/push (paired Halo.Go).
//   YOCO          the store's stand-alone Yoco card machine: the cashier charges the amount on the machine and keys in
//                 its reference (and optionally the card's last 4). The machine has its own connection, so this works
//                 while the till is offline. (The Yoco Payment SDK till app, which drives the machine, comes later.)
//   EXTERNAL      any bank/fintech terminal the owner already has; the POS records the approval code.
//   Offline: tap on glass is disabled (SoftPOS needs connectivity); cash is queued and synced idempotently.
//
// Online — the shop's checkout (ONLINE_GATEWAY): PEACH, Peach Payments' Hosted Checkout (Peach Orchestration), or
// YOCO, the Yoco Checkout API. One account for the online shop: the merchant is the company that owns the online
// business (Vantax (Pty) Ltd), not the fulfilling store.
import type { TapProviderKind } from "./pos/types";
import type { PeachPayment, PeachRefund } from "@/lib/peach";

export type CardResult =
  | { status: "APPROVED"; provider: string; reference: string; cardBrand?: string; cardLast4?: string }
  | { status: "DECLINED" | "NETWORK_ERROR" | "CANCELLED"; provider: string; message: string };

export type TapProvider = TapProviderKind;

/** Simulated payments (the demo, development and tests) never run on a production server outside DEMO_MODE. */
export const simulationAllowed = () => process.env.DEMO_MODE === "true" || process.env.NODE_ENV !== "production";
/** Unset in production (and not a demo): the till records card payments taken on a bank terminal, never a simulated tap. */
export const tapProvider = (): TapProvider => (process.env.NEXT_PUBLIC_TAP_PROVIDER as TapProvider) || (simulationAllowed() ? "SIMULATED" : "EXTERNAL");

/** Server side of a Halo app-link session. Requires HALO_API_URL + per-store merchant IDs. */
export async function createHaloSession(opts: { merchantId: string; amountCents: number; reference: string }) {
  const base = process.env.HALO_API_URL;
  if (!base || !process.env.HALO_API_KEY) throw new Error("Halo Dot is not configured (HALO_API_URL, HALO_API_KEY)");
  const res = await fetch(`${base}/consumer/applink`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.HALO_API_KEY },
    body: JSON.stringify({ merchantId: opts.merchantId, amount: (opts.amountCents / 100).toFixed(2), paymentReference: opts.reference, currencyCode: "ZAR" }),
  });
  if (!res.ok) throw new Error(`Halo session failed (${res.status})`);
  return (await res.json()) as { url: string; transactionId?: string };
}

// Online checkout (e-commerce). SIMULATED (demo and tests), PEACH or YOCO; other adapters would slot in beside them.
export type OnlineGateway = "SIMULATED" | "YOCO" | "PAYFAST" | "PAYSTACK" | "PEACH" | "OZOW";
export const onlineGateway = (): OnlineGateway => (process.env.ONLINE_GATEWAY as OnlineGateway) || "SIMULATED";
/** The gateways with a hosted payment page, and how members see them. */
export const HOSTED_GATEWAYS = { PEACH: "Peach Payments", YOCO: "Yoco" } as const;
export type HostedGateway = keyof typeof HOSTED_GATEWAYS;
export const hostedGateway = (): HostedGateway | null => {
  const g = onlineGateway();
  return g === "PEACH" || g === "YOCO" ? g : null;
};

export class PaymentError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/**
 * The gateway holding a paid online order's money, from its checkout id (paymentRef): Peach payments are pay_…, Yoco
 * checkouts ch_… (so orders paid before a switch of ONLINE_GATEWAY still refund where they were paid). Simulated
 * payments (SIM-…) have none.
 */
export function paidOnlineWith(o: { payMethod: string; paymentStatus: string; paymentRef: string | null }): HostedGateway | null {
  if (o.payMethod !== "ONLINE" || o.paymentStatus !== "PAID" || !o.paymentRef || o.paymentRef.startsWith("SIM-") || o.paymentRef.startsWith("VOUCHER:")) return null;
  return o.paymentRef.startsWith("pay_") ? "PEACH" : o.paymentRef.startsWith("ch_") ? "YOCO" : hostedGateway();
}

// ── Yoco Checkout API ─────────────────────────────────────────────────────────
// YOCO_SECRET_KEY (sk_test_… or sk_live_…) authenticates every call; YOCO_WEBHOOK_SECRET (whsec_…) verifies the webhook
// (/api/payments/yoco). Each call carries an Idempotency-Key: for 24 hours Yoco answers a repeated key with the first
// response, so a retry never creates a second checkout or a second refund.

const YOCO_API = "https://payments.yoco.com/api";

/** Test keys: Yoco doesn't refund test payments, and they never reach the sales history. */
export const yocoTestMode = () => (process.env.YOCO_SECRET_KEY ?? "").startsWith("sk_test_");

async function yocoPost<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
  const key = process.env.YOCO_SECRET_KEY;
  if (!key) throw new PaymentError("Yoco isn't set up (YOCO_SECRET_KEY)");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${YOCO_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    }).catch((e: Error) => {
      throw new PaymentError(`Couldn't reach Yoco (${e.message})`);
    });
    // 409: the first request with this key is still being processed (a double click). Wait, then Yoco replays its answer.
    if (res.status === 409 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 750 * attempt));
      continue;
    }
    const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
    if (!res.ok || !data) throw new PaymentError(`Yoco ${res.status}: ${data?.message ?? (res.statusText || "no details")}`);
    return data;
  }
}

export type YocoCheckout = { id: string; redirectUrl: string; status: string; processingMode?: "live" | "test" };

/** POST /checkouts — the hosted payment page for one order. */
export const createYocoCheckout = (body: object, idempotencyKey: string) => yocoPost<YocoCheckout>("/checkouts", body, idempotencyKey);

/** POST /checkouts/{id}/refund — "succeeded", or "pending" (Yoco then reports the outcome by webhook). */
export async function refundYocoCheckout(checkoutId: string, amountCents: number, idempotencyKey: string, metadata: Record<string, string>) {
  const r = await yocoPost<{ refundId?: string; status?: string; message?: string }>(`/checkouts/${encodeURIComponent(checkoutId)}/refund`, { amount: amountCents, metadata }, idempotencyKey);
  if ((r.status !== "succeeded" && r.status !== "pending") || !r.refundId) throw new PaymentError(r.message || `Yoco refund ${r.status ?? "failed"}`);
  return { refundId: r.refundId, status: r.status };
}

// ── Peach Payments: Peach Orchestration, Hosted Checkout ──────────────────────
// PEACH_API_KEY (the merchant's secret API key, snd_… in the sandbox, prd_… live) goes in the api-key header of every
// call; PEACH_ENV picks the API: test (the sandbox, the default) or live. PEACH_PROFILE_ID names the business profile
// if the account has more than one. The webhook (/api/payments/peach) is verified with the profile's
// payment_response_hash_key (PEACH_PAYMENT_RESPONSE_HASH_KEY). A payment is created with our own payment_id, which
// Peach never creates twice (peachPaymentId), and a refund first checks what's already been refunded.

const PEACH_API = { test: "https://app.sandbox-next.peachpayments.com/api", live: "https://app.next.peachpayments.com/api" };
export const peachMode = () => (process.env.PEACH_ENV === "live" ? "live" : "test");

async function peach<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  const key = process.env.PEACH_API_KEY;
  if (!key) throw new PaymentError("Peach Payments isn't set up (PEACH_API_KEY)");
  const res = await fetch(`${PEACH_API[peachMode()]}${path}`, {
    method,
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  }).catch((e: Error) => {
    throw new PaymentError(`Couldn't reach Peach Payments (${e.message})`);
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string }; message?: string }) | null;
  if (!res.ok || !data) throw new PaymentError(`Peach ${res.status}: ${data?.error?.message ?? data?.message ?? (res.statusText || "no details")}`, res.status);
  return data;
}

/** POST /payments — a Hosted Checkout payment for one order; payment_link.link is Peach's page. */
export const createPeachPayment = (body: object) => peach<PeachPayment>("POST", "/payments", body);

/** GET /payments/{id}?force_sync=true — the payment's status, checked with the processor (Peach allows 2 a minute per payment). Null: no such payment. */
export async function peachPayment(id: string): Promise<PeachPayment | null> {
  return peach<PeachPayment>("GET", `/payments/${encodeURIComponent(id)}?force_sync=true`).catch((e) => {
    if (e instanceof PaymentError && e.status === 404) return null;
    throw e;
  });
}

const REFUNDING = ["succeeded", "pending", "review"];

/**
 * Refunds a Peach payment in full, at most once: refunds already made (a retried cancel, or part refunded in the
 * Peach Dashboard) count first, and only the rest is refunded (POST /refunds). "succeeded", or "pending"/"review"
 * (Peach then reports the outcome by webhook).
 */
export async function refundPeachPayment(paymentId: string, amountCents: number, reason: string, metadata: Record<string, string>) {
  const { data = [] } = await peach<{ data?: PeachRefund[] }>("POST", "/refunds/list", { payment_id: paymentId });
  const made = data.filter((r) => r.payment_id === paymentId && REFUNDING.includes(r.status));
  const left = amountCents - made.reduce((s, r) => s + r.amount, 0);
  const all = left > 0 ? [...made, await peach<PeachRefund>("POST", "/refunds", { payment_id: paymentId, amount: left, reason, metadata })] : made;
  const failed = all.find((r) => !REFUNDING.includes(r.status) || !r.refund_id);
  if (failed) throw new PaymentError(failed.error_message || `Peach refund ${failed.status ?? "failed"}`);
  return { refundId: all.map((r) => r.refund_id).join(", "), status: all.every((r) => r.status === "succeeded") ? "succeeded" : "pending" };
}
