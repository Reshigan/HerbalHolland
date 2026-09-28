import { cache, Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronRight, Clock, Mail, MapPin, MessageCircle, Navigation, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getPreferredStore, STORE_SELECT } from "@/server/shop/context";
import { openState, parseHours, weekRows } from "@/server/shop/hours";
import { storeDeals, storeMenu } from "@/server/shop/stores";
import { upcomingEvents } from "@/server/shop/launch";
import { EventCardView } from "@/components/shop/launch-cards";
import { ProductArt } from "@/components/product/art";
import { directionsUrl, StoreServices } from "@/components/shop/store-card";
import { SetStoreButton } from "@/components/shop/set-store-button";
import { Callout, Container, Panel, Price, Tag } from "@/components/shop/ui";
import { JsonLd } from "@/components/shop/json-ld";
import { describePromo, type PromoInput } from "@/lib/promotions";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { breadcrumbJsonLd, clampWords, LOCALE, metaDescription, SITE_NAME, siteUrl, storeJsonLd, TITLE_MAX } from "@/lib/seo";
import { cn } from "@/lib/cn";

// generateMetadata and the page share one lookup per request.
const load = cache(async (slug: string) =>
  db.store.findFirst({ where: { slug, kind: "RETAIL", status: { in: ["ACTIVE", "OPENING_SOON"] } }, select: { ...STORE_SELECT, company: { select: { legalName: true } }, openedAt: true } }),
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await load((await params).slug);
  if (!s) return { title: "Store not found" };
  const soon = s.status !== "ACTIVE";
  // "Herbal Holland Umhlanga, Durban": the first of city, suburb or province that isn't already the store's name.
  const place = [s.city, s.suburb, PROVINCES[s.province as ProvinceCode]].find((p) => p && p !== s.name);
  const title = clampWords(`${SITE_NAME} ${s.name}${place ? `, ${place}` : ""}`, TITLE_MAX);
  const address = [s.addressLine, s.suburb, s.city].filter((v, i, a) => a.indexOf(v) === i).join(", ");
  const path = `/stores/${s.slug}`;
  const description = metaDescription(
    `${SITE_NAME} ${s.name}${soon ? " (opening soon)" : ""}: ${address}.`,
    soon ? "Join Rewards to hear the day the doors open." : `Opening hours, what's in stock, click & collect${s.sameDay ? ", same-day delivery" : ""} and directions.`,
    "Adults 18+.",
  );
  return {
    title: { absolute: title }, // the brand is already in the name: no " · Herbal Holland" suffix
    description,
    alternates: { canonical: path },
    openGraph: { title, description, type: "website", url: path, siteName: SITE_NAME, locale: LOCALE },
  };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await load(slug);
  if (!s) notFound();
  const soon = s.status !== "ACTIVE";
  const customer = await getCustomer();
  // Members see their member prices on top of the store's own shelf prices.
  const [preferred, memberMenu, deals, events] = await Promise.all([
    getPreferredStore(),
    soon ? [] : storeMenu(s.id, { tier: customer?.tier ?? null }),
    soon ? [] : storeDeals(s.id),
    upcomingEvents({ storeId: s.id, take: 6 }),
  ]);
  const hours = parseHours(s.hours);
  const o = openState(hours);
  const total = memberMenu.reduce((n, c) => n + c.items.length, 0);
  const province = PROVINCES[s.province as ProvinceCode];
  const base = siteUrl();
  const jsonLd = [
    storeJsonLd({ base, slug: s.slug, name: s.name, addressLine: s.addressLine, suburb: s.suburb, city: s.city, province, postalCode: s.postalCode, lat: s.lat, lng: s.lng, phone: s.phone, email: s.email, hours }),
    breadcrumbJsonLd(base, [
      { name: "Stores", path: "/stores" },
      { name: province, path: `/stores?province=${s.province}` },
      { name: s.name, path: `/stores/${s.slug}` },
    ]),
  ];

  return (
    <Container className="pt-6">
      <JsonLd data={jsonLd} />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-400">
        <Link href="/stores" className="hover:text-white">
          Stores
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/stores?province=${s.province}#${s.province}`} className="hover:text-white">
          {province}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-ink-200">{s.name}</span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {soon ? <Tag tone="amber">Opening soon</Tag> : <Tag tone={o.open ? "green" : "neutral"}>{o.open ? "Open now" : "Closed now"}</Tag>}
            {s.format === "FLAGSHIP" && <Tag tone="orange">Flagship</Tag>}
          </div>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Herbal Holland {s.name}</h1>
          <p className="mt-3 flex items-start gap-2 text-lg text-ink-300">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-brand-500" />
            {s.addressLine}, {s.suburb}, {s.city}, {s.postalCode}
          </p>
          {!soon && <p className={cn("mt-2 flex items-center gap-2 text-sm font-medium", o.open ? "text-leaf-100" : "text-ink-400")}><Clock className="h-4 w-4" /> {o.label}</p>}
          {!soon && <StoreServices s={s} className="mt-5" />}
          <div className="mt-6 flex flex-wrap gap-2">
            {!soon && <SetStoreButton code={s.code} name={s.name} active={preferred?.id === s.id} className="h-11 px-5 text-sm" />}
            <a href={directionsUrl(s)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-ink-700 px-5 text-sm font-semibold text-ink-100 hover:border-ink-500">
              <Navigation className="h-4 w-4" /> Directions
            </a>
          </div>
          {soon && (
            <Callout tone="brand" className="mt-8" title="We're getting ready">
              This store is opening soon. <Link href="/club/join" className="font-semibold text-white underline">Join Rewards</Link> and pick it as your home store to hear when the doors open.
            </Callout>
          )}
        </div>

        <aside className="space-y-4">
          <Panel className="p-5">
            <h2 className="font-display text-lg font-semibold text-white">Opening hours</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {weekRows(hours).map((r) => (
                <div key={r.key} className={cn("flex justify-between", r.today ? "font-semibold text-white" : "text-ink-400")}>
                  <dt>{r.label}</dt>
                  <dd className="tnum">{r.span}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-450">Public holiday hours may differ — call ahead.</p>
          </Panel>
          {!soon && (
            <Panel className="space-y-2.5 p-5 text-sm">
              {s.phone && (
                <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="flex items-center gap-3 text-ink-200 hover:text-white">
                  <Phone className="h-4 w-4 text-brand-500" /> {s.phone}
                </a>
              )}
              {s.whatsapp && (
                <a href={`https://wa.me/${s.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-ink-200 hover:text-white">
                  <MessageCircle className="h-4 w-4 text-brand-500" /> WhatsApp the store
                </a>
              )}
              {s.email && (
                <a href={`mailto:${s.email}`} className="flex items-center gap-3 text-ink-200 hover:text-white">
                  <Mail className="h-4 w-4 text-brand-500" /> {s.email}
                </a>
              )}
              <p className="border-t border-ink-800 pt-2.5 text-xs text-ink-450">Operated by {s.company.legalName}, an independent Herbal Holland franchisee.</p>
            </Panel>
          )}
        </aside>
      </div>

      {events.length > 0 && (
        <section className="mt-14" aria-labelledby="events">
          <div className="eyebrow text-brand-500">Windmill Days</div>
          <h2 id="events" className="mt-2 font-display text-2xl font-semibold text-white">
            {soon ? "Come to the opening" : `What's on at ${s.name}`}
          </h2>
          <p className="mt-1 text-sm text-ink-400">Free for Rewards members — RSVP to hold your place. Adults 18+, bring your ID.</p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {events.map((e) => (
              <EventCardView key={e.id} e={e} showStore={false} />
            ))}
          </div>
        </section>
      )}

      {!soon && (
        <>
          {deals.length > 0 && (
            <section className="mt-14" aria-labelledby="deals">
              <h2 id="deals" className="font-display text-2xl font-semibold text-white">
                In-store deals today
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {deals.map((d) => (
                  <div key={d.id} className="flex items-start gap-3 rounded-2xl border border-brand-500/35 bg-brand-500/[0.06] p-4">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
                    <div className="text-sm">
                      <div className="font-semibold text-white">{d.name}</div>
                      <div className="text-ink-300">{describePromo(d as unknown as PromoInput)}{d.description ? ` — ${d.description}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* The shelf list hydrates later, in small slices, after the shell (see ProductGrid). */}
          <Suspense>
          <section className="mt-14" aria-labelledby="menu">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="eyebrow text-brand-500">On the shelf now</div>
                <h2 id="menu" className="mt-2 font-display text-2xl font-semibold text-white">
                  In stock at {s.name}
                </h2>
                <p className="mt-1 text-sm text-ink-400">
                  {total} products · live stock · in-store prices{customer ? " (your member prices)" : ""}, set by this store
                </p>
              </div>
            </div>
            <Callout tone="info" icon={<ShieldCheck className="h-5 w-5" />} className="mt-5" title="Registered patient?">
              Licensed medicines aren&apos;t listed publicly. Our authorised dispenser here can help —{" "}
              <Link href="/dispensary" className="font-semibold text-white underline">
                sign in to view the dispensary
              </Link>
              .
            </Callout>
            <div className="mt-8 space-y-10">
              {memberMenu.map((c) => (
                <div key={c.slug}>
                  <h3 className="font-display text-lg font-semibold text-white">{c.name}</h3>
                  <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {c.items.map((i) => (
                      <li key={i.variantId}>
                        <Link href={`/p/${i.slug}?v=${i.variantId}`} className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/50 p-2.5 pr-4 transition hover:border-ink-600">
                          <ProductArt slug={i.slug} strain={i.strain} regClass={i.regClass} label={i.name} className="h-14 w-14 shrink-0 rounded-xl" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-white">{i.name}</div>
                            <div className="truncate text-xs text-ink-400">
                              {i.variant}
                              {i.qty <= 3 && <span className="ml-2 font-semibold text-amber-100">Last {i.qty}</span>}
                            </div>
                          </div>
                          <Price cents={i.priceCents} was={i.wasCents} size="sm" className="shrink-0 justify-end text-right" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!memberMenu.length && <p className="text-ink-400">Stock information isn&apos;t available right now — give the store a call.</p>}
            </div>
          </section>
          </Suspense>
        </>
      )}
    </Container>
  );
}
