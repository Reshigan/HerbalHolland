// Storefront chrome (server): announcement bar, header, footer and the 18+ age gate.
// Used by the (shop) route group and Rewards (/club) so the consumer surfaces share one frame.
import Link from "next/link";
import { Suspense } from "react";
import { Search, ShoppingBag, UserRound } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { activePromotions } from "@/server/pricing";
import { launchState } from "@/server/launch";
import { confirmAge, declineAge } from "@/server/shop/actions";
import { getAgeState, getCartCount, getFranchisor, getPreferredStore, getStoreFootprint } from "@/server/shop/context";
import { openState, parseHours } from "@/server/shop/hours";
import { tierMeta } from "@/server/shop/club";
import { Logo, Mark, Wordmark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";
import { ServiceWorker } from "@/components/ui/service-worker";
import { MobileMenu, NavLinks, StorePicker, type NavItem } from "./nav-client";
import { Container } from "./ui";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { screenCopy } from "@/lib/compliance";
import { zarWhole } from "@/lib/money";
import { fmtDate, num } from "@/lib/format";
import { plural } from "@/lib/plural";
import { contactEmailOf, legalNameOf } from "@/lib/contact";
import { cn } from "@/lib/cn";

const SITE = "https://herbalholland.com";

export const NAV: NavItem[] = [
  { href: "/shop", label: "Shop" },
  { href: "/drops", label: "Drops" },
  { href: "/dispensary", label: "Dispensary" },
  { href: "/stores", label: "Stores" },
  { href: "/learn", label: "Learn" },
  { href: "/club", label: "Rewards" },
];

/** Dark page surface for the consumer app (body background, native controls, reduced motion). */
export function ShopSurface() {
  return (
    <style>{`:root{color-scheme:dark}body{background-color:var(--color-ink-950)}@media (prefers-reduced-motion:reduce){.animate-spin-slow,.animate-spin-fast,.animate-rise,.animate-pulse-ring{animation:none!important}}`}</style>
  );
}

export async function ShopChrome({ children }: { children: React.ReactNode }) {
  const age = await getAgeState();
  if (age === "declined")
    return (
      <>
        <ShopSurface />
        <UnderAge />
      </>
    );

  const [customer, store, count, footprint, company, settings, promos, launch] = await Promise.all([
    getCustomer(),
    getPreferredStore(),
    getCartCount(),
    getStoreFootprint(),
    getFranchisor(),
    getSettings(),
    activePromotions({ channel: "ONLINE" }),
    launchState(),
  ]);
  const hours = store && openState(parseHours(store.hours));
  const current = store && hours ? { code: store.code, name: store.name, open: hours.open, openLabel: hours.label } : null;
  // Headline the newest public deal (code-only offers stay private; copy is screened defensively).
  const headline = promos.find((p) => !p.code && !screenCopy(p.name).length);
  // While the Founding Members list is open, lead with its closing date.
  const messages = launch.preLaunch && launch.at
    ? [
        { text: `Founding Members close ${fmtDate(launch.at)}. Join free`, href: customer ? "/club" : "/club/join" },
        { text: `The first ${num(launch.foundingCap)} members get a numbered card`, href: customer ? "/club" : "/club/join" },
        { text: "Every friend you bring moves you up the list", href: customer ? "/club#founding" : "/club/join" },
      ]
    : [
        ...(headline ? [{ text: headline.name, href: "/shop" }] : []),
        { text: `Free delivery on orders over ${zarWhole(settings.ecommerce.freeDeliveryOverCents)}`, href: "/shop" },
        { text: "Click & collect at your nearest store", href: "/stores" },
      ];
  const tier = customer ? tierMeta(customer.tier) : null;

  return (
    <>
      <ShopSurface />
      <a href="#main" className="sr-only z-[70] rounded-full bg-brand-500 px-4 py-2 font-semibold text-ink-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col bg-ink-950 text-ink-100">
        <div className="bg-brand-500 text-ink-950">
          <Container className="flex h-9 items-center justify-center gap-6 text-[0.78rem] font-semibold">
            {messages.map((m, i) => (
              <Link key={m.text} href={m.href} className={cn("truncate hover:underline", i > 0 && "hidden md:inline", i > 1 && "md:hidden lg:inline")}>
                {m.text}
              </Link>
            ))}
            <span className="hidden shrink-0 items-center gap-1.5 xl:inline-flex">
              <span className="rounded-full bg-ink-950 px-1.5 py-px text-[0.62rem] font-bold text-brand-500">18+</span>
              Adults only
            </span>
          </Container>
        </div>

        <header className="sticky top-0 z-40 border-b border-ink-850 bg-ink-950/85 backdrop-blur-xl supports-[backdrop-filter]:bg-ink-950/70">
          <Container className="flex h-16 items-center gap-2 lg:h-[4.5rem] lg:gap-4">
            <MobileMenu
              items={NAV}
              footer={
                <div className="space-y-3 text-sm text-ink-400">
                  <Link href={customer ? "/club" : "/club/join"} className={buttonClass("primary", "lg", "w-full")}>
                    {customer ? `${customer.firstName}'s Rewards` : "Sign in or join Rewards"}
                  </Link>
                  <p className="text-center text-xs">Adults 18+ only · Lab-tested &amp; batch-traceable</p>
                </div>
              }
            />
            <Link href="/" className="shrink-0 rounded-lg" aria-label="Herbal Holland home">
              <Logo markClassName="h-9 w-9 lg:h-10 lg:w-10" />
            </Link>
            <NavLinks items={NAV} className="ml-4 hidden lg:flex" />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {/* Product search from every page: a field on wide screens, an icon to the shop's search on smaller ones. */}
              <form action="/shop" role="search" className="relative hidden xl:block">
                <label htmlFor="header-q" className="sr-only">
                  Search products
                </label>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" strokeWidth={1.9} />
                <input
                  id="header-q"
                  name="q"
                  type="search"
                  enterKeyHint="search"
                  maxLength={60}
                  placeholder="Search products"
                  className="h-10 w-48 rounded-full border border-ink-800 bg-ink-900/60 pl-10 pr-4 text-sm text-white placeholder:text-ink-450 transition-[width] hover:border-ink-600 focus:w-60 focus:border-brand-500 focus:outline-none"
                />
              </form>
              <Link
                href="/shop?focus=1"
                className="grid h-11 w-11 place-items-center rounded-full text-ink-200 transition hover:bg-ink-850 hover:text-white xl:hidden"
                aria-label="Search products"
              >
                <Search className="h-[22px] w-[22px]" strokeWidth={1.8} />
              </Link>
              <StorePicker current={current} className="hidden md:flex" />
              <Link
                href="/club"
                className="flex h-11 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-ink-200 transition hover:bg-ink-850 hover:text-white sm:px-3"
                aria-label={customer ? `Rewards — ${customer.firstName}` : "Sign in to Herbal Holland Rewards"}
              >
                <span className="relative">
                  <UserRound className="h-[22px] w-[22px]" strokeWidth={1.8} />
                  {tier && <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-ink-950", TIER_DOT[tier.key] ?? "bg-brand-500")} />}
                </span>
                <span className="hidden sm:inline">{customer ? customer.firstName : "Sign in"}</span>
              </Link>
              <Link href="/cart" className="relative flex h-11 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-ink-200 transition hover:bg-ink-850 hover:text-white sm:px-3" aria-label={`Bag, ${count} item${count === 1 ? "" : "s"}`}>
                <ShoppingBag className="h-[22px] w-[22px]" strokeWidth={1.8} />
                <span className="hidden sm:inline">Bag</span>
                {count > 0 && (
                  <span className="tnum absolute right-0 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1 text-[0.68rem] font-bold text-ink-950 sm:static sm:h-6 sm:min-w-6">{count}</span>
                )}
              </Link>
            </div>
          </Container>
          <div className="border-t border-ink-850 md:hidden">
            <Container>
              <StorePicker current={current} variant="bar" />
            </Container>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        {/* Already-rendered content inside a Suspense boundary hydrates later, in small slices, instead of in the first long task. */}
        <Suspense>
        <footer className="mt-24 border-t border-ink-850 bg-ink-950">
          <Container className="grid grid-cols-1 gap-12 py-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
            <div>
              <Link href="/" className="inline-flex items-center gap-3 text-brand-500" aria-label="Herbal Holland home">
                <Mark className="h-14 w-14" />
                <Wordmark className="text-xl" />
              </Link>
              <p className="mt-5 max-w-xs font-display text-2xl font-light leading-snug text-ink-200">
                Dutch heritage. <span className="font-semibold text-white">African soil.</span>
              </p>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
                Lab-tested, batch-traceable CBD wellness, accessories and gear{footprint.trading ? `, in ${plural(footprint.trading, "store")} across ${plural(footprint.provinces.length, "province")} and online.` : ", online."}
              </p>
              <Link href="/club/join" className={buttonClass("outline-dark", "md", "mt-6")}>
                Join Herbal Holland Rewards
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <FooterCol title="Shop" links={[["CBD wellness", "/shop?category=wellness"], ["Accessories", "/shop?category=accessories"], ["Grow", "/shop?category=grow"], ["Apparel", "/shop?category=apparel"], ["Gift vouchers", "/gift"], ["Dispensary (patients)", "/dispensary"]]} />
              <FooterCol title="Help" links={[["Store finder", "/stores"], ["Track an order", "/club/orders"], ["Learn", "/learn"], ["Read a lab result", "/learn/reading-lab-results"], ["Contact us", `mailto:${contactEmailOf(company)}`]]} />
              <FooterCol title="Rewards" links={[["Join free", "/club/join"], ["Sign in", "/club"], ["How points work", "/learn/points"], ["Refer a friend", "/club#refer"], ["Wishlist", "/club/wishlist"], ["Reorder reminders", "/club/reminders"]]} />
              <FooterCol title="Legal" links={[["Membership terms", "/legal/terms"], ["Privacy notice (POPIA)", "/legal/privacy"], ["Returns & refunds", "/legal/returns"], ["Delivery", "/legal/delivery"], ["PAIA manual", `${SITE}/paia`], ["Responsible use", "/learn/responsible-use"]]} />
              {/* The corporate site (sites/herbalholland.com, on Cloudflare) */}
              <FooterCol title="About Herbal Holland" links={[["About us", `${SITE}/about`], ["Own a store", `${SITE}/franchise`], ["Press", `${SITE}/press`], ["Careers", `${SITE}/careers`]]} />
            </div>
          </Container>
          <div className="border-t border-ink-850">
          <Container className="py-6">
            <p className="text-xs leading-relaxed text-ink-400">
              <span className="font-semibold text-ink-200">Stores: </span>
              {footprint.provinces.map((p, i) => (
                <span key={p.code}>
                  {i > 0 && " · "}
                  {PROVINCES[p.code as ProvinceCode]}{" "}
                  <span className="text-ink-450">({p.cities.join(", ")})</span>
                </span>
              ))}
            </p>
          </Container>
          </div>
          <div className="border-t border-ink-850">
            <Container className="flex flex-col gap-4 py-6 text-xs leading-relaxed text-ink-400 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-brand-500 font-display text-[0.7rem] font-bold text-brand-500">18+</span>
                <p className="max-w-2xl">
                  For adults 18 and older only. Keep all products out of reach of children and pets. Licensed medicines are supplied only to registered patients with a valid SAHPRA authorisation, by an authorised dispenser. Nothing on this site is medical advice.
                </p>
              </div>
              <p className="md:max-w-sm md:text-right">
                © {new Date().getFullYear()} {legalNameOf(company)}
                {company?.regNumber && ` · Reg. ${company.regNumber}`}
                {company?.vatNumber && ` · VAT ${company.vatNumber}`}. Herbal Holland stores are independently owned and operated by franchisees.
              </p>
            </Container>
          </div>
        </footer>
        </Suspense>
      </div>
      {age === "unknown" && <AgeGate />}
      {/* The Rewards worker (push only) registers once the page is idle, so the app is installable from any consumer page. */}
      <ServiceWorker src="/rewards-sw.js" scope="/" />
    </>
  );
}

const TIER_DOT: Record<string, string> = { SEED: "bg-ink-300", SPROUT: "bg-leaf-500", BLOOM: "bg-series-4", HARVEST: "bg-brand-500" };

export function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="eyebrow mb-4 text-ink-300">{title}</h3>
      <ul className="space-y-2.5 text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-ink-400 transition hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full-screen 18+ confirmation over server-rendered content. Works without JavaScript. */
export function AgeGate() {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="age-title" aria-describedby="age-desc" className="fixed inset-0 z-[100] overflow-y-auto bg-ink-950/90 backdrop-blur-xl">
      <style>{"body{overflow:hidden}"}</style>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="hh-frame w-full max-w-md animate-rise px-6 py-10 text-center sm:px-10">
          <Mark spin className="mx-auto h-24 w-24 text-brand-500" />
          <Wordmark className="mt-4 items-center text-xl text-brand-500" />
          <h2 id="age-title" className="mt-8 font-display text-3xl font-semibold text-white">
            Are you 18 or older?
          </h2>
          <p id="age-desc" className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-ink-300">
            Herbal Holland is for adults only. Please confirm your age to continue.
          </p>
          <div className="mt-8 grid gap-3">
            <form action={confirmAge}>
              <button autoFocus className={buttonClass("primary", "xl", "w-full")}>
                I&apos;m 18 or older
              </button>
            </form>
            <form action={declineAge}>
              <button className={buttonClass("outline-dark", "xl", "w-full")}>I&apos;m under 18</button>
            </form>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-ink-400">
            By entering you agree to our <Link href="/legal/terms" className="underline hover:text-white">terms</Link> and{" "}
            <Link href="/legal/privacy" className="underline hover:text-white">privacy notice</Link>. We remember your answer with a cookie.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Neutral page for visitors who said they're under 18 — no products, no promotion. */
export function UnderAge() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-950 p-6 text-center text-ink-100">
      <div className="max-w-md">
        <Mark className="mx-auto h-20 w-20 text-ink-600" />
        <h1 className="mt-8 font-display text-3xl font-semibold text-white">Sorry, this site is for adults</h1>
        <p className="mt-4 leading-relaxed text-ink-300">
          You need to be 18 or older to visit Herbal Holland. Thanks for being honest.
        </p>
        <p className="mt-8 text-sm text-ink-400">
          Looking for support or information for young people? Visit{" "}
          <a href="https://www.sadag.org" className="text-brand-400 underline" rel="noopener noreferrer">
            SADAG
          </a>{" "}
          or{" "}
          <a href="https://www.childline.org.za" className="text-brand-400 underline" rel="noopener noreferrer">
            Childline South Africa
          </a>
          .
        </p>
      </div>
    </main>
  );
}
