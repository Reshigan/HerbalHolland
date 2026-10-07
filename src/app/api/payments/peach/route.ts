// Peach Payments webhook (Peach Orchestration): register `${APP_URL}/api/payments/peach` in the Peach Dashboard (Peach
// Orchestration → Webhooks; docs/INTEGRATIONS.md → Online payments). The signature covers the raw body byte for byte, so
// it's read as bytes, verified with PEACH_PAYMENT_RESPONSE_HASH_KEY (x-webhook-signature-512: hex HMAC-SHA512), and
// only then parsed. 401: not from Peach (as Peach's docs ask). 400: unreadable. 200: handled, already handled (a
// redelivery of the same event_id does nothing again), or not ours (Peach stops retrying). 503: no key configured yet
// (Peach retries for 24 hours, so nothing is lost while it's set up).
import { readCapped } from "@/lib/body";
import { parsePeachEvent, verifyPeachWebhook } from "@/lib/peach";
import { applyPeachEvent, onceForEvent } from "@/server/orders";

export async function POST(req: Request) {
  const key = process.env.PEACH_PAYMENT_RESPONSE_HASH_KEY;
  if (!key) {
    console.error("[peach] webhook received, but PEACH_PAYMENT_RESPONSE_HASH_KEY isn't set");
    return Response.json({ ok: false, error: "Peach webhooks aren't set up" }, { status: 503 });
  }
  const raw = await readCapped(req, 256_000);
  if (!raw) return Response.json({ ok: false, error: "Too large" }, { status: 413 });
  const signature = req.headers.get("x-webhook-signature-512");
  if (!verifyPeachWebhook(key, signature, raw)) {
    console.warn(`[peach] webhook refused: ${signature ? "the signature doesn't match" : "no x-webhook-signature-512 header"}`);
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }
  const event = parsePeachEvent(raw.toString("utf8"));
  if (!event) return Response.json({ ok: false, error: "Unreadable event" }, { status: 400 });
  return Response.json({ ok: true, ...(await onceForEvent("PEACH", event.event_id, () => applyPeachEvent(event))) });
}
