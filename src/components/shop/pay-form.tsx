"use client";
import { useActionState, useState } from "react";
import { Building2, CreditCard, Zap } from "lucide-react";
import type { PayState } from "@/app/(shop)/checkout/pay/[orderId]/actions";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const METHODS = [
  { key: "EFT", label: "Instant EFT", sub: "Pay from your banking app", icon: <Building2 className="h-5 w-5" /> },
  { key: "PAYSHAP", label: "PayShap", sub: "Pay with your ShapID or phone number", icon: <Zap className="h-5 w-5" /> },
  { key: "CARD", label: "Card", sub: "Visa or Mastercard", icon: <CreditCard className="h-5 w-5" /> },
] as const;

export function PayForm({ action, amount }: { action: (s: PayState, f: FormData) => Promise<PayState>; amount: string }) {
  const [state, submit, pending] = useActionState(action, {});
  const [method, setMethod] = useState<string>("EFT");
  return (
    <form action={submit} className="mt-6 space-y-3">
      <input type="hidden" name="method" value={method} />
      <div role="radiogroup" aria-label="Payment method" className="space-y-2">
        {METHODS.map((m) => {
          const on = method === m.key;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMethod(m.key)}
              className={cn("flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition", on ? "border-brand-500 bg-brand-500/10" : "border-ink-800 hover:border-ink-600")}
            >
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", on ? "bg-brand-500 text-ink-950" : "bg-ink-850 text-brand-400")}>{m.icon}</span>
              <span>
                <span className="block font-semibold text-white">{m.label}</span>
                <span className="block text-xs text-ink-400">{m.sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      {state.error && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100" role="alert">{state.error}</p>}
      <button disabled={pending} className={buttonClass("primary", "xl", "w-full")}>
        {pending ? "Confirming payment…" : `Pay ${amount}`}
      </button>
    </form>
  );
}
