import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowRight, Crown, FlaskConical, Gift, Leaf, Moon, QrCode, ShieldCheck, Store, Sun, Truck, Dumbbell } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { canBuyOnline } from "@/lib/launch-phase";
import { launchState, waitlistPlace } from "@/server/launch";
import { getClasses } from "@/server/shop/access";
import { cardsWhere, listCatalogue } from "@/server/shop/catalogue";
import { getFranchisor, getPreferredStore, getStoreFootprint } from "@/server/shop/context";
import { featuredDrop, upcomingEvents } from "@/server/shop/launch";
import { Lockup, Mark, PETAL } from "@/components/brand/logo";
import { Sky } from "@/components/shop/sky";
import { JsonLd } from "@/components/shop/json-ld";
import { LOCALE, organizationJsonLd, parseSameAs, SITE_NAME, siteUrl, websiteJsonLd } from "@/lib/seo";
import { ProductArt } from "@/components/product/art";
import { categoryIcon } from "@/components/product/category-icons";
import { categoryImage } from "@/lib/category-images";
import { ButtonLink } from "@/components/ui/button";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { ProductGrid } from "@/components/shop/product-card";
import { CountUp, Reveal } from "@/components/shop/motion";
import { StoreCard } from "@/components/shop/store-card";
import { Container, Panel, SectionHead } from "@/components/shop/ui";
import { Countdown } from "@/components/shop/countdown";
import { DropCardView, EventCardView, fmtWhen } from "@/components/shop/launch-cards";
import { ARTICLES } from "@/components/shop/learn/articles";
import { LANDRACES, MOODS as MOOD_COPY } from "@/components/shop/home-copy";
import { TIERS, fmtPoints, tierInfo, type TierKey } from "@/lib/loyalty-rules";
import { fmtDay, num, weekdaySA } from "@/lib/format";
import { plural } from "@/lib/plural";
import { zarWhole } from "@/lib/money";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: { absolute: "Herbal Holland · Dutch heritage. African soil." },
  description: "Lab-tested, batch-traceable CBD wellness, accessories, grow and apparel. Click & collect in store, or delivery across South Africa. Adults 18+.",
  alternates: { canonical: "/" },
  openGraph: { title: "Herbal Holland · Dutch heritage. African soil.", description: "Lab-tested, batch-traceable cannabis wellness and gear. Adults 18+.", url: "/", type: "website", siteName: SITE_NAME, locale: LOCALE },
};

// The words live in home-copy.ts (screened by tests/shop-copy.test.ts); the icon and colour are the page's.
const MOODS: Record<string, { label: string; line: string; icon: React.ReactNode; hue: string }> = {
  calm: { ...MOOD_COPY.calm, icon: <Leaf className="h-6 w-6" strokeWidth={1.7} />, hue: "from-[#223019] to-ink-950" },
  focus: { ...MOOD_COPY.focus, icon: <Sun className="h-6 w-6" strokeWidth={1.7} />, hue: "from-[#3a1d0b] to-ink-950" },
  rest: { ...MOOD_COPY.rest, icon: <Moon className="h-6 w-6" strokeWidth={1.7} />, hue: "from-[#2b1848] to-ink-950" },
  recover: { ...MOOD_COPY.recover, icon: <Dumbbell className="h-6 w-6" strokeWidth={1.7} />, hue: "from-[#0f302a] to-ink-950" },
};

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function Home() {
  const [customer, store, classes, settings, footprint, batches, launch, franchisor] = await Promise.all([
    getCustomer(),
    getPreferredStore(),
    getClasses(),
    getSettings(),
    getStoreFootprint(),
    db.batch.count({ where: { labName: { not: null }, status: "RELEASED" } }),
    launchState(),
    getFranchisor(),
  ]);
  // Organization + WebSite for search engines: the franchisor's registered details, profiles only from ORG_SAME_AS.
  const base = siteUrl();
  const jsonLd = [
    organizationJsonLd({ base, legalName: franchisor?.legalName, email: franchisor?.email, telephone: franchisor?.phone, sameAs: parseSameAs(process.env.ORG_SAME_AS) }),
    websiteJsonLd(base),
  ];
  const who = { tier: customer?.tier ?? null, storeId: store?.id, storeName: store?.name };
  const pre = launch.preLaunch ? launch.at : null;
  const [featured, heritage, facets, categories, events, drop, place, listSize] = await Promise.all([
    cardsWhere({}, classes.public, who),
    cardsWhere({ heritage: true }, classes.public, who, 3),
    listCatalogue("public", { page: 1 }, who),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: { where: { status: "ACTIVE", regClass: { in: classes.public } } } } } } }),
    upcomingEvents({ take: 3 }),
    featuredDrop((customer?.tier ?? null) as TierKey | null),
    pre && customer ? waitlistPlace(customer.id) : null,
    pre ? db.customer.count({ where: { createdAt: { lt: pre } } }) : 0,
  ]);
  // Staff picks first, then the most-reviewed of the rest, so the grid is always full.
  const picks = [...featured].sort((a, b) => Number(b.featured) - Number(a.featured) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0)).slice(0, 8);
  // New in: the newest products in the range (the same cards, ordered by when they were added).
  const pickIds = new Set(picks.map((p) => p.id));
  const newIn = [...featured].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).filter((p) => !pickIds.has(p.id)).slice(0, 4);
  const { trading, provinces } = footprint;
  const open = canBuyOnline(settings.launch.phase);
  const opening = !trading; // no store trades yet: the network is opening
  // Where the stores are, from the data: the province while there's one ("KwaZulu-Natal"), then "3 provinces".
  const where = provinces.length === 1 ? PROVINCES[provinces[0].code as ProvinceCode] : plural(provinces.length, "province");
  const moods = facets.moods.filter((m) => MOODS[m.key]);
  const publicCats = categories.filter((c) => c._count.products > 0);
  const loyalty = settings.loyalty;

  return (
    <>
      <JsonLd data={jsonLd} />
      {/* ── Hero: the journey's sky (herbalholland.com) over the hills, the wordmark in its window frame ─── */}
      <Sky time={pre ? "night" : "dusk"} mill={false} drift className="border-b border-ink-850">
        <Container className="relative grid grid-cols-1 items-center gap-10 pb-20 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:py-24">
          {pre ? (
            <div className="hh-enter hh-stagger order-2 lg:order-1">
              <div className="eyebrow mb-5 text-brand-500">Founding Members</div>
              <h1 className="font-display text-[2.6rem] font-semibold leading-[0.98] tracking-tight text-white sm:text-6xl xl:text-[4.6rem]">
                Be one of the first {num(launch.foundingCap)}.
                <br />
                <span className="text-brand-500">
                  The list closes {WEEKDAY[weekdaySA(pre)]} {fmtDay(pre).replace(" ", "\u00a0")}.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
                Join Herbal Holland Rewards free. The first {num(launch.foundingCap)} members on the list get a numbered Founding Member card and start at {tierInfo(launch.foundingTier).name} ({loyalty.tierSavingsPct[launch.foundingTier]}% off instantly) for {launch.foundingMonths} months. Every friend who joins with your link moves you up {num(launch.referralBoost)} places. Adults 18+.
              </p>
              <Countdown to={pre} variant="blocks" label={`List closes ${fmtWhen(pre)}`} className="mt-8" />
              <div className="mt-8 flex flex-wrap gap-3">
                {place ? (
                  <ButtonLink href="/club" size="xl">
                    You&apos;re #{num(place.place)} on the list <ArrowRight className="h-5 w-5" />
                  </ButtonLink>
                ) : (
                  <ButtonLink href={customer ? "/club" : "/club/join"} size="xl">
                    {customer ? "See your place on the list" : "Join free"} <ArrowRight className="h-5 w-5" />
                  </ButtonLink>
                )}
                <ButtonLink href="/shop" variant="outline-dark" size="xl">
                  Shop the range
                </ButtonLink>
              </div>
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-ink-850 pt-6">
                {[
                  [listSize, "members on the list"],
                  [launch.foundingCap, "Founding spots"],
                  opening ? [footprint.total, `${footprint.total === 1 ? "store" : "stores"} opening soon`] : [trading, `${trading === 1 ? "store" : "stores"} open`],
                ].map(([v, l]) => (
                  <div key={l}>
                    <dt className="sr-only">{l}</dt>
                    <dd className="tnum font-display text-3xl font-semibold text-white"><CountUp value={v as number} /></dd>
                    <dd className="mt-1 text-xs text-ink-400">{l}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
          <div className="hh-enter hh-stagger order-2 lg:order-1">
            <div className="eyebrow mb-5 text-brand-500">Herbal Holland · South Africa</div>
            <h1 className="font-display text-[2.9rem] font-semibold leading-[0.95] tracking-tight text-white sm:text-6xl xl:text-[5.2rem]">
              Dutch heritage.
              <br />
              <span className="text-brand-500">African soil.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
              CBD wellness, accessories, grow and apparel for adults 18+. Every batch is lab-tested, and the code on each pack opens its result.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/shop" size="xl">
                Shop the range <ArrowRight className="h-5 w-5" />
              </ButtonLink>
              <ButtonLink href={customer ? "/club" : "/club/join"} variant="outline-dark" size="xl">
                {customer ? "Your Rewards card" : "Join Herbal Holland Rewards"}
              </ButtonLink>
            </div>
            <dl className={cn("mt-12 grid max-w-lg gap-4 border-t border-ink-850 pt-6", batches > 0 ? "grid-cols-3" : "grid-cols-2")}>
              {/* A zero is not a boast: the batch count waits until the first batch is on the shelf. */}
              {[
                opening ? [footprint.total, `${footprint.total === 1 ? "store" : "stores"} opening soon`] : [trading, `${trading === 1 ? "store" : "stores"}${provinces.length ? ` in ${where}` : ""}`],
                ...(batches > 0 ? [[batches, "lab-tested batches"]] : []),
                [loyalty.signupBonus, "welcome points"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-display text-3xl font-semibold text-white"><CountUp value={v as number} /></dd>
                  <dd className="mt-1 text-xs text-ink-400">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          )}
          <div className="order-1 lg:order-2">
            <div className="hh-bead-frame hh-glow relative mx-auto flex aspect-[4/5] w-full max-w-[15rem] items-center justify-center p-6 shadow-glow sm:max-w-sm sm:p-10 lg:max-w-md">
              <Lockup spin className="hh-draw h-full w-full justify-center text-[1.6rem] sm:text-[2.6rem] lg:text-[3rem] [&>svg]:h-[54%]" />
            </div>
          </div>
        </Container>
      </Sky>

      {/* Members: one nudge to keep the app on the home screen (shown once here; the Rewards card keeps offering it). */}
      {customer && (
        <Container>
          <InstallPrompt app="rewards" once className="mb-16 animate-rise" />
        </Container>
      )}

      {/* Each block below the hero is its own Suspense boundary: the HTML is unchanged, the browser hydrates them in slices (see ProductGrid). */}
      {/* ── Trust strip ───────────────────────────────────────────── */}
      <Suspense>
      <section className="border-y border-ink-850 bg-ink-900/40">
        <Container className="grid grid-cols-2 gap-x-6 gap-y-5 py-6 lg:grid-cols-4">
          {[
            [<FlaskConical key="a" className="h-5 w-5" />, "Lab-tested, every batch", "Independent COA for potency and safety"],
            [<QrCode key="b" className="h-5 w-5" />, "Batch-traceable", "Scan the pack to see its lab result"],
            [<Store key="c" className="h-5 w-5" />, open ? "Click & collect" : "In store", opening ? `Soon, at ${plural(footprint.total, "store")}` : `${open ? "At " : ""}${plural(trading, "store")}${provinces.length ? ` in ${where}` : ""}${footprint.total > trading ? `, ${footprint.total - trading} opening soon` : ""}`],
            [<Truck key="d" className="h-5 w-5" />, open ? "Nationwide delivery" : "Online shopping", open ? `Free over ${zarWhole(settings.ecommerce.freeDeliveryOverCents)} · ID checked` : "Opens soon. Join Rewards to hear first"],
          ].map(([icon, title, sub]) => (
            <div key={String(title)} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400">{icon}</span>
              <div>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="text-xs leading-snug text-ink-400">{sub}</div>
              </div>
            </div>
          ))}
        </Container>
      </section>
      </Suspense>

      {/* ── Windmill Days: events and the featured drop ─────────────── */}
      {(events.length > 0 || drop) && (
        <Container className="pt-20">
          <SectionHead
            eyebrow="Windmill Days"
            title="Opening weekends, members' evenings & drops"
            description="Come and meet us in store: RSVP free and bring your ID (adults 18+). Limited drops go to Rewards members first."
            action={
              drop ? (
                <ButtonLink href="/drops" variant="ghost-dark" size="sm">
                  All drops <ArrowRight className="h-4 w-4" />
                </ButtonLink>
              ) : null
            }
          />
          <Reveal stagger className={drop && events.length ? "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : "grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"}>
            {drop && (
              <Suspense>
                <DropCardView d={drop} />
              </Suspense>
            )}
            {drop && events.length > 0 ? (
              <div className="grid content-start gap-3">
                {events.map((e) => (
                  <Suspense key={e.id}>
                    <EventCardView e={e} />
                  </Suspense>
                ))}
              </div>
            ) : (
              events.map((e) => (
                <Suspense key={e.id}>
                  <EventCardView e={e} />
                </Suspense>
              ))
            )}
          </Reveal>
        </Container>
      )}

      {/* ── New in ───────────────────────────────────────────────── */}
      {newIn.length > 0 && (
        <Container className="pt-20">
          <SectionHead eyebrow="New in" title="Just landed" description="The newest additions to the range, every consumable with its batch certificate from day one." action={<ButtonLink href="/shop?sort=new" variant="ghost-dark" size="sm">Newest first <ArrowRight className="h-4 w-4" /></ButtonLink>} />
          <ProductGrid items={newIn} />
        </Container>
      )}

      {/* ── Founding Members (pre-launch), and gift vouchers ───────── */}
      <Suspense>
        <Container className="pt-20">
          <div className={cn("grid grid-cols-1 gap-4", pre && "lg:grid-cols-2")}>
            {pre && (
              <Link href={customer ? "/club" : "/club/join"} className="hh-beads-foot group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-brand-500/40 bg-ink-900 p-6 pb-8 transition hover:border-brand-500 sm:p-8 sm:pb-10">
                <div>
                  <div className="eyebrow flex items-center gap-2 text-brand-500">
                    <Crown className="h-4 w-4" /> Founding Members
                  </div>
                  <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white">
                    The first {num(launch.foundingCap)} get a numbered card.
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-300">
                    Join Herbal Holland Rewards free before {fmtDay(pre)} and start at {tierInfo(launch.foundingTier).name} for {launch.foundingMonths} months. Adults 18+.
                  </p>
                </div>
                <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-400 group-hover:text-brand-300">
                  {place ? `You're #${num(place.place)} on the list` : customer ? "See your place on the list" : "Join free"} <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            )}
            {open && <Link href="/gift" className="hh-beads-foot group relative flex flex-col justify-between overflow-hidden rounded-[2rem] border border-ink-800 bg-ink-900/70 p-6 pb-8 transition hover:border-brand-500/60 sm:p-8 sm:pb-10">
              <div>
                <div className="eyebrow flex items-center gap-2 text-brand-500">
                  <Gift className="h-4 w-4" /> Gift vouchers
                </div>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white">Send a gift voucher.</h2>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-300">R200, R500 or R1,000, emailed with your message, redeemable on anything in store or online and valid for three years.</p>
              </div>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-400 group-hover:text-brand-300">
                Buy a voucher <ArrowRight className="h-4 w-4" />
              </span>
            </Link>}
          </div>
        </Container>
      </Suspense>

      {/* ── Shop by mood ──────────────────────────────────────────── */}
      {moods.length > 0 && (
        <Suspense>
        <Container className="pt-20">
          <SectionHead eyebrow="Shop by mood" title="How do you want to feel?" description="Everyday CBD and hemp products, grouped by the moment they're made for." />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {moods.slice(0, 4).map((m) => {
              const meta = MOODS[m.key];
              return (
                <Link key={m.key} href={`/shop?mood=${m.key}`} className={`group relative overflow-hidden rounded-2xl border border-ink-800 bg-gradient-to-br ${meta.hue} p-5 transition hover:border-brand-500/60 sm:p-6`}>
                  <svg aria-hidden viewBox="-40 -40 80 80" className="absolute -right-8 -top-8 h-36 w-36 text-white/[0.06] transition duration-700 group-hover:rotate-45">
                    {[0, 90, 180, 270].map((r) => (
                      <path key={r} d={PETAL} transform={`rotate(${r - 45})`} fill="none" stroke="currentColor" strokeWidth={2.4} />
                    ))}
                  </svg>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-ink-950/60 text-brand-400">{meta.icon}</span>
                  <h3 className="mt-8 font-display text-2xl font-semibold text-white">{meta.label}</h3>
                  <p className="mt-1 text-sm text-ink-300">{meta.line}</p>
                  <p className="mt-4 flex items-center gap-1 text-xs font-semibold text-brand-400">
                    {m.count} product{m.count === 1 ? "" : "s"} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </p>
                </Link>
              );
            })}
          </div>
        </Container>
        </Suspense>
      )}

      {/* ── Categories ────────────────────────────────────────────── */}
      <Suspense>
      <Container className="pt-20">
        <SectionHead eyebrow="The range" title="Shop by category" action={<ButtonLink href="/shop" variant="ghost-dark" size="sm">Everything <ArrowRight className="h-4 w-4" /></ButtonLink>} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {publicCats.map((c) => {
            const Icon = categoryIcon(c.icon, Leaf);
            const img = categoryImage(c.slug);
            return (
              <Link key={c.id} href={`/shop?category=${c.slug}`} className="hh-beads-foot group relative flex flex-col overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60 p-5 pb-7 transition hover:border-brand-500/60 hover:bg-ink-900">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" width={1440} height={900} loading="lazy" decoding="async" className="-mx-5 -mt-5 mb-1 aspect-[16/10] w-[calc(100%+2.5rem)] max-w-none object-cover transition duration-700 group-hover:scale-[1.03]" />
                ) : (
                  <Icon className="h-7 w-7 text-brand-500" strokeWidth={1.6} />
                )}
                <h3 className={`${img ? "mt-4" : "mt-6"} font-display text-lg font-semibold text-white`}>{c.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-ink-400">{c.blurb}</p>
                <span className="mt-4 text-xs font-semibold text-ink-300 group-hover:text-brand-300">{plural(c._count.products, "product")} →</span>
              </Link>
            );
          })}
          <Link href="/dispensary" className="group col-span-2 flex flex-col rounded-2xl border border-dashed border-ink-700 p-5 transition hover:border-brand-500/60 lg:col-span-1">
            <ShieldCheck className="h-7 w-7 text-brand-500" strokeWidth={1.6} />
            <h3 className="mt-6 font-display text-lg font-semibold text-white">Dispensary</h3>
            <p className="mt-1 text-sm text-ink-400">For registered patients with a SAHPRA authorisation. Sign in to view.</p>
            <span className="mt-4 text-xs font-semibold text-ink-300 group-hover:text-brand-300">How it works →</span>
          </Link>
        </div>
      </Container>
      </Suspense>

      {/* ── Featured ──────────────────────────────────────────────── */}
      {picks.length > 0 && (
        <Container className="pt-20">
          <SectionHead eyebrow="Staff picks" title="Featured from the range" action={<ButtonLink href="/shop" variant="ghost-dark" size="sm">Shop all <ArrowRight className="h-4 w-4" /></ButtonLink>} />
          <ProductGrid items={picks} />
        </Container>
      )}

      {/* ── Heritage story ────────────────────────────────────────── */}
      <Suspense>
      <section className="mt-24 border-y border-ink-850 bg-[radial-gradient(ellipse_at_top_left,rgb(245_145_60/0.08),transparent_60%)]">
        <Container className="grid grid-cols-1 gap-12 py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
          <div>
            <div className="eyebrow text-brand-500">Our heritage</div>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">Four landraces, and the growers who kept them.</h2>
            <div className="mt-6 space-y-4 text-[1.02rem] leading-relaxed text-ink-300">
              <p>
                Long before Amsterdam&apos;s coffee shops made them famous, Southern Africa&apos;s landraces were shaped by generations of growers on the hillsides of KwaZulu-Natal, Eswatini, Malawi and the Wild Coast.
              </p>
              <p>A landrace is a local variety that has adapted to its place over generations: the soil, the sun, the rain and the hands that kept its seed. That&apos;s what we mean by African soil.</p>
            </div>
            <p className="mt-6 flex items-start gap-3 text-sm leading-relaxed text-ink-400">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden />
              Licensed cannabis is supplied only through lawful channels. Today that means registered patients, through an authorised dispenser.
            </p>
            <ButtonLink href="/learn/heritage-landraces" variant="outline-dark" size="lg" className="mt-8">
              Read the full story <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          <div>
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LANDRACES.map((l, i) => (
                <li key={l.name} className="relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
                  <span className="tnum font-display text-sm font-semibold text-brand-500">0{i + 1}</span>
                  <h3 className="mt-2 font-display text-xl font-semibold text-white">{l.name}</h3>
                  <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{l.origin}</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink-300">{l.note}</p>
                </li>
              ))}
            </ol>
            {heritage.length > 0 && (
              <div className="mt-6">
                <div className="eyebrow mb-3 text-ink-400">From the heritage line</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {heritage.slice(0, 2).map((p) => (
                    <Link key={p.id} href={`/p/${p.slug}`} className="group flex items-center gap-4 rounded-2xl border border-ink-800 p-3 transition hover:border-brand-500/60">
                      <ProductArt slug={p.slug} strain={p.strain} regClass={p.regClass} label={p.name} className="h-16 w-16 shrink-0 rounded-xl" />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white group-hover:text-brand-300">{p.name}</div>
                        <div className="truncate text-xs text-ink-400">{p.tagline}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Container>
      </section>
      </Suspense>

      {/* ── Rewards ─────────────────────────────────────────── */}
      <Suspense>
      <Container className="pt-24">
        <div className="relative overflow-hidden rounded-[2rem] border border-ink-800 bg-ink-900 p-6 sm:p-10 lg:p-14">
          <Mark aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 text-brand-500/[0.07]" />
          <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <div className="eyebrow text-brand-500">Herbal Holland Rewards</div>
              <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Pay less. Earn more.</h2>
              <p className="mt-4 max-w-md text-[1.02rem] leading-relaxed text-ink-300">
                Members get instant prices ({loyalty.tierSavingsPct.SEED}% off from day one, up to {loyalty.tierSavingsPct.HARVEST}% at Harvest), plus {loyalty.earnPer100} points for every R100, each worth R1. Free to join, with {fmtPoints(loyalty.signupBonus)} to welcome you.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href={customer ? "/club" : "/club/join"} size="lg">
                  {customer ? "View your card" : "Join free"}
                </ButtonLink>
                <ButtonLink href="/learn/points" variant="ghost-dark" size="lg">
                  How points work
                </ButtonLink>
              </div>
            </div>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {TIERS.map((t, i) => (
                <li key={t.key} className={`rounded-2xl border p-4 ${i === TIERS.length - 1 ? "border-brand-500/60 bg-brand-500/10" : "border-ink-800 bg-ink-950/60"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-semibold text-white">{t.name}</span>
                    <span className="tnum text-xs font-bold text-brand-400">{loyalty.tierSavingsPct[t.key]}% off</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">{t.minCents ? `From ${zarWhole(t.minCents)} a year` : "When you join"}</p>
                  <p className="mt-3 text-xs leading-snug text-ink-200">{t.perks[0]}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Container>
      </Suspense>

      {/* ── Stores ────────────────────────────────────────────────── */}
      <Suspense>
      <Container className="pt-24">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <div className="eyebrow text-brand-500">Find us</div>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white">{opening ? `${plural(footprint.total, "store")} opening.` : `${plural(trading, "store")}.`} One windmill.</h2>
            <p className="mt-4 max-w-md leading-relaxed text-ink-300">
              {opening ? "Walk in for advice from people who know the range. Join Rewards and pick your home store: we'll tell you the day its doors open." : open ? "Walk in for advice from people who know the range, or order online and collect in store." : "Walk in for advice from people who know the range."} Each store is independently owned and run by a local franchisee.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {provinces.map((p) => (
                <Link key={p.code} href={`/stores?province=${p.code}#${p.code}`} className="rounded-full border border-ink-700 px-3.5 py-1.5 text-sm text-ink-200 hover:border-brand-500 hover:text-white">
                  {PROVINCES[p.code as ProvinceCode]} <span className="tnum text-ink-450">{p.stores}</span>
                </Link>
              ))}
            </div>
            <ButtonLink href="/stores" variant="outline-dark" size="lg" className="mt-8">
              Store finder <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          {store ? (
            <div>
              <div className="eyebrow mb-3 text-ink-400">Your store</div>
              <StoreCard s={store} preferred />
            </div>
          ) : (
            <Panel className="p-8 text-center">
              <Store className="mx-auto h-10 w-10 text-brand-500" strokeWidth={1.5} />
              <h3 className="mt-4 font-display text-xl font-semibold text-white">Choose your store</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-400">{open ? "We'll show what's on the shelf there and have your click & collect orders ready to go." : "We'll tell you the day it opens and show you what's on its shelves."}</p>
              <ButtonLink href="/stores" className="mt-6">
                Find a store
              </ButtonLink>
            </Panel>
          )}
        </div>
      </Container>
      </Suspense>

      {/* ── Learn ─────────────────────────────────────────────────── */}
      <Suspense>
      <Container className="pt-24">
        <SectionHead eyebrow="Learn" title="Know what you're buying" action={<ButtonLink href="/learn" variant="ghost-dark" size="sm">All guides <ArrowRight className="h-4 w-4" /></ButtonLink>} />
        <Reveal stagger className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ARTICLES.slice(0, 3).map((a) => (
            <Link key={a.slug} href={`/learn/${a.slug}`} className="hh-lift hh-press group overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60 hover:border-brand-500/60">
              <ProductArt slug={a.art.slug} strain={a.art.strain} regClass={a.art.regClass} label="" className="aspect-[16/9] w-full" />
              <div className="p-5">
                <div className="eyebrow text-brand-500">{a.kicker}</div>
                <h3 className="mt-2 font-display text-xl font-semibold leading-snug text-white group-hover:text-brand-200">{a.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-400">{a.dek}</p>
                <p className="mt-4 text-xs font-medium text-ink-450">{a.minutes} min read</p>
              </div>
            </Link>
          ))}
        </Reveal>
      </Container>
      </Suspense>
    </>
  );
}
