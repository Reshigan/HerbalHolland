"use client";
// One row of filters above everything they scope: date range first (presets, then a
// custom range), then stores, category, channel and the report's own options.
// The URL is the state — shareable, bookmarkable and identical to the CSV export.
import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { NavCapture, useReport } from "./frame";
import type { Control, Controls } from "@/server/reports/context";

const short = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (d: string) => short.format(new Date(`${d}T12:00:00Z`));

export function FilterBar({ path, query, controls }: { path: string; query: Record<string, string>; controls: Controls }) {
  const { go, pending } = useReport();
  const nav = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...patch })) if (v) p.set(k, v);
    const qs = p.toString();
    go(qs ? `${path}?${qs}` : path);
  };
  const rest = Object.fromEntries(Object.entries(query).filter(([k]) => !["range", "from", "to"].includes(k)));
  const { range, selects } = controls;
  if (!range && !selects.length) return null;
  return (
    <div role="search" aria-label="Report filters" className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
      {range && (
        <>
          <NavCapture className="scrollbar-none -mx-1 max-w-[calc(100%+0.5rem)] overflow-x-auto px-1 py-0.5">
            <RangeTabs path={path} current={range.preset} params={rest} />
          </NavCapture>
          <CustomRange key={`${range.from}:${range.to}`} from={range.from} to={range.to} active={range.preset === "custom"} onApply={(from, to) => nav({ range: undefined, from, to })} />
        </>
      )}
      {selects.map((s) => (
        <FilterSelect key={s.name} control={s} onChange={(v) => nav({ [s.name]: v })} />
      ))}
      <span aria-live="polite" className="text-xs font-medium text-ink-500">
        {pending ? "Updating…" : ""}
      </span>
    </div>
  );
}

function FilterSelect({ control, onChange }: { control: Control; onChange: (v: string) => void }) {
  const loose = control.options.filter((o) => !o.group);
  const groups = [...new Set(control.options.filter((o) => o.group).map((o) => o.group!))];
  return (
    <label className="relative inline-flex h-10 min-w-0 max-w-full items-center rounded-full border border-ink-150 bg-white pl-3.5 pr-9 shadow-card transition focus-within:border-oranje-500 focus-within:ring-4 focus-within:ring-oranje-500/15 hover:border-ink-300">
      <span className="mr-1.5 whitespace-nowrap text-xs font-semibold text-ink-500">{control.label}</span>
      <select
        key={control.value}
        defaultValue={control.value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 max-w-[12.5rem] cursor-pointer appearance-none truncate bg-transparent text-sm font-semibold text-ink-900 focus:outline-none"
      >
        {loose.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {control.options
              .filter((o) => o.group === g)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ink-400" strokeWidth={2.2} aria-hidden />
    </label>
  );
}

function CustomRange({ from, to, active, onApply }: { from: string; to: string; active: boolean; onApply: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const invalid = !f || !t || f > t;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold shadow-card transition-colors",
          active ? "border-ink-900 bg-ink-900 text-white" : "border-ink-150 bg-white text-ink-600 hover:text-ink-900",
        )}
      >
        <CalendarRange className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        {active ? `${fmt(from)} – ${fmt(to)}` : "Custom dates"}
      </button>
      {open && (
        <form
          role="dialog"
          aria-label="Custom date range"
          className="absolute left-0 z-30 mt-2 w-72 rounded-2xl border border-ink-150 bg-white p-4 shadow-lift"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid) return;
            setOpen(false);
            onApply(f, t);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[0.78rem] font-semibold text-ink-700">
              From
              <input type="date" value={f} max={t || undefined} required onChange={(e) => setF(e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 px-2.5 text-sm font-normal text-ink-900 focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15" />
            </label>
            <label className="text-[0.78rem] font-semibold text-ink-700">
              To
              <input type="date" value={t} min={f || undefined} required onChange={(e) => setT(e.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-ink-200 px-2.5 text-sm font-normal text-ink-900 focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15" />
            </label>
          </div>
          {invalid && f && t && <p className="mt-2 text-xs font-medium text-rose-600">The start date must be on or before the end date.</p>}
          <p className="mt-2 text-xs text-ink-500">Up to a year, in South African business days.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={invalid}>
              Apply
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
