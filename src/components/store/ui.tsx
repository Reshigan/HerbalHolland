// Small presentational building blocks for the store back office (server-safe).
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, Lock, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Th } from "@/components/ui/table";
import { Input } from "@/components/ui/form";
import type { Tone } from "@/components/ui/badge";

/** Filter chips (links) with optional counts. The URL is the state. */
export function Chips({ items, current, className, label = "Filter" }: {
  items: { key: string; label: React.ReactNode; count?: number; href: string; tone?: Tone }[];
  current: string;
  className?: string;
  label?: string;
}) {
  const dot: Partial<Record<Tone, string>> = { red: "bg-rose-500", amber: "bg-amber-500", green: "bg-leaf-500", violet: "bg-[#4a3aa7]", orange: "bg-oranje-500", blue: "bg-sky-500" };
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {items.map((i) => {
        const active = i.key === current;
        return (
          <Link
            key={i.key}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors",
              active ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900",
            )}
          >
            {i.tone && dot[i.tone] && <span className={cn("h-1.5 w-1.5 rounded-full", dot[i.tone])} aria-hidden />}
            {i.label}
            {i.count != null && <span className={cn("tnum rounded-full px-1.5 text-[0.68rem]", active ? "bg-white/15 text-white" : "bg-ink-100 text-ink-500")}>{i.count.toLocaleString()}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sortable column header: the link toggles direction when already sorted by this key. */
export function SortTh({ label, sortKey, sort, dir, href, align = "left", className }: {
  label: React.ReactNode;
  sortKey: string;
  sort: string;
  dir: "asc" | "desc";
  href: (sort: string, dir: "asc" | "desc") => string;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sort === sortKey;
  const next = active ? (dir === "asc" ? "desc" : "asc") : align === "right" ? "desc" : "asc";
  return (
    <Th align={align} className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={href(sortKey, next)} className={cn("inline-flex items-center gap-1 hover:text-ink-900", active && "text-ink-900")}>
        {label}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
      </Link>
    </Th>
  );
}

/** GET search form that keeps the other filters. */
export function SearchForm({ path, q, keep = {}, placeholder = "Search", className, children }: {
  path: string;
  q?: string;
  keep?: Record<string, string | undefined>;
  placeholder?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <form method="get" action={path} role="search" className={cn("flex flex-wrap items-center gap-2", className)}>
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="relative min-w-0 flex-1 sm:max-w-sm">
        <span className="sr-only">{placeholder}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <Input type="search" name="q" defaultValue={q} placeholder={placeholder} className="pl-9" />
      </label>
      {children}
    </form>
  );
}

export function ReadOnlyNote({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 rounded-xl bg-ink-100 px-3 py-2 text-xs font-medium text-ink-600", className)}>
      <Lock className="h-3.5 w-3.5" aria-hidden />
      {children ?? "Read-only — managers and owners can make changes here."}
    </p>
  );
}

/** Signed quantity: +3 in green, −2 in red, 0 muted. */
export function Qty({ n, className, unit }: { n: number; className?: string; unit?: string }) {
  return (
    <span className={cn("tnum font-semibold", n > 0 ? "text-leaf-700" : n < 0 ? "text-rose-600" : "text-ink-400", className)}>
      {n > 0 ? "+" : n < 0 ? "−" : ""}
      {Math.abs(n).toLocaleString()}
      {unit}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="no-print mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

/** Hides the admin shell chrome when printing a back-office document. */
export function PrintStyles() {
  return <style>{`@media print { aside, header, .no-print { display: none !important; } main > div { max-width: none !important; padding: 0 !important; } @page { margin: 14mm; } }`}</style>;
}

/** Key figure row for summary panels. */
export function Line({ label, value, strong, muted, className }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", strong && "font-semibold text-ink-950", muted && "text-ink-500", className)}>
      <span>{label}</span>
      <span className="tnum text-right">{value}</span>
    </div>
  );
}
