import { cn } from "@/lib/cn";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span className={cn("inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 font-display text-xs font-bold text-brand-800", className)} aria-hidden>
      {initials}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-ink-200 bg-white px-1.5 py-0.5 font-sans text-[0.7rem] font-semibold text-ink-600 shadow-[0_1px_0_rgb(0_0_0/0.06)]">{children}</kbd>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-ink-150", className)} />;
}

/** Definition list row for detail panels. */
export function Detail({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2 text-sm", className)}>
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-medium text-ink-850">{children}</dd>
    </div>
  );
}
