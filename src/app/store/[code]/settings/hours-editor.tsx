"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { WEEK, type DayKey, type TradingHours } from "@/server/store/rules";

export function HoursEditor({ initial }: { initial: TradingHours }) {
  const [week, setWeek] = useState(() =>
    Object.fromEntries(WEEK.map(([k]) => [k, { closed: !initial[k], open: initial[k]?.open ?? "09:00", close: initial[k]?.close ?? "17:00" }])) as Record<DayKey, { closed: boolean; open: string; close: string }>,
  );
  const set = (k: DayKey, patch: Partial<(typeof week)[DayKey]>) => setWeek((w) => ({ ...w, [k]: { ...w[k], ...patch } }));
  const copyMonday = () => setWeek((w) => ({ ...w, tue: { ...w.mon }, wed: { ...w.mon }, thu: { ...w.mon }, fri: { ...w.mon } }));
  const input = "tnum h-9 w-36 rounded-xl border border-ink-200 bg-white px-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:bg-ink-50 disabled:text-ink-300";
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
                <span className="text-xs text-ink-400">to</span>
                <label className="sr-only" htmlFor={`close-${k}`}>{name} closes</label>
                <input id={`close-${k}`} type="time" name={`close:${k}`} value={d.close} disabled={d.closed} onChange={(e) => set(k, { close: e.target.value })} className={input} />
              </div>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
