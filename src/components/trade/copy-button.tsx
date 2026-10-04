"use client";
// A small "Copy" button for a reference the buyer pastes into their banking app.
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(label, text);
    }
  };
  return (
    <button type="button" onClick={copy} className={cn("inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-ink-200 transition hover:bg-ink-800 hover:text-white sm:h-8", className)} aria-label={copied ? "Copied" : label}>
      {copied ? <Check className="h-4 w-4 text-leaf-500" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
