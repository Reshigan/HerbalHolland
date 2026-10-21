// Start-up checks for the production Worker (src/server/startup.ts, run on the first request). A real deployment
// (DEMO_MODE off) needs the settings every link and scheduled job depends on; a demo must never run next to live
// payment keys. The database (D1), files (R2) and the browser are bindings in wrangler.jsonc, so nothing checks them here.
type Env = Record<string, string | undefined>;

/** `fatal` stops the Worker serving (every request answers 500 and the log says why); `warn` is logged. */
export function envProblems(env: Env): { fatal: string[]; warn: string[] } {
  const fatal: string[] = [];
  const warn: string[] = [];
  if (env.DEMO_MODE === "true") {
    if ((env.YOCO_SECRET_KEY ?? "").startsWith("sk_live_") || env.PEACH_ENV === "live") fatal.push("DEMO_MODE is on with live payment keys, and anyone could sign in as any staff member. Turn DEMO_MODE off");
    else warn.push("DEMO_MODE is on: anyone can sign in as any staff member and see sign-in codes. Turn it off before real trading");
    return { fatal, warn };
  }
  const url = URL.canParse(env.APP_URL ?? "") ? new URL(env.APP_URL!) : null;
  if (!url || url.protocol !== "https:" || ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname))
    fatal.push("APP_URL must be the shop's public https address: every emailed, texted and payment-return link is built from it");
  if ((env.CRON_SECRET ?? "").length < 32) fatal.push("CRON_SECRET must be 32 or more random characters (openssl rand -hex 32): the Cron Triggers sign in with it");
  if (!env.MS_TENANT_ID || !env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) warn.push("MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET (Microsoft 365) aren't all set, so tax invoices and other emails are only logged");
  if (!env.ALERT_EMAIL) warn.push("ALERT_EMAIL isn't set, so errors reach the log only");
  if ((env.MESSAGING_PROVIDER ?? "log") === "log") warn.push("MESSAGING_PROVIDER is log, so members get no sign-in codes or messages");
  return { fatal, warn };
}
