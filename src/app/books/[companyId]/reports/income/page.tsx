import { ChartColumn } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { incomeStatement, storeFilter, thisMonth } from "@/server/ledger/reports";
import { booksHref, monthRange, param, periodChoices, rangeLabel, recentMonths, yearToDate, type StatementLine } from "@/lib/ledger-reports";
import { delta } from "@/lib/ranges";
import { pct, zarCompact } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { Stat } from "@/components/ui/stat";
import { ChoiceFilter, FilterRow, PeriodPicker, StoreFilter } from "@/components/books/filters";
import { ReportHeader } from "@/components/books/report-header";
import { StatementTable } from "@/components/books/statement";

export const metadata = { title: "Income statement" };

const COMPARE = { previous: "the period before", lastYear: "the same months last year" } as const;

export default async function IncomeStatementPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company } = await requireBooks(companyId);
  const now = thisMonth();
  const range = monthRange({ from: param(sp.from), to: param(sp.to) }, yearToDate(now, company.yearEndMonth));
  const { stores, store } = await storeFilter(companyId, param(sp.store));
  const compare = param(sp.compare) === "previous" || param(sp.compare) === "lastYear" ? (param(sp.compare) as keyof typeof COMPARE) : null;
  const askedBy = param(sp.by) === "month" || param(sp.by) === "store" ? (param(sp.by) as "month" | "store") : null;
  const is = await incomeStatement(companyId, { ...range, storeId: store?.id, compare, by: askedBy });
  const query = { from: range.from, to: range.to, store: store?.id, compare: compare ?? undefined, by: is.by ?? undefined };
  const path = booksHref(companyId, "reports/income");
  const total = is.columns.findIndex((c) => c.key === "total");
  const cmp = is.columns.findIndex((c) => c.key === "compare");
  const hasLines = is.lines.some((l) => l.kind === "account");
  const tile = (v: number[]) => ({ value: v[total], delta: cmp >= 0 ? delta(Math.abs(v[total]), Math.abs(v[cmp])) : null });
  const margin = (v: number[]) => (is.revenue[total] ? pct(v[total] / is.revenue[total]) : null);
  // Account amounts open the ledger for that column's months (and store); profit lines open nothing.
  const href = (line: StatementLine, i: number) => {
    if (line.kind !== "account") return undefined;
    const c = is.columns[i < 0 ? total : i];
    if (!c || c.other) return undefined;
    return booksHref(companyId, "reports/ledger", { account: line.account.id, from: c.from, to: c.to, store: c.storeId ?? store?.id });
  };
  const byChoices = [
    { value: "", label: "Total for the period" },
    ...(range.from !== range.to ? [{ value: "month", label: "Month by month" }] : []),
    ...(stores.length > 1 && !store ? [{ value: "store", label: "Store by store" }] : []),
  ];

  return (
    <>
      <ReportHeader
        company={company}
        title="Income statement"
        description="Revenue, cost of sales and running costs from the books, ex VAT — the profit or loss for the period."
        period={rangeLabel(range)}
        store={store?.name}
      />
      <FilterRow>
        <PeriodPicker path={path} query={query} choices={periodChoices(now, company.yearEndMonth)} months={recentMonths(now)} from={range.from} to={range.to} />
        <ChoiceFilter path={path} query={query} name="compare" label="Compare with" value={compare ?? ""} choices={[{ value: "", label: "Nothing" }, { value: "previous", label: "The period before" }, { value: "lastYear", label: "Same months last year" }]} />
        {byChoices.length > 1 && <ChoiceFilter path={path} query={query} name="by" label="Show" value={is.by ?? ""} choices={byChoices} />}
        <StoreFilter path={path} query={query} stores={stores} value={store?.id ?? null} />
      </FilterRow>

      {hasLines && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Revenue" value={zarCompact(tile(is.revenue).value)} delta={tile(is.revenue).delta} deltaLabel={compare ? `vs ${COMPARE[compare]}` : undefined} />
          <Stat label="Gross profit" value={zarCompact(is.grossProfit[total])} sub={margin(is.grossProfit) ? `${margin(is.grossProfit)} margin` : undefined} />
          <Stat label="Operating expenses" value={zarCompact(-is.operatingExpenses[total])} delta={tile(is.operatingExpenses).delta} upIsGood={false} deltaLabel={compare ? `vs ${COMPARE[compare]}` : undefined} />
          <Stat
            label={is.netProfit[total] < 0 ? "Net loss" : "Net profit"}
            value={<span className={is.netProfit[total] < 0 ? "text-rose-600" : undefined}>{zarCompact(is.netProfit[total])}</span>}
            sub={margin(is.netProfit) ? `${margin(is.netProfit)} of revenue` : undefined}
          />
        </div>
      )}

      <Card className="overflow-hidden">
        {hasLines ? (
          <StatementTable
            caption={`Income statement, ${rangeLabel(range)}`}
            columns={is.columns.map((c) => (c.key === "compare" ? { key: c.key, label: compare === "lastYear" ? "Last year" : "Period before", sub: c.label } : c))}
            lines={is.lines}
            href={href}
            compare={cmp >= 0 ? { current: total, previous: cmp } : undefined}
          />
        ) : (
          <EmptyState icon={<ChartColumn className="h-5 w-5" />} title="No income or expenses in this period">
            Pick another period — income and expenses appear here as trading days, statements and expenses post to the books.
          </EmptyState>
        )}
      </Card>
      <p className="mt-4 max-w-3xl text-sm text-ink-500">
        From the general ledger, all amounts ex VAT. Revenue is income accounts 4000–4899, cost of sales the 5000s (stock sold, written off and counted short), and operating expenses
        the rest. Click an amount to see the entries behind it. Profit is before income tax.
      </p>
    </>
  );
}
