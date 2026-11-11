import type { MetadataRoute } from "next";

// Installable consumer app: opens straight to the Rewards card.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/club",
    name: "Herbal Holland",
    // Under the home-screen icon: launchers show about 12 characters, so the full name would end in an ellipsis.
    short_name: "HH Rewards",
    description: "Your Herbal Holland Rewards card, points, orders and invoices, plus the shop and store finder. Adults 18+.",
    lang: "en-ZA",
    dir: "ltr",
    start_url: "/club",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    // A tap on a link or notification brings the open app forward and navigates it, rather than opening a second window.
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    orientation: "any",
    background_color: "#0c0a09",
    theme_color: "#0c0a09",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Rewards card", short_name: "Card", url: "/club", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      { name: "Drops", url: "/drops", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      { name: "Shop", url: "/shop", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      { name: "Orders", url: "/club/orders", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      { name: "Stores", url: "/stores", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
    ],
  };
}
