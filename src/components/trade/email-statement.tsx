"use client";
import { useActionState } from "react";
import { Check, Mail } from "lucide-react";
import { emailStatementAction, type EmailStatementState } from "@/app/trade/statements/actions";
import { buttonClass } from "@/components/ui/button";

export function EmailStatementButton({ month }: { month: string }) {
  const [state, action, pending] = useActionState<EmailStatementState, FormData>(emailStatementAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="month" value={month} />
      <button disabled={pending} className={buttonClass("outline-dark", "md")}>
        {state.ok ? <Check className="h-4 w-4" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
        {pending ? "Sending…" : state.ok ? "Sent" : "Email me this statement"}
      </button>
      {state.ok && (
        <span className="text-xs text-ink-300" role="status">
          Sent to {state.to}.
        </span>
      )}
      {state.error && (
        <span className="text-xs font-medium text-rose-100" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
