// Storefront chrome (server): announcement bar, header, footer and the 18+ age gate.
// Used by the (shop) route group and Rewards (/club) so the consumer surfaces share one frame.
import Link from "next/link";
import { ShoppingBag, UserRound } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { activePromotions } from "@/server/pricing";
import { confirmAge, declineAge } from "@/server/shop/actions";
import { getAgeState, getCartCount, getFranchisor, getPreferredStore, getRetailStores } from "@/server/shop/context";
import { openState, parseHours } from "@/server/shop/hours";
import { tierMeta } from "@/server/shop/club";
import { Logo, Mark, Wordmark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";
import { MobileMenu, NavLinks, StorePicker, type NavItem, type PickerStore } from "./nav-client";
import { Container } from "./ui";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { screenCopy } from "@/lib/compliance";
import { zarWhole } from "@/lib/money";
import { cn } from "@/lib/cn";

export const NAV: NavItem[] = [
  { href: "/shop", label: "Shop" },
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

  const [customer, store, count, stores, company, settings, promos] = await Promise.all([
    getCustomer(),
    getPreferredStore(),
    getCartCount(),
    getRetailStores(),
    getFranchisor(),
    getSettings(),
    activePromotions({ channel: "ONLINE" }),
  ]);
  const picker: PickerStore[] = stores.map((s) => {
    const o = openState(parseHours(s.hours));
    return { code: s.code, name: s.name, suburb: s.suburb, city: s.city, province: s.province, lat: s.lat, lng: s.lng, status: s.status, sameDay: s.sameDay, open: o.open, openLabel: o.label };
  });
  const current = store ? picker.find((p) => p.code === store.code) ?? null : null;
  // Headline the newest public deal (code-only offers stay private; copy is screened defensively).
  const headline = promos.find((p) => !p.code && !screenCopy(p.name).length);
  const messages = [
    ...(headline ? [{ text: headline.name, href: "/shop" }] : []),
    { text: `Free delivery on orders over ${zarWhole(settings.ecommerce.freeDeliveryOverCents)}`, href: "/shop" },
    { text: "Click & collect at your nearest store", href: "/stores" },
  ];
  const tier = customer ? tierMeta(customer.tier) : null;
  const trading = stores.filter((s) => s.status === "ACTIVE");
  const provinces = [...new Set(trading.map((s) => s.province))];

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
            <Link href="/" className="shrink-0 rounded-lg" aria-label="Herbal Holland — home">
              <Logo markClassName="h-9 w-9 lg:h-10 lg:w-10" />
            </Link>
            <NavLinks items={NAV} className="ml-4 hidden lg:flex" />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <StorePicker stores={picker} current={current} className="hidden md:flex" />
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
              <StorePicker stores={picker} current={current} variant="bar" />
            </Container>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="mt-24 border-t border-ink-850 bg-ink-950">
          <Container className="grid grid-cols-1 gap-12 py-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
            <div>
              <Link href="/" className="inline-flex items-center gap-3 text-brand-500" aria-label="Herbal Holland — home">
                <Mark className="h-14 w-14" />
                <Wordmark className="text-xl" />
              </Link>
              <p className="mt-5 max-w-xs font-display text-2xl font-light leading-snug text-ink-200">
                Dutch heritage. <span className="font-semibold text-white">African soil.</span>
              </p>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
                Lab-tested, batch-traceable cannabis wellness, accessories and gear — in {trading.length} stores across {provinces.length} provinces and online.
              </p>
              <Link href="/club/join" className={buttonClass("outline-dark", "md", "mt-6")}>
                Join Herbal Holland Rewards
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              <FooterCol title="Shop" links={[["CBD wellness", "/shop?category=wellness"], ["Accessories", "/shop?category=accessories"], ["Grow", "/shop?category=grow"], ["Apparel", "/shop?category=apparel"], ["Dispensary (patients)", "/dispensary"]]} />
              <FooterCol title="Help" links={[["Store finder", "/stores"], ["Track an order", "/club/orders"], ["Learn", "/learn"], ["Read a lab result", "/learn/reading-lab-results"], ["Contact us", `mailto:${company?.email ?? "hello@herbalholland.co.za"}`]]} />
              <FooterCol title="Rewards" links={[["Join free", "/club/join"], ["Sign in", "/club"], ["How points work", "/learn/points"], ["Refer a friend", "/club#refer"]]} />
              <FooterCol title="Legal" links={[["Terms of use", "/legal/terms"], ["Privacy notice (POPIA)", "/legal/privacy"], ["PAIA manual", "/legal/paia"], ["Responsible use", "/learn/responsible-use"]]} />
            </div>
          </Container>
          <div className="border-t border-ink-850">
          <Container className="py-6">
            <p className="text-xs leading-relaxed text-ink-400">
              <span className="font-semibold text-ink-200">Stores: </span>
              {provinces.map((p, i) => (
                <span key={p}>
                  {i > 0 && " · "}
                  {PROVINCES[p as ProvinceCode]}{" "}
                  <span className="text-ink-500">({[...new Set(trading.filter((s) => s.province === p).map((s) => s.city))].join(", ")})</span>
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
                © {new Date().getFullYear()} {company?.legalName ?? "Herbal Holland (Pty) Ltd"}
                {company?.regNumber && ` · Reg. ${company.regNumber}`}
                {company?.vatNumber && ` · VAT ${company.vatNumber}`}. Herbal Holland stores are independently owned and operated by franchisees.
              </p>
            </Container>
          </div>
        </footer>
      </div>
      {age === "unknown" && <AgeGate />}
    </>
  );
}

const TIER_DOT: Record<string, string> = { SEED: "bg-ink-300", SPROUT: "bg-leaf-500", BLOOM: "bg-series-4", HARVEST: "bg-brand-500" };

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
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
function AgeGate() {
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
function UnderAge() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-950 p-6 text-center text-ink-100">
      <div className="max-w-md">
        <Mark className="mx-auto h-20 w-20 text-ink-600" />
        <h1 className="mt-8 font-display text-3xl font-semibold text-white">Sorry, this site is for adults</h1>
        <p className="mt-4 leading-relaxed text-ink-300">
          You need to be 18 or older to visit Herbal Holland. Thanks for being honest — we look forward to welcoming you when you&apos;re older.
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
