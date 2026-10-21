// Work that must finish but needn't hold the reply: an emailed receipt, a check that raises an alert. On Workers a
// promise left dangling may be cancelled once the response has gone, so it is handed to the request's `waitUntil`;
// outside a Cloudflare request (scripts, tests) it simply runs. Failures are logged, never thrown at the caller.
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function background(what: string, work: Promise<unknown>) {
  const p = work.catch((e) => console.error(`[background] ${what} failed`, e));
  try {
    getCloudflareContext().ctx.waitUntil(p);
  } catch {
    /* not inside a Cloudflare request */
  }
}
