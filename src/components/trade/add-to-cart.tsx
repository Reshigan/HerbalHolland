"use client";
// Add whole cases of a range line to the trade cart: a case stepper and an Add button posting to addToCartAction,
// which re-reads the case pack on the server and refreshes the page's cart bar.
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { addToCartAction, type CartActionState } from "@/app/trade/actions";
import { buttonClass } from "@/components/ui/button";
import { fmtCases } from "./format";
import { cn } from "@/lib/cn";

export function AddToTradeCart({ variantId, name, caseQty, inCart, disabled, className }: { variantId: string; name: string; caseQty: number; inCart: number; disabled?: boolean; className?: string }) {
  const [state, action, pending] = useActionState<CartActionState, FormData>(addToCartAction, {});
  const [cases, setCases] = useState(1);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!state.at) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 3500);
    return () => clearTimeout(t);
  }, [state.at]);
  const units = cases * caseQty;
  const have = state.qty ?? inCart;
  return (
    <form action={action} className={cn("flex flex-col gap-2", className)}>
      <input type="hidden" name="variantId" value={variantId} />
      <div className="flex items-center gap-2">
        <div className="flex h-11 items-center rounded-full border border-ink-700" role="group" aria-label={`Cases of ${name}`}>
          <button type="button" onClick={() => setCases((c) => Math.max(1, c - 1))} disabled={disabled || cases <= 1} className="grid h-11 w-11 place-items-center rounded-full text-ink-200 transition hover:bg-ink-800 disabled:opacity-40" aria-label="One case fewer">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <label className="sr-only" htmlFor={`cases-${variantId}`}>
            Cases
          </label>
          <input
            id={`cases-${variantId}`}
            name="cases"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={cases}
            onChange={(e) => setCases(Math.max(1, Math.min(999, Math.floor(Number(e.target.value)) || 1)))}
            disabled={disabled}
            className="tnum h-11 w-12 bg-transparent text-center text-sm font-semibold text-white [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button type="button" onClick={() => setCases((c) => Math.min(999, c + 1))} disabled={disabled || cases >= 999} className="grid h-11 w-11 place-items-center rounded-full text-ink-200 transition hover:bg-ink-800 disabled:opacity-40" aria-label="One case more">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <button disabled={pending || disabled} className={buttonClass("primary", "md", "h-11")} aria-label={`Add ${cases} ${cases === 1 ? "case" : "cases"} of ${name} to the cart`}>
          {flash && state.ok ? <Check className="h-4 w-4" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
          {pending ? "Adding…" : flash && state.ok ? "Added" : "Add"}
        </button>
      </div>
      <p className="text-xs text-ink-400" aria-live="polite">
        {caseQty > 1 ? `${cases} ${cases === 1 ? "case" : "cases"} = ${units} units` : `${units} ${units === 1 ? "unit" : "units"}`}
        {have > 0 && (
          <>
            {" · "}
            <Link href="/trade/cart" className="font-semibold text-brand-400 underline hover:text-brand-300">
              in cart: {fmtCases(have, caseQty)}
            </Link>
          </>
        )}
        {state.error && <span className="block font-medium text-rose-100">{state.error}</span>}
      </p>
    </form>
  );
}
