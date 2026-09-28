"use client";
import { useActionState } from "react";
import { Tag as TagIcon, X } from "lucide-react";
import { applyPromoCode, removePromoCode, type PromoState } from "@/server/shop/actions";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "./ui";
import { cn } from "@/lib/cn";

export function PromoCode({ code, error }: { code: string | null; error?: string | null }) {
  const [state, action, pending] = useActionState<PromoState, FormData>(applyPromoCode, {});
  if (code && !error)
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-leaf-500/35 bg-leaf-500/10 px-3.5 py-2.5 text-sm">
        <span className="flex items-center gap-2 font-semibold text-leaf-100">
          <TagIcon className="h-4 w-4" /> {code} applied
        </span>
        <form action={removePromoCode}>
          <button className="grid h-8 w-8 place-items-center rounded-full text-ink-300 hover:bg-ink-800 hover:text-white" aria-label={`Remove code ${code}`}>
            <X className="h-4 w-4" />
          </button>
        </form>
      </div>
    );
  return (
    <div>
      <form action={action} className="flex gap-2">
        <label htmlFor="promo" className="sr-only">
          Promo code
        </label>
        <input id="promo" name="code" defaultValue={code ?? ""} placeholder="Promo code" autoCapitalize="characters" autoComplete="off" className={cn(inputClass, "h-11 uppercase placeholder:normal-case")} aria-invalid={!!(state.error || error)} />
        <button disabled={pending} className={buttonClass("outline-dark", "md", "h-11 shrink-0")}>
          {pending ? "Checking…" : "Apply"}
        </button>
      </form>
      {(state.error || error) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-rose-100" role="alert">
          <span>{state.error || error}</span>
          {error && code && (
            <form action={removePromoCode}>
              <button className="font-semibold underline">Remove code</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
