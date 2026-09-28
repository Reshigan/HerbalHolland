"use client";
// Slide-over panel for "add" forms, so list pages keep their full width.
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Drawer({ label, icon, title, description, children, defaultOpen = false, variant = "primary", size = "md" }: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first =
      panel.current?.querySelector<HTMLElement>("[data-drawer-body] :is(input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea)") ??
      panel.current?.querySelector<HTMLElement>("button");
    first?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => (window.removeEventListener("keydown", esc), prev?.focus());
  }, [open]);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {icon}
        {label}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-lift">
            <div className="flex items-start justify-between gap-4 border-b border-ink-150 p-5">
              <div>
                <h2 id={id} className="font-display text-lg font-semibold text-ink-950">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100" aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="p-5" data-drawer-body>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
