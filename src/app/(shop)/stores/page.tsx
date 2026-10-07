import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { getRetailStores, getPreferredStore } from "@/server/shop/context";
import { openState, parseHours } from "@/server/shop/hours";
import { StoreCard } from "@/components/shop/store-card";
import { NearMeButton } from "@/components/shop/nav-client";
import { Container, Pager, inputClass } from "@/components/shop/ui";
import { pageParam } from "@/components/ui/pagination";
import { plural } from "@/lib/plural";
import { distanceKm } from "@/lib/routing";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";

export const metadata: Metadata = {
  title: "Store finder",
  description: "Find a Herbal Holland store near you: opening hours, directions, and whether it offers click & collect, same-day delivery or a dispensary.",
  alternates: { canonical: "/stores" },
};

// A big network shows one province, a page of stores at a time, instead of every store on one page.
const ALL_ON_ONE_PAGE = 60;
const PAGE = 30;

const COORD = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/;

const AND = new Intl.ListFormat("en-GB", { type: "conjunction" });

export default async function StoresPage({ searchParams }: { searchParams: Promise<{ province?: string; page?: string; q?: string; near?: string }> }) {
  const [stores, preferred, sp] = await Promise.all([getRetailStores(), getPreferredStore(), searchParams]);
  const trading = stores.filter((s) => s.status === "ACTIVE");
  const soon = stores.filter((s) => s.status === "OPENING_SOON");
  const openNow = trading.filter((s) => openState(parseHours(s.hours)).open).length;
  const provinces = [...new Set(trading.map((s) => s.province))];
  // What the stores offer, from each store's own settings: what every store offers, then what only some do.
  const offers: [string, number][] = [
    ["click & collect", trading.filter((s) => s.clickCollect).length],
    ["an authorised dispenser for registered patients", trading.filter((s) => s.licences.length > 0).length],
    ["same-day delivery", trading.filter((s) => s.sameDay).length],
  ];
  const one = trading.length === 1;
  const everywhere = offers.filter(([, n]) => n > 0 && n === trading.length).map(([what]) => what);
  const services = [
    everywhere.length ? `${one ? "It offers" : "Every store offers"} ${AND.format(everywhere)}.` : "",
    ...offers.filter(([, n]) => n > 0 && n < trading.length).map(([what, n]) => `${n} of ${plural(trading.length, "store")} ${n === 1 ? "offers" : "offer"} ${what}.`),
    one ? "It's independently owned and run by a local franchisee." : "Each is independently owned and run by a local franchisee.",
  ]
    .filter(Boolean)
    .join(" ");
  // "Near me" sends the shopper's position (rounded) in the URL; else distances are from their chosen store.
  const nearMatch = COORD.exec(sp.near ?? "");
  const here = nearMatch ? { lat: Number(nearMatch[1]), lng: Number(nearMatch[2]) } : null;
  const origin = here ?? (preferred?.lat != null && preferred?.lng != null ? { lat: preferred.lat, lng: preferred.lng } : null);
  const km = (s: (typeof stores)[number]) => (origin && s.lat != null && s.lng != null ? distanceKm(origin, { lat: s.lat, lng: s.lng }) : null);
  const nearby = preferred ? trading.filter((s) => s.id !== preferred.id).map((s) => ({ s, km: km(s) ?? 1e9 })).sort((a, b) => a.km - b.km).slice(0, 3) : [];
  const big = trading.length > ALL_ON_ONE_PAGE;
  const chosen = big ? (provinces.find((p) => p === sp.province) ?? provinces.find((p) => p === preferred?.province) ?? provinces[0]) : null;
  const page = pageParam(sp.page);
  // Search by name, suburb, city or province; nearest first when we know where the shopper is.
  const q = (sp.q ?? "").trim().slice(0, 60);
  const needle = q.toLowerCase();
  const found = q
    ? trading
        .filter((s) => `${s.name} ${s.suburb} ${s.city} ${PROVINCES[s.province as ProvinceCode] ?? s.province}`.toLowerCase().includes(needle))
        .sort((a, b) => (km(a) ?? 1e9) - (km(b) ?? 1e9))
    : here
      ? [...trading].sort((a, b) => (km(a) ?? 1e9) - (km(b) ?? 1e9))
      : null;
  const finding = found != null;
  const params = (n: number) => `/stores?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.near && here ? { near: sp.near } : {}), page: String(n) })}`;

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <div className="eyebrow text-brand-500">Store finder</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{plural(trading.length, "store")}, one windmill</h1>
        <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-300">
          {openNow} open right now. {services}
        </p>
      </div>

      <div className="mt-8 flex max-w-xl gap-2">
        <Form action="/stores" role="search" className="relative flex-1">
          <label htmlFor="stores-q" className="sr-only">
            Search stores by name, suburb or city
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input id="stores-q" name="q" type="search" enterKeyHint="search" defaultValue={q} maxLength={60} placeholder="Suburb, city or store name" className={`${inputClass} h-12 rounded-full pl-11`} />
        </Form>
        <NearMeButton />
      </div>

      {finding && (
        <section className="mt-10" aria-labelledby="found">
          <h2 id="found" className="font-display text-2xl font-semibold text-white">
            {q ? `${found.length} store${found.length === 1 ? "" : "s"} matching “${q}”` : "Nearest to you"}
          </h2>
          {found.length ? (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {found.slice((page - 1) * PAGE, page * PAGE).map((s) => (
                <StoreCard key={s.id} s={s} preferred={s.id === preferred?.id} km={km(s)} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-400">No stores match that. Try a suburb or city nearby, or use Near me.</p>
          )}
          <Pager page={page} pageSize={PAGE} total={found.length} href={params} noun="stores" />
          <Link href="/stores" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-400 hover:underline">
            ← All stores by province
          </Link>
        </section>
      )}

      {!finding && (
      <>
      <nav className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Provinces">
        {provinces.map((p) => (
          <a
            key={p}
            href={big ? `?province=${p}#${p}` : `#${p}`}
            aria-current={p === chosen ? "true" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm hover:border-brand-500 hover:text-white ${p === chosen ? "border-brand-500 text-white" : "border-ink-700 text-ink-200"}`}
          >
            {PROVINCES[p as ProvinceCode]} <span className="tnum text-ink-450">{trading.filter((s) => s.province === p).length}</span>
          </a>
        ))}
        {soon.length > 0 && (
          <a href="#soon" className="shrink-0 rounded-full border border-dashed border-ink-700 px-3.5 py-1.5 text-sm text-ink-300 hover:border-brand-500">
            Opening soon <span className="tnum text-ink-450">{soon.length}</span>
          </a>
        )}
      </nav>

      {preferred && (
        <section className="mt-10" aria-labelledby="yours">
          <h2 id="yours" className="eyebrow mb-3 text-ink-400">
            Your store{nearby.length ? " & nearby" : ""}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StoreCard s={preferred} preferred />
            {nearby.map(({ s, km: d }) => (
              <StoreCard key={s.id} s={s} km={d < 1e9 ? d : null} />
            ))}
          </div>
        </section>
      )}

      {(chosen ? [chosen] : provinces).map((p) => {
        const all = trading.filter((s) => s.province === p);
        const inProv = chosen ? all.slice((page - 1) * PAGE, page * PAGE) : all;
        const cities = [...new Set(inProv.map((s) => s.city))];
        return (
          <section key={p} id={p} className="mt-14 scroll-mt-32" aria-labelledby={`h-${p}`}>
            <h2 id={`h-${p}`} className="font-display text-2xl font-semibold text-white">
              {PROVINCES[p as ProvinceCode]}
            </h2>
            {cities.map((c) => (
              <div key={c} className="mt-5">
                <h3 className="eyebrow mb-3 text-ink-400">{c}</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {inProv
                    .filter((s) => s.city === c)
                    .map((s) => (
                      <StoreCard key={s.id} s={s} preferred={s.id === preferred?.id} km={km(s)} />
                    ))}
                </div>
              </div>
            ))}
            {chosen && <Pager page={page} pageSize={PAGE} total={all.length} href={(n) => `/stores?province=${p}&page=${n}#${p}`} noun="stores" />}
          </section>
        );
      })}
      </>
      )}

      {soon.length > 0 && (
        <section id="soon" className="mt-14 scroll-mt-32" aria-labelledby="h-soon">
          <h2 id="h-soon" className="font-display text-2xl font-semibold text-white">
            Opening soon
          </h2>
          <p className="mt-1 text-sm text-ink-400">Join Rewards and choose one of these as your home store. We&apos;ll let you know the day the doors open.</p>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {soon.map((s) => (
              <StoreCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-14 text-sm text-ink-400">
        Can&apos;t get to a store?{" "}
        <Link href="/shop" className="font-semibold text-brand-400 hover:underline">
          We deliver nationwide
        </Link>
        , with ID (18+) checked on delivery.
      </p>
    </Container>
  );
}
