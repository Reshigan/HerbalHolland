import Link from "next/link";
import { Percent } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { thisMonth, vatReturn, type VatStatus } from "@/server/ledger/reports";
import { addMonths, monthEnd, vatPeriodOf } from "@/lib/ledger";
import { booksHref, isMonth, monthEndLabel, monthLabel, param, rangeLabel, vatPeriodChoices } from "@/lib/ledger-reports";
import { fmtDate } from "@/lib/format";
import { zar, zarCompact } from "@/lib/money";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/page";
import { Stat } from "@/components/ui/stat";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ConfirmAction } from "@/components/ui/action-form";
import { AmountCell } from "@/components/books/cells";
import { ChoiceFilter, FilterRow } from "@/components/books/filters";
import { ReportHeader } from "@/components/books/report-header";
import { closeVatPeriodAction } from "./actions";

export const metadata = { title: "VAT" };

const STATUS: Record<VatStatus, { tone: Tone; label: string }> = {
  open: { tone: "blue", label: "Open" },
  nil: { tone: "neutral", label: "Nothing to declare" },
  due: { tone: "amber", label: "Ready to close" },
  closed: { tone: "green", label: "Closed" },
  changed: { tone: "red", label: "Changed since it was closed" },
};

export default async function VatPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company, role } = await requireBooks(companyId);
  const now = thisMonth();
  const settings = booksHref(companyId, "settings");

  if (!company.vatNumber)
    return (
      <>
        <ReportHeader company={company} title="VAT" description="The VAT201 working for each SARS VAT period, from the books." period="Not a VAT vendor" />
        <Card>
          <EmptyState icon={<Percent className="h-5 w-5" />} title={`${company.legalName} isn't a VAT vendor`}>
            Its tills charge no VAT and there's no VAT201 to file; VAT paid on purchases stays part of their cost. Once registered with SARS, add the VAT number and category in the
            company's settings.
          </EmptyState>
        </Card>
      </>
    );

  const category = company.vatCategory ?? "C";
  const latestOver = vatPeriodOf(addMonths(vatPeriodOf(now, category).from, -1), category).to;
  const asked = param(sp.period);
  const v = await vatReturn(companyId, isMonth(asked) && asked <= now ? asked : latestOver);
  if (!v.vendor) return null;
  const label = rangeLabel(v.period);
  const path = booksHref(companyId, "vat");
  const query = { period: v.period.to };
  const ledger = (accountId: string) => booksHref(companyId, "reports/ledger", { account: accountId, from: v.period.from, to: v.period.to });
  const refund = v.payable < 0;
  const canClose = role.approve && v.categorySet && (v.status === "due" || v.status === "changed");
  const gapMatters = Math.abs(v.outputGap) > Math.max(100, Math.round(v.output * 0.001));
  // Each VAT201 amount opens the VAT account behind it for the period.
  const fieldAccount: Record<string, string> = { "1 · 4": v.accounts.output, "14": v.accounts.input, "15": v.accounts.input, "19": v.accounts.input, "20": v.accounts.control };

  return (
    <>
      <ReportHeader
        company={company}
        title="VAT"
        description={`The VAT201 working for each SARS VAT period, from the books (category ${category}, ${category === "C" ? "monthly" : "every two months"}).`}
        period={label}
      />
      <FilterRow>
        <ChoiceFilter path={path} query={query} name="period" label="VAT period" value={v.period.to} choices={vatPeriodChoices(now, category, 12).map((p) => ({ value: p.to, label: p.to >= now ? `${p.label} (open)` : p.label }))} />
      </FilterRow>
      {!v.categorySet && (
        <Notice tone="warn" className="mb-4" title="Choose the company's VAT category">
          SARS gives every vendor a category: A or B (every two months) or C (monthly). Until it&apos;s set in{" "}
          <Link href={settings} className="font-semibold underline">
            the books settings
          </Link>
          , returns show one month at a time and periods can&apos;t be closed.
        </Notice>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Output tax" value={zarCompact(v.output)} sub="charged on sales and fees" />
          <Stat label="Input tax" value={zarCompact(v.input)} sub="claimed on purchases" />
          <Stat label={refund ? "Refundable by SARS" : "Payable to SARS"} value={zarCompact(Math.abs(v.payable))} className="col-span-2 sm:col-span-1" />
        </div>
        <Card className="h-fit">
          <CardHeader title={label} description={`Ends ${monthEndLabel(v.period.to)}`} action={<Badge tone={STATUS[v.status].tone} dot>{STATUS[v.status].label}</Badge>} />
          <CardBody className="space-y-3 pt-3 text-sm text-ink-600">
            {v.status === "open" && <p>The period runs until {monthEndLabel(v.period.to)}. Once it&apos;s over, file the return and close the period here.</p>}
            {v.status === "nil" && <p>No VAT was charged or claimed in this period: a nil return.</p>}
            {v.status === "due" && <p>The period is over. File the VAT201 on eFiling, then close the period to move its VAT into “VAT due to / from SARS”, ready for the payment or refund.</p>}
            {v.status === "closed" && <p>Closed: its VAT is in “VAT due to / from SARS”.</p>}
            {v.status === "changed" && (
              <p className="text-rose-600">
                {zar(Math.abs(v.pendingPayable))} of VAT ({v.pendingPayable < 0 ? "in your favour" : "payable"}) was posted into this period after it was closed. If the return was
                filed, correct it with SARS; then close the period again to move it.
              </p>
            )}
            {v.journals.length > 0 && (
              <p className="text-xs text-ink-500">
                Closing {v.journals.length === 1 ? "journal" : "journals"}:{" "}
                {v.journals.map((j, i) => (
                  <span key={j.id}>
                    {i > 0 && ", "}
                    <Link href={booksHref(companyId, `journals/${j.id}`)} className="font-medium text-ink-700 underline-offset-2 hover:text-brand-700 hover:underline">
                      #{j.number}
                    </Link>{" "}
                    on {fmtDate(j.date)}
                    {j.late && " (posted late: the month was closed)"}
                  </span>
                ))}
              </p>
            )}
            {canClose && (
              <ConfirmAction
                action={closeVatPeriodAction.bind(null, companyId, v.period.to)}
                label={v.status === "changed" ? "Close the period again" : "Close this VAT period"}
                title={`Close ${label}?`}
                confirmLabel="Close the period"
                variant="primary"
                triggerVariant="dark"
              >
                <p>
                  A journal dated {monthEndLabel(v.period.to)} moves this period&apos;s {zar(v.output)} output tax and {zar(v.input)} input tax into “VAT due to / from SARS” (
                  {zar(Math.abs(v.payable))} {refund ? "refundable" : "payable"}). Anything posted into the period later shows here, to close again.
                </p>
              </ConfirmAction>
            )}
            {!role.approve && v.over && v.status !== "closed" && v.status !== "nil" && <p className="text-xs text-ink-500">The company&apos;s owner closes VAT periods.</p>}
          </CardBody>
        </Card>
      </div>

      {gapMatters && (
        <Notice tone="warn" className="mb-4" title="Check field 1">
          Output tax is {zar(Math.abs(v.outputGap))} {v.outputGap > 0 ? "more" : "less"} than 15% of the standard-rated income below. A few cents is rounding on single sales; more
          usually means VAT charged on supplies that aren&apos;t posted as income (such as the marketing levy, held in the marketing fund). Add those to field 1 before filing.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="overflow-hidden">
          <CardHeader title="VAT201 working" description="Fields as on the SARS VAT201 return" />
          <div className="mt-4">
            <Table minWidth="34rem">
              <thead>
                <tr>
                  <Th>Line</Th>
                  <Th>VAT201 field</Th>
                  <Th align="right">Amount incl VAT</Th>
                  <Th align="right">VAT</Th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r, i) =>
                  r.style === "section" ? (
                    <tr key={i}>
                      <td colSpan={4} className="border-b border-ink-100 bg-ink-50/60 px-5 pb-1.5 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-brand-700">
                        {r.line}
                      </td>
                    </tr>
                  ) : (
                    <tr key={i} className={r.style === "strong" ? "bg-ink-50/70 font-semibold text-ink-950" : undefined}>
                      <Td>{r.line}</Td>
                      <Td className="tnum whitespace-nowrap text-ink-600">{r.field}</Td>
                      {r.amount == null ? <Td /> : <AmountCell cents={r.amount} />}
                      <AmountCell cents={r.vat ?? 0} strong={r.style === "strong"} href={r.field && fieldAccount[r.field] ? ledger(fieldAccount[r.field]) : undefined} />
                    </tr>
                  ),
                )}
              </tbody>
            </Table>
          </div>
        </Card>
        <Card className="h-fit overflow-hidden">
          <CardHeader title="Standard-rated income" description="Income the output tax was charged on, ex VAT" />
          <div className="mt-4">
            <Table>
              <tbody>
                {v.supplies.length === 0 && (
                  <tr>
                    <Td className="text-ink-500">No standard-rated income in this period.</Td>
                  </tr>
                )}
                {v.supplies.map((s) => (
                  <Tr key={s.account.id} href={ledger(s.account.id)}>
                    <Td>
                      <Link href={ledger(s.account.id)} className="text-ink-900 underline-offset-2 hover:text-brand-700 hover:underline">
                        <span className="tnum mr-2 text-ink-500">{s.account.code}</span>
                        {s.account.name}
                      </Link>
                    </Td>
                    <AmountCell cents={s.exVat} />
                  </Tr>
                ))}
                {v.supplies.length > 1 && (
                  <tr className="bg-ink-50/70 font-semibold text-ink-950">
                    <Td>Total ex VAT</Td>
                    <AmountCell cents={v.suppliesEx} />
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Card>
      </div>
      <p className="mt-4 max-w-3xl text-sm text-ink-500">
        A working paper from the books at 15%: check it against your tax invoices before filing on SARS eFiling, where returns and payments are due by the last business day of{" "}
        {monthLabel(addMonths(v.period.to, 1))}. Output and input tax are what was posted to the VAT accounts dated in {label} (to {fmtDate(`${monthEnd(v.period.to)}T12:00:00Z`)});
        closing journals are left out.
      </p>
    </>
  );
}
