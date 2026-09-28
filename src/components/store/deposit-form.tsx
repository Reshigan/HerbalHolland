"use client";
// Record-a-deposit helpers for the banking page: tick the cash-ups a deposit covers (the running total is there to
// compare with the slip), and a slip picker that stops a file over the upload limit before it's sent.
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { parseRand } from "@/server/store/rules";

export type CashUpOption = { id: string; label: string; sub: string; cents: number; overdue: boolean };

/**
 * One checkbox per waiting cash-up (all ticked), the ticked total, then `children` (the amount field), then how the
 * amount typed compares with the ticked total. Checkboxes stay uncontrolled so a form reset re-ticks them.
 */
export function CashUpPicker({ items, children, name = "shift", amountName = "amount" }: { items: CashUpOption[]; children?: React.ReactNode; name?: string; amountName?: string }) {
  const box = useRef<HTMLFieldSetElement>(null);
  const [ticked, setTicked] = useState({ n: items.length, cents: items.reduce((s, i) => s + i.cents, 0) });
  const [amount, setAmount] = useState<number | null>(null);
  const boxes = useCallback(() => [...(box.current?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`) ?? [])], [name]);
  const recount = useCallback(() => {
    const on = boxes().filter((el) => el.checked);
    setTicked({ n: on.length, cents: on.reduce((s, el) => s + Number(el.dataset.cents || 0), 0) });
  }, [boxes]);
  const ids = items.map((i) => i.id).join(",");
  useEffect(() => {
    recount();
    const form = box.current?.form;
    if (!form) return;
    const read = () => {
      const el = form.elements.namedItem(amountName);
      setAmount(el instanceof HTMLInputElement ? parseRand(el.value) : null);
    };
    const onInput = (e: Event) => (e.target as HTMLInputElement | null)?.name === amountName && read();
    // reset fires before the fields are reset: count once they are.
    const onReset = () => setTimeout(() => (recount(), read()), 0);
    read();
    form.addEventListener("input", onInput);
    form.addEventListener("reset", onReset);
    return () => (form.removeEventListener("input", onInput), form.removeEventListener("reset", onReset));
  }, [ids, recount, amountName]);
  const tickAll = (on: boolean) => {
    for (const el of boxes()) el.checked = on;
    recount();
  };
  const diff = amount == null || ticked.n === 0 ? null : amount - ticked.cents;

  return (
    <>
      <fieldset ref={box} className="min-w-0">
        <legend className="mb-1.5 text-[0.78rem] font-semibold text-ink-700">Cash-ups in this deposit</legend>
        <div className="max-h-72 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
          {items.map((i) => (
            <label key={i.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-ink-50">
              <input type="checkbox" name={name} value={i.id} defaultChecked data-cents={i.cents} onChange={recount} className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-brand-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-850">{i.label}</span>
                <span className={cn("block text-xs", i.overdue ? "font-semibold text-rose-600" : "text-ink-500")}>{i.sub}</span>
              </span>
              <span className="tnum text-sm font-medium text-ink-900">{zar(i.cents)}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-600" aria-live="polite">
            Ticked {ticked.n} of {items.length} · <b className="tnum font-semibold text-ink-950">{zar(ticked.cents)}</b>
          </p>
          {items.length > 1 && (
            <span className="flex gap-1">
              <button type="button" onClick={() => tickAll(true)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                Tick all
              </button>
              <button type="button" onClick={() => tickAll(false)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
                Clear
              </button>
            </span>
          )}
        </div>
      </fieldset>
      {children}
      {diff != null && (
        <p className={cn("text-xs font-medium", diff === 0 ? "text-leaf-700" : diff < 0 ? "text-rose-600" : "text-amber-700")} aria-live="polite">
          {diff === 0 ? "Matches the ticked cash-ups." : diff < 0 ? `${zar(-diff)} short of the ticked cash-ups.` : `${zar(diff)} over the ticked cash-ups.`}
        </p>
      )}
    </>
  );
}

/** File input for the slip: any photo or a PDF (no `capture`, so a PDF can still be picked on a phone). */
export function SlipInput({ id, name = "slip" }: { id: string; name?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b % (1024 * 1024) ? 1 : 0)} MB`;
  return (
    <>
      <input
        id={id}
        name={name}
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          const m = f && f.size > MAX_UPLOAD_BYTES ? `That file is ${mb(f.size)} — the slip has to be ${mb(MAX_UPLOAD_BYTES)} or less. Take the photo again or use a smaller PDF.` : "";
          e.currentTarget.setCustomValidity(m);
          setMsg(m || null);
        }}
        className="block w-full rounded-xl text-sm text-ink-700 file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15"
      />
      {msg && (
        <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
          {msg}
        </p>
      )}
    </>
  );
}
