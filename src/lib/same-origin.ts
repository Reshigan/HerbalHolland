// Cross-site request check for cookie-authenticated route handlers that change something (server actions get Next's
// own check). Browsers say where a request comes from in Sec-Fetch-Site; older ones only send Origin, compared with the
// host the request was addressed to (x-forwarded-host when a proxy set one). A request with neither is a script or an
// old client, not a page on another site, so it passes.
import type { HeaderBag } from "./client-ip";

export function sameOrigin(h: HeaderBag, url: string): boolean {
  const site = h.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = h.get("origin");
  if (!origin) return true;
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || new URL(url).host;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false; // "null" and other opaque origins
  }
}
