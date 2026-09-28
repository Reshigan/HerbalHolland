// herbalholland.com home: the brand promise, three doors (shop, Rewards, franchise), our standards, where we are (live
// counts, never hard-coded stores or dates) and teasers for franchise, press and careers.
import type { Metadata, ResolvingMetadata } from "next";
import { ArrowRight, BriefcaseBusiness, FlaskConical, IdCard, KeyRound, Newspaper, ShieldCheck, ShoppingBag, Store } from "lucide-react";
import { getFranchisor, getStoreFootprint } from "@/server/shop/context";
import { launchState } from "@/server/launch";
import { Lockup } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";
import { Container } from "@/components/shop/ui";
import { AgeBadge, Band, Heading, IconBadge, JsonLd, LinkCard, MoreLink, bodyClass, cardClass, h3Class, shopHost, siteAsset, siteMeta } from "@/components/site/blocks";
import { BRAND, EMAIL, HOME, fill, plural } from "@/components/site/content";
import { fmtDate, num } from "@/lib/format";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { siteLinks } from "@/lib/site";

export const generateMetadata = (_: unknown, parent: ResolvingMetadata): Promise<Metadata> => siteMeta("/", HOME.meta, parent, { absoluteTitle: true });

const ICON = { className: "h-5 w-5", strokeWidth: 1.9 } as const;
const STANDARD_ICON: Record<string, React.ReactNode> = {
  lab: <FlaskConical {...ICON} />,
  members: <IdCard {...ICON} />,
  medicines: <ShieldCheck {...ICON} />,
};
const MORE_ICON: Record<string, React.ReactNode> = {
  franchise: <Store {...ICON} />,
  press: <Newspaper {...ICON} />,
  careers: <BriefcaseBusiness {...ICON} />,
};

export default async function SiteHome() {
  const [footprint, company, launch] = await Promise.all([getStoreFootprint(), getFranchisor(), launchState()]);
  const l = siteLinks(process.env);
  const founding = launch.preLaunch && launch.at ? { closes: fmtDate(launch.at), cap: num(launch.foundingCap) } : null;
  const soon = footprint.total - footprint.trading;
  const f = HOME.footprint;
  const stats = [
    { n: footprint.trading, label: plural(footprint.trading, f.trading) },
    { n: soon, label: plural(soon, f.soon) },
    { n: footprint.provinces.length, label: plural(footprint.provinces.length, f.provinces) },
  ].filter((s) => s.n > 0);

  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    legalName: company?.legalName ?? undefined,
    url: l.abs("/"),
    logo: siteAsset("/press/herbal-holland-logo.png"),
    slogan: BRAND.line,
    email: EMAIL.hello,
    telephone: company?.phone ?? undefined,
    address: company?.address ?? undefined,
    vatID: company?.vatNumber ?? undefined,
    sameAs: [l.shop("/")],
    contactPoint: (["hello", "franchise", "press", "careers"] as const).map((k) => ({
      "@type": "ContactPoint",
      contactType: HOME.org[k],
      email: EMAIL[k],
      areaServed: "ZA",
      availableLanguage: "en",
    })),
  };

  return (
    <>
      <JsonLd data={org} />

      {/* ── Hero: the promise and the window poster ─────────────────────── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -right-40 top-10 h-[36rem] w-[36rem] rounded-full bg-brand-500/10 blur-3xl" />
        <Container className="relative grid grid-cols-1 items-center gap-10 pb-16 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16 lg:pb-24 lg:pt-16">
          <div className="order-2 animate-rise lg:order-1">
            <p className="eyebrow text-brand-500">{HOME.hero.eyebrow}</p>
            <h1 className="mt-5 font-display text-[2.9rem] font-semibold leading-[0.95] tracking-tight text-white sm:text-6xl xl:text-[5.2rem]">
              <span className="block">{BRAND.lines[0]}</span> <span className="block text-brand-500">{BRAND.lines[1]}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">{HOME.hero.lede}</p>
            <p className="mt-8 flex items-center gap-3 text-sm font-medium text-ink-200">
              <AgeBadge className="text-brand-500" />
              {HOME.hero.note}
            </p>
          </div>
          <div className="order-1 lg:order-2" aria-hidden>
            <div className="hh-frame relative mx-auto flex aspect-[4/5] w-full max-w-[15rem] items-center justify-center p-6 shadow-glow sm:max-w-sm sm:p-10 lg:max-w-md">
              <Lockup spin className="h-full w-full justify-center text-[1.6rem] sm:text-[2.6rem] lg:text-[3rem] [&>svg]:h-[54%]" />
            </div>
          </div>
        </Container>
      </section>

      {/* ── Three doors ───────────────────────────────────────────────── */}
      <section aria-labelledby="doors" className="pb-20 sm:pb-24">
        <Container>
          <Heading id="doors" eyebrow={HOME.doors.eyebrow} title={HOME.doors.title} />
          <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <li>
              <LinkCard href={l.shop("/")} external icon={<ShoppingBag {...ICON} />} label={<Label>{HOME.doors.shop.label}</Label>} title={HOME.doors.shop.title} cta={HOME.doors.shop.cta}>
                {fill(footprint.trading ? HOME.doors.shop.body : HOME.doors.shop.bodyOnline, { shop: shopHost() })}
              </LinkCard>
            </li>
            <li>
              {founding ? (
                <LinkCard
                  href={l.join}
                  external
                  highlight
                  icon={<IdCard {...ICON} />}
                  label={<span className="rounded-full bg-brand-500 px-2.5 py-1 text-[0.7rem] font-bold text-ink-950">{HOME.doors.founding.tag}</span>}
                  title={HOME.doors.founding.title}
                  cta={HOME.doors.founding.cta}
                >
                  {fill(HOME.doors.founding.body, founding)}
                </LinkCard>
              ) : (
                <LinkCard href={l.join} external icon={<IdCard {...ICON} />} label={<Label>{HOME.doors.join.label}</Label>} title={HOME.doors.join.title} cta={HOME.doors.join.cta}>
                  {HOME.doors.join.body}
                </LinkCard>
              )}
            </li>
            <li>
              <LinkCard href={l.page("/franchise")} icon={<KeyRound {...ICON} />} label={<Label>{HOME.doors.franchise.label}</Label>} title={HOME.doors.franchise.title} cta={HOME.doors.franchise.cta}>
                {HOME.doors.franchise.body}
              </LinkCard>
            </li>
          </ul>
        </Container>
      </section>

      {/* ── Our standards (cream) ─────────────────────────────────────── */}
      <Band tone="light" labelledBy="standards">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <Heading id="standards" tone="light" eyebrow={HOME.standards.eyebrow} title={HOME.standards.title} intro={HOME.standards.intro}>
            <MoreLink href={l.page("/about")} tone="light" className="mt-6">
              {HOME.standards.cta}
            </MoreLink>
          </Heading>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {HOME.standards.items.map((i) => (
              <li key={i.key} className={cardClass("light")}>
                {i.key === "adults" ? <AgeBadge className="text-brand-800" /> : <IconBadge tone="light">{STANDARD_ICON[i.key]}</IconBadge>}
                <h3 className={`${h3Class("light")} mt-5`}>{i.title}</h3>
                <p className={`${bodyClass("light")} mt-2`}>{i.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      {/* ── Where we are: live counts ─────────────────────────────────── */}
      <Band labelledBy="where">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <Heading id="where" eyebrow={f.eyebrow} title={f.title} intro={footprint.total ? f.body : f.empty}>
            {footprint.total > 0 && (
              <a href={l.shop("/stores")} className={buttonClass("outline-dark", "lg", "mt-8")}>
                {f.cta} <ArrowRight className="h-4 w-4" strokeWidth={1.9} aria-hidden />
              </a>
            )}
          </Heading>
          {stats.length > 0 && (
            <div>
              <dl className="grid grid-cols-3 gap-4 border-y border-ink-800 py-8">
                {stats.map((s) => (
                  <div key={s.label} className="flex flex-col-reverse justify-end">
                    <dt className="mt-1 text-sm leading-snug text-ink-400">{s.label}</dt>
                    <dd className="tnum font-display text-5xl font-semibold tracking-tight text-white sm:text-6xl">{num(s.n)}</dd>
                  </div>
                ))}
              </dl>
              {footprint.provinces.length > 0 && (
                <ul className="mt-6 flex flex-wrap gap-2" aria-label={f.chips}>
                  {footprint.provinces.map((p) => (
                    <li key={p.code}>
                      <a
                        href={l.shop(`/stores?province=${p.code}#${p.code}`)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink-700 px-4 text-sm text-ink-200 transition hover:border-brand-500 hover:text-white"
                      >
                        {PROVINCES[p.code as ProvinceCode] ?? p.code} <span className="tnum text-ink-500">{num(p.stores)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Band>

      {/* ── Franchise, press, careers (cream) ─────────────────────────── */}
      <Band tone="light" labelledBy="more">
        <Heading id="more" tone="light" eyebrow={HOME.more.eyebrow} title={HOME.more.title} />
        <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {HOME.more.items.map((i) => (
            <li key={i.key}>
              <LinkCard tone="light" href={l.page(`/${i.key}`)} icon={MORE_ICON[i.key]} title={i.title} cta={HOME.more.cta[i.key as keyof typeof HOME.more.cta]}>
                {i.body}
              </LinkCard>
            </li>
          ))}
        </ul>
      </Band>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow text-ink-400">{children}</span>;
}
