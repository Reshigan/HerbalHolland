import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Pencil, Scale, Sparkles, Upload } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { allocationChoices, bankAccountOf, bankAccountsOf, bankLinePage, LINE_FILTERS, statementFiles, STATUS_LABEL, type BankLineRow, type LineFilter } from "@/server/ledger/bank";
import { db } from "@/server/db";
import { hrefWith, sp1 } from "@/server/store/rules";
import { BANKS, FORMATS, STATEMENT_MAX_BYTES } from "@/lib/bank-import";
import { zar, zarCompact } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtDay } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState, Notice } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge, type Tone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { BackLink, Chips, ReadOnlyNote } from "@/components/store/ui";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { Drawer } from "@/components/store/drawer";
import { Flash } from "@/components/hq/flash";
import { AccountForm } from "../account-form";
import { ImportForm } from "../import-form";
import { importBankStatement } from "../actions";
import { AllocateForm } from "./allocate-form";
import { ScrollTo } from "./scroll-to";
import { allocate, editBankAccount, ignore, matchNow, matchTo, restore, setAccountOpen, unallocate, unmatch } from "./actions";

export const metadata = { title: "Bank account" };
const PAGE_SIZE = 25;
const TONE: Record<BankLineRow["status"], Tone> = { UNMATCHED: "amber", MATCHED: "green", ALLOCATED: "blue", IGNORED: "neutral" };
const day = (d: string) => fmtDate(`${d}T12:00:00Z`);

function Money({ cents }: { cents: number }) {
  return <span className={cn("font-semibold", cents > 0 ? "text-leaf-700" : "text-ink-900")}>{cents > 0 ? "+" : "−"}{zar(Math.abs(cents))}</span>;
}

/** One bank account's statement lines, to work through: match, allocate or ignore what's to do. */
export default async function BankAccountPage({ params, searchParams }: { params: Promise<{ companyId: string; bankAccountId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId, bankAccountId }, sp] = await Promise.all([params, searchParams]);
  const { company, role } = await requireBooks(companyId);
  const acct = await bankAccountOf(company.id, bankAccountId);
  if (!acct) notFound();
  let filter = (Object.keys(LINE_FILTERS) as LineFilter[]).find((f) => f === sp1(sp.show)) ?? "todo";
  let page = pageParam(sp.page);
  // ?line= (from a journal, or "Allocate…") opens the list and page that hold the line.
  const focus = sp1(sp.line);
  const asked = focus && !sp.show && !sp.page ? await db.bankLine.findFirst({ where: { id: focus, bankAccountId: acct.id, companyId: company.id }, select: { status: true, date: true, createdAt: true } }) : null;
  if (asked) {
    const todo = asked.status === "UNMATCHED";
    filter = todo ? "todo" : "all";
    const same = { date: asked.date, createdAt: todo ? { lt: asked.createdAt } : { gt: asked.createdAt } };
    const before = await db.bankLine.count({ where: { bankAccountId: acct.id, ...(todo && { status: "UNMATCHED" as const }), OR: [{ date: todo ? { lt: asked.date } : { gt: asked.date } }, same] } });
    page = Math.floor(before / PAGE_SIZE) + 1;
  }
  const path = `/books/${company.id}/bank/${acct.id}`;
  const journal = (id: string) => `/books/${company.id}/journals/${id}`;
  const [{ total, counts, rows }, summary, files, stores] = await Promise.all([
    bankLinePage(company.id, acct, filter, page, PAGE_SIZE),
    bankAccountsOf(company.id).then((all) => all.find((a) => a.id === acct.id)!),
    statementFiles(company.id, acct.id),
    db.store.findMany({ where: { companyId: company.id, status: { not: "CLOSED" } }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const opened = role.write ? rows.find((r) => r.id === focus && r.status === "UNMATCHED") : undefined;
  // The list a line is settled from, to come back to (its filter and page).
  const view = new URLSearchParams({ ...(filter !== "todo" && { show: filter }), ...(page > 1 && { page: String(page) }) }).toString();
  const choices = opened ? await allocationChoices(company.id, acct) : null;
  const cols = role.write ? 5 : 4;

  return (
    <>
      <BackLink href={`/books/${company.id}/bank`}>Banking</BackLink>
      <PageHeader
        overline={`Banking · ${company.name}`}
        title={acct.name}
        description={`${BANKS[acct.bank as keyof typeof BANKS] ?? acct.bank}, ending ${acct.number}${acct.store ? ` · ${acct.store.name}` : ""} · in the books as ${acct.ledgerAccount?.code} ${acct.ledgerAccount?.name}${acct.ledgerAccount?.key === "bank" ? ", where deposits and payments post" : ""}.`}
        actions={
          <>
            <ButtonLink href={`${path}/reconcile`} variant="outline" size="sm">
              <Scale className="h-4 w-4" strokeWidth={1.9} aria-hidden /> Reconcile
            </ButtonLink>
            {role.write && acct.active && (
              <Drawer label="Import" icon={<Upload className="h-4 w-4" aria-hidden />} title="Import a statement" description={`Into ${acct.name}: lines already imported are skipped`} size="sm">
                <ImportForm action={importBankStatement.bind(null, company.id, acct.id)} formats={Object.entries(FORMATS)} maxBytes={STATEMENT_MAX_BYTES} idPrefix="acct-imp" />
              </Drawer>
            )}
            {role.write && (
              <Drawer label="Edit" icon={<Pencil className="h-4 w-4" aria-hidden />} title={`Edit ${acct.name}`} variant="ghost" size="sm">
                <AccountForm action={editBankAccount.bind(null, company.id, acct.id)} stores={stores} defaults={{ name: acct.name, number: acct.number, storeId: acct.storeId }} />
                <div className="mt-6 border-t border-ink-150 pt-5">
                  <ConfirmAction
                    action={setAccountOpen.bind(null, company.id, acct.id, !acct.active)}
                    label={acct.active ? "Close this account" : "Reopen this account"}
                    title={acct.active ? `Close ${acct.name}?` : `Reopen ${acct.name}?`}
                    confirmLabel={acct.active ? "Close it" : "Reopen it"}
                    variant={acct.active ? "danger" : "dark"}
                  >
                    {acct.active ? "Nothing more can be imported to it. Its statement lines and postings stay in the books." : "Statements can be imported to it again."}
                  </ConfirmAction>
                </div>
              </Drawer>
            )}
          </>
        }
      />
      <Flash message={sp1(sp.m) || undefined} />
      {focus && rows.some((r) => r.id === focus) && <ScrollTo id={`line-${focus}`} />}
      {!acct.active && <Notice tone="warn" className="mb-6">This bank account is closed: nothing more is imported to it.</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Books balance" value={zarCompact(summary.ledgerCents)} sub={`${acct.ledgerAccount?.code} ${acct.ledgerAccount?.name}`} />
        <Stat label="Statement balance" value={summary.statement ? zarCompact(summary.statement.cents) : "—"} sub={summary.statement?.asOf ? `at ${day(summary.statement.asOf)}` : summary.lines ? "the files carry no balances" : "nothing imported yet"} />
        <Stat label="To do" value={<span className={summary.todo ? "text-amber-700" : "text-leaf-700"}>{summary.todo.toLocaleString()}</span>} sub={summary.todo ? `${zar(summary.todoCents)} net` : "all settled"} />
        <Stat label="Statement lines" value={summary.lines.toLocaleString()} sub={summary.lastImport ? `last import ${fmtDateTime(summary.lastImport)}` : "import a statement to start"} />
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
          <Chips
            label="Statement lines"
            current={filter}
            items={(Object.keys(LINE_FILTERS) as LineFilter[]).map((f) => ({ key: f, label: LINE_FILTERS[f], count: counts[f], tone: f === "todo" && counts.todo ? ("amber" as const) : undefined, href: hrefWith(path, {}, { show: f === "todo" ? null : f }) }))}
          />
          {role.write && counts.todo > 0 && (
            <ActionButton action={matchNow.bind(null, company.id, acct.id, view)} pendingLabel="Matching…" title="Match the lines that fit exactly one posting in the books">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Match automatically
            </ActionButton>
          )}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" aria-hidden />} title={filter === "todo" && counts.all ? "Nothing to do" : counts.all ? `No ${LINE_FILTERS[filter].toLowerCase()} lines` : "No statement lines yet"}>
            {filter === "todo" && counts.all
              ? "Every imported line is matched, allocated or ignored. Reconcile to check the balances agree."
              : counts.all
                ? "Nothing in this list right now."
                : "Import the account's statement (CSV or OFX from online banking) and its lines show here."}
          </EmptyState>
        ) : (
          <Table stickyFirst density="comfortable" minWidth={role.write ? "60rem" : "48rem"}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>On the statement</Th>
                <Th align="right">Amount</Th>
                <Th>In the books</Th>
                {role.write && <Th align="right">Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <LineRow key={r.id} r={r} write={role.write} companyId={company.id} acctId={acct.id} path={path} sp={sp} view={view} journal={journal} open={opened?.id === r.id} focused={r.id === focus}>
                  {opened?.id === r.id && choices && (
                    <tr>
                      <td colSpan={cols} className="border-b border-ink-100 bg-ink-50/70 px-5 py-5">
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                          <div>
                            <h3 className="font-display text-sm font-semibold text-ink-900">Match to a journal</h3>
                            <p className="mt-0.5 text-xs text-ink-500">
                              When it&apos;s in the books already but not as one amount (say, one of a day&apos;s PayShap payments, which post with the day&apos;s trading). The journal&apos;s number is on its page under Journals.
                            </p>
                            <ActionForm action={matchTo.bind(null, company.id, acct.id, r.id, null, view)} className="mt-3" notices="bottom" aria-label="Match to a journal by number">
                              <div className="flex items-end gap-2">
                                <Field label="Journal number" htmlFor={`jn-${r.id}`}>
                                  <Input id={`jn-${r.id}`} name="number" inputMode="numeric" className="w-36" required autoComplete="off" placeholder="e.g. 1042" />
                                </Field>
                                <SubmitButton variant="dark" pendingLabel="Matching…">Match</SubmitButton>
                              </div>
                              <FieldError name="number" />
                            </ActionForm>
                          </div>
                          <div>
                            <h3 className="font-display text-sm font-semibold text-ink-900">Allocate</h3>
                            <p className="mt-0.5 mb-3 text-xs text-ink-500">
                              Posts a journal for it: {acct.name} against the account you choose (bank charges, interest, a SARS payment or a transfer to another of the company&apos;s accounts).
                            </p>
                            <AllocateForm
                              action={allocate.bind(null, company.id, acct.id, r.id, view)}
                              accounts={choices.accounts}
                              stores={choices.stores}
                              storeId={acct.storeId}
                              vendor={choices.vendor}
                              gateway={choices.gateway}
                              amountCents={r.amountCents}
                              description={r.description}
                            />
                          </div>
                        </div>
                        <Link href={hrefWith(path, sp, { line: null, m: null })} className="mt-4 inline-block text-xs font-semibold text-ink-500 hover:text-ink-900">
                          Close
                        </Link>
                      </td>
                    </tr>
                  )}
                </LineRow>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p, line: null, m: null })} />
      </Card>

      {files.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Statement files" description="The files imported to this account, newest first, kept as they were uploaded." />
          <Table className="mt-4">
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Imported</Th>
                <Th>Covers</Th>
                <Th align="right">Lines added</Th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <Tr key={f.id}>
                  <Td>
                    <a href={`${path}/files/${f.id}`} className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-ink-900 hover:text-brand-700">
                      <Download className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                      {f.fileName}
                    </a>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">
                    {fmtDateTime(f.createdAt)}
                    {f.by && <span className="text-ink-500"> · {f.by}</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">{f.from && f.to ? (f.from === f.to ? day(f.from) : `${fmtDay(`${f.from}T12:00:00Z`)} – ${day(f.to)}`) : "—"}</Td>
                  <Td align="right">{f.lines.toLocaleString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {!role.write && <ReadOnlyNote className="mt-4">You can look: the owner and the company&apos;s accountant match, allocate and import.</ReadOnlyNote>}
    </>
  );
}

function LineRow({ r, write, companyId, acctId, path, sp, view, journal, open, focused, children }: {
  r: BankLineRow;
  write: boolean;
  companyId: string;
  acctId: string;
  path: string;
  sp: Record<string, string | string[] | undefined>;
  view: string;
  journal: (id: string) => string;
  open: boolean;
  focused: boolean;
  children?: React.ReactNode;
}) {
  return (
    <>
      <Tr id={`line-${r.id}`} className={cn("scroll-mt-24 align-top target:bg-brand-50", (open || focused) && "bg-brand-50/50")}>
        <Td className="whitespace-nowrap text-ink-800">{day(r.day)}</Td>
        <Td className="min-w-56">
          <div className="font-medium text-ink-900">{r.description}</div>
          {r.reference && <div className="text-xs text-ink-500">Ref {r.reference}</div>}
          {r.balanceCents != null && <div className="tnum text-xs text-ink-500">Balance {zar(Number(r.balanceCents))}</div>}
        </Td>
        <Td align="right">
          <Money cents={r.amountCents} />
        </Td>
        <Td className="min-w-64">
          <Badge tone={TONE[r.status]} dot>{STATUS_LABEL[r.status]}</Badge>
          {r.journal && (
            <div className="mt-1 text-xs text-ink-600">
              <Link href={journal(r.journal.id)} className="font-semibold text-brand-700 hover:underline">Journal {r.journal.number}</Link>
              {r.status === "ALLOCATED" ? ` · to ${r.journal.to.join(", ") || "—"}` : ` · ${r.journal.memo} · ${fmtDay(`${r.journal.day}T12:00:00Z`)}`}
            </div>
          )}
          {r.status !== "UNMATCHED" && r.matchedAt && (
            <div className="text-xs text-ink-500">
              {r.by ? `by ${r.by}` : "by itself"} · {fmtDate(r.matchedAt)}
            </div>
          )}
          {r.status === "UNMATCHED" &&
            (r.suggestions.length ? (
              <ul className="mt-1.5 space-y-1.5" aria-label="Could be">
                {r.suggestions.map((s) => (
                  <li key={s.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-600">
                    <span>
                      {s.part && "Part of "}
                      <Link href={journal(s.journalId)} className="font-semibold text-ink-800 hover:text-brand-700">{s.part ? "journal" : "Journal"} {s.number}</Link> · {fmtDay(`${s.date}T12:00:00Z`)} · {s.memo}
                      {(s.part || s.leftCents !== s.cents) && <span className="text-ink-500"> ({zar(s.leftCents)}{s.leftCents !== s.cents ? ` of ${zar(s.cents)}` : ""} left)</span>}
                    </span>
                    {write && (
                      <ActionButton action={matchTo.bind(null, companyId, acctId, r.id, s.journalId, view)} pendingLabel="Matching…" title={`Match to journal ${s.number}`}>
                        Match
                      </ActionButton>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-xs text-ink-500">Nothing in the books has this amount near this date.</div>
            ))}
        </Td>
        {write && (
          <Td align="right" className="min-w-52">
            <div className="flex flex-wrap justify-end gap-2">
              {r.status === "UNMATCHED" && (
                <>
                  {!open && (
                    <ButtonLink href={`${hrefWith(path, sp, { line: r.id, m: null })}#line-${r.id}`} variant="dark" size="sm">
                      Allocate…
                    </ButtonLink>
                  )}
                  <ConfirmAction action={ignore.bind(null, companyId, acctId, r.id, view)} label="Ignore" triggerVariant="ghost" title="Ignore this line?" confirmLabel="Ignore it" variant="dark" className="min-w-64 text-left">
                    <p>For a line that isn&apos;t a transaction of the books: a duplicate from another download, a payment and its reversal, or something already in the opening balance.</p>
                    <Field label="Why (optional)" htmlFor={`why-${r.id}`}>
                      <Input id={`why-${r.id}`} name="reason" maxLength={200} placeholder="e.g. Reversed the next day" />
                    </Field>
                  </ConfirmAction>
                </>
              )}
              {r.status === "MATCHED" && (
                <ConfirmAction action={unmatch.bind(null, companyId, acctId, r.id, view)} label="Unmatch" title="Unmatch this line?" confirmLabel="Unmatch" variant="dark" className="min-w-64 text-left">
                  It goes back on the to-do list; nothing in the books changes.
                </ConfirmAction>
              )}
              {r.status === "ALLOCATED" && (
                <ConfirmAction action={unallocate.bind(null, companyId, acctId, r.id, view)} label="Undo" title="Take the allocation back?" confirmLabel="Reverse it" className="min-w-64 text-left">
                  Journal {r.journal?.number} is reversed (in the first open month, if its own is closed) and the line goes back on the to-do list.
                </ConfirmAction>
              )}
              {r.status === "IGNORED" && (
                <ActionButton action={restore.bind(null, companyId, acctId, r.id, view)} pendingLabel="Restoring…">
                  Restore
                </ActionButton>
              )}
            </div>
          </Td>
        )}
      </Tr>
      {children}
    </>
  );
}
