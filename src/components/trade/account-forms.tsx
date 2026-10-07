"use client";
// The account page's forms for an OWNER buyer: edit the business details (collapsed until asked), add a buyer,
// remove one. Errors come back in the server's words.
import { useActionState, useState } from "react";
import { Check, Pencil, UserPlus, X } from "lucide-react";
import { addBuyerAction, removeBuyerAction, updateDetailsAction, type BuyerState, type DetailsState } from "@/app/trade/account/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, SelectInput, TextInput } from "@/components/shop/ui";
import { TRADE_KINDS } from "@/lib/trade";
import { PROVINCES } from "@/lib/sa";

export type Details = { name: string; legalName: string; kind: string; regNumber: string; vatNumber: string; email: string; phone: string; addressLine: string; suburb: string; city: string; province: string; postalCode: string; deliveryLine: string; deliverySuburb: string; deliveryCity: string; deliveryProvince: string; deliveryPostalCode: string };

export function DetailsForm({ details }: { details: Details }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DetailsState, FormData>(updateDetailsAction, {});
  const v = { ...details, ...(state.values ?? {}) };
  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("outline-dark", "md")}>
          <Pencil className="h-4 w-4" aria-hidden /> Edit details
        </button>
        {state.ok && (
          <span className="flex items-center gap-1.5 text-sm text-leaf-100" role="status">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
      </div>
    );
  return (
    <form action={action} className="space-y-5 rounded-2xl border border-ink-800 bg-ink-900/60 p-5" noValidate>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-white">Business details</h3>
        <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-ink-300 hover:bg-ink-800 hover:text-white" aria-label="Close the details form">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {state.error && (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
          {state.error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldRow label="Registered (legal) name" htmlFor="d-legalName">
          <TextInput id="d-legalName" name="legalName" maxLength={120} defaultValue={v.legalName} required />
        </FieldRow>
        <FieldRow label="Trading name" htmlFor="d-name">
          <TextInput id="d-name" name="name" maxLength={120} defaultValue={v.name} />
        </FieldRow>
        <FieldRow label="Kind of business" htmlFor="d-kind">
          <SelectInput id="d-kind" name="kind" defaultValue={v.kind}>
            {Object.entries(TRADE_KINDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </SelectInput>
        </FieldRow>
        <FieldRow label="Company registration number" htmlFor="d-regNumber" hint="Like 2015/123456/07, or blank.">
          <TextInput id="d-regNumber" name="regNumber" maxLength={20} defaultValue={v.regNumber} className="tnum" />
        </FieldRow>
        <FieldRow label="VAT number" htmlFor="d-vatNumber" hint="Ten digits starting with 4, or blank.">
          <TextInput id="d-vatNumber" name="vatNumber" maxLength={14} defaultValue={v.vatNumber} className="tnum" />
        </FieldRow>
        <FieldRow label="Billing email" htmlFor="d-email" hint="Pro formas, invoices and statements go here.">
          <TextInput id="d-email" name="email" type="email" maxLength={254} defaultValue={v.email} required />
        </FieldRow>
        <FieldRow label="Business phone" htmlFor="d-phone">
          <TextInput id="d-phone" name="phone" type="tel" maxLength={20} defaultValue={v.phone} />
        </FieldRow>
      </div>
      <AddressFields prefix="" v={v} title="Billing address" />
      <AddressFields prefix="delivery" v={v} title="Delivery address (leave the street blank to deliver to the billing address)" />
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Saving…" : "Save details"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost-dark", "md")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddressFields({ prefix, v, title }: { prefix: "" | "delivery"; v: Details; title: string }) {
  const k = (name: string) => (prefix ? (`${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}` as keyof Details) : (name as keyof Details));
  const line = prefix ? "deliveryLine" : "addressLine";
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold text-ink-200">{title}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldRow label="Street address" htmlFor={`d-${line}`} className="sm:col-span-2">
          <TextInput id={`d-${line}`} name={line} maxLength={160} defaultValue={v[line]} required={!prefix} />
        </FieldRow>
        <FieldRow label="Suburb" htmlFor={`d-${k("suburb")}`}>
          <TextInput id={`d-${k("suburb")}`} name={k("suburb")} maxLength={160} defaultValue={v[k("suburb")]} />
        </FieldRow>
        <FieldRow label="City or town" htmlFor={`d-${k("city")}`}>
          <TextInput id={`d-${k("city")}`} name={k("city")} maxLength={160} defaultValue={v[k("city")]} required={!prefix} />
        </FieldRow>
        <FieldRow label="Province" htmlFor={`d-${k("province")}`}>
          <SelectInput id={`d-${k("province")}`} name={k("province")} defaultValue={v[k("province")] || ""}>
            <option value="">{prefix ? "—" : "Choose a province"}</option>
            {Object.entries(PROVINCES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </SelectInput>
        </FieldRow>
        <FieldRow label="Postal code" htmlFor={`d-${k("postalCode")}`}>
          <TextInput id={`d-${k("postalCode")}`} name={k("postalCode")} maxLength={4} inputMode="numeric" defaultValue={v[k("postalCode")]} className="tnum" required={!prefix} />
        </FieldRow>
      </div>
    </fieldset>
  );
}

export function AddBuyerForm() {
  const [state, action, pending] = useActionState<BuyerState, FormData>(addBuyerAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5" noValidate>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
        <UserPlus className="h-5 w-5 text-brand-500" aria-hidden /> Add a buyer
      </h3>
      <p className="mt-1 text-sm text-ink-400">They sign in with a code sent to their email. Owners can also manage buyers and the account&apos;s details.</p>
      {state.error && (
        <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-leaf-100" role="status">
          <Check className="h-4 w-4" aria-hidden /> Buyer added. They can sign in now.
        </p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldRow label="Name" htmlFor="b-name">
          <TextInput key={`n-${state.at}`} id="b-name" name="name" maxLength={120} defaultValue={state.ok ? "" : v.name} required />
        </FieldRow>
        <FieldRow label="Email" htmlFor="b-email">
          <TextInput key={`e-${state.at}`} id="b-email" name="email" type="email" maxLength={254} defaultValue={state.ok ? "" : v.email} required />
        </FieldRow>
        <FieldRow label="Mobile (optional)" htmlFor="b-phone" hint="For ready-to-collect texts.">
          <TextInput key={`p-${state.at}`} id="b-phone" name="phone" type="tel" maxLength={20} defaultValue={state.ok ? "" : v.phone} />
        </FieldRow>
        <FieldRow label="Role" htmlFor="b-role">
          <SelectInput key={`r-${state.at}`} id="b-role" name="role" defaultValue={state.ok ? "BUYER" : v.role || "BUYER"}>
            <option value="BUYER">Buyer (places orders)</option>
            <option value="OWNER">Owner (also manages the account)</option>
          </SelectInput>
        </FieldRow>
      </div>
      <button disabled={pending} className={buttonClass("primary", "md", "mt-4")}>
        {pending ? "Adding…" : "Add buyer"}
      </button>
    </form>
  );
}

export function RemoveBuyerButton({ buyerId, name }: { buyerId: string; name: string }) {
  const [state, action, pending] = useActionState<BuyerState, FormData>(removeBuyerAction, {});
  const [confirm, setConfirm] = useState(false);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="buyerId" value={buyerId} />
      {confirm ? (
        <>
          <span className="text-xs text-ink-300">Remove {name}?</span>
          <button disabled={pending} className={buttonClass("danger", "sm")}>
            {pending ? "Removing…" : "Yes, remove"}
          </button>
          <button type="button" onClick={() => setConfirm(false)} className={buttonClass("ghost-dark", "sm")}>
            Keep
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className={buttonClass("ghost-dark", "sm")} aria-label={`Remove ${name}`}>
          Remove
        </button>
      )}
      {state.error && (
        <span className="text-xs font-medium text-rose-100" role="alert">
          {state.error}
        </span>
      )}
    </form>
  );
}
