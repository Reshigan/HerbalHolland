"use client";
// Small interactive pieces of the launch screens: drop alerts, event RSVPs and member preferences.
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Bell, BellRing, CalendarCheck, TicketX } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Result = { ok?: boolean; error?: string };

/** "Notify me" for a drop. `reach` is how we can tell this member (push first, else SMS). */
export function WatchDrop({ action, signedIn, next, already, reach, className }: { action: () => Promise<Result>; signedIn: boolean; next: string; already: boolean; reach: "push" | "sms" | "none"; className?: string }) {
  const [state, setState] = useState<Result>(already ? { ok: true } : {});
  const [pending, start] = useTransition();
  if (!signedIn)
    return (
      <Link href={`/club/join?next=${encodeURIComponent(next)}`} className={buttonClass("outline-dark", "xl", cn("w-full", className))}>
        <Bell className="h-5 w-5" /> Sign in to get notified
      </Link>
    );
  if (state.ok)
    return (
      <div className={cn("rounded-2xl border border-leaf-500/35 bg-leaf-500/10 px-4 py-3.5 text-sm text-leaf-100", className)} role="status">
        <p className="flex items-center gap-2 font-semibold text-white">
          <BellRing className="h-5 w-5 shrink-0 text-leaf-500" /> You&apos;re on the list
        </p>
        <p className="mt-1">
          {reach === "push" ? (
            "We'll send an app notification the moment it opens for you."
          ) : reach === "sms" ? (
            <>
              We&apos;ll text you when it opens.{" "}
              <Link href="/club/settings#notifications" className="font-semibold text-white underline">
                Turn on app notifications
              </Link>{" "}
              to hear first.
            </>
          ) : (
            <>
              <Link href="/club/settings#notifications" className="font-semibold text-white underline">
                Turn on app notifications
              </Link>{" "}
              (or SMS in Settings) so we can reach you when it opens.
            </>
          )}
        </p>
      </div>
    );
  return (
    <div className={className}>
      <button disabled={pending} onClick={() => start(async () => setState(await action()))} className={buttonClass("outline-dark", "xl", "w-full")}>
        <Bell className="h-5 w-5" /> {pending ? "Saving…" : "Notify me when it opens"}
      </button>
      {state.error && (
        <p className="mt-2 text-sm text-rose-100" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}

/** Reserve a place at an event (the page re-renders with the ticket). */
export function RsvpButton({ action, disabled }: { action: (s: Result, f: FormData) => Promise<Result>; disabled?: boolean }) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit}>
      <button disabled={pending || disabled} className={buttonClass("primary", "xl", "w-full")}>
        <CalendarCheck className="h-5 w-5" /> {pending ? "Reserving…" : "Reserve my place"}
      </button>
      {state.error && (
        <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Give up a ticket, after a confirmation step. */
export function CancelRsvp({ action }: { action: () => Promise<Result> }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="inline-flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-ink-400 hover:bg-ink-850 hover:text-white">
        <TicketX className="h-4 w-4" /> Cancel my place
      </button>
    );
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-950/60 p-4" role="group" aria-label="Confirm cancellation">
      <p className="text-sm text-ink-200">Give up your place? It goes back to the pool for someone else, and you can reserve again while places last.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          autoFocus
          onClick={() =>
            start(async () => {
              const r = await action();
              if (r.error) setError(r.error);
            })
          }
          className={buttonClass("danger", "lg")}
        >
          {pending ? "Cancelling…" : "Yes, cancel my place"}
        </button>
        <button type="button" disabled={pending} onClick={() => setAsking(false)} className={buttonClass("outline-dark", "lg")}>
          Keep my place
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** A single on/off preference saved by a server action (optimistic, reverts on error). */
export function PrefSwitch({ label, note, on: initial, action }: { label: string; note: React.ReactNode; on: boolean; action: (on: boolean) => Promise<{ error?: string }> }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <div className="font-medium text-white">{label}</div>
          <div className="text-xs text-ink-400">{note}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              setOn(!on);
              const r = await action(!on);
              if (r.error) {
                setOn(on);
                setError(r.error);
              }
            })
          }
          className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40", on ? "bg-brand-500" : "bg-ink-700")}
        >
          <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
        </button>
      </div>
      {error && (
        <p className="mt-1 text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
