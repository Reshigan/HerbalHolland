// Add or edit a bank account: the bank (when adding), its name, the account number's last digits and, optionally,
// the store whose takings are banked there.
import { Field, Input, Select } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/ui/action-form";
import { BANKS } from "@/lib/bank-import";

export function AccountForm({ action, stores, defaults, adding }: {
  action: FormAction;
  stores: { id: string; code: string; name: string }[];
  defaults?: { name: string; number: string; storeId: string | null };
  adding?: boolean;
}) {
  const id = (k: string) => `${adding ? "add" : "edit"}-acct-${k}`;
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess={adding} aria-label={adding ? "Add a bank account" : "Edit the bank account"}>
      {adding && (
        <Field label="Bank" htmlFor={id("bank")}>
          <Select id={id("bank")} name="bank" defaultValue="FNB">
            {Object.entries(BANKS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </Select>
          <FieldError name="bank" />
        </Field>
      )}
      <Field label="Name" htmlFor={id("name")} hint="As you'd like to see it in the books, e.g. “FNB Business Cheque”">
        <Input id={id("name")} name="name" defaultValue={defaults?.name} maxLength={60} required autoComplete="off" />
        <FieldError name="name" />
      </Field>
      <Field label="Account number" htmlFor={id("number")} hint="Only the last four digits are kept: imports check them against the statement">
        <Input id={id("number")} name="number" defaultValue={defaults?.number} inputMode="numeric" maxLength={20} required autoComplete="off" placeholder="…1234" />
        <FieldError name="number" />
      </Field>
      {stores.length > 0 && (
        <Field label="Store (optional)" htmlFor={id("store")} hint="The store whose takings are banked here, if it's one store's account">
          <Select id={id("store")} name="storeId" defaultValue={defaults?.storeId ?? ""}>
            <option value="">The whole company</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
            ))}
          </Select>
          <FieldError name="storeId" />
        </Field>
      )}
      <SubmitButton className="w-full" pendingLabel="Saving…">{adding ? "Add bank account" : "Save"}</SubmitButton>
    </ActionForm>
  );
}
