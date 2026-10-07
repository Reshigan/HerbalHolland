import { z } from "zod";

// The server POSTs every notification to a subscription's endpoint, so only the browsers' own push services are
// accepted: anything else would let a signed-in member point the server at an address of their choosing.
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const PUSH_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

export function isPushEndpoint(s: string): boolean {
  if (!URL.canParse(s)) return false;
  const u = new URL(s);
  if (u.protocol !== "https:" || u.port || u.username || u.password) return false;
  return PUSH_HOSTS.includes(u.hostname) || PUSH_SUFFIXES.some((x) => u.hostname.endsWith(x));
}

export const PushSub = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint, "Invalid endpoint"),
  keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
});
