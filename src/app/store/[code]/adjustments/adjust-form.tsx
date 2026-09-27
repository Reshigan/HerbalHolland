"use client";
import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { Field, Input, Label } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/store/select";
import { ActionForm, FieldError, SubmitButton, type FormAction } from "@/components/store/action-form";
import { ADJUST_REASONS, REASON_ORDER } from "@/server/store/rules";
import type { AdjustItem } from "@/server/store/adjustments";
import type { AdjustReason } from "@/generated/prisma/client";

const GROUPS: { label: string; dir: "OUT" | "IN" | "EITHER" }[] = [
  { label: "Stock out", dir: "OUT" },
  { label: "Stock in", dir: "IN" },
  { label: "Either way", dir: "EITHER" },
];

export function AdjustForm({ items, action, initialVariant, initialBatch, initialReason }: {
  items: AdjustItem[];
  action: FormAction;
  initialVariant?: string;
  initialBatch?: string;
  initialReason?: AdjustReason;
}) {
  const uid = useId();
  const [itemId, setItemId] = useState(items.some((i) => i.id === initialVariant) ? initialVariant! : "");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [reason, setReason] = useState<AdjustReason>(initialReason ?? "DAMAGED");
  const [direction, setDirection] = useState<"OUT" | "IN">("OUT");
  const [batchId, setBatchId] = useState(() => initialBatch ?? items.find((i) => i.id === initialVariant)?.batches.find((b) => b.onHand > 0)?.id ?? "");
  const [qty, setQty] = useState("1");
  const [witness, setWitness] = useState("");
  const [note, setNote] = useState("");

  const item = items.find((i) => i.id === itemId);
  const meta = ADJUST_REASONS[reason];
  const dir = meta.dir === "EITHER" ? direction : meta.dir;
  const batches = (item?.batches ?? []).filter((b) => (dir === "OUT" ? b.onHand > 0 : true));
  const batch = batches.find((b) => b.id === batchId) ?? (batches.length === 1 ? batches[0] : undefined);
  const n = /^\d+$/.test(qty) ? Number(qty) : 0;
  const delta = dir === "OUT" ? -n : n;
  const after = batch ? batch.onHand + delta : null;

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items.slice(0, 8);
    return items.filter((i) => { const hay = `${i.name} ${i.sku} ${i.barcode ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); }).slice(0, 8);
  }, [items, query]);

  const choose = (i: AdjustItem) => {
    setItemId(i.id);
    setQuery("");
    setOpen(false);
    const first = i.batches.find((b) => b.onHand > 0) ?? i.batches[0];
    setBatchId(first?.id ?? "");
  };

  return (
    <ActionForm
      action={action}
      className="space-y-5"
      onDone={(s) => {
        if (s.ok) (setQty("1"), setWitness(""), setNote(""));
      }}
    >
      <input type="hidden" name="variantId" value={item?.id ?? ""} />
      <input type="hidden" name="batchId" value={batch?.id ?? ""} />
      <input type="hidden" name="direction" value={dir} />

      <div>
        <Label htmlFor={`${uid}-item`}>Item</Label>
        {item ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink-900">{item.name}</div>
              <div className="font-mono text-xs text-ink-500">
                {item.sku} · {item.onHand} on hand
              </div>
            </div>
            <button type="button" onClick={() => (setItemId(""), setBatchId(""))} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-150 hover:text-ink-900" aria-label="Choose a different item">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input
              id={`${uid}-item`}
              role="combobox"
              aria-expanded={open}
              aria-controls={`${uid}-list`}
              aria-activedescendant={open && results[active] ? `${uid}-opt-${active}` : undefined}
              aria-autocomplete="list"
              autoComplete="off"
              className="pl-9"
              placeholder="Search by name, SKU or scan a barcode"
              value={query}
              onChange={(e) => (setQuery(e.target.value), setOpen(true), setActive(0))}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setOpen(true), setActive((a) => Math.min(results.length - 1, a + 1)));
                if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
                if (e.key === "Enter") {
                  e.preventDefault();
                  const exact = items.find((i) => i.barcode === query.trim() || i.sku.toLowerCase() === query.trim().toLowerCase());
                  const pick = exact ?? results[active];
                  if (pick) choose(pick);
                }
                if (e.key === "Escape") setOpen(false);
              }}
            />
            {open && (
              <ul id={`${uid}-list`} role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-ink-150 bg-white p-1 shadow-lift">
                {results.length === 0 && <li className="px-3 py-2 text-sm text-ink-500">No items match “{query}”</li>}
                {results.map((i, idx) => (
                  <li
                    key={i.id}
                    id={`${uid}-opt-${idx}`}
                    role="option"
                    aria-selected={idx === active}
                    onMouseDown={(e) => (e.preventDefault(), choose(i))}
                    onMouseEnter={() => setActive(idx)}
                    className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm", idx === active ? "bg-brand-50 text-ink-950" : "text-ink-800")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{i.name}</span>
                      <span className="font-mono text-xs text-ink-400">{i.sku}</span>
                    </span>
                    <span className="tnum shrink-0 text-xs text-ink-500">{i.onHand} on hand</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <FieldError name="variantId" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reason" htmlFor={`${uid}-reason`} hint={meta.hint}>
          <Select id={`${uid}-reason`} name="reason" value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)}>
            {GROUPS.map((g) => (
              <optgroup key={g.dir} label={g.label}>
                {REASON_ORDER.filter((r) => ADJUST_REASONS[r].dir === g.dir).map((r) => (
                  <option key={r} value={r}>
                    {ADJUST_REASONS[r].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <FieldError name="reason" />
        </Field>
        <div>
          <Label htmlFor={`${uid}-qty`}>Quantity</Label>
          <div className="flex items-center gap-2">
            {meta.dir === "EITHER" ? (
              <div className="inline-flex rounded-full border border-ink-200 bg-white p-0.5" role="radiogroup" aria-label="Direction">
                {(["OUT", "IN"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={direction === d}
                    onClick={() => setDirection(d)}
                    className={cn("h-9 rounded-full px-3 text-xs font-semibold", direction === d ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900")}
                  >
                    {d === "OUT" ? "− Remove" : "+ Add"}
                  </button>
                ))}
              </div>
            ) : (
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-lg font-bold", dir === "OUT" ? "bg-rose-50 text-rose-600" : "bg-leaf-50 text-leaf-700")} aria-hidden>
                {dir === "OUT" ? "−" : "+"}
              </span>
            )}
            <div className="w-24">
              <Input id={`${uid}-qty`} name="qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, "").slice(0, 5))} className="tnum text-center" aria-describedby={`${uid}-dirnote`} />
            </div>
            <span id={`${uid}-dirnote`} className="sr-only">{dir === "OUT" ? "units removed from stock" : "units added to stock"}</span>
          </div>
          <FieldError name="qty" />
          <FieldError name="direction" />
        </div>
      </div>

      {item && (
        <fieldset>
          <legend className="mb-1.5 text-[0.78rem] font-semibold text-ink-700">Batch</legend>
          {batches.length === 0 ? (
            <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-sm text-ink-500">No stock of this item on hand to remove.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-ink-150">
              {batches.map((b) => (
                <label key={b.id} className={cn("flex cursor-pointer items-center gap-3 border-b border-ink-100 px-3.5 py-2.5 text-sm last:border-0", batch?.id === b.id ? "bg-brand-50/70" : "hover:bg-ink-50")}>
                  <input type="radio" name="batchPick" value={b.id} checked={batch?.id === b.id} onChange={() => setBatchId(b.id)} className="accent-brand-500" />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs font-semibold text-ink-900">{b.code}</span>
                    <span className="ml-2 text-xs text-ink-500">{b.expires ? `exp ${b.expires}` : "no expiry"}</span>
                    {!b.atStore && <span className="ml-2 text-xs text-ink-400">· not at this store yet</span>}
                  </span>
                  {b.status !== "RELEASED" && <Badge tone={b.status === "RECALLED" ? "red" : "amber"}>{b.status === "RECALLED" ? "Recalled" : "Quarantine"}</Badge>}
                  <span className="tnum w-20 text-right text-xs font-semibold text-ink-700">{b.onHand} on hand</span>
                </label>
              ))}
            </div>
          )}
          <FieldError name="batchId" />
        </fieldset>
      )}

      {reason === "DESTROYED" && (
        <Field label="Witness (full name)" htmlFor={`${uid}-witness`} hint="Recorded in the cannabis destruction register with your name and the time.">
          <Input id={`${uid}-witness`} name="witness" value={witness} onChange={(e) => setWitness(e.target.value)} maxLength={120} placeholder="e.g. Zanele Ndlovu" required />
          <FieldError name="witness" />
        </Field>
      )}

      <Field label={reason === "CORRECTION" ? "What happened?" : "Note (optional)"} htmlFor={`${uid}-note`}>
        <Input id={`${uid}-note`} name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={reason === "THEFT" ? "SAPS case number, what was taken" : "Anything the next person should know"} />
        <FieldError name="note" />
      </Field>

      {batch && n > 0 && (
        <div className="rounded-xl bg-ink-950 px-4 py-3 text-sm text-ink-200" aria-live="polite">
          Batch <span className="font-mono text-white">{batch.code}</span>: {batch.onHand} → <b className={cn("text-white", after != null && after < 0 && "text-rose-400")}>{after}</b> · {zar(delta * batch.unitCostCents)} at cost
        </div>
      )}

      <SubmitButton variant={dir === "OUT" ? "dark" : "primary"} pendingLabel="Posting…" disabled={!item || !batch || n <= 0}>
        {dir === "OUT" ? `Write off ${n || ""}`.trim() : `Book in ${n || ""}`.trim()}
      </SubmitButton>
    </ActionForm>
  );
}
