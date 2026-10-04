// The client's IP as our edge reports it. Production sits behind Cloudflare and the origin accepts only Cloudflare's
// addresses (RUNBOOK → Hosting), so cf-connecting-ip is trustworthy; behind a plain reverse proxy it's x-real-ip, or
// the last x-forwarded-for hop (the one our proxy appended — earlier hops are whatever the client claimed).
// Null when nothing looks like an IP. Never store it raw: hash it with a keyed hash first.
export type HeaderBag = { get(name: string): string | null };

export function clientIpFrom(h: HeaderBag): string | null {
  const forwarded = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  const ip = [h.get("cf-connecting-ip"), h.get("x-real-ip"), forwarded?.[forwarded.length - 1]].map((s) => s?.trim()).find(Boolean);
  return ip && /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip.toLowerCase() : null;
}
