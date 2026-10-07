"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { reorderTradeAction, type ReorderResult } from "@/app/trade/orders/[id]/actions";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** "Order again": one tap puts the order's lines back in the cart, in whole cases, and says what couldn't be added. */
export function ReorderTradeButton({ orderId, className }: { orderId: string; className?: string }) {
  const [result, setResult] = useState<ReorderResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className={cn("min-w-0", className)}>
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await reorderTradeAction(orderId)))} className={buttonClass("outline-dark", "md", "h-11")}>
        {result?.ok ? <Check className="h-4 w-4" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
        {pending ? "Adding…" : result?.ok ? "Added to cart" : "Order again"}
      </button>
      {result && (
        <p className={cn("mt-2 text-xs leading-relaxed", result.ok ? "text-ink-300" : "text-amber-100")} role="status">
          {result.summary}{" "}
          {result.count > 0 && (
            <Link href="/trade/cart" className="font-semibold text-brand-400 underline">
              View cart ({result.count})
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
