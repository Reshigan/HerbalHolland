"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleWishlistAction } from "@/server/shop/feature-actions";
import { cn } from "@/lib/cn";

/** The heart: saves a variant to the member's wishlist. Guests are sent to sign in (and back). `name` names the product in the label (cards). */
export function WishlistButton({ variantId, on: initial, signedIn, next, compact, name, className }: { variantId: string; on: boolean; signedIn: boolean; next: string; compact?: boolean; name?: string; className?: string }) {
  const [on, setOn] = useState(initial);
  const what = name ? `${name} ` : "";
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shape = compact
    ? "grid h-11 w-11 place-items-center rounded-full bg-ink-950/70 text-white backdrop-blur transition hover:bg-ink-950"
    : "inline-flex h-11 items-center gap-2 rounded-full border border-ink-700 px-4 text-sm font-semibold text-ink-100 transition hover:border-brand-500 hover:text-white";
  if (!signedIn)
    return (
      <Link href={`/club/join?next=${encodeURIComponent(next)}`} aria-label={`Sign in to save ${what}to your wishlist`} title="Save to your wishlist" className={cn("relative z-10", shape, className)}>
        <Heart className="h-5 w-5" strokeWidth={1.9} />
        {!compact && "Save"}
      </Link>
    );
  return (
    <span className={cn("relative z-10 inline-flex flex-col", className)}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? `Remove ${what}from your wishlist` : `Save ${what}to your wishlist`}
        title={on ? "On your wishlist" : "Save to your wishlist"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await toggleWishlistAction(variantId);
            if (r.error) setError(r.error);
            else (setOn(r.on), setError(null));
          })
        }
        className={cn(shape, on && !compact && "border-brand-500 text-white", pending && "opacity-70")}
      >
        <Heart className={cn("h-5 w-5 transition", on ? "fill-brand-500 text-brand-500" : "")} strokeWidth={1.9} />
        {!compact && (on ? "Saved" : "Save")}
      </button>
      {error && (
        <span className={cn("mt-1 text-xs font-medium text-rose-100", compact && "absolute right-0 top-full w-48 rounded-xl bg-ink-800 p-2 shadow-lift")} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
