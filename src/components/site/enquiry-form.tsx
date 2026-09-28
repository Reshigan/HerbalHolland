"use client";
// The franchise enquiry form on herbalholland.com/franchise (server action: enquire in src/app/site/franchise/actions.ts).
// A plain form post, so it works before the page's JavaScript has loaded. After an error the server sends back what was
// typed and the form re-renders with it (React resets a form once its action has run). The hidden "website" field is a
// honeypot: people never see or reach it; form-filling bots fill it in, and their enquiry is quietly dropped.
import { useActionState, useEffect, useRef } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { enquire, type EnquiryState } from "@/app/site/franchise/actions";
import { CAPITAL_BANDS, CAPITAL_LABEL, DISCLOSURE_DAYS, LEAD_LIMITS, leadSource, type LeadField } from "@/lib/leads";
import { PROVINCES } from "@/lib/sa";
import { buttonClass } from "@/components/ui/button";
import { SelectInput, TextInput, inputClass } from "@/components/shop/ui";
import { cn } from "@/lib/cn";

// Visual order: after an error, focus goes to the first field that needs attention.
const ORDER: LeadField[] = ["name", "email", "phone", "area", "province", "capital", "experience", "pharmacist", "message", "consent"];
const idOf = (f: LeadField) => (f === "pharmacist" ? "enq-pharmacist-yes" : `enq-${f}`);

export function EnquiryForm({ source, privacyHref = "/legal/privacy" }: { source?: string; privacyHref?: string }) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(enquire, {});
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state.at || state.ok) return;
    const first = ORDER.find((f) => state.fields?.[f]);
    const el = first ? document.getElementById(idOf(first)) : summary.current;
    // Centred, so the site's sticky header never covers the field that needs attention.
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }, [state]);

  if (state.ok) return <ThankYou number={state.number ?? null} />;
  const v = state.values ?? {};
  const err = state.fields ?? {};
  const tag = leadSource(source);
  /** aria wiring: invalid + the error, or the hint, as the description. */
  const aria = (f: LeadField, hint = false) => ({
    "aria-invalid": err[f] ? true : undefined,
    "aria-describedby": err[f] ? `enq-${f}-error` : hint ? `enq-${f}-hint` : undefined,
  });

  return (
    // Keyed by each response, so the fields re-mount with what came back (defaults don't update a mounted form).
    <form key={state.at ?? 0} action={action} noValidate className="relative space-y-5" aria-label="Franchise enquiry">
      {state.error && (
        <div ref={summary} tabIndex={-1} role="alert" className="flex gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3.5 text-sm leading-relaxed text-rose-100 focus:outline-none">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} aria-hidden />
          <p>{state.error}</p>
        </div>
      )}

      <input type="hidden" name="source" value={tag ?? ""} />
      <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="enq-website">Website (leave this empty)</label>
        <input id="enq-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Row field="name" label="Your name" error={err.name}>
          <TextInput id="enq-name" name="name" defaultValue={v.name} autoComplete="name" required maxLength={LEAD_LIMITS.name} {...aria("name")} />
        </Row>
        <Row field="email" label="Email address" error={err.email}>
          <TextInput id="enq-email" name="email" type="email" inputMode="email" defaultValue={v.email} autoComplete="email" required maxLength={LEAD_LIMITS.email} {...aria("email")} />
        </Row>
        <Row field="phone" label="Mobile number" hint="A South African mobile, e.g. 082 123 4567" error={err.phone}>
          <TextInput id="enq-phone" name="phone" type="tel" inputMode="tel" defaultValue={v.phone} autoComplete="tel" required maxLength={20} {...aria("phone", true)} />
        </Row>
        <Row field="area" label="Where would you like to open?" hint="A town or area, e.g. Ballito or Hatfield, Pretoria" error={err.area}>
          <TextInput id="enq-area" name="area" defaultValue={v.area} autoComplete="address-level2" required maxLength={LEAD_LIMITS.area} {...aria("area", true)} />
        </Row>
        <Row field="province" label="Province" error={err.province}>
          <SelectInput id="enq-province" name="province" defaultValue={v.province ?? ""} autoComplete="address-level1" required {...aria("province")}>
            <option value="" disabled>
              Choose a province
            </option>
            {Object.entries(PROVINCES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </SelectInput>
        </Row>
        <Row field="capital" label={CAPITAL_LABEL} hint="Your own funds you could invest; a rough band is fine. It isn't what a store costs: we'll take you through the full investment." error={err.capital}>
          <SelectInput id="enq-capital" name="capital" defaultValue={v.capital ?? ""} required {...aria("capital", true)}>
            <option value="" disabled>
              Choose a band
            </option>
            {CAPITAL_BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </SelectInput>
        </Row>
      </div>

      <Row field="experience" label="Your retail or business experience" hint="A few lines on what you've run or managed, and for how long." error={err.experience}>
        <textarea
          id="enq-experience"
          name="experience"
          defaultValue={v.experience}
          rows={4}
          required
          minLength={LEAD_LIMITS.experienceMin}
          maxLength={LEAD_LIMITS.experience}
          className={cn(inputClass, "min-h-32 py-3 leading-relaxed")}
          {...aria("experience", true)}
        />
      </Row>

      <fieldset>
        <legend className="mb-1.5 block text-[0.8rem] font-semibold text-ink-200">Do you have access to a pharmacist partner?</legend>
        <div className="grid max-w-sm grid-cols-2 gap-3">
          {(
            [
              ["yes", "Yes"],
              ["no", "No"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-4 text-[0.95rem] text-white transition hover:border-ink-500 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/25"
            >
              <input id={`enq-pharmacist-${value}`} type="radio" name="pharmacist" value={value} defaultChecked={v.pharmacist === value} required className="h-5 w-5 shrink-0 cursor-pointer accent-brand-500 focus:outline-none" {...aria("pharmacist", true)} />
              {label}
            </label>
          ))}
        </div>
        <Help field="pharmacist" error={err.pharmacist} hint="Our stores need a pharmacist for licensed medicines. No partner yet? That's fine: say no." />
      </fieldset>

      <Row field="message" label="Anything else you'd like us to know?" optional hint={`Up to ${LEAD_LIMITS.message.toLocaleString("en-US")} characters.`} error={err.message}>
        <textarea id="enq-message" name="message" defaultValue={v.message} rows={3} maxLength={LEAD_LIMITS.message} className={cn(inputClass, "min-h-24 py-3 leading-relaxed")} {...aria("message", true)} />
      </Row>

      <div>
        <label htmlFor="enq-consent" className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
          <input id="enq-consent" type="checkbox" name="consent" defaultChecked={v.consent === "on"} required className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-brand-500" {...aria("consent", true)} />
          <span className="text-sm font-medium leading-snug text-ink-100">Herbal Holland may use these details to reply to my franchise enquiry.</span>
        </label>
        <Help
          field="consent"
          error={err.consent}
          className="pl-8"
          hint={
            <>
              How we look after your information:{" "}
              <a href={privacyHref} target="_blank" rel="noopener" className="font-medium text-ink-200 underline underline-offset-2 hover:text-white">
                privacy notice<span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </>
          }
        />
      </div>

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:gap-5">
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full shrink-0 sm:w-auto")}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…
            </>
          ) : (
            <>
              Send my enquiry <ArrowRight className="h-4 w-4" strokeWidth={1.9} aria-hidden />
            </>
          )}
        </button>
        <p className="text-xs leading-relaxed text-ink-400">No newsletters: we use your details only to reply to this enquiry. Enquiries that don&apos;t go further are deleted after a year.</p>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? "Sending your enquiry…" : ""}
      </p>
    </form>
  );
}

function Row({ field, label, hint, error, optional, children }: { field: LeadField; label: React.ReactNode; hint?: React.ReactNode; error?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={`enq-${field}`} className="mb-1.5 block text-[0.8rem] font-semibold text-ink-200">
        {label}
        {optional && <span className="font-normal text-ink-400"> (optional)</span>}
      </label>
      {children}
      <Help field={field} error={error} hint={hint} />
    </div>
  );
}

/** The field's error (icon + words, never colour alone) or its hint. */
function Help({ field, error, hint, className }: { field: LeadField; error?: string; hint?: React.ReactNode; className?: string }) {
  if (error)
    return (
      <p id={`enq-${field}-error`} className={cn("mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-100", className)}>
        <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.9} aria-hidden />
        {error}
      </p>
    );
  return hint ? (
    <p id={`enq-${field}-hint`} className={cn("mt-1.5 text-xs leading-relaxed text-ink-400", className)}>
      {hint}
    </p>
  ) : null;
}

function ThankYou({ number }: { number: string | null }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: "center" });
    heading.current?.focus({ preventScroll: true });
  }, []);
  const steps = [
    "We read every enquiry and reply by email within a few working days.",
    "If it looks like a fit, we'll invite you to an information evening to meet the team and see how a Herbal Holland store works.",
    `If you'd like to go further, you'll get our disclosure document at least ${DISCLOSURE_DAYS} days before anything is signed, as the Consumer Protection Act's franchise regulations require.`,
  ];
  return (
    // It takes the form's place, so it sits in whatever panel the page gives the form.
    <div className="py-1">
      <CircleCheck className="h-9 w-9 text-brand-400" strokeWidth={1.9} aria-hidden />
      <h3 ref={heading} tabIndex={-1} className="mt-4 font-display text-2xl font-semibold tracking-tight text-white focus:outline-none">
        Thank you: your enquiry is in
      </h3>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-200">
        {number ? (
          <>
            Your reference is <span className="tnum font-semibold text-white">{number}</span>. We&apos;ve emailed you a copy.
          </>
        ) : (
          "We've received your enquiry."
        )}
      </p>
      <p className="eyebrow mt-6 text-brand-500">What happens next</p>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed text-ink-100">
            <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brand-500/60 font-display text-sm font-semibold text-brand-400" aria-hidden>
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
