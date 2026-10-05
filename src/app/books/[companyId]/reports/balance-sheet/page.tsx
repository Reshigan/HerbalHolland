import { Layers } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { balanceSheet, storeFilter, thisMonth } from "@/server/ledger/reports";
import { addMonths } from "@/lib/ledger";
import { booksHref, fmtRatio, isMonth, monthEndLabel, monthLabel, nonZero, param, recentMonths, yearToDate, type StatementLine } from "@/lib/ledger-reports";
import { zar, zarCompact } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/page";
import { Stat } from "@/components/ui/stat";
import { ChoiceFilter, FilterRow, StoreFilter } from "@/components/books/filters";
import { ReportHeader } from "@/components/books/report-header";
import { StatementTable } from "@/components/books/statement";

export const metadata = { title: "Balance sheet" };

const COMPARE = [
  { value: "", label: "Nothing" },
  { value: "yearEnd", label: "Last financial year end" },
  { value: "lastYear", label: "A year earlier" },
  { value: "previous", label: "The month before" },
];

export default async function BalanceSheetPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company } = await requireBooks(companyId);
  const now = thisMonth();
  const asked = param(sp.asOf);
  const asOf = isMonth(asked) && asked <= now ? asked : now;
  const compare = COMPARE.find((c) => c.value && c.value === param(sp.compare))?.value ?? "";
  const compareTo =
    compare === "yearEnd" ? addMonths(yearToDate(asOf, company.yearEndMonth).from, -1) : compare === "lastYear" ? addMonths(asOf, -12) : compare === "previous" ? addMonths(asOf, -1) : null;
  const { stores, store } = await storeFilter(companyId, param(sp.store));
  const bs = await balanceSheet(companyId, asOf, { storeId: store?.id, compareTo });
  const query = { asOf, compare: compare || undefined, store: store?.id };
  const path = booksHref(companyId, "reports/balance-sheet");
  const label = (m: string) => (m === now ? "Today" : monthEndLabel(m));
  const hasLines = bs.lines.some((l) => l.kind === "account" || l.kind === "item");
  // An account opens its ledger for the column's financial year to date (the opening balance carries what came before).
  const href = (line: StatementLine, i: number) => {
    const c = bs.columns[i < 0 ? 0 : i];
    if (!c) return undefined;
    if (line.kind === "account") return booksHref(companyId, "reports/ledger", { account: line.account.id, from: c.fyStart, to: c.asOf, store: store?.id });
    if (line.kind === "item" && line.key === "profitThisYear") return booksHref(companyId, "reports/income", { from: c.fyStart, to: c.asOf, store: store?.id });
    return undefined;
  };
  const currentRatio = fmtRatio({ value: bs.currentLiabilities[0] ? bs.currentAssets[0] / bs.currentLiabilities[0] : null, format: "times" });

  return (
    <>
      <ReportHeader
        company={company}
        title="Balance sheet"
        description="What the business owns, what it owes, and the owners' stake in it. Retained earnings and this year's profit come straight from the books."
        period={asOf === now ? `As at today (${monthLabel(now)})` : `As at ${monthEndLabel(asOf)}`}
        store={store?.name}
      />
      <FilterRow>
        <ChoiceFilter path={path} query={query} name="asOf" label="As at" value={asOf} choices={recentMonths(now).map((m) => ({ value: m, label: label(m) }))} />
        <ChoiceFilter path={path} query={query} name="compare" label="Compare with" value={compare} choices={COMPARE} />
        <StoreFilter path={path} query={query} stores={stores} value={store?.id ?? null} />
      </FilterRow>

      {hasLines && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Total assets" value={zarCompact(bs.assets[0])} />
          <Stat label="Total liabilities" value={zarCompact(bs.liabilities[0])} />
          <Stat label={bs.equity[0] < 0 ? "Equity (negative)" : "Equity"} value={<span className={bs.equity[0] < 0 ? "text-rose-600" : undefined}>{zarCompact(bs.equity[0])}</span>} sub="assets less liabilities" />
          <Stat label="Current ratio" value={currentRatio} sub="current assets ÷ current liabilities" />
        </div>
      )}
      {!store && nonZero(bs.difference) && (
        <Notice tone="danger" className="mb-4" title="Assets don't equal equity and liabilities">
          Out by {zar(bs.difference[0])}. Every journal balances, so this needs looking into — the trial balance shows which accounts.
        </Notice>
      )}

      <Card className="overflow-hidden">
        {hasLines ? (
          <StatementTable caption={`Balance sheet as at ${monthEndLabel(asOf)}`} columns={bs.columns.map((c) => ({ key: c.key, label: label(c.asOf) }))} lines={bs.lines} href={href} />
        ) : (
          <EmptyState icon={<Layers className="h-5 w-5" />} title="Nothing in these books yet">
            The balance sheet fills in as opening balances, trading and stock post to the books.
          </EmptyState>
        )}
      </Card>
      <p className="mt-4 max-w-3xl text-sm text-ink-500">
        Fixed assets (1500s) and loans (2600s) are non-current; everything else is due or usable within the year. Retained earnings include the profit of every financial year
        that ended before this one, and this year&apos;s profit so far shows on its own line — neither is posted, so nothing needs closing at year end.
        {store && " For one store, the line “Funded by the rest of the company” is the difference its own entries leave: what the company put into it (or took out)."}
      </p>
    </>
  );
}
