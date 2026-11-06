import type { Metadata } from "next";
import { AppOnlyWall } from "@/components/shop/app-only";
import { TradeChrome } from "@/components/trade/chrome";
import { appOnly } from "@/lib/install";

// Everything in the portal stays out of search unless a page says otherwise (the landing, the application and the
// trade terms do).
export const metadata: Metadata = {
  title: { default: "Herbal Holland Trade", template: "%s · Herbal Holland Trade" },
  description: "Herbal Holland Trade: wholesale for pharmacies, independent retailers, cafés and wellness practices. Trade prices ex VAT and case packs. Adults 18+.",
  robots: { index: false, follow: false },
};

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {appOnly() && <AppOnlyWall />}
      <TradeChrome>{children}</TradeChrome>
    </>
  );
}
