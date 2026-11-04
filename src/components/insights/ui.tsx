// The Insights frame: the tab bar shared with the member app, the filters, and the tappable rows every drilldown uses.
import Link from "next/link";
import { ChartColumn, ChevronLeft, ChevronRight, CreditCard, Users } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { RangeTabs } from "@/components/ui/range-tabs";
import { fmtDay, type DateRange } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { InsightsContext } from "@/server/insights";
import { StorePicker } from "./store-picker";

export type InsightParams = { range?: string; from?: string; to?: string; store?: string };

/** A link that keeps the period and store the owner is looking at. */
export function insightHref(path: string, sp: InsightParams, extra: Record<string, string | number | undefined> = {}) {
  const all = { range: sp.range, from: sp.from, to: sp.to, store: sp.store, ...extra };
  const q = new URLSearchParams(Object.entries(all).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
  return q.size ? `${path}?${q}` : path;
}

const period = (r: DateRange) => (r.from === r.to ? fmtDay(`${r.from}T12:00:00Z`) : `${fmtDay(`${r.from}T12:00:00Z`)} to ${fmtDay(`${r.to}T12:00:00Z`)}`);

export function InsightsShell({ tab, path, ctx, sp, r, keep, title, back, children }: {
  tab: "sales" | "members";
  path: string;
  ctx: InsightsContext;
  sp: InsightParams;
  r?: DateRange & { preset: string };
  keep?: Record<string, string | undefined>;
  title: React.ReactNode;
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const tabs = [
    { key: "card", label: "Card", href: "/club", icon: CreditCard },
    { key: "sales", label: "Sales", href: insightHref("/insights/sales", sp), icon: ChartColumn },
    { key: "members", label: "Members", href: insightHref("/insights/members", sp), icon: Users },
  ];
  const hrefs = Object.fromEntries(["", ...ctx.stores.map((s) => s.code)].map((c) => [c, insightHref(path, { ...sp, store: c || undefined }, keep)]));
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-ink-150 bg-ink-50 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-6xl items-stretch justify-between gap-4 px-4 sm:px-6">
          <Link href="/club" aria-label="Back to my card" className="flex items-center text-brand-500">
            <Mark className="h-8 w-8" detail={false} />
          </Link>
          <nav aria-label="Insights" className="flex gap-1">
            {tabs.map((t) => (
              <Link key={t.key} href={t.href} aria-current={t.key === tab ? "page" : undefined} className={cn("-mb-px flex items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors", t.key === tab ? "border-brand-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900")}>
                <t.icon className="h-4 w-4" aria-hidden /> {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:px-6">
        {back && (
          <Link href={back.href} className="-my-1 -ml-1 inline-flex h-10 items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-900">
            <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
          </Link>
        )}
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">{title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {ctx.store?.name ?? "All stores"}
            {r && ` · ${period(r)}`}
          </p>
        </div>
        {r && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {ctx.stores.length > 1 ? <StorePicker stores={ctx.stores} value={ctx.store?.code ?? ""} hrefs={hrefs} /> : <span />}
            <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <RangeTabs path={path} current={r.preset} params={{ ...keep, store: sp.store }} />
            </div>
          </div>
        )}
        {children}
      </main>
    </>
  );
}

/** A list row: a name on the left, a figure on the right, and a chevron when there is more behind it. */
export function Row({ href, title, sub, value, valueSub }: { href?: string; title: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; valueSub?: React.ReactNode }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink-850">{title}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-ink-500">{sub}</div>}
      </div>
      {value !== undefined && (
        <div className="shrink-0 text-right">
          <div className="tnum text-sm font-semibold text-ink-850">{value}</div>
          {valueSub && <div className="tnum mt-0.5 text-xs text-ink-500">{valueSub}</div>}
        </div>
      )}
      {href && <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
    </>
  );
  const cls = "flex min-h-14 items-center gap-3 px-5 py-2";
  return <li className="border-t border-ink-150 first:border-t-0">{href ? <Link href={href} className={cn(cls, "transition-colors hover:bg-ink-100")}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
}

export const memberName = (c: { firstName?: string | null; lastName?: string | null; memberNo: string }) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.memberNo;
