// Yoco webhook (Checkout API): register `${APP_URL}/api/payments/yoco` with Yoco (docs/INTEGRATIONS.md → Online payments).
// The signature covers the raw body byte for byte, so it's read as text, verified with YOCO_WEBHOOK_SECRET (HMAC,
// 5-minute window), and only then parsed. 400: not from Yoco. 200: handled, already handled (a retry carries the same
// webhook-id, and does nothing again), or not ours (Yoco stops retrying). 503: no secret configured yet (Yoco keeps
// retrying, so nothing is lost while it's set up).
import { readCapped } from "@/lib/body";
import { parseYocoEvent, verifyYocoWebhook } from "@/lib/yoco";
import { applyYocoEvent, onceForEvent } from "@/server/orders";

export async function POST(req: Request) {
  const secret = process.env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[yoco] webhook received, but YOCO_WEBHOOK_SECRET isn't set");
    return Response.json({ ok: false, error: "Yoco webhooks aren't set up" }, { status: 503 });
  }
  const body = await readCapped(req, 256_000);
  if (!body) return Response.json({ ok: false, error: "Too large" }, { status: 413 });
  const raw = body.toString("utf8");
  const h = req.headers;
  if (!verifyYocoWebhook(secret, { id: h.get("webhook-id"), timestamp: h.get("webhook-timestamp"), signature: h.get("webhook-signature") }, raw)) {
    console.warn(`[yoco] webhook refused: bad signature or stale timestamp (webhook-id ${h.get("webhook-id")?.slice(0, 60) ?? "none"}, timestamp ${h.get("webhook-timestamp")?.slice(0, 20) ?? "none"})`);
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }
  const event = parseYocoEvent(raw);
  if (!event) return Response.json({ ok: false, error: "Unreadable event" }, { status: 400 });
  const r = await onceForEvent("YOCO", h.get("webhook-id"), () => applyYocoEvent(event));
  return Response.json({ ok: true, ...r });
}
