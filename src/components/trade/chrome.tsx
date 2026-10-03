// The trade portal's frame (server): header with the wordmark and "Trade", the portal nav for a signed-in buyer,
// the cart and sign-out; a footer with the trade terms, the shop's legal pages and the 18+ line. Dark, like the shop.
import Link from "next/link";
import { ArrowRight, LogOut, ShoppingCart } from "lucide-react";
import { getTradeBuyer } from "@/server/trade/auth";
import { tradeEmail } from "@/server/trade/accounts";
import { getFranchisor } from "@/server/shop/context";
import { Logo, Mark, Wordmark } from "@/components/brand/logo";
import { ShopSurface } from "@/components/shop/chrome";
import { NavLinks, type NavItem } from "@/components/shop/nav-client";
import { Container } from "@/components/shop/ui";
import { buttonClass } from "@/components/ui/button";
import { getTradeCart } from "@/app/trade/_lib/cart";
import { signOutAction } from "@/app/trade/actions";
import { FOOTER } from "./copy";
import { AccountStatusTag } from "./status";
import { cn } from "@/lib/cn";

export const TRADE_NAV: NavItem[] = [
  { href: "/trade/range", label: "Range" },
  { href: "/trade/orders", label: "Orders" },
  { href: "/trade/statements", label: "Statements" },
  { href: "/trade/account", label: "Account" },
];

export async function TradeChrome({ children }: { children: React.ReactNode }) {
  const [buyer, cart, company] = await Promise.all([getTradeBuyer(), getTradeCart(), getFranchisor()]);
  const lines = cart.length;
  return (
    <>
      <ShopSurface />
      <a href="#main" className="sr-only z-[70] rounded-full bg-brand-500 px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col bg-ink-950 text-ink-100">
        <header className="sticky top-0 z-40 border-b border-ink-850 bg-ink-950/85 backdrop-blur-xl supports-[backdrop-filter]:bg-ink-950/70">
          <Container className="flex h-16 items-center gap-3 lg:h-[4.5rem] lg:gap-5">
            <Link href="/trade" className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="Herbal Holland Trade — home">
              <Logo markClassName="h-9 w-9 lg:h-10 lg:w-10" />
              <span className="eyebrow rounded-full border border-brand-500/50 px-2 py-0.5 text-brand-500">Trade</span>
            </Link>
            {buyer && <NavLinks items={TRADE_NAV} className="ml-2 hidden lg:flex" />}
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {buyer ? (
                <>
                  <span className="hidden max-w-[14rem] truncate text-sm text-ink-300 xl:inline" title={buyer.account.legalName}>
                    {buyer.account.name}
                  </span>
                  <AccountStatusTag status={buyer.account.status} className="hidden md:inline-flex" />
                  <Link href="/trade/cart" className="relative flex h-11 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-ink-200 transition hover:bg-ink-850 hover:text-white sm:px-3" aria-label={`Cart, ${lines} ${lines === 1 ? "line" : "lines"}`}>
                    <ShoppingCart className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
                    <span className="hidden sm:inline">Cart</span>
                    {lines > 0 && <span className="tnum absolute right-0 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[0.68rem] font-bold text-ink-950 sm:static sm:h-6 sm:min-w-6">{lines}</span>}
                  </Link>
                  <form action={signOutAction}>
                    <button className="flex h-11 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-ink-200 transition hover:bg-ink-850 hover:text-white sm:px-3">
                      <LogOut className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                      <span className="hidden sm:inline">Sign out</span>
                      <span className="sr-only sm:hidden">Sign out</span>
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/trade/login" className={buttonClass("outline-dark", "md")}>
                    Sign in
                  </Link>
                  <Link href="/trade/apply" className={cn(buttonClass("primary", "md"), "hidden sm:inline-flex")}>
                    Apply <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </>
              )}
            </div>
          </Container>
          {buyer && (
            <div className="border-t border-ink-850 lg:hidden">
              <Container>
                <NavLinks items={TRADE_NAV} className="scrollbar-none -mx-1 flex overflow-x-auto py-1" />
              </Container>
            </div>
          )}
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="no-print mt-20 border-t border-ink-850 bg-ink-950">
          <Container className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
            <div>
              <Link href="/trade" className="inline-flex items-center gap-3 text-brand-500" aria-label="Herbal Holland Trade — home">
                <Mark className="h-12 w-12" />
                <Wordmark className="text-lg" />
              </Link>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
                Herbal Holland Trade: wholesale for pharmacies, independent retailers, cafés and wellness practices. Prices ex VAT, case packs, lab-tested batches.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <FooterCol title="Trade" links={[["Apply for an account", "/trade/apply"], ["Sign in", "/trade/login"], ["Trade terms", "/trade/terms"], ["Email the trade team", `mailto:${tradeEmail()}`]]} />
              <FooterCol title="Legal" links={[["Privacy notice (POPIA)", "/legal/privacy"], ["Terms of use", "/legal/terms"], ["Delivery", "/legal/delivery"]]} />
              <FooterCol title="Herbal Holland" links={[["The shop", "/"], ["Store finder", "/stores"], ["Learn", "/learn"]]} />
            </div>
          </Container>
          <div className="border-t border-ink-850">
            <Container className="flex flex-col gap-4 py-6 text-xs leading-relaxed text-ink-400 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-brand-500 font-display text-[0.7rem] font-bold text-brand-500">18+</span>
                <p className="max-w-2xl">{FOOTER.adults} Licensed medicines are never traded. Nothing on this site is medical advice.</p>
              </div>
              <p className="md:max-w-sm md:text-right">
                © {new Date().getFullYear()} {company?.legalName ?? "Herbal Holland (Pty) Ltd"}
                {company?.regNumber && ` · Reg. ${company.regNumber}`}
                {company?.vatNumber && ` · VAT ${company.vatNumber}`}.
              </p>
            </Container>
          </div>
        </footer>
      </div>
    </>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="eyebrow mb-3 text-ink-300">{title}</div>
      <ul className="space-y-1 text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            {href.startsWith("mailto:") ? (
              <a href={href} className="inline-block py-1 text-ink-400 transition hover:text-white">
                {label}
              </a>
            ) : (
              <Link href={href} className="inline-block py-1 text-ink-400 transition hover:text-white">
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
