import Link from "next/link";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { franchiseFees, salesByDay, salesByStore, salesSummary } from "@/server/finance";
import { cashWaitingByStore } from "@/server/reports/finance";
import { supplierInvoiceSummary } from "@/server/supplier-invoices";
import { resolveRange } from "@/lib/ranges";
import { POINT_VALUE_CENTS } from "@/lib/loyalty-rules";
import { zar, zarCompact, pct, vatOnExcl } from "@/lib/money";
import { addDays, fmtDate, fmtDay, num } from "@/lib/format";
import { qs } from "@/server/hq/form";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Detail } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/bar-chart";
import { MiniStat } from "@/components/hq/ui";

export const metadata = { title: "Finance" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const r = resolveRange(sp, "mtd");
  const retail = await db.store.findMany({ where: { id: { in: ids }, kind: "RETAIL" }, select: { id: true, code: true, name: true, region: { select: { name: true } }, company: { select: { vatNumber: true } } } });
  const rids = retail.map((s) => s.id);
  const [sum, byStore, fees, days, campaigns, points, wholesale, liability, saved, unbanked, checks, invoices] = await Promise.all([
    salesSummary(rids, r),
    salesByStore(rids, r),
    franchiseFees(rids, r),
    salesByDay(rids, r),
    db.campaign.findMany({ where: { status: "SENT", sentAt: { gte: r.start, lt: r.end }, ...(scope.kind === "HQ" ? {} : { storeId: { in: rids } }) }, select: { id: true, name: true, costCents: true }, orderBy: { costCents: "desc" } }),
    db.loyaltyEntry.groupBy({ by: ["kind"], where: { createdAt: { gte: r.start, lt: r.end }, ...(scope.kind === "HQ" ? {} : { storeId: { in: rids } }) }, _sum: { points: true } }),
    db.$queryRaw<{ ex: number }[]>`
      SELECT COALESCE(SUM(l."receivedQty" * l."unitCostCents"), 0)::float8 AS ex FROM "StockOrderLine" l JOIN "StockOrder" o ON o.id = l."stockOrderId"
      WHERE o.kind = 'WHOLESALE' AND o.status = 'RECEIVED' AND o."receivedAt" >= ${r.start} AND o."receivedAt" < ${r.end} AND o."buyerId" = ANY(${rids}::text[])`,
    db.customer.aggregate({ where: scope.kind === "HQ" ? {} : { homeStoreId: { in: rids } }, _sum: { points: true } }),
    db.$queryRaw<{ cents: number }[]>`SELECT COALESCE(SUM("memberSavingsCents"), 0)::float8 AS cents FROM "DailyStoreStat" WHERE "storeId" = ANY(${rids}::text[]) AND "date" >= ${r.fromDate} AND "date" <= ${r.toDate}`,
    // Cash banking, as of now: one aggregated row per store with unbanked cash, and deposit checks by status.
    cashWaitingByStore(rids),
    db.cashDeposit.groupBy({ by: ["status"], where: { storeId: { in: rids }, status: { in: ["RECORDED", "QUERIED"] } }, _count: true, _sum: { amountCents: true } }),
    supplierInvoiceSummary(rids),
  ]);

  const regions = new Map<string, number>();
  for (const s of retail) regions.set(s.region.name, (regions.get(s.region.name) ?? 0) + (byStore.get(s.id)?.netCents ?? 0));
  const stores = retail.map((s) => ({ s, net: byStore.get(s.id)?.netCents ?? 0, gp: byStore.get(s.id)?.grossProfitCents ?? 0 })).sort((a, b) => b.net - a.net);
  const page = pageParam(sp.page);
  const pageRows = stores.slice((page - 1) * 25, page * 25);
  const spend = campaigns.reduce((a, c) => a + c.costCents, 0);
  const deals = sum.offerCents; // My Deals: HQ-funded discounts, credited to the selling store on its statement
  const fundSpend = spend + deals;
  const kind = (k: string) => points.find((p) => p.kind === k)?._sum.points ?? 0;
  const issued = ["EARN", "SIGNUP", "REFERRAL", "BIRTHDAY", "BONUS"].reduce((a, k) => a + kind(k), 0);
  const redeemed = -kind("REDEEM");
  const expired = -kind("EXPIRE");
  const wholesaleEx = Math.round(wholesale[0]?.ex ?? 0);
  const wholesaleVat = vatOnExcl(wholesaleEx);
  const wholesaleIncl = wholesaleEx + wholesaleVat;
  const nonVat = retail.filter((s) => !s.company.vatNumber);
  const nonVatSales = nonVat.reduce((a, s) => a + (byStore.get(s.id)?.grossCents ?? 0), 0);
  const feesVat = vatOnExcl(fees.total);
  const storeOf = new Map(retail.map((s) => [s.id, s]));
  const unbankedCents = unbanked.reduce((a, w) => a + w.cash, 0);
  const unbankedN = unbanked.reduce((a, w) => a + w.n, 0);
  const late = unbanked.filter((w) => w.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  const lateCents = late.reduce((a, w) => a + w.overdue, 0);
  const check = (s: "RECORDED" | "QUERIED") => checks.find((c) => c.status === s);

  return (
    <>
      <PageHeader
        overline={scope.kind === "REGION" ? `Region · ${user.region?.name}` : "Network"}
        title="Finance"
        description={`Network trading, franchise income, the marketing fund, the Rewards pool and VAT · ${fmtDate(r.start)} – ${fmtDate(addDays(r.end, -1))}`}
        actions={<RangeTabs path="/hq/finance" current={r.preset} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Network net sales" value={zarCompact(sum.netCents)} sub={`${zarCompact(sum.grossCents)} incl. VAT`} />
        <Stat label="Store gross profit" value={zarCompact(sum.grossProfitCents)} sub={`${pct(sum.marginPct)} margin`} />
        <Stat label="Franchise fee income" value={zarCompact(fees.total)} sub="ex VAT · royalty, levy, e-com" />
        <Stat label="Wholesale to stores" value={zarCompact(wholesaleIncl)} sub="received, incl. VAT" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Net sales by day" description="All stores, ex VAT" />
          <CardBody>
            <ColumnChart format="zar" data={days.map((d) => ({ label: fmtDay(`${d.date}T12:00:00Z`), value: d.netCents, tip: `${fmtDay(`${d.date}T12:00:00Z`)}\n${zar(d.netCents)} net · ${num(d.sales)} sales` }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="By region" description="Net sales, ex VAT" />
          <CardBody>
            <BarList rows={[...regions].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, sub: sum.netCents ? pct(value / sum.netCents, 0) : undefined }))} />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Franchise fee income" description="Charged on each store's monthly statement" />
          <CardBody>
            <dl className="divide-y divide-ink-100">
              <Detail label="Royalty">{zar(fees.royalty)}</Detail>
              <Detail label="Marketing fund levy">{zar(fees.levy)}</Detail>
              <Detail label="E-commerce commission">{zar(fees.ecom)}</Detail>
              <Detail label="Total ex VAT">
                <span className="font-display text-base">{zar(fees.total)}</span>
              </Detail>
              <Detail label="VAT charged on fees">{zar(feesVat)}</Detail>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Marketing fund" description="Levy collected vs spend on campaigns and My Deals — kept in a separate, auditable account (CPA franchise regulations)" />
          <CardBody className="space-y-4">
            <dl className="divide-y divide-ink-100">
              <Detail label="Levy collected">{zar(fees.levy)}</Detail>
              <Detail label={`Campaigns · ${campaigns.length}`}>{spend ? `−${zar(spend)}` : zar(0)}</Detail>
              <Detail
                label={
                  <>
                    My Deals given
                    <span className="block text-xs text-ink-500">credited to stores on their statements</span>
                  </>
                }
              >
                {deals ? `−${zar(deals)}` : zar(0)}
              </Detail>
            </dl>
            <MiniStat tone="dark" label={fees.levy - fundSpend >= 0 ? "Unspent this period" : "Overspent this period"} value={zar(Math.abs(fees.levy - fundSpend))} sub="Carried in the fund; reported to franchisees annually" />
            {campaigns.length > 0 && (
              <ul className="space-y-1 text-sm">
                {campaigns.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex justify-between gap-3">
                    <Link href={`/hq/marketing/${c.id}`} className="truncate text-ink-700 hover:text-brand-700">{c.name}</Link>
                    <span className="tnum shrink-0 text-ink-600">{zar(c.costCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Rewards pool" description="Points are a liability at R1 each; issuing stores fund it, redeeming stores are reimbursed" />
          <CardBody>
            <dl className="divide-y divide-ink-100">
              <Detail label="Issued">+{zar(issued * POINT_VALUE_CENTS)}</Detail>
              <Detail label="Redeemed">−{zar(redeemed * POINT_VALUE_CENTS)}</Detail>
              {expired > 0 && <Detail label="Expired / forfeited">−{zar(expired * POINT_VALUE_CENTS)}</Detail>}
              <Detail label="Net movement">
                <span className="font-display text-base">{zar((issued - redeemed - expired) * POINT_VALUE_CENTS)}</span>
              </Detail>
              <Detail label="Outstanding liability">{zarCompact((liability._sum.points ?? 0) * POINT_VALUE_CENTS)}</Detail>
              <Detail label="Instant member savings given">{zar(saved[0]?.cents ?? 0)}</Detail>
            </dl>
            <Link href="/hq/loyalty" className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">Settlement by store →</Link>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-3">
          <CardHeader title="VAT summary" description="Each franchisee is its own VAT vendor and files its own VAT201; HQ files on fees and wholesale" />
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Output VAT collected by stores" value={zarCompact(sum.vatCents)} sub={`on ${zarCompact(sum.grossCents)} of sales`} />
            <MiniStat label="HQ output VAT · fees" value={zarCompact(feesVat)} sub="15% on royalty, levy, commission" />
            <MiniStat label="HQ output VAT · wholesale" value={zarCompact(wholesaleVat)} sub="DC stock invoiced to stores" />
            <MiniStat label="Non-VAT stores" value={num(nonVat.length)} sub={nonVat.length ? `${zarCompact(nonVatSales)} of sales, no VAT charged` : "All stores are VAT vendors"} />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Cash banking"
          description="As of now · every cash-up's cash goes to the bank with a photo of the slip, and owners check each deposit against the bank statement"
          action={
            <Link href="/hq/reports/cash-banking" className="text-xs font-semibold text-brand-700 hover:underline">
              Cash banking report →
            </Link>
          }
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Cash waiting to be banked" value={zarCompact(unbankedCents)} sub={unbankedN ? `${num(unbankedN)} cash-ups at ${num(unbanked.length)} stores` : "Everything is banked"} />
          <MiniStat label="Stores with overdue cash" value={<span className={late.length ? "text-rose-600" : undefined}>{num(late.length)}</span>} sub={late.length ? `${zarCompact(lateCents)} overdue` : "None — all banked on time"} />
          <MiniStat label="Deposits awaiting a check" value={num(check("RECORDED")?._count ?? 0)} sub={`${zarCompact(check("RECORDED")?._sum.amountCents ?? 0)} to match to bank statements`} />
          <MiniStat label="Queried deposits" value={num(check("QUERIED")?._count ?? 0)} sub={check("QUERIED") ? `${zarCompact(check("QUERIED")?._sum.amountCents ?? 0)} not matching the statement yet` : "None open"} />
        </CardBody>
        {late.length > 0 ? (
          <Table stickyFirst className="border-t border-ink-100">
            <thead>
              <tr>
                <Th>Most overdue</Th>
                <Th className="hidden sm:table-cell">Region</Th>
                <Th align="right">Overdue</Th>
                <Th align="right" className="hidden md:table-cell">Cash-ups</Th>
                <Th className="hidden md:table-cell">Oldest cash-up</Th>
                <Th align="right">Waiting in all</Th>
              </tr>
            </thead>
            <tbody>
              {late.slice(0, 6).map((w) => {
                const s = storeOf.get(w.storeId);
                if (!s) return null;
                return (
                  <Tr key={w.storeId}>
                    <Td>
                      <Link href={`/store/${s.code}/banking`} className="font-medium text-ink-850 hover:text-brand-700">
                        {s.name}
                      </Link>
                    </Td>
                    <Td className="hidden text-ink-600 sm:table-cell">{s.region.name}</Td>
                    <Td align="right" className="font-semibold text-rose-600">{zar(w.overdue)}</Td>
                    <Td align="right" className="hidden md:table-cell">{num(w.overdueN)}</Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">{fmtDate(w.oldest)}</Td>
                    <Td align="right">{zar(w.cash)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <p className="border-t border-ink-100 px-5 py-4 text-sm text-ink-500">No store has overdue cash.</p>
        )}
        {late.length > 6 && <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">{num(late.length - 6)} more stores have overdue cash — see the report.</p>}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Supplier invoices"
          description="As of now · what stores owe the distribution centres, each other and outside suppliers, as captured in their back offices"
          action={
            <Link href="/hq/finance/supplier-invoices" className="text-xs font-semibold text-brand-700 hover:underline">
              Per store →
            </Link>
          }
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Due" value={zarCompact(invoices.dueCents)} sub={`${num(invoices.due)} invoices`} />
          <MiniStat label="Overdue" value={<span className={invoices.overdue ? "text-rose-600" : undefined}>{zarCompact(invoices.overdueCents)}</span>} sub={invoices.overdue ? `${num(invoices.overdue)} invoices past due` : "Nothing overdue"} />
          <MiniStat label="Due within 7 days" value={zarCompact(invoices.dueSoonCents)} sub={`${num(invoices.dueSoon)} invoices`} />
          <MiniStat label="Queried" value={num(invoices.queried)} sub={invoices.queried ? `${zarCompact(invoices.queriedCents)} in dispute` : "None open"} />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Stores" description="Net sales and gross profit this period" />
        <Table stickyFirst className="relative mt-4">
          <thead>
            <tr>
              <Th>Store</Th>
              <Th className="hidden sm:table-cell">Region</Th>
              <Th align="right">Net sales</Th>
              <Th align="right" className="hidden md:table-cell">Gross profit</Th>
              <Th align="right">Share</Th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ s, net, gp }) => (
              <Tr key={s.id}>
                <Td>
                  <Link href={`/hq/stores/${s.code}`} className="font-medium text-ink-850 hover:text-brand-700">
                    {s.name}
                  </Link>
                  {!s.company.vatNumber && <span className="ml-2 text-xs text-amber-700">non-VAT</span>}
                </Td>
                <Td className="hidden text-ink-600 sm:table-cell">{s.region.name}</Td>
                <Td align="right">{net ? zar(net) : "—"}</Td>
                <Td align="right" className="hidden md:table-cell">{net ? `${zar(gp)} · ${pct(gp / net)}` : "—"}</Td>
                <Td align="right">{sum.netCents ? pct(net / sum.netCents) : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={25} total={stores.length} href={(p) => `/hq/finance${qs({ range: sp.range, from: sp.from, to: sp.to, page: p })}`} />
      </Card>
    </>
  );
}
