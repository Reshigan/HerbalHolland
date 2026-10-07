import type { Metadata } from "next";
import { TradeChrome } from "@/components/trade/chrome";

// Everything in the portal stays out of search unless a page says otherwise (the landing, the application and the
// trade terms do).
export const metadata: Metadata = {
  title: { default: "Herbal Holland Trade", template: "%s · Herbal Holland Trade" },
  description: "Herbal Holland Trade: wholesale for pharmacies, independent retailers, cafés and wellness practices. Trade prices ex VAT, case packs, lab-tested batches. Adults 18+.",
  robots: { index: false, follow: false },
};

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return <TradeChrome>{children}</TradeChrome>;
}
