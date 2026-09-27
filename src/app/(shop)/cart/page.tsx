import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowRight, BadgePercent, Minus, Plus, ShieldCheck, ShoppingBag, Sparkles, Trash2, Truck } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { quote } from "@/server/pricing";
import { availability, availKey } from "@/server/inventory";
import { madeToOrder } from "@/server/merch";
import { MADE_TO_ORDER_LEAD } from "@/lib/merch";
import { dropBlocks, dropsFor } from "@/server/drops";
import { isOffer } from "@/server/offers";
import { getClasses, getDispensaryAccess } from "@/server/shop/access";
import { cardsWhere, getNetwork } from "@/server/shop/catalogue";
import { getCart, getPreferredStore, getPromoCode } from "@/server/shop/context";
import { setBagQty } from "@/server/shop/actions";
import { tierMeta } from "@/server/shop/club";
import { welcomeGifts } from "@/server/shop/launch";
import { readableDropBlock } from "@/server/shop/launch-rules";
import { ProductArt } from "@/components/product/art";
import { ProductGrid } from "@/components/shop/product-card";
import { PromoCode } from "@/components/shop/promo-code";
import { WelcomeGiftBanner } from "@/components/shop/club-launch";
import { fmtWhen } from "@/components/shop/launch-cards";
import { Callout, Container, Panel, Tag } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { opensFor } from "@/lib/drops";
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
          <ShoppingBag className="mx-auto h-10 w-10 text-brand-500" strokeWidth={1.5} />
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
  const [variants, avail, access, drops, dropMsgs, gifts, made] = await Promise.all([
    db.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, product: { select: { slug: true, strain: true, regClass: true, name: true } } } }),
    availability(net.all, variantIds),
    q.lines.some((l) => classes.licensed.includes(l.regClass)) ? getDispensaryAccess() : null,
    dropsFor(variantIds),
    dropBlocks(customer?.id, q.lines),
    welcomeGifts(customer, store?.id),
    madeToOrder(variantIds),
  ]);
  // Limited drops in the bag: what's wrong (if anything), in plain words, before checkout.
  const dropNotes = dropMsgs.map((m) => {
    const d = drops.find((x) => m.startsWith(x.name));
    const opens = d ? opensFor(d, (customer?.tier ?? null) as TierKey | null) : null;
    return { slug: d?.slug, ...readableDropBlock(m, d && { name: d.name, perMemberLimit: d.perMemberLimit, opensLabel: opens ? `on ${fmtWhen(opens)}` : undefined }) };
  });
  const dropOf = (variantId: string) => drops.find((d) => d.variantIds.includes(variantId));
  // Welcome gifts get their own hint (with an add button) instead of the generic deal nudge.
  const giftIds = new Set(gifts.map((g) => g.id));
  const inBagProducts = new Set(variants.map((v) => v.product.slug));
  const giftHints = gifts.filter((g) => g.product && !inBagProducts.has(g.product.slug));
  const suggestions = q.suggestions.filter((s) => !giftIds.has(s.promoId));
  const byId = new Map(variants.map((v) => [v.id, v]));
  const stockOf = (variantId: string) => (made.has(variantId) ? 99 : net.all.reduce((s, id) => s + Math.max(0, avail.get(availKey(id, variantId))?.available ?? 0), 0));
  const licensedLines = q.lines.filter((l) => classes.licensed.includes(l.regClass));
  const blockedLicensed = licensedLines.length > 0 && access && !access.allowed;

  const earnable = q.lines.filter((l) => !l.noEarn).reduce((s, l) => s + l.totalCents, 0);
  const tier = (customer?.tier ?? "SEED") as TierKey;
  const earn = pointsFor(earnable, tier, q.pointsMultiplier, settings.loyalty.earnPer100);
  // Free delivery counts stocked items only; made-to-order merch always carries the merch partner's courier.
  const freeOver = settings.ecommerce.freeDeliveryOverCents;
  const stockedTotal = q.lines.filter((l) => !made.has(l.variantId)).reduce((s, l) => s + l.totalCents, 0);
  const toFree = Math.max(0, freeOver - stockedTotal);

  const sIds = suggestions.flatMap((s) => s.productIds);
  const sCats = suggestions.flatMap((s) => s.categoryIds);
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

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div className="space-y-4">
          {dropNotes.map((n) => (
            <Callout key={n.title} tone="warn" icon={<Sparkles className="h-5 w-5" />} title={n.title}>
              {n.body}{" "}
              {n.kind === "members" ? (
                <Link href="/club/join?next=/cart" className="font-semibold text-white underline">
                  Join free
                </Link>
              ) : (
                n.slug && (
                  <Link href={`/drops/${n.slug}`} className="font-semibold text-white underline">
                    About the drop
                  </Link>
                )
              )}
            </Callout>
          ))}
          {giftHints.map((g) => (
            <WelcomeGiftBanner key={g.id} gift={g} where="bag" />
          ))}
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
          {suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={s.promoId + s.message} className="flex items-center gap-3 rounded-2xl border border-brand-500/35 bg-brand-500/[0.06] px-4 py-3 text-sm">
                  <Sparkles className="h-5 w-5 shrink-0 text-brand-400" />
                  <span className="text-ink-100">
                    {!s.message.includes(s.name) && <strong className="font-semibold text-white">{s.name} · </strong>}
                    {s.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          <ul className="divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/60">
            {q.lines.map((l) => {
              const v = byId.get(l.variantId);
              const stock = stockOf(l.variantId);
              const licensed = classes.licensed.includes(l.regClass);
              const drop = dropOf(l.variantId);
              return (
                <li key={l.variantId} className="flex gap-4 p-4 sm:p-5">
                  <Link href={v ? `/p/${v.product.slug}?v=${l.variantId}` : "/shop"} className="shrink-0">
                    <ProductArt slug={v?.product.slug ?? l.sku} strain={v?.product.strain} regClass={l.regClass} label={l.productName} className="h-20 w-20 rounded-xl sm:h-24 sm:w-24" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={v ? `/p/${v.product.slug}?v=${l.variantId}` : "/shop"} className="font-semibold text-white hover:text-brand-300">
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
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {drop && (
                        <Link href={`/drops/${drop.slug}`} className="font-medium text-brand-300 hover:underline">
                          Limited drop · {drop.perMemberLimit} per member
                        </Link>
                      )}
                      {l.priceRule && <span className="font-medium text-brand-300">{l.priceRule}</span>}
                      {l.offerCents > 0 && <span className="font-medium text-brand-200">Your deal −{zar(l.offerCents)}</span>}
                      {l.discountCents > l.offerCents && <span className="font-medium text-leaf-100">You save {zar(l.discountCents - l.offerCents)}</span>}
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
                  <dt className="text-leaf-100">
                    {isOffer(a.id) && (
                      <Tag tone="orange" className="mr-1.5 align-[1px]">
                        My Deal
                      </Tag>
                    )}
                    {a.name}
                  </dt>
                  <dd className="tnum shrink-0 text-leaf-100">−{zar(a.discountCents)}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt className="text-ink-300">Delivery</dt>
                <dd className="text-ink-400">{made.size ? `${zar(settings.ecommerce.merchCourierCents)} merch courier${stockedTotal && toFree ? " + delivery" : ""}` : toFree === 0 ? "Free" : "At checkout"}</dd>
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
            {q.memberSavingsCents > 0 && (
              <p className="mt-4 flex items-center gap-2 rounded-xl border border-brand-500/35 bg-brand-500/10 px-3 py-2.5 text-xs font-semibold text-brand-100">
                <BadgePercent className="h-4 w-4 shrink-0 text-brand-400" /> You&apos;re saving {zar(q.memberSavingsCents)} with your {tierMeta(customer!.tier).name} price.
              </p>
            )}
            {!customer && q.joinSavingsCents > 0 && (
              <Link href="/club/join?next=/cart" className="mt-4 flex items-center gap-2 rounded-xl border border-brand-500/35 bg-brand-500/10 px-3 py-2.5 text-xs font-semibold text-brand-100 hover:border-brand-500">
                <BadgePercent className="h-4 w-4 shrink-0 text-brand-400" /> Join free and save {zar(q.joinSavingsCents)} on this order →
              </Link>
            )}
            {made.size > 0 && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-ink-850 px-3 py-2.5 text-xs text-ink-300">
                <Truck className="h-4 w-4 shrink-0 text-brand-500" /> Made-to-order merch ships on its own from our merch partner in {MADE_TO_ORDER_LEAD}: {zar(settings.ecommerce.merchCourierCents)} courier on top. {settings.ecommerce.merchNotice}
              </p>
            )}
            {licensedLines.length === q.lines.length || made.size === q.lines.length ? null : toFree > 0 ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-ink-850 px-3 py-2.5 text-xs text-ink-300">
                <Truck className="h-4 w-4 shrink-0 text-brand-500" /> Add {zar(toFree)} more for free delivery.
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
            {!customer && <p className="mt-3 text-center text-xs text-ink-400">We sell to members only. Joining is free and takes a minute at checkout (adults 18+).</p>}
            <p className="mt-3 text-center text-xs text-ink-500">Adults 18+ · ID checked on collection and delivery</p>
          </Panel>
          <Panel className="p-5">
            <div className="eyebrow text-brand-500">Herbal Holland Rewards</div>
            {customer ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-300">
                You&apos;ll earn about <strong className="text-white">{fmtPoints(earn)}</strong> on this order
                {q.pointsMultiplier > 1 ? ` (${q.pointsMultiplier}× points today)` : ""}. You have <strong className="text-white">{fmtPoints(customer.points)}</strong> to spend at checkout.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-ink-300">
                Members pay less instantly{q.joinSavingsCents > 0 ? ` (${zar(q.joinSavingsCents)} off this bag)` : ""} and earn about <strong className="text-white">{fmtPoints(earn)}</strong> on this order, plus {fmtPoints(settings.loyalty.signupBonus)} for joining.{" "}
                <Link href="/club/join?next=/cart" className="font-semibold text-brand-400 hover:underline">
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
          <div className="eyebrow text-brand-500">Complete the deal</div>
          <h2 id="deal-prompts" className="mb-6 mt-2 font-display text-2xl font-semibold text-white">
            Add one of these to unlock your offer
          </h2>
          <ProductGrid items={prompts} />
        </section>
      )}
    </Container>
  );
}
