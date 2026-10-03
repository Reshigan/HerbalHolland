// The trade cart: every line re-quoted by the WHOLESALE engine at the account's DC (unit ex VAT, line ex VAT, VAT,
// incl.), case steppers, the minimum-order check and what the DC can supply right now, then on to checkout.
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowRight, ShoppingCart } from "lucide-react";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { availability, availKey } from "@/server/inventory";
import { ProductArt } from "@/components/product/art";
import { Callout, Container, Panel, Tag } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { CaseStepper, RemoveLine } from "@/components/trade/cart-controls";
import { className as classLabel, fmtCases } from "@/components/trade/format";
import { casesOf, minOrderProgress } from "@/lib/trade-cart";
import { evaluateTradeBasket } from "@/lib/compliance";
import { validateTradeBasket } from "@/lib/trade";
import { zar } from "@/lib/money";
import { clearCartAction } from "../actions";
import { cartQuote, orderingProblem, requireBuyer } from "../_lib/context";

export const metadata: Metadata = { title: "Cart", robots: { index: false, follow: false } };

export default async function TradeCartPage() {
  const buyer = await requireBuyer("/trade/cart");
  const account = buyer.account;
  const [settings, cart] = await Promise.all([getSettings(), cartQuote(account)]);
  const q = cart.quote;
  const store = cart.store;
  const t = settings.trade;

  if (!q || !q.lines.length)
    return (
      <Container className="pt-16">
        <div className="mx-auto max-w-lg rounded-3xl border border-dashed border-ink-800 px-6 py-20 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-brand-500" strokeWidth={1.5} aria-hidden />
          <h1 className="mt-5 font-display text-3xl font-semibold text-white">Your cart is empty</h1>
          <p className="mx-auto mt-3 max-w-sm text-ink-400">Add whole cases from the range, or order again from a past order.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/trade/range" size="lg">
              Browse the range
            </ButtonLink>
            <ButtonLink href="/trade/orders" variant="outline-dark" size="lg">
              Past orders
            </ButtonLink>
          </div>
        </div>
      </Container>
    );

  const variantIds = q.lines.map((l) => l.variantId);
  const [variants, avail] = await Promise.all([
    db.variant.findMany({ where: { id: { in: variantIds } }, select: { id: true, active: true, podSku: true, product: { select: { slug: true, strain: true, status: true, name: true } } } }),
    store ? availability([store.id], variantIds) : new Map(),
  ]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  // Lines the cookie holds that the engine no longer prices (taken off sale, no trade price): shown so they can be removed.
  const gone = cart.items.filter((i) => !q.lines.some((l) => l.variantId === i.variantId));
  const comp = evaluateTradeBasket({ items: q.lines.map((l) => ({ name: l.name, regClass: l.regClass, productStatus: byId.get(l.variantId)?.product.status })), accountClasses: account.classes, sellerLicences: store?.licences ?? [], settings: settings.compliance });
  const problems = [...comp.blocks, ...validateTradeBasket(q.lines.map((l) => ({ name: l.name, qty: l.qty, unitCents: l.exCents / l.qty, caseQty: l.caseQty })), { minOrderCents: t.minOrderCents })];
  const shortAtDc = store ? q.lines.filter((l) => (avail.get(availKey(store.id, l.variantId))?.available ?? 0) < l.qty) : [];
  const progress = minOrderProgress(q.exCents ?? 0, t.minOrderCents);
  const ordering = orderingProblem(account);
  const units = q.lines.reduce((s, l) => s + l.qty, 0);
  const canCheckout = problems.length === 0 && !ordering && !!store;

  return (
    <Container className="pt-10 sm:pt-14">
      <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your cart</h1>
      <p className="mt-2 text-ink-400">
        {q.lines.length} {q.lines.length === 1 ? "line" : "lines"} · {units} units · prices ex VAT{store ? ` · priced at ${store.name}` : ""}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div className="space-y-4">
          {ordering && (
            <Callout tone="warn" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} title="Ordering is paused">
              {ordering}.
            </Callout>
          )}
          {gone.map((g) => (
            <Callout key={g.variantId} tone="warn" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} title="One line isn't in the trade range any more">
              {byId.get(g.variantId)?.product.name ?? "An item"} was in your cart but has no trade price now.
              <div className="mt-2">
                <RemoveLine variantId={g.variantId} />
              </div>
            </Callout>
          ))}
          {problems.map((p) => (
            <Callout key={p} tone={/Minimum order/.test(p) ? "info" : "danger"} icon={<AlertTriangle className="h-5 w-5" aria-hidden />}>
              {p}
            </Callout>
          ))}
          {shortAtDc.length > 0 && (
            <Callout tone="warn" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} title={`Short at ${store!.name} right now`}>
              {shortAtDc.map((l) => `${l.name}: ${Math.max(0, avail.get(availKey(store!.id, l.variantId))?.available ?? 0)} of ${l.qty} available`).join(" · ")}. You can still order; a line we can&apos;t fill in full ships short and is invoiced for what went.
            </Callout>
          )}

          <ul className="divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/40" data-testid="cart-lines">
            {q.lines.map((l) => {
              const v = byId.get(l.variantId);
              const cases = casesOf(l.qty, l.caseQty);
              return (
                <li key={l.variantId} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:p-5" data-sku={l.sku}>
                  <ProductArt slug={v?.product.slug ?? l.sku} strain={v?.product.strain} regClass={l.regClass} label={l.productName} className="h-14 w-14 rounded-xl sm:h-16 sm:w-16" />
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-white sm:text-lg">
                      {l.productName} <span className="text-ink-300">· {l.variantName}</span>
                    </h2>
                    <p className="mt-1 text-xs text-ink-400">
                      <span className="tnum">{l.sku}</span> · {classLabel(l.regClass)} · {l.caseQty > 1 ? `case of ${l.caseQty}` : "sold singly"}
                    </p>
                    <p className="tnum mt-2 text-sm text-ink-200" data-testid="line-unit">
                      {zar(l.exCents / l.qty)} ex VAT each · {fmtCases(l.qty, l.caseQty)}
                      {l.promoId && <Tag tone="orange" className="ml-2">Promotion</Tag>}
                    </p>
                    <dl className="tnum mt-2 grid grid-cols-3 gap-2 text-xs sm:max-w-sm">
                      <div>
                        <dt className="text-ink-450">Ex VAT</dt>
                        <dd className="font-semibold text-white" data-testid="line-ex">{zar(l.exCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-450">VAT</dt>
                        <dd className="text-ink-200" data-testid="line-vat">{zar(l.vatCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-450">Incl. VAT</dt>
                        <dd className="text-ink-200" data-testid="line-incl">{zar(l.totalCents)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                    <CaseStepper variantId={l.variantId} cases={cases} caseQty={l.caseQty} name={`${l.productName} ${l.variantName}`} />
                    <RemoveLine variantId={l.variantId} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/trade/range" className="font-semibold text-brand-400 underline hover:text-brand-300">
              Add more lines
            </Link>
            <form action={clearCartAction}>
              <button className="text-ink-400 hover:text-white">Empty the cart</button>
            </form>
          </div>
        </div>

        <Panel className="h-fit p-6 lg:sticky lg:top-24" aria-labelledby="totals">
          <h2 id="totals" className="font-display text-lg font-semibold text-white">
            Totals
          </h2>
          <dl className="tnum mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-300">Subtotal ex VAT</dt>
              <dd className="font-semibold text-white" data-testid="subtotal-ex">{zar(q.exCents ?? 0)}</dd>
            </div>
            {q.applied.map((a) => (
              <div key={a.id} className="flex justify-between gap-4 text-brand-300">
                <dt>{a.name}</dt>
                <dd>−{zar(a.discountCents)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-300">Courier or handling</dt>
              <dd className="text-ink-400">chosen at checkout</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-300">VAT @ 15%</dt>
              <dd className="text-ink-100" data-testid="total-vat">{zar(q.vatCents)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-ink-800 pt-3 text-base">
              <dt className="font-semibold text-white">Total incl. VAT</dt>
              <dd className="font-display text-xl font-semibold text-white" data-testid="total-incl">{zar(q.totalCents)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-400">{progress.reached ? `Minimum order of ${zar(t.minOrderCents)} ex VAT reached.` : `${zar(progress.shortCents)} more to reach the ${zar(t.minOrderCents)} minimum (ex VAT).`}</p>
          {canCheckout ? (
            <ButtonLink href="/trade/checkout" size="lg" className="mt-5 w-full">
              Checkout <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          ) : (
            <button disabled className={"mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 text-[0.95rem] font-semibold text-ink-950 opacity-45"}>
              Checkout <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            Courier {zar(t.deliveryCents)} ex VAT{t.freeDeliveryOverCents > 0 ? `, free from ${zar(t.freeDeliveryOverCents)} ex VAT` : ""}; click &amp; collect {zar(t.collectHandlingCents)} ex VAT handling. VAT is worked out per line.
          </p>
        </Panel>
      </div>
    </Container>
  );
}
