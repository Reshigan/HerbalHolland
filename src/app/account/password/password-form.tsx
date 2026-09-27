"use client";
import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  const err = (f: PasswordState["field"]) => (state.field === f ? state.error : undefined);
  return (
    <form action={action} className="space-y-4">
      {state.error && !state.field && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Current password" htmlFor="current" error={err("current")}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required aria-invalid={!!err("current")} />
      </Field>
      <Field label="New password" htmlFor="next" hint="At least 10 characters. A short sentence works well." error={err("next")}>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required aria-invalid={!!err("next")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={err("confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!err("confirm")} />
      </Field>
      <Button className="w-full" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
