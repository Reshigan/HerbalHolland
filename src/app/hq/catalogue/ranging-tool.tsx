"use client";
import { Field } from "@/components/ui/form";
import { Select } from "@/components/hq/select";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { rangeVariant } from "./actions";

export function RangingTool({ productId, variants, regions }: { productId: string; variants: { id: string; label: string }[]; regions: { id: string; name: string }[] }) {
  return (
    <ActionForm action={rangeVariant.bind(null, productId)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Variant" htmlFor="rv-variant">
          <Select id="rv-variant" name="variantId" defaultValue={variants[0]?.id ?? ""}>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </Select>
          <FieldError name="variantId" />
        </Field>
        <Field label="Store format" htmlFor="rv-format">
          <Select id="rv-format" name="format" defaultValue="">
            <option value="">All formats</option>
            <option value="FLAGSHIP">Flagship</option>
            <option value="STANDARD">Standard</option>
            <option value="EXPRESS">Express</option>
          </Select>
        </Field>
        <Field label="Region" htmlFor="rv-region">
          <Select id="rv-region" name="regionId" defaultValue="">
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton name="mode" value="range" size="sm" pendingLabel="Updating…">
          Range at matching stores
        </SubmitButton>
        <SubmitButton name="mode" value="unrange" size="sm" variant="outline">
          Unrange
        </SubmitButton>
        <span className="text-xs text-ink-500">Ranged items appear in the store&apos;s replenishment plan and online availability.</span>
      </div>
    </ActionForm>
  );
}
