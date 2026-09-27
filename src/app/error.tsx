"use client";
import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-950 px-6 py-16 text-center text-ink-100">
      <Mark className="h-20 w-20 text-oranje-500" />
      <p className="eyebrow mt-10 text-oranje-500">Something went wrong</p>
      <h1 className="mt-3 max-w-lg font-display text-4xl font-semibold tracking-tight text-white">We hit a snag loading this page</h1>
      <p className="mt-4 max-w-md leading-relaxed text-ink-300">It&apos;s on our side, not yours. Try again — and if it keeps happening, let us know the reference below.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={() => retry()} className={buttonClass("primary", "lg")}>
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <Link href="/" className={buttonClass("outline-dark", "lg")}>
          Go home
        </Link>
      </div>
      {error.digest && <p className="tnum mt-10 font-mono text-xs text-ink-500">Reference {error.digest}</p>}
    </main>
  );
}
