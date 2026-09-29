"use client";
import { useMemo, useState } from "react";
import { Minus, Plus, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { vatOnExcl, zar } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton, type FormAction } from "@/components/store/action-form";

export type BuilderRow = {
  variantId: string;
  sku: string;
  name: string;
  category: string;
  available: number;
  onOrder: number;
  reorderPoint: number;
  parLevel: number;
  avgDaily: number;
  cover: number | null; // null = no sales
  forecastPerWeek: number; // 14-day moving average × 7
  safetyStock: number;
  wholesaleCents: number;
  suggested: number;
};

const coverText = (c: number | null) => (c == null ? "No sales" : c <= 0 ? "0 d" : c < 1 ? "<1 d" : `${Math.round(c)} d`);

export function OrderBuilder({ rows, action, dcName }: { rows: BuilderRow[]; action: FormAction; dcName: string }) {
  const initial = () => Object.fromEntries(rows.map((r) => [r.variantId, r.suggested]));
  const [qty, setQty] = useState<Record<string, number>>(initial);
  const [view, setView] = useState<"suggested" | "all">(rows.some((r) => r.suggested > 0) ? "suggested" : "all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => (view === "all" || r.suggested > 0 || (qty[r.variantId] ?? 0) > 0) && words.every((w) => `${r.name} ${r.sku} ${r.category}`.toLowerCase().includes(w)));
  }, [rows, view, q, qty]);

  const chosen = rows.filter((r) => (qty[r.variantId] ?? 0) > 0);
  const units = chosen.reduce((s, r) => s + qty[r.variantId], 0);
  const subtotal = chosen.reduce((s, r) => s + qty[r.variantId] * r.wholesaleCents, 0);
  const vat = vatOnExcl(subtotal);
  const set = (id: string, n: number) => setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(10_000, n)) }));

  return (
    <ActionForm action={action}>
      {chosen.map((r) => (
        <input key={r.variantId} type="hidden" name={`qty:${r.variantId}`} value={qty[r.variantId]} />
      ))}
      <div className="rounded-2xl border border-ink-150 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
          <label className="relative min-w-0 flex-1 basis-60 sm:max-w-sm">
            <span className="sr-only">Filter items</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, SKU or category" className="pl-9" />
          </label>
          <div className="inline-flex rounded-full border border-ink-150 bg-white p-1" role="tablist" aria-label="Items shown">
            {(["suggested", "all"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", view === v ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-900")}
              >
                {v === "suggested" ? `Suggested (${rows.filter((r) => r.suggested > 0).length})` : `All ranged (${rows.length})`}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setQty(initial())}>
              <Sparkles className="h-4 w-4" aria-hidden /> Use suggestions
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setQty({})}>
              Clear
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                <th className="border-b border-ink-150 bg-ink-50 px-5 py-2.5 text-left">Item</th>
                <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">Available</th>
                <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">On order</th>
                <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">Reorder · par</th>
                <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">Sold / day</th>
                <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">Forecast</th>
                <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">Cover</th>
                <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-center">Order qty</th>
                <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">Unit ex VAT</th>
                <th className="border-b border-ink-150 bg-ink-50 px-5 py-2.5 text-right">Line ex VAT</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const n = qty[r.variantId] ?? 0;
                return (
                  <tr key={r.variantId} className={cn("transition-colors", n > 0 ? "bg-brand-50/50" : "hover:bg-ink-50/60")}>
                    <td className="border-b border-ink-100 px-5 py-2.5">
                      <div className="font-medium text-ink-900">{r.name}</div>
                      <div className="text-xs text-ink-400">
                        <span className="font-mono">{r.sku}</span> · {r.category}
                      </div>
                    </td>
                    <td className={cn("tnum border-b border-ink-100 px-3 py-2.5 text-right", r.available <= 0 ? "font-semibold text-rose-600" : r.available <= r.reorderPoint ? "font-semibold text-amber-700" : "text-ink-800")}>{r.available}</td>
                    <td className="tnum border-b border-ink-100 px-3 py-2.5 text-right text-ink-600">{r.onOrder || "—"}</td>
                    <td className="tnum border-b border-ink-100 px-3 py-2.5 text-right text-ink-500">
                      {r.reorderPoint} · {r.parLevel}
                    </td>
                    <td className="tnum border-b border-ink-100 px-3 py-2.5 text-right text-ink-600">{r.avgDaily.toFixed(1)}</td>
                    <td className="tnum whitespace-nowrap border-b border-ink-100 px-3 py-2.5 text-right text-ink-800" title={r.safetyStock ? `14-day moving average · safety stock ${r.safetyStock}` : "14-day moving average"}>
                      {r.forecastPerWeek > 0 ? `${r.forecastPerWeek < 10 ? r.forecastPerWeek.toFixed(1) : Math.round(r.forecastPerWeek)}/week` : <span className="text-ink-400">—</span>}
                    </td>
                    <td className={cn("tnum border-b border-ink-100 px-3 py-2.5 text-right", r.cover != null && r.cover < 7 ? "font-semibold text-amber-700" : "text-ink-600")}>{coverText(r.cover)}</td>
                    <td className="border-b border-ink-100 px-3 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" tabIndex={-1} onClick={() => set(r.variantId, n - 1)} className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`One less ${r.name}`}>
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <input
                          value={n || ""}
                          inputMode="numeric"
                          placeholder="0"
                          aria-label={`Order quantity for ${r.name}`}
                          onChange={(e) => set(r.variantId, Number(e.target.value.replace(/[^\d]/g, "").slice(0, 5)) || 0)}
                          onFocus={(e) => e.currentTarget.select()}
                          className={cn("tnum h-9 w-16 rounded-xl border bg-white text-center font-semibold focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15", n > 0 ? "border-brand-300 text-ink-950" : "border-ink-200 text-ink-500")}
                        />
                        <button type="button" tabIndex={-1} onClick={() => set(r.variantId, n + 1)} className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`One more ${r.name}`}>
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                      {r.suggested > 0 && n !== r.suggested && (
                        <button type="button" onClick={() => set(r.variantId, r.suggested)} className="mx-auto mt-0.5 block text-[0.68rem] font-semibold text-brand-700 hover:underline">
                          Suggested {r.suggested}
                        </button>
                      )}
                    </td>
                    <td className="tnum border-b border-ink-100 px-3 py-2.5 text-right text-ink-600">{zar(r.wholesaleCents)}</td>
                    <td className="tnum border-b border-ink-100 px-5 py-2.5 text-right font-medium text-ink-900">{n ? zar(n * r.wholesaleCents) : <span className="text-ink-300">—</span>}</td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-ink-500">
                    {view === "suggested" ? "Nothing needs reordering right now — switch to All ranged to top up anything." : "No items match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-ink-150 bg-ink-50/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="po-notes">Note to {dcName} (optional)</Label>
            <Input id="po-notes" name="notes" maxLength={500} placeholder="Delivery instructions, urgent items…" />
          </div>
          <dl className="grid grid-cols-4 gap-4 text-sm lg:w-[28rem]">
            <div>
              <dt className="text-xs text-ink-500">Lines · units</dt>
              <dd className="tnum font-semibold text-ink-900">
                {chosen.length} · {units}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Ex VAT</dt>
              <dd className="tnum font-semibold text-ink-900">{zar(subtotal)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">VAT 15%</dt>
              <dd className="tnum font-semibold text-ink-900">{zar(vat)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Total</dt>
              <dd className="tnum font-display text-lg font-semibold leading-tight text-ink-950">{zar(subtotal + vat)}</dd>
            </div>
          </dl>
          <div className="flex gap-2">
            <SubmitButton name="intent" value="draft" variant="outline" size="lg" disabled={!chosen.length} pendingLabel="Saving…">
              Save draft
            </SubmitButton>
            <SubmitButton name="intent" value="submit" size="lg" disabled={!chosen.length} pendingLabel="Submitting…">
              Submit order
            </SubmitButton>
          </div>
        </div>
        {chosen.some((r) => r.available > r.parLevel * 2 && r.parLevel > 0) && (
          <p className="mt-2 text-xs text-amber-700">
            <Badge tone="amber">Check</Badge> Some lines are for items you already hold more than twice par of.
          </p>
        )}
      </div>
    </ActionForm>
  );
}
