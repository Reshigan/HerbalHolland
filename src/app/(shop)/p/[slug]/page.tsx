import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, ChevronRight, FlaskConical, Info, MapPin, Package, ShieldCheck, Sparkles, Store, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { quote } from "@/server/pricing";
import { availability, availKey } from "@/server/inventory";
import { getClasses, getDispensaryAccess } from "@/server/shop/access";
import { cardsWhere, currentBatch, dealsFor, directDeal, getNetwork, getPricing, getProductBySlug, productReviews, rewardsPrice, storesWithStock, withDeal } from "@/server/shop/catalogue";
import { getPreferredStore } from "@/server/shop/context";
import { tierMeta } from "@/server/shop/club";
import { openState, parseHours } from "@/server/shop/hours";
import { requestStockAlert, submitReview } from "./actions";
import { ProductArt } from "@/components/product/art";
import { AddToBag } from "@/components/shop/add-to-bag";
import { DispensaryGate } from "@/components/shop/dispensary-gate";
import { ProductGrid } from "@/components/shop/product-card";
import { NotifyMe, ReviewForm } from "@/components/shop/product-forms";
import { asLab, asTerps, range, SafetyResult, SAFETY_PANELS, TerpeneBars } from "@/components/shop/product-parts";
import { Callout, Container, Panel, Price, Stars, Tag } from "@/components/shop/ui";
import { describePromo, type PromoInput } from "@/lib/promotions";
import { REG_CLASS_LABEL } from "@/lib/compliance";
import { fmtDate } from "@/lib/format";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

type Params = { slug: string };
type SP = { v?: string; reviews?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const [p, classes] = await Promise.all([getProductBySlug(slug), getClasses()]);
  if (!p || p.status !== "ACTIVE") return { title: "Not found" };
  // Licensed medicines are never advertised: generic title, kept out of search.
  if (classes.licensed.includes(p.regClass)) return { title: "Dispensary", robots: { index: false, follow: false } };
  const description = `${p.tagline ?? ""} ${p.description}`.trim().slice(0, 158);
  return { title: p.name, description, alternates: { canonical: `/p/${p.slug}` }, openGraph: { title: `${p.name} · Herbal Holland`, description, type: "website" } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SP> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "ACTIVE" || !product.variants.length) notFound();
  const [classes, settings, customer, store] = await Promise.all([getClasses(), getSettings(), getCustomer(), getPreferredStore()]);
  const licensed = classes.licensed.includes(product.regClass);
  const access = licensed ? await getDispensaryAccess() : null;
  if (access && !access.allowed) return <DispensaryGate access={access} next={`/p/${slug}`} />;

  const variant = product.variants.find((v) => v.id === sp.v) ?? product.variants[0];
  const net = await getNetwork();
  const [quotes, batch, stores, reviews, networkAvail, pricing, alert, bought, reviewed] = await Promise.all([
    Promise.all(product.variants.map((v) => quote({ channel: "ONLINE", items: [{ variantId: v.id, qty: 1 }], customerId: customer?.id }))),
    currentBatch(variant.id, store?.id),
    storesWithStock([variant.id], store),
    // No testimonials for medicines (Medicines Act advertising rules): licensed products show no reviews.
    licensed ? { avg: 0, count: 0, rows: [], distribution: [] } : productReviews(product.id, sp.reviews === "all" ? 60 : 6),
    availability(net.all, [variant.id]),
    getPricing(customer?.tier ?? null),
    customer ? db.stockAlert.findUnique({ where: { customerId_variantId: { customerId: customer.id, variantId: variant.id } } }) : null,
    customer ? db.saleLine.findFirst({ where: { sale: { customerId: customer.id, kind: "SALE" }, variant: { productId: product.id } }, select: { id: true } }) : null,
    customer ? db.review.findUnique({ where: { productId_customerId: { productId: product.id, customerId: customer.id } }, select: { id: true } }) : null,
  ]);

  const q = quotes[product.variants.indexOf(variant)];
  const line = q.lines[0];
  // Members pay their instant tier price; the walk-in shelf price is shown struck through.
  const walkIn = Math.max(line.shelfCents, line.unitPriceCents);
  const was = walkIn > line.totalCents ? walkIn : null;
  const tierName = customer ? tierMeta(customer.tier).name : null;
  const priceNote = [
    line.memberSavingsCents > 0 && tierName ? `${tierName} price` : !customer ? null : line.priceRule,
    line.discountCents ? q.applied.find((a) => a.discountCents > 0)?.name : null,
  ].filter(Boolean).join(" · ");
  const guestRewards = customer ? null : rewardsPrice(variant, product.regClass, pricing);
  const rewardsCents = guestRewards != null ? withDeal(guestRewards, directDeal(product, pricing)) : null;
  const channels = settings.compliance.channels;
  const inStoreOnly = settings.compliance.tobaccoBillMode && product.tobaccoRelated;
  const canShip = !licensed && !inStoreOnly && channels.COURIER.includes(product.regClass);
  const canCollect = !inStoreOnly && channels.COLLECT.includes(product.regClass);
  const networkQty = net.all.reduce((s, id) => s + Math.max(0, networkAvail.get(availKey(id, variant.id))?.available ?? 0), 0);
  const here = store ? stores.find((x) => x.store.id === store.id) : undefined;
  const hereQty = here?.qty[variant.id] ?? 0;
  const withStock = stores.filter((x) => (x.qty[variant.id] ?? 0) > 0);
  const buyable = !inStoreOnly && (licensed ? withStock.length > 0 : networkQty > 0);

  const deals = licensed ? [] : dealsFor(product, pricing);
  // Deal nudges for this product only: never on medicines, and a multi-buy is only suggested when this product counts towards it.
  const suggestions = licensed
    ? []
    : q.suggestions.filter((s) => {
        const promo = pricing.promos.find((x) => x.id === s.promoId);
        if (promo?.kind !== "MULTIBUY") return true;
        return (!s.productIds.length && !s.categoryIds.length) || s.productIds.includes(product.id) || s.categoryIds.includes(product.categoryId);
      });
  const suggestionIds = suggestions.flatMap((s) => s.productIds);
  const suggestionCats = suggestions.flatMap((s) => s.categoryIds);
  const who = { tier: customer?.tier ?? null, storeId: store?.id, storeName: store?.name };
  const complete =
    !licensed && (suggestionIds.length || suggestionCats.length)
      ? (await cardsWhere({ OR: [{ id: { in: suggestionIds } }, { categoryId: { in: suggestionCats } }], NOT: { id: product.id } }, classes.public, who)).slice(0, 4)
      : [];
  const related = complete.length ? [] : (await cardsWhere({ categoryId: product.categoryId, NOT: { id: product.id } }, licensed ? classes.licensed : classes.public, who)).slice(0, 4);

  const lab = asLab(batch?.labResults);
  const terps = lab?.terpenes?.length ? lab.terpenes : asTerps(product.terpenes);
  const tested = !!batch?.labName;
  const potency = [
    { label: "THC", value: batch?.thc != null && product.regClass !== "CBD" ? `${batch.thc}%` : range(product.thcMin, product.thcMax) },
    { label: "CBD", value: batch?.cbd != null ? `${batch.cbd}%` : range(product.cbdMin, product.cbdMax) },
  ].filter((p) => p.value);

  const jsonLd = !licensed && {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: variant.sku,
    brand: { "@type": "Brand", name: product.brand },
    category: product.category.name,
    offers: product.variants.map((v, i) => ({
      "@type": "Offer",
      sku: v.sku,
      name: v.name,
      priceCurrency: "ZAR",
      price: (quotes[i].lines[0]?.totalCents ?? v.priceCents) / 100,
      availability: networkQty > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    })),
    ...(reviews.count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: reviews.avg.toFixed(1), reviewCount: reviews.count } } : {}),
  };

  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      <Container className="pt-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-400">
          <Link href={licensed ? "/dispensary" : "/shop"} className="hover:text-white">
            {licensed ? "Dispensary" : "Shop"}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href={licensed ? `/dispensary?category=${product.category.slug}` : `/shop?category=${product.category.slug}`} className="hover:text-white">
            {product.category.name}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="truncate text-ink-200" aria-current="page">
            {product.name}
          </span>
        </nav>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14">
          {/* Art */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="relative overflow-hidden rounded-[2rem] border border-ink-800">
              <ProductArt slug={product.slug} strain={product.strain} regClass={product.regClass} label={product.name} className="aspect-square w-full" />
              <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                {product.heritage && <Tag tone="orange" className="bg-ink-950/70 backdrop-blur">Heritage</Tag>}
                {product.line && product.line !== "HERITAGE" && <Tag className="bg-ink-950/70 backdrop-blur">{product.line.charAt(0) + product.line.slice(1).toLowerCase()} line</Tag>}
              </div>
            </div>
            {potency.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {potency.map((p) => (
                  <div key={p.label} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-3">
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-ink-400">{p.label}</dt>
                    <dd className="tnum mt-1 font-display text-lg font-semibold text-white">{p.value}</dd>
                  </div>
                ))}
                {product.strain && product.regClass === "THC" && (
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-3">
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-ink-400">Type</dt>
                    <dd className="mt-1 font-display text-lg font-semibold capitalize text-white">{product.strain.toLowerCase()}</dd>
                  </div>
                )}
                {product.cbdMgPerPack != null && (
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/60 p-3">
                    <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-ink-400">CBD per pack</dt>
                    <dd className="tnum mt-1 font-display text-lg font-semibold text-white">{product.cbdMgPerPack} mg</dd>
                  </div>
                )}
              </dl>
            )}
          </div>

          {/* Buy box */}
          <div>
            <div className="eyebrow text-oranje-500">
              {product.category.name}
              {product.origin && <span className="text-ink-400"> · {product.origin}</span>}
            </div>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">{product.name}</h1>
            {product.tagline && <p className="mt-3 text-lg text-ink-300">{product.tagline}</p>}
            {reviews.count > 0 && (
              <a href="#reviews" className="mt-4 inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white">
                <Stars value={reviews.avg} /> <span className="tnum font-semibold text-white">{reviews.avg.toFixed(1)}</span> · {reviews.count} verified review{reviews.count === 1 ? "" : "s"}
              </a>
            )}

            <div className="mt-8">
              <Price cents={line.totalCents} was={was} size="lg" />
              <p className="mt-1.5 text-sm text-ink-400">
                {priceNote ? <span className="font-semibold text-oranje-300">{priceNote} · </span> : null}
                {variant.name} · incl. VAT
                {variant.grams && licensed ? ` · ${variant.grams} g dried-flower equivalent` : ""}
              </p>
              {rewardsCents != null && (
                <Link href={`/club/join?next=${encodeURIComponent(`/p/${product.slug}?v=${variant.id}`)}`} className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-oranje-500/40 bg-oranje-500/10 px-3.5 py-2 text-sm text-oranje-100 hover:border-oranje-500">
                  <span>
                    <strong className="tnum text-white">{zar(rewardsCents)}</strong> with Herbal Holland Rewards
                  </span>
                  <span className="font-semibold text-oranje-300">Join free →</span>
                </Link>
              )}
            </div>

            {product.variants.length > 1 && (
              <fieldset className="mt-6">
                <legend className="mb-2 text-[0.8rem] font-semibold text-ink-200">{product.category.slug === "apparel" ? "Size" : "Size / pack"}</legend>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v, i) => {
                    const on = v.id === variant.id;
                    return (
                      <Link
                        key={v.id}
                        href={`/p/${product.slug}?v=${v.id}`}
                        scroll={false}
                        replace
                        aria-current={on ? "true" : undefined}
                        className={cn("flex min-h-12 flex-col justify-center rounded-2xl border px-4 py-2 transition", on ? "border-oranje-500 bg-oranje-500/10" : "border-ink-700 hover:border-ink-500")}
                      >
                        <span className={cn("text-sm font-semibold", on ? "text-white" : "text-ink-100")}>{v.name}</span>
                        <span className="tnum text-xs text-ink-400">{zar(quotes[i].lines[0]?.totalCents ?? v.priceCents)}</span>
                      </Link>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="mt-6">
              {inStoreOnly ? (
                <Callout tone="warn" icon={<Store className="h-5 w-5" />} title="In-store only">
                  Under current tobacco-products rules this item can only be bought in store.
                </Callout>
              ) : buyable ? (
                <AddToBag variantId={variant.id} name={`${product.name} · ${variant.name}`} label={licensed ? "Add to dispensary order" : "Add to bag"} />
              ) : (
                <NotifyMe action={requestStockAlert.bind(null, variant.id)} signedIn={!!customer} next={`/p/${product.slug}?v=${variant.id}`} already={!!alert && !alert.notifiedAt} />
              )}
            </div>

            {/* Availability */}
            <Panel className="mt-6 divide-y divide-ink-800">
              {canCollect && (
                <div className="flex items-start gap-3 p-4">
                  <Store className={cn("mt-0.5 h-5 w-5 shrink-0", hereQty > 0 ? "text-leaf-500" : "text-ink-500")} />
                  <div className="min-w-0 flex-1 text-sm">
                    {store ? (
                      hereQty > 0 ? (
                        <>
                          <div className="font-semibold text-white">
                            In stock at {store.name}
                            {hereQty <= 3 && <span className="ml-2 font-medium text-amber-100">· only {hereQty} left</span>}
                          </div>
                          <div className="text-ink-400">Click &amp; collect — we&apos;ll message you when it&apos;s ready. {openState(parseHours(store.hours)).label}.</div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-white">Not in stock at {store.name}</div>
                          <div className="text-ink-400">{withStock.length ? `Available to collect from ${withStock.length} other store${withStock.length === 1 ? "" : "s"} — see below.` : "Not available to collect right now."}</div>
                        </>
                      )
                    ) : (
                      <>
                        <div className="font-semibold text-white">{withStock.length ? `Collect from ${withStock.length} store${withStock.length === 1 ? "" : "s"}` : "Not available to collect right now"}</div>
                        <div className="text-ink-400">
                          <Link href="/stores" className="font-medium text-oranje-400 hover:underline">
                            Choose your store
                          </Link>{" "}
                          to see what&apos;s on the shelf.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              {canShip && (
                <div className="flex items-start gap-3 p-4">
                  <Truck className={cn("mt-0.5 h-5 w-5 shrink-0", networkQty > 0 ? "text-leaf-500" : "text-ink-500")} />
                  <div className="text-sm">
                    <div className="font-semibold text-white">{networkQty > 0 ? "Ships nationwide" : "Out of stock for delivery"}</div>
                    <div className="text-ink-400">
                      {store?.sameDay && hereQty > 0 && channels.SAME_DAY.includes(product.regClass) ? `Same-day delivery from ${store.name} when you order by ${settings.ecommerce.sameDayCutoffHour}:00. ` : ""}
                      Courier in 2–4 working days, free over {zar(settings.ecommerce.freeDeliveryOverCents)}. ID (18+) checked on delivery.
                    </div>
                  </div>
                </div>
              )}
              {licensed && (
                <div className="flex items-start gap-3 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-oranje-500" />
                  <div className="text-sm">
                    <div className="font-semibold text-white">Collect only · dispensed by our pharmacist</div>
                    <div className="text-ink-400">
                      Handed over after an ID check, within your authorised monthly quantity
                      {access?.allowed && access.mode === "MEDICAL" ? ` (${Math.round(access.remainingGrams * 10) / 10} g left this month)` : ""}. No promotions or points apply to medicines.
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            {deals.length > 0 && (
              <div className="mt-6 space-y-2">
                {deals.map((d) => (
                  <div key={d.id} className="flex items-start gap-3 rounded-2xl border border-oranje-500/35 bg-oranje-500/[0.06] p-4">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-oranje-400" />
                    <div className="text-sm">
                      <div className="font-semibold text-white">{d.name}</div>
                      <div className="text-ink-300">
                        {describePromo(d as unknown as PromoInput)}
                        {d.description && ` — ${d.description}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 space-y-4 text-[1.02rem] leading-relaxed text-ink-300">
              <p>{product.description}</p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="mt-20 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
          <div className="space-y-14">
            {tested && batch && (
              <section aria-labelledby="lab">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="eyebrow text-oranje-500">Lab &amp; batch</div>
                    <h2 id="lab" className="mt-2 font-display text-2xl font-semibold text-white">
                      Current batch {batch.code}
                    </h2>
                  </div>
                  <Link href={`/batch/${batch.code}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-oranje-400 hover:underline">
                    Full lab certificate <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <Panel className="mt-5 grid grid-cols-1 gap-6 p-5 sm:grid-cols-2">
                  <dl className="space-y-2.5 text-sm">
                    {[
                      ["Tested by", batch.labName],
                      ["Certificate", batch.coaRef],
                      ["Packed", fmtDate(batch.packedAt)],
                      ["Best before", batch.expiresAt ? fmtDate(batch.expiresAt) : "—"],
                      ["Grown / made by", batch.supplier],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <dt className="text-ink-400">{k}</dt>
                        <dd className="text-right font-medium text-ink-100">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="space-y-2">
                    {SAFETY_PANELS.filter((s) => lab?.[s.key] != null).map((s) => (
                      <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-ink-300">{s.label}</span>
                        <SafetyResult value={lab?.[s.key] as string} />
                      </li>
                    ))}
                  </ul>
                </Panel>
                <p className="mt-3 flex items-center gap-2 text-xs text-ink-400">
                  <FlaskConical className="h-3.5 w-3.5" /> Scan the QR code on your pack to see the certificate for the exact batch you bought.
                </p>
              </section>
            )}

            {(terps.length > 0 || product.effects.length > 0 || product.flavours.length > 0) && (
              <section aria-labelledby="profile" className="grid grid-cols-1 gap-8 md:grid-cols-2">
                {terps.length > 0 && (
                  <div>
                    <div className="eyebrow text-oranje-500">Terpenes</div>
                    <h2 id="profile" className="mt-2 font-display text-2xl font-semibold text-white">Aroma profile</h2>
                    <p className="mt-1 text-sm text-ink-400">{lab?.terpenes?.length ? `Measured in batch ${batch?.code}` : "Typical profile"} · % by weight</p>
                    <TerpeneBars terps={terps} className="mt-5" />
                  </div>
                )}
                <div className="space-y-6">
                  {product.effects.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-ink-200">{licensed ? "Reported effects" : "Made for"}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.effects.map((e) => (
                          <span key={e} className="rounded-full border border-ink-700 px-3 py-1 text-sm capitalize text-ink-100">
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {product.flavours.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-ink-200">Flavours</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.flavours.map((f) => (
                          <span key={f} className="rounded-full bg-ink-850 px-3 py-1 text-sm text-ink-100">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {(product.lineage || product.origin) && (
                    <dl className="space-y-2 text-sm">
                      {product.lineage && (
                        <div>
                          <dt className="font-semibold text-ink-200">Lineage</dt>
                          <dd className="text-ink-300">{product.lineage}</dd>
                        </div>
                      )}
                      {product.origin && (
                        <div>
                          <dt className="font-semibold text-ink-200">Origin</dt>
                          <dd className="text-ink-300">{product.origin}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>
              </section>
            )}

            {(product.legalBasis || product.claims.length > 0) && (
              <section aria-labelledby="legal">
                <div className="eyebrow text-oranje-500">Legal basis</div>
                <h2 id="legal" className="mt-2 font-display text-2xl font-semibold text-white">What this product is — and isn&apos;t</h2>
                <Panel className="mt-5 p-5">
                  <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-400">Classification</dt>
                      <dd className="mt-0.5 font-medium text-ink-100">{REG_CLASS_LABEL[product.regClass]}</dd>
                    </div>
                    {product.legalBasis && (
                      <div>
                        <dt className="text-ink-400">Legal basis</dt>
                        <dd className="mt-0.5 font-medium text-ink-100">{product.legalBasis}</dd>
                      </div>
                    )}
                    {product.cbdMgPerPack != null && (
                      <div>
                        <dt className="text-ink-400">CBD per pack</dt>
                        <dd className="tnum mt-0.5 font-medium text-ink-100">{product.cbdMgPerPack} mg (Schedule 0 limit: 600 mg)</dd>
                      </div>
                    )}
                    {product.cbdMgPerDay != null && (
                      <div>
                        <dt className="text-ink-400">Maximum daily serving</dt>
                        <dd className="tnum mt-0.5 font-medium text-ink-100">{product.cbdMgPerDay} mg CBD (limit: 20 mg)</dd>
                      </div>
                    )}
                    {product.regClass === "CBD" && (
                      <div>
                        <dt className="text-ink-400">THC</dt>
                        <dd className="mt-0.5 font-medium text-ink-100">No more than 0.001%</dd>
                      </div>
                    )}
                  </dl>
                  {product.claims.length > 0 && (
                    <div className="mt-5 border-t border-ink-800 pt-5">
                      <h3 className="text-sm font-semibold text-ink-200">Approved claims</h3>
                      <ul className="mt-2 space-y-1.5">
                        {product.claims.map((c) => (
                          <li key={c} className="flex items-center gap-2 text-sm text-ink-100">
                            <BadgeCheck className="h-4 w-4 shrink-0 text-leaf-500" /> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="mt-5 flex gap-2 border-t border-ink-800 pt-4 text-xs leading-relaxed text-ink-400">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                    {product.regClass === "CBD"
                      ? "Use as directed and don't exceed the daily serving. Not intended to diagnose, treat, cure or prevent any disease. If you're pregnant, breastfeeding or take medication, speak to a pharmacist or doctor first. Adults 18+."
                      : licensed
                        ? "A medicine supplied on a SAHPRA Section 21 authorisation. Use only as directed by your prescriber."
                        : "For adults 18+. Keep out of reach of children."}
                  </p>
                </Panel>
              </section>
            )}

            {/* Reviews */}
            {!licensed && (
              <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-28">
                <div className="eyebrow text-oranje-500">Verified reviews</div>
                <h2 id="reviews-title" className="mt-2 font-display text-2xl font-semibold text-white">What members say</h2>
                {reviews.count > 0 ? (
                  <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
                    <div>
                      <div className="tnum font-display text-5xl font-semibold text-white">{reviews.avg.toFixed(1)}</div>
                      <Stars value={reviews.avg} className="mt-2" />
                      <p className="mt-1 text-sm text-ink-400">
                        {reviews.count} verified review{reviews.count === 1 ? "" : "s"}
                      </p>
                      <ul className="mt-5 space-y-1.5" aria-label="Rating distribution">
                        {reviews.distribution.map((d) => (
                          <li key={d.rating} className="flex items-center gap-2 text-xs text-ink-400">
                            <span className="tnum w-3">{d.rating}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                              <div className="h-full rounded-full bg-oranje-500" style={{ width: `${reviews.count ? (d.count / reviews.count) * 100 : 0}%` }} />
                            </div>
                            <span className="tnum w-6 text-right">{d.count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <ul className="space-y-4">
                      {reviews.rows.map((r) => (
                        <li key={r.id} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Stars value={r.rating} />
                            <span className="text-xs text-ink-500">{fmtDate(r.createdAt)}</span>
                          </div>
                          {r.title && <h3 className="mt-2 font-semibold text-white">{r.title}</h3>}
                          {r.body && <p className="mt-1 text-sm leading-relaxed text-ink-300">{r.body}</p>}
                          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
                            <BadgeCheck className="h-3.5 w-3.5 text-leaf-500" /> {r.customer.firstName} {r.customer.lastName ? `${r.customer.lastName[0]}.` : ""} · Verified purchase
                          </p>
                        </li>
                      ))}
                      {reviews.count > reviews.rows.length && (
                        <li>
                          <Link href={`/p/${product.slug}?${new URLSearchParams({ ...(sp.v ? { v: sp.v } : {}), reviews: "all" })}#reviews`} scroll={false} className="text-sm font-semibold text-oranje-400 hover:underline">
                            Show all {reviews.count} reviews
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-ink-400">No reviews yet. Reviews come only from members who bought the product.</p>
                )}
                <div className="mt-8 max-w-2xl">
                  {customer && bought && !reviewed ? (
                    <ReviewForm action={submitReview.bind(null, product.id)} />
                  ) : customer && reviewed ? (
                    <p className="text-sm text-ink-400">You&apos;ve reviewed this product — thank you.</p>
                  ) : !customer ? (
                    <p className="text-sm text-ink-400">
                      Bought this?{" "}
                      <Link href={`/club/join?next=${encodeURIComponent(`/p/${product.slug}#reviews`)}`} className="font-semibold text-oranje-400 hover:underline">
                        Sign in
                      </Link>{" "}
                      to leave a verified review.
                    </p>
                  ) : null}
                </div>
              </section>
            )}
          </div>

          {/* Side: stores + complete the deal */}
          <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
            {canCollect && (
              <Panel className="p-5">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                  <MapPin className="h-5 w-5 text-oranje-500" /> {store ? "Stock near you" : "Stock in stores"}
                </h2>
                <p className="mt-1 text-xs text-ink-400">{variant.name} · live, less open online orders</p>
                <ul className="mt-4 divide-y divide-ink-800">
                  {stores.slice(0, 6).map((x) => {
                    const n = x.qty[variant.id] ?? 0;
                    return (
                      <li key={x.store.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <Link href={`/stores/${x.store.slug}`} className="min-w-0 hover:text-white">
                          <span className={cn("block truncate font-medium", x.store.id === store?.id ? "text-oranje-300" : "text-ink-100")}>{x.store.name}</span>
                          <span className="block truncate text-xs text-ink-500">
                            {x.store.city}
                            {x.km != null && ` · ${x.km < 10 ? x.km.toFixed(1) : Math.round(x.km)} km`}
                          </span>
                        </Link>
                        <span className={cn("shrink-0 text-xs font-semibold", n > 3 ? "text-leaf-100" : n > 0 ? "text-amber-100" : "text-ink-500")}>{n > 3 ? "In stock" : n > 0 ? `${n} left` : "Out of stock"}</span>
                      </li>
                    );
                  })}
                </ul>
                <Link href="/stores" className="mt-3 inline-block text-xs font-semibold text-oranje-400 hover:underline">
                  All stores →
                </Link>
              </Panel>
            )}
            {suggestions.length > 0 && (
              <Panel className="border-oranje-500/40 p-5">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                  <Package className="h-5 w-5 text-oranje-500" /> Complete the deal
                </h2>
                <ul className="mt-3 space-y-2.5 text-sm text-ink-300">
                  {suggestions.map((s) => (
                    <li key={s.promoId + s.message}>
                      {!s.message.includes(s.name) && <span className="block font-semibold text-white">{s.name}</span>}
                      {s.message}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </aside>
        </div>

        {complete.length > 0 && (
          <section className="mt-20" aria-labelledby="complete">
            <div className="eyebrow text-oranje-500">Complete the deal</div>
            <h2 id="complete" className="mb-6 mt-2 font-display text-2xl font-semibold text-white">Goes well with</h2>
            <ProductGrid items={complete} />
          </section>
        )}
        {related.length > 0 && (
          <section className="mt-20" aria-labelledby="related">
            <div className="eyebrow text-oranje-500">{product.category.name}</div>
            <h2 id="related" className="mb-6 mt-2 font-display text-2xl font-semibold text-white">You might also like</h2>
            <ProductGrid items={related} />
          </section>
        )}
      </Container>
    </>
  );
}
