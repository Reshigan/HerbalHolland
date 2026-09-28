import type { MetadataRoute } from "next";

// Per request, so it uses the running server's APP_URL rather than the build's.
export const dynamic = "force-dynamic";

const base = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
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
