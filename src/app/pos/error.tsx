"use client";
// The till's error boundary: big touch targets, a retry, and a full reload (which also picks up a new release).
// Nothing is lost by reloading: the basket in progress and unsynced sales are kept on the till (lib/storage.ts).
import { useEffect } from "react";
import { RefreshCw, RotateCcw, TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export default function PosError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/15 text-rose-300">
        <TriangleAlert className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="mt-6 font-display text-3xl font-semibold text-white">The till hit a problem</h1>
      <p className="mt-3 max-w-md text-ink-300">Your sales and the basket in progress are kept on this till. Try again, or reload the till. If it keeps happening, call your manager with the reference below.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={() => retry()} className={buttonClass("primary", "xl")}>
          <RefreshCw className="h-5 w-5" /> Try again
        </button>
        <button onClick={() => location.reload()} className={buttonClass("outline-dark", "xl")}>
          <RotateCcw className="h-5 w-5" /> Reload the till
        </button>
      </div>
      {error.digest && <p className="tnum mt-10 font-mono text-sm text-ink-450">Ref {error.digest}</p>}
    </main>
  );
}
