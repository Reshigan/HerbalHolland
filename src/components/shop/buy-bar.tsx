"use client";
// The sticky buy bar on phones: slides up once the buy box has scrolled off the top, and adds the chosen variant
// (quantity one) to the bag. Hidden and inert until then, so it never doubles the page's own "Add to bag".
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Check, ShoppingBag } from "lucide-react";
import { addToBag, type BagState } from "@/server/shop/actions";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

export function BuyBar({ variantId, name, priceCents, wasCents, note, anchor = "buy-box" }: { variantId: string; name: string; priceCents: number; wasCents?: number | null; note?: string | null; anchor?: string }) {
  const [show, setShow] = useState(false);
  const [state, action, pending] = useActionState<BagState, FormData>(addToBag, {});
  useEffect(() => {
    const el = document.getElementById(anchor);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [anchor]);
  return (
    <>
    {/* In the installed app the bar sits on the tab bar, so the page ends one bar-height lower. */}
    <div aria-hidden className="hidden h-[4.5rem] app:block lg:hidden" />
    <form
      action={action}
      aria-hidden={!show}
      inert={!show}
      className={cn(
        "hh-buybar fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-ink-800 bg-ink-950/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur app:bottom-[calc(4rem+env(safe-area-inset-bottom))] app:z-30 app:pb-3 lg:hidden",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="qty" value={1} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{name}</div>
        <div className="flex items-baseline gap-2 text-xs text-ink-400">
          <span className="tnum font-display text-base font-semibold text-white">{zar(priceCents)}</span>
          {wasCents != null && wasCents > priceCents && <s className="tnum">{zar(wasCents)}</s>}
          {note && <span className="truncate">{note}</span>}
        </div>
      </div>
      {state.ok ? (
        <Link href="/cart" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-leaf-500 px-5 text-sm font-semibold text-ink-950">
          <Check className="h-4 w-4" /> View bag{state.count ? ` (${state.count})` : ""}
        </Link>
      ) : (
        <button disabled={pending} aria-label={`Add ${name} to bag for ${zar(priceCents)}`} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-brand-500 px-5 text-sm font-semibold text-ink-950 hover:bg-brand-400 disabled:opacity-60">
          <ShoppingBag className="h-4 w-4" strokeWidth={1.9} /> {pending ? "Adding…" : "Add"}
        </button>
      )}
      {state.error && <span className="sr-only" role="alert">{state.error}</span>}
    </form>
    </>
  );
}
