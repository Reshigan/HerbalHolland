// Web Push for the Herbal Holland Rewards app (VAPID: WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT).
// Without keys, pushes are only logged (development). iPhones need the app added to the Home Screen (iOS 16.4+).
import webpush from "web-push";
import { db } from "./db";
import { FALLBACK_EMAIL } from "@/lib/contact";

export const vapidPublicKey = () => process.env.WEB_PUSH_PUBLIC_KEY ?? null;
const live = () => !!(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY);
let configured = false;

export type PushPayload = { title: string; body: string; url?: string };

/** Pushes to every device the member subscribed and prunes subscriptions the browser revoked. Throws if none got it. */
export async function pushToCustomer(customerId: string, p: PushPayload) {
  const subs = await db.pushSubscription.findMany({ where: { customerId } });
  if (!subs.length) throw new Error("No push subscription");
  if (!live()) return subs.length;
  if (!configured) {
    webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT ?? `mailto:${FALLBACK_EMAIL}`, process.env.WEB_PUSH_PUBLIC_KEY!, process.env.WEB_PUSH_PRIVATE_KEY!);
    configured = true;
  }
  let delivered = 0;
  await Promise.all(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 3600 }).then(
        () => void delivered++,
        (e: { statusCode?: number }) => (e.statusCode === 404 || e.statusCode === 410 ? db.pushSubscription.delete({ where: { id: s.id } }).catch(() => null) : null),
      ),
    ),
  );
  if (!delivered) throw new Error("Push not delivered");
  return delivered;
}

/** Saves a browser subscription (from PushManager.subscribe) for a member. */
export function savePushSubscription(customerId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const data = { customerId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  return db.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: data, update: data });
}
