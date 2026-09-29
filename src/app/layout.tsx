import type { Metadata, Viewport } from "next";
import { inter, outfit } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Herbal Holland", template: "%s · Herbal Holland" },
  description: "Dutch heritage, African soil. Lab-tested, batch-traceable cannabis wellness, accessories and Herbal Holland Rewards across South Africa. Adults 18+.",
  applicationName: "Herbal Holland",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0c0a09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${outfit.variable} ${inter.variable}`}>
      <head>
        {/* Keeps the browser's install prompt, which can fire before hydration, for @/components/ui/install-prompt. */}
        <script dangerouslySetInnerHTML={{ __html: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__hhInstall=e})" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
