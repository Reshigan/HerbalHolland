"use client";
// Email → 6-digit code, like the members' phone sign-in. DEMO_MODE shows the code with a "Fill it in" shortcut.
import { useActionState, useState } from "react";
import { ArrowRight, KeyRound, Mail, MessageSquareText } from "lucide-react";
import { loginFlow, type LoginState } from "@/app/trade/login/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, TextInput } from "@/components/shop/ui";
import { LOGIN } from "./copy";
import { cn } from "@/lib/cn";

export function TradeLogin({ next, email: initialEmail }: { next?: string | null; email?: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginFlow, { step: "email" });
  const [code, setCode] = useState("");
  const hidden = (
    <>
      {next && <input type="hidden" name="next" value={next} />}
      {state.email && <input type="hidden" name="email" value={state.email} />}
    </>
  );

  return (
    <div>
      <ol className="mb-6 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wider" aria-label="Progress">
        {["Email", "Code"].map((l, n) => {
          const i = state.step === "email" ? 0 : 1;
          return (
            <li key={l} className="flex items-center gap-2">
              <span className={cn("grid h-6 w-6 place-items-center rounded-full text-[0.68rem]", n < i ? "bg-leaf-500 text-ink-950" : n === i ? "bg-brand-500 text-ink-950" : "bg-ink-800 text-ink-400")} aria-current={n === i ? "step" : undefined}>
                {n + 1}
              </span>
              <span className={n === i ? "text-white" : "text-ink-450"}>{l}</span>
              {n < 1 && <span className="mx-1 h-px w-6 bg-ink-700" aria-hidden />}
            </li>
          );
        })}
      </ol>
      {state.error && (
        <p className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
          {state.error}
        </p>
      )}

      {state.step === "email" && (
        <form action={action} className="space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <input type="hidden" name="intent" value="send" />
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">{LOGIN.title}</h2>
            <p className="mt-1 text-sm text-ink-400">{LOGIN.lead}</p>
          </div>
          <FieldRow label="Email address" htmlFor="trade-email" error={state.fields?.email} hint="The buyer's address on the trade account.">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <TextInput id="trade-email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={initialEmail ?? undefined} placeholder="buyer@yourbusiness.co.za" className="pl-11 text-lg" aria-invalid={!!state.fields?.email} autoFocus={!!state.fields?.email} />
            </div>
          </FieldRow>
          <button disabled={pending} className={buttonClass("primary", "xl", "w-full")}>
            {pending ? "Sending…" : "Send my code"} <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
        </form>
      )}

      {state.step === "code" && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">Enter your code</h2>
            <p className="mt-1 text-sm text-ink-400">
              If <strong className="text-ink-100">{state.email}</strong> is a buyer&apos;s address, a code is on its way. It expires in 10 minutes and works once.
            </p>
          </div>
          {state.demoCode && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-50">
              <span className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4" aria-hidden /> Demo mode — your code is <strong className="tnum tracking-widest">{state.demoCode}</strong>
              </span>
              <button type="button" onClick={() => setCode(state.demoCode!)} className="shrink-0 font-semibold underline">
                Fill it in
              </button>
            </div>
          )}
          <form action={action} className="space-y-4">
            {hidden}
            <input type="hidden" name="intent" value="verify" />
            <FieldRow label="6-digit code" htmlFor="trade-code" error={state.fields?.code}>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
                <TextInput
                  id="trade-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="tnum pl-11 text-xl tracking-[0.5em]"
                  aria-invalid={!!state.fields?.code}
                  autoFocus
                />
              </div>
            </FieldRow>
            <button disabled={pending || code.length !== 6} className={buttonClass("primary", "xl", "w-full")}>
              {pending ? "Checking…" : "Sign in"}
            </button>
          </form>
          <div className="flex items-center justify-between text-sm">
            <form action={action}>
              <input type="hidden" name="intent" value="restart" />
              <button className="font-medium text-ink-400 hover:text-white">Use a different address</button>
            </form>
            <form action={action}>
              {hidden}
              <input type="hidden" name="intent" value="send" />
              <button className="font-semibold text-brand-400 hover:underline">Send a new code</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
