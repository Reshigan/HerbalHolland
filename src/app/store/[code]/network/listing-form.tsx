"use client";
import { useState } from "react";
import { centsToInput, zar } from "@/lib/money";
import { Field, Input, Select } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/ui/action-form";

export type ListableItem = { id: string; name: string; sku: string; available: number; overUnits: number; wholesaleCents: number; unitCostCents: number };

export function ListingForm({ items, action }: { items: ListableItem[]; action: FormAction }) {
  const first = items[0];
  const [id, setId] = useState(first?.id ?? "");
  const [qty, setQty] = useState(first ? String(first.overUnits || 1) : "1");
  const [price, setPrice] = useState(first ? centsToInput(Math.round(first.wholesaleCents * 0.95)) : "");
  const item = items.find((i) => i.id === id);
  const choose = (nid: string) => {
    const i = items.find((x) => x.id === nid);
    setId(nid);
    if (i) (setQty(String(i.overUnits || 1)), setPrice(centsToInput(Math.round(i.wholesaleCents * 0.95))));
  };
  if (!items.length) return <p className="text-sm text-ink-500">Nothing available to list right now.</p>;
  return (
    <ActionForm action={action} className="space-y-4">
      <Field label="Item" htmlFor="list-item" hint={item ? `${item.available} available · wholesale ${zar(item.wholesaleCents)} · your cost ${zar(item.unitCostCents)} (ex VAT)` : undefined}>
        <Select id="list-item" name="variantId" value={id} onChange={(e) => choose(e.target.value)}>
          <optgroup label="Over target (good to list)">
            {items.filter((i) => i.overUnits > 0).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.overUnits} over
              </option>
            ))}
          </optgroup>
          <optgroup label="Everything else in stock">
            {items.filter((i) => i.overUnits === 0).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.available} available
              </option>
            ))}
          </optgroup>
        </Select>
        <FieldError name="variantId" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Units" htmlFor="list-qty">
          <Input id="list-qty" name="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} />
          <FieldError name="qty" />
        </Field>
        <Field label="Price each, ex VAT" htmlFor="list-price">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-500">R</span>
            <Input id="list-price" name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="pl-7" />
          </div>
          <FieldError name="price" />
        </Field>
      </div>
      <Field label="Note for buyers (optional)" htmlFor="list-note">
        <Input id="list-note" name="note" maxLength={200} placeholder="e.g. Overstocked after a slow month" />
      </Field>
      <SubmitButton pendingLabel="Listing…">List on the network</SubmitButton>
    </ActionForm>
  );
}
