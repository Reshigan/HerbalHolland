"use client";
import { useActionState } from "react";
import { setPassword, type PasswordState } from "@/app/club/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, TextInput } from "./ui";

/** Set, change or remove the password used to sign in with a mobile number or email. */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, {});
  return (
    <form action={action} className="space-y-4">
      <FieldRow label={hasPassword ? "New password" : "Password"} htmlFor="pw-new" error={state.error} hint="10 characters or more. Not your name or email.">
        <TextInput id="pw-new" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required aria-invalid={!!state.error} />
      </FieldRow>
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={pending} className={buttonClass("primary", "lg")}>
          {pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
        </button>
        {hasPassword && (
          <button name="remove" value="1" formNoValidate disabled={pending} className="h-11 px-2 text-sm font-medium text-ink-400 underline underline-offset-4 hover:text-white">
            Remove password
          </button>
        )}
        {state.ok && (
          <span className="text-sm font-medium text-leaf-100" role="status">
            {state.ok === "set" ? "Password saved" : "Password removed"}
          </span>
        )}
      </div>
    </form>
  );
}
