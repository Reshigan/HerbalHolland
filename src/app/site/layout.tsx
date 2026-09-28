// herbalholland.com — served at / on SITE_URL's host (src/proxy.ts), at /site everywhere else.
import type { Metadata } from "next";
import { SiteChrome } from "@/components/site/chrome";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Herbal Holland — Dutch heritage. African soil.", template: "%s · Herbal Holland" },
  description: "Herbal Holland is a South African network of cannabis wellness stores for adults 18+: lab-tested, batch-traceable and members-only. Our story, our standards, franchising, press and careers.",
  openGraph: { siteName: "Herbal Holland", type: "website", locale: "en_ZA" },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
