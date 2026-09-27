"use client";
import { useState } from "react";
import { PackageCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { vatOnExcl, zar } from "@/lib/money";
import { Notice } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { ActionForm, SubmitButton, type FormAction } from "@/components/store/action-form";
import { plural, receiptCheck } from "@/server/store/rules";

export type ReceiveLine = { id: string; name: string; sku: string; ordered: number; shipped: number; lots: string; unitCostCents: number };

export function ReceiveForm({ lines, action }: { lines: ReceiveLine[]; action: FormAction }) {
  const [recv, setRecv] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(l.shipped)])));
  const [confirming, setConfirming] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const n = (id: string) => (/^\d+$/.test(recv[id] ?? "") ? Number(recv[id]) : NaN);
  const invalid = lines.filter((l) => Number.isNaN(n(l.id)) || n(l.id) > l.shipped);
  const check = receiptCheck(lines.map((l) => ({ ordered: l.ordered, shipped: l.shipped, received: Number.isNaN(n(l.id)) ? 0 : n(l.id) })));
  const value = lines.reduce((s, l) => s + (Number.isNaN(n(l.id)) ? 0 : n(l.id)) * l.unitCostCents, 0);

  if (doneMsg) return <Notice tone="success" className="m-5">{doneMsg}</Notice>;
  return (
    <ActionForm action={action} onDone={(s) => s.ok && setDoneMsg(s.ok)} notices="bottom">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
              <th className="border-b border-ink-150 bg-ink-50 px-4 py-2.5 text-left sm:px-5">Item</th>
              <th className="hidden border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-left md:table-cell">Batches shipped</th>
              <th className="hidden border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right sm:table-cell">Ordered</th>
              <th className="border-b border-ink-150 bg-ink-50 px-3 py-2.5 text-right">Shipped</th>
              <th className="border-b border-ink-150 bg-ink-50 px-4 py-2.5 text-center sm:px-5">Received</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const v = n(l.id);
              const bad = Number.isNaN(v) || v > l.shipped;
              const short = !bad && v < l.shipped;
              return (
                <tr key={l.id} className={cn(bad ? "bg-rose-50/70" : short ? "bg-amber-50/80" : undefined)}>
                  <td className="border-b border-ink-100 px-4 py-2.5 sm:px-5">
                    <div className="font-medium text-ink-900">{l.name}</div>
                    <div className="font-mono text-xs text-ink-400">{l.sku}</div>
                    {l.lots && <div className="font-mono text-xs text-ink-600 md:hidden">{l.lots}</div>}
                    <div className="text-xs text-ink-500 sm:hidden">ordered {l.ordered}</div>
                  </td>
                  <td className="hidden border-b border-ink-100 px-3 py-2.5 font-mono text-xs text-ink-600 md:table-cell">{l.lots || "—"}</td>
                  <td className="tnum hidden border-b border-ink-100 px-3 py-2.5 text-right text-ink-600 sm:table-cell">{l.ordered}</td>
                  <td className={cn("tnum border-b border-ink-100 px-3 py-2.5 text-right", l.shipped < l.ordered ? "font-semibold text-amber-700" : "text-ink-800")}>
                    {l.shipped}
                    {l.shipped < l.ordered && <div className="text-[0.68rem] font-medium">short-shipped {l.ordered - l.shipped}</div>}
                  </td>
                  <td className="border-b border-ink-100 px-4 py-2 sm:px-5">
                    <div className="flex flex-col items-center">
                      <input
                        name={`recv:${l.id}`}
                        value={recv[l.id] ?? ""}
                        inputMode="numeric"
                        disabled={l.shipped === 0}
                        aria-label={`Received quantity for ${l.name}`}
                        aria-invalid={bad || undefined}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => (setRecv((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d]/g, "").slice(0, 5) })), setConfirming(false))}
                        className={cn(
                          "tnum h-10 w-20 rounded-xl border bg-white text-center text-base font-semibold focus:outline-none focus:ring-4 disabled:bg-ink-50 disabled:text-ink-400",
                          bad ? "border-rose-500 focus:ring-rose-500/15" : short ? "border-amber-500 focus:ring-amber-500/15" : "border-ink-200 focus:border-oranje-500 focus:ring-oranje-500/15",
                        )}
                      />
                      {short && <span className="mt-0.5 text-[0.68rem] font-semibold text-amber-700">{l.shipped - v} short</span>}
                      {bad && <span className="mt-0.5 text-[0.68rem] font-semibold text-rose-600">0–{l.shipped}</span>}
                      {l.shipped === 0 && <input type="hidden" name={`recv:${l.id}`} value="0" />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 p-5">
        {!check.clean && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {check.shortShipped > 0 && <>{plural(check.shortShipped, "unit was", "units were")} short-shipped by the supplier. </>}
              {check.shortReceived > 0 && <>{plural(check.shortReceived, "unit", "units")} fewer than the delivery note — say what happened below; the discrepancy is flagged to the supplier.</>}
            </span>
          </p>
        )}
        <div>
          <Label htmlFor="recv-note">Receiving note {check.shortReceived > 0 ? "(recommended)" : "(optional)"}</Label>
          <Input id="recv-note" name="note" maxLength={500} placeholder="e.g. 2 units crushed in transit, photos sent to the DC" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {confirming ? (
            <>
              <SubmitButton pendingLabel="Receiving…" disabled={invalid.length > 0}>
                <PackageCheck className="h-4 w-4" aria-hidden /> Confirm — book {plural(check.units, "unit")} in
              </SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Back
              </Button>
              <span className="text-xs text-ink-500">Stock becomes sellable immediately and the tax invoice ({zar(value + vatOnExcl(value))} incl. VAT) is emailed.</span>
            </>
          ) : (
            <Button type="button" disabled={invalid.length > 0} onClick={() => setConfirming(true)}>
              <PackageCheck className="h-4 w-4" aria-hidden /> Receive {plural(check.units, "unit")}
            </Button>
          )}
        </div>
      </div>
    </ActionForm>
  );
}
