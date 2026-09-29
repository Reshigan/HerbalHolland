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
import { dayKey, fmtMonth } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PrintButton } from "@/components/shop/print-button";
import { DocumentPrintStyles } from "@/components/finance/document";
import { StatementDocument } from "@/components/finance/statement-document";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionButton, ConfirmAction } from "@/components/hq/action-form";
import { FilterForm, FilterSelect } from "@/components/hq/filter-form";
import { BackLink, EmptyRow } from "@/components/hq/ui";
import { emailAllStatements, emailOneStatement } from "./actions";

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

const Position = ({ cents }: { cents: number }) => (
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
      const st = await franchiseStatement(store.id, month);
      const [company, hq] = await Promise.all([
        db.company.findUnique({ where: { id: st.store.companyId }, select: { legalName: true, email: true, vatNumber: true, regNumber: true, address: true, phone: true } }),
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
        </>
      );
    }
  }

  const page = pageParam(sp.page);
  const pageSize = 25;
  const r = monthRange(month);
  const stores = await db.store.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true, company: { select: { name: true, email: true } } }, orderBy: { name: "asc" } });
  const slice = stores.slice((page - 1) * pageSize, page * pageSize);
  const [statements, fees, sum, wholesale] = await Promise.all([
    Promise.all(slice.map((s) => franchiseStatement(s.id, month))),
    franchiseFees(ids, r),
    salesSummary(ids, r),
    db.$queryRaw<{ ex: number }[]>`
      SELECT COALESCE(SUM(l."receivedQty" * l."unitCostCents"), 0)::float8 AS ex FROM "StockOrderLine" l JOIN "StockOrder" o ON o.id = l."stockOrderId"
      WHERE o.kind = 'WHOLESALE' AND o.status = 'RECEIVED' AND o."receivedAt" >= ${r.start} AND o."receivedAt" < ${r.end} AND o."buyerId" = ANY(${ids}::text[])`,
  ]);
  const wholesaleIncl = Math.round((wholesale[0]?.ex ?? 0) * 1.15);
  const feesIncl = fees.total + vatOnExcl(fees.total);
  const owed = feesIncl + wholesaleIncl + sum.pointsIssued * POINT_VALUE_CENTS - sum.onlineCents - sum.loyaltyCents;

  return (
    <>
      <PageHeader
        overline="Money"
        title="Franchise statements"
        description="One monthly statement per store: fees, wholesale stock on account, online sales collected by HQ, network trading and the Rewards pool — netted to a single amount."
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
        <Stat label="Online sales collected by HQ" value={zarCompact(sum.onlineCents)} sub="paid back to stores" />
        <Stat label="Net due to HQ" value={zarCompact(owed)} sub="all stores, after credits" />
      </div>
      <Card>
        <Table className="relative">
          <thead>
            <tr>
              <Th>Store</Th>
              <Th align="right" className="hidden md:table-cell">Net sales</Th>
              <Th align="right" className="hidden sm:table-cell">Fees + VAT</Th>
              <Th align="right" className="hidden lg:table-cell">Stock on account</Th>
              <Th align="right" className="hidden lg:table-cell">Points (issued − redeemed)</Th>
              <Th align="right">Net position</Th>
            </tr>
          </thead>
          <tbody>
            {statements.length === 0 && <EmptyRow cols={6}>No trading stores.</EmptyRow>}
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
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={stores.length} href={(p) => `/hq/statements${qs({ month, page: p })}`} />
      </Card>
    </>
  );
}
