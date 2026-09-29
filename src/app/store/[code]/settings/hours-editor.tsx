"use client";
// Trading hours: one row per day inside the store-details form (Save details posts the whole week), and, for a
// change to a single day, a Save button on that row that posts just that day straight away.
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { WEEK, type DayKey, type TradingHours } from "@/server/store/rules";
import type { ActionState } from "@/server/store/context";

type Day = { closed: boolean; open: string; close: string };
type DayAction = (state: ActionState, fd: FormData) => Promise<ActionState>;

const same = (a: Day, b: Day) => a.closed === b.closed && (a.closed || (a.open === b.open && a.close === b.close));

/** `saveDay`: one bound server action per day (a plain object, so it can cross the server → client boundary). */
export function HoursEditor({ initial, saveDay }: { initial: TradingHours; saveDay?: Partial<Record<DayKey, DayAction>> }) {
  const toDay = (k: DayKey): Day => ({ closed: !initial[k], open: initial[k]?.open ?? "09:00", close: initial[k]?.close ?? "17:00" });
  const [week, setWeek] = useState(() => Object.fromEntries(WEEK.map(([k]) => [k, toDay(k)])) as Record<DayKey, Day>);
  const set = (k: DayKey, patch: Partial<Day>) => setWeek((w) => ({ ...w, [k]: { ...w[k], ...patch } }));
  const copyMonday = () => setWeek((w) => ({ ...w, tue: { ...w.mon }, wed: { ...w.mon }, thu: { ...w.mon }, fri: { ...w.mon } }));
  const input = "tnum h-9 w-36 rounded-xl border border-ink-200 bg-white px-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-ink-50 disabled:text-ink-500";
  return (
    <fieldset>
      <legend className="mb-1.5 flex w-full items-center justify-between text-[0.78rem] font-semibold text-ink-700">
        Trading hours
        <button type="button" onClick={copyMonday} className="text-xs font-semibold text-brand-700 hover:underline">
          Copy Monday to weekdays
        </button>
      </legend>
      <div className="divide-y divide-ink-100 rounded-2xl border border-ink-150">
        {WEEK.map(([k, name]) => {
          const d = week[k];
          return (
            <div key={k} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="w-24 text-sm font-medium text-ink-850">{name}</span>
              <label className="flex items-center gap-2 text-xs text-ink-600">
                <input type="checkbox" name={`closed:${k}`} checked={d.closed} onChange={(e) => set(k, { closed: e.target.checked })} className="accent-brand-500" />
                Closed
              </label>
              <div className={cn("ml-auto flex items-center gap-2", d.closed && "opacity-40")}>
                <label className="sr-only" htmlFor={`open-${k}`}>{name} opens</label>
                <input id={`open-${k}`} type="time" name={`open:${k}`} value={d.open} disabled={d.closed} onChange={(e) => set(k, { open: e.target.value })} className={input} />
                <span className="text-xs text-ink-500">to</span>
                <label className="sr-only" htmlFor={`close-${k}`}>{name} closes</label>
                <input id={`close-${k}`} type="time" name={`close:${k}`} value={d.close} disabled={d.closed} onChange={(e) => set(k, { close: e.target.value })} className={input} />
              </div>
              {saveDay?.[k] && <DaySave day={k} name={name} value={d} saved={toDay(k)} action={saveDay[k]!} />}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Appears once the row differs from what's saved; posts that day only, and shows the result inline. */
function DaySave({ day, name, value, saved, action }: { day: DayKey; name: string; value: Day; saved: Day; action: DayAction }) {
  const [state, run, pending] = useActionState(action, {});
  const [, start] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const seen = useRef<number | undefined>(undefined);
  const dirty = !same(value, saved);
  useEffect(() => {
    if (!state.at || state.at === seen.current) return;
    seen.current = state.at;
    if (state.ok) {
      setFlash(state.ok);
      const t = setTimeout(() => setFlash(null), 6000);
      return () => clearTimeout(t);
    }
  }, [state.at, state.ok]);
  const submit = () => {
    const fd = new FormData();
    fd.set("closed", value.closed ? "on" : "");
    fd.set("open", value.open);
    fd.set("close", value.close);
    setFlash(null);
    start(() => run(fd));
  };
  const showError = state.error && !state.ok && dirty && seen.current === state.at;
  if (!dirty && !flash && !showError) return null;
  return (
    <div className="flex basis-full items-center justify-end gap-2 sm:basis-auto">
      {showError && (
        <span role="alert" className="text-xs font-medium text-rose-600">
          {state.error}
        </span>
      )}
      {flash && !dirty && (
        <span role="status" className="inline-flex items-center gap-1 text-xs text-leaf-700">
          <Check className="h-3.5 w-3.5" aria-hidden /> {flash}
        </span>
      )}
      {dirty && (
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink-900 px-3 text-xs font-semibold text-white hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 disabled:opacity-50"
          aria-label={`Save ${name} hours now`}
          data-day={day}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
          {pending ? "Saving…" : `Save ${name.slice(0, 3)}`}
        </button>
      )}
    </div>
  );
}
