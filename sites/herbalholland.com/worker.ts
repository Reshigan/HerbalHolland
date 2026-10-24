// herbalholland.com on Cloudflare: the static pages in dist/ (served before this Worker runs) and one API route, the
// early-access list (kept in D1 until the shop opens). The site no longer takes franchise enquiries: the old franchise
// page's addresses go to /about for good, and the enquiries received before it closed stay in D1 only until the daily
// clean-up below deletes them (HQ → Franchise leads keeps the ones handed to it).
import { EARLY_ACCESS_CONSENT, EARLY_ACCESS_LIMITS, validateEarlyAccess } from "../../src/lib/leads";

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  IP_SALT?: string;
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const HOUR = 3_600_000;

/** The franchise page's old addresses. wrangler.jsonc runs the Worker first for these: otherwise a browser opening one
 *  would get the 404 page straight from the assets, without the Worker seeing the request. */
const FRANCHISE_PAGE = new Set(["/franchise", "/franchise/", "/franchise.html"]);
/** The short join link said in videos and on signs: herbalholland.com/join, straight to Rewards sign-up. */
const JOIN = "https://shop.herbalholland.com/club/join?src=join";

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (FRANCHISE_PAGE.has(url.pathname)) return Response.redirect(new URL("/about", url).href, 301);
    if (url.pathname === "/join" || url.pathname === "/join/") return Response.redirect(JOIN, 302);
    if (url.pathname === "/api/early-access") return req.method === "POST" ? earlyAccess(req, env) : json(405, { ok: false, error: "Method not allowed" });
    return env.ASSETS.fetch(req);
  },
  // Daily (POPIA: no longer than needed): franchise enquiries a year after they came in, or 30 days after HQ has them;
  // early-access sign-ups 12 months after they joined the list.
  async scheduled(_: unknown, env: Env) {
    const ago = (days: number) => new Date(Date.now() - days * 24 * HOUR).toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM enquiries WHERE created_at < ? OR (forwarded_at IS NOT NULL AND forwarded_at < ?)").bind(ago(365), ago(30)),
      env.DB.prepare("DELETE FROM early_access WHERE created_at < ?").bind(ago(365)),
    ]);
  },
};

/** A sign-up for first access to the online shop. Already on the list: the same answer, nothing new kept. */
async function earlyAccess(req: Request, env: Env) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json(403, { ok: false, error: "Not allowed" });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "That didn't come through. Please try again." });
  }
  if (typeof body.website === "string" && body.website.trim()) return json(200, { ok: true });
  const check = validateEarlyAccess(body);
  if (!check.ok) return json(422, { ok: false, error: "Please check the highlighted fields.", fields: check.fields });
  const d = check.data;

  const ip = req.headers.get("cf-connecting-ip");
  const ipHash = ip ? await hmac(env.IP_SALT ?? "", ip) : null;
  if (ipHash) {
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM early_access WHERE ip_hash = ? AND created_at >= ?").bind(ipHash, new Date(Date.now() - HOUR).toISOString()).first<{ n: number }>();
    if ((recent?.n ?? 0) >= EARLY_ACCESS_LIMITS.perIpHour) return json(429, { ok: false, error: "We've had several sign-ups from your connection in the last hour. Please try again later." });
  }
  await env.DB.prepare("INSERT OR IGNORE INTO early_access (created_at, first_name, email, mobile, province, source, consent, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(new Date().toISOString(), d.firstName, d.email, d.mobile, d.province, d.source, EARLY_ACCESS_CONSENT, ipHash)
    .run();
  return json(200, { ok: true });
}

async function hmac(key: string, value: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}
