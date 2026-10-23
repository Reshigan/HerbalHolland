"use client";
import { useActionState } from "react";
import { forgot, type ForgotState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Notice } from "@/components/ui/page";

export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(forgot, {});
  if (state.sent) return <Notice tone="success">{state.sent}</Notice>;
  return (
    <form action={action} className="space-y-4">
      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@herbalholland.com" />
      </Field>
      <Button className="w-full" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Email me a reset link"}
      </Button>
    </form>
  );
}
