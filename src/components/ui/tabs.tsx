import Link from "next/link";
import { cn } from "@/lib/cn";

/** Link-based tabs (URL is the state). */
export function TabLinks({ tabs, current, className }: { tabs: { href: string; label: React.ReactNode; count?: number }[]; current: string; className?: string }) {
  return (
    <nav className={cn("scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-ink-150 px-1", className)}>
      {tabs.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "border-oranje-500 text-ink-950" : "border-transparent text-ink-500 hover:text-ink-800",
            )}
          >
            {t.label}
            {t.count != null && <span className={cn("rounded-full px-1.5 text-[0.68rem] font-semibold", active ? "bg-oranje-100 text-oranje-800" : "bg-ink-100 text-ink-500")}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
