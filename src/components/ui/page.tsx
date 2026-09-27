import { cn } from "@/lib/cn";

export function PageHeader({ overline, title, description, actions, className }: { overline?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {overline && <div className="eyebrow mb-1.5 text-brand-700">{overline}</div>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-950 sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>}
      <h3 className="font-display text-base font-semibold text-ink-900">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "danger" | "success"; title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const t = {
    info: "border-sky-500/20 bg-sky-50 text-sky-700",
    warn: "border-amber-500/30 bg-amber-50 text-amber-700",
    danger: "border-rose-500/25 bg-rose-50 text-rose-600",
    success: "border-leaf-500/25 bg-leaf-50 text-leaf-700",
  }[tone];
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", t, className)} role={tone === "danger" ? "alert" : "status"}>
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5 opacity-90" : undefined}>{children}</div>
    </div>
  );
}
