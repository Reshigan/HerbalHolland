// Throttling for server-error alerts: one email per distinct error an hour, and never more than MAX_PER_HOUR in all, so
// a failing page or a database outage can't flood the ops inbox. Pure; the state lives in the server process.
export const HOUR = 3_600_000;
export const MAX_PER_HOUR = 20;

export type AlertGate = { last: Map<string, number>; windowStart: number; sent: number };
export const alertGate = (): AlertGate => ({ last: new Map(), windowStart: 0, sent: 0 });

/** The same error on the same route is one alert, whatever ids, numbers or codes its message carries. */
export const alertKey = (route: string, message: string) => `${route} ${message.replace(/\S*\d\S*/g, "#")}`.slice(0, 300);

/** An email subject's worth of the error: its last line, where multi-line errors (Prisma's) put the cause. */
export const alertSummary = (message: string) => (message.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "Unknown error").slice(0, 120);

/** Personal details out of an error before it's emailed (a provider's refusal can quote an address or a number). */
export const scrubAlert = (s: string) =>
  s.replace(/[^\s"'`<>()[\]{},;]+/g, (t) => (t.includes("@") && !t.includes("/") ? "[email]" : t)).replace(/\+?\d{9,}/g, "[number]");

/** Next.js control flow (redirect, notFound, bailouts) arrives as thrown errors with these digests: not failures. */
export const isControlFlow = (digest: string | null) => !!digest && /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|BAILOUT_TO_CLIENT_SIDE_RENDERING|DYNAMIC_SERVER_USAGE)/.test(digest);

/** Whether to send an alert for `key` now; records it when so. */
export function admitAlert(g: AlertGate, key: string, now: number) {
  if (now - (g.last.get(key) ?? -Infinity) < HOUR) return false;
  if (now - g.windowStart >= HOUR) {
    g.windowStart = now;
    g.sent = 0;
    for (const [k, at] of g.last) if (now - at >= HOUR) g.last.delete(k);
  }
  if (g.sent >= MAX_PER_HOUR) return false;
  g.sent++;
  g.last.set(key, now);
  return true;
}
