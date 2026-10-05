// The bank reconciliation of one account at the end of a day, as a document to print or keep as a PDF: the statement's
// balance, what explains the difference to the books, and anything left unexplained.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBooks } from "@/server/ledger/access";
import { bankAccountOf, reconciliation } from "@/server/ledger/bank";
import { db } from "@/server/db";
import { parseRand, sp1 } from "@/server/store/rules";
import { BANKS, readDay } from "@/lib/bank-import";
import { zar } from "@/lib/money";
import { dayKey, fmtDate, fmtDateTime } from "@/lib/format";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/cn";
import { PageHeader, Notice } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { BackLink } from "@/components/store/ui";
import { PrintButton } from "@/components/shop/print-button";
import { DocLabel, DocumentPrintStyles, Sheet } from "@/components/finance/document";

export const metadata = { title: "Bank reconciliation" };
const day = (d: string) => fmtDate(`${d}T12:00:00Z`);

function Row({ label, note, cents, strong, tone }: { label: React.ReactNode; note?: React.ReactNode; cents: number | null; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <tr className={cn("border-b border-ink-100 align-top", strong && "border-ink-300")}>
      <td className={cn("py-2.5 pr-4", strong ? "font-semibold text-ink-950" : "text-ink-800")}>
        {label}
        {note && <span className="block text-xs font-normal text-ink-500">{note}</span>}
      </td>
      <td className={cn("tnum whitespace-nowrap py-2.5 text-right", strong && "font-semibold", tone === "good" && "text-leaf-700", tone === "bad" && "text-rose-600", !tone && "text-ink-950")}>
        {cents == null ? "—" : zar(cents)}
      </td>
    </tr>
  );
}

export default async function ReconcilePage({ params, searchParams }: { params: Promise<{ companyId: string; bankAccountId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId, bankAccountId }, sp] = await Promise.all([params, searchParams]);
  const { company, user } = await requireBooks(companyId);
  const acct = await bankAccountOf(company.id, bankAccountId);
  if (!acct) notFound();
  const last = await db.bankLine.findFirst({ where: { bankAccountId: acct.id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], select: { date: true } });
  const asked = sp1(sp.on);
  const on = (/^\d{4}-\d{2}-\d{2}$/.test(asked) && readDay(asked)) || (last ? last.date.toISOString().slice(0, 10) : dayKey(new Date()));
  const given = parseRand(sp1(sp.balance));
  const r = (await reconciliation(company.id, acct.id, on, { statementCents: given }))!;
  const path = `/books/${company.id}/bank/${acct.id}`;
  const journal = (id: string) => `/books/${company.id}/journals/${id}`;
  const needsBalance = !!r.start && (r.statement == null || r.statement.asOf == null);
  const reconciled = r.unexplainedCents === 0;

  return (
    <>
      <DocumentPrintStyles />
      <div className="no-print">
        <BackLink href={path}>{acct.name}</BackLink>
        <PageHeader
          overline={`Banking · ${company.name}`}
          title="Bank reconciliation"
          description="The statement's balance against the books' at the end of a day, and what explains the difference: postings not yet through the bank, statement lines still to settle, and where the statements begin. Print it, or save it as a PDF, for the month's file."
          actions={<PrintButton label="Print or save as PDF" />}
        />
        <form method="get" action={`${path}/reconcile`} className="mb-6 flex flex-wrap items-end gap-3">
          <Field label="At the end of" htmlFor="rec-on">
            <Input id="rec-on" name="on" type="date" defaultValue={on} className="w-44" />
          </Field>
          {needsBalance && (
            <Field label="Balance on the statement" htmlFor="rec-balance">
              <Input id="rec-balance" name="balance" inputMode="decimal" defaultValue={sp1(sp.balance)} placeholder="0.00" className="w-44" />
            </Field>
          )}
          <Button type="submit" variant="dark">Show</Button>
        </form>
        {needsBalance && r.statement == null && (
          <Notice tone="warn" className="mb-6">The imported statements carry no balances: enter the balance from the bank statement at this date to reconcile.</Notice>
        )}
      </div>

      <Sheet aria-label={`Bank reconciliation of ${acct.name} at ${day(on)}`}>
        <div className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-brand-500 pb-6">
          <div>
            <div className="eyebrow text-brand-700">Bank reconciliation</div>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-950">{acct.name}</h1>
            <p className="mt-1 text-sm text-ink-700">{company.legalName}</p>
          </div>
          <dl className="space-y-0.5 text-right text-sm text-ink-700">
            <div>
              <dt className="inline text-ink-500">At the end of </dt>
              <dd className="inline font-semibold text-ink-900">{day(on)}</dd>
            </div>
            <div>
              <dt className="inline text-ink-500">Account </dt>
              <dd className="inline">{BANKS[acct.bank as keyof typeof BANKS] ?? acct.bank}, ending {acct.number}</dd>
            </div>
            <div>
              <dt className="inline text-ink-500">In the books as </dt>
              <dd className="inline">{acct.ledgerAccount?.code} {acct.ledgerAccount?.name}</dd>
            </div>
            <div>
              <dt className="inline text-ink-500">Prepared </dt>
              <dd className="inline">{fmtDateTime(new Date())} · {user.name}</dd>
            </div>
            <dd className="pt-2">
              {r.unexplainedCents == null ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">{r.start ? "No statement balance" : "No statement imported"}</span>
              ) : reconciled ? (
                <span className="rounded-full bg-leaf-50 px-2.5 py-0.5 text-xs font-semibold text-leaf-700 ring-1 ring-leaf-100">Reconciled</span>
              ) : (
                <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-600 ring-1 ring-rose-100">{zar(Math.abs(r.unexplainedCents))} unexplained</span>
              )}
            </dd>
          </dl>
        </div>

        {!r.start ? (
          <p className="py-8 text-sm text-ink-600">No statement has been imported to this account yet: import one under Banking, then reconcile.</p>
        ) : (
          <>
            <table className="mt-6 w-full border-collapse text-sm">
              <tbody>
                <Row
                  label="Balance on the statement"
                  note={r.statement?.asOf ? `the balance after the last line of ${day(r.statement.asOf)}${r.statement.later ? `, and ${plural(r.statement.later, "later line")} without a balance` : ""}` : r.statement ? "as read off the statement" : undefined}
                  cents={r.statementCents}
                />
                <Row label={`Add: in the books, not yet on the statement (${r.outstanding.count})`} note="deposits on their way, payments not yet through" cents={r.outstanding.cents} />
                <Row label={`Less: on the statement, not in the books (${r.notInBooks.count})`} note="lines still to match or allocate, and lines set aside" cents={-r.notInBooks.cents} />
                <Row
                  label={`Before ${day(r.start)}: the books less the statement's opening balance`}
                  note={r.openingCents == null ? "the statement's opening balance isn't known" : `opening balance ${zar(r.openingCents)}; the books then ${zar(r.broughtForwardCents)}`}
                  cents={r.openingDiffCents}
                />
                <Row label="Books balance, explained" cents={r.expectedCents} strong />
                <Row label={`Books balance — ${acct.ledgerAccount?.code} ${acct.ledgerAccount?.name}`} cents={r.ledgerCents} strong />
                <Row label="Unexplained difference" cents={r.unexplainedCents} strong tone={r.unexplainedCents == null ? undefined : reconciled ? "good" : "bad"} />
              </tbody>
            </table>
            {!!r.unexplainedCents && (
              <p className="mt-3 text-xs text-ink-600">
                Usually a statement that wasn&apos;t imported (a gap between files), a balance the bank shows differently, or a posting that changed after its line was matched (unmatch the line and match it again).
              </p>
            )}
            {!!r.openingDiffCents && (
              <p className="mt-3 text-xs text-ink-600">
                The books before {day(r.start)} and the statement&apos;s opening balance differ by {zar(Math.abs(r.openingDiffCents))}: usually an opening balance to correct, or a payment from before then that hasn&apos;t gone through yet.
              </p>
            )}

            <section className="mt-8">
              <DocLabel>In the books, not yet on the statement</DocLabel>
              {r.outstanding.count === 0 ? (
                <p className="mt-2 text-sm text-ink-600">Nothing: everything in the books since {day(r.start)} is on the statement.</p>
              ) : (
                <table className="mt-2 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-y border-ink-200 text-left text-[0.68rem] uppercase tracking-[0.12em] text-ink-500">
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Journal</th>
                      <th className="py-2 pr-3 font-semibold">What</th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.outstanding.items.map((o) => (
                      <tr key={o.journalId} className="border-b border-ink-100 align-top">
                        <td className="whitespace-nowrap py-2 pr-3 text-ink-700">{day(o.day)}</td>
                        <td className="whitespace-nowrap py-2 pr-3">
                          <Link href={journal(o.journalId)} className="font-semibold text-ink-900 hover:text-brand-700">{o.number}</Link>
                        </td>
                        <td className="py-2 pr-3 text-ink-800">
                          {o.memo}
                          {o.reversed ? (
                            <span className="block text-xs text-rose-600">reversed since its line was matched — unmatch the line</span>
                          ) : o.matchedCents ? (
                            <span className="block text-xs text-ink-500">{zar(o.matchedCents)} of {zar(o.cents)} through the bank so far</span>
                          ) : null}
                        </td>
                        <td className="tnum whitespace-nowrap py-2 text-right text-ink-950">{zar(o.leftCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="py-2 pr-3 text-xs text-ink-500">
                        {plural(r.outstanding.count, "posting")}
                        {r.outstanding.count > r.outstanding.items.length && ` (the first ${r.outstanding.items.length} listed)`}
                      </td>
                      <td className="tnum whitespace-nowrap py-2 text-right font-semibold text-ink-950">{zar(r.outstanding.cents)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>

            <section className="mt-8">
              <DocLabel>On the statement, not in the books</DocLabel>
              {r.notInBooks.count === 0 ? (
                <p className="mt-2 text-sm text-ink-600">Nothing: every statement line up to {day(on)} is matched or allocated.</p>
              ) : (
                <table className="mt-2 w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-y border-ink-200 text-left text-[0.68rem] uppercase tracking-[0.12em] text-ink-500">
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Line</th>
                      <th className="py-2 pr-3 font-semibold">Why</th>
                      <th className="py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.notInBooks.lines.map((l) => (
                      <tr key={l.id} className="border-b border-ink-100 align-top">
                        <td className="whitespace-nowrap py-2 pr-3 text-ink-700">{day(l.day)}</td>
                        <td className="py-2 pr-3 text-ink-800">
                          {l.description}
                          {l.reference && <span className="block text-xs text-ink-500">Ref {l.reference}</span>}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-ink-600">{l.status === "IGNORED" ? "Set aside" : "Still to do"}</td>
                        <td className="tnum whitespace-nowrap py-2 text-right text-ink-950">{zar(l.amountCents)}</td>
                      </tr>
                    ))}
                    {r.notInBooks.later.map((l) => (
                      <tr key={l.journalId} className="border-b border-ink-100 align-top">
                        <td className="whitespace-nowrap py-2 pr-3 text-ink-700">{day(l.day)}</td>
                        <td className="py-2 pr-3 text-ink-800">
                          {l.description}
                          {l.lines > 1 && <span className="block text-xs text-ink-500">and {plural(l.lines - 1, "more line")}</span>}
                        </td>
                        <td className="py-2 pr-3 text-ink-600">
                          In the books after {day(on)}:{" "}
                          <Link href={journal(l.journalId)} className="font-semibold text-ink-900 hover:text-brand-700">journal {l.number}</Link>
                        </td>
                        <td className="tnum whitespace-nowrap py-2 text-right text-ink-950">{zar(l.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="py-2 pr-3 text-xs text-ink-500">
                        {r.notInBooks.unmatched.count ? `${plural(r.notInBooks.unmatched.count, "line")} still to do` : ""}
                        {r.notInBooks.unmatched.count && r.notInBooks.ignored.count ? " · " : ""}
                        {r.notInBooks.ignored.count ? `${plural(r.notInBooks.ignored.count, "line")} set aside` : ""}
                        {r.notInBooks.unmatched.count + r.notInBooks.ignored.count > r.notInBooks.lines.length && ` (the first ${r.notInBooks.lines.length} listed)`}
                      </td>
                      <td className="tnum whitespace-nowrap py-2 text-right font-semibold text-ink-950">{zar(r.notInBooks.cents)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>

            <div className="mt-12 grid grid-cols-2 gap-10 text-xs text-ink-500">
              <div className="border-t border-ink-300 pt-2">Prepared by</div>
              <div className="border-t border-ink-300 pt-2">Reviewed by</div>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
