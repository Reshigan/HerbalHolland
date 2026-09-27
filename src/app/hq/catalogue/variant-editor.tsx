"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Field, Input, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { marginPct } from "@/lib/pricing-rules";
import { cn } from "@/lib/cn";
import { saveVariant } from "./actions";

export type VariantRow = {
  id: string; sku: string; barcode: string | null; name: string; grams: number | null;
  priceCents: number; wholesaleCents: number; costCents: number; active: boolean; batches: number; onHand: number;
};

const rand = (c: number) => (c / 100).toFixed(2);
const cents = (s: string) => {
  const n = Number(s.replace(/[R\s,]/gi, ""));
  return Number.isFinite(n) && s.trim() ? Math.round(n * 100) : null;
};

function Margins({ price, wholesale, cost, minMarginPct }: { price: string; wholesale: string; cost: string; minMarginPct: number }) {
  const p = cents(price), w = cents(wholesale), c = cents(cost);
  const store = p && w != null ? marginPct(p, w) : null;
  const hq = w && c != null ? (w - c) / w : null;
  const low = store != null && store * 100 < minMarginPct;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500" aria-live="polite">
      <span>
        Store margin at RRP{" "}
        <b className={cn("tnum", low ? "text-amber-700" : "text-ink-800")}>{store == null ? "—" : `${(store * 100).toFixed(1)}%`}</b>
        {low && <span className="text-amber-700"> · below the {minMarginPct}% guide</span>}
      </span>
      <span>
        HQ margin on wholesale <b className="tnum text-ink-800">{hq == null ? "—" : `${(hq * 100).toFixed(1)}%`}</b>
      </span>
    </div>
  );
}

function VariantFields({ v, minMarginPct, isNew }: { v?: VariantRow; minMarginPct: number; isNew?: boolean }) {
  const [price, setPrice] = useState(v ? rand(v.priceCents) : "");
  const [wholesale, setWholesale] = useState(v ? rand(v.wholesaleCents) : "");
  const [cost, setCost] = useState(v ? rand(v.costCents) : "");
  const k = v?.id ?? "new";
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Field label="SKU" htmlFor={`sku-${k}`} className="col-span-2 md:col-span-1 xl:col-span-2">
          <Input id={`sku-${k}`} name="sku" defaultValue={v?.sku} className="font-mono text-[0.8rem] uppercase" required />
          <FieldError name="sku" />
        </Field>
        <Field label="Barcode" htmlFor={`barcode-${k}`} className="col-span-2 md:col-span-1 xl:col-span-2">
          <Input id={`barcode-${k}`} name="barcode" defaultValue={v?.barcode ?? ""} inputMode="numeric" className="font-mono text-[0.8rem]" />
          <FieldError name="barcode" />
        </Field>
        <Field label="Size / name" htmlFor={`name-${k}`}>
          <Input id={`name-${k}`} name="name" defaultValue={v?.name} placeholder="3.5g" required />
          <FieldError name="name" />
        </Field>
        <Field label="Grams" htmlFor={`grams-${k}`}>
          <Input id={`grams-${k}`} name="grams" defaultValue={v?.grams ?? ""} inputMode="decimal" placeholder="—" />
          <FieldError name="grams" />
        </Field>
        <div className="col-span-2 flex items-end pb-2.5">
          {isNew ? (
            <Checkbox name="rangeWithProduct" defaultChecked label="Range where the product is ranged" />
          ) : (
            <Checkbox name="active" defaultChecked={v?.active} label="Active" description="Inactive variants can't be ordered or sold" />
          )}
          {isNew && <input type="hidden" name="active" value="on" />}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 items-end gap-3 md:max-w-xl">
        <Field label="RRP incl. VAT" htmlFor={`price-${k}`}>
          <Input id={`price-${k}`} name="price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="tnum" required />
          <FieldError name="price" />
        </Field>
        <Field label="Wholesale ex VAT" htmlFor={`wholesale-${k}`}>
          <Input id={`wholesale-${k}`} name="wholesale" value={wholesale} onChange={(e) => setWholesale(e.target.value)} inputMode="decimal" className="tnum" required />
          <FieldError name="wholesale" />
        </Field>
        <Field label="Cost ex VAT" htmlFor={`cost-${k}`}>
          <Input id={`cost-${k}`} name="cost" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className="tnum" required />
          <FieldError name="cost" />
        </Field>
      </div>
      <div className="mt-2">
        <Margins price={price} wholesale={wholesale} cost={cost} minMarginPct={minMarginPct} />
      </div>
    </>
  );
}

export function VariantEditor({ productId, variants, minMarginPct, readOnly }: { productId: string; variants: VariantRow[]; minMarginPct: number; readOnly?: boolean }) {
  const [adding, setAdding] = useState(variants.length === 0);
  const [addKey, setAddKey] = useState(0);
  return (
    <div className="divide-y divide-ink-100">
      {variants.map((v) => (
        <ActionForm key={v.id} action={saveVariant.bind(null, productId, v.id)} className="px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-display text-sm font-semibold text-ink-900">{v.name}</span>
            {!v.active && <Badge tone="neutral">Inactive</Badge>}
            <span className="text-xs text-ink-500">
              {v.batches} batch{v.batches === 1 ? "" : "es"} · {v.onHand.toLocaleString()} units on hand network-wide
            </span>
          </div>
          <fieldset disabled={readOnly} className="min-w-0">
            <VariantFields v={v} minMarginPct={minMarginPct} />
          </fieldset>
          {!readOnly && (
            <div className="mt-3 flex justify-end">
              <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
                Save {v.sku}
              </SubmitButton>
            </div>
          )}
        </ActionForm>
      ))}
      {!readOnly &&
        (adding ? (
          <ActionForm action={saveVariant.bind(null, productId, null)} className="bg-oranje-50/40 px-5 py-4" onDone={(s) => s.ok && setAddKey((k) => k + 1)}>
            <div className="mb-3 font-display text-sm font-semibold text-ink-900">{variants.length ? "Add another variant" : "New variant"}</div>
            <VariantFields key={addKey} minMarginPct={minMarginPct} isNew />
            <div className="mt-3 flex justify-end gap-2">
              {variants.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              )}
              <SubmitButton size="sm" pendingLabel="Adding…">Add variant</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <div className="px-5 py-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add a variant
            </Button>
          </div>
        ))}
    </div>
  );
}
