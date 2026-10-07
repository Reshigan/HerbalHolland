import Link from "next/link";
import { Users } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { ageing, ageingKinds, type AgeingKind } from "@/server/ledger/reports";
import { addMonths } from "@/lib/ledger";
import { AGEING, booksHref, isDay, param } from "@/lib/ledger-reports";
import { dayKey, fmtDate } from "@/lib/format";
import { zarCompact } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/page";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Stat } from "@/components/ui/stat";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { TabLinks } from "@/components/ui/tabs";
import { AmountCell } from "@/components/books/cells";
import { DayFilter, FilterRow } from "@/components/books/filters";
import { ReportHeader } from "@/components/books/report-header";

export const metadata = { title: "Debtors & creditors" };

const PAGE_SIZE = 50;

function about(kind: AgeingKind, hq: boolean) {
  if (kind === "debtors") return { tab: "Trade debtors", party: "Trade account", what: "What trade customers owe on account. Negative: the customer is in credit." };
  if (kind === "creditors") return { tab: "Suppliers", party: "Supplier", what: "What the company owes its outside suppliers. Negative: the supplier owes you (a credit note or an overpayment)." };
  return hq
    ? { tab: "Franchisees", party: "Franchisee", what: "Each franchisee's current account with Herbal Holland. Positive: the franchisee owes HQ; negative: HQ owes the franchisee." }
    : { tab: "Herbal Holland", party: "Account", what: "Your current account with Herbal Holland. Positive: HQ owes you (money it collected for you); negative: you owe HQ (fees, stock and points)." };
}

export default async function AgeingPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company } = await requireBooks(companyId);
  const hq = company.kind === "FRANCHISOR";
  const kinds = ageingKinds(company.kind);
  const kind = kinds.find((k) => k === param(sp.kind)) ?? kinds[0];
  const today = dayKey(new Date());
  const asked = param(sp.asOf);
  const asOf = isDay(asked) && asked <= today ? asked : today;
  const a = await ageing(companyId, kind, asOf);
  const page = pageParam(sp.page);
  const rows = a.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const query = { kind, asOf: asOf === today ? undefined : asOf };
  const path = booksHref(companyId, "reports/ageing");
  const info = about(kind, hq);
  const month = asOf.slice(0, 7);
  const ledger = (partyId: string | null) => (a.account ? booksHref(companyId, "reports/ledger", { account: a.account.id, party: partyId, from: addMonths(month, -11), to: month }) : undefined);
  const tabs = kinds.map((k) => ({ href: booksHref(companyId, "reports/ageing", { kind: k, asOf: query.asOf }), label: about(k, hq).tab }));

  return (
    <>
      <ReportHeader company={company} title="Debtors & creditors" description="Who owes what, and for how long: balances aged by the date of each entry." period={`As at ${fmtDate(`${asOf}T12:00:00Z`)}`} />
      <TabLinks tabs={tabs} current={booksHref(companyId, "reports/ageing", { kind, asOf: query.asOf })} className="mb-5 print:hidden" />
      <FilterRow>
        <DayFilter path={path} query={query} name="asOf" label="As at" value={asOf} max={today} />
      </FilterRow>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance" value={zarCompact(a.totals.total)} sub={`${a.rows.length.toLocaleString("en-US")} ${a.rows.length === 1 ? "account" : "accounts"}`} />
        <Stat label="Current" value={zarCompact(a.totals.current)} sub="up to 30 days old" />
        <Stat label="Older than 30 days" value={zarCompact(a.totals.d30 + a.totals.d60 + a.totals.d90plus)} />
        <Stat label="Older than 90 days" value={<span className={a.totals.d90plus > 0 ? "text-rose-600" : undefined}>{zarCompact(a.totals.d90plus)}</span>} />
      </div>
      <Notice tone="info" className="mb-4">
        {info.what}
      </Notice>

      <Card className="overflow-hidden">
        <Table stickyFirst minWidth="44rem">
          <thead>
            <tr>
              <Th>{info.party}</Th>
              {AGEING.map((b) => (
                <Th key={b.key} align="right" title={b.detail}>
                  {b.label}
                </Th>
              ))}
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <TableEmpty cols={6} icon={<Users className="h-5 w-5" />} title="Nothing outstanding">
                Every {info.party.toLowerCase()} balance was settled as at {fmtDate(`${asOf}T12:00:00Z`)}.
              </TableEmpty>
            )}
            {rows.map((r) => {
              const href = ledger(r.partyId);
              return (
                <Tr key={r.partyId ?? "none"} href={href}>
                  <Td>
                    {href ? (
                      <Link href={href} className="font-medium text-ink-900 underline-offset-2 hover:text-brand-700 hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      r.name
                    )}
                  </Td>
                  {AGEING.map((b) => (
                    <AmountCell key={b.key} cents={r[b.key]} className={b.key === "d90plus" && r.d90plus > 0 ? "text-rose-600" : undefined} />
                  ))}
                  <AmountCell cents={r.total} href={href} strong />
                </Tr>
              );
            })}
          </tbody>
          {a.rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold text-ink-950">
                <Td className="border-t-2 border-ink-200 bg-ink-50">Total{a.rows.length > PAGE_SIZE ? " (every account)" : ""}</Td>
                {AGEING.map((b) => (
                  <AmountCell key={b.key} cents={a.totals[b.key]} className="border-t-2 border-ink-200 bg-ink-50" />
                ))}
                <AmountCell cents={a.totals.total} className="border-t-2 border-ink-200 bg-ink-50" />
              </tr>
            </tfoot>
          )}
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={a.rows.length} href={(p) => booksHref(companyId, "reports/ageing", { ...query, page: p })} />
      </Card>
      <p className="mt-4 max-w-3xl text-sm text-ink-500">
        Each entry is aged from its date: current is up to 30 days old, then 31–60, 61–90 and over 90 days. Payments and credits settle the oldest entries first, so what&apos;s
        still open is the newest. Click a name for its ledger.
      </p>
    </>
  );
}
