"use client";
import { UserPlus } from "lucide-react";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Drawer } from "@/components/store/drawer";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";
import { DEALS_QUESTION, KEY_TERMS, TERMS_LABEL } from "@/lib/terms";
import { INTERESTS, type InterestKey } from "@/lib/rfm";

export function AddMember({ action, storeName }: { action: FormAction; storeName: string }) {
  return (
    <Drawer label="Add member" icon={<UserPlus className="h-4 w-4" aria-hidden />} title="Add a member" description={`Herbal Holland Rewards · home store ${storeName}. Adults 18+ only.`}>
      <ActionForm action={action} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="m-first">
            <Input id="m-first" name="firstName" required maxLength={60} autoComplete="off" />
            <FieldError name="firstName" />
          </Field>
          <Field label="Last name" htmlFor="m-last">
            <Input id="m-last" name="lastName" maxLength={60} autoComplete="off" />
          </Field>
        </div>
        <Field label="Mobile number" htmlFor="m-phone" hint="Used to sign in with a one-time code">
          <Input id="m-phone" name="phone" type="tel" inputMode="tel" required placeholder="082 123 4567" autoComplete="off" />
          <FieldError name="phone" />
        </Field>
        <Field label="Email (optional)" htmlFor="m-email" hint="For member deals and tax invoices">
          <Input id="m-email" name="email" type="email" maxLength={120} autoComplete="off" />
          <FieldError name="email" />
        </Field>
        <fieldset className="space-y-3 rounded-2xl bg-ink-50 p-4">
          <legend className="sr-only">Age verification</legend>
          <Field label="SA ID number (optional)" htmlFor="m-id" hint="Checked for a valid date of birth and check digit. Only a hash and the last 4 digits are stored.">
            <Input id="m-id" name="idNumber" inputMode="numeric" maxLength={13} autoComplete="off" />
          </Field>
          <Checkbox name="idSighted" label="I've seen an ID document and the member is 18 or older" description="Passport, driver's licence or smart ID card" />
          <FieldError name="idSighted" />
          <Field label="Date of birth (if no SA ID number)" htmlFor="m-dob" hint="From the document you've seen — it's how they get birthday deals">
            <Input id="m-dob" name="dob" type="date" />
            <FieldError name="dob" />
          </Field>
        </fieldset>
        <fieldset className="rounded-2xl bg-ink-50 p-4">
          <legend className="sr-only">Member deals and news</legend>
          <div className="text-[0.78rem] font-semibold text-ink-700">Member deals &amp; news — ask them</div>
          <p className="mt-1 text-sm text-ink-600">&ldquo;{DEALS_QUESTION}&rdquo;</p>
          <p className="mt-1 text-xs text-ink-500">Their answer is recorded with this question as their marketing consent.</p>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="deals" value="yes" className="h-4 w-4 accent-brand-500" /> Yes, send deals
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="deals" value="no" className="h-4 w-4 accent-brand-500" /> No thanks
            </label>
          </div>
          <FieldError name="deals" />
          <div className="mt-3 text-[0.78rem] font-semibold text-ink-700">What are they into? (optional)</div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(Object.keys(INTERESTS) as InterestKey[]).map((k) => (
              <Checkbox key={k} name="interest" value={k} label={INTERESTS[k]} />
            ))}
          </div>
        </fieldset>
        <div className="rounded-2xl bg-ink-50 p-4">
          <div className="text-[0.78rem] font-semibold text-ink-700">Key membership terms — the member reads these first</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-600">
            {KEY_TERMS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-500">Full terms at herbalholland.co.za/legal/terms · {TERMS_LABEL}</p>
          <div className="mt-3">
            <Checkbox name="acceptTerms" label="The member has read the key terms and accepts the membership terms and privacy notice" />
            <FieldError name="acceptTerms" />
          </div>
        </div>
        <SubmitButton className="w-full" size="lg" pendingLabel="Enrolling…">
          Enrol member
        </SubmitButton>
        <p className="text-center text-xs text-ink-500">New members get their welcome points straight away.</p>
      </ActionForm>
    </Drawer>
  );
}
