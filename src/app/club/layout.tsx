import type { Metadata, Viewport } from "next";
import { getCustomer, getStaff } from "@/server/auth";
import { db } from "@/server/db";
import { INSIGHT_ROLES } from "@/server/insights";
import { ShopChrome } from "@/components/shop/chrome";
import { ClubNav } from "@/components/shop/club-client";
import { Container } from "@/components/shop/ui";
import { AnalyticsBeacon } from "@/components/shop/analytics-beacon";
import { AppOnlyWall } from "@/components/shop/app-only";
import { appOnly } from "@/lib/install";
import { splashStartupImages } from "@/lib/pwa-splash";

export const metadata: Metadata = {
  title: { default: "Rewards", template: "%s · Herbal Holland Rewards" },
  description: "Herbal Holland Rewards: your digital card, points balance, tier, orders and invoices, in store and in the app.",
  robots: { index: false, follow: true },
  // The installed app opens here: iOS shows one of these while it loads (the Mark on warm black, per device size).
  appleWebApp: { startupImage: splashStartupImages() },
};

// Edge to edge in the installed app: the offers bar and the tab bar pad themselves for the notch and home indicator.
export const viewport: Viewport = { viewportFit: "cover" };

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCustomer();
  const [staff, linked] = await Promise.all([getStaff(), customer ? db.user.findUnique({ where: { memberId: customer.id }, select: { role: true, active: true } }) : null]);
  const owner = [staff, linked?.active ? linked : null].some((u) => u && INSIGHT_ROLES.includes(u.role));
  return (
    <ShopChrome compact>
      {customer && (
        <Container className="pt-2 sm:pt-6">
          <ClubNav owner={owner} />
        </Container>
      )}
      <div className={customer ? "pb-20 app:pb-0 sm:pb-0" : undefined}>
        {children}
      </div>
      {appOnly() && <AppOnlyWall />}
      <AnalyticsBeacon />
    </ShopChrome>
  );
}
