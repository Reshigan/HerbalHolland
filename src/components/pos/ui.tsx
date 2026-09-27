"use client";
// Till UI primitives: dark surfaces, 44px+ touch targets, big type, orange primary actions.
import { useEffect, useId, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type BtnSize = "sm" | "md" | "lg" | "xl";

export function posBtn(variant: BtnVariant = "secondary", size: BtnSize = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[background,color,box-shadow,transform,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
    {
      primary: "bg-oranje-500 text-ink-950 hover:bg-oranje-400 shadow-[inset_0_-2px_0_rgb(0_0_0/0.14)]",
      secondary: "bg-ink-800 text-ink-50 hover:bg-ink-700",
      outline: "border border-ink-700 text-ink-100 hover:border-ink-500 hover:bg-ink-850",
      ghost: "text-ink-200 hover:bg-ink-800",
      danger: "bg-rose-500 text-white hover:bg-rose-600",
      success: "bg-leaf-500 text-white hover:bg-leaf-600",
    }[variant],
    { sm: "h-9 px-3.5 text-[0.8rem]", md: "h-11 px-5 text-sm", lg: "h-14 px-6 text-base", xl: "h-16 px-8 text-lg" }[size],
    className,
  );
}

export function PosButton({ variant, size, busy, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; busy?: boolean }) {
  return (
    <button type="button" className={posBtn(variant, size, className)} aria-busy={busy || undefined} {...props}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-300 transition hover:bg-ink-800 hover:text-white active:scale-95 disabled:opacity-40", className)}
      {...props}
    >
      {children}
    </button>
  );
}

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-900 px-4 text-base text-white placeholder:text-ink-500 transition focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/20 disabled:opacity-50 aria-[invalid=true]:border-rose-500";

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputCls, "h-12", className)} {...props} />;
}

export function TextArea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, "min-h-20 py-3", className)} {...props} />;
}

export function SelectInput({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputCls, "h-12 appearance-none pr-10", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, className, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8rem] font-semibold text-ink-300">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[0.8rem] font-medium text-rose-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[0.8rem] text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

/** Large checkbox row (whole row is the touch target). */
export function CheckRow({ checked, onChange, label, description, className, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode; className?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-1 py-2", disabled && "cursor-not-allowed opacity-50", className)}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer rounded-md accent-oranje-500" />
      <span className="text-[0.95rem]">
        <span className="font-medium text-ink-50">{label}</span>
        {description && <span className="mt-0.5 block text-[0.8rem] text-ink-400">{description}</span>}
      </span>
    </label>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full bg-ink-800 p-0.5" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-11 w-11 place-items-center rounded-full text-xl font-semibold text-ink-100 hover:bg-ink-700 active:scale-95 disabled:opacity-35">
        −
      </button>
      <span className="tnum min-w-8 text-center font-display text-lg font-semibold text-white" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-11 w-11 place-items-center rounded-full text-xl font-semibold text-ink-100 hover:bg-ink-700 active:scale-95 disabled:opacity-35">
        +
      </button>
    </div>
  );
}

type ChipTone = "neutral" | "orange" | "green" | "red" | "amber" | "blue" | "violet";
const CHIP: Record<ChipTone, string> = {
  neutral: "bg-ink-800 text-ink-200 ring-ink-700",
  orange: "bg-oranje-500/15 text-oranje-300 ring-oranje-500/35",
  green: "bg-leaf-500/15 text-[#7fd49a] ring-leaf-500/35",
  red: "bg-rose-500/15 text-[#f29b9b] ring-rose-500/40",
  amber: "bg-amber-500/15 text-[#f3c65a] ring-amber-500/35",
  blue: "bg-sky-500/15 text-[#8fbdf2] ring-sky-500/35",
  violet: "bg-[#4a3aa7]/25 text-[#c7bdff] ring-[#8e6cd6]/40",
};
export function Chip({ tone = "neutral", className, children, icon }: { tone?: ChipTone; className?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.72rem] font-semibold ring-1 ring-inset", CHIP[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export const TIER_CHIP: Record<string, ChipTone> = { SEED: "neutral", SPROUT: "green", BLOOM: "violet", HARVEST: "orange" };
export const tierName = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

// ── Sheets (modal dialogs) ───────────────────────────────────────────────────
// A stack so Esc closes only the top-most sheet.
const stack: (() => void)[] = [];
if (typeof window !== "undefined")
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && stack.length) {
      e.preventDefault();
      stack[stack.length - 1]();
    }
  });

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  dismissable = true,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  dismissable?: boolean;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const fn = () => dismissable && close.current();
    stack.push(fn);
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]), select, textarea, button:not([data-close])");
    (first ?? ref.current)?.focus({ preventScroll: true });
    return () => {
      stack.splice(stack.indexOf(fn), 1);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, dismissable]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        tabIndex={-1}
        className={cn(
          "flex max-h-[100dvh] w-full flex-col overflow-hidden bg-ink-900 text-ink-100 shadow-2xl ring-1 ring-ink-800 outline-none animate-rise sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl",
          size !== "full" && "rounded-t-3xl",
          { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl", full: "h-[100dvh] sm:h-[calc(100dvh-2rem)] sm:max-w-6xl" }[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-800 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={`${id}-t`} className="font-display text-xl font-semibold text-white">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-ink-400">{subtitle}</div>}
          </div>
          {dismissable && (
            <IconButton label="Close" onClick={onClose} data-close className="-mr-2 -mt-1">
              <X className="h-5 w-5" />
            </IconButton>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="border-t border-ink-800 bg-ink-900 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, body, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <PosButton variant="ghost" onClick={onClose}>
            Cancel
          </PosButton>
          <PosButton variant={danger ? "danger" : "primary"} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </PosButton>
        </div>
      }
    >
      <div className="text-[0.95rem] leading-relaxed text-ink-200">{body}</div>
    </Sheet>
  );
}

export function Alert({ tone = "danger", children, className }: { tone?: "danger" | "warn" | "info" | "success"; children: React.ReactNode; className?: string }) {
  const t = {
    danger: "border-rose-500/40 bg-rose-500/10 text-[#f6b3b3]",
    warn: "border-amber-500/40 bg-amber-500/10 text-[#f5d27e]",
    info: "border-sky-500/40 bg-sky-500/10 text-[#a9cdf5]",
    success: "border-leaf-500/40 bg-leaf-500/10 text-[#9be0b0]",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-2xl border px-4 py-3 text-sm leading-relaxed", t, className)}>
      {children}
    </div>
  );
}

export function EmptyPanel({ icon, title, children, action, className }: { icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ink-850 text-oranje-400 ring-1 ring-ink-800">{icon}</div>}
      <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-400">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-oranje-400", className)} aria-label="Loading" />;
}

/** Segmented control (tabs on phone layouts, filters). */
export function Segmented<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[]; className?: string; label: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("scrollbar-none flex gap-1 overflow-x-auto rounded-full bg-ink-900 p-1 ring-1 ring-ink-800", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition",
            value === o.value ? "bg-ink-700 text-white" : "text-ink-400 hover:text-ink-100",
          )}
        >
          {o.label}
          {o.count != null && <span className={cn("tnum rounded-full px-1.5 text-[0.7rem]", value === o.value ? "bg-oranje-500 text-ink-950" : "bg-ink-800 text-ink-300")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
