import Link from "next/link";
import { PRESETS } from "@/lib/ranges";
import { cn } from "@/lib/cn";

/** Date-range presets as links; keeps other query params. */
export function RangeTabs({ path, current, params = {} }: { path: string; current: string; params?: Record<string, string | undefined> }) {
  const qs = (range: string) => {
    const p = new URLSearchParams(Object.entries({ ...params, range, from: undefined, to: undefined, page: undefined }).filter(([, v]) => v) as [string, string][]);
    return `${path}?${p.toString()}`;
  };
  return (
    <div className="inline-flex rounded-full border border-ink-150 bg-white p-1 shadow-card" role="tablist" aria-label="Date range">
      {PRESETS.map((p) => (
        <Link
          key={p.key}
          href={qs(p.key)}
          role="tab"
          aria-selected={current === p.key}
          className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", current === p.key ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-900")}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
