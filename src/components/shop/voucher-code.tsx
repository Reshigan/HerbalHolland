"use client";
import { useActionState } from "react";
import { Gift, X } from "lucide-react";
import { applyVoucherCode, removeVoucherCode, type VoucherState } from "@/server/shop/feature-actions";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "./ui";
import { zar } from "@/lib/money";
import { cn } from "@/lib/cn";

/** The gift voucher field beside the promo code. `applied` says what the voucher will pay on this order. */
export function VoucherCode({ code, applied, error }: { code: string | null; applied: { balanceCents: number; appliedCents: number } | null; error?: string | null }) {
  const [state, action, pending] = useActionState<VoucherState, FormData>(applyVoucherCode, {});
  if (code && applied && !error)
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-leaf-500/35 bg-leaf-500/10 px-3.5 py-2.5 text-sm">
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold text-leaf-100">
            <Gift className="h-4 w-4 shrink-0" /> <span className="truncate">Gift voucher {code}</span>
          </span>
          <span className="block text-xs text-ink-300">
            {applied.appliedCents > 0 ? `${zar(applied.appliedCents)} will come off this order` : "Applies once you continue to checkout"} · {zar(applied.balanceCents)} on the voucher
          </span>
        </span>
        <form action={removeVoucherCode}>
          <button className="grid h-8 w-8 place-items-center rounded-full text-ink-300 hover:bg-ink-800 hover:text-white" aria-label={`Remove voucher ${code}`}>
            <X className="h-4 w-4" />
          </button>
        </form>
      </div>
    );
  return (
    <div>
      <form action={action} className="flex gap-2">
        <label htmlFor="voucher" className="sr-only">
          Gift voucher code
        </label>
        <input id="voucher" name="code" defaultValue={code ?? ""} placeholder="Gift voucher code" autoCapitalize="characters" autoComplete="off" className={cn(inputClass, "h-11 uppercase placeholder:normal-case")} aria-invalid={!!(state.error || error)} />
        <button disabled={pending} className={buttonClass("outline-dark", "md", "h-11 shrink-0")}>
          {pending ? "Checking…" : "Redeem"}
        </button>
      </form>
      {(state.error || error) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-rose-100" role="alert">
          <span>{state.error || error}</span>
          {error && code && (
            <form action={removeVoucherCode}>
              <button className="font-semibold underline">Remove voucher</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
