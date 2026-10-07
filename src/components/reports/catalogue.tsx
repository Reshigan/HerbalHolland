"use client";
// The reports catalogue: a "start here" row, a search box and grouped cards, each
// answering one question in plain English.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Lock, Search, X } from "lucide-react";
import { EmptyState } from "@/components/ui/page";
import { cn } from "@/lib/cn";
import type { ReportGroup } from "@/server/reports/types";
import { GROUP_META, ReportIcon } from "./icons";

export type CatalogueReport = { key: string; title: string; description: string; href: string; personal?: boolean };
export type CatalogueGroup = { group: ReportGroup; reports: CatalogueReport[] };

// Words people search for that don't appear in the titles.
const KEYWORDS: Record<string, string> = {
  "sales-overview": "daily turnover revenue takings trading atv upt basket margin",
  "sales-by-product": "sku best sellers top items",
  "sales-by-store": "league ranking growth stores branches",
  "sales-by-hour": "busy peak roster staffing heatmap weekday",
  "sales-by-staff": "member advisor budtender performance employees team leaderboard",
  refunds: "returns credit notes",
  payments: "bank reconciliation recon card cash payshap eft tenders takings",
  "online-orders": "ecommerce click collect delivery courier sla fulfilment",
  "trade-sales": "wholesale business accounts b2b pharmacies retailers trade portal ex vat",
  "trade-sales-store": "wholesale business accounts b2b trade portal collect till ex vat",
  "stock-valuation": "inventory value worth cost insurance",
  "stock-movements": "ledger history audit receipts transfers adjustments",
  shrinkage: "theft damage loss missing write-off",
  expiry: "expiring expired best before markdown",
  "dead-stock": "slow moving aged stale overstock",
  "sell-through": "turnover velocity days of cover",
  "low-stock": "reorder replenish out of stock par",
  "negative-stock": "oversold below zero",
  purchases: "wholesale buying suppliers dc distribution centre invoices",
  receiving: "short shipped deliveries missing grn",
  pnl: "profit loss income statement expenses",
  vat: "tax sars vat201 output input",
  "cash-ups": "till drawer float shift variance short over",
  statements: "franchise royalty levy settlement owe",
  "loyalty-liability": "rewards points loyalty liability settlement",
  "trade-aged-balances": "debtors age analysis overdue ledger owed credit terms 30 60 90 days accounts receivable",
  segments: "rfm champions lapsed at risk crm members",
  "new-vs-returning": "retention acquisition first time repeat",
  "member-attach": "rewards members linked sign in",
  "rewards-savings": "tier pricing member prices instant savings discount basket walk-in",
  "join-sources": "sign-ups qr codes links flyers src tags founding members acquisition",
  cohorts: "cohort retention join month heatmap came back churn",
  retention: "repeat purchase rate 90-day retention average order value aov basket trend churn",
  promotions: "discounts deals specials bonus buys",
  campaigns: "sms whatsapp email push roi marketing",
  "age-checks": "18+ id verification minors",
  "dispensing-register": "sahpra thc medical patients prescriptions section 21 dispenser",
  "compliance-events": "blocked sales exceptions rules",
  recalls: "recall quarantine batches unsafe",
  "batch-trace": "traceability recall members lab coa",
};

const slug = (g: string) => g.toLowerCase();

export function ReportCatalogue({ groups, featured }: { groups: CatalogueGroup[]; featured: CatalogueReport[] }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (r: CatalogueReport, group: string) => {
    const hay = `${r.title} ${r.description} ${group} ${KEYWORDS[r.key] ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const visible = groups.map((g) => ({ ...g, reports: g.reports.filter((r) => match(r, g.group)) })).filter((g) => g.reports.length);
  const total = groups.reduce((s, g) => s + g.reports.length, 0);

  return (
    <div>
      <div className="mb-6 space-y-3">
        <div className="relative w-full lg:max-w-lg">
          <label htmlFor="report-search" className="sr-only">
            Find a report
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" strokeWidth={2} aria-hidden />
          <input
            id="report-search"
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${total} reports (try “VAT”, “expiry” or “staff”)`}
            className="h-11 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-10 text-sm text-ink-900 shadow-card placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Clear search">
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-ink-200 bg-ink-50 px-1.5 text-[0.7rem] font-semibold text-ink-500 sm:block">/</kbd>
          )}
        </div>
        <nav aria-label="Report groups" className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {groups.map((g) => {
            const Icon = GROUP_META[g.group].icon;
            return (
              <a key={g.group} href={`#${slug(g.group)}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink-150 bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 shadow-card transition hover:border-brand-300 hover:text-ink-900">
                <Icon className="h-3.5 w-3.5 text-brand-600" strokeWidth={2} aria-hidden />
                {g.group}
                <span className="tnum text-ink-500">{g.reports.length}</span>
              </a>
            );
          })}
        </nav>
      </div>

      {!q && featured.length > 0 && (
        <section aria-labelledby="start-here" className="mb-10 rounded-2xl bg-ink-950 p-5 text-white sm:p-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div id="start-here" className="eyebrow text-brand-500">
                Start here
              </div>
              <p className="mt-1 text-sm text-ink-300">The reports people open most. Every report has filters, a chart where it helps, and a CSV export.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {featured.map((r) => (
              <Link key={r.key} href={r.href} className="group flex flex-col rounded-xl border border-ink-800 bg-ink-900 p-4 transition hover:border-brand-500/60 hover:bg-ink-850">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-ink-950">
                  <ReportIcon reportKey={r.key} className="h-5 w-5" />
                </span>
                <span className="mt-3 flex items-center gap-1 font-display text-base font-semibold text-white">
                  {r.title}
                  <ArrowUpRight className="h-4 w-4 text-ink-500 transition group-hover:text-brand-400" aria-hidden />
                </span>
                <span className="mt-1 text-sm leading-snug text-ink-300">{r.description}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {visible.map((g) => {
        const meta = GROUP_META[g.group];
        const Icon = meta.icon;
        return (
          <section key={g.group} id={slug(g.group)} aria-labelledby={`h-${slug(g.group)}`} className="mb-10 scroll-mt-24">
            <header className="mb-4 flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-brand-500">
                <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`h-${slug(g.group)}`} className="font-display text-lg font-semibold text-ink-950">
                  {g.group}
                </h2>
                <p className="text-sm text-ink-500">{meta.blurb}</p>
              </div>
              <span className="tnum mt-1 hidden shrink-0 rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-600 sm:inline">
                {g.reports.length} report{g.reports.length === 1 ? "" : "s"}
              </span>
            </header>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.reports.map((r) => (
                <Link
                  key={r.key}
                  href={r.href}
                  className="group flex items-start gap-3 rounded-2xl border border-ink-150 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-500 group-hover:text-ink-950">
                    <ReportIcon reportKey={r.key} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-display text-[0.98rem] font-semibold text-ink-900">{r.title}</span>
                      {r.personal && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700 ring-1 ring-inset ring-amber-100">
                          <Lock className="h-3 w-3" strokeWidth={2.2} aria-hidden />
                          Personal info
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-sm leading-snug text-ink-500">{r.description}</span>
                  </span>
                  <ArrowUpRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-brand-600")} aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {!visible.length && (
        <div className="rounded-2xl border border-ink-150 bg-white shadow-card">
          <EmptyState icon={<Search className="h-5 w-5" />} title={`No reports match “${q}”`}>
            Try a broader word like “sales”, “stock” or “members”.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
