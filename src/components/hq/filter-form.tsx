"use client";
// GET filter bar: selects apply immediately, text fields on Enter / Apply. The URL is
// the state (shareable, back-button friendly); empty values are dropped and paging resets.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export function FilterForm({ action, children, className, keep = {} }: { action: string; children: React.ReactNode; className?: string; keep?: Record<string, string | undefined> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (form: HTMLFormElement) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
    for (const [k, v] of new FormData(form)) if (typeof v === "string" && v.trim()) p.set(k, v.trim());
    p.delete("page");
    const q = p.toString();
    start(() => router.push(q ? `${action}?${q}` : action, { scroll: false }));
  };
  return (
    <form
      role="search"
      aria-busy={pending}
      className={cn("flex flex-wrap items-end gap-2 transition-opacity", pending && "opacity-70", className)}
      onSubmit={(e) => {
        e.preventDefault();
        go(e.currentTarget);
      }}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && ["checkbox", "radio", "date", "month"].includes(t.type))) go(e.currentTarget);
      }}
    >
      {children}
    </form>
  );
}

export function SearchField({ name = "q", defaultValue, placeholder, label = "Search", className }: { name?: string; defaultValue?: string; placeholder?: string; label?: string; className?: string }) {
  return (
    <label className={cn("relative block min-w-0 flex-1 basis-56", className)}>
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        name={name}
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15"
      />
    </label>
  );
}

export function FilterSelect({ name, label, defaultValue, options, allLabel = "All", className }: { name: string; label: string; defaultValue?: string; options: { value: string; label: string }[]; allLabel?: string | null; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        aria-label={label}
        className="h-10 max-w-[14rem] cursor-pointer appearance-none rounded-xl border border-ink-200 bg-white bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236b5f57%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_0.8rem_center] bg-no-repeat pl-3 pr-8 text-sm text-ink-800 focus:border-oranje-500 focus:outline-none focus:ring-4 focus:ring-oranje-500/15"
      >
        {allLabel != null && <option value="">{`${label}: ${allLabel}`}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
