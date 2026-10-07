import Link from "next/link";
import { Scale } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { storeFilter, thisMonth, trialBalance } from "@/server/ledger/reports";
import { booksHref, monthRange, param, periodChoices, rangeLabel, recentMonths, yearToDate } from "@/lib/ledger-reports";
import { zar } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/page";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { AmountCell } from "@/components/books/cells";
import { FilterRow, PeriodPicker, StoreFilter } from "@/components/books/filters";
import { ReportHeader } from "@/components/books/report-header";

export const metadata = { title: "Trial balance" };

const TYPES = [
  { type: "ASSET", label: "Assets" },
  { type: "LIABILITY", label: "Liabilities" },
  { type: "EQUITY", label: "Equity" },
  { type: "INCOME", label: "Income" },
  { type: "EXPENSE", label: "Expenses" },
] as const;

export default async function TrialBalancePage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company } = await requireBooks(companyId);
  const now = thisMonth();
  const range = monthRange({ from: param(sp.from), to: param(sp.to) }, yearToDate(now, company.yearEndMonth));
  const { stores, store } = await storeFilter(companyId, param(sp.store));
  const tb = await trialBalance(companyId, { ...range, storeId: store?.id });
  const query = { from: range.from, to: range.to, store: store?.id };
  const path = booksHref(companyId, "reports/trial-balance");
  const ledger = (accountId: string) => booksHref(companyId, "reports/ledger", { account: accountId, ...query });
  const groups = TYPES.map((t) => ({ ...t, rows: tb.rows.filter((r) => r.account.type === t.type) })).filter((g) => g.rows.length);
  const balanced = tb.totals.debit === tb.totals.credit && tb.totals.opening === 0 && tb.totals.closing === 0;

  return (
    <>
      <ReportHeader
        company={company}
        title="Trial balance"
        description="Each account's balance at the start of the period, what was debited and credited in it, and the balance at the end."
        period={rangeLabel(range)}
        store={store?.name}
        csvHref={booksHref(companyId, "export/trial-balance", query)}
      />
      <FilterRow>
        <PeriodPicker path={path} query={query} choices={periodChoices(now, company.yearEndMonth)} months={recentMonths(now)} from={range.from} to={range.to} />
        <StoreFilter path={path} query={query} stores={stores} value={store?.id ?? null} />
      </FilterRow>

      {!store && tb.rows.length > 0 && !balanced && (
        <Notice tone="danger" className="mb-4" title="These books don't balance">
          Debits and credits differ by {zar(Math.abs(tb.totals.debit - tb.totals.credit))}. Every journal balances on its own, so this needs looking into. See Month end for the books checks.
        </Notice>
      )}

      <Card className="overflow-hidden">
        <Table stickyFirst minWidth="46rem">
          <thead>
            <tr>
              <Th>Account</Th>
              <Th align="right">Opening</Th>
              <Th align="right">Debits</Th>
              <Th align="right">Credits</Th>
              <Th align="right">Closing</Th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <TableEmpty cols={5} icon={<Scale className="h-5 w-5" />} title="Nothing in these books for the period">
                Pick an earlier period, or check back once trading days, stock and expenses have posted.
              </TableEmpty>
            )}
            {groups.map((g) => [
              <tr key={g.type}>
                <td colSpan={5} className="border-b border-ink-100 bg-ink-50/60 px-5 pb-1.5 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-brand-700">
                  {g.label}
                </td>
              </tr>,
              ...g.rows.map((r) => (
                <Tr key={r.account.id} href={ledger(r.account.id)}>
                  <Td>
                    <Link href={ledger(r.account.id)} className="font-medium text-ink-900 underline-offset-2 hover:text-brand-700 hover:underline">
                      <span className="tnum mr-2 text-ink-500">{r.account.code}</span>
                      {r.account.name}
                    </Link>
                    {r.account.key === "retained" && tb.earlierProfit !== 0 && <span className="block text-xs text-ink-500">Includes {zar(tb.earlierProfit)} profit of earlier years</span>}
                  </Td>
                  <AmountCell cents={r.opening} drcr href={ledger(r.account.id)} />
                  <AmountCell cents={r.debit} href={ledger(r.account.id)} />
                  <AmountCell cents={r.credit} href={ledger(r.account.id)} />
                  <AmountCell cents={r.closing} drcr strong href={ledger(r.account.id)} />
                </Tr>
              )),
            ])}
          </tbody>
          {groups.length > 0 && (
            <tfoot>
              <tr className="font-semibold text-ink-950">
                <Td className="border-t-2 border-ink-200 bg-ink-50">Total</Td>
                <AmountCell cents={tb.totals.opening} drcr className="border-t-2 border-ink-200 bg-ink-50" />
                <AmountCell cents={tb.totals.debit} className="border-t-2 border-ink-200 bg-ink-50" />
                <AmountCell cents={tb.totals.credit} className="border-t-2 border-ink-200 bg-ink-50" />
                <AmountCell cents={tb.totals.closing} drcr className="border-t-2 border-ink-200 bg-ink-50" />
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>
      <p className="mt-4 max-w-3xl text-sm text-ink-500">
        Debits are what the business owns and spends; credits what it owes, earns and its owners put in. Income and expense accounts start each financial year at nil: earlier
        years&apos; profit is part of retained earnings, worked out from the books rather than posted.
        {store && " A single store's slice of the books needn't balance: some entries, like payments from the company's bank account, aren't about one store."}
      </p>
    </>
  );
}
