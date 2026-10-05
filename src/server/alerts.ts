// Server errors (instrumentation onRequestError, cron jobs included): always to the log, and to ALERT_EMAIL by SMTP
// when it's set, throttled by @/lib/alerts. Never through the message log, and never with headers or the query
// string: those can carry session cookies and signed links.
import { admitAlert, alertGate, alertKey, isControlFlow } from "@/lib/alerts";
import { deliverEmail, esc } from "./email";

const gate = alertGate();

export async function reportError(err: unknown, where: { method: string; path: string; route: string; kind: string }) {
  const e = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : null;
  if (isControlFlow(digest)) return;
  const path = where.path.split("?")[0];
  console.error(`[error] ${where.method} ${path} (${where.kind} ${where.route})${digest ? ` digest ${digest}` : ""}`, e);
  const to = process.env.ALERT_EMAIL;
  if (!to || !admitAlert(gate, alertKey(where.route, e.message), Date.now())) return;
  const text = [`${where.method} ${path}`, `Route: ${where.route} (${where.kind})`, ...(digest ? [`Digest: ${digest}`] : []), `At: ${new Date().toISOString()}`, `App: ${process.env.APP_URL ?? "(APP_URL not set)"}`, "", e.stack ?? e.message].join("\n");
  try {
    await deliverEmail({ to, subject: `Server error: ${e.message.replace(/\s+/g, " ").slice(0, 90)}`, text, html: `<pre style="font:13px/1.45 ui-monospace,monospace;white-space:pre-wrap">${esc(text)}</pre>` });
  } catch (mailErr) {
    console.error("[error] couldn't email the alert", mailErr);
  }
}
