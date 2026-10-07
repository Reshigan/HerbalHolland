"use client";
// The message detail drawer. The page renders it (the URL carries ?msg=), so it works without JavaScript; this adds
// focus on open, Escape to close and a focus trap while it's open.
import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function MessagePanel({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <Link href={closeHref} scroll={false} className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" aria-label="Close message" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-lift focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            router.push(closeHref, { scroll: false });
            return;
          }
          if (e.key !== "Tab" || !ref.current) return;
          const focusable = [...ref.current.querySelectorAll<HTMLElement>("a[href], button, input, [tabindex]:not([tabindex='-1'])")];
          if (!focusable.length) return;
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
          else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-150 p-5">
          <h2 id={id} className="font-display text-lg font-semibold text-ink-950">{title}</h2>
          <Link href={closeHref} scroll={false} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Close">
            <X className="h-5 w-5" aria-hidden />
          </Link>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
