"use client";
import { useActionState, useState } from "react";
import { ArrowRight, Check, Gift } from "lucide-react";
import { buyVoucherAction, type GiftState } from "@/app/(shop)/gift/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, TextInput, inputClass } from "./ui";
import { zarWhole } from "@/lib/money";
import { cn } from "@/lib/cn";

export function GiftForm({ amounts, messageMax, defaultEmail }: { amounts: readonly number[]; messageMax: number; defaultEmail?: string | null }) {
  const [state, action, pending] = useActionState<GiftState, FormData>(buyVoucherAction, {});
  const [amount, setAmount] = useState(Number(state.values?.amount) || amounts[1] || amounts[0]);
  const [msg, setMsg] = useState(state.values?.message ?? "");
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="amount" value={amount} />
      <fieldset>
        <legend className="mb-2 text-[0.8rem] font-semibold text-ink-200">Amount</legend>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Voucher amount">
          {amounts.map((a) => {
            const on = a === amount;
            return (
              <button key={a} type="button" role="radio" aria-checked={on} onClick={() => setAmount(a)} className={cn("relative rounded-2xl border p-4 pt-8 text-left transition", on ? "border-brand-500 bg-brand-500/10" : "border-ink-800 bg-ink-900/60 hover:border-ink-600")}>
                <span className="tnum block font-display text-2xl font-semibold text-white">{zarWhole(a)}</span>
                <span className="mt-0.5 block text-xs text-ink-400">gift voucher</span>
                {on && <Check className="absolute right-3 top-3 h-4 w-4 text-brand-400" strokeWidth={2.6} aria-hidden />}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldRow label="Their name (optional)" htmlFor="gift-name">
          <TextInput id="gift-name" name="recipientName" maxLength={60} defaultValue={state.values?.recipientName} placeholder="Who is it for?" />
        </FieldRow>
        <FieldRow label="Their email (optional)" htmlFor="gift-email" hint="We'll email them the voucher with your message. Leave it out to send it yourself.">
          <TextInput id="gift-email" name="recipientEmail" type="email" inputMode="email" autoComplete="off" maxLength={120} defaultValue={state.values?.recipientEmail} placeholder="name@example.co.za" />
        </FieldRow>
        <FieldRow label="Your message (optional)" htmlFor="gift-message" className="sm:col-span-2" hint={`${msg.length}/${messageMax}`}>
          <textarea id="gift-message" name="message" rows={3} maxLength={messageMax} value={msg} onChange={(e) => setMsg(e.target.value)} className={cn(inputClass, "py-3")} placeholder="Happy birthday! Choose something you'll love." />
        </FieldRow>
      </div>
      {state.error && (
        <p className="text-sm font-medium text-rose-100" role="alert">
          {state.error}
        </p>
      )}
      <button disabled={pending} className={buttonClass("primary", "xl", "w-full sm:w-auto")}>
        <Gift className="h-5 w-5" /> {pending ? "One moment…" : `Buy ${zarWhole(amount)} voucher`} {!pending && <ArrowRight className="h-5 w-5" />}
      </button>
      <p className="text-xs text-ink-450">
        You pay {zarWhole(amount)} — no fees, no bonus value. The voucher is emailed to you{defaultEmail ? ` at ${defaultEmail}` : ""} the moment your payment goes through.
      </p>
    </form>
  );
}
