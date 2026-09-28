"use client";
import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";

// Errors inside the shop keep the header and footer around them.
export default function ShopError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
      <Mark className="h-16 w-16 text-brand-500" />
      <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight text-white">This page didn&apos;t load</h1>
      <p className="mt-3 leading-relaxed text-ink-300">Please try again. Your bag and account are safe.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={() => retry()} className={buttonClass("primary", "lg")}>
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
        <Link href="/shop" className={buttonClass("outline-dark", "lg")}>
          Back to the shop
        </Link>
      </div>
      {error.digest && <p className="tnum mt-8 font-mono text-xs text-ink-450">Reference {error.digest}</p>}
    </div>
  );
}
