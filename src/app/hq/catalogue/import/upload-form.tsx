"use client";
import { useState } from "react";
import { Field } from "@/components/ui/form";
import { Select } from "@/components/hq/select";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import type { ActionState } from "@/server/hq/guard";

export type ImportLocationOption = { id: string; label: string; kind: "RETAIL" | "WAREHOUSE" };

/** Upload the CSV (checked for size before it's sent) and, if it carries opening stock, say where that stock is. */
export function UploadForm({ action, locations, maxBytes }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; locations: ImportLocationOption[]; maxBytes: number }) {
  const [tooBig, setTooBig] = useState(false);
  const group = (kind: ImportLocationOption["kind"]) => locations.filter((l) => l.kind === kind);
  return (
    <ActionForm action={action} className="space-y-4">
      <Field label="Spreadsheet (CSV)" htmlFor="import-file" hint="Saved as CSV UTF-8, comma or semicolon separated. Up to 2 MB and 5,000 rows.">
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={(e) => {
            const big = (e.currentTarget.files?.[0]?.size ?? 0) > maxBytes;
            e.currentTarget.setCustomValidity(big ? "The file is over 2 MB: split it into smaller files." : "");
            setTooBig(big);
          }}
          className="block w-full rounded-xl text-sm text-ink-700 file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15"
        />
        {tooBig && (
          <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
            The file is over 2 MB: split it into smaller files.
          </p>
        )}
        <FieldError name="file" />
      </Field>
      <Field label="Opening stock at" htmlFor="import-at" hint="Only if the file has a stock column: the warehouse or store that holds it.">
        <Select id="import-at" name="at" defaultValue="">
          <option value="">No opening stock</option>
          {(["WAREHOUSE", "RETAIL"] as const).map((k) =>
            group(k).length ? (
              <optgroup key={k} label={k === "WAREHOUSE" ? "Warehouses" : "Stores"}>
                {group(k).map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </optgroup>
            ) : null,
          )}
        </Select>
        <FieldError name="at" />
      </Field>
      <SubmitButton pendingLabel="Checking the file…">Check the file</SubmitButton>
    </ActionForm>
  );
}
