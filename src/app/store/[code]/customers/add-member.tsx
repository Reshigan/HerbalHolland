"use client";
import { UserPlus } from "lucide-react";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Drawer } from "@/components/store/drawer";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";

const CHANNELS = [
  ["SMS", "SMS"],
  ["WHATSAPP", "WhatsApp"],
  ["EMAIL", "Email"],
  ["PUSH", "App notifications"],
] as const;

export function AddMember({ action, wording, storeName }: { action: FormAction; wording: string; storeName: string }) {
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
        <Field label="Email (optional)" htmlFor="m-email" hint="Where tax invoices are sent">
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
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-[0.78rem] font-semibold text-ink-700">Marketing consent (ask — never pre-tick)</legend>
          <p className="mb-2 text-xs text-ink-500">“{wording}”</p>
          <div className="grid grid-cols-2 gap-2">
            {CHANNELS.map(([k, l]) => (
              <Checkbox key={k} name={`consent:${k}`} label={l} />
            ))}
          </div>
        </fieldset>
        <SubmitButton className="w-full" size="lg" pendingLabel="Enrolling…">
          Enrol member
        </SubmitButton>
        <p className="text-center text-xs text-ink-400">New members get their welcome points straight away.</p>
      </ActionForm>
    </Drawer>
  );
}
