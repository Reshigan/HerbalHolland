import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { listCatalogue, PAGE_SIZE, SORTS, type SortKey } from "@/server/shop/catalogue";
import { getPreferredStore } from "@/server/shop/context";
import { db } from "@/server/db";
import { ProductGrid } from "@/components/shop/product-card";
import { AutoSubmitSelect } from "@/components/shop/auto-submit";
import { Callout, Chip, Container, Pager, inputClass } from "@/components/shop/ui";
import { buttonClass } from "@/components/ui/button";
import { pageParam } from "@/components/ui/pagination";
import { cn } from "@/lib/cn";

type SP = { category?: string; mood?: string; sort?: string; min?: string; max?: string; q?: string; page?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = sp.category ? await db.category.findUnique({ where: { slug: sp.category }, select: { name: true, blurb: true } }) : null;
  const title = cat ? `${cat.name}` : "Shop the range";
  return {
    title,
    description: cat?.blurb ?? "CBD wellness, accessories, grow and apparel — lab-tested, batch-traceable, delivered nationwide or ready to collect in store. Adults 18+.",
    alternates: { canonical: sp.category ? `/shop?category=${sp.category}` : "/shop" },
  };
}

const num = (v?: string) => (v && /^\d{1,6}$/.test(v) ? Number(v) : undefined);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function ShopPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [customer, store] = await Promise.all([getCustomer(), getPreferredStore()]);
  const sort = (SORTS.find((s) => s.key === sp.sort)?.key ?? "featured") as SortKey;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const query = { category: sp.category || undefined, mood: sp.mood || undefined, sort, min: num(sp.min), max: num(sp.max), q: q || undefined, page: pageParam(sp.page) };
  const [res, cat] = await Promise.all([
    listCatalogue("public", query, { tier: customer?.tier ?? null, storeId: store?.id, storeName: store?.name }),
    query.category ? db.category.findUnique({ where: { slug: query.category } }) : null,
  ]);
  const licensedCategory = !!cat && !res.categories.some((c) => c.slug === cat.slug);

  const href = (o: Partial<Record<keyof SP, string | undefined>>) => {
    const p = new URLSearchParams();
    const merged = { category: query.category, mood: query.mood, sort: sort === "featured" ? undefined : sort, min: sp.min, max: sp.max, q: q || undefined, ...o };
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

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="eyebrow text-brand-500">Shop</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{cat && !licensedCategory ? cat.name : query.mood ? `For ${query.mood}` : "The range"}</h1>
          <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-300">
            {cat && !licensedCategory ? cat.blurb : "CBD wellness, accessories, grow and apparel. Every consumable lab-tested and traceable by batch."}
            {store && (
              <>
                {" "}Showing stock at <strong className="font-semibold text-white">{store.name}</strong>.
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
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input id="shop-q" name="q" defaultValue={q} placeholder="Search oils, grinders, tees…" className={cn(inputClass, "h-12 rounded-full pl-11")} />
        </Form>
      </div>

      {/* Categories */}
      <div className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Categories">
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
          <span className="text-ink-400">{res.total} result{res.total === 1 ? "" : "s"} for</span>
          {active.map((a) => (
            <Link key={a.label} href={a.clear} scroll={false} className="inline-flex items-center gap-1.5 rounded-full bg-ink-850 py-1 pl-3 pr-2 text-ink-100 hover:bg-ink-800" aria-label={`Remove filter ${a.label}`}>
              {a.label} <X className="h-3.5 w-3.5 text-ink-400" />
            </Link>
          ))}
          <Link href="/shop" scroll={false} className="ml-1 text-xs font-semibold text-brand-400 hover:underline">
            Clear all
          </Link>
        </div>
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
            <ProductGrid items={res.items} />
            <Pager page={query.page} pageSize={PAGE_SIZE} total={res.total} href={(p) => href({ page: String(p) })} noun="products" />
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-ink-800 px-6 py-20 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-600" />
            <h2 className="mt-4 font-display text-xl font-semibold text-white">Nothing matches those filters</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-400">Try a different mood or price range — or ask the team at your store; they&apos;re happy to help.</p>
            <Link href="/shop" className={buttonClass("outline-dark", "md", "mt-6")}>
              Clear filters
            </Link>
          </div>
        )}
      </div>
    </Container>
  );

  function Filters() {
    return (
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Mood">
          <span className="self-center pr-1 text-xs font-semibold uppercase tracking-wider text-ink-500">Mood</span>
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
              {SORTS.map((s) => (
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
