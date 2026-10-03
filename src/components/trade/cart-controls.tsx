"use client";
// Cart line controls: a case stepper (each step posts the new number of cases) and Remove. The server rounds to the
// case pack and refreshes the page.
import { useFormStatus } from "react-dom";
import { Minus, Plus, Trash2 } from "lucide-react";
import { removeCartLineAction, setCartCasesAction } from "@/app/trade/actions";
import { cn } from "@/lib/cn";

function StepButton({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || disabled} className="grid h-11 w-11 place-items-center rounded-full text-ink-200 transition hover:bg-ink-800 disabled:opacity-40" aria-label={label}>
      {children}
    </button>
  );
}

export function CaseStepper({ variantId, cases, caseQty, name }: { variantId: string; cases: number; caseQty: number; name: string }) {
  const unit = caseQty > 1 ? "case" : "unit";
  return (
    <div className="flex h-11 items-center rounded-full border border-ink-700" role="group" aria-label={`${caseQty > 1 ? "Cases" : "Units"} of ${name}`}>
      <form action={setCartCasesAction}>
        <input type="hidden" name="variantId" value={variantId} />
        <input type="hidden" name="cases" value={cases - 1} />
        <StepButton label={`One ${unit} fewer`} disabled={cases <= 1}>
          <Minus className="h-4 w-4" aria-hidden />
        </StepButton>
      </form>
      <span className="tnum w-14 text-center text-sm font-semibold text-white" aria-live="polite">
        {cases} {caseQty > 1 ? (cases === 1 ? "case" : "cases") : cases === 1 ? "unit" : "units"}
      </span>
      <form action={setCartCasesAction}>
        <input type="hidden" name="variantId" value={variantId} />
        <input type="hidden" name="cases" value={cases + 1} />
        <StepButton label={`One ${unit} more`} disabled={cases >= 999}>
          <Plus className="h-4 w-4" aria-hidden />
        </StepButton>
      </form>
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
