import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, Lock, RotateCcw } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { booksChecks, failedPostings, queueCounts, type BooksCheck } from "@/server/ledger/checks";
import { db } from "@/server/db";
import { sourceLabel } from "@/lib/ledger-admin";
import { addMonths, fiscalYearEnd, fiscalYearStart, monthsBetween, periodOf } from "@/lib/ledger";
import { dayKey, fmtMonth, timeAgo } from "@/lib/format";
import { zar } from "@/lib/money";
import { plural } from "@/lib/plural";
import { hrefWith, sp1 } from "@/server/store/rules";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionButton, ConfirmAction } from "@/components/ui/action-form";
import { ReadOnlyNote } from "@/components/store/ui";
import { Flash } from "@/components/hq/flash";
import { cn } from "@/lib/cn";
import { closeMonthAction, reopenMonthAction, retryPostingAction } from "./actions";

export const metadata = { title: "Month end" };
const name = (m: string) => fmtMonth(`${m}-15T12:00:00Z`);
const FAILED_PAGE = 20;

const amount = (c: BooksCheck, cents: number) => (c.unit === "count" ? cents.toLocaleString("en-US") : zar(cents));

/** Month end: the checks for a month, closing it (and everything before it), reopening the last closed month. */
export default async function ClosePage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company, role } = await requireBooks(companyId);
  const now = new Date();
  const current = periodOf(dayKey(now));
  const locked = company.booksLockedThrough;
  const first = await db.journal.findFirst({ where: { companyId }, orderBy: { period: "asc" }, select: { period: true } });
  const nextToClose = locked ? addMonths(locked, 1) : (first?.period ?? current);
  const asked = sp1(sp.month);
  const month = /^\d{4}-\d{2}$/.test(asked) && asked <= current ? asked : nextToClose < current ? nextToClose : current;
  const fyEnd = /^\d{4}-\d{2}$/.test(sp1(sp.fy)) ? sp1(sp.fy) : fiscalYearEnd(month, company.yearEndMonth);
  const thisYear = fiscalYearEnd(current, company.yearEndMonth);
  const months = monthsBetween(fiscalYearStart(fyEnd), fyEnd);
  const hqQueue = company.kind === "FRANCHISOR" && role.approve;
  const [checks, queue, drafts, debits, counts, failed] = await Promise.all([
    booksChecks(companyId, month, now),
    queueCounts(companyId),
    db.journal.count({ where: { companyId, status: "DRAFT", period: { lte: month } } }),
    db.ledgerBalance.groupBy({ by: ["period"], where: { companyId, period: { in: months } }, _sum: { debitCents: true } }),
    db.journal.groupBy({ by: ["period", "status"], where: { companyId, period: { in: months } }, _count: { _all: true } }),
    hqQueue ? failedPostings(pageParam(sp.qpage), FAILED_PAGE) : null,
  ]);
  const failing = checks.filter((c) => !c.ok);
  const base = `/books/${companyId}`;
  const path = `${base}/close`;
  const closable = month < current && (!locked || month > locked);
  const warnings = [
    failing.length ? `${plural(failing.length, "check")} for ${name(month)} ${failing.length === 1 ? "doesn't" : "don't"} agree.` : null,
    queue.waiting ? `${plural(queue.waiting, "posting")} ${queue.waiting === 1 ? "is" : "are"} still waiting to post${queue.failed ? ` (${queue.failed} failed)` : ""}: ${queue.waiting === 1 ? "it lands" : "they land"} in the first open month once these are closed.` : null,
    drafts ? `${plural(drafts, "draft journal")} ${drafts === 1 ? "is" : "are"} dated in these months and can't be approved once they're closed.` : null,
  ].filter((w): w is string => !!w);
  const status = (m: string): [string, Tone] =>
    locked && m <= locked ? ["Closed", "green"] : m === current ? ["This month", "blue"] : m > current ? ["Not started", "neutral"] : !first || m < first.period ? ["Before the books", "neutral"] : ["Ready to close", "amber"];
  const count = (m: string, s: "DRAFT" | "POSTED") => counts.find((c) => c.period === m && c.status === s)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        overline={`Books · ${company.name}`}
        title="Month end"
        description="Check each month against the registers, then close it: nothing posts into a closed month any more. A late change lands in the first open month, marked late."
      />
      <Flash message={sp1(sp.m) || undefined} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title={`Checks for ${name(month)}${month === current ? " so far" : ""}`}
              description={
                failing.length ? `${plural(failing.length, "check")} to look at. Follow the link to find the difference.` : month === current ? "Statement and points checks run once the month is over." : "Everything agrees."
              }
              action={failing.length ? <Badge tone="red" dot>{failing.length} to look at</Badge> : <Badge tone="green" dot>All agree</Badge>}
            />
            <Table minWidth="40rem" className="mt-3">
              <thead>
                <tr>
                  <Th>Check</Th>
                  <Th align="right">Books</Th>
                  <Th align="right" className="hidden sm:table-cell">Expected</Th>
                  <Th align="right">Difference</Th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <Tr key={c.key} href={c.href ?? undefined}>
                    <Td>
                      <div className="flex items-start gap-2">
                        {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />}
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900">
                            <span className="sr-only">{c.ok ? "Agrees: " : "Differs: "}</span>
                            {c.href ? (
                              <Link href={c.href} className="hover:text-brand-700">
                                {c.label}
                              </Link>
                            ) : (
                              c.label
                            )}
                          </div>
                          <div className="text-xs text-ink-500">{c.detail}</div>
                        </div>
                      </div>
                    </Td>
                    <Td align="right" className="text-ink-800">{amount(c, c.actual)}</Td>
                    <Td align="right" className="hidden text-ink-600 sm:table-cell">{amount(c, c.expected)}</Td>
                    <Td align="right" className={cn("font-semibold", c.ok ? "text-ink-500" : "text-rose-600")}>{c.ok ? "—" : amount(c, c.difference)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title={locked && month <= locked ? `${name(month)} is closed` : closable ? `Close ${name(month)}` : `${name(month)} is under way`} />
            <CardBody className="space-y-3 pt-3 text-sm text-ink-700">
              {locked && month <= locked ? (
                <>
                  <p className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-ink-500" aria-hidden />
                    The books are closed through {name(locked)}.
                  </p>
                  {role.approve && month === locked && (
                    <ConfirmAction action={reopenMonthAction.bind(null, companyId)} label={`Reopen ${name(locked)}`} icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />} title={`Reopen ${name(locked)}?`} confirmLabel="Reopen" variant="dark" className="max-w-md">
                      <p>Postings can go into {name(locked)} again until you close it again. Reopening is recorded in the audit log.</p>
                    </ConfirmAction>
                  )}
                  {role.approve && month < locked && <p className="text-xs text-ink-500">Months reopen one at a time, from the last closed one ({name(locked)}).</p>}
                </>
              ) : !closable ? (
                <p>{name(month)} can be closed once it&apos;s over.</p>
              ) : !role.approve ? (
                <ReadOnlyNote>{company.kind === "FRANCHISOR" ? "An HQ administrator" : "The owner"} closes months.</ReadOnlyNote>
              ) : (
                <>
                  <p>
                    Closes every month up to and including {name(month)}
                    {locked ? ` (the books are closed through ${name(locked)} now)` : ""}. Approve or delete drafts first, and import the month&apos;s bank statements.
                  </p>
                  {warnings.length > 0 && (
                    <Notice tone="warn" title="Before you close">
                      <ul className="list-disc space-y-0.5 pl-4">
                        {warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </Notice>
                  )}
                  <ConfirmAction
                    action={closeMonthAction.bind(null, companyId, month)}
                    label={`Close ${name(month)}`}
                    icon={<CalendarCheck className="h-3.5 w-3.5" aria-hidden />}
                    title={`Close the books through ${name(month)}?`}
                    confirmLabel={warnings.length ? "Close anyway" : "Close the month"}
                    variant={warnings.length ? "danger" : "dark"}
                    triggerVariant="primary"
                    size="md"
                    className="max-w-md"
                  >
                    <p>Nothing can post into it afterwards. {warnings.length ? "Some things above still need attention. You can close anyway and correct them in an open month." : "Every check agrees."}</p>
                  </ConfirmAction>
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Months"
            description={`Financial year ${name(fiscalYearStart(fyEnd))} – ${name(fyEnd)}`}
            action={
              <div className="flex gap-1 text-xs font-semibold">
                <Link href={hrefWith(path, { month }, { fy: addMonths(fyEnd, -12) })} className="rounded-full px-2 py-1 text-ink-600 hover:bg-ink-100" aria-label="Previous financial year">
                  ←
                </Link>
                {fyEnd < thisYear && (
                  <Link href={hrefWith(path, { month }, { fy: addMonths(fyEnd, 12) })} className="rounded-full px-2 py-1 text-ink-600 hover:bg-ink-100" aria-label="Next financial year">
                    →
                  </Link>
                )}
              </div>
            }
          />
          <ul className="mt-2 divide-y divide-ink-100 pb-2">
            {months.map((m) => {
              const [label, tone] = status(m);
              const posted = count(m, "POSTED"), waiting = count(m, "DRAFT");
              const moved = Number(debits.find((d) => d.period === m)?._sum.debitCents ?? 0);
              return (
                <li key={m}>
                  <Link href={hrefWith(path, { fy: fyEnd }, { month: m })} aria-current={m === month ? "true" : undefined} className={cn("flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-brand-50/40", m === month && "bg-brand-50/60")}>
                    <span className="min-w-0">
                      <span className="block font-medium text-ink-900">{name(m)}</span>
                      <span className="block text-xs text-ink-500">
                        {posted ? `${plural(posted, "journal")} · ${zar(moved)}` : "No journals"}
                        {waiting ? ` · ${plural(waiting, "draft")}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge tone={tone} dot>{label}</Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-ink-300" aria-hidden />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {failed && (
        <Card className="mt-6" id="failed">
          <CardHeader title="Postings that failed" description="Network-wide: each one stays queued with its reason and was emailed to operations. Fix the cause (usually the source data), then retry." />
          <Table minWidth="48rem" className="mt-3">
            <thead>
              <tr>
                <Th>Source</Th>
                <Th>Reason</Th>
                <Th align="right">Tries</Th>
                <Th className="hidden md:table-cell">Queued</Th>
                <Th align="right">Retry</Th>
              </tr>
            </thead>
            <tbody>
              {failed.rows.length === 0 ? (
                <TableEmpty cols={5} icon={<CheckCircle2 className="h-5 w-5" />} title="Nothing has failed">Every queued posting went through.</TableEmpty>
              ) : (
                failed.rows.map((q) => (
                  <Tr key={`${q.source}:${q.sourceId}`}>
                    <Td>
                      <div className="font-medium text-ink-900">{sourceLabel(q.source)}</div>
                      <div className="font-mono text-xs text-ink-500">{q.sourceId}</div>
                    </Td>
                    <Td className="max-w-md text-xs text-rose-600">
                      <span className="line-clamp-2" title={q.error ?? undefined}>{q.error ?? "—"}</span>
                    </Td>
                    <Td align="right">{q.attempts}</Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">{timeAgo(q.queuedAt)}</Td>
                    <Td align="right">
                      <ActionButton action={retryPostingAction.bind(null, companyId, q.source, q.sourceId)} pendingLabel="Queuing…">
                        Retry
                      </ActionButton>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
          <Pagination page={pageParam(sp.qpage)} pageSize={FAILED_PAGE} total={failed.total} href={(p) => `${hrefWith(path, { month, fy: fyEnd }, { qpage: p })}#failed`} />
        </Card>
      )}
    </>
  );
}
