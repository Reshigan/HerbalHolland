"use client";
// The product card is a client component on purpose: a catalogue page shows dozens of cards, and shipping each one
// to the browser as a small product record plus its server-rendered art (instead of the whole rendered card tree in
// the RSC payload) roughly halves what the browser has to parse and hydrate. The markup is still server-rendered.
import Link from "next/link";
import { Truck, Store, Package, CircleOff, ChevronRight, Shirt } from "lucide-react";
import { AddToBag } from "./add-to-bag";
import { WishlistButton } from "./wishlist-button";
import { Price, Stars, Tag } from "./ui";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import type { ProductCard as Card } from "@/server/shop/catalogue";

export function StockLine({ stock, className }: { stock: Card["stock"]; className?: string }) {
  const [icon, text, tone] =
    stock.kind === "made"
      ? [<Shirt key="i" className="h-3.5 w-3.5" />, "Made to order · ships nationwide", "text-ink-300"]
      : stock.kind === "store"
      ? [<Store key="i" className="h-3.5 w-3.5" />, `In stock at ${stock.store}`, "text-leaf-100"]
      : stock.kind === "ships"
        ? [<Truck key="i" className="h-3.5 w-3.5" />, "Ships nationwide", "text-ink-300"]
        : stock.kind === "collect"
          ? [<Package key="i" className="h-3.5 w-3.5" />, stock.store ? `Collect at ${stock.store}` : `Collect from ${stock.stores} store${stock.stores === 1 ? "" : "s"}`, "text-leaf-100"]
          : [<CircleOff key="i" className="h-3.5 w-3.5" />, "Out of stock", "text-ink-400"];
  return <p className={cn("flex items-center gap-1.5 text-xs font-medium", tone, className)}>{icon}{text}</p>;
}

/**
 * `art` is the server-rendered picture; `buyable={false}` drops the quick-add (e.g. a limited drop that isn't open to
 * this shopper yet); `wished` (a member's wishlist state for the first variant) shows the heart (null for guests).
 */
export function ProductCardView({ p, art, buyable = true, wished = null }: { p: Card; art: React.ReactNode; buyable?: boolean; wished?: boolean | null }) {
  const low = (p.stock.kind === "store" || p.stock.kind === "ships") && p.stock.low;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60 transition duration-300 hover:-translate-y-0.5 hover:border-ink-600 hover:shadow-[0_18px_40px_-20px_rgb(245_145_60/0.35)]">
      <div className="relative aspect-square overflow-hidden">
        {art}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {p.deal && <Tag tone="solid">{p.deal.label}</Tag>}
          {p.heritage && <Tag tone="orange" className="bg-ink-950/70 backdrop-blur">Heritage</Tag>}
          {low && <Tag tone="amber" className="bg-ink-950/70 backdrop-blur">Low stock</Tag>}
        </div>
        {wished != null && <WishlistButton compact variantId={p.firstVariantId} on={wished} signedIn name={p.name} next={`/p/${p.slug}`} className="absolute right-2 top-2" />}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="eyebrow text-[0.62rem] text-ink-400">{p.category.name}</div>
        <h3 className="mt-1 font-display text-[1.05rem] font-semibold leading-snug text-white">
          <Link href={`/p/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {p.name}
          </Link>
        </h3>
        {p.tagline && <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink-400">{p.tagline}</p>}
        {p.rating && p.rating.count > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
            <Stars value={p.rating.avg} />
            <span className="tnum">({p.rating.count})</span>
          </div>
        )}
        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between gap-2">
            <Price cents={p.priceCents} was={p.wasCents} from={p.variantCount > 1} className="min-w-0" />
            {buyable && p.variantCount === 1 && p.stock.kind !== "out" ? (
              <AddToBag compact variantId={p.firstVariantId} name={p.name} className="shrink-0" />
            ) : (
              // Not interactive on its own: clicks fall through to the card link underneath.
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ink-700 text-xs font-semibold text-ink-200 transition group-hover:border-brand-500 group-hover:text-brand-300 sm:flex sm:h-auto sm:w-auto sm:px-3 sm:py-1.5">
                <ChevronRight className="h-5 w-5 sm:hidden" aria-hidden />
                <span className="sr-only sm:not-sr-only">{p.stock.kind === "out" || p.variantCount === 1 ? "View" : `${p.variantCount} options`}</span>
              </span>
            )}
          </div>
          {p.priceNote && p.wasCents && p.priceNote !== p.deal?.name && <p className="mt-1 truncate text-[0.7rem] font-semibold text-brand-300">{p.priceNote}</p>}
          {p.rewardsCents != null && (
            <p className="mt-1.5 flex w-fit max-w-full items-center gap-1 rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[0.7rem] font-semibold text-brand-200">
              Rewards <span className="tnum truncate">{zar(p.rewardsCents)}</span>
            </p>
          )}
        </div>
        <StockLine stock={p.stock} className="mt-3 border-t border-ink-800 pt-3" />
      </div>
    </article>
  );
}
