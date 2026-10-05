"use client";
// Filters for the books' reports: the period (a month, a financial quarter or year, or a custom range of months), an
// "as at" day, the store, and a report's own choices. The URL is the state: a change navigates, keeping the other
// parameters (and going back to the first page), and the report re-renders on the server.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { monthLabel, type PeriodChoice } from "@/lib/ledger-reports";

export type Query = Record<string, string | null | undefined>;
export type Choice = { value: string; label: string; group?: string };

function hrefOf(path: string, query: Query, patch: Query) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...query, ...patch, page: undefined })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

function useNavigate(path: string, query: Query) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return { pending, go: (patch: Query) => start(() => router.push(hrefOf(path, query, patch), { scroll: false })) };
}

/** The row the filters sit in (left out of print). */
export function FilterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="search" aria-label="Report filters" className={cn("mb-6 flex flex-wrap items-center gap-2 print:hidden", className)}>
      {children}
    </div>
  );
}

/** A labelled select in a pill, as in the reports' filter bar. */
function Pill({ label, children, pending }: { label: string; children: React.ReactNode; pending?: boolean }) {
  return (
    <label
      className={cn(
        "relative inline-flex h-10 min-w-0 max-w-full items-center rounded-full border border-ink-150 bg-white pl-3.5 pr-9 shadow-card transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15 hover:border-ink-300",
        pending && "opacity-60",
      )}
    >
      <span className="mr-1.5 whitespace-nowrap text-xs font-semibold text-ink-500">{label}</span>
      {children}
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ink-400" strokeWidth={2.2} aria-hidden />
    </label>
  );
}
const SELECT = "min-w-0 max-w-[15rem] cursor-pointer appearance-none truncate bg-transparent text-sm font-semibold text-ink-900 focus:outline-none";

function Options({ choices }: { choices: Choice[] }) {
  const groups = [...new Set(choices.flatMap((c) => (c.group ? [c.group] : [])))];
  const option = (c: Choice) => (
    <option key={c.value} value={c.value}>
      {c.label}
    </option>
  );
  return (
    <>
      {choices.filter((c) => !c.group).map(option)}
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {choices.filter((c) => c.group === g).map(option)}
        </optgroup>
      ))}
    </>
  );
}

/** One of a report's choices (compare with, show by, account, VAT period, month). `clear` drops parameters that depend on it. */
export function ChoiceFilter({ path, query, name, label, choices, value, clear = [] }: { path: string; query: Query; name: string; label: string; choices: Choice[]; value: string; clear?: string[] }) {
  const { go, pending } = useNavigate(path, query);
  return (
    <Pill label={label} pending={pending}>
      <select key={value} defaultValue={value} aria-busy={pending} onChange={(e) => go({ ...Object.fromEntries(clear.map((k) => [k, undefined])), [name]: e.target.value || undefined })} className={SELECT}>
        <Options choices={choices} />
      </select>
    </Pill>
  );
}

/** The store filter: all stores, or one of the company's own. Only for companies with several stores. */
export function StoreFilter({ path, query, stores, value }: { path: string; query: Query; stores: { id: string; name: string }[]; value: string | null }) {
  if (stores.length < 2) return null;
  return <ChoiceFilter path={path} query={query} name="store" label="Store" value={value ?? ""} choices={[{ value: "", label: "All stores" }, ...stores.map((s) => ({ value: s.id, label: s.name }))]} />;
}

type PeriodProps = { path: string; query: Query; choices: PeriodChoice[]; months: string[]; from: string; to: string };

/** The period: a month, a financial quarter or year, or a custom range of months (?from=YYYY-MM&to=YYYY-MM). */
export function PeriodPicker(props: PeriodProps) {
  return <Period key={`${props.from}:${props.to}`} {...props} />;
}

function Period({ path, query, choices, months, from, to }: PeriodProps) {
  const { go, pending } = useNavigate(path, query);
  const [custom, setCustom] = useState(!choices.some((c) => c.from === from && c.to === to));
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const monthOptions = months.map((m) => (
    <option key={m} value={m}>
      {monthLabel(m, true)}
    </option>
  ));
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Period">
      <Pill label="Period" pending={pending}>
        <select
          value={custom ? "custom" : `${from}:${to}`}
          aria-busy={pending}
          onChange={(e) => {
            if (e.target.value === "custom") return setCustom(true);
            const [a, b] = e.target.value.split(":");
            go({ from: a, to: b });
          }}
          className={SELECT}
        >
          <Options choices={choices.map((c) => ({ value: `${c.from}:${c.to}`, label: c.label, group: c.group }))} />
          <option value="custom">Custom range…</option>
        </select>
      </Pill>
      {custom && (
        <form
          className="flex flex-wrap items-center gap-2"
          aria-label="Custom range of months"
          onSubmit={(e) => {
            e.preventDefault();
            go(f <= t ? { from: f, to: t } : { from: t, to: f });
          }}
        >
          <Pill label="From">
            <select value={f} onChange={(e) => setF(e.target.value)} className={SELECT}>
              {monthOptions}
            </select>
          </Pill>
          <Pill label="To">
            <select value={t} onChange={(e) => setT(e.target.value)} className={SELECT}>
              {monthOptions}
            </select>
          </Pill>
          {(f !== from || t !== to) && (
            <Button type="submit" variant="dark" size="sm" className="h-10">
              Show
            </Button>
          )}
        </form>
      )}
    </div>
  );
}

/** An "as at" day: a date and a button (typing a date doesn't reload the page at every keystroke). */
export function DayFilter({ path, query, name, label, value, max }: { path: string; query: Query; name: string; label: string; value: string; max?: string }) {
  const { go, pending } = useNavigate(path, query);
  const [day, setDay] = useState(value);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (day) go({ [name]: day });
      }}
    >
      <label className={cn("inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-150 bg-white px-3.5 shadow-card focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15", pending && "opacity-60")}>
        <span className="whitespace-nowrap text-xs font-semibold text-ink-500">{label}</span>
        <input type="date" value={day} max={max} required onChange={(e) => setDay(e.target.value)} className="bg-transparent text-sm font-semibold text-ink-900 focus:outline-none" />
      </label>
      {day !== value && (
        <Button type="submit" variant="dark" size="sm" className="h-10">
          Show
        </Button>
      )}
    </form>
  );
}
