import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, ArrowRight, CalendarCheck, ChartColumn, CheckCircle2, Landmark, Layers, ListTree, NotebookPen, Percent, Plus, Scale, Settings } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { booksFor } from "@/server/ledger/core";
import { booksChecks } from "@/server/ledger/checks";
import { db, tx } from "@/server/db";
import { keyFigures, MONTH_NAMES, profitOf, sourceLabel, type AccountSum } from "@/lib/ledger-admin";
import { addMonths, fiscalYearEnd, fiscalYearStart, periodOf } from "@/lib/ledger";
import { dayKey, fmtDate, fmtMonth } from "@/lib/format";
import { zar, zarCompact } from "@/lib/money";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Line } from "@/components/store/ui";
import { cn } from "@/lib/cn";

export const metadata = { title: "Books" };
const name = (m: string) => fmtMonth(`${m}-15T12:00:00Z`);

/** A company's books at a glance: key balances, this month and the year so far, month end and what needs attention. */
export default async function BooksOverview({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { company, role } = await requireBooks(companyId);
  await tx((t) => booksFor(t, companyId));
  const current = periodOf(dayKey(new Date()));
  const fyStart = fiscalYearStart(fiscalYearEnd(current, company.yearEndMonth));
  const [accounts, sums, banks, drafts, first, latest] = await Promise.all([
    db.ledgerAccount.findMany({ where: { companyId }, select: { id: true, key: true, type: true } }),
    db.ledgerBalance.groupBy({ by: ["accountId", "period"], where: { companyId }, _sum: { debitCents: true, creditCents: true } }),
    db.bankAccount.findMany({ where: { companyId }, select: { accountId: true } }),
    db.journal.count({ where: { companyId, status: "DRAFT" } }),
    db.journal.findFirst({ where: { companyId }, orderBy: { period: "asc" }, select: { period: true } }),
    db.journal.findMany({ where: { companyId }, orderBy: { number: "desc" }, take: 6, select: { id: true, number: true, date: true, memo: true, source: true, status: true } }),
  ]);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const total = (pick: (period: string) => boolean): AccountSum[] => {
    const m = new Map<string, number>();
    for (const s of sums) if (pick(s.period)) m.set(s.accountId, (m.get(s.accountId) ?? 0) + Number(s._sum.debitCents ?? 0) - Number(s._sum.creditCents ?? 0));
    return [...m].flatMap(([id, cents]) => (byId.has(id) ? [{ id, key: byId.get(id)!.key, type: byId.get(id)!.type, cents }] : []));
  };
  const f = keyFigures(total(() => true), new Set(banks.map((b) => b.accountId)));
  const month = profitOf(total((p) => p === current));
  const year = profitOf(total((p) => p >= fyStart && p <= current));
  const locked = company.booksLockedThrough;
  const next = locked ? addMonths(locked, 1) : (first?.period ?? current);
  const checkMonth = next < current ? next : current;
  const base = `/books/${companyId}`;
  const vendor = !!company.vatNumber;

  return (
    <>
      <PageHeader
        overline="Books"
        title={company.name}
        description={`${company.legalName}${vendor ? ` · VAT ${company.vatNumber}` : " · not a VAT vendor"} · financial year ends in ${MONTH_NAMES[company.yearEndMonth - 1]}.`}
        actions={
          role.write && (
            <ButtonLink href={`${base}/journals/new`}>
              <Plus className="h-4 w-4" aria-hidden />
              New journal
            </ButtonLink>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Bank and cash" value={zarCompact(f.cash)} sub="in the bank and the tills" className="col-span-2 lg:col-span-1" />
        <Stat label="Owed to us" value={zarCompact(f.owedToUs)} sub={company.kind === "FRANCHISOR" ? "trade debtors and franchisees" : "by Herbal Holland"} />
        <Stat label="We owe" value={zarCompact(f.owedByUs)} sub={company.kind === "FRANCHISOR" ? "suppliers, vouchers, points and more" : "suppliers, Herbal Holland and more"} />
        <Stat label={f.vatDue < 0 ? "VAT refund due" : "VAT due"} value={vendor ? zarCompact(Math.abs(f.vatDue)) : "—"} sub={vendor ? (f.vatDue < 0 ? "from SARS" : "to SARS, not yet paid") : "not a VAT vendor"} />
        <Stat label="Stock" value={zarCompact(f.stock)} sub="at cost, incl. in transit" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Profit" description={`Ex VAT, from the posted journals · financial year from ${name(fyStart)}`} />
          <CardBody className="pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  <th className="py-2 text-left font-semibold">
                    <span className="sr-only">Line</span>
                  </th>
                  <th className="py-2 text-right font-semibold">{name(current)} so far</th>
                  <th className="py-2 text-right font-semibold">Year to date</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Income", month.revenue, year.revenue],
                  ["Expenses", month.expenses, year.expenses],
                ].map(([label, m, y]) => (
                  <tr key={label} className="border-t border-ink-100">
                    <td className="py-2 text-ink-700">{label}</td>
                    <td className="tnum py-2 text-right text-ink-900">{zar(m as number)}</td>
                    <td className="tnum py-2 text-right text-ink-900">{zar(y as number)}</td>
                  </tr>
                ))}
                <tr className="border-t border-ink-900 font-semibold">
                  <td className="py-2 text-ink-950">Profit</td>
                  <td className={cn("tnum py-2 text-right", month.profit < 0 ? "text-rose-600" : "text-ink-950")}>{zar(month.profit)}</td>
                  <td className={cn("tnum py-2 text-right", year.profit < 0 ? "text-rose-600" : "text-ink-950")}>{zar(year.profit)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-500">
              Cost of sales, stock losses, franchise fees and running costs are expenses. Trading days post overnight, so today isn&apos;t in yet.{" "}
              <Link href={`${base}/reports/income`} className="font-medium text-brand-700 hover:underline">
                Income statement
              </Link>
            </p>
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Month end" description={locked ? `Closed through ${name(locked)}` : "No month closed yet"} />
          <CardBody className="space-y-1 pt-3">
            <Line label="Next to close" value={next < current ? name(next) : locked ? "Up to date" : "Nothing yet"} />
            <Line
              label="Drafts waiting for approval"
              value={
                drafts ? (
                  <Link href={`${base}/journals?status=DRAFT`} className="font-semibold text-amber-700 hover:underline">
                    {drafts}
                  </Link>
                ) : (
                  "None"
                )
              }
            />
            <Suspense fallback={<Line label={`Checks for ${name(checkMonth)}`} value={<span className="text-ink-500">Checking…</span>} />}>
              <ChecksLine companyId={companyId} month={checkMonth} href={`${base}/close?month=${checkMonth}`} />
            </Suspense>
            <div className="pt-3">
              <ButtonLink href={`${base}/close`} variant="outline" size="sm">
                <CalendarCheck className="h-4 w-4" aria-hidden />
                Month end
              </ButtonLink>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Latest journals"
          action={
            <Link href={`${base}/journals`} className="text-xs font-semibold text-brand-700 hover:underline">
              All journals
            </Link>
          }
        />
        {latest.length === 0 ? (
          <CardBody className="text-sm text-ink-500">Nothing posted yet: journals appear as the stores trade and stock, banking and statements post.</CardBody>
        ) : (
          <ul className="mt-2 divide-y divide-ink-100 pb-2">
            {latest.map((j) => (
              <li key={j.id}>
                <Link href={`${base}/journals/${j.id}`} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm hover:bg-brand-50/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-900">
                      <span className="tnum mr-2 text-ink-500">{j.number}</span>
                      {j.memo}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {fmtDate(j.date)} · {sourceLabel(j.source)}
                    </span>
                  </span>
                  {j.status === "DRAFT" && <Badge tone="amber">Draft</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: `${base}/journals`, icon: NotebookPen, title: "Journals", sub: "Every entry, and manual journals" },
          { href: `${base}/bank`, icon: Landmark, title: "Banking", sub: "Import statements and reconcile" },
          { href: `${base}/reports/trial-balance`, icon: Scale, title: "Trial balance", sub: "Every account's balance" },
          { href: `${base}/reports/income`, icon: ChartColumn, title: "Income statement", sub: "Profit and loss" },
          { href: `${base}/reports/balance-sheet`, icon: Layers, title: "Balance sheet", sub: "Assets, liabilities and equity" },
          { href: `${base}/vat`, icon: Percent, title: "VAT", sub: vendor ? "VAT201 working and periods" : "Not a VAT vendor" },
          { href: `${base}/accounts`, icon: ListTree, title: "Chart of accounts", sub: "Codes, names and balances" },
          { href: `${base}/settings`, icon: Settings, title: "Settings", sub: "VAT, year end, accountants, opening balances" },
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

/** The month's reconciliation checks, streamed in after the page (HQ's read the network's registers). */
async function ChecksLine({ companyId, month, href }: { companyId: string; month: string; href: string }) {
  const failing = (await booksChecks(companyId, month)).filter((c) => !c.ok);
  return (
    <Line
      label={`Checks for ${name(month)}`}
      value={
        <Link href={href} className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-semibold hover:underline", failing.length ? "text-rose-600" : "text-leaf-700")}>
          {failing.length ? <AlertTriangle className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
          {failing.length ? `${failing.length} to look at` : "All agree"}
        </Link>
      }
    />
  );
}

