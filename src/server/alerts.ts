// Server errors (instrumentation onRequestError, cron jobs included): always to the log, and to ALERT_EMAIL by Microsoft Graph
// when it's set, throttled by @/lib/alerts. Never through the message log, and never with headers or the query
// string: those can carry session cookies and signed links. reportFailure is the same for an error that was caught,
// so no request reports it: a scheduled job's step, one item of a batch, an action's catch-all.
import { admitAlert, alertGate, alertKey, alertSummary, isControlFlow, scrubAlert } from "@/lib/alerts";
import { deliverEmail, emailLayout, esc } from "./email";

const gate = alertGate();

const asError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));
const digestOf = (err: unknown) => (typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : null);

/** The alert email, when ALERT_EMAIL is set and the gate admits it (`key`: the same error from the same place is one alert). Never throws. */
async function emailAlert(key: string, e: Error, head: string[]) {
  const to = process.env.ALERT_EMAIL;
  if (!to || !admitAlert(gate, alertKey(key, e.message), Date.now())) return;
  const text = [...head, `At: ${new Date().toISOString()}`, `App: ${process.env.APP_URL ?? "(APP_URL not set)"}`, "", scrubAlert(e.stack ?? e.message)].join("\n");
  try {
    await deliverEmail({
      to,
      subject: `Server error: ${alertSummary(scrubAlert(e.message))}`,
      text,
      html: emailLayout({ preheader: alertSummary(scrubAlert(e.message)), eyebrow: "Server alert", heading: "Something went wrong on the server", body: `<pre style="margin:0 0 16px;font:13px/1.45 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word">${esc(text)}</pre>`, footerHtml: "You received this because your address is the server's ALERT_EMAIL." }),
    });
  } catch (mailErr) {
    console.error("[error] couldn't email the alert", mailErr);
  }
}

export async function reportError(err: unknown, where: { method: string; path: string; route: string; kind: string }) {
  const e = asError(err);
  const digest = digestOf(err);
  if (isControlFlow(digest)) return;
  const path = where.path.split("?")[0];
  console.error(`[error] ${where.method} ${path} (${where.kind} ${where.route})${digest ? ` digest ${digest}` : ""}`, e);
  await emailAlert(where.route, e, [`${where.method} ${path}`, `Route: ${where.route} (${where.kind})`, ...(digest ? [`Digest: ${digest}`] : [])]);
}

/**
 * A failure that was caught, so nothing else reports it. `where` says what failed ("cron daily: lossPrevention",
 * "POS API"): no ids, so an outage repeating it stays one alert an hour. Logged, and emailed like a server error.
 * Never throws, so callers needn't wait for it.
 */
export async function reportFailure(err: unknown, where: string) {
  if (isControlFlow(digestOf(err))) return;
  const e = asError(err);
  console.error(`[error] ${where}`, e);
  await emailAlert(where, e, [`Where: ${where}`]);
}
