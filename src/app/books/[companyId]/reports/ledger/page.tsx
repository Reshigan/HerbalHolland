import Link from "next/link";
import { ListTree, X } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { accountLedger, chartOf, storeFilter, thisMonth } from "@/server/ledger/reports";
import { sourceLabel } from "@/lib/ledger-admin";
import { booksHref, monthRange, param, periodChoices, rangeLabel, recentMonths, yearToDate } from "@/lib/ledger-reports";
import { fmtDate } from "@/lib/format";
import { zarCompact } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Stat } from "@/components/ui/stat";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { AmountCell, DrCr } from "@/components/books/cells";
import { ChoiceFilter, FilterRow, PeriodPicker, StoreFilter } from "@/components/books/filters";
import { ReportHeader } from "@/components/books/report-header";

export const metadata = { title: "General ledger" };

const TYPE_LABEL = { ASSET: "Assets", LIABILITY: "Liabilities", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expenses" } as const;
const drcr = (cents: number) => `${zarCompact(Math.abs(cents))}${cents > 0 ? " Dr" : cents < 0 ? " Cr" : ""}`;

export default async function LedgerPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company } = await requireBooks(companyId);
  const now = thisMonth();
  const range = monthRange({ from: param(sp.from), to: param(sp.to) }, yearToDate(now, company.yearEndMonth));
  const [{ stores, store }, accounts] = await Promise.all([storeFilter(companyId, param(sp.store)), chartOf(companyId)]);
  const account = accounts.find((a) => a.id === param(sp.account)) ?? accounts.find((a) => a.key === "bank") ?? accounts[0];
  const partyId = account.party ? (param(sp.party) ?? null) : null;
  const page = pageParam(sp.page);
  const l = (await accountLedger(companyId, account.id, { ...range, storeId: store?.id, partyId }, page))!;
  const query = { account: account.id, from: range.from, to: range.to, store: store?.id, party: partyId ?? undefined };
  const path = booksHref(companyId, "reports/ledger");
  const partyName = partyId ? (l.parties.get(partyId) ?? partyId) : null;
  const last = page >= Math.max(1, Math.ceil(l.total / l.pageSize));
  const showStore = l.lines.some((x) => x.storeId);
  const showParty = !!account.party && !partyId;
  const cols = 6 + (showStore ? 1 : 0) + (showParty ? 1 : 0);
  const summary = (label: string, cents: number) => (
    <tr className="bg-ink-50/70 font-semibold text-ink-950">
      <Td colSpan={cols - 1}>{label}</Td>
      <AmountCell cents={cents} drcr strong />
    </tr>
  );

  return (
    <>
      <ReportHeader
        company={company}
        title="General ledger"
        description={
          <>
            <span className="tnum">{account.code}</span> {account.name}
            {partyName && <> · {partyName}</>}
            {!account.active && " · inactive"}: every posted entry with its running balance.
          </>
        }
        period={rangeLabel(range)}
        store={store?.name}
        csvHref={booksHref(companyId, "export/ledger", query)}
      />
      <FilterRow>
        <ChoiceFilter
          path={path}
          query={query}
          name="account"
          label="Account"
          value={account.id}
          clear={["party"]}
          choices={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}${a.active ? "" : " (inactive)"}`, group: TYPE_LABEL[a.type] }))}
        />
        <PeriodPicker path={path} query={query} choices={periodChoices(now, company.yearEndMonth)} months={recentMonths(now)} from={range.from} to={range.to} />
        <StoreFilter path={path} query={query} stores={stores} value={store?.id ?? null} />
        {partyName && (
          <Link
            href={booksHref(companyId, "reports/ledger", { ...query, party: undefined })}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-900 bg-ink-900 px-3.5 text-xs font-semibold text-white"
            aria-label={`Show every party, not just ${partyName}`}
          >
            {partyName}
            <X className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </FilterRow>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Opening balance" value={drcr(l.opening)} />
        <Stat label="Debits" value={zarCompact(l.debit)} />
        <Stat label="Credits" value={zarCompact(l.credit)} />
        <Stat label="Closing balance" value={drcr(l.closing)} sub={`${l.total.toLocaleString("en-US")} ${l.total === 1 ? "entry" : "entries"}`} />
      </div>

      <Card className="overflow-hidden">
        <Table stickyFirst minWidth="52rem">
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Journal</Th>
              <Th>Description</Th>
              {showStore && <Th>Store</Th>}
              {showParty && <Th>{account.party === "SUPPLIER" ? "Supplier" : account.party === "COMPANY" ? "Franchisee" : "Customer"}</Th>}
              <Th align="right">Debit</Th>
              <Th align="right">Credit</Th>
              <Th align="right">Balance</Th>
            </tr>
          </thead>
          <tbody>
            {page === 1 && summary("Opening balance", l.opening)}
            {l.lines.length === 0 && (
              <TableEmpty cols={cols} icon={<ListTree className="h-5 w-5" />} title="No entries in this period">
                Nothing was posted to {account.name} {partyName ? `for ${partyName} ` : ""}in {rangeLabel(range)}.
              </TableEmpty>
            )}
            {l.lines.map((x) => {
              const journal = booksHref(companyId, `journals/${x.journalId}`);
              return (
                <Tr key={x.id} href={journal}>
                  <Td className="whitespace-nowrap">{fmtDate(`${x.date}T12:00:00Z`)}</Td>
                  <Td className="whitespace-nowrap">
                    <Link href={journal} className="tnum font-medium text-ink-900 underline-offset-2 hover:text-brand-700 hover:underline">
                      #{x.number}
                    </Link>
                  </Td>
                  <Td className="min-w-[16rem]">
                    <span className="text-ink-900">{x.memo}</span>
                    {x.lineMemo && <span className="block text-xs text-ink-500">{x.lineMemo}</span>}
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                      {sourceLabel(x.source)}
                      {x.late && (
                        <Badge tone="amber" className="py-0">
                          <span title="Its own month was closed, so it went into the first open month">Posted late</span>
                        </Badge>
                      )}
                    </span>
                  </Td>
                  {showStore && <Td className="whitespace-nowrap text-ink-600">{x.storeId ? (l.stores.get(x.storeId)?.code ?? "—") : "—"}</Td>}
                  {showParty && (
                    <Td className="text-ink-600">
                      {x.partyId ? (
                        <Link href={booksHref(companyId, "reports/ledger", { ...query, party: x.partyId })} className="underline-offset-2 hover:text-brand-700 hover:underline">
                          {l.parties.get(x.partyId) ?? x.partyId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                  )}
                  <AmountCell cents={x.cents > 0 ? x.cents : 0} />
                  <AmountCell cents={x.cents < 0 ? -x.cents : 0} />
                  <Td align="right">
                    <DrCr cents={x.balance} />
                  </Td>
                </Tr>
              );
            })}
            {last && l.total > 0 && summary("Closing balance", l.closing)}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={l.pageSize} total={l.total} href={(p) => booksHref(companyId, "reports/ledger", { ...query, page: p })} />
      </Card>
      {(account.key === "retained" || ["INCOME", "EXPENSE"].includes(account.type)) && (
        <p className="mt-4 max-w-3xl text-sm text-ink-500">
          {account.key === "retained"
            ? "The opening balance includes the profit of every financial year that ended before this period's. Retained earnings are worked out from the books, not posted."
            : "Income and expense accounts start each financial year at nil, so the opening balance is this financial year's total before the period."}
        </p>
      )}
    </>
  );
}
