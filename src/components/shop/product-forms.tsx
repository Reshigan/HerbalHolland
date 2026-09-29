"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Bell, BellRing, Camera, Star, X } from "lucide-react";
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

const PHOTO_MAX = 3;
const PHOTO_BYTES = 5 * 1024 * 1024;

export function ReviewForm({ action }: { action: (s: ReviewState, f: FormData) => Promise<ReviewState> }) {
  const [state, submit, pending] = useActionState(action, {});
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // The chosen photos live in state (so one can be removed); they're put back into the file input before the form posts.
  const syncFiles = (form: HTMLFormElement | null) => {
    const input = form?.querySelector<HTMLInputElement>('input[name="photos"]');
    if (!input || typeof DataTransfer === "undefined") return;
    const dt = new DataTransfer();
    for (const p of photos) dt.items.add(p.file);
    input.files = dt.files;
  };
  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const next = [...photos];
    let err: string | null = null;
    for (const f of Array.from(list)) {
      if (next.length >= PHOTO_MAX) {
        err = `Up to ${PHOTO_MAX} photos, please`;
        break;
      }
      if (!["image/jpeg", "image/png"].includes(f.type)) err = `${f.name} isn't a JPG or PNG`;
      else if (f.size > PHOTO_BYTES) err = `${f.name} is over 5 MB — try a smaller one`;
      else next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setPhotos(next);
    setPhotoError(err);
  };
  if (state.ok)
    return (
      <p className="rounded-2xl border border-leaf-500/35 bg-leaf-500/10 px-4 py-4 text-sm text-leaf-100" role="status">
        Thanks — your review is live. It helps other members choose well.
      </p>
    );
  return (
    <form action={submit} ref={syncFiles} className="space-y-4 rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
      <div>
        <h3 className="font-display text-lg font-semibold text-white">Write a review</h3>
        <p className="mt-1 text-sm text-ink-400">You bought this, so your review will show as a verified purchase. Keep it to taste, aroma, quality and experience.</p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-[0.8rem] font-semibold text-ink-200">Your rating</legend>
        {/* Keyed by the rating sent: React's post-action form reset puts a checked radio back to how it mounted (unchecked),
            while the stars still show the rating, so after an error they remount with it. */}
        <div className="flex gap-1" key={state.values?.rating} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
              <input type="radio" name="rating" value={n} className="peer sr-only" checked={rating === n} onChange={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`} />
              <Star className={cn("h-8 w-8 rounded transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-500", n <= (hover || rating) ? "fill-brand-500 text-brand-500" : "text-ink-600")} strokeWidth={1.5} />
            </label>
          ))}
        </div>
      </fieldset>
      <FieldRow label="Headline (optional)" htmlFor="rv-title">
        <TextInput id="rv-title" name="title" maxLength={80} defaultValue={state.values?.title} placeholder="Sum it up in a few words" />
      </FieldRow>
      <FieldRow label="Your review" htmlFor="rv-body">
        <textarea id="rv-body" name="body" required minLength={10} maxLength={1200} rows={4} defaultValue={state.values?.body} className={cn(inputClass, "py-3")} placeholder="What did you like? How does it compare?" />
      </FieldRow>
      <div>
        <label htmlFor="rv-photos" className="mb-1.5 flex items-center gap-1.5 text-[0.8rem] font-semibold text-ink-200">
          <Camera className="h-4 w-4 text-brand-500" aria-hidden /> Add photos (optional)
        </label>
        <input id="rv-photos" name="photos" type="file" accept="image/jpeg,image/png" multiple onChange={(e) => addPhotos(e.currentTarget.files)} className="block w-full text-sm text-ink-300 file:mr-3 file:h-11 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-800 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-700" />
        <p className="mt-1.5 text-xs text-ink-400">Up to {PHOTO_MAX} photos of the product, JPG or PNG, 5 MB each. They&apos;re shown with your review.</p>
        {photoError && (
          <p className="mt-1.5 text-xs font-medium text-rose-100" role="alert">
            {photoError}
          </p>
        )}
        {photos.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Photos to post">
            {photos.map((p, i) => (
              <li key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-ink-700" />
                <button type="button" onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink-800 text-ink-200 ring-1 ring-ink-600 hover:bg-ink-700">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {state.error && <p className="text-sm font-medium text-rose-100" role="alert">{state.error}</p>}
      <button disabled={pending || !rating} className={buttonClass("primary", "lg")}>
        {pending ? "Posting…" : "Post review"}
      </button>
    </form>
  );
}
