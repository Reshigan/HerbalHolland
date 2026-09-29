// Storefront primitives on the dark brand surface (ink-950). The shared @/components/ui
// set is tuned for the light back office; these mirror it for the consumer shop.
import Link from "next/link";
import { cn } from "@/lib/cn";
import { zar } from "@/lib/money";

export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export function SectionHead({ eyebrow, title, description, action, className, as: H = "h2" }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <div className="eyebrow mb-2 text-brand-500">{eyebrow}</div>}
        <H className={cn("font-display font-semibold tracking-tight text-white", H === "h1" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl")}>{title}</H>
        {description && <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-300">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-ink-800 bg-ink-900/70", className)} {...props} />;
}

export type TagTone = "orange" | "green" | "amber" | "red" | "neutral" | "violet" | "solid";
const TAG: Record<TagTone, string> = {
  orange: "bg-brand-500/15 text-brand-300 ring-brand-500/30",
  green: "bg-leaf-500/15 text-leaf-100 ring-leaf-500/35",
  amber: "bg-amber-500/15 text-amber-100 ring-amber-500/35",
  red: "bg-rose-500/15 text-rose-100 ring-rose-500/40",
  neutral: "bg-ink-800 text-ink-200 ring-ink-700",
  violet: "bg-series-4/30 text-ink-100 ring-series-4/60",
  solid: "bg-ink-950/85 text-brand-300 ring-brand-500/60 backdrop-blur",
};
export function Tag({ tone = "neutral", icon, className, children }: { tone?: TagTone; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ring-1 ring-inset", TAG[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

// lucide's Star outline, drawn five times in one SVG (one element instead of ten per rating): 14px stars with 2px gaps.
const STAR =
  "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z";
const STAR_PITCH = 24 + (2 * 24) / 14;
export function Stars({ value, className, label }: { value: number; className?: string; label?: string }) {
  const full = Math.round(value * 2) / 2;
  return (
    <svg
      viewBox={`0 0 ${4 * STAR_PITCH + 24} 24`}
      className={cn("inline-block h-3.5 w-auto shrink-0", className)}
      role="img"
      aria-label={label ?? `${value.toFixed(1)} out of 5 stars`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <path key={i} d={STAR} transform={`translate(${(i - 1) * STAR_PITCH} 0)`} className={i <= full ? "fill-brand-500 text-brand-500" : i - 0.5 === full ? "fill-brand-500/50 text-brand-500" : "text-ink-600"} />
      ))}
    </svg>
  );
}

export function Price({ cents, was, from, className, size = "md" }: { cents: number; was?: number | null; from?: boolean; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      {from && <span className="text-xs font-medium text-ink-400">from</span>}
      <span className={cn("tnum font-display font-semibold text-white", { sm: "text-base", md: "text-lg", lg: "text-3xl" }[size])}>{zar(cents)}</span>
      {was != null && was > cents && (
        <s className={cn("tnum text-ink-400", size === "lg" ? "text-base" : "text-xs")}>
          <span className="sr-only">was </span>
          {zar(was)}
        </s>
      )}
    </span>
  );
}

export function Meter({ value, max, className, label }: { value: number; max: number; className?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-ink-800", className)} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-label={label}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-[width] duration-700" style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function Callout({ tone = "info", title, icon, children, className }: { tone?: "info" | "warn" | "danger" | "success" | "brand"; title?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const t = {
    info: "border-sky-500/30 bg-sky-500/10 text-sky-50",
    warn: "border-amber-500/35 bg-amber-500/10 text-amber-100",
    danger: "border-rose-500/40 bg-rose-500/10 text-rose-100",
    success: "border-leaf-500/35 bg-leaf-500/10 text-leaf-100",
    brand: "border-brand-500/35 bg-brand-500/10 text-brand-200",
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-2xl border px-4 py-3.5 text-sm", t, className)} role={tone === "danger" ? "alert" : "status"}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <div className="font-semibold text-white">{title}</div>}
        {children && <div className={cn("leading-relaxed", title ? "mt-0.5" : null)}>{children}</div>}
      </div>
    </div>
  );
}

/** Dark pagination. `href` builds the URL for a page. */
export function Pager({ page, pageSize, total, href, noun = "results" }: { page: number; pageSize: number; total: number; href: (page: number) => string; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return total ? <p className="py-4 text-center text-xs text-ink-400">{total.toLocaleString()} {noun}</p> : null;
  const link = (p: number, label: string, disabled: boolean) =>
    disabled ? (
      <span className="rounded-full px-4 py-2 text-ink-600">{label}</span>
    ) : (
      <Link href={href(p)} scroll={false} className="rounded-full border border-ink-700 px-4 py-2 font-medium text-ink-100 transition hover:border-brand-500 hover:text-brand-300">
        {label}
      </Link>
    );
  return (
    <nav className="flex items-center justify-between gap-3 py-4 text-sm" aria-label="Pagination">
      {link(page - 1, "← Previous", page <= 1)}
      <span className="tnum text-xs text-ink-400">
        Page {page} of {pages} · {total.toLocaleString()} {noun}
      </span>
      {link(page + 1, "Next →", page >= pages)}
    </nav>
  );
}

// ── Forms (dark) ─────────────────────────────────────────────────────────────
export const inputClass =
  "w-full rounded-xl border border-ink-700 bg-ink-900 px-3.5 text-[0.95rem] text-white placeholder:text-ink-450 transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:opacity-50 aria-[invalid=true]:border-rose-500";

export function FieldRow({ label, hint, error, htmlFor, children, className }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8rem] font-semibold text-ink-200">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-100" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, "h-12", className)} {...props} />;
}

export function SelectInput({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        inputClass,
        "h-12 cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23bdb3a9%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function CheckRow({ label, description, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl py-1.5", className)}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-brand-500" {...props} />
      <span className="text-sm leading-snug">
        <span className="font-medium text-ink-100">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-400">{description}</span>}
      </span>
    </label>
  );
}

/** Link-styled chip used for filters and tabs; `active` fills it orange. */
export function Chip({ href, active, children, className, count }: { href: string; active?: boolean; children: React.ReactNode; className?: string; count?: number }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition",
        active ? "border-brand-500 bg-brand-500 text-ink-950" : "border-ink-700 text-ink-200 hover:border-ink-500 hover:text-white",
        className,
      )}
    >
      {children}
      {count != null && <span className={cn("tnum text-xs", active ? "text-ink-900/70" : "text-ink-450")}>{count}</span>}
    </Link>
  );
}
