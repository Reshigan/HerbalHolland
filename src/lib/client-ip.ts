// The client's IP as our edge reports it. Production sits behind Cloudflare and the origin accepts only Cloudflare's
// addresses (RUNBOOK → Hosting), so cf-connecting-ip is trustworthy; behind a plain reverse proxy it's x-real-ip, or
// the last x-forwarded-for hop (the one our proxy appended; earlier hops are whatever the client claimed).
// Null when nothing looks like an IP. Never store it raw: hash it with a keyed hash first.
export type HeaderBag = { get(name: string): string | null };

/**
 * The IP as a rate-limit bucket: IPv4 as is, IPv6 by its /64 (one home or server connection gets a whole /64, so the
 * full address would hand it endless fresh identities). Keyed hashes of this go into throttle keys.
 */
export function ipBucket(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":") + "::/64";
}

export function clientIpFrom(h: HeaderBag): string | null {
  const forwarded = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  const ip = [h.get("cf-connecting-ip"), h.get("x-real-ip"), forwarded?.[forwarded.length - 1]].map((s) => s?.trim()).find(Boolean);
  return ip && /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip.toLowerCase() : null;
}
