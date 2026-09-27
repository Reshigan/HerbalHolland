"use client";
import { useState } from "react";
import { ClipboardList, Layers } from "lucide-react";
import { cn } from "@/lib/cn";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";

type Cat = { slug: string; name: string; lines: number; lastCounted: string | null };

export function NewTakeForm({ action, cats, fullLines, busy }: { action: FormAction; cats: Cat[]; fullLines: number; busy: string[] }) {
  const blocked = new Set(busy);
  const [scope, setScope] = useState<"FULL" | "CATEGORY">(blocked.size ? "CATEGORY" : "FULL");
  const [cat, setCat] = useState(cats.find((c) => !blocked.has(c.slug) && c.lines > 0)?.slug ?? "");
  const option = (active: boolean) =>
    cn("flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition", active ? "border-oranje-500 bg-oranje-50 ring-4 ring-oranje-500/15" : "border-ink-200 bg-white hover:border-ink-300");
  return (
    <ActionForm action={action} className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-[0.78rem] font-semibold text-ink-700">What are you counting?</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className={option(scope === "FULL")}>
            <input type="radio" name="scope" value="FULL" checked={scope === "FULL"} onChange={() => setScope("FULL")} className="mt-1 accent-oranje-500" disabled={blocked.has("FULL") || blocked.size > 0} />
            <span>
              <span className="flex items-center gap-2 font-display font-semibold text-ink-900">
                <Layers className="h-4 w-4 text-oranje-600" aria-hidden /> Full count
              </span>
              <span className="mt-1 block text-sm text-ink-500">Every ranged item and every batch on hand — {fullLines.toLocaleString()} lines. Best done before opening or after close.</span>
              {blocked.size > 0 && <span className="mt-2 block text-xs font-medium text-amber-700">Finish the open count first.</span>}
            </span>
          </label>
          <label className={option(scope === "CATEGORY")}>
            <input type="radio" name="scope" value="CATEGORY" checked={scope === "CATEGORY"} onChange={() => setScope("CATEGORY")} className="mt-1 accent-oranje-500" disabled={blocked.has("FULL")} />
            <span>
              <span className="flex items-center gap-2 font-display font-semibold text-ink-900">
                <ClipboardList className="h-4 w-4 text-oranje-600" aria-hidden /> Cycle count
              </span>
              <span className="mt-1 block text-sm text-ink-500">One category at a time, while trading. Rotate through the store every few weeks.</span>
            </span>
          </label>
        </div>
      </fieldset>

      {scope === "CATEGORY" && (
        <fieldset>
          <legend className="mb-2 text-[0.78rem] font-semibold text-ink-700">Category</legend>
          <div className="overflow-hidden rounded-2xl border border-ink-150">
            {cats.map((c) => {
              const disabled = blocked.has(c.slug) || c.lines === 0;
              return (
                <label key={c.slug} className={cn("flex items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-0", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-ink-50", cat === c.slug && "bg-oranje-50/60")}>
                  <input type="radio" name="category" value={c.slug} checked={cat === c.slug} onChange={() => setCat(c.slug)} disabled={disabled} className="accent-oranje-500" />
                  <span className="flex-1 text-sm font-medium text-ink-850">{c.name}</span>
                  <span className="text-xs text-ink-500">{blocked.has(c.slug) ? "Counting now" : c.lastCounted ? `Last counted ${c.lastCounted}` : "Never counted"}</span>
                  <span className="tnum w-16 text-right text-xs font-semibold text-ink-700">{c.lines} lines</span>
                </label>
              );
            })}
          </div>
          <FieldError name="category" />
        </fieldset>
      )}

      <Checkbox
        name="blind"
        defaultChecked
        label="Blind count (recommended)"
        description="Counters don't see what the system expects, so they count what's really on the shelf. Managers see the variances before approving."
      />

      <Field label="Notes (optional)" htmlFor="notes" hint="E.g. who is counting, or why this count was called">
        <Input id="notes" name="notes" maxLength={500} placeholder="Monthly flower count — Zanele & Anika" />
      </Field>

      <SubmitButton size="lg" pendingLabel="Preparing count sheet…">
        Start counting
      </SubmitButton>
    </ActionForm>
  );
}
