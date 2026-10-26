import type { Metadata, Viewport } from "next";
import { getCustomer } from "@/server/auth";
import { ShopChrome } from "@/components/shop/chrome";
import { ClubNav } from "@/components/shop/club-client";
import { Container } from "@/components/shop/ui";
import { AnalyticsBeacon } from "@/components/shop/analytics-beacon";
import { splashStartupImages } from "@/lib/pwa-splash";

export const metadata: Metadata = {
  title: { default: "Rewards", template: "%s · Herbal Holland Rewards" },
  description: "Herbal Holland Rewards: your digital card, points balance, tier, orders and invoices, in store and online.",
  robots: { index: false, follow: true },
  // The installed app opens here: iOS shows one of these while it loads (the Mark on warm black, per device size).
  appleWebApp: { startupImage: splashStartupImages() },
};

// Edge to edge in the installed app: the offers bar and the tab bar pad themselves for the notch and home indicator.
export const viewport: Viewport = { viewportFit: "cover" };

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCustomer();
  return (
    <ShopChrome>
      {customer && (
        <Container className="pt-6">
          <ClubNav />
        </Container>
      )}
      <div className={customer ? "pb-20 app:pb-0 sm:pb-0" : undefined}>
        {children}
      </div>
      <AnalyticsBeacon />
    </ShopChrome>
  );
}
