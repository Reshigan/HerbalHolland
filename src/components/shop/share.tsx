"use client";
// Sharing for Rewards cards and invite links: the phone's share sheet (Web Share API) where there is one,
// otherwise WhatsApp, copy link and a preview of the card.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, Share2 } from "lucide-react";
import { cn } from "@/lib/cn";

export const whatsappUrl = (text: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt("Copy this link", text);
    return false;
  }
}

/** One share action: opens the share sheet, or (desktop) a small panel with WhatsApp, copy link and preview. */
export function ShareButton({ url, title, text, label, className }: { url: string; title: string; text: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return; // the member closed the sheet
      }
    }
    setOpen((o) => !o);
  };
  const item = "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium text-ink-100 hover:bg-ink-800";
  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        onClick={share}
        aria-expanded={open}
        className={cn("inline-flex h-11 items-center gap-2 rounded-full border border-ink-700 px-4 text-sm font-semibold text-ink-100 transition hover:border-brand-500 hover:text-white", className)}
      >
        <Share2 className="h-4 w-4 text-brand-400" strokeWidth={1.9} /> {label}
      </button>
      {open && (
        <div className="fixed inset-x-4 bottom-4 z-50 animate-rise rounded-2xl border border-ink-700 bg-ink-900 p-1.5 shadow-lift sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:z-30 sm:mt-2 sm:w-60">
          <a href={whatsappUrl(text, url)} target="_blank" rel="noopener noreferrer" className={item}>
            <MessageCircle className="h-4 w-4 text-leaf-500" /> WhatsApp
          </a>
          <button
            type="button"
            className={item}
            onClick={async () => {
              if (await copyText(url)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }
            }}
          >
            {copied ? <Check className="h-4 w-4 text-leaf-500" /> : <Copy className="h-4 w-4 text-ink-300" />}
            <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" className={item}>
            <ExternalLink className="h-4 w-4 text-ink-300" /> Preview the card
          </a>
        </div>
      )}
    </div>
  );
}
