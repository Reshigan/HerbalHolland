// Start-up checks for a production server (src/instrumentation.ts). A real deployment (DEMO_MODE off) needs the settings
// every link and scheduled job depends on; a demo must never run next to live payment keys.
type Env = Record<string, string | undefined>;

/** `fatal` stops the server serving (every request answers 500 and the log says why); `warn` is logged. */
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
  if ((env.CRON_SECRET ?? "").length < 32) fatal.push("CRON_SECRET must be 32 or more random characters (openssl rand -hex 32): the scheduled jobs sign in with it");
  if (!env.SMTP_URL) warn.push("SMTP_URL isn't set, so tax invoices and other emails are only logged");
  if (!env.ALERT_EMAIL) warn.push("ALERT_EMAIL isn't set, so server errors reach the log only");
  if ((env.MESSAGING_PROVIDER ?? "log") === "log") warn.push("MESSAGING_PROVIDER is log, so members get no sign-in codes or messages");
  if (!env.S3_BUCKET) warn.push(`S3_BUCKET isn't set, so files are kept on this server (${env.UPLOAD_DIR || ".data/uploads"}): back them up`);
  return { fatal, warn };
}
