"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, MapPin } from "lucide-react";
import { choosePreferredStore } from "@/server/shop/actions";
import { cn } from "@/lib/cn";

export function SetStoreButton({ code, name, active, className }: { code: string; name: string; active?: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (active)
    return (
      <span className={cn("inline-flex h-9 items-center gap-1.5 rounded-full bg-oranje-500/15 px-3.5 text-xs font-semibold text-oranje-300", className)}>
        <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> Your store
      </span>
    );
  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await choosePreferredStore(code);
            if ("error" in r && r.error) setError(r.error);
            else router.refresh();
          })
        }
        className={cn("inline-flex h-9 items-center gap-1.5 rounded-full bg-oranje-500 px-3.5 text-xs font-semibold text-ink-950 transition hover:bg-oranje-400 disabled:opacity-60", className)}
        aria-label={`Make ${name} my store`}
      >
        <MapPin className="h-3.5 w-3.5" /> {pending ? "Saving…" : "Make this my store"}
      </button>
      {error && <span className="text-xs text-rose-100" role="alert">{error}</span>}
    </>
  );
}
