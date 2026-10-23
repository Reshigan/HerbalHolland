"use client";
import { useActionState } from "react";
import { reset, type ResetState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(reset, {});
  const err = (f: ResetState["field"]) => (state.field === f ? state.error : undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      {state.error && !state.field && <Notice tone="danger">{state.error}</Notice>}
      <Field label="New password" htmlFor="next" hint="At least 10 characters, without your name or email. A short sentence works well." error={err("next")}>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required aria-invalid={!!err("next")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={err("confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!err("confirm")} />
      </Field>
      <Button className="w-full" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save password and sign in"}
      </Button>
    </form>
  );
}
