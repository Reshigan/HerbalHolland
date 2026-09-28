// Web app manifest for the till, so it installs full-screen on Android tablets and phones.
export function GET() {
  const manifest = {
    name: "Herbal Holland Till",
    short_name: "HH Till",
    description: "Herbal Holland point of sale — tap on glass, offline-first.",
    id: "/pos",
    start_url: "/pos",
    scope: "/pos",
    display: "standalone",
    orientation: "any",
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    categories: ["business", "shopping"],
    icons: [
      { src: "/pos/app-icon", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/pos/app-icon?maskable=1", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
