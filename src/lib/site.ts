// herbalholland.com — the corporate site — is served by this app from src/app/site. On its own host (SITE_URL) the
// proxy rewrites its pages to /site/*, and anything else (a shop link) goes to the shop (APP_URL). Without SITE_URL
// (development, tests) the site simply lives at /site.
export const SITE_PAGES = ["/", "/about", "/franchise", "/press", "/careers", "/contact"];
const PASS = ["/apple-icon"]; // metadata routes without a file extension

export type SiteRoute = { kind: "next" } | { kind: "rewrite"; path: string } | { kind: "redirect"; url: string };

export function siteRoute(r: { host: string | null; path: string; search: string; siteUrl?: string; appUrl?: string }): SiteRoute {
  if (!r.siteUrl) return { kind: "next" };
  const site = new URL(r.siteUrl);
  const host = (r.host ?? "").split(":")[0].toLowerCase();
  const inSite = r.path === "/site" || r.path.startsWith("/site/");
  if (host === `www.${site.hostname}`) return { kind: "redirect", url: `${site.origin}${r.path}${r.search}` };
  if (host !== site.hostname) return inSite ? { kind: "redirect", url: `${site.origin}${r.path.slice(5) || "/"}${r.search}` } : { kind: "next" };
  if (inSite || PASS.includes(r.path) || /\.[a-z0-9]+$/i.test(r.path)) return { kind: "next" };
  if (SITE_PAGES.includes(r.path)) return { kind: "rewrite", path: r.path === "/" ? "/site" : `/site${r.path}` };
  return { kind: "redirect", url: `${(r.appUrl ?? "http://localhost:3000").replace(/\/$/, "")}${r.path}${r.search}` };
}

/** True when a request's Host is the site's own (robots.txt and sitemap.xml answer per host). */
export const onSiteHost = (host: string | null, siteUrl?: string) => !!siteUrl && (host ?? "").split(":")[0].toLowerCase() === new URL(siteUrl).hostname;

/** Links for site pages: relative on the site's own host, under /site without one; `abs` for canonical URLs and emails. */
export function siteLinks(env: Record<string, string | undefined>) {
  const site = env.SITE_URL?.replace(/\/$/, "");
  const app = (env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const tail = (p: string) => (p === "/" ? "" : p);
  return {
    page: (p: string) => (site ? p : `/site${tail(p)}`),
    abs: (p: string) => `${site ?? `${app}/site`}${tail(p)}`,
    shop: (p: string) => `${app}${p}`,
    /** Joining Rewards from the site, tagged so these sign-ups show in Reports (customers.joinTag). */
    join: `${app}/club/join?src=site`,
  };
}
