import Link from "next/link";
import { Download, KeyRound, UserMinus, UserPlus } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { accountantsOf, openingJournals } from "@/server/ledger/admin";
import { VAT_CATEGORIES, addMonths, monthEnd, periodOf } from "@/lib/ledger";
import { dayKey, fmtDate, timeAgo } from "@/lib/format";
import { sp1 } from "@/server/store/rules";
import { MONTH_NAMES } from "@/lib/ledger-admin";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, Detail } from "@/components/ui/misc";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { ReadOnlyNote } from "@/components/store/ui";
import { Flash } from "@/components/hq/flash";
import { addAccountantAction, importOpeningAction, resetAccountantPasswordAction, saveSettingsAction, setAccountantActiveAction } from "./actions";

export const metadata = { title: "Books settings" };

/** VAT category and year end, the company's accountants, and the opening balances. */
export default async function BooksSettingsPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company, role } = await requireBooks(companyId);
  const [accountants, opening] = await Promise.all([accountantsOf(companyId), openingJournals(companyId)]);
  const base = `/books/${companyId}`;
  const vendor = !!company.vatNumber;
  const approver = company.kind === "FRANCHISOR" ? "an HQ administrator" : "the owner";
  const vatLabel = VAT_CATEGORIES.find((c) => c.key === company.vatCategory)?.label;

  return (
    <>
      <PageHeader overline={`Books · ${company.name}`} title="Settings" description="How the books are kept: the VAT category and financial year, who keeps them, and where they start." />
      <Flash message={sp1(sp.m) || undefined} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="h-fit">
          <CardHeader title="VAT and financial year" description={vendor ? `VAT number ${company.vatNumber}` : "Not a VAT vendor (no VAT number)"} />
          <CardBody>
            {role.approve ? (
              <ActionForm action={saveSettingsAction.bind(null, companyId)} className="space-y-4">
                <Field label="VAT category" htmlFor="vatCategory" hint={vendor ? "The category on your SARS VAT registration: it sets the VAT periods." : `${company.name} has no VAT number, so it charges no VAT and files no VAT201.`}>
                  {vendor ? (
                    <Select id="vatCategory" name="vatCategory" defaultValue={company.vatCategory ?? ""}>
                      <option value="">Choose…</option>
                      {VAT_CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <>
                      <input type="hidden" name="vatCategory" value="" />
                      <Select id="vatCategory" disabled defaultValue="">
                        <option value="">None (not a VAT vendor)</option>
                      </Select>
                    </>
                  )}
                  <FieldError name="vatCategory" />
                </Field>
                <Field label="Financial year ends in" htmlFor="yearEndMonth" hint="February is the usual South African year end. Each year's profit carries into retained earnings from here.">
                  <Select id="yearEndMonth" name="yearEndMonth" defaultValue={String(company.yearEndMonth)}>
                    {MONTH_NAMES.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </Select>
                  <FieldError name="yearEndMonth" />
                </Field>
                <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
              </ActionForm>
            ) : (
              <>
                <dl className="divide-y divide-ink-100">
                  <Detail label="VAT category">{vendor ? (vatLabel ?? "Not set yet") : "None (not a VAT vendor)"}</Detail>
                  <Detail label="Financial year ends">{MONTH_NAMES[company.yearEndMonth - 1]}</Detail>
                </dl>
                <ReadOnlyNote className="mt-3">{company.kind === "FRANCHISOR" ? "An HQ administrator" : "The owner"} changes these.</ReadOnlyNote>
              </>
            )}
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Accountants" description={`They see and work in these books only: no stores, tills or HQ pages. Their journals wait as drafts for ${approver}.`} />
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Person</Th>
                <Th className="hidden sm:table-cell">Last sign-in</Th>
                <Th align="right">{role.approve ? "Actions" : "Status"}</Th>
              </tr>
            </thead>
            <tbody>
              {accountants.length === 0 ? (
                <TableEmpty cols={3} icon={<UserPlus className="h-5 w-5" />} title="No accountant yet">
                  {role.approve ? "Add the person who keeps the books: they get a temporary password to sign in with." : "Nobody keeps these books as an accountant yet."}
                </TableEmpty>
              ) : (
                accountants.map((a) => (
                  <Tr key={a.id} className={a.active ? undefined : "opacity-60"}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={a.name} />
                        <div className="min-w-0">
                          <div className="font-medium text-ink-900">{a.name}</div>
                          <div className="truncate text-xs text-ink-500">{a.email}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 sm:table-cell">
                      {a.lastLoginAt ? timeAgo(a.lastLoginAt) : <span className="text-ink-500">Never</span>}
                      <span className="block text-xs text-ink-500">added {fmtDate(a.createdAt)}</span>
                    </Td>
                    <Td align="right">
                      {!role.approve ? (
                        <Badge tone={a.active ? "green" : "neutral"} dot>
                          {a.active ? "Active" : "Deactivated"}
                        </Badge>
                      ) : a.active ? (
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          <ConfirmAction action={resetAccountantPasswordAction.bind(null, companyId, a.id)} label="Reset password" icon={<KeyRound className="h-3.5 w-3.5" aria-hidden />} triggerVariant="ghost" variant="dark" title={`Reset ${a.name}'s password?`} confirmLabel="Reset password" className="max-w-xs text-left">
                            <p>They&apos;re signed out everywhere and get a new temporary password, shown here once.</p>
                          </ConfirmAction>
                          <ConfirmAction action={setAccountantActiveAction.bind(null, companyId, a.id, false)} label="Deactivate" icon={<UserMinus className="h-3.5 w-3.5" aria-hidden />} title={`Deactivate ${a.name}?`} confirmLabel="Deactivate" className="max-w-xs text-left">
                            <p>They&apos;re signed out straight away and can&apos;t sign in. Their journals and history stay.</p>
                          </ConfirmAction>
                        </div>
                      ) : (
                        <ActionButton action={setAccountantActiveAction.bind(null, companyId, a.id, true)} pendingLabel="Restoring…">
                          Reactivate
                        </ActionButton>
                      )}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
          {role.approve && (
            <CardBody className="border-t border-ink-100">
              <ActionForm action={addAccountantAction.bind(null, companyId)} resetOnSuccess className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start" aria-label="Add an accountant">
                <Field label="Full name" htmlFor="acc-name">
                  <Input id="acc-name" name="name" autoComplete="off" maxLength={80} required />
                  <FieldError name="name" />
                </Field>
                <Field label="Email" htmlFor="acc-email">
                  <Input id="acc-email" name="email" type="email" autoComplete="off" maxLength={120} required placeholder="books@example.co.za" />
                  <FieldError name="email" />
                </Field>
                <SubmitButton className="sm:mt-6" pendingLabel="Adding…">
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Add accountant
                </SubmitButton>
              </ActionForm>
            </CardBody>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Opening balances"
            description="Where these books start: the trial balance from your old system at the day before you began here."
            action={
              <Link href={`${base}/settings/opening-template`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline" prefetch={false}>
                <Download className="h-3.5 w-3.5" aria-hidden />
                Template: your chart as CSV
              </Link>
            }
          />
          <CardBody className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3 text-sm text-ink-700">
              <p>
                One row per balance: the <strong>account</strong> code, a <strong>debit</strong> or a <strong>credit</strong>, and where it applies the <strong>party</strong> (the supplier on trade creditors{company.kind === "FRANCHISOR" ? ", the trade account number on trade debtors, the franchisee on franchisee accounts" : ""}) and the <strong>store</strong> code (stock per store). Other columns, like the account name, are ignored.
              </p>
              <p>The debits must equal the credits, and the stock should equal the opening stock take. {role.approve ? "It posts straight away." : `It's saved as a draft for ${approver} to approve.`}</p>
              {opening.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-ink-50 px-4 py-3 text-xs">
                  {opening.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-3">
                      <Link href={`${base}/journals/${j.id}`} className="font-semibold text-brand-700 hover:underline">
                        Journal {j.number} · {fmtDate(j.date)}
                      </Link>
                      <Badge tone={j.status === "DRAFT" ? "amber" : "green"} dot>
                        {j.status === "DRAFT" ? "Waiting for approval" : "Posted"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {role.write ? (
              <ActionForm action={importOpeningAction.bind(null, companyId)} className="space-y-4" aria-label="Import opening balances">
                <Field label="Trial balance (CSV)" htmlFor="ob-file" hint="Comma or semicolon separated, up to 1 MB">
                  <input
                    id="ob-file"
                    name="file"
                    type="file"
                    accept=".csv,text/csv"
                    required
                    className="block w-full rounded-xl text-sm text-ink-700 file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-ink-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/15"
                  />
                  <FieldError name="file" />
                </Field>
                <Field label="Balances at" htmlFor="ob-date" hint="Usually the day before you started on the platform; it must be in an open month">
                  <Input id="ob-date" name="date" type="date" defaultValue={monthEnd(addMonths(periodOf(dayKey(new Date())), -1))} required className="w-48" />
                  <FieldError name="date" />
                </Field>
                {opening.length > 0 && (
                  <div>
                    <Checkbox name="add" label="Add to the opening balances already in" description="For balances you left out. To start over, reverse the opening journal first." />
                    <FieldError name="addToExisting" />
                  </div>
                )}
                <SubmitButton pendingLabel="Importing…">{role.approve ? "Import and post" : "Import as a draft"}</SubmitButton>
              </ActionForm>
            ) : (
              <ReadOnlyNote className="h-fit">The owner and the company&apos;s accountant import the opening balances.</ReadOnlyNote>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
