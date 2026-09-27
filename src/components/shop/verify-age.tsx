"use client";
import { useActionState } from "react";
import { verifyAgeWithId, type AgeCheckState } from "@/server/shop/actions";
import { buttonClass } from "@/components/ui/button";
import { TextInput } from "./ui";
import { cn } from "@/lib/cn";

export function VerifyAge({ className }: { className?: string }) {
  const [state, action, pending] = useActionState<AgeCheckState, FormData>(verifyAgeWithId, {});
  if (state.ok) return <p className={cn("font-semibold text-leaf-100", className)} role="status">Thanks — you&apos;re verified.</p>;
  return (
    <form action={action} className={className}>
      <label htmlFor="verify-id" className="mb-1.5 block text-[0.8rem] font-semibold text-ink-100">
        SA ID number
      </label>
      <div className="flex gap-2">
        <TextInput id="verify-id" name="idNumber" inputMode="numeric" autoComplete="off" maxLength={16} required className="tnum tracking-wider" aria-invalid={!!state.error} />
        <button disabled={pending} className={buttonClass("primary", "lg", "h-12 shrink-0")}>
          {pending ? "Checking…" : "Verify"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs font-medium text-rose-100" role="alert">{state.error}</p>}
      <p className="mt-2 text-xs text-ink-400">We check the number&apos;s format and date of birth, and keep only a secure fingerprint and the last four digits.</p>
    </form>
  );
}
