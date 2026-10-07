// The trade range at the account's DC: searchable, by category, paginated. Each line shows its case pack, the
// ex-VAT price per unit and per case, quantity breaks and availability, with a case stepper into the cart. A
// PENDING account browses without prices; an account on hold sees why ordering is paused.
import Link from "next/link";
import Form from "next/form";
import type { Metadata } from "next";
import { AlertTriangle, Clock, Search, X } from "lucide-react";
import { db } from "@/server/db";
import { standingOf } from "@/server/trade/licences";
import { getSettings } from "@/server/settings";
import { tradeRange } from "@/server/pricing";
import { ProductArt } from "@/components/product/art";
import { Callout, Chip, Container, Pager, Tag, inputClass } from "@/components/shop/ui";
import { buttonClass } from "@/components/ui/button";
import { pageParam } from "@/components/ui/pagination";
import { AddToTradeCart } from "@/components/trade/add-to-cart";
import { CartBar } from "@/components/trade/cart-bar";
import { className as classLabel, STOCK_LABEL, STOCK_TONE, stockState } from "@/components/trade/format";
import { TRADE_CLASSES } from "@/lib/trade";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";
import { cartQuote, orderingProblem, requireBuyer } from "../_lib/context";

export const metadata: Metadata = { title: "Range", robots: { index: false, follow: false } };

const PAGE_SIZE = 24;
type SP = { q?: string; category?: string; page?: string };

export default async function RangePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const buyer = await requireBuyer("/trade/range");
  const account = buyer.account;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const category = (sp.category ?? "").trim().slice(0, 60) || undefined;
  const page = pageParam(sp.page);
  const classes = account.classes.filter((c) => (TRADE_CLASSES as string[]).includes(c));
  const tradeProduct = { status: "ACTIVE" as const, regClass: { in: classes }, variants: { some: { active: true, podSku: null, wholesaleCents: { gt: 0 } } } };
  const [settings, cart, categories] = await Promise.all([
    getSettings(),
    cartQuote(account),
    classes.length ? db.category.findMany({ where: { products: { some: tradeProduct } }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } }) : [],
  ]);
  const store = cart.store;
  const res = store && classes.length ? await tradeRange(store.id, account, { q: q || null, category, page, pageSize: PAGE_SIZE }) : { rows: [], total: 0, page, pageSize: PAGE_SIZE, didYouMean: null };
  const arts = res.rows.length ? await db.product.findMany({ where: { id: { in: [...new Set(res.rows.map((r) => r.productId))] } }, select: { id: true, slug: true, strain: true } }) : [];
  const artOf = new Map(arts.map((a) => [a.id, a]));
  const inCart = new Map(cart.items.map((l) => [l.variantId, l.qty]));
  const cat = category ? categories.find((c) => c.slug === category || c.id === category) : undefined;
  const pending = account.status === "PENDING";
  const problem = await orderingProblem(account);
  const asks = pending ? (await standingOf(account)).lines.filter((l) => l.problem && l.state !== "pending").map((l) => l.problem!) : [];
  const href = (o: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: q || undefined, category, ...o })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/trade/range?${s}` : "/trade/range";
  };

  return (
    <>
      <Container className="pt-10 sm:pt-14">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="eyebrow text-brand-500">{account.name}</div>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">The trade range</h1>
            <p className="mt-2 text-ink-400">
              {pending ? "Prices show once your account is approved." : "Prices ex VAT, in whole cases."}
              {store ? ` Stock and courier orders from ${store.name}.` : ""} Minimum order {zar(settings.trade.minOrderCents)} ex VAT.
            </p>
          </div>
          <Form action="/trade/range" className="relative w-full lg:w-80" role="search">
            {category && <input type="hidden" name="category" value={category} />}
            <label htmlFor="range-q" className="sr-only">
              Search the range
            </label>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input id="range-q" name="q" type="search" defaultValue={q} placeholder="Product, SKU or barcode" className={cn(inputClass, "h-11 pl-11 pr-11")} />
            {q && (
              <Link href={href({ q: undefined })} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-ink-400 hover:bg-ink-800 hover:text-white" aria-label="Clear search">
                <X className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </Form>
        </div>

        {pending && asks.length > 0 && (
          <Callout tone="warn" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} title="We need something from you" className="mt-8">
            {asks.join(". ")}. <Link href="/trade/account#licences" className="font-semibold underline">Upload it on your account</Link>. We check it within one business day.
          </Callout>
        )}
        {pending && asks.length === 0 && (
          <Callout tone="info" icon={<Clock className="h-5 w-5" aria-hidden />} title="Your application is being reviewed" className="mt-8">
            Our trade team replies by email within one business day. Until the account is approved you can browse what&apos;s on the list, but prices stay hidden and nothing can be ordered yet.
          </Callout>
        )}
        {!pending && problem && (
          <Callout tone="warn" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} title={account.status === "ON_HOLD" ? "Your account is on hold" : "Ordering is paused"} className="mt-8">
            {problem}. You can still browse, see prices and your <Link href="/trade/statements" className="font-semibold underline">statements</Link>.
          </Callout>
        )}
        {!store && (
          <Callout tone="warn" icon={<AlertTriangle className="h-5 w-5" aria-hidden />} title="No distribution centre is set up yet" className="mt-8">
            The range is priced from a distribution centre; the trade team will have one ready before orders open.
          </Callout>
        )}

        {categories.length > 0 && (
          <nav className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Categories">
            <Chip href={href({ category: undefined, page: undefined })} active={!category}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} href={href({ category: c.slug, page: undefined })} active={category === c.slug || category === c.id}>
                {c.name}
              </Chip>
            ))}
          </nav>
        )}

        <p className="mt-6 text-sm text-ink-400" aria-live="polite">
          {res.total === 0 ? "No lines" : `${res.total.toLocaleString()} ${res.total === 1 ? "line" : "lines"}`}
          {q ? (res.didYouMean ? ` with names close to “${q}”` : ` for “${q}”`) : ""}
          {cat ? ` in ${cat.name}` : ""}
          {res.didYouMean && (
            <>
              {" · "}
              Did you mean{" "}
              <Link href={href({ q: res.didYouMean, page: undefined })} className="font-semibold text-brand-400 underline">
                {res.didYouMean}
              </Link>
              ?
            </>
          )}
          {q && (
            <>
              {" · "}
              <Link href={href({ q: undefined })} className="font-semibold text-brand-400 underline">
                Clear search
              </Link>
            </>
          )}
        </p>

        {res.rows.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-ink-800 px-6 py-16 text-center">
            <p className="font-display text-xl font-semibold text-white">Nothing here yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-400">
              {q ? "Try another name, SKU or barcode." : classes.length ? "This category has no lines in the ranges your account may buy." : "Your account isn't approved for any range yet. The trade team sets this when it approves the account."}
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900/40" data-testid="range-rows">
            {res.rows.map((r) => {
              const art = artOf.get(r.productId);
              const stock = stockState(r.available, r.caseQty);
              const breaks = r.breaks.filter((b) => b.minQty > 1);
              return (
                <li key={r.variantId} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:p-5" data-sku={r.sku}>
                  <ProductArt slug={art?.slug ?? r.sku} strain={art?.strain} regClass={r.regClass} label={r.productName} className="h-14 w-14 rounded-xl sm:h-16 sm:w-16" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h2 className="font-display text-base font-semibold text-white sm:text-lg">
                        {r.productName} <span className="text-ink-300">· {r.variantName}</span>
                      </h2>
                      <Tag tone={STOCK_TONE[stock]}>{stock === "low" ? `${STOCK_LABEL[stock]} · ${r.available} left` : STOCK_LABEL[stock]}</Tag>
                    </div>
                    <p className="mt-1 text-xs text-ink-400">
                      <span className="tnum">{r.sku}</span> · {classLabel(r.regClass)} · {r.caseQty > 1 ? `case of ${r.caseQty}` : "sold singly"} · RRP {zar(r.rrpCents)} incl.
                    </p>
                    {!pending && (
                      <p className="tnum mt-2 text-sm text-ink-100">
                        <span className="font-display text-lg font-semibold text-white">{zar(r.unitCents)}</span> ex VAT each
                        {r.caseQty > 1 && (
                          <>
                            {" · "}case of {r.caseQty} · <span className="font-semibold text-white">{zar(r.unitCents * r.caseQty)}</span> a case
                          </>
                        )}
                        {r.priceRule && <span className="text-ink-400"> · {r.priceRule}</span>}
                      </p>
                    )}
                    {!pending && breaks.length > 0 && (
                      <p className="tnum mt-1 text-xs text-ink-300">
                        Buy more, pay less:{" "}
                        {breaks.map((b, i) => (
                          <span key={b.minQty}>
                            {i > 0 && " · "}
                            {b.minQty}+ at {zar(b.unitCents)}
                          </span>
                        ))}
                      </p>
                    )}
                    {pending && <p className="mt-2 text-sm text-ink-400">Trade price after approval</p>}
                  </div>
                  <div className="col-span-2 sm:col-span-1 sm:justify-self-end">
                    {pending ? (
                      <span className="text-xs text-ink-450">Ordering opens on approval</span>
                    ) : (
                      <AddToTradeCart variantId={r.variantId} name={`${r.productName} ${r.variantName}`} caseQty={r.caseQty} inCart={inCart.get(r.variantId) ?? 0} disabled={!store} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pager page={res.page} pageSize={res.pageSize} total={res.total} href={(p) => href({ page: String(p) })} noun="lines" />
        {!pending && !cart.items.length && (
          <p className="mt-6 text-sm text-ink-400">
            Your cart is empty.{" "}
            <Link href="/trade/orders" className={buttonClass("ghost-dark", "sm")}>
              Reorder from a past order
            </Link>
          </p>
        )}
      </Container>
      <CartBar lines={cart.items.length} subtotalCents={cart.quote?.exCents ?? 0} minOrderCents={settings.trade.minOrderCents} />
    </>
  );
}
