"use client";
import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { BellRing, CalendarClock, Check, X } from "lucide-react";
import { cancelReminderAction, setReminderAction, type ReminderState } from "@/server/shop/feature-actions";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "./ui";
import { cn } from "@/lib/cn";

type Channel = "SMS" | "EMAIL" | "PUSH";
export type ReminderFacts = { id: string; everyDays: number; channel: Channel } | null;

const CHANNEL_LABEL: Record<Channel, string> = { SMS: "SMS", EMAIL: "email", PUSH: "app notification" };

/**
 * "Remind me to reorder": every N days, one message with a one-tap link that adds the item to the bag. Nothing is
 * charged — there's no card on file. Shown for consumables (coffee, collagen, oils…), never for medicines.
 */
export function RemindMe({ variantId, signedIn, next, existing, days, channels, className }: { variantId: string; signedIn: boolean; next: string; existing: ReminderFacts; days: readonly number[]; channels: { key: Channel; label: string; disabled?: string }[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReminderState, FormData>(setReminderAction.bind(null, variantId), {});
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, startCancel] = useTransition();
  const current = state.ok ? { id: state.id!, everyDays: state.everyDays!, channel: state.channel! } : cancelled ? null : existing;
  // A saved reminder closes the form and shows as set (each save returns a new state object).
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setCancelled(false);
    }
  }, [state]);

  if (!signedIn)
    return (
      <p className={cn("flex items-center gap-2 text-sm text-ink-400", className)}>
        <CalendarClock className="h-4 w-4 shrink-0 text-brand-500" />
        <span>
          Running low later?{" "}
          <Link href={`/club/join?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-400 hover:underline">
            Sign in
          </Link>{" "}
          to set a reorder reminder.
        </span>
      </p>
    );
  if (current && !open)
    return (
      <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-leaf-500/35 bg-leaf-500/10 px-4 py-3 text-sm text-leaf-100", className)} role="status">
        <span className="flex items-center gap-2">
          <BellRing className="h-4 w-4 shrink-0" /> We&apos;ll remind you every {current.everyDays} days by {CHANNEL_LABEL[current.channel]}.
        </span>
        <span className="flex gap-3 text-xs font-semibold">
          <button type="button" onClick={() => setOpen(true)} className="underline hover:text-white">
            Change
          </button>
          <button
            type="button"
            disabled={cancelling}
            onClick={() =>
              startCancel(async () => {
                if ((await cancelReminderAction(current.id)).ok) setCancelled(true);
              })
            }
            className="underline hover:text-white"
          >
            {cancelling ? "Stopping…" : "Stop"}
          </button>
          <Link href="/club/reminders" className="underline hover:text-white">
            All reminders
          </Link>
        </span>
      </div>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn("flex min-h-11 items-center gap-2 text-sm text-ink-300 hover:text-white", className)}>
        <CalendarClock className="h-4 w-4 shrink-0 text-brand-500" /> Remind me to reorder
      </button>
    );
  return (
    <form action={action} className={cn("rounded-2xl border border-ink-800 bg-ink-900/70 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-white">Remind me to reorder</h3>
          <p className="mt-0.5 text-xs text-ink-400">One message with a one-tap link that adds this to your bag. Nothing is charged; stop it any time.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-800 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-ink-200">
          Every
          <select name="everyDays" defaultValue={current?.everyDays ?? 30} className={cn(inputClass, "mt-1 h-11 cursor-pointer text-sm")}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-200">
          By
          <select name="channel" defaultValue={current?.channel ?? channels.find((c) => !c.disabled)?.key ?? "SMS"} className={cn(inputClass, "mt-1 h-11 cursor-pointer text-sm")}>
            {channels.map((c) => (
              <option key={c.key} value={c.key} disabled={!!c.disabled}>
                {c.label}
                {c.disabled ? ` — ${c.disabled}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.error && (
        <p className="mt-2 text-xs font-medium text-rose-100" role="alert">
          {state.error}
        </p>
      )}
      <button disabled={pending} className={buttonClass("primary", "md", "mt-3")}>
        {pending ? "Saving…" : <><Check className="h-4 w-4" /> Set reminder</>}
      </button>
    </form>
  );
}
