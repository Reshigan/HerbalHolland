// herbalholland.com chrome (server): header, footer with the company's details (ECT Act s43) and the same 18+ gate
// as the shop. Shop, Rewards and legal links go to the shop's domain.
import Link from "next/link";
import { getAgeState, getFranchisor } from "@/server/shop/context";
import { AgeGate, FooterCol, ShopSurface, UnderAge } from "@/components/shop/chrome";
import { MobileMenu, NavLinks } from "@/components/shop/nav-client";
import { Container } from "@/components/shop/ui";
import { Mark, Wordmark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";
import { siteLinks } from "@/lib/site";

export async function SiteChrome({ children }: { children: React.ReactNode }) {
  const age = await getAgeState();
  if (age === "declined")
    return (
      <>
        <ShopSurface />
        <UnderAge />
      </>
    );
  const company = await getFranchisor();
  const l = siteLinks(process.env);
  const nav = (
    [
      ["About", "/about"],
      ["Franchise", "/franchise"],
      ["Press", "/press"],
      ["Careers", "/careers"],
      ["Contact", "/contact"],
    ] as const
  ).map(([label, p]) => ({ label, href: l.page(p) }));

  return (
    <>
      <ShopSurface />
      <a href="#main" className="sr-only z-[70] rounded-full bg-brand-500 px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col bg-ink-950 text-ink-100">
        <header className="sticky top-0 z-40 border-b border-ink-850 bg-ink-950/85 backdrop-blur-xl supports-[backdrop-filter]:bg-ink-950/70">
          <Container className="flex h-16 items-center gap-2 lg:h-[4.5rem] lg:gap-4">
            <MobileMenu
              items={nav}
              footer={
                <div className="space-y-3">
                  <a href={l.shop("/")} className={buttonClass("primary", "lg", "w-full")}>
                    Shop online
                  </a>
                  <a href={l.join} className={buttonClass("outline-dark", "lg", "w-full")}>
                    Join Rewards
                  </a>
                  <p className="text-center text-xs text-ink-400">Adults 18+ only</p>
                </div>
              }
            />
            <Link href={l.page("/")} className="flex shrink-0 items-center gap-2.5 rounded-lg text-brand-500" aria-label="Herbal Holland — home">
              <Mark className="h-9 w-9 lg:h-10 lg:w-10" />
              <Wordmark className="text-[0.95rem]" />
            </Link>
            <NavLinks items={nav} className="ml-6 hidden lg:flex" />
            <div className="ml-auto flex items-center gap-2">
              <a href={l.join} className="hidden h-11 items-center rounded-full px-3 text-sm font-medium text-ink-200 transition hover:bg-ink-850 hover:text-white sm:flex">
                Join Rewards
              </a>
              <a href={l.shop("/")} className={buttonClass("primary", "md")}>
                Shop online
              </a>
            </div>
          </Container>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-ink-850 bg-ink-950">
          <Container className="grid grid-cols-1 gap-12 py-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
            <div>
              <Link href={l.page("/")} className="inline-flex items-center gap-3 text-brand-500" aria-label="Herbal Holland — home">
                <Mark className="h-14 w-14" />
                <Wordmark className="text-xl" />
              </Link>
              <p className="mt-5 max-w-xs font-display text-2xl font-light leading-snug text-ink-200">
                Dutch heritage. <span className="font-semibold text-white">African soil.</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <FooterCol title="Herbal Holland" links={nav.map((n) => [n.label, n.href])} />
              <FooterCol
                title="Members"
                links={[
                  ["Shop online", l.shop("/shop")],
                  ["Join Rewards", l.join],
                  ["Find a store", l.shop("/stores")],
                  ["Learn", l.shop("/learn")],
                ]}
              />
              <FooterCol
                title="Legal"
                links={[
                  ["Terms of use", l.shop("/legal/terms")],
                  ["Privacy notice (POPIA)", l.shop("/legal/privacy")],
                  ["PAIA manual", l.shop("/legal/paia")],
                ]}
              />
            </div>
          </Container>
          <div className="border-t border-ink-850">
            <Container className="flex flex-col gap-4 py-6 text-xs leading-relaxed text-ink-400 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-brand-500 font-display text-[0.7rem] font-bold text-brand-500">18+</span>
                <p className="max-w-2xl">
                  For adults 18 and older only. Licensed medicines are supplied only to registered patients with a valid SAHPRA authorisation, by an authorised dispenser. Nothing on
                  this site is medical advice.
                </p>
              </div>
              <p className="md:max-w-md md:text-right">
                © {new Date().getFullYear()} {company?.legalName ?? "Herbal Holland (Pty) Ltd"}
                {company?.regNumber && ` · Reg. ${company.regNumber}`}
                {company?.vatNumber && ` · VAT ${company.vatNumber}`}
                {company?.address && ` · ${company.address}`}. Herbal Holland stores are independently owned and operated by franchisees.
              </p>
            </Container>
          </div>
        </footer>
      </div>
      {age === "unknown" && <AgeGate />}
    </>
  );
}
