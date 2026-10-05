import { requireBooks } from "@/server/ledger/access";
import { managementPack, thisMonth } from "@/server/ledger/reports";
import { addMonths } from "@/lib/ledger";
import { booksHref, fmtRatio, isMonth, monthEndLabel, monthLabel, param, rangeLabel, recentMonths, type StatementLine } from "@/lib/ledger-reports";
import { fmtDate } from "@/lib/format";
import { zarCompact } from "@/lib/money";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { Stat } from "@/components/ui/stat";
import { PrintButton } from "@/components/reports/frame";
import { ChoiceFilter, FilterRow } from "@/components/books/filters";
import { BooksPrintStyles } from "@/components/books/report-header";
import { StatementTable } from "@/components/books/statement";

export const metadata = { title: "Management pack" };

// On paper: a cover page, then each statement on a page of its own.
const PACK_PRINT = `@media print {
  .hh-pack-page { break-before: page; }
  .hh-pack-cover { padding-top: 30mm; }
}`;

export default async function PackPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company } = await requireBooks(companyId);
  const now = thisMonth();
  const asked = param(sp.month);
  const month = isMonth(asked) && asked <= now ? asked : addMonths(now, -1);
  const p = await managementPack(companyId, month);
  const path = booksHref(companyId, "pack");
  const ranges = [{ from: month, to: month }, p.ytd];
  const ledger = (accountId: string, r: { from: string; to: string }) => booksHref(companyId, "reports/ledger", { account: accountId, ...r });
  const incomeHref = (line: StatementLine, i: number) => (line.kind === "account" ? ledger(line.account.id, ranges[Math.max(0, i)]) : undefined);
  const balanceHref = (line: StatementLine, i: number) => {
    const c = p.balance.columns[Math.max(0, i)];
    return line.kind === "account" && c ? ledger(line.account.id, { from: c.fyStart, to: c.asOf }) : undefined;
  };
  const twoColumns = [
    { key: "month", label: monthLabel(month) },
    { key: "ytd", label: "Year to date", sub: rangeLabel(p.ytd) },
  ];
  const section = "hh-pack-page mt-8";

  return (
    <>
      <BooksPrintStyles />
      <style href="hh-books-pack" precedence="default">
        {PACK_PRINT}
      </style>
      <PageHeader
        className="print:hidden"
        overline={`Books · ${company.name}`}
        title="Management pack"
        description="The month's management accounts in one printable pack: income statement, balance sheet, cash flow and key ratios."
        actions={<PrintButton />}
      />
      <FilterRow>
        <ChoiceFilter path={path} query={{ month }} name="month" label="Month" value={month} choices={recentMonths(now).map((m) => ({ value: m, label: m === now ? `${monthLabel(m)} (so far)` : monthLabel(m) }))} />
      </FilterRow>

      <section className="hh-pack-cover rounded-2xl border border-ink-150 bg-white p-6 shadow-card sm:p-8" aria-labelledby="pack-title">
        <div className="eyebrow text-brand-700">Management accounts</div>
        <h2 id="pack-title" className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-950">
          {company.legalName}
        </h2>
        <p className="mt-2 text-lg text-ink-700">For the month ended {monthEndLabel(month)}</p>
        <dl className="mt-6 grid gap-x-8 gap-y-2 text-sm text-ink-600 sm:grid-cols-2">
          <div>
            <dt className="inline font-semibold text-ink-800">Financial year to date: </dt>
            <dd className="inline">{rangeLabel(p.ytd)}</dd>
          </div>
          {company.vatNumber && (
            <div>
              <dt className="inline font-semibold text-ink-800">VAT number: </dt>
              <dd className="inline">{company.vatNumber}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-semibold text-ink-800">Prepared: </dt>
            <dd className="inline">{fmtDate(new Date())}, from the books — unaudited</dd>
          </div>
        </dl>
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={`Revenue · ${monthLabel(month, true)}`} value={zarCompact(p.income.revenue[0])} sub={`${zarCompact(p.income.revenue[1])} year to date`} />
          <Stat
            label={`Net profit · ${monthLabel(month, true)}`}
            value={<span className={p.income.netProfit[0] < 0 ? "text-rose-600" : undefined}>{zarCompact(p.income.netProfit[0])}</span>}
            sub={`${zarCompact(p.income.netProfit[1])} year to date`}
          />
          <Stat label="Cash at month end" value={zarCompact(p.cash.closing[0])} sub="bank, cash, card and online" />
          <Stat label="Equity" value={zarCompact(p.balance.equity[0])} sub="assets less liabilities" />
        </div>
      </section>

      <section className="mt-8 break-inside-avoid" aria-labelledby="pack-ratios">
        <Card className="overflow-hidden">
          <CardHeader title={<span id="pack-ratios">Key ratios</span>} description={`Margins for the month and the year to date; the balance sheet ratios as at ${monthEndLabel(month)}`} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <th scope="col" className="border-b border-ink-150 bg-ink-50 px-5 py-2.5 text-left">
                    Ratio
                  </th>
                  <th scope="col" className="border-b border-ink-150 bg-ink-50 px-4 py-2.5 text-right">
                    {monthLabel(month, true)}
                  </th>
                  <th scope="col" className="border-b border-ink-150 bg-ink-50 px-5 py-2.5 text-right">
                    Year to date
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.ratios.month.map((r, i) => (
                  <tr key={r.key}>
                    <th scope="row" className="border-b border-ink-100 px-5 py-2.5 text-left font-normal text-ink-800">
                      {r.label}
                      <span className="block text-xs text-ink-500">{r.hint}</span>
                    </th>
                    <td className="tnum border-b border-ink-100 px-4 py-2.5 text-right">{fmtRatio(r)}</td>
                    <td className="tnum border-b border-ink-100 px-5 py-2.5 text-right">{fmtRatio(p.ratios.ytd[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className={section} aria-labelledby="pack-income">
        <Card className="overflow-hidden">
          <CardHeader title={<span id="pack-income">Income statement</span>} description="Ex VAT" />
          <div className="mt-4">
            <StatementTable caption={`Income statement for ${monthLabel(month)} and the year to date`} columns={twoColumns} lines={p.income.lines} href={incomeHref} />
          </div>
        </Card>
      </section>

      <section className={section} aria-labelledby="pack-balance">
        <Card className="overflow-hidden">
          <CardHeader title={<span id="pack-balance">Balance sheet</span>} description={`As at ${monthEndLabel(month)}, against the last financial year end`} />
          <div className="mt-4">
            <StatementTable caption={`Balance sheet as at ${monthEndLabel(month)}`} columns={p.balance.columns.map((c) => ({ key: c.key, label: monthEndLabel(c.asOf) }))} lines={p.balance.lines} href={balanceHref} />
          </div>
        </Card>
      </section>

      <section className={section} aria-labelledby="pack-cash">
        <Card className="overflow-hidden">
          <CardHeader title={<span id="pack-cash">Cash flow</span>} description="Direct method: every movement in the bank, cash, card and online-payment accounts, by what it was for" />
          <div className="mt-4">
            <StatementTable caption={`Cash flow for ${monthLabel(month)} and the year to date`} columns={twoColumns} lines={p.cash.lines} href={incomeHref} />
          </div>
        </Card>
        <p className="mt-4 max-w-3xl text-sm text-ink-500">
          Prepared from the general ledger. Retained earnings include the profit of every financial year that ended before this one, and this year&apos;s profit shows on its own
          line; neither is posted. Revenue and costs are ex VAT; profit is before income tax.
        </p>
      </section>
    </>
  );
}
