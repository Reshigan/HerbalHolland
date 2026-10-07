"use client";
// The support form on the dark surface. A signed-in member's details are filled in (and hidden fields carry them);
// visitors give a name and an email address and tick the consent line (POPIA). The `website` field is a honeypot:
// people never see it, bots fill it, and such submissions are quietly dropped.
import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitTicket, type TicketFormState } from "@/app/support/actions";
import { buttonClass } from "@/components/ui/button";
import { Callout, CheckRow, FieldRow, SelectInput, TextInput, inputClass } from "@/components/shop/ui";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY, TICKET_LIMITS } from "@/lib/support";
import { cn } from "@/lib/cn";

export type TicketPrefill = { name: string; email: string; phone: string; orderCode: string; category: string; subject: string; body: string };

export function TicketForm({ member, prefill }: { member: { firstName: string; hasEmail: boolean } | null; prefill: TicketPrefill }) {
  const [state, action, pending] = useActionState<TicketFormState, FormData>(submitTicket, {});
  const v = state.values ?? prefill;
  const f = state.fields ?? {};
  if (state.ok)
    return (
      <Callout tone="success" icon={<CheckCircle2 className="h-5 w-5" />} title={state.number ? `Thanks. Your request is ${state.number}.` : "Thanks, we have your message."}>
        We&apos;ve emailed you a copy and we&apos;ll reply within one business day. {state.number ? `Quote ${state.number} if you write to us again.` : ""}{" "}
        <Link href="/club/join?next=/club/support" className="font-semibold text-white underline">
          Join Rewards
        </Link>{" "}
        to follow your requests online.
      </Callout>
    );
  return (
    <form action={action} className="space-y-5" aria-label="Ask for help">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldRow label="Your name" htmlFor="t-name" error={f.name}>
          <TextInput id="t-name" name="name" defaultValue={v.name} autoComplete="name" required maxLength={TICKET_LIMITS.name} />
        </FieldRow>
        <FieldRow label={member?.hasEmail ? "Email" : member ? "Email (optional, we'll text you otherwise)" : "Email"} htmlFor="t-email" error={f.email} hint={member ? undefined : "We reply by email."}>
          <TextInput id="t-email" name="email" type="email" defaultValue={v.email} autoComplete="email" required={!member} maxLength={TICKET_LIMITS.email} />
        </FieldRow>
        <FieldRow label="Mobile number (optional)" htmlFor="t-phone" error={f.phone}>
          <TextInput id="t-phone" name="phone" type="tel" inputMode="tel" defaultValue={v.phone} autoComplete="tel" placeholder="082 123 4567" />
        </FieldRow>
        <FieldRow label="What's it about?" htmlFor="t-category" error={f.category}>
          <SelectInput key={v.category} id="t-category" name="category" defaultValue={v.category} required>
            <option value="" disabled>
              Choose one
            </option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SUPPORT_CATEGORY[c].label}
              </option>
            ))}
          </SelectInput>
        </FieldRow>
        <FieldRow label="Order code (if it's about an order)" htmlFor="t-order" error={f.orderCode} hint="It's in your order confirmation and under Rewards → Orders.">
          <TextInput id="t-order" name="orderCode" defaultValue={v.orderCode} placeholder="7K2M9P" maxLength={12} autoCapitalize="characters" />
        </FieldRow>
        <FieldRow label="Subject" htmlFor="t-subject" error={f.subject}>
          <TextInput id="t-subject" name="subject" defaultValue={v.subject} required maxLength={TICKET_LIMITS.subject} placeholder="A few words" />
        </FieldRow>
      </div>
      <FieldRow label="What happened?" htmlFor="t-body" error={f.body} hint={`At least ${TICKET_LIMITS.bodyMin} characters. Batch codes, dates and what you've tried all help.`}>
        <textarea id="t-body" name="body" required minLength={TICKET_LIMITS.bodyMin} maxLength={TICKET_LIMITS.body} rows={6} defaultValue={v.body} className={cn(inputClass, "py-3")} />
      </FieldRow>
      {/* Honeypot: hidden from people (and from assistive technology), filled by bots. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="t-website">Website</label>
        <input id="t-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      {!member && (
        <div>
          <CheckRow name="consent" label="You may use these details to reply to me" description="We keep your request for a year after it's resolved, then delete it. See our privacy notice." />
          {f.consent && (
            <p className="mt-1 text-xs font-medium text-rose-100" role="alert">
              {f.consent}
            </p>
          )}
        </div>
      )}
      {state.error && (
        <p className="text-sm font-medium text-rose-100" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={pending} className={buttonClass("primary", "lg")}>
          {pending ? "Sending…" : "Send"}
        </button>
        <span className="text-xs text-ink-400">We reply within one business day.</span>
      </div>
    </form>
  );
}
