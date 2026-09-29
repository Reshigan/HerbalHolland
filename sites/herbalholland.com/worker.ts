// herbalholland.com on Cloudflare: the static pages in dist/ (served before this Worker runs) and two API routes: the
// franchise enquiry form and the early-access list (kept in D1 until the shop opens). Enquiries are checked with the platform's own rules (src/lib/leads.ts), kept in D1 and sent on:
// to HQ → Franchise leads once the platform is live (APP_ENQUIRY_URL + APP_ENQUIRY_SECRET), otherwise by email to the
// team (NOTIFY_TO, a verified Email Routing address).
import { EmailMessage } from "cloudflare:email";
import { EARLY_ACCESS_CONSENT, EARLY_ACCESS_LIMITS, LEAD_LIMITS, capitalLabel, validateEarlyAccess, validateLead, type CleanLead, type RawLead } from "../../src/lib/leads";
import { PROVINCES } from "../../src/lib/sa";

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  MAILER?: SendEmail;
  NOTIFY_FROM?: string;
  NOTIFY_TO?: string;
  IP_SALT?: string;
  APP_ENQUIRY_URL?: string;
  APP_ENQUIRY_SECRET?: string;
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const HOUR = 3_600_000;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname === "/api/enquiry") return req.method === "POST" ? enquiry(req, env, ctx) : json(405, { ok: false, error: "Method not allowed" });
    if (url.pathname === "/api/early-access") return req.method === "POST" ? earlyAccess(req, env) : json(405, { ok: false, error: "Method not allowed" });
    return env.ASSETS.fetch(req);
  },
  // Daily (POPIA: no longer than needed): enquiries a year after they came in, or 30 days after HQ has them; early-access
  // sign-ups 12 months after they joined the list.
  async scheduled(_: unknown, env: Env) {
    const ago = (days: number) => new Date(Date.now() - days * 24 * HOUR).toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM enquiries WHERE created_at < ? OR (forwarded_at IS NOT NULL AND forwarded_at < ?)").bind(ago(365), ago(30)),
      env.DB.prepare("DELETE FROM early_access WHERE created_at < ?").bind(ago(365)),
    ]);
  },
};

async function enquiry(req: Request, env: Env, ctx: ExecutionContext) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return json(403, { ok: false, error: "Not allowed" });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "That didn't come through. Please try again." });
  }
  // People never see the "website" field; form-filling bots do. Same thank-you, nothing kept.
  if (typeof body.website === "string" && body.website.trim()) return json(200, { ok: true, reference: null });
  const check = validateLead(body as RawLead);
  if (!check.ok) return json(422, { ok: false, error: "Please check the highlighted fields.", fields: check.fields });
  const d = check.data;

  const ip = req.headers.get("cf-connecting-ip");
  const ipHash = ip ? await hmac(env.IP_SALT ?? "", ip) : null;
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [fromIp, fromEmail] = await Promise.all([
    ipHash ? env.DB.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE ip_hash = ? AND created_at >= ?").bind(ipHash, since(HOUR)).first<{ n: number }>() : null,
    env.DB.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE email = ? AND created_at >= ?").bind(d.email, since(24 * HOUR)).first<{ n: number }>(),
  ]);
  if ((fromEmail?.n ?? 0) >= LEAD_LIMITS.perEmailDay)
    return json(429, { ok: false, error: "We already have your enquiry from today, so there's no need to send it again: we'll reply by email within a few working days." });
  if ((fromIp?.n ?? 0) >= LEAD_LIMITS.perIpHour) return json(429, { ok: false, error: "We've had several enquiries from your connection in the last hour. Please try again later." });

  const row = await env.DB.prepare(
    `INSERT INTO enquiries (created_at, name, email, phone, area, province, experience, capital, pharmacist, message, source, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(new Date().toISOString(), d.name, d.email, d.phone, d.area, d.province, d.experience, d.capital, d.pharmacist ? 1 : 0, d.message, d.source, ipHash)
    .first<{ id: number }>();
  const reference = `WEB-${String(row!.id).padStart(6, "0")}`;
  ctx.waitUntil(passOn(env, row!.id, reference, d, ip).catch((e) => console.error("[enquiry] pass-on failed", reference, e)));
  return json(200, { ok: true, reference });
}

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

/** To the platform when it's live (it acknowledges the enquirer and tells the team); otherwise an email to the team. */
async function passOn(env: Env, id: number, reference: string, d: CleanLead, ip: string | null) {
  if (env.APP_ENQUIRY_URL && env.APP_ENQUIRY_SECRET) {
    const r = await fetch(env.APP_ENQUIRY_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.APP_ENQUIRY_SECRET}`, "content-type": "application/json" },
      body: JSON.stringify({ ...d, pharmacist: d.pharmacist ? "yes" : "no", consent: "on", reference, ip }),
    }).catch(() => null);
    const number = r?.ok ? ((await r.json().catch(() => ({}))) as { number?: string }).number : undefined;
    if (number) {
      await env.DB.prepare("UPDATE enquiries SET forwarded_at = ?, app_number = ? WHERE id = ?").bind(new Date().toISOString(), number, id).run();
      return;
    }
  }
  if (!env.MAILER || !env.NOTIFY_TO) return;
  const from = env.NOTIFY_FROM ?? "website@herbalholland.com";
  const where = `${d.area}, ${PROVINCES[d.province]}`;
  const text = [
    `A franchise enquiry came in on herbalholland.com (${reference}). Reply to this email to answer ${d.name} directly.`,
    "",
    `Name: ${d.name}`,
    `Email: ${d.email}`,
    `Mobile: ${d.phone}`,
    `Where they'd open: ${where}`,
    `Capital they could put in: ${capitalLabel(d.capital)}`,
    `Pharmacist partner: ${d.pharmacist ? "Yes" : "No"}`,
    ...(d.source ? [`Came from: ${d.source}`] : []),
    "",
    "Their retail or business experience:",
    d.experience,
    ...(d.message ? ["", "Anything else:", d.message] : []),
    "",
    "They agreed that we may use these details to reply to their enquiry. Enquiries that don't go ahead are deleted within a year.",
  ].join("\n");
  const raw = [
    `From: Herbal Holland website <${from}>`,
    `To: <${env.NOTIFY_TO}>`,
    `Reply-To: <${d.email}>`,
    `Subject: ${mimeWord(`Franchise enquiry ${reference}: ${d.name}, ${where}`)}`,
    `Message-ID: <${reference.toLowerCase()}.${Date.now()}@herbalholland.com>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
  await env.MAILER.send(new EmailMessage(from, env.NOTIFY_TO, raw));
  await env.DB.prepare("UPDATE enquiries SET notified_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
}

const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (c) => String.fromCharCode(c)).join(""));
const mimeWord = (s: string) => `=?UTF-8?B?${b64(s.replace(/[\r\n]+/g, " "))}?=`;

async function hmac(key: string, value: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}
