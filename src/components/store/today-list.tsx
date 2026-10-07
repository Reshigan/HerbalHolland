// The manager's Today list: one row per thing to do, most urgent first, each linking where it's done.
// Severity always carries a word as well as a colour.
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import type { TodayItem, TodaySeverity } from "@/lib/today";

const TONE: Record<TodaySeverity, { label: string; badge: string; count: string }> = {
  high: { label: "Now", badge: "bg-rose-50 text-rose-600 ring-rose-100", count: "bg-rose-50 text-rose-600" },
  medium: { label: "Today", badge: "bg-amber-50 text-amber-700 ring-amber-100", count: "bg-amber-50 text-amber-700" },
  low: { label: "Soon", badge: "bg-ink-100 text-ink-600 ring-ink-200", count: "bg-ink-100 text-ink-700" },
};

export function TodayList({ items, title = "Today", description, className }: { items: TodayItem[]; title?: string; description?: string; className?: string }) {
  const urgent = items.filter((i) => i.severity === "high").length;
  return (
    <Card className={cn("overflow-hidden", className)} data-testid="today-list">
      <CardHeader
        title={title}
        description={description ?? (items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} to do${urgent ? ` · ${urgent} urgent` : ""}` : "Nothing needs your attention")}
      />
      {items.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-5 w-5" strokeWidth={1.9} />} title="All clear" className="py-8">
          Orders, stock, cash, alerts and HQ updates are all in hand.
        </EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
          {items.map((i) => {
            const t = TONE[i.severity];
            return (
              <li key={i.key}>
                <Link href={i.href} className="flex min-h-14 items-center gap-3 px-5 py-2.5 transition hover:bg-brand-50/40 sm:gap-4">
                  <span className={cn("tnum grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-base font-semibold", t.count)} aria-hidden>
                    {i.count > 99 ? "99+" : i.count}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{i.title}</span>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset", t.badge)}>{t.label}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-500">{i.line}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-300" strokeWidth={1.9} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
