"use client";
// RRP in the catalogue list, editable in place: one variant edits straight away; several open a small list.
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { zarWhole } from "@/lib/money";
import { cn } from "@/lib/cn";
import { InlineEdit } from "@/components/ui/inline-edit";
import { saveVariantPrice } from "./actions";

export type PriceVariant = { id: string; name: string; sku: string; priceCents: number; active: boolean };

const rand = (c: number) => (c / 100).toFixed(2);

export function PriceCell({ product, variants, canEdit }: { product: string; variants: PriceVariant[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const live = variants.filter((v) => v.active);
  const prices = live.map((v) => v.priceCents);
  const range = prices.length === 0 ? "—" : Math.min(...prices) === Math.max(...prices) ? zarWhole(prices[0]) : `${zarWhole(Math.min(...prices))}–${zarWhole(Math.max(...prices))}`;

  if (!canEdit || live.length === 0) return <span className="whitespace-nowrap">{range}</span>;
  if (live.length === 1) {
    const v = live[0];
    return (
      <InlineEdit
        action={saveVariantPrice.bind(null, v.id)}
        fields={[{ name: "price", label: `RRP incl. VAT for ${product} ${v.name}`, value: rand(v.priceCents), prefix: "R", inputMode: "decimal", width: "w-24" }]}
        display={<span className="whitespace-nowrap">{zarWhole(v.priceCents)}</span>}
        editLabel={`RRP for ${product} ${v.name}`}
        format="zar"
        align="right"
        saveLabel="Save RRP"
      />
    );
  }
  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="-mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1.5 py-0.5 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
      >
        <span className="whitespace-nowrap">{range}</span>
        <span className="sr-only">, {live.length} variants — edit prices</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-ink-500 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id={id} hidden={!open} className="mt-1 space-y-1">
        {open &&
          live.map((v) => (
            <div key={v.id} className="flex items-center justify-end gap-2 whitespace-nowrap text-xs">
              <span className="text-ink-600">{v.name}</span>
              <InlineEdit
                action={saveVariantPrice.bind(null, v.id)}
                fields={[{ name: "price", label: `RRP incl. VAT for ${product} ${v.name}`, value: rand(v.priceCents), prefix: "R", inputMode: "decimal", width: "w-24" }]}
                display={<span className="text-sm text-ink-900">{zarWhole(v.priceCents)}</span>}
                editLabel={`RRP for ${product} ${v.name}`}
                format="zar"
                align="right"
                saveLabel="Save RRP"
              />
            </div>
          ))}
      </div>
    </div>
  );
}
