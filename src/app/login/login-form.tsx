"use client";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@herbalholland.com" defaultValue={state.email} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button className="w-full" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function DemoLogin({ email, label, sub }: { email: string; label: string; sub: string }) {
  const [, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="demo" value="1" />
      <button disabled={pending} className="w-full rounded-xl border border-ink-150 bg-white px-3.5 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60">
        <div className="text-sm font-semibold text-ink-900">{label}</div>
        <div className="text-xs text-ink-500">{sub}</div>
      </button>
    </form>
  );
}
