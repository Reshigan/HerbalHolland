// The trade portal's landing page (indexable): who a trade account is for, what it comes with, the range by category
// (counts only; prices show after sign-in), how it works, and the two doors: apply or sign in. Organization JSON-LD.
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BadgePercent, Coffee, FileText, FlaskConical, Landmark, Leaf, Package, Pill, Store, Stethoscope, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { getTradeBuyer } from "@/server/trade/auth";
import { getFranchisor } from "@/server/shop/context";
import { Sky } from "@/components/shop/sky";
import { JsonLd } from "@/components/shop/json-ld";
import { Container, Panel, SectionHead } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { categoryIcon } from "@/components/product/category-icons";
import { CTA, FACTS, GET, HERO, HOW, RANGE, WHO } from "@/components/trade/copy";
import { LOCALE, organizationJsonLd, parseSameAs, SITE_NAME, siteUrl } from "@/lib/seo";
import { TRADE_CLASSES } from "@/lib/trade";
import { zarWhole } from "@/lib/money";
import { num } from "@/lib/format";

const TITLE = "Herbal Holland Trade: wholesale, done properly";
const DESCRIPTION = "Trade prices ex VAT, case packs and lab-tested batches for pharmacies, independent retailers, cafés and wellness practices. Courier from our DC or click & collect. Adults 18+.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/trade" },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/trade", type: "website", siteName: SITE_NAME, locale: LOCALE },
};

const KIND_ICON: Record<string, React.ReactNode> = {
  PHARMACY: <Pill className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
  RETAILER: <Store className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
  CAFE: <Coffee className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
  PRACTICE: <Stethoscope className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
};
const GET_ICON: Record<string, React.ReactNode> = {
  prices: <BadgePercent className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
  cases: <Package className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
  coa: <FlaskConical className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
  delivery: <Truck className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
  terms: <Landmark className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
  invoices: <FileText className="h-6 w-6" strokeWidth={1.7} aria-hidden />,
};

// Live products in the trade classes with a trade price (a wholesale price on an active variant that isn't made to order).
const TRADE_PRODUCT = { status: "ACTIVE" as const, regClass: { in: TRADE_CLASSES }, variants: { some: { active: true, podSku: null, wholesaleCents: { gt: 0 } } } };

export default async function TradeLanding() {
  const [settings, buyer, franchisor, categories, collectStores, dcs, lots] = await Promise.all([
    getSettings(),
    getTradeBuyer(),
    getFranchisor(),
    db.category.findMany({ where: { products: { some: TRADE_PRODUCT } }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true, icon: true, blurb: true, _count: { select: { products: { where: TRADE_PRODUCT } } } } }),
    db.store.count({ where: { kind: "RETAIL", status: "ACTIVE", clickCollect: true } }),
    db.store.count({ where: { kind: "WAREHOUSE", status: "ACTIVE" } }),
    db.batch.count({ where: { labName: { not: null }, status: "RELEASED" } }),
  ]);
  const t = settings.trade;
  const base = siteUrl();
  const jsonLd = organizationJsonLd({ base, legalName: franchisor?.legalName, email: franchisor?.email, telephone: franchisor?.phone, sameAs: parseSameAs(process.env.ORG_SAME_AS) });
  const products = categories.reduce((n, c) => n + c._count.products, 0);
  const facts = [
    [`${zarWhole(t.minOrderCents)}`, "minimum order, ex VAT"],
    [t.freeDeliveryOverCents > 0 ? `${zarWhole(t.freeDeliveryOverCents)}` : zarWhole(t.deliveryCents), t.freeDeliveryOverCents > 0 ? "and up ships free from the DC" : "courier from the DC, ex VAT"],
    [num(collectStores), collectStores === 1 ? "store for click & collect" : "stores for click & collect"],
  ];

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <Sky time="dusk" className="border-b border-ink-850">
        <Container className="relative grid grid-cols-1 items-center gap-10 pb-20 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:py-24">
          <div className="animate-rise">
            <div className="eyebrow mb-5 text-brand-500">{HERO.eyebrow}</div>
            <h1 className="font-display text-[2.5rem] font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl xl:text-[4.25rem]">{HERO.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">{HERO.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {buyer ? (
                <ButtonLink href="/trade/range" size="xl">
                  Go to the range <ArrowRight className="h-5 w-5" aria-hidden />
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/trade/apply" size="xl">
                    {HERO.apply} <ArrowRight className="h-5 w-5" aria-hidden />
                  </ButtonLink>
                  <ButtonLink href="/trade/login" variant="outline-dark" size="xl">
                    {HERO.signIn}
                  </ButtonLink>
                </>
              )}
            </div>
            <p className="mt-5 text-sm text-ink-400">{HERO.note}</p>
            <dl className="mt-12 grid max-w-xl grid-cols-3 gap-4 border-t border-ink-850 pt-6">
              {facts.map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="tnum font-display text-2xl font-semibold text-white sm:text-3xl">{v}</dd>
                  <dd className="mt-1 text-xs text-ink-400">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="hh-frame relative hidden p-8 lg:block">
            <div className="eyebrow text-brand-500">A trade line, as you&apos;ll see it</div>
            <div className="mt-6 space-y-5">
              {[
                ["Calm CBD Oil 600mg · 30ml", "case of 6", "ex VAT each"],
                ["Hemp Hand Cream · 75ml", "case of 12", "ex VAT each"],
                ["Grow Tent 80 × 80", "case of 1", "ex VAT each"],
              ].map(([name, pack, unit]) => (
                <div key={name} className="flex items-center justify-between gap-4 border-b border-ink-800 pb-4 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{name}</div>
                    <div className="mt-0.5 text-xs text-ink-400">
                      {pack} · lab-tested batch · certificate of analysis
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum font-display text-lg font-semibold text-brand-500">R ··,··</div>
                    <div className="text-[0.7rem] text-ink-400">{unit}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-ink-400">Prices show once your account is approved and you sign in.</p>
          </div>
        </Container>
      </Sky>

      {/* ── Who it's for ──────────────────────────────────────────────────── */}
      <Container className="pt-20">
        <SectionHead eyebrow={WHO.eyebrow} title={WHO.title} description={WHO.lead} />
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHO.cards.map((c) => (
            <li key={c.kind}>
              <Panel className="hh-beads-foot relative flex h-full flex-col overflow-hidden p-5 pb-8">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-500">{KIND_ICON[c.kind]}</span>
                <h3 className="mt-5 font-display text-lg font-semibold text-white">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{c.text}</p>
              </Panel>
            </li>
          ))}
        </ul>
      </Container>

      {/* ── What you get ──────────────────────────────────────────────────── */}
      <Container className="pt-20">
        <SectionHead eyebrow={GET.eyebrow} title={GET.title} />
        <ul className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {GET.items.map((g) => (
            <li key={g.key} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-ink-800 bg-ink-900 text-brand-500">{GET_ICON[g.key]}</span>
              <div>
                <h3 className="font-display text-base font-semibold text-white">
                  {g.title}
                  {g.key === "delivery" && t.freeDeliveryOverCents > 0 ? ` (free from ${zarWhole(t.freeDeliveryOverCents)})` : ""}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-300">
                  {g.text}
                  {g.key === "cases" ? ` The minimum order is ${zarWhole(t.minOrderCents)} ex VAT.` : ""}
                  {g.key === "delivery" ? ` Courier ${zarWhole(t.deliveryCents)} ex VAT; collection handling ${zarWhole(t.collectHandlingCents)} ex VAT.` : ""}
                  {g.key === "terms" ? ` EFT orders are held ${t.eftHoldDays} days for payment.` : ""}
                  {g.key === "coa" && lots > 0 ? ` ${num(lots)} released lots carry one today.` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Container>

      {/* ── The range by category (counts only) ───────────────────────────── */}
      <Container className="pt-20">
        <SectionHead eyebrow={RANGE.eyebrow} title={RANGE.title} description={`${RANGE.lead} ${num(products)} products across ${categories.length} categories, from ${num(dcs)} distribution ${dcs === 1 ? "centre" : "centres"}.`} />
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon, Leaf);
            return (
              <li key={c.id}>
                <Panel className="flex h-full flex-col p-5">
                  <Icon className="h-7 w-7 text-brand-500" strokeWidth={1.6} aria-hidden />
                  <h3 className="mt-5 font-display text-lg font-semibold text-white">{c.name}</h3>
                  {c.blurb && <p className="mt-1 line-clamp-2 text-sm text-ink-400">{c.blurb}</p>}
                  <span className="tnum mt-4 text-xs font-semibold text-ink-300">
                    {num(c._count.products)} {RANGE.products}
                  </span>
                </Panel>
              </li>
            );
          })}
        </ul>
      </Container>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <Container className="pt-20">
        <SectionHead eyebrow={HOW.eyebrow} title={HOW.title} />
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {HOW.steps.map((s) => (
            <li key={s.n} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-6">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-500 font-display text-base font-bold text-ink-950" aria-hidden>
                {s.n}
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
          <div className="eyebrow text-brand-500">{FACTS.eyebrow}</div>
          <ul className="mt-3 grid grid-cols-1 gap-x-10 gap-y-2 text-sm leading-relaxed text-ink-300 md:grid-cols-2">
            {FACTS.items.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </Container>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <Container className="pt-20">
        <div className="hh-bead-frame p-8 text-center sm:p-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{CTA.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-300">{CTA.text}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/trade/apply" size="xl">
              {HERO.apply} <ArrowRight className="h-5 w-5" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/trade/terms" variant="outline-dark" size="xl">
              Read the trade terms
            </ButtonLink>
          </div>
          <p className="mt-6 text-xs text-ink-400">
            Already approved?{" "}
            <Link href="/trade/login" className="font-semibold text-brand-400 underline hover:text-brand-300">
              Sign in with your email
            </Link>
            .
          </p>
        </div>
      </Container>
    </>
  );
}
