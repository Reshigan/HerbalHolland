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
// Online — the shop's checkout (ONLINE_GATEWAY): YOCO, the Yoco Checkout API. One Yoco account for the online shop:
// the merchant is the company that owns the online business (Vantax (Pty) Ltd), not the fulfilling store.
import type { TapProviderKind } from "./pos/types";

export type CardResult =
  | { status: "APPROVED"; provider: string; reference: string; cardBrand?: string; cardLast4?: string }
  | { status: "DECLINED" | "NETWORK_ERROR" | "CANCELLED"; provider: string; message: string };

export type TapProvider = TapProviderKind;

export const tapProvider = (): TapProvider => (process.env.NEXT_PUBLIC_TAP_PROVIDER as TapProvider) || "SIMULATED";

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

// Online checkout (e-commerce). SIMULATED (demo and tests) or YOCO; other adapters would slot in beside it.
export type OnlineGateway = "SIMULATED" | "YOCO" | "PAYFAST" | "PAYSTACK" | "PEACH" | "OZOW";
export const onlineGateway = (): OnlineGateway => (process.env.ONLINE_GATEWAY as OnlineGateway) || "SIMULATED";

// ── Yoco Checkout API ─────────────────────────────────────────────────────────
// YOCO_SECRET_KEY (sk_test_… or sk_live_…) authenticates every call; YOCO_WEBHOOK_SECRET (whsec_…) verifies the webhook
// (/api/payments/yoco). Each call carries an Idempotency-Key: for 24 hours Yoco answers a repeated key with the first
// response, so a retry never creates a second checkout or a second refund.

const YOCO_API = "https://payments.yoco.com/api";

export class PaymentError extends Error {}

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

/** Online orders paid through Yoco keep its checkout id as paymentRef (simulated payments have SIM- references). */
export const paidWithYoco = (o: { payMethod: string; paymentStatus: string; paymentRef: string | null }) =>
  onlineGateway() === "YOCO" && o.payMethod === "ONLINE" && o.paymentStatus === "PAID" && !!o.paymentRef && !o.paymentRef.startsWith("SIM-");
