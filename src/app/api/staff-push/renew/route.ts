// Staff push subscription renewal from the staff service worker (pushsubscriptionchange): browsers rotate a phone's
// subscription now and then; without this the manager silently stops hearing about orders.
//   GET  → the VAPID public key (to subscribe again)
//   POST { old: endpoint | null, sub } → saves the new subscription for the signed-in staff member, forgets the old one
import { z } from "zod";
import { readJson } from "@/lib/body";
import { PushSub } from "@/lib/push-sub";
import { sameOrigin } from "@/lib/same-origin";
import { getStaff } from "@/server/auth";
import { removeStaffSubscription, saveStaffSubscription, STAFF_PUSH_ROLES, staffVapidKey } from "@/server/staff-push";

const Body = z.object({
  old: z.string().max(1000).nullish(),
  sub: PushSub,
});

export async function GET() {
  const key = staffVapidKey();
  return key ? new Response(key, { headers: { "Cache-Control": "no-store" } }) : new Response("Not configured", { status: 404 });
}

export async function POST(req: Request) {
  // The service worker posts JSON from our own origin; nothing else may change a subscription.
  if (!sameOrigin(req.headers, req.url)) return new Response("Cross-site request refused", { status: 403 });
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return new Response("Expected JSON", { status: 415 });
  const u = await getStaff();
  if (!u || !STAFF_PUSH_ROLES.includes(u.role)) return new Response("Sign in", { status: 401 });
  const b = Body.safeParse(await readJson(req, 8_000));
  if (!b.success) return new Response("Bad subscription", { status: 400 });
  await saveStaffSubscription(u.id, b.data.sub, req.headers.get("user-agent"));
  if (b.data.old && b.data.old !== b.data.sub.endpoint) await removeStaffSubscription(u.id, b.data.old);
  return new Response(null, { status: 204 });
}
