import type { MetadataRoute } from "next";

// Installable consumer app: opens straight to the Rewards card.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/club",
    name: "Herbal Holland",
    short_name: "Herbal Holland",
    description: "Your Herbal Holland Rewards card, points, orders and invoices — plus the shop and store finder. Adults 18+.",
    start_url: "/club",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
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
