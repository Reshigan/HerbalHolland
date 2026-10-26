import type { Viewport } from "next";
import { ShopChrome } from "@/components/shop/chrome";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { AnalyticsBeacon } from "@/components/shop/analytics-beacon";

// Edge to edge in the installed app: the offers bar and the tab bar pad themselves for the notch and home indicator.
export const viewport: Viewport = { viewportFit: "cover" };

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopChrome>
      {children}
      <InstallPrompt app="rewards" variant="sheet" />
      <AnalyticsBeacon />
    </ShopChrome>
  );
}
