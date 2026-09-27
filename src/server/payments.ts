// Payment rails. Each store is merchant of record with its own credentials.
//
// Card present (tap on glass): Halo Dot Halo.Link via Android app-to-app intent.
//   Backend: POST /consumer/intentTransaction { merchantId, amount, reference } → { transactionId, token }
//   POS:     launches intent action `za.co.synthesis.halo.transaction`, reads `result_transaction_type`
//   PWA:     POST /consumer/applink (deep link) or /consumer/push (to a paired Halo.Go device)
// Fallback: EXTERNAL terminal — any bank/fintech device the owner already has; the POS records the reference.
// Offline: card tenders are disabled (SoftPOS needs connectivity); cash is queued and synced idempotently.

export type CardResult =
  | { status: "APPROVED"; provider: string; reference: string; cardBrand?: string; cardLast4?: string }
  | { status: "DECLINED" | "NETWORK_ERROR" | "CANCELLED"; provider: string; message: string };

export type TapProvider = "SIMULATED" | "HALO_APPLINK" | "EXTERNAL";

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

// Online checkout (e-commerce). Adapter slot for PayFast / Paystack / Peach / Ozow (PayShap Request).
// Rails must match the product mix: most acquirers restrict cannabis and some restrict CBD on cards.
export type OnlineGateway = "SIMULATED" | "PAYFAST" | "PAYSTACK" | "PEACH" | "OZOW";
export const onlineGateway = (): OnlineGateway => (process.env.ONLINE_GATEWAY as OnlineGateway) || "SIMULATED";
