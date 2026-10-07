"use client";
// Import a bank statement: the file (checked against the size limit before it's sent), how to read it (worked out
// from the file by default) and, for any other CSV, which columns hold what.
import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/ui/action-form";

const COLUMNS = [
  ["mapDate", "Date", "e.g. Date", true],
  ["mapDescription", "Description", "e.g. Description", true],
  ["mapAmount", "Amount (money out negative)", "e.g. Amount", false],
  ["mapDebit", "Or: money out", "e.g. Debit", false],
  ["mapCredit", "and money in", "e.g. Credit", false],
  ["mapBalance", "Balance (optional)", "e.g. Balance", false],
  ["mapReference", "Reference (optional)", "e.g. Reference", false],
] as const;
const WIDE = new Set<string>(["mapAmount"]);

export function ImportForm({ action, accounts, formats, maxBytes, idPrefix = "imp" }: {
  action: FormAction;
  accounts?: { id: string; label: string }[]; // the account to choose, when the page isn't one account's
  formats: [string, string][];
  maxBytes: number;
  idPrefix?: string;
}) {
  const [format, setFormat] = useState("AUTO");
  const [tooBig, setTooBig] = useState(false);
  const id = (k: string) => `${idPrefix}-${k}`;
  const mb = Math.round(maxBytes / 1024 / 1024);
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess aria-label="Import a bank statement">
      {accounts && (
        <Field label="Bank account" htmlFor={id("account")}>
          <Select id={id("account")} name="bankAccountId" defaultValue={accounts[0]?.id}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </Select>
          <FieldError name="bankAccountId" />
        </Field>
      )}
      <Field label="Statement file" htmlFor={id("file")} hint={`CSV or OFX, downloaded from your online banking (up to ${mb} MB). Lines already imported are skipped.`}>
        <input
          id={id("file")}
          name="file"
          type="file"
          accept=".csv,.ofx,.qfx,.txt,text/csv"
          required
          onChange={(e) => {
            const big = (e.currentTarget.files?.[0]?.size ?? 0) > maxBytes;
            e.currentTarget.setCustomValidity(big ? `The file is over ${mb} MB. Download a shorter period.` : "");
            setTooBig(big);
          }}
          className="block w-full rounded-xl text-sm text-ink-700 file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15"
        />
        {tooBig && (
          <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
            The file is over {mb} MB. Download a shorter period.
          </p>
        )}
        <FieldError name="file" />
      </Field>
      <Field label="Format" htmlFor={id("format")}>
        <Select id={id("format")} name="format" value={format} onChange={(e) => setFormat(e.currentTarget.value)}>
          {formats.map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </Select>
      </Field>
      {format === "CSV" && (
        <fieldset className="rounded-2xl border border-ink-150 p-4">
          <legend className="px-1 text-[0.78rem] font-semibold text-ink-700">Which columns hold what</legend>
          <p className="mb-3 text-xs text-ink-500">Each column&apos;s heading as it is in the file, or its number (1 for the first column). One amount column with money out negative, or a money out and a money in column.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {COLUMNS.map(([name, label, placeholder, required]) => (
              <Field key={name} label={label} htmlFor={id(name)} className={WIDE.has(name) ? "sm:col-span-2" : undefined}>
                <Input id={id(name)} name={name} placeholder={placeholder} required={required} maxLength={60} autoComplete="off" />
              </Field>
            ))}
          </div>
        </fieldset>
      )}
      <SubmitButton className="w-full" pendingLabel="Reading the statement…">Import statement</SubmitButton>
    </ActionForm>
  );
}
