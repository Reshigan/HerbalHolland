"use client";
import { useState, useTransition } from "react";
import { Check, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { pct, zar } from "@/lib/money";
import { marginPct } from "@/lib/pricing-rules";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/page";
import type { ActionState } from "@/server/store/context";
import type { PriceRow } from "@/server/store/pricing";
import { parseRand } from "@/server/store/rules";

const rands = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));

export function PriceTable({ rows, minMargin, canManage, save }: {
  rows: PriceRow[];
  minMargin: number;
  canManage: boolean;
  save: (changes: { variantId: string; priceCents: number | null }[]) => Promise<ActionState>;
}) {
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionState | null>(null);
  const [saving, start] = useTransition();

  const value = (r: PriceRow) => (r.variantId in edit ? edit[r.variantId] : rands(r.shelfCents));
  const parsed = (r: PriceRow): number | null | "bad" => {
    const v = value(r).trim();
    if (!v) return null;
    const c = parseRand(v);
    return c == null || c <= 0 ? "bad" : c;
  };
  const changed = rows.filter((r) => r.variantId in edit && parsed(r) !== "bad" && parsed(r) !== r.shelfCents);
  const invalid = rows.filter((r) => parsed(r) === "bad");

  const submit = () =>
    start(async () => {
      const res = await save(changed.map((r) => ({ variantId: r.variantId, priceCents: parsed(r) as number | null })));
      setResult(res);
      if (res.ok) setEdit({});
    });

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
              <th className="border-b border-ink-150 bg-ink-50 px-5 py-2.5 text-left">Item</th>
              <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">RRP</th>
              <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">List price</th>
              <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-left" title="Leave blank to follow the list price">Your shelf price</th>
              <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">Wholesale ex VAT</th>
              <th className="border-b border-ink-150 bg-ink-50 px-5 py-2.5 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = parsed(r);
              const effective = p === "bad" ? r.effectiveCents : p ?? r.listCents;
              const m = marginPct(effective, r.wholesaleCents);
              const thin = m < minMargin;
              const dirty = r.variantId in edit && p !== r.shelfCents;
              return (
                <tr key={r.variantId} className={cn(dirty ? "bg-brand-50/60" : "hover:bg-ink-50/60")}>
                  <td className="border-b border-ink-100 px-5 py-2.5">
                    <div className="font-medium text-ink-900">{r.name}</div>
                    <div className="text-xs text-ink-400">
                      <span className="font-mono">{r.sku}</span> · {r.category}
                    </div>
                  </td>
                  <td className="tnum border-b border-ink-100 px-3 py-2.5 text-right text-ink-500">{zar(r.rrpCents)}</td>
                  <td className="tnum border-b border-ink-100 px-3 py-2.5 text-right text-ink-700">
                    {zar(r.listCents)}
                    {r.listName && <div className="text-[0.68rem] text-ink-400">{r.listName}</div>}
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400">R</span>
                        <input
                          value={value(r)}
                          disabled={!canManage}
                          inputMode="decimal"
                          placeholder={rands(r.listCents)}
                          aria-label={`Shelf price for ${r.name}`}
                          aria-invalid={p === "bad" || undefined}
                          onChange={(e) => (setEdit((x) => ({ ...x, [r.variantId]: e.target.value })), setResult(null))}
                          className={cn(
                            "tnum h-9 w-28 rounded-xl border bg-white pl-6 pr-2 text-right text-sm font-semibold focus:outline-none focus:ring-4 disabled:bg-ink-50",
                            p === "bad" ? "border-rose-500 focus:ring-rose-500/15" : dirty ? "border-brand-400 focus:ring-brand-500/15" : "border-ink-200 focus:border-brand-500 focus:ring-brand-500/15",
                            p == null && "font-normal text-ink-400",
                          )}
                        />
                      </div>
                      {canManage && (r.shelfCents != null || (r.variantId in edit && edit[r.variantId] !== "")) && (
                        <button type="button" onClick={() => setEdit((x) => ({ ...x, [r.variantId]: "" }))} className="grid h-8 w-8 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-800" title="Use the list price" aria-label={`Reset ${r.name} to the list price`}>
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="tnum border-b border-ink-100 px-3 py-2.5 text-right text-ink-600">{zar(r.wholesaleCents)}</td>
                  <td className={cn("tnum border-b border-ink-100 px-5 py-2.5 text-right font-semibold", thin ? "text-amber-700" : "text-leaf-700")}>
                    <span className="inline-flex items-center gap-1">
                      {thin && <TriangleAlert className="h-3.5 w-3.5" aria-label="Below the margin guide" />}
                      {pct(m)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canManage && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-ink-150 bg-white/95 px-5 py-3 backdrop-blur">
          {result?.error && <Notice tone="danger" className="w-full">{result.error}</Notice>}
          {result?.ok && (
            <span className="inline-flex items-center gap-1.5 text-sm text-leaf-700">
              <Check className="h-4 w-4" aria-hidden /> {result.ok}
            </span>
          )}
          {invalid.length > 0 && <span className="text-sm text-rose-600">{invalid.length} price{invalid.length > 1 ? "s aren't" : " isn't"} a valid amount</span>}
          <div className="ml-auto flex items-center gap-2">
            {changed.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => (setEdit({}), setResult(null))}>
                Discard
              </Button>
            )}
            <Button type="button" onClick={submit} disabled={!changed.length || invalid.length > 0 || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {changed.length ? `Save ${changed.length} price${changed.length === 1 ? "" : "s"}` : "No changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
