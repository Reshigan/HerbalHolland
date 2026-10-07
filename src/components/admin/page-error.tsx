"use client";
// Error boundary body inside a shell (HQ, store, books on light; the trade portal on dark): keeps the shell, explains
// plainly, offers a retry and a way home, and shows the reference the server logged.
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function PageError({ error, retry, home, dark }: { error: Error & { digest?: string }; retry: () => void; home: { href: string; label: string }; dark?: boolean }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={cn("mx-auto mt-10 max-w-lg rounded-2xl border p-8 text-center", dark ? "border-ink-800 bg-ink-900/60" : "border-ink-150 bg-white shadow-card")}>
      <div className={cn("mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl", dark ? "bg-rose-500/15 text-rose-300" : "bg-rose-50 text-rose-600")}>
        <TriangleAlert className="h-6 w-6" aria-hidden />
      </div>
      <h1 className={cn("font-display text-xl font-semibold", dark ? "text-white" : "text-ink-950")}>This page didn&apos;t load</h1>
      <p className={cn("mt-2 text-sm", dark ? "text-ink-300" : "text-ink-500")}>Something went wrong on our side, and nothing you entered was lost. Try again. If it keeps happening, quote this reference to support.</p>
      {error.digest && <p className={cn("mt-3 font-mono text-xs", dark ? "text-ink-450" : "text-ink-500")}>Ref {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={() => retry()}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
        <ButtonLink href={home.href} variant={dark ? "outline-dark" : "outline"}>
          {home.label}
        </ButtonLink>
      </div>
    </div>
  );
}
