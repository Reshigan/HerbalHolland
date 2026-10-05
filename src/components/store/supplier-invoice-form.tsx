"use client";
// Capture a supplier invoice: the invoice's details plus a photo or PDF (checked against the 8 MB limit before it's
// sent). Used from Purchasing → a received order (prefilled from the order) and from Finance → Supplier invoices.
import { useState } from "react";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";
import { MAX_INVOICE_BYTES } from "@/lib/supplier-invoice-rules";

export type InvoiceDefaults = { supplierName?: string; number?: string; invoiceDate?: string; dueDate?: string; total?: string; vat?: boolean; accountId?: string; note?: string };
/** What an invoice can be charged to in the company's books (invoiceAccounts). */
export type InvoiceAccount = { id: string; name: string };

export function InvoiceFileInput({ id, name = "file" }: { id: string; name?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b % (1024 * 1024) ? 1 : 0)} MB`;
  return (
    <>
      <input
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        required
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          const m = f && f.size > MAX_INVOICE_BYTES ? `That file is ${mb(f.size)} — the invoice has to be ${mb(MAX_INVOICE_BYTES)} or less. Take the photo again or use a smaller PDF.` : "";
          e.currentTarget.setCustomValidity(m);
          setMsg(m || null);
        }}
        className="block w-full rounded-xl text-sm text-ink-700 file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15"
      />
      {msg && (
        <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
          {msg}
        </p>
      )}
    </>
  );
}

export function SupplierInvoiceForm({
  action, defaults = {}, vendor, accounts, idPrefix = "si", submitLabel = "Capture invoice", resetOnSuccess,
}: { action: FormAction; defaults?: InvoiceDefaults; vendor: boolean; accounts: InvoiceAccount[]; idPrefix?: string; submitLabel?: string; resetOnSuccess?: boolean }) {
  const id = (k: string) => `${idPrefix}-${k}`;
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess={resetOnSuccess} aria-label="Capture a supplier invoice">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" htmlFor={id("supplier")}>
          <Input id={id("supplier")} name="supplierName" defaultValue={defaults.supplierName ?? ""} maxLength={120} required placeholder="Who invoiced you" />
          <FieldError name="supplierName" />
        </Field>
        <Field label="Invoice number" htmlFor={id("number")}>
          <Input id={id("number")} name="number" defaultValue={defaults.number ?? ""} maxLength={60} required />
          <FieldError name="number" />
        </Field>
        <Field label="Invoice date" htmlFor={id("invoiceDate")}>
          <Input id={id("invoiceDate")} name="invoiceDate" type="date" defaultValue={defaults.invoiceDate ?? ""} required />
          <FieldError name="invoiceDate" />
        </Field>
        <Field label="Due date" htmlFor={id("dueDate")}>
          <Input id={id("dueDate")} name="dueDate" type="date" defaultValue={defaults.dueDate ?? ""} required />
          <FieldError name="dueDate" />
        </Field>
        <Field label="Total incl. VAT" htmlFor={id("total")}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-500">R</span>
            <Input id={id("total")} name="total" inputMode="decimal" defaultValue={defaults.total ?? ""} className="pl-7 tnum" required placeholder="0.00" />
          </div>
          <FieldError name="total" />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox name="vat" defaultChecked={defaults.vat ?? vendor} label="Tax invoice — 15% VAT included" description={vendor ? "Counts towards your input tax" : "You're not VAT-registered: recorded for your books only"} />
        </div>
      </div>
      <Field label="Charged to" htmlFor={id("account")} hint="Where the invoice shows in your books">
        <Select id={id("account")} name="accountId" defaultValue={defaults.accountId ?? ""} required>
          <option value="" disabled>
            Choose an account
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <FieldError name="accountId" />
      </Field>
      <Field label="Photo or PDF of the invoice" htmlFor={id("file")} hint="JPEG, PNG or PDF up to 8 MB">
        <InvoiceFileInput id={id("file")} />
        <FieldError name="file" />
      </Field>
      <Field label="Note (optional)" htmlFor={id("note")}>
        <Textarea id={id("note")} name="note" defaultValue={defaults.note ?? ""} maxLength={300} className="min-h-16" placeholder="Delivery note number, what it covers…" />
      </Field>
      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
