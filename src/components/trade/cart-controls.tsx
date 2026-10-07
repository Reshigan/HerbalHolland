"use client";
// Cart line controls: a case count you can type (posted on blur or Enter) or step with − and +, and Remove. The
// server rounds to the case pack and refreshes the page.
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Minus, Plus, Trash2 } from "lucide-react";
import { removeCartLineAction, setCartCasesAction } from "@/app/trade/actions";
import { cn } from "@/lib/cn";

const MAX_CASES = 999;

export function CaseStepper({ variantId, cases, caseQty, name }: { variantId: string; cases: number; caseQty: number; name: string }) {
  const unit = caseQty > 1 ? "case" : "unit";
  const [draft, setDraft] = useState(String(cases));
  const [shown, setShown] = useState(cases);
  if (shown !== cases) (setShown(cases), setDraft(String(cases))); // the server's number once it has refreshed
  const [pending, start] = useTransition();
  const post = (n: number) => {
    const next = Math.max(1, Math.min(MAX_CASES, Math.floor(n) || 1));
    setDraft(String(next));
    if (next === cases) return;
    const fd = new FormData();
    fd.set("variantId", variantId);
    fd.set("cases", String(next));
    start(() => setCartCasesAction(fd));
  };
  const current = Number(draft) || cases;
  const id = `cases-${variantId}`;
  const step = "grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-200 transition hover:bg-ink-800 disabled:opacity-40";
  return (
    <div className="flex h-11 items-center rounded-full border border-ink-700" role="group" aria-label={`${caseQty > 1 ? "Cases" : "Units"} of ${name}`} aria-busy={pending}>
      <button type="button" className={step} aria-label={`One ${unit} fewer`} disabled={pending || current <= 1} onClick={() => post(current - 1)}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <label htmlFor={id} className="flex items-center gap-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CASES}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => post(Number(draft))}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), post(Number(draft)));
            if (e.key === "Escape") setDraft(String(cases));
          }}
          aria-label={`${caseQty > 1 ? "Cases" : "Units"} of ${name}`}
          className="tnum h-9 w-12 rounded-lg bg-transparent text-center text-sm font-semibold text-white [appearance:textfield] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-xs text-ink-300" aria-hidden>
          {caseQty > 1 ? (current === 1 ? "case" : "cases") : current === 1 ? "unit" : "units"}
        </span>
      </label>
      <button type="button" className={step} aria-label={`One ${unit} more`} disabled={pending || current >= MAX_CASES} onClick={() => post(current + 1)}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

function RemoveButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-300 transition hover:bg-ink-800 hover:text-white disabled:opacity-50", className)}>
      <Trash2 className="h-3.5 w-3.5" aria-hidden /> {pending ? "Removing…" : "Remove"}
    </button>
  );
}

export function RemoveLine({ variantId, className }: { variantId: string; className?: string }) {
  return (
    <form action={removeCartLineAction}>
      <input type="hidden" name="variantId" value={variantId} />
      <RemoveButton className={className} />
    </form>
  );
}
