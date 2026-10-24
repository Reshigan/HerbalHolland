import { ShopChrome } from "@/components/shop/chrome";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { AnalyticsBeacon } from "@/components/shop/analytics-beacon";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopChrome>
      {children}
      <InstallPrompt app="rewards" variant="sheet" />
      <AnalyticsBeacon />
    </ShopChrome>
  );
}
