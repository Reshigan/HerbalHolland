"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { reorderAction } from "@/server/shop/feature-actions";
import type { ReorderResult } from "@/server/shop/reorder";
import { buttonClass } from "@/components/ui/button";

type ButtonVariant = Parameters<typeof buttonClass>[0];
type ButtonSize = Parameters<typeof buttonClass>[1];
import { cn } from "@/lib/cn";

/** "Buy again": one tap re-adds an order's lines to the bag, and says what couldn't be added and why. */
export function ReorderButton({ orderId, label = "Buy again", variant = "outline-dark", size = "md", className }: { orderId: string; label?: string; variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  const [result, setResult] = useState<ReorderResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={cn("min-w-0", className)}>
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await reorderAction(orderId)))} className={buttonClass(variant, size, "h-11")}>
        {result?.ok ? <Check className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
        {pending ? "Adding…" : result?.ok ? "Added to bag" : label}
      </button>
      {result && (
        <p className={cn("mt-2 text-xs leading-relaxed", result.ok ? "text-ink-300" : "text-amber-100")} role="status">
          {result.summary}{" "}
          {result.count > 0 && (
            <Link href="/cart" className="font-semibold text-brand-400 underline">
              View bag ({result.count})
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
