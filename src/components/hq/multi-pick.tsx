"use client";
// Searchable multi-select (stores, products, categories…). Posts one `name` field per
// selected value, so server actions read it with formData.getAll(name).
import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type PickOption = { value: string; label: string; hint?: string; group?: string };

export function MultiPick({
  name,
  options,
  defaultValue = [],
  emptyLabel = "None selected",
  placeholder = "Search…",
  className,
  onChange,
  height = "max-h-56",
}: {
  name: string;
  options: PickOption[];
  defaultValue?: string[];
  emptyLabel?: string;
  placeholder?: string;
  className?: string;
  onChange?: (values: string[]) => void;
  height?: string;
}) {
  const [picked, setPicked] = useState<string[]>(defaultValue);
  const [q, setQ] = useState("");
  const id = useId();
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.group ?? ""}`.toLowerCase().includes(t)) : options;
  }, [q, options]);
  const set = (next: string[]) => {
    setPicked(next);
    onChange?.(next);
  };
  const toggle = (v: string) => set(picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]);

  return (
    <div className={cn("rounded-xl border border-ink-200 bg-white", className)}>
      {picked.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 border-b border-ink-100 px-2.5 py-2">
        {picked.length === 0 && <span className="px-1 text-xs text-ink-500">{emptyLabel}</span>}
        {picked.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-200">
            {byValue.get(v)?.label ?? v}
            <button type="button" onClick={() => toggle(v)} className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand-100" aria-label={`Remove ${byValue.get(v)?.label ?? v}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {picked.length > 1 && (
          <button type="button" onClick={() => set([])} className="ml-auto text-xs font-medium text-ink-500 hover:text-ink-800">
            Clear
          </button>
        )}
      </div>
      {options.length > 8 && (
        <label className="relative block border-b border-ink-100">
          <span className="sr-only">Filter options</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder={placeholder}
            className="h-9 w-full rounded-none bg-transparent pl-8 pr-3 text-sm placeholder:text-ink-400 focus:outline-none"
          />
        </label>
      )}
      <ul className={cn("overflow-y-auto p-1", height)} role="listbox" aria-multiselectable aria-labelledby={id}>
        {shown.length === 0 && <li className="px-3 py-2 text-xs text-ink-500">No matches</li>}
        {shown.map((o, i) => (
          <li key={o.value}>
            {o.group && o.group !== shown[i - 1]?.group && <div className="px-2.5 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-ink-500">{o.group}</div>}
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-ink-50">
              <input type="checkbox" checked={picked.includes(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 shrink-0 accent-brand-500" />
              <span className="min-w-0 flex-1 truncate text-ink-800">{o.label}</span>
              {o.hint && <span className="shrink-0 text-xs text-ink-500">{o.hint}</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
