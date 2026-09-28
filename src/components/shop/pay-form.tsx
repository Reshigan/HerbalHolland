"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CreditCard, Zap } from "lucide-react";
import type { PayState } from "@/app/(shop)/checkout/pay/[orderId]/actions";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { possessive } from "@/lib/online-payments";

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

/** Peach Payments or Yoco: one button to the gateway's secure page, pressed for the member as the page opens (it stays, with any error, if that fails). */
export function HostedPayForm({ action, amount, gateway }: { action: (s: PayState) => Promise<PayState>; amount: string; gateway: string }) {
  const [state, submit, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    form.current?.requestSubmit();
  }, []);
  return (
    <form ref={form} action={submit} className="mt-6 space-y-3">
      {state.error && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100" role="alert">{state.error}</p>}
      <button disabled={pending} className={buttonClass("primary", "xl", "w-full")}>
        {pending ? `Opening ${possessive(gateway)} secure page…` : `Pay ${amount} with ${gateway}`}
      </button>
    </form>
  );
}

/** Back from the gateway before its webhook has landed: refresh a few times until the order shows as paid. */
export function AwaitPayment({ gateway, every = 3000, times = 10 }: { gateway: string; every?: number; times?: number }) {
  const router = useRouter();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= times) return;
    const t = setTimeout(() => (router.refresh(), setN(n + 1)), every);
    return () => clearTimeout(t);
  }, [n, every, times, router]);
  return n >= times ? <p className="mt-2">This is taking longer than usual. We&apos;ll SMS you as soon as {gateway} confirms your payment, so there&apos;s no need to pay again.</p> : null;
}
