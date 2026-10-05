import Link from "next/link";
import { ExternalLink, Mail, Send } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { franchiseFees, franchiseStatement, monthRange, salesSummary } from "@/server/finance";
import { can } from "@/server/hq/guard";
import { qs } from "@/server/hq/form";
import { POINT_VALUE_CENTS } from "@/lib/loyalty-rules";
import { zar, zarCompact, vatOnExcl } from "@/lib/money";
import { statementOutstanding } from "@/lib/ledger-hq";
import { dayKey, fmtMonth } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PrintButton } from "@/components/shop/print-button";
import { DocumentPrintStyles } from "@/components/finance/document";
import { StatementDocument } from "@/components/finance/statement-document";
import { StatementPayments } from "@/components/finance/statement-payments";
import { paidByStore, statementPayments } from "@/server/ledger/statement-payments";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { Field, Input, Select } from "@/components/ui/form";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/hq/action-form";
import { FilterForm, FilterSelect } from "@/components/hq/filter-form";
import { BackLink, EmptyRow } from "@/components/hq/ui";
import { deletePayment, emailAllStatements, emailOneStatement, recordPayment } from "./actions";

export const metadata = { title: "Statements" };

function months(n = 12) {
  const today = dayKey(new Date());
  let [y, m] = today.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) (m = 12), (y -= 1);
  }
  return out;
}

const PAY_PAGE = 10;

/** Who pays whom on a statement (positive: HQ pays the store); `settled` shows nothing left as "Settled". */
const Position = ({ cents, settled }: { cents: number; settled?: boolean }) =>
  settled && !cents ? (
    <span className="font-semibold text-ink-900">Settled</span>
  ) : (
    <span className={cents >= 0 ? "font-semibold text-leaf-700" : "font-semibold text-ink-900"}>
      {cents >= 0 ? "HQ pays " : "Owes HQ "}
      {zar(Math.abs(cents))}
    </span>
  );

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ month?: string; store?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope, { kind: "RETAIL", status: { not: "OPENING_SOON" } });
  const options = months();
  const month = options.includes(sp.month ?? "") ? sp.month! : options[1];
  const current = month === options[0];
  const net = can(user, "network");

  if (sp.store) {
    const store = await db.store.findFirst({ where: { code: sp.store, id: { in: ids } }, select: { id: true } });
    if (store) {
      const payPage = pageParam(sp.page);
      const [st, pays] = await Promise.all([franchiseStatement(store.id, month), statementPayments(store.id, month, payPage, PAY_PAGE)]);
      const admin = can(user, "admin");
      const outstanding = statementOutstanding(st.net, [{ amountCents: pays.paidCents }]);
      const today = dayKey(new Date());
      const [company, hq] = await Promise.all([
        db.company.findUnique({ where: { id: st.store.companyId }, select: { kind: true, legalName: true, email: true, vatNumber: true, regNumber: true, address: true, phone: true } }),
        db.company.findFirst({ where: { kind: "FRANCHISOR" } }),
      ]);
      return (
        <>
          <DocumentPrintStyles />
          <div className="no-print">
          <BackLink href={`/hq/statements${qs({ month })}`}>All statements · {fmtMonth(`${month}-01`)}</BackLink>
          <PageHeader
            overline={`${fmtMonth(`${month}-01`)} franchise statement${current ? " · month to date" : ""}`}
            title={`Herbal Holland ${st.store.name}`}
            description={`${company?.legalName ?? ""}${company?.vatNumber ? ` · VAT ${company.vatNumber}` : " · not VAT registered"} · ${company?.email ?? "no email on file"}`}
            actions={
              <>
                <ButtonLink href={`/store/${st.store.code}/statement?month=${month}`} variant="outline">
                  Store view <ExternalLink className="h-4 w-4" />
                </ButtonLink>
                <PrintButton label="Print or save as PDF" />
                {net && (
                  <ActionButton action={emailOneStatement.bind(null, store.id, month)} variant="dark" size="md" pendingLabel="Sending…">
                    <Mail className="h-4 w-4" /> Email to owner
                  </ActionButton>
                )}
              </>
            }
          />
          </div>
          <StatementDocument st={st} company={company ?? { legalName: st.store.name, vatNumber: null }} hq={hq} current={current} issuedAt={new Date()} />
          {company?.kind === "FRANCHISEE" && (
            <StatementPayments
              perspective="hq"
              netCents={st.net}
              paidCents={pays.paidCents}
              rows={pays.rows}
              total={pays.total}
              page={payPage}
              pageSize={PAY_PAGE}
              current={current}
              href={(p) => `/hq/statements${qs({ month, store: sp.store, page: p })}`}
              form={
                admin && (
                  <ActionForm action={recordPayment.bind(null, store.id, month)} resetOnSuccess className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Field label="Who paid" htmlFor="pay-direction">
                      <Select id="pay-direction" name="direction" defaultValue={outstanding > 0 ? "HQ_PAID" : "STORE_PAID"}>
                        <option value="STORE_PAID">Store paid HQ</option>
                        <option value="HQ_PAID">HQ paid store</option>
                      </Select>
                    </Field>
                    <Field label="Amount (R)" htmlFor="pay-amount">
                      <Input id="pay-amount" name="amount" inputMode="decimal" placeholder="1734.00" defaultValue={outstanding ? (Math.abs(outstanding) / 100).toFixed(2) : undefined} required />
                      <FieldError name="amount" />
                    </Field>
                    <Field label="Paid on" htmlFor="pay-date">
                      <Input id="pay-date" name="paidOn" type="date" defaultValue={today} max={today} required />
                      <FieldError name="paidOn" />
                    </Field>
                    <Field label="Bank reference" htmlFor="pay-reference">
                      <Input id="pay-reference" name="reference" maxLength={80} required />
                      <FieldError name="reference" />
                    </Field>
                    <Field label="Note (optional)" htmlFor="pay-note">
                      <Input id="pay-note" name="note" maxLength={300} />
                    </Field>
                    <div className="flex justify-end sm:col-span-2 lg:col-span-5">
                      <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
                    </div>
                  </ActionForm>
                )
              }
              remove={
                admin
                  ? (p) => (
                      <ConfirmAction action={deletePayment.bind(null, p.id)} label="Delete" title={`Delete the ${zar(Math.abs(p.amountCents))} payment (${p.reference})?`} confirmLabel="Delete payment" className="min-w-64 items-end text-left">
                        <p>Only for a payment recorded by mistake: its postings in both companies&apos; books are reversed.</p>
                      </ConfirmAction>
                    )
                  : undefined
              }
            />
          )}
        </>
      );
    }
  }

  const page = pageParam(sp.page);
  const pageSize = 25;
  const r = monthRange(month);
  const stores = await db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, company: { select: { name: true, email: true } } }, orderBy: { name: "asc" } });
  const slice = stores.slice((page - 1) * pageSize, page * pageSize);
  const [statements, fees, sum, wholesale, paid] = await Promise.all([
    Promise.all(slice.map((s) => franchiseStatement(s.id, month))),
    franchiseFees(ids, r),
    salesSummary(ids, r),
    db.$queryRaw<{ ex: number }[]>`
      SELECT COALESCE(SUM(l."receivedQty" * l."unitCostCents"), 0)::float8 AS ex FROM "StockOrderLine" l JOIN "StockOrder" o ON o.id = l."stockOrderId"
      WHERE o.kind = 'WHOLESALE' AND o.status = 'RECEIVED' AND o."receivedAt" >= ${r.start} AND o."receivedAt" < ${r.end} AND o."buyerId" = ANY(${ids}::text[])`,
    paidByStore(slice.map((s) => s.id), month),
  ]);
  const wholesaleIncl = Math.round((wholesale[0]?.ex ?? 0) * 1.15);
  const feesIncl = fees.total + vatOnExcl(fees.total);
  // What HQ collected for the stores (online, vouchers, trade sales on account or collected in store) comes off what they owe.
  const owed = feesIncl + wholesaleIncl + sum.pointsIssued * POINT_VALUE_CENTS - sum.hqCollectedCents - sum.loyaltyCents;

  return (
    <>
      <PageHeader
        overline="Money"
        title="Franchise statements"
        description="One monthly statement per store: fees, wholesale stock on account, money HQ collected for the store (online, vouchers, trade), network trading and the Rewards pool — netted to a single amount."
        actions={
          net && (
            <ConfirmAction action={emailAllStatements.bind(null, month)} label="Email all statements" icon={<Send className="h-4 w-4" />} triggerVariant="dark" variant="dark" title={`Email ${stores.length} ${fmtMonth(`${month}-01`)} statements?`} confirmLabel="Send to all owners" size="md">
              <p>Each owner company gets its store&apos;s statement at the email on file.{current ? " This month isn't finished — owners will see month-to-date figures." : ""}</p>
            </ConfirmAction>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterForm action="/hq/statements">
          <FilterSelect name="month" label="Month" allLabel={null} defaultValue={month} options={options.map((m, i) => ({ value: m, label: `${fmtMonth(`${m}-01`)}${i === 0 ? " (to date)" : ""}` }))} />
        </FilterForm>
      </div>
      {current && <Notice tone="warn" className="mb-4">This month is still trading — figures are month to date.</Notice>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fees incl. VAT" value={zarCompact(feesIncl)} sub={`${zarCompact(fees.total)} ex VAT`} />
        <Stat label="Wholesale on account" value={zarCompact(wholesaleIncl)} sub="received from DCs, incl. VAT" />
        <Stat label="Collected by HQ (online, vouchers, trade)" value={zarCompact(sum.hqCollectedCents)} sub="paid back to stores" />
        <Stat label="Net due to HQ" value={zarCompact(owed)} sub="all stores, after credits" />
      </div>
      <Card>
        <Table stickyFirst className="relative">
          <thead>
            <tr>
              <Th>Store</Th>
              <Th align="right" className="hidden md:table-cell">Net sales</Th>
              <Th align="right" className="hidden sm:table-cell">Fees + VAT</Th>
              <Th align="right" className="hidden lg:table-cell">Stock on account</Th>
              <Th align="right" className="hidden lg:table-cell">Points (issued − redeemed)</Th>
              <Th align="right">Net position</Th>
              <Th align="right">Outstanding</Th>
            </tr>
          </thead>
          <tbody>
            {statements.length === 0 && <EmptyRow cols={7}>No trading stores.</EmptyRow>}
            {statements.map((st, i) => (
              <Tr key={st.store.id}>
                <Td>
                  <Link href={`/hq/statements${qs({ month, store: st.store.code })}`} className="font-medium text-ink-900 hover:text-brand-700">
                    {st.store.name}
                  </Link>
                  <span className="block text-xs text-ink-500">
                    {slice[i].company.name}
                    {!slice[i].company.email && <span className="text-amber-700"> · no email</span>}
                  </span>
                </Td>
                <Td align="right" className="hidden md:table-cell">{zar(st.input.netSalesExVatCents)}</Td>
                <Td align="right" className="hidden sm:table-cell">{zar(st.royalty + st.levy + st.ecom + st.feesVat)}</Td>
                <Td align="right" className="hidden lg:table-cell">{zar(st.input.wholesaleCents + st.input.networkBoughtCents - st.input.networkSoldCents)}</Td>
                <Td align="right" className="hidden lg:table-cell">{zar(st.input.pointsIssuedCents - st.input.pointsRedeemedCents)}</Td>
                <Td align="right">
                  <Position cents={st.net} />
                </Td>
                <Td align="right">
                  <Position cents={statementOutstanding(st.net, [{ amountCents: paid.get(st.store.id) ?? 0 }])} settled />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={stores.length} href={(p) => `/hq/statements${qs({ month, page: p })}`} />
      </Card>
    </>
  );
}
