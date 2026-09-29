"use client";
// "Email me this weekly / monthly": a popover on HQ report pages that schedules the report with its current
// filters, lists the person's existing schedules for it and stops them. Recipients are staff email addresses.
import { useEffect, useId, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select } from "@/components/ui/form";
import { ActionButton, ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import type { ActionState } from "@/server/hq/guard";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;
export type ScheduleRow = { id: string; label: string; recipients: string[]; lastRun: string; stop: Action };
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function ScheduleExport({ me, schedules, schedule }: { me: string; schedules: ScheduleRow[]; schedule: Action }) {
  const [open, setOpen] = useState(false);
  const [cadence, setCadence] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", esc);
    window.addEventListener("pointerdown", away);
    return () => (window.removeEventListener("keydown", esc), window.removeEventListener("pointerdown", away));
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <Button type="button" variant="outline" size="md" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}>
        <CalendarClock className="h-4 w-4" strokeWidth={1.9} aria-hidden />
        Email me this{schedules.length ? ` (${schedules.length})` : ""}
      </Button>
      {open && (
        <div id={id} role="dialog" aria-label="Email me this report" className="absolute right-0 top-12 z-30 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-ink-150 bg-white p-4 shadow-lift">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-sm font-semibold text-ink-950">Email me this report</div>
              <p className="mt-0.5 text-xs text-ink-500">With the filters as set now. A signed CSV link goes out after the 03:00 run — never the file itself.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100" aria-label="Close">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {schedules.length > 0 && (
            <ul className="mb-3 divide-y divide-ink-100 rounded-xl border border-ink-150 text-xs">
              {schedules.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink-900">{s.label}</span>
                    <span className="block truncate text-ink-500">
                      {s.recipients.join(", ")} · last sent {s.lastRun}
                    </span>
                  </span>
                  <ActionButton action={s.stop} variant="ghost" size="sm" pendingLabel="Stopping…">
                    Stop
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={schedule} className="space-y-3" resetOnSuccess noticeClassName="mb-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${id}-cadence`}>How often</Label>
                <Select id={`${id}-cadence`} name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value as "WEEKLY" | "MONTHLY")}>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
              </div>
              <div>
                <Label htmlFor={`${id}-day`}>{cadence === "WEEKLY" ? "On" : "On the"}</Label>
                <Select id={`${id}-day`} name="day" defaultValue="1" key={cadence}>
                  {cadence === "WEEKLY"
                    ? WEEKDAYS.map((d, i) => (
                        <option key={d} value={i + 1}>
                          {d}
                        </option>
                      ))
                    : Array.from({ length: 28 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                          {i + 1 === 1 ? "st" : i + 1 === 2 ? "nd" : i + 1 === 3 ? "rd" : "th"}
                        </option>
                      ))}
                </Select>
                <FieldError name="day" />
              </div>
            </div>
            <Field label="Send to (staff emails, comma-separated)" htmlFor={`${id}-to`}>
              <Input id={`${id}-to`} name="recipients" defaultValue={me} placeholder="you@herbalholland.co.za, colleague@…" />
              <FieldError name="recipients" />
            </Field>
            <SubmitButton size="sm" pendingLabel="Scheduling…">
              Schedule
            </SubmitButton>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
