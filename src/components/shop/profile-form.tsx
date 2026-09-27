"use client";
import { useActionState } from "react";
import { updateProfile, type ProfileState } from "@/app/club/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, SelectInput, TextInput } from "./ui";

export function ProfileForm({ values, stores }: { values: { firstName: string; lastName: string; email: string; homeStoreId: string }; stores: { id: string; name: string; city: string }[] }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const cities = [...new Set(stores.map((s) => s.city))].sort();
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldRow label="First name" htmlFor="pf-first" error={state.fields?.firstName}>
          <TextInput id="pf-first" name="firstName" defaultValue={values.firstName} autoComplete="given-name" required maxLength={60} />
        </FieldRow>
        <FieldRow label="Last name (optional)" htmlFor="pf-last">
          <TextInput id="pf-last" name="lastName" defaultValue={values.lastName} autoComplete="family-name" maxLength={60} />
        </FieldRow>
        <FieldRow label="Email for invoices" htmlFor="pf-email" error={state.fields?.email} hint="Tax invoices are emailed here after every purchase.">
          <TextInput id="pf-email" name="email" type="email" defaultValue={values.email} autoComplete="email" />
        </FieldRow>
        <FieldRow label="Home store" htmlFor="pf-store" error={state.fields?.homeStoreId}>
          <SelectInput id="pf-store" name="homeStoreId" defaultValue={values.homeStoreId} required>
            <option value="" disabled>
              Choose a store
            </option>
            {cities.map((c) => (
              <optgroup key={c} label={c}>
                {stores
                  .filter((s) => s.city === c)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </SelectInput>
        </FieldRow>
      </div>
      <div className="flex items-center gap-4">
        <button disabled={pending} className={buttonClass("primary", "lg")}>
          {pending ? "Saving…" : "Save details"}
        </button>
        {state.ok && <span className="text-sm font-medium text-leaf-100" role="status">Saved</span>}
        {state.error && <span className="text-sm text-rose-100" role="alert">{state.error}</span>}
      </div>
    </form>
  );
}
