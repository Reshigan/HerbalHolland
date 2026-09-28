import type { Metadata } from "next";
import { getCustomer } from "@/server/auth";
import { ShopChrome } from "@/components/shop/chrome";
import { ClubNav } from "@/components/shop/club-client";
import { Container } from "@/components/shop/ui";

export const metadata: Metadata = {
  title: { default: "Rewards", template: "%s · Herbal Holland Rewards" },
  description: "Herbal Holland Rewards: your digital card, points balance, tier, orders and invoices — in store and online.",
  robots: { index: false, follow: true },
};

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCustomer();
  return (
    <ShopChrome>
      {customer && (
        <Container className="pt-6">
          <ClubNav />
        </Container>
      )}
      <div className={customer ? "pb-20 sm:pb-0" : undefined}>{children}</div>
    </ShopChrome>
  );
}
