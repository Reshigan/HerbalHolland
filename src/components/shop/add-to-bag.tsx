"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { addToBag, type BagState } from "@/server/shop/actions";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** Add-to-bag form. `compact` renders the round quick-add used on product cards; `plain` a single labelled button (qty 1). */
export function AddToBag({ variantId, name, disabled, compact, plain, label = "Add to bag", className }: { variantId: string; name: string; disabled?: boolean; compact?: boolean; plain?: boolean; label?: string; className?: string }) {
  const [state, action, pending] = useActionState<BagState, FormData>(addToBag, {});
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!state.at) return;
    setToast(true);
    const t = setTimeout(() => setToast(false), 3800);
    return () => clearTimeout(t);
  }, [state.at]);

  return (
    <form action={action} className={cn(compact ? "relative z-10" : plain ? "relative" : "space-y-3", className)}>
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="qty" value={qty} />
      {plain ? (
        <button disabled={pending || disabled} className={buttonClass("primary", "md", "h-11 w-full sm:w-auto")}>
          {state.ok && toast ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" strokeWidth={1.9} />}
          {pending ? "Adding…" : state.ok && toast ? "Added" : label}
        </button>
      ) : compact ? (
        <button
          disabled={pending || disabled}
          aria-label={`Add ${name} to bag`}
          title="Add to bag"
          className="grid h-11 w-11 place-items-center rounded-full bg-brand-500 text-ink-950 shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)] transition hover:bg-brand-400 active:scale-95 disabled:opacity-40"
        >
          {pending ? <ShoppingBag className="h-[18px] w-[18px] animate-pulse" /> : state.ok && toast ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" strokeWidth={2.2} />}
        </button>
      ) : (
        <div className="flex gap-3">
          <div className="flex h-14 items-center rounded-full border border-ink-700 bg-ink-900" role="group" aria-label="Quantity">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-14 w-12 place-items-center rounded-l-full text-ink-200 hover:text-white disabled:opacity-40" disabled={qty <= 1} aria-label="One less">
              <Minus className="h-4 w-4" />
            </button>
            <output className="tnum w-8 text-center font-display text-lg font-semibold text-white" aria-live="polite">
              {qty}
            </output>
            <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} className="grid h-14 w-12 place-items-center rounded-r-full text-ink-200 hover:text-white" aria-label="One more">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button disabled={pending || disabled} className={buttonClass("primary", "xl", "flex-1")}>
            <ShoppingBag className="h-5 w-5" strokeWidth={1.9} />
            {pending ? "Adding…" : label}
          </button>
        </div>
      )}
      {state.error && (
        <p className={cn("text-sm font-medium text-rose-100", compact && "absolute right-0 top-full mt-2 w-56 rounded-xl bg-ink-800 p-2.5 text-xs shadow-lift")} role="alert">
          {state.error}
        </p>
      )}
      {toast && state.ok && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md animate-rise items-center gap-3 rounded-2xl border border-ink-700 bg-ink-900/95 p-3 pl-4 text-sm text-ink-100 shadow-lift backdrop-blur sm:inset-x-auto sm:right-6 sm:bottom-6">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500 text-ink-950">
            <Check className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1 truncate">{state.message}</span>
          <Link href="/cart" className={buttonClass("outline-dark", "sm", "shrink-0")}>
            View bag ({state.count})
          </Link>
        </div>
      )}
    </form>
  );
}
