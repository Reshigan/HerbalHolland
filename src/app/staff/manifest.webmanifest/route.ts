// Web app manifest for the back office (store back office + HQ console), so managers, owners and HQ can keep it on a
// phone or desktop. start_url is /store, which sends each person to their own home by role (HQ → /hq, a store manager
// → their store, a member advisor → the till); signed out, it goes through /login first.
export function GET() {
  const manifest = {
    name: "Herbal Holland Back office",
    short_name: "HH Office",
    description: "Herbal Holland store back office and HQ console: orders, stock, purchasing, banking, team and alerts.",
    id: "/staff",
    start_url: "/store",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon/office-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/office-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/office-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
