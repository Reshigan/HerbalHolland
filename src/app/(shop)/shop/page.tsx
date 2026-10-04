import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { ArrowRight, BookOpen, FlaskConical, Search, ShieldCheck, SlidersHorizontal, Store, X } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { listCatalogue, PAGE_SIZE, SORTS, type SortKey } from "@/server/shop/catalogue";
import { getPreferredStore, getStoreFootprint } from "@/server/shop/context";
import { getClasses } from "@/server/shop/access";
import { dispensaryHasMatch, storeMatching } from "@/server/shop/search";
import { db } from "@/server/db";
import { ProductGrid } from "@/components/shop/product-card";
import { AutoSubmitSelect } from "@/components/shop/auto-submit";
import { RecentSearches } from "@/components/shop/recent-searches";
import { Sky } from "@/components/shop/sky";
import { Callout, Chip, Container, Pager, inputClass } from "@/components/shop/ui";
import { JsonLd } from "@/components/shop/json-ld";
import { articleBySlug } from "@/components/shop/learn/articles";
import { buttonClass } from "@/components/ui/button";
import { pageParam } from "@/components/ui/pagination";
import { breadcrumbJsonLd, LOCALE, metaDescription, pageTitle, SITE_NAME, siteUrl } from "@/lib/seo";
import { zarWhole } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { RegClass } from "@/lib/compliance";

type SP = { category?: string; mood?: string; sort?: string; min?: string; max?: string; q?: string; page?: string; focus?: string };

const num = (v?: string) => (v && /^\d{1,6}$/.test(v) ? Number(v) : undefined);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const RANGE = "CBD wellness, accessories, grow and apparel — lab-tested, batch-traceable, delivered nationwide or ready to collect in store. Adults 18+.";

// Why this category: one plain sentence per class in it (approved facts, never a health claim), and the guide to read.
const CLASS_STORY: Partial<Record<RegClass, string>> = {
  CBD: "CBD supplements are Schedule 0: at most 20 mg of CBD a day and 600 mg in a pack, with the legal basis and the daily serving on every product page.",
  CBD_FOOD: "CBD food and drink carries only the CBD naturally in its hemp ingredients (under 0.0075%), with ingredients and allergens on every pack.",
  CBD_TOPICAL: "Creams and balms are for the skin only — patch-test first.",
  HEMP: "Hemp products for adults 18+, with the same batch traceability as everything else we sell.",
  SUPPLEMENT: "Supplements carry no cannabis: the serving is on the label, and they work alongside a varied diet.",
  ACCESSORY: "Tools and storage that last. Where the law asks, tobacco-related items are sold in store only.",
  APPAREL: "Made to order by our merch partner in South Africa and couriered to your door.",
  GROW: "Soil, pots and tools for growing at home, within the law.",
};
const CLASS_GUIDE: Partial<Record<RegClass, string>> = { CBD: "cbd-schedule-0", CBD_FOOD: "cbd-schedule-0", CBD_TOPICAL: "cbd-schedule-0", HEMP: "reading-lab-results", SUPPLEMENT: "reading-lab-results", GROW: "responsible-use" };
const CONSUMABLE: RegClass[] = ["CBD", "CBD_FOOD", "CBD_TOPICAL", "HEMP", "SUPPLEMENT", "THC"];

/** One indexable URL per category (or mood); searches and filtered/sorted views canonicalise to it and stay out of the index. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = sp.category ? await db.category.findUnique({ where: { slug: sp.category }, select: { name: true, blurb: true } }) : null;
  const mood = !cat && sp.mood && /^[a-z]{1,20}$/.test(sp.mood) ? sp.mood : null;
  const title = cat ? cat.name : mood ? `For ${mood}` : "Shop the range";
  const description = cat ? metaDescription(cat.blurb, `${cat.name} from ${SITE_NAME}: ${RANGE}`) : mood ? metaDescription(`Everyday CBD and hemp rituals for ${mood}, grouped by the moment they're made for.`, RANGE) : RANGE;
  const path = cat ? `/shop?category=${sp.category}` : mood ? `/shop?mood=${mood}` : "/shop";
  const filtered = !!(sp.q || sp.min || sp.max || sp.sort || (sp.category && !cat));
  return {
    title: pageTitle(title),
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, type: "website", url: path, siteName: SITE_NAME, locale: LOCALE },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [customer, store, footprint] = await Promise.all([getCustomer(), getPreferredStore(), getStoreFootprint()]);
  const q = (sp.q ?? "").trim().slice(0, 60);
  // A search is ranked by best match unless another sort is chosen; without one there is nothing to match.
  const defaultSort: SortKey = q ? "relevance" : "featured";
  const sort = (SORTS.find((s) => s.key === sp.sort && (q || s.key !== "relevance"))?.key ?? defaultSort) as SortKey;
  const query = { category: sp.category || undefined, mood: sp.mood || undefined, sort, min: num(sp.min), max: num(sp.max), q: q || undefined, page: pageParam(sp.page) };
  const [res, cat] = await Promise.all([
    listCatalogue("public", query, { tier: customer?.tier ?? null, storeId: store?.id, storeName: store?.name }),
    query.category ? db.category.findUnique({ where: { slug: query.category } }) : null,
  ]);
  // Nothing found: perhaps it's a licensed medicine (said without naming it), or a store's name.
  const [inDispensary, storeHit] = q && !res.total ? await Promise.all([getClasses().then((c) => dispensaryHasMatch(q, c)), storeMatching(q)]) : [false, null];
  const licensedCategory = !!cat && !res.categories.some((c) => c.slug === cat.slug);
  const crumbs = cat && !licensedCategory ? [{ name: "Shop", path: "/shop" }, { name: cat.name, path: `/shop?category=${cat.slug}` }] : null;
  const catCount = cat ? (res.categories.find((c) => c.slug === cat.slug)?.count ?? 0) : 0;

  const href = (o: Partial<Record<keyof SP, string | undefined>>) => {
    const p = new URLSearchParams();
    const merged = { category: query.category, mood: query.mood, sort: sort === defaultSort ? undefined : sort, min: sp.min, max: sp.max, q: q || undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/shop?${s}` : "/shop";
  };
  const active = [
    query.category && { label: cat?.name ?? query.category, clear: href({ category: undefined }) },
    query.mood && { label: cap(query.mood), clear: href({ mood: undefined }) },
    (query.min != null || query.max != null) && { label: `R${query.min ?? 0} – ${query.max != null ? `R${query.max}` : "any"}`, clear: href({ min: undefined, max: undefined }) },
    q && { label: `“${q}”`, clear: href({ q: undefined }) },
  ].filter(Boolean) as { label: string; clear: string }[];

  // The editorial block for a category: its line, what its classes are (in plain words), the range, and the guide to read.
  const catClasses = cat && !licensedCategory && !q && !query.mood && query.page === 1 ? [...new Set(res.items.map((i) => i.regClass as RegClass))] : [];
  const story = catClasses.map((c) => CLASS_STORY[c]).filter((s): s is string => !!s);
  const guide = catClasses.map((c) => CLASS_GUIDE[c]).find(Boolean);
  const article = guide ? articleBySlug(guide) : null;
  const consumable = catClasses.some((c) => CONSUMABLE.includes(c));
  const prices = res.items.map((i) => i.priceCents);
  const heroTitle = q ? `Results for “${q}”` : cat && !licensedCategory ? cat.name : query.mood ? `For ${query.mood}` : "The range";
  const heroLine = cat && !licensedCategory ? cat.blurb : query.mood ? "Everyday CBD and hemp rituals for the moment they're made for." : "CBD wellness, accessories, grow and apparel. Every consumable lab-tested and traceable by batch.";

  return (
    <>
      {crumbs && <JsonLd data={breadcrumbJsonLd(siteUrl(), crumbs)} />}
      {/* The hero: the site's sky over the hills, with the category's name and line, and the search. */}
      <Sky time={cat ? "dusk" : "night"} className="border-b border-ink-850">
        {/* With a search the hero is compact, so results start above the fold on a phone. */}
        <Container className={q ? "pb-6 pt-6 sm:pb-8 sm:pt-8" : "pb-14 pt-10 sm:pb-16 sm:pt-14"}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="eyebrow text-brand-500">{cat && !licensedCategory ? "Shop · category" : query.mood ? "Shop · by mood" : "Shop"}</div>
              <h1 className={cn("mt-2 break-words font-display font-semibold tracking-tight text-white", q ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl lg:text-6xl")}>{heroTitle}</h1>
              <p className={cn("mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink-200", q && "hidden")}>
                {heroLine}
                {store && (
                  <>
                    {" "}
                    Showing stock at <strong className="font-semibold text-white">{store.name}</strong>.
                  </>
                )}
              </p>
            </div>
            <Form action="/shop" className="relative w-full lg:w-80" role="search">
              {query.category && <input type="hidden" name="category" value={query.category} />}
              {query.mood && <input type="hidden" name="mood" value={query.mood} />}
              <label htmlFor="shop-q" className="sr-only">
                Search the range
              </label>
              <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input id="shop-q" name="q" type="search" enterKeyHint="search" autoFocus={sp.focus === "1"} defaultValue={q} placeholder="Search oils, grinders, tees…" className={cn(inputClass, "h-12 rounded-full border-ink-600 bg-ink-950/80 pl-11 backdrop-blur")} />
            </Form>
          </div>
        </Container>
      </Sky>

      <Container className="pt-6">
        {/* Recent searches stay in the member's browser; visitors get none (nothing to remember them by). */}
        {customer && <RecentSearches current={q} className="flex flex-wrap items-center gap-2" />}
        {res.suggestion && (
          <p className="mt-4 text-sm text-ink-300" data-testid="did-you-mean">
            Did you mean{" "}
            <Link href={href({ q: res.suggestion, page: undefined })} className="font-semibold text-brand-300 underline">
              {res.suggestion}
            </Link>
            ?
          </p>
        )}

        {/* Categories */}
        <div className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Categories">
          <Chip href={href({ category: undefined, page: undefined })} active={!query.category}>
            All
          </Chip>
          {res.categories.map((c) => (
            <Chip key={c.slug} href={href({ category: c.slug, page: undefined })} active={query.category === c.slug} count={c.count}>
              {c.name}
            </Chip>
          ))}
          <Chip href="/dispensary" className="border-dashed">
            <ShieldCheck className="h-4 w-4 text-brand-500" /> Dispensary
          </Chip>
        </div>

        {/* Mood, price, sort */}
        <details className="group mt-4 rounded-2xl border border-ink-850 bg-ink-900/40 open:bg-ink-900/60 sm:open:bg-transparent lg:hidden" open={!!(query.mood || query.min || query.max)}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-100 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-4 w-4 text-brand-500" /> Mood, price &amp; sort
            <span className="ml-auto text-xs font-medium text-ink-400 group-open:hidden">Show</span>
          </summary>
          <div className="border-t border-ink-850 p-4">
            <Filters />
          </div>
        </details>
        <div className="mt-4 hidden lg:block">
          <Filters />
        </div>

        {active.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-400">
              {res.total} result{res.total === 1 ? "" : "s"} for
            </span>
            {active.map((a) => (
              <Link key={a.label} href={a.clear} scroll={false} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink-850 py-1 pl-3.5 pr-3 text-ink-100 hover:bg-ink-800 lg:min-h-8" aria-label={`Remove filter ${a.label}`}>
                {a.label} <X className="h-3.5 w-3.5 text-ink-400" />
              </Link>
            ))}
            <Link href="/shop" scroll={false} className="ml-1 inline-flex min-h-11 items-center px-2 text-xs font-semibold text-brand-400 hover:underline lg:min-h-8">
              Clear all
            </Link>
          </div>
        )}

        {/* Why this category */}
        {cat && !licensedCategory && cat.blurb && catClasses.length > 0 && (
          <section aria-labelledby="why" className="hh-beads-foot relative mt-8 overflow-hidden rounded-[2rem] border border-ink-800 bg-ink-900/60">
            <div className="grid grid-cols-1 gap-6 p-6 pb-8 sm:p-8 sm:pb-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div>
                <div className="eyebrow text-brand-500">Why {cat.name.toLowerCase()}</div>
                <h2 id="why" className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">
                  {cat.blurb}
                </h2>
                <ul className="mt-4 space-y-2 text-[0.95rem] leading-relaxed text-ink-300">
                  {story.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  {consumable && (
                    <li className="flex items-start gap-2 text-ink-200">
                      <FlaskConical className="mt-1 h-4 w-4 shrink-0 text-brand-500" /> Every consumable is lab-tested and traceable by batch: scan the pack for its certificate.
                    </li>
                  )}
                </ul>
              </div>
              <div className="grid grid-cols-2 content-start gap-3 text-sm">
                <dl className="contents">
                <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-ink-400">Products</dt>
                  <dd className="tnum mt-1 font-display text-2xl font-semibold text-white">{catCount}</dd>
                </div>
                {prices.length > 0 && (
                  <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-ink-400">Prices</dt>
                    <dd className="tnum mt-1 font-display text-2xl font-semibold text-white">
                      {zarWhole(Math.min(...prices))}
                      {prices.length > 1 && Math.min(...prices) !== Math.max(...prices) ? ` – ${zarWhole(Math.max(...prices))}` : ""}
                    </dd>
                  </div>
                )}
                <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-ink-400">Collect</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-display text-lg font-semibold text-white">
                    <Store className="h-4 w-4 text-brand-500" /> {footprint.trading} stores
                  </dd>
                </div>
                </dl>
                {article && (
                  <Link href={`/learn/${article.slug}`} className="group col-span-2 flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-950/60 p-4 transition hover:border-brand-500/60 sm:col-span-1">
                    <BookOpen className="h-5 w-5 shrink-0 text-brand-500" />
                    <span className="min-w-0">
                      <span className="block text-[0.68rem] font-semibold uppercase tracking-wider text-ink-400">Read first</span>
                      <span className="block truncate font-semibold text-white group-hover:text-brand-200">{article.title}</span>
                    </span>
                    <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-300" />
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="mt-8">
          {licensedCategory ? (
            <Callout tone="brand" icon={<ShieldCheck className="h-5 w-5" />} title={`${cat!.name} is in the dispensary`}>
              Licensed products are medicines and are only available to registered patients with a SAHPRA authorisation.{" "}
              <Link href="/dispensary" className="font-semibold text-white underline">
                How the dispensary works
              </Link>
            </Callout>
          ) : res.items.length ? (
            <>
              <h2 className="sr-only">Products</h2>
              <ProductGrid items={res.items} />
              <Pager page={query.page} pageSize={PAGE_SIZE} total={res.total} href={(p) => href({ page: String(p) })} noun="products" />
            </>
          ) : (
            <>
            {inDispensary && (
              <Callout tone="brand" icon={<ShieldCheck className="h-5 w-5" />} title="This may be in the dispensary" className="mb-4">
                Licensed medicines are for registered patients with a SAHPRA authorisation, so they aren&apos;t listed in the shop.{" "}
                <Link href="/dispensary" className="font-semibold text-white underline">
                  How the dispensary works
                </Link>
              </Callout>
            )}
            {storeHit && (
              <Callout tone="info" icon={<Store className="h-5 w-5" />} className="mb-4">
                <Link href={`/stores/${storeHit.slug}`} className="font-semibold text-white underline">
                  Looking for our {storeHit.name} store?
                </Link>
              </Callout>
            )}
            <div className="rounded-3xl border border-dashed border-ink-800 px-6 py-20 text-center">
              <Search className="mx-auto h-8 w-8 text-ink-600" />
              <h2 className="mt-4 font-display text-xl font-semibold text-white">{q ? `Nothing matches “${q}”` : "Nothing matches those filters"}</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-400">{q ? "Check the spelling, try fewer words, or search by what it is — oil, cream, coffee, grinder — and its size, like 600mg or 30ml." : "Try a different mood or price range — or ask the team at your store; they're happy to help."}</p>
              <Link href="/shop" className={buttonClass("outline-dark", "md", "mt-6")}>
                Clear filters
              </Link>
            </div>
            </>
          )}
        </div>
      </Container>
    </>
  );

  function Filters() {
    return (
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Mood">
          <span className="self-center pr-1 text-xs font-semibold uppercase tracking-wider text-ink-450">Mood</span>
          {res.moods.map((m) => (
            <Chip key={m.key} href={href({ mood: query.mood === m.key ? undefined : m.key, page: undefined })} active={query.mood === m.key}>
              {cap(m.key)}
            </Chip>
          ))}
        </div>
        <Form action="/shop" scroll={false} className="flex flex-wrap items-end gap-2">
          {query.category && <input type="hidden" name="category" value={query.category} />}
          {query.mood && <input type="hidden" name="mood" value={query.mood} />}
          {q && <input type="hidden" name="q" value={q} />}
          <label className="flex w-24 flex-col text-xs font-semibold text-ink-400">
            Min R
            <input name="min" type="number" inputMode="numeric" min={0} step={10} defaultValue={sp.min} placeholder={String(res.priceBounds.min)} className={cn(inputClass, "mt-1 h-10 text-sm")} />
          </label>
          <label className="flex w-24 flex-col text-xs font-semibold text-ink-400">
            Max R
            <input name="max" type="number" inputMode="numeric" min={0} step={10} defaultValue={sp.max} placeholder={String(res.priceBounds.max)} className={cn(inputClass, "mt-1 h-10 text-sm")} />
          </label>
          <label className="flex w-48 flex-col text-xs font-semibold text-ink-400">
            Sort
            <AutoSubmitSelect name="sort" defaultValue={sort} className={cn(inputClass, "mt-1 h-10 cursor-pointer text-sm")}>
              {SORTS.filter((s) => q || s.key !== "relevance").map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
          <button className={buttonClass("outline-dark", "md", "h-10")}>Apply</button>
        </Form>
      </div>
    );
  }
}
