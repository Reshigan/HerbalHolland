import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { onSiteHost, siteLinks } from "@/lib/site";

// Per request: the answer depends on the host (shop or herbalholland.com) and on runtime settings, not the build's.
export const dynamic = "force-dynamic";

const base = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  if (onSiteHost(h.get("x-forwarded-host") ?? h.get("host"), process.env.SITE_URL)) {
    const site = siteLinks(process.env).abs("/");
    return { rules: [{ userAgent: "*", allow: "/" }], sitemap: `${site}/sitemap.xml`, host: site };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/club/join"],
        // Personal, operational and licence-gated areas stay out of search.
        disallow: ["/hq", "/store/", "/pos", "/api/", "/login", "/cart", "/checkout", "/orders/", "/club", "/invoice/", "/menu/", "/batch/", "/dispensary", "/brand"],
      },
    ],
    sitemap: `${base()}/sitemap.xml`,
    host: base(),
  };
}
