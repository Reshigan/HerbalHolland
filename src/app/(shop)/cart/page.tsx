import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Sparkles, Trash2, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { quote } from "@/server/pricing";
import { availability, availKey } from "@/server/inventory";
import { getClasses, getDispensaryAccess } from "@/server/shop/access";
import { cardsWhere, getNetwork } from "@/server/shop/catalogue";
import { getCart, getPreferredStore, getPromoCode } from "@/server/shop/context";
import { setBagQty } from "@/server/shop/actions";
import { tierMeta } from "@/server/shop/club";
import { ProductArt } from "@/components/product/art";
import { ProductGrid } from "@/components/shop/product-card";
import { PromoCode } from "@/components/shop/promo-code";
import { Callout, Container, Panel } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { fmtPoints, pointsFor, type TierKey } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Your bag", robots: { index: false } };

export default async function CartPage() {
  const [items, code, customer, settings, classes, store] = await Promise.all([getCart(), getPromoCode(), getCustomer(), getSettings(), getClasses(), getPreferredStore()]);
  const q = await quote({ channel: "ONLINE", items, code, customerId: customer?.id });

  if (!q.lines.length)
    return (
      <Container className="pt-16">
        <div className="mx-auto max-w-lg rounded-3xl border border-dashed border-ink-800 px-6 py-20 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-oranje-500" strokeWidth={1.5} />
          <h1 className="mt-5 font-display text-3xl font-semibold text-white">Your bag is empty</h1>
          <p className="mx-auto mt-3 max-w-sm text-ink-400">Find something you love — collect it in store or have it delivered anywhere in South Africa.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/shop" size="lg">
              Shop the range
            </ButtonLink>
            <ButtonLink href="/stores" variant="outline-dark" size="lg">
              Find a store
            </ButtonLink>
          </div>
        </div>
      </Container>
    );

  const net = await getNetwork();
  const variantIds = q.lines.map((l) => l.variantId);
  const [variants, avail, access] = await Promise.all([
    db.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, product: { select: { slug: true, strain: true, regClass: true, name: true } } } }),
    availability(net.all, variantIds),
    q.lines.some((l) => classes.licensed.includes(l.regClass)) ? getDispensaryAccess() : null,
  ]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const stockOf = (variantId: string) => net.all.reduce((s, id) => s + Math.max(0, avail.get(availKey(id, variantId))?.available ?? 0), 0);
  const licensedLines = q.lines.filter((l) => classes.licensed.includes(l.regClass));
  const blockedLicensed = licensedLines.length > 0 && access && !access.allowed;

  const earnable = q.lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0);
  const tier = (customer?.tier ?? "SEED") as TierKey;
  const earn = pointsFor(earnable, tier, q.pointsMultiplier, settings.loyalty.earnPer100);
  const freeOver = settings.ecommerce.freeDeliveryOverCents;
  const toFree = Math.max(0, freeOver - q.totalCents);

  const sIds = q.suggestions.flatMap((s) => s.productIds);
  const sCats = q.suggestions.flatMap((s) => s.categoryIds);
  const inBag = new Set(q.lines.map((l) => l.productId));
  const prompts =
    sIds.length || sCats.length
      ? (await cardsWhere({ OR: [{ id: { in: sIds } }, { categoryId: { in: sCats } }] }, classes.public, { tier: customer?.tier ?? null, storeId: store?.id, storeName: store?.name })).filter((c) => !inBag.has(c.id)).slice(0, 4)
      : [];

  return (
    <Container className="pt-10 sm:pt-14">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your bag</h1>
      <p className="mt-2 text-ink-400">
        {q.lines.reduce((s, l) => s + l.qty, 0)} item{q.lines.reduce((s, l) => s + l.qty, 0) === 1 ? "" : "s"} · prices include VAT
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem] lg:gap-12">
        <div className="space-y-4">
          {blockedLicensed && (
            <Callout tone="warn" icon={<ShieldCheck className="h-5 w-5" />} title="Dispensary items need a registered patient">
              {access && !access.allowed && access.reason === "SIGN_IN" ? (
                <>
                  <Link href="/club/join?next=/cart" className="font-semibold text-white underline">
                    Sign in
                  </Link>{" "}
                  with the number linked to your authorisation, or remove these items to continue.
                </>
              ) : (
                "We don't have an active SAHPRA authorisation on file for you — remove these items to continue, or ask our pharmacist in store."
              )}
            </Callout>
          )}
          {q.suggestions.length > 0 && (
            <div className="space-y-2">
              {q.suggestions.map((s) => (
                <div key={s.promoId + s.message} className="flex items-center gap-3 rounded-2xl border border-oranje-500/35 bg-oranje-500/[0.06] px-4 py-3 text-sm">
                  <Sparkles className="h-5 w-5 shrink-0 text-oranje-400" />
                  <span className="text-ink-100">{s.message}</span>
                </div>
              ))}
            </div>
          )}
          <ul className="divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/60">
            {q.lines.map((l) => {
              const v = byId.get(l.variantId);
              const stock = stockOf(l.variantId);
              const licensed = classes.licensed.includes(l.regClass);
              return (
                <li key={l.variantId} className="flex gap-4 p-4 sm:p-5">
                  <Link href={v ? `/p/${v.product.slug}?v=${l.variantId}` : "/shop"} className="shrink-0">
                    <ProductArt slug={v?.product.slug ?? l.sku} strain={v?.product.strain} regClass={l.regClass} label={l.productName} className="h-20 w-20 rounded-xl sm:h-24 sm:w-24" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={v ? `/p/${v.product.slug}?v=${l.variantId}` : "/shop"} className="font-semibold text-white hover:text-oranje-300">
                          {l.productName}
                        </Link>
                        <p className="text-sm text-ink-400">
                          {l.variantName}
                          {licensed && " · collect only"}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="tnum font-display font-semibold text-white">{zar(l.totalCents)}</div>
                        {l.discountCents > 0 && <s className="tnum text-xs text-ink-500">{zar(l.grossCents)}</s>}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                      {l.priceRule && <span className="font-medium text-oranje-300">{l.priceRule}</span>}
                      {l.discountCents > 0 && <span className="font-medium text-leaf-100">You save {zar(l.discountCents)}</span>}
                      {stock < l.qty && (
                        <span className="flex items-center gap-1 font-medium text-amber-100">
                          <AlertTriangle className="h-3.5 w-3.5" /> {stock ? `Only ${stock} available online` : "Out of stock online"}
                        </span>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex items-center rounded-full border border-ink-700" role="group" aria-label={`Quantity of ${l.name}`}>
                        <form action={setBagQty}>
                          <input type="hidden" name="variantId" value={l.variantId} />
                          <input type="hidden" name="qty" value={l.qty - 1} />
                          <button className="grid h-10 w-10 place-items-center rounded-l-full text-ink-200 hover:text-white" aria-label="One less">
                            <Minus className="h-4 w-4" />
                          </button>
                        </form>
                        <span className="tnum w-8 text-center text-sm font-semibold text-white" aria-live="polite">
                          {l.qty}
                        </span>
                        <form action={setBagQty}>
                          <input type="hidden" name="variantId" value={l.variantId} />
                          <input type="hidden" name="qty" value={l.qty + 1} />
                          <button disabled={l.qty >= 20} className="grid h-10 w-10 place-items-center rounded-r-full text-ink-200 hover:text-white disabled:opacity-40" aria-label="One more">
                            <Plus className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                      <form action={setBagQty}>
                        <input type="hidden" name="variantId" value={l.variantId} />
                        <input type="hidden" name="qty" value={0} />
                        <button className="flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-400 hover:bg-ink-850 hover:text-white">
                          <Trash2 className="h-4 w-4" /> Remove
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <Panel className="p-5">
            <h2 className="font-display text-lg font-semibold text-white">Summary</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-300">Subtotal</dt>
                <dd className="tnum text-ink-100">{zar(q.subtotalCents)}</dd>
              </div>
              {q.applied.filter((a) => a.discountCents > 0).map((a) => (
                <div key={a.id} className="flex justify-between gap-3">
                  <dt className="text-leaf-100">{a.name}</dt>
                  <dd className="tnum shrink-0 text-leaf-100">−{zar(a.discountCents)}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-ink-300">Delivery</dt>
                <dd className="text-ink-400">{toFree === 0 ? "Free" : "At checkout"}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-ink-800 pt-3">
                <dt className="font-semibold text-white">Total</dt>
                <dd className="tnum font-display text-2xl font-semibold text-white">{zar(q.totalCents)}</dd>
              </div>
              {q.vatCents > 0 && (
                <div className="flex justify-between text-xs text-ink-500">
                  <dt>Includes VAT</dt>
                  <dd className="tnum">{zar(q.vatCents)}</dd>
                </div>
              )}
            </dl>
            {licensedLines.length === q.lines.length ? null : toFree > 0 ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-ink-850 px-3 py-2.5 text-xs text-ink-300">
                <Truck className="h-4 w-4 shrink-0 text-oranje-500" /> Add {zar(toFree)} more for free delivery.
              </p>
            ) : (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-leaf-500/10 px-3 py-2.5 text-xs text-leaf-100">
                <Truck className="h-4 w-4 shrink-0" /> Free delivery unlocked.
              </p>
            )}
            <div className="mt-4">
              <PromoCode code={code} error={code ? q.codeError : null} />
            </div>
            <ButtonLink href="/checkout" size="xl" className={cn("mt-5 w-full", blockedLicensed && "pointer-events-none opacity-45")} aria-disabled={!!blockedLicensed}>
              Checkout <ArrowRight className="h-5 w-5" />
            </ButtonLink>
            <p className="mt-3 text-center text-xs text-ink-500">Adults 18+ · ID checked on collection and delivery</p>
          </Panel>
          <Panel className="p-5">
            <div className="eyebrow text-oranje-500">Herbal Holland Rewards</div>
            {customer ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-300">
                You&apos;ll earn about <strong className="text-white">{fmtPoints(earn)}</strong> on this order as a {tierMeta(customer.tier).name} member
                {q.pointsMultiplier > 1 ? ` (${q.pointsMultiplier}× today)` : ""}. You have <strong className="text-white">{fmtPoints(customer.points)}</strong> to spend at checkout.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-ink-300">
                Members earn about <strong className="text-white">{fmtPoints(earn)}</strong> on this order, plus {fmtPoints(settings.loyalty.signupBonus)} for joining.{" "}
                <Link href="/club/join?next=/cart" className="font-semibold text-oranje-400 hover:underline">
                  Join free
                </Link>
              </p>
            )}
            {licensedLines.length > 0 && <p className="mt-2 text-xs text-ink-500">Medicines don&apos;t earn points and can&apos;t be discounted.</p>}
          </Panel>
        </aside>
      </div>

      {prompts.length > 0 && (
        <section className="mt-16" aria-labelledby="deal-prompts">
          <div className="eyebrow text-oranje-500">Complete the deal</div>
          <h2 id="deal-prompts" className="mb-6 mt-2 font-display text-2xl font-semibold text-white">
            Add one of these to unlock your offer
          </h2>
          <ProductGrid items={prompts} />
        </section>
      )}
    </Container>
  );
}
