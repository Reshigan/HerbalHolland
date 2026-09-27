"use client";
import { Field, Input } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";

/** The merch partner's shipping email → the order: courier and tracking number. */
export function MerchShippedForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-end">
      <Field label="Courier" htmlFor="merch-courier">
        <Input id="merch-courier" name="courier" defaultValue="Aramex" autoComplete="off" />
        <FieldError name="courier" />
      </Field>
      <Field label="Tracking number" htmlFor="merch-tracking">
        <Input id="merch-tracking" name="trackingNo" autoComplete="off" className="font-mono" />
        <FieldError name="trackingNo" />
      </Field>
      <SubmitButton pendingLabel="Saving…">Merch shipped</SubmitButton>
    </ActionForm>
  );
}
