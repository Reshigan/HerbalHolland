// The sticky cart summary under the range: lines, the ex-VAT subtotal and where the basket stands against the
// minimum order. Server-rendered from the WHOLESALE quote; the add-to-cart action refreshes it.
import Link from "next/link";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { Meter } from "@/components/shop/ui";
import { buttonClass } from "@/components/ui/button";
import { minOrderProgress } from "@/lib/trade-cart";
import { zar } from "@/lib/money";

export function CartBar({ lines, subtotalCents, minOrderCents }: { lines: number; subtotalCents: number; minOrderCents: number }) {
  if (!lines) return null;
  const p = minOrderProgress(subtotalCents, minOrderCents);
  return (
    <div className="sticky bottom-0 z-30 mt-10 border-t border-ink-800 bg-ink-950/90 backdrop-blur-xl supports-[backdrop-filter]:bg-ink-950/80" data-testid="cart-bar">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-5 w-5 text-brand-500" aria-hidden />
          <div>
            <div className="text-sm font-semibold text-white">
              {lines} {lines === 1 ? "line" : "lines"} · <span className="tnum">{zar(subtotalCents)}</span> ex VAT
            </div>
            <div className="text-xs text-ink-400">{p.reached ? "Minimum order reached" : `${zar(p.shortCents)} more to reach the ${zar(minOrderCents)} minimum`}</div>
          </div>
        </div>
        <Meter value={subtotalCents} max={minOrderCents} label="Progress to the minimum order" className="sm:max-w-xs sm:flex-1" />
        <Link href="/trade/cart" className={buttonClass("primary", "md", "sm:ml-auto")}>
          View cart <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
