"use client";
// Allocate a statement line nothing in the books covers yet: to an account (with the supplier or other party a
// control account needs, the VAT on money out, and the store), or (for money in) as a card payout that landed net
// of the acquirer's fee.
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/ui/action-form";
import { zar } from "@/lib/money";
import { parseRand } from "@/server/store/rules";

export type AccountChoice = { id: string; code: string; name: string; type: string; party: string | null };

const TYPES = [["EXPENSE", "Expenses"], ["INCOME", "Income"], ["ASSET", "Assets"], ["LIABILITY", "Liabilities"], ["EQUITY", "Equity"]] as const;
const PARTY: Record<string, [string, string]> = {
  SUPPLIER: ["Supplier", "The supplier's name"],
  TRADE_ACCOUNT: ["Trade account", "Its number (TA-…) or exact name"],
  COMPANY: ["Franchisee", "A store code, or the company's name"],
};

export function AllocateForm({ action, accounts, stores, storeId, vendor, gateway, amountCents, description }: {
  action: FormAction;
  accounts: AccountChoice[];
  stores: { id: string; code: string; name: string }[];
  storeId: string | null;
  vendor: boolean;
  gateway: boolean;
  amountCents: number;
  description: string;
}) {
  const moneyIn = amountCents > 0;
  const [mode, setMode] = useState<"account" | "payout">("account");
  const [accountId, setAccountId] = useState("");
  const [fee, setFee] = useState("");
  const party = PARTY[accounts.find((a) => a.id === accountId)?.party ?? ""];
  const feeCents = parseRand(fee) ?? 0;
  return (
    <ActionForm action={action} className="space-y-3" aria-label="Allocate this line">
      <input type="hidden" name="mode" value={mode} />
      {moneyIn && (
        <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <legend className="sr-only">What it is</legend>
          {(
            [
              ["account", "To an account"],
              ["payout", "A card payout (net of fees)"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="inline-flex min-h-8 cursor-pointer items-center gap-2 font-medium text-ink-800">
              <input type="radio" name="what" value={k} checked={mode === k} onChange={() => setMode(k)} className="h-4 w-4 accent-brand-500" />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      {mode === "account" ? (
        <>
          <Field label="Account" htmlFor="alloc-account">
            <Select id="alloc-account" name="accountId" value={accountId} onChange={(e) => setAccountId(e.currentTarget.value)} required>
              <option value="" disabled>
                Choose…
              </option>
              {TYPES.map(([t, label]) => {
                const list = accounts.filter((a) => a.type === t);
                return list.length ? (
                  <optgroup key={t} label={label}>
                    {list.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </Select>
            <FieldError name="accountId" />
          </Field>
          {party && (
            <Field label={party[0]} htmlFor="alloc-party">
              <Input id="alloc-party" name="party" placeholder={party[1]} maxLength={120} required autoComplete="off" />
              <FieldError name="party" />
            </Field>
          )}
          {vendor && !moneyIn && (
            <Field label="VAT in it (optional)" htmlFor="alloc-vat" hint="When the bank or supplier charged VAT, as on their invoice or statement">
              <Input id="alloc-vat" name="vat" inputMode="decimal" placeholder="0.00" autoComplete="off" />
              <FieldError name="vat" />
            </Field>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fee taken off" htmlFor="alloc-fee" hint={`So the payout was ${zar(amountCents + feeCents)} of takings`}>
              <Input id="alloc-fee" name="fee" inputMode="decimal" placeholder="0.00" value={fee} onChange={(e) => setFee(e.currentTarget.value)} required autoComplete="off" />
              <FieldError name="fee" />
            </Field>
            {vendor && (
              <Field label="VAT on the fee (optional)" htmlFor="alloc-feevat">
                <Input id="alloc-feevat" name="feeVat" inputMode="decimal" placeholder="0.00" autoComplete="off" />
                <FieldError name="feeVat" />
              </Field>
            )}
          </div>
          {gateway && (
            <Field label="Payout of" htmlFor="alloc-clears">
              <Select id="alloc-clears" name="clears" defaultValue="card">
                <option value="card">Card machine payments</option>
                <option value="gateway">Online payments</option>
              </Select>
            </Field>
          )}
        </>
      )}
      {stores.length > 0 && (
        <Field label="Store (optional)" htmlFor="alloc-store">
          <Select id="alloc-store" name="storeId" defaultValue={storeId ?? ""}>
            <option value="">No store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>
          <FieldError name="storeId" />
        </Field>
      )}
      <Field label="Journal note (optional)" htmlFor="alloc-memo">
        <Input id="alloc-memo" name="memo" maxLength={200} placeholder={description} autoComplete="off" />
      </Field>
      <SubmitButton pendingLabel="Posting…">Allocate</SubmitButton>
    </ActionForm>
  );
}
