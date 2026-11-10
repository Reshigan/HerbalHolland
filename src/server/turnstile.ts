// Cloudflare Turnstile on the sign-in code step (members' SMS or email code, trade's email code), so a script can't
// spend the hourly network-wide SMS ceiling. On only when TURNSTILE_SECRET is set (a Worker secret); the widget needs
// TURNSTILE_SITE_KEY (a plain var). Without them, as in DEMO_MODE and the e2e runs, every send goes through.
// The token is checked here, never in the browser, and the check fails closed: a network error, a reused or expired
// token, another action or a hostname outside TURNSTILE_HOSTNAMES (default: APP_URL's) all refuse the send.

export const TURNSTILE_FIELD = "cf-turnstile-response";
export const TURNSTILE_REFUSED = "Please complete the security check and try again";

export const turnstileSiteKey = () => (process.env.TURNSTILE_SECRET && process.env.TURNSTILE_SITE_KEY) || null;

function hostnames(): Set<string> {
  const list = process.env.TURNSTILE_HOSTNAMES ?? (URL.canParse(process.env.APP_URL ?? "") ? new URL(process.env.APP_URL!).hostname : "");
  return new Set(list.split(",").map((h) => h.trim()).filter(Boolean));
}

export async function passesTurnstile(token: unknown, ip: string | null, action: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  const allowed = hostnames();
  if (typeof token !== "string" || !token || token.length > 2048 || !allowed.size) return false;
  try {
    const r = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret, response: token, ...(ip && { remoteip: ip }) }),
    });
    if (!r.ok) return false;
    const v = (await r.json()) as { success?: boolean; action?: string; hostname?: string };
    return v.success === true && v.action === action && !!v.hostname && allowed.has(v.hostname);
  } catch {
    return false;
  }
}
