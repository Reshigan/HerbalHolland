import Link from "next/link";
import { ArrowRight, Banknote, ChartColumn, Landmark, Receipt, ReceiptText } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { monthRange, profitAndLoss, salesSummary, vatReport } from "@/server/finance";
import { supplierInvoiceSummary } from "@/server/supplier-invoices";
import { resolveRange } from "@/lib/ranges";
import { pct, zar, zarCompact } from "@/lib/money";
import { fmtMonth, dayKey } from "@/lib/format";
import { sp1 } from "@/server/store/rules";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { RangeTabs } from "@/components/ui/range-tabs";
import { AreaChart } from "@/components/charts/area-chart";
import { Line } from "@/components/store/ui";
import { cn } from "@/lib/cn";

export const metadata = { title: "Finance" };

const EXPENSE_LABEL: Record<string, string> = { RENT: "Rent", SALARIES: "Salaries & wages", UTILITIES: "Utilities", SECURITY: "Security", MARKETING: "Local marketing", SUPPLIES: "Supplies", BANK_FEES: "Bank & card fees", OTHER: "Other" };

export default async function FinancePage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const r = resolveRange({ range: sp1(sp.range), from: sp1(sp.from), to: sp1(sp.to) }, "mtd");
  const ids = [store.id];
  const thisMonth = dayKey(new Date()).slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => {
    const [y, m] = thisMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
    return d.toISOString().slice(0, 7);
  });
  const [pl, vat, trade, trend, invoices] = await Promise.all([
    profitAndLoss(ids, r),
    vatReport(ids, r),
    salesSummary(ids, r, "WHOLESALE"),
    Promise.all(months.map(async (m) => ({ month: m, pl: await profitAndLoss(ids, monthRange(m)) }))),
    supplierInvoiceSummary(ids),
  ]);
  const firstWithData = trend.findIndex((t) => t.pl.revenue !== 0);
  const shown = firstWithData < 0 ? trend.slice(-3) : trend.slice(firstWithData);
  const netMargin = pl.revenue ? pl.netProfit / pl.revenue : 0;
  const vendor = !!store.company.vatNumber;
  const base = `/store/${store.code}`;
  const saved = pl.summary.memberSavingsCents;

  return (
    <>
      <PageHeader
        overline={`Money · ${store.name}`}
        title="Finance"
        description={`Profit and loss and VAT working for ${store.company.legalName}${store.company.vatNumber ? ` (VAT ${store.company.vatNumber})` : ""}, from posted sales, received stock, expenses and franchise fees. ${r.from} to ${r.to}.`}
        actions={<RangeTabs path={`${base}/finance`} current={r.preset} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Net sales (ex VAT)" value={zarCompact(pl.revenue)} sub={`${pl.summary.sales.toLocaleString()} transactions${trade.netCents ? ` · of which trade ${zarCompact(trade.netCents)}` : ""}`} className="col-span-2 lg:col-span-1" />
        <Stat label="Gross profit" value={zarCompact(pl.grossProfit)} sub={`${pct(pl.marginPct)} gross margin`} />
        <Stat label="Operating expenses" value={zarCompact(pl.opex)} sub="ex VAT, as captured" />
        <Stat label="Franchise fees" value={zarCompact(pl.fees.total)} sub="royalty, levy, e-commerce" />
        <Stat label="Net profit" value={<span className={pl.netProfit < 0 ? "text-rose-600" : undefined}>{zarCompact(pl.netProfit)}</span>} sub={`${pct(netMargin)} of net sales`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Profit & loss" description="Ex VAT" />
          <CardBody className="pt-3">
            <Line label="Net sales" value={zar(pl.revenue)} strong />
            {trade.netCents !== 0 && <Line label={<span className="pl-4">of which trade sales to business accounts</span>} value={zar(trade.netCents)} muted />}
            <Line label={<span className="pl-4">incl. Rewards savings given to members</span>} value={saved ? `−${zar(saved)}` : zar(0)} muted />
            {pl.summary.discountCents > 0 && <Line label={<span className="pl-4">incl. promotions and discounts</span>} value={`−${zar(pl.summary.discountCents)}`} muted />}
            {pl.summary.offerCents > 0 && (
              <Line
                label={
                  <span className="pl-8">
                    of which My Deals — <Link href={`${base}/statement`} className="font-medium text-brand-700 hover:underline">HQ credits these on your statement</Link>
                  </span>
                }
                value={zar(pl.summary.offerCents)}
                muted
              />
            )}
            <Line label="Cost of sales (FIFO)" value={`−${zar(pl.cogs)}`} />
            <div className="my-1 border-t border-ink-100" />
            <Line label="Gross profit" value={<>{zar(pl.grossProfit)} <span className="ml-2 text-xs font-normal text-ink-500">{pct(pl.marginPct)}</span></>} strong />
            <div className="mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">Operating expenses</div>
            {pl.expenses.length === 0 && <Line label={<span className="pl-4 text-ink-500">No expenses captured</span>} value="—" muted />}
            {pl.expenses
              .sort((a, b) => b.exVatCents - a.exVatCents)
              .map((e) => (
                <Line key={e.category} label={<span className="pl-4">{EXPENSE_LABEL[e.category] ?? e.category}</span>} value={`−${zar(e.exVatCents)}`} />
              ))}
            <div className="mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">Franchise fees</div>
            <Line label={<span className="pl-4">Royalty ({store.royaltyBps / 100}% of net sales)</span>} value={`−${zar(pl.fees.royalty)}`} />
            <Line label={<span className="pl-4">Marketing fund levy ({store.levyBps / 100}%)</span>} value={`−${zar(pl.fees.levy)}`} />
            <Line label={<span className="pl-4">E-commerce commission ({store.ecomBps / 100}% of online)</span>} value={`−${zar(pl.fees.ecom)}`} />
            <div className="my-1 border-t border-ink-900" />
            <Line label="Net profit" value={<span className={pl.netProfit < 0 ? "text-rose-600" : "text-ink-950"}>{zar(pl.netProfit)}</span>} strong className="text-base" />
            <p className="mt-2 text-xs text-ink-500">Excludes owner salaries paid outside the business, depreciation and income tax. Wholesale stock is expensed as it sells (cost of sales), not when bought.</p>
          </CardBody>
        </Card>

        <Card className="h-fit xl:col-span-2">
          <CardHeader title="VAT201 working" description={`${r.from} to ${r.to}`} />
          <CardBody className="pt-3">
            {vendor ? (
              <>
                <Line label="Output tax on sales" value={zar(vat.output)} />
                <div className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">Input tax</div>
                <Line label={<span className="pl-4">Stock received</span>} value={`−${zar(vat.stockInput)}`} />
                <Line label={<span className="pl-4">Expenses (claimable)</span>} value={`−${zar(vat.expenseInput)}`} />
                <Line label={<span className="pl-4">Franchise fees</span>} value={`−${zar(vat.feeInput)}`} />
                <div className="my-1 border-t border-ink-900" />
                <Line label={vat.payable >= 0 ? "VAT payable to SARS" : "VAT refund due"} value={zar(Math.abs(vat.payable))} strong className="text-base" />
                <p className="mt-2 text-xs text-ink-500">A working, not a return: confirm against your tax invoices before filing on eFiling. Standard rate 15%.</p>
              </>
            ) : (
              <Notice tone="info" title="Not VAT-registered">
                {store.company.legalName} isn&apos;t a VAT vendor, so your tills charge no VAT and there&apos;s no VAT201 to file. Register once taxable supplies pass R2.3 million in 12 months.
              </Notice>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Monthly trend" description="Net sales and net profit, ex VAT" />
        <CardBody>
          <AreaChart
            labels={shown.map((t) => fmtMonth(`${t.month}-15T12:00:00Z`).replace(" 20", " ’"))}
            series={[
              { name: "Net sales", color: "var(--color-series-1)", values: shown.map((t) => t.pl.revenue) },
              { name: "Net profit", color: "var(--color-series-2)", values: shown.map((t) => Math.max(0, t.pl.netProfit)) },
            ]}
            height={200}
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <th className="py-2 text-left">Month</th>
                  <th className="py-2 text-right">Net sales</th>
                  <th className="py-2 text-right">Gross margin</th>
                  <th className="py-2 text-right">Expenses + fees</th>
                  <th className="py-2 text-right">Net profit</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.month} className="border-t border-ink-100">
                    <td className="py-2 text-ink-800">
                      {fmtMonth(`${t.month}-15T12:00:00Z`)}
                      {t.month === thisMonth && <span className="ml-2 text-xs text-ink-500">to date</span>}
                    </td>
                    <td className="tnum py-2 text-right">{zar(t.pl.revenue)}</td>
                    <td className="tnum py-2 text-right text-ink-600">{pct(t.pl.marginPct)}</td>
                    <td className="tnum py-2 text-right text-ink-600">{zar(t.pl.opex + t.pl.fees.total)}</td>
                    <td className={cn("tnum py-2 text-right font-semibold", t.pl.netProfit < 0 ? "text-rose-600" : "text-ink-950")}>{zar(t.pl.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { href: `${base}/cash-ups`, icon: Banknote, title: "Cash-ups", sub: "Shifts, floats and till variances" },
          { href: `${base}/expenses`, icon: Receipt, title: "Expenses", sub: "Capture rent, wages and bills" },
          { href: `${base}/finance/supplier-invoices`, icon: ReceiptText, title: "Supplier invoices", sub: invoices.overdue ? `${invoices.overdue} overdue · ${zarCompact(invoices.dueCents)} due` : invoices.due ? `${zarCompact(invoices.dueCents)} due · ${invoices.dueSoon} due this week` : "Capture, pay and query invoices" },
          { href: `${base}/statement`, icon: Landmark, title: "Franchise statement", sub: pl.summary.hqCollectedCents ? `${zarCompact(pl.summary.hqCollectedCents)} collected by HQ for you this period` : "What you owe HQ, or HQ owes you" },
          { href: `${base}/reports`, icon: ChartColumn, title: "Reports", sub: "Sales, margins, stock and staff" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="group flex items-center gap-3 rounded-2xl border border-ink-150 bg-white p-4 shadow-card transition hover:border-brand-300">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <l.icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink-900">{l.title}</span>
              <span className="block text-xs text-ink-500">{l.sub}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
