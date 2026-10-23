import type { Metadata, Viewport } from "next";
import { inter, outfit } from "./fonts";
import { HEAD_SNIPPET } from "@/lib/csp";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Herbal Holland", template: "%s · Herbal Holland" },
  description: "Dutch heritage, African soil. Lab-tested, batch-traceable CBD wellness, accessories and Herbal Holland Rewards across South Africa. Adults 18+.",
  applicationName: "Herbal Holland",
  // iPhone: Safari → Share → Add to Home Screen opens the shop and Rewards card full-screen (the till and the office
  // set their own names in their layouts).
  appleWebApp: { capable: true, title: "Herbal Holland", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The head snippet adds html.js / html.motion before React arrives, so the class list differs on purpose.
  return (
    <html lang="en-ZA" className={`${outfit.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Keeps the browser's install prompt, which can fire before hydration, and sets the motion guard (allowed by its hash: src/lib/csp.ts). */}
        <script dangerouslySetInnerHTML={{ __html: HEAD_SNIPPET }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
