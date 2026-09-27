"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Bell, BellRing, Star } from "lucide-react";
import type { AlertState, ReviewState } from "@/app/(shop)/p/[slug]/actions";
import { buttonClass } from "@/components/ui/button";
import { FieldRow, TextInput, inputClass } from "./ui";
import { cn } from "@/lib/cn";

export function NotifyMe({ action, signedIn, next, already }: { action: () => Promise<AlertState>; signedIn: boolean; next: string; already?: boolean }) {
  const [state, setState] = useState<AlertState>(already ? { ok: true } : {});
  const [pending, start] = useTransition();
  if (!signedIn)
    return (
      <Link href={`/club/join?next=${encodeURIComponent(next)}`} className={buttonClass("outline-dark", "xl", "w-full")}>
        <Bell className="h-5 w-5" /> Sign in to get a restock alert
      </Link>
    );
  if (state.ok)
    return (
      <p className="flex items-center gap-3 rounded-2xl border border-leaf-500/35 bg-leaf-500/10 px-4 py-3.5 text-sm text-leaf-100" role="status">
        <BellRing className="h-5 w-5 shrink-0" /> We&apos;ll send you an SMS as soon as it&apos;s back in stock.
      </p>
    );
  return (
    <div>
      <button disabled={pending} onClick={() => start(async () => setState(await action()))} className={buttonClass("outline-dark", "xl", "w-full")}>
        <Bell className="h-5 w-5" /> {pending ? "Saving…" : "Notify me when it's back"}
      </button>
      {state.error && <p className="mt-2 text-sm text-rose-100" role="alert">{state.error}</p>}
    </div>
  );
}

export function ReviewForm({ action }: { action: (s: ReviewState, f: FormData) => Promise<ReviewState> }) {
  const [state, submit, pending] = useActionState(action, {});
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  if (state.ok)
    return (
      <p className="rounded-2xl border border-leaf-500/35 bg-leaf-500/10 px-4 py-4 text-sm text-leaf-100" role="status">
        Thanks — your review is live. It helps other members choose well.
      </p>
    );
  return (
    <form action={submit} className="space-y-4 rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
      <div>
        <h3 className="font-display text-lg font-semibold text-white">Write a review</h3>
        <p className="mt-1 text-sm text-ink-400">You bought this, so your review will show as a verified purchase. Keep it to taste, aroma, quality and experience.</p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[0.8rem] font-semibold text-ink-200">Your rating</legend>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
              <input type="radio" name="rating" value={n} className="peer sr-only" checked={rating === n} onChange={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} />
              <Star className={cn("h-8 w-8 rounded transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-500", n <= (hover || rating) ? "fill-brand-500 text-brand-500" : "text-ink-600")} strokeWidth={1.5} />
            </label>
          ))}
        </div>
      </fieldset>
      <FieldRow label="Headline (optional)" htmlFor="rv-title">
        <TextInput id="rv-title" name="title" maxLength={80} placeholder="Sum it up in a few words" />
      </FieldRow>
      <FieldRow label="Your review" htmlFor="rv-body">
        <textarea id="rv-body" name="body" required minLength={10} maxLength={1200} rows={4} className={cn(inputClass, "py-3")} placeholder="What did you like? How does it compare?" />
      </FieldRow>
      {state.error && <p className="text-sm font-medium text-rose-100" role="alert">{state.error}</p>}
      <button disabled={pending || !rating} className={buttonClass("primary", "lg")}>
        {pending ? "Posting…" : "Post review"}
      </button>
    </form>
  );
}
