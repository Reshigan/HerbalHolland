import Link from "next/link";
import { requireBooks } from "@/server/ledger/access";
import { cashFlow, storeFilter, thisMonth } from "@/server/ledger/reports";
import { booksHref, monthRange, param, periodChoices, rangeLabel, recentMonths, yearToDate, type StatementLine } from "@/lib/ledger-reports";
import { zarCompact } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { FilterRow, PeriodPicker, StoreFilter } from "@/components/books/filters";
import { ReportHeader } from "@/components/books/report-header";
import { StatementTable } from "@/components/books/statement";

export const metadata = { title: "Cash flow" };

export default async function CashFlowPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company } = await requireBooks(companyId);
  const now = thisMonth();
  const range = monthRange({ from: param(sp.from), to: param(sp.to) }, yearToDate(now, company.yearEndMonth));
  const { stores, store } = await storeFilter(companyId, param(sp.store));
  const cf = await cashFlow(companyId, { ...range, storeId: store?.id });
  const query = { from: range.from, to: range.to, store: store?.id };
  const path = booksHref(companyId, "reports/cash-flow");
  const ledger = (accountId: string) => booksHref(companyId, "reports/ledger", { account: accountId, ...query });
  const href = (line: StatementLine) => (line.kind === "account" ? ledger(line.account.id) : undefined);

  return (
    <>
      <ReportHeader
        company={company}
        title="Cash flow"
        description="Where the money came from and where it went: every movement in the bank, cash, card and online-payment accounts, by what it was for."
        period={rangeLabel(range)}
        store={store?.name}
      />
      <FilterRow>
        <PeriodPicker path={path} query={query} choices={periodChoices(now, company.yearEndMonth)} months={recentMonths(now)} from={range.from} to={range.to} />
        <StoreFilter path={path} query={query} stores={stores} value={store?.id ?? null} />
      </FilterRow>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash at the start" value={zarCompact(cf.opening[0])} />
        <Stat label="From operating activities" value={zarCompact(cf.operating[0])} />
        <Stat label="Net change" value={<span className={cf.net[0] < 0 ? "text-rose-600" : undefined}>{zarCompact(cf.net[0])}</span>} sub="investing and financing included" />
        <Stat label="Cash at the end" value={zarCompact(cf.closing[0])} />
      </div>

      <Card className="overflow-hidden">
        <StatementTable caption={`Cash flow, ${rangeLabel(range)}`} columns={[{ key: "range", label: rangeLabel(range) }]} lines={cf.lines} href={href} />
      </Card>
      <div className="mt-4 max-w-3xl space-y-2 text-sm text-ink-500">
        <p>
          The direct method, from the general ledger: each entry that moved money is classified by its other side — buying fixed assets (1500s) is investing, loans (2600s) and
          the owners&apos; capital or drawings are financing, and everything else, from sales and VAT to suppliers and wages, is operating. Money moved between the cash accounts
          themselves (banking the takings) isn&apos;t a flow.
        </p>
        <p>
          Cash accounts:{" "}
          {cf.cashAccounts.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ", "}
              <Link href={ledger(a.id)} className="font-medium text-ink-700 underline-offset-2 hover:text-brand-700 hover:underline">
                {a.name}
              </Link>
            </span>
          ))}
          .
        </p>
      </div>
    </>
  );
}
