"use client";
import { useActionState } from "react";
import { saveAddressAction, type AddressState } from "@/app/club/addresses/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, SelectInput, TextInput, inputClass } from "./ui";
import { cn } from "@/lib/cn";

export type AddressValues = { id?: string; label: string; line: string; suburb: string; city: string; province: string; postalCode: string; notes: string; isDefault: boolean };

/** Add or edit one saved address. Uncontrolled fields; after an error the typed values come back. */
export function AddressForm({ initial, provinces, onDone, compact }: { initial?: AddressValues; provinces: [string, string][]; onDone?: () => void; compact?: boolean }) {
  const [state, action, pending] = useActionState<AddressState, FormData>(saveAddressAction, {});
  const v = state.values ?? { id: initial?.id ?? "", label: initial?.label ?? "Home", line: initial?.line ?? "", suburb: initial?.suburb ?? "", city: initial?.city ?? "", province: initial?.province ?? "", postalCode: initial?.postalCode ?? "", notes: initial?.notes ?? "", isDefault: initial?.isDefault ? "yes" : "" };
  const k = initial?.id ?? "new";
  if (state.ok && onDone) onDone();
  return (
    <form action={action} className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", compact && "text-sm")}>
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <FieldRow label="Label" htmlFor={`ad-label-${k}`}>
        <SelectInput id={`ad-label-${k}`} name="label" defaultValue={v.label}>
          {["Home", "Work", "Other"].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </SelectInput>
      </FieldRow>
      <FieldRow label="Street address" htmlFor={`ad-line-${k}`} error={state.fields?.line}>
        <TextInput id={`ad-line-${k}`} name="line" autoComplete="address-line1" defaultValue={v.line} required aria-invalid={!!state.fields?.line} />
      </FieldRow>
      <FieldRow label="Suburb" htmlFor={`ad-suburb-${k}`} error={state.fields?.suburb}>
        <TextInput id={`ad-suburb-${k}`} name="suburb" autoComplete="address-level3" defaultValue={v.suburb} required />
      </FieldRow>
      <FieldRow label="Town or city" htmlFor={`ad-city-${k}`} error={state.fields?.city}>
        <TextInput id={`ad-city-${k}`} name="city" autoComplete="address-level2" defaultValue={v.city} required />
      </FieldRow>
      <FieldRow label="Province" htmlFor={`ad-prov-${k}`} error={state.fields?.province}>
        <SelectInput id={`ad-prov-${k}`} name="province" defaultValue={v.province} required>
          <option value="" disabled>
            Choose…
          </option>
          {provinces.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </SelectInput>
      </FieldRow>
      <FieldRow label="Postal code" htmlFor={`ad-post-${k}`} error={state.fields?.postalCode}>
        <TextInput id={`ad-post-${k}`} name="postalCode" inputMode="numeric" autoComplete="postal-code" maxLength={4} defaultValue={v.postalCode} required />
      </FieldRow>
      <FieldRow label="Delivery notes (optional)" htmlFor={`ad-notes-${k}`} className="sm:col-span-2">
        <textarea id={`ad-notes-${k}`} name="notes" rows={2} maxLength={200} defaultValue={v.notes} className={cn(inputClass, "py-3")} />
      </FieldRow>
      <label className="flex items-center gap-2 text-sm text-ink-200 sm:col-span-2">
        <input type="checkbox" name="isDefault" value="yes" defaultChecked={v.isDefault === "yes"} className="h-5 w-5 accent-brand-500" /> Use as my default delivery address
      </label>
      {state.error && (
        <p className="text-sm font-medium text-rose-100 sm:col-span-2" role="alert">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Saving…" : initial?.id ? "Save changes" : "Add address"}
        </button>
      </div>
    </form>
  );
}
