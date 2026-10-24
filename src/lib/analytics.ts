// First-party analytics for the shop and the Rewards app: what a page-view beacon (src/app/api/a) may record. No
// cookies and nothing about the person: a random visitor id the browser keeps, the path without its query string, the
// ?src= tag of the landing URL and the referring site's host. Pure: the route supplies the body, user agent and hosts.
import { detectPlatform, type InstallPlatform } from "./install";

export type PageViewKind = "view" | "install";
export type PageViewRow = { kind: PageViewKind; visitor: string; path: string; entry: boolean; app: boolean; src: string | null; referrer: string | null; platform: InstallPlatform };

/** Rows older than this are deleted by the daily job. */
export const RETENTION_DAYS = 400;
export const PLATFORMS: InstallPlatform[] = ["android", "ios", "desktop", "other"];
const SRC = /^[a-z0-9-]{1,40}$/i;
const VISITOR = /^[a-z0-9-]{8,64}$/i;
// Crawlers, link previews, monitors and headless browsers: not visitors.
export const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|monitor|uptime|lighthouse|headless|phantom|python-requests|curl\/|wget|httpclient|okhttp|go-http|axios|node-fetch|^$/i;

export const isBot = (ua: string | null | undefined) => BOT_UA.test((ua ?? "").trim());

/** The path alone ("/p/oil?x=1#a" → "/p/oil"), capped; null unless it's a site path. */
export function cleanPath(v: unknown): string | null {
  if (typeof v !== "string" || !v.startsWith("/") || v.startsWith("//")) return null;
  const path = v.split(/[?#]/)[0].slice(0, 200);
  return path || null;
}

/** The referring site's host ("https://www.google.com/search?q=…" → "google.com"); null for none, junk or our own hosts. */
export function referrerHost(v: unknown, ownHosts: string[] = []): string | null {
  if (typeof v !== "string" || !v) return null;
  let host: string;
  try {
    const u = new URL(v.slice(0, 500));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const own = ownHosts.map((h) => h.toLowerCase().split(":")[0].replace(/^www\./, ""));
  return !host || own.includes(host) ? null : host.slice(0, 100);
}

export const cleanSrc = (v: unknown) => (typeof v === "string" && SRC.test(v) ? v.toLowerCase() : null);

/**
 * A beacon body as a row to save, or null to ignore it (bad shape). Only a visit's entry page carries where it came
 * from, so every other page doesn't count as "Direct". The platform falls back to the user agent.
 */
export function parseBeacon(body: unknown, { ua = "", ownHosts = [] }: { ua?: string; ownHosts?: string[] } = {}): PageViewRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const kind: PageViewKind = b.kind === "install" ? "install" : "view";
  const visitor = typeof b.visitor === "string" && VISITOR.test(b.visitor) ? b.visitor.toLowerCase() : null;
  const path = cleanPath(b.path);
  if (!visitor || !path) return null;
  const platform = PLATFORMS.includes(b.platform as InstallPlatform) ? (b.platform as InstallPlatform) : detectPlatform(ua).platform;
  const entry = kind === "view" && b.entry === true;
  return { kind, visitor, path, entry, app: b.app === true, src: entry ? cleanSrc(b.src) : null, referrer: entry ? referrerHost(b.referrer, ownHosts) : null, platform };
}
