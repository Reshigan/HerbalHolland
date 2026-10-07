// Push subscription renewal from the Rewards service worker (pushsubscriptionchange): browsers rotate a device's
// subscription now and then; without this the member silently stops getting drop alerts.
//   GET  → the VAPID public key (to subscribe again)
//   POST { old: endpoint | null, sub } → saves the new subscription for the signed-in member, forgets the old one
import { z } from "zod";
import { readJson } from "@/lib/body";
import { PushSub } from "@/lib/push-sub";
import { sameOrigin } from "@/lib/same-origin";
import { getCustomer } from "@/server/auth";
import { db } from "@/server/db";
import { savePushSubscription, vapidPublicKey } from "@/server/push";

const Body = z.object({
  old: z.string().max(1000).nullish(),
  sub: PushSub,
});

export async function GET() {
  const key = vapidPublicKey();
  return key ? new Response(key, { headers: { "Cache-Control": "no-store" } }) : new Response("Not configured", { status: 404 });
}

export async function POST(req: Request) {
  // The service worker posts JSON from our own origin; nothing else may change a subscription.
  if (!sameOrigin(req.headers, req.url)) return new Response("Cross-site request refused", { status: 403 });
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return new Response("Expected JSON", { status: 415 });
  const c = await getCustomer();
  if (!c) return new Response("Sign in", { status: 401 });
  const b = Body.safeParse(await readJson(req, 8_000));
  if (!b.success) return new Response("Bad subscription", { status: 400 });
  await savePushSubscription(c.id, b.data.sub);
  if (b.data.old && b.data.old !== b.data.sub.endpoint) await db.pushSubscription.deleteMany({ where: { customerId: c.id, endpoint: b.data.old } });
  return new Response(null, { status: 204 });
}
