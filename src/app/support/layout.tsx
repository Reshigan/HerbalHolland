// A light chrome for /support: anyone may ask for help, so there's no 18+ gate here (the shop's ShopChrome asks
// before showing products; this page shows none). Dark brand surface, the mark, a way back into the shop.
import Link from "next/link";
import type { Metadata } from "next";
import { getCustomer } from "@/server/auth";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/shop/ui";

export const metadata: Metadata = {
  title: { default: "Support", template: "%s · Herbal Holland" },
  description: "Ask Herbal Holland for help with an order, a delivery, a product, your Rewards or your account. We reply within one business day.",
};

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCustomer();
  return (
    <div className="flex min-h-dvh flex-col bg-ink-950 text-ink-100">
      <header className="border-b border-ink-850">
        <Container className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="shrink-0 rounded-lg" aria-label="Herbal Holland home">
            <Logo markClassName="h-9 w-9" />
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium" aria-label="Support">
            <Link href="/shop" className="rounded-full px-3 py-2 text-ink-300 hover:bg-ink-850 hover:text-white">
              Shop
            </Link>
            <Link href={customer ? "/club/support" : "/club"} className="rounded-full px-3 py-2 text-ink-300 hover:bg-ink-850 hover:text-white">
              {customer ? "My requests" : "Rewards"}
            </Link>
          </nav>
        </Container>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-ink-850 py-8 text-xs text-ink-450">
        <Container className="flex flex-wrap items-center justify-between gap-3">
          <span>Herbal Holland · Adults 18+ only</span>
          <span className="flex flex-wrap gap-4">
            <Link href="/legal/returns" className="hover:text-white">
              Returns &amp; refunds
            </Link>
            <Link href="/legal/privacy" className="hover:text-white">
              Privacy notice (POPIA)
            </Link>
            <Link href="/legal/terms" className="hover:text-white">
              Terms
            </Link>
          </span>
        </Container>
      </footer>
    </div>
  );
}
