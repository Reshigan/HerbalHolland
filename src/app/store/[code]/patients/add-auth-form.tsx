"use client";
import { Field, Input } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";

export function AddAuthForm({ action, member, today }: { action: FormAction; member?: string; today: string }) {
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      <Field label="Member number or mobile" htmlFor="pa-member">
        <Input id="pa-member" name="member" defaultValue={member} placeholder="HH0100123 or 082 123 4567" autoComplete="off" />
        <FieldError name="member" />
      </Field>
      <Field label="SAHPRA authorisation number" htmlFor="pa-auth">
        <Input id="pa-auth" name="authNumber" placeholder="S21/2026/12345" autoComplete="off" />
        <FieldError name="authNumber" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prescriber" htmlFor="pa-dr">
          <Input id="pa-dr" name="prescriber" placeholder="Dr N. Dube" />
          <FieldError name="prescriber" />
        </Field>
        <Field label="HPCSA reg. no." htmlFor="pa-reg">
          <Input id="pa-reg" name="prescriberRegNo" placeholder="MP0123456" autoComplete="off" />
          <FieldError name="prescriberRegNo" />
        </Field>
      </div>
      <Field label="Authorised products" htmlFor="pa-scope">
        <Input id="pa-scope" name="scope" defaultValue="Dried flower, pre-rolls, oral and inhaled preparations" />
        <FieldError name="scope" />
      </Field>
      <Field label="Monthly limit (grams)" htmlFor="pa-g" hint="Dried-flower equivalent, checked at every sale over a rolling 30 days">
        <Input id="pa-g" name="monthlyLimitGrams" inputMode="decimal" defaultValue="30" />
        <FieldError name="monthlyLimitGrams" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valid from" htmlFor="pa-from">
          <Input id="pa-from" name="validFrom" type="date" defaultValue={today} />
          <FieldError name="validFrom" />
        </Field>
        <Field label="Valid to" htmlFor="pa-to">
          <Input id="pa-to" name="validTo" type="date" />
          <FieldError name="validTo" />
        </Field>
      </div>
      <Field label="Document reference (optional)" htmlFor="pa-doc" hint="Where the signed authorisation is filed">
        <Input id="pa-doc" name="documentRef" placeholder="auth-docs/…" />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Add authorisation
      </SubmitButton>
    </ActionForm>
  );
}
