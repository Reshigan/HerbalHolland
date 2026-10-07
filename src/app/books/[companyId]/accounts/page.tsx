import Link from "next/link";
import { Plus } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { booksFor } from "@/server/ledger/core";
import { db, tx } from "@/server/db";
import { ACCOUNT_TYPES, natural } from "@/lib/ledger-admin";
import { fiscalYearEnd, fiscalYearStart, periodOf } from "@/lib/ledger";
import { dayKey, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";
import { PageHeader } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { InlineEdit } from "@/components/ui/inline-edit";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/ui/action-form";
import { Drawer } from "@/components/store/drawer";
import { ReadOnlyNote } from "@/components/store/ui";
import { Flash } from "@/components/hq/flash";
import { cn } from "@/lib/cn";
import { addAccountAction, renameAccountAction, retypeAccountAction, setAccountActiveAction } from "./actions";

export const metadata = { title: "Chart of accounts" };

const PARTY: Record<string, string> = { SUPPLIER: "Per supplier", TRADE_ACCOUNT: "Per trade account", COMPANY: "Per franchisee" };
const sum = (rows: { accountId: string; _sum: { debitCents: bigint | null; creditCents: bigint | null } }[]) => new Map(rows.map((r) => [r.accountId, Number(r._sum.debitCents ?? 0) - Number(r._sum.creditCents ?? 0)]));

/** The company's chart, by type: this financial year's movement and each balance; added accounts can be renamed, re-typed and switched off. */
export default async function AccountsPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company, role } = await requireBooks(companyId);
  await tx((t) => booksFor(t, companyId));
  const current = periodOf(dayKey(new Date()));
  const fyEnd = fiscalYearEnd(current, company.yearEndMonth);
  const fyStart = fiscalYearStart(fyEnd);
  const [accounts, all, year, before, used] = await Promise.all([
    db.ledgerAccount.findMany({ where: { companyId }, orderBy: { code: "asc" } }),
    db.ledgerBalance.groupBy({ by: ["accountId"], where: { companyId }, _sum: { debitCents: true, creditCents: true } }),
    db.ledgerBalance.groupBy({ by: ["accountId"], where: { companyId, period: { gte: fyStart, lte: fyEnd } }, _sum: { debitCents: true, creditCents: true } }),
    db.ledgerBalance.groupBy({ by: ["accountId"], where: { companyId, period: { lt: fyStart } }, _sum: { debitCents: true, creditCents: true } }),
    db.journalLine.groupBy({ by: ["accountId"], where: { companyId, account: { key: null } }, _count: { _all: true } }),
  ]);
  const total = sum(all), thisYear = sum(year), earlier = sum(before);
  const hasLines = new Set(used.map((u) => u.accountId));
  const type = new Map(accounts.map((a) => [a.id, a.type]));
  // Income and expenses start each financial year at nil: earlier years' profit is carried in retained earnings.
  const carried = [...earlier].filter(([id]) => type.get(id) === "INCOME" || type.get(id) === "EXPENSE").reduce((s, [, c]) => s + c, 0);
  const balance = (a: (typeof accounts)[number]) => (a.type === "INCOME" || a.type === "EXPENSE" ? (thisYear.get(a.id) ?? 0) : (total.get(a.id) ?? 0) + (a.key === "retained" ? carried : 0));
  const base = `/books/${companyId}`;
  const yearLabel = `${fmtMonth(`${fyStart}-15T12:00:00Z`)} – ${fmtMonth(`${fyEnd}-15T12:00:00Z`)}`;

  return (
    <>
      <PageHeader
        overline={`Books · ${company.name}`}
        title="Chart of accounts"
        description={`Every account the books post to. System accounts are used by the automatic postings: rename them freely, but they keep their type and stay on. This financial year: ${yearLabel}.`}
        actions={
          role.write && (
            <Drawer label="Add account" icon={<Plus className="h-4 w-4" aria-hidden />} title="Add an account" description="For manual journals: loans, assets, accruals, extra expense lines">
              <ActionForm action={addAccountAction.bind(null, companyId)} resetOnSuccess className="space-y-4">
                <Field label="Code" htmlFor="acc-code" hint="Four digits: 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5xxx–6xxx expenses">
                  <Input id="acc-code" name="code" inputMode="numeric" maxLength={4} required placeholder="6550" className="tnum w-32" />
                  <FieldError name="code" />
                </Field>
                <Field label="Name" htmlFor="acc-name">
                  <Input id="acc-name" name="name" maxLength={80} required placeholder="Cleaning" />
                  <FieldError name="name" />
                </Field>
                <Field label="Type" htmlFor="acc-type">
                  <Select id="acc-type" name="type" defaultValue="EXPENSE">
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label.replace(/ies$/, "y").replace(/s$/, "")}: {t.hint.toLowerCase()}
                      </option>
                    ))}
                  </Select>
                  <FieldError name="type" />
                </Field>
                <SubmitButton className="w-full" pendingLabel="Adding…">
                  Add account
                </SubmitButton>
              </ActionForm>
            </Drawer>
          )
        }
      />
      <Flash message={sp.m} />
      {!role.write && <ReadOnlyNote className="mb-6">Read-only: the owner and the company&apos;s accountant change the chart.</ReadOnlyNote>}
      <div className="space-y-6">
        {ACCOUNT_TYPES.map((t) => {
          const rows = accounts.filter((a) => a.type === t.type);
          if (!rows.length) return null;
          return (
            <Card key={t.type}>
              <CardHeader title={t.label} description={t.hint} className="pb-3" />
              <Table stickyFirst minWidth="44rem">
                <thead>
                  <tr>
                    <Th className="w-20">Code</Th>
                    <Th>Account</Th>
                    <Th align="right">This year</Th>
                    <Th align="right">Balance</Th>
                    {role.write && <Th align="right">Actions</Th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const bal = balance(a);
                    const moved = thisYear.get(a.id) ?? 0;
                    return (
                      <Tr key={a.id} href={`${base}/reports/ledger?account=${a.id}`} className={a.active ? undefined : "opacity-60"}>
                        <Td>
                          <Link href={`${base}/reports/ledger?account=${a.id}`} className="tnum font-semibold text-ink-900 hover:text-brand-700" title="Open the account's ledger">
                            {a.code}
                          </Link>
                        </Td>
                        <Td>
                          {role.write ? (
                            <InlineEdit
                              action={renameAccountAction.bind(null, companyId, a.id)}
                              fields={[{ name: "name", label: `Name of account ${a.code}`, value: a.name, width: "w-56", maxLength: 80 }]}
                              display={<span className="whitespace-nowrap font-medium text-ink-900">{a.name}</span>}
                              editLabel={`Rename account ${a.code}`}
                              saveLabel="Save name"
                            />
                          ) : (
                            <span className="whitespace-nowrap font-medium text-ink-900">{a.name}</span>
                          )}
                          <div className="mt-0.5 flex flex-wrap gap-1.5">
                            {a.key && <Badge tone="neutral">System</Badge>}
                            {a.party && <Badge tone="blue">{PARTY[a.party] ?? a.party}</Badge>}
                            {!a.active && <Badge tone="amber">Switched off</Badge>}
                            {a.key === "retained" && carried !== 0 && <span className="text-xs text-ink-500">incl. {zar(-carried)} profit from earlier years</span>}
                          </div>
                        </Td>
                        <Td align="right" className="text-ink-600">{moved ? zar(natural(a.type, moved)) : "—"}</Td>
                        <Td align="right" className={cn("font-semibold", natural(a.type, bal) < 0 ? "text-rose-600" : "text-ink-950")}>{bal ? zar(natural(a.type, bal)) : "—"}</Td>
                        {role.write && (
                          <Td align="right">
                            {!a.key && (
                              <div className="flex flex-wrap items-start justify-end gap-2">
                                {!hasLines.has(a.id) && a.active && (
                                  <ConfirmAction action={retypeAccountAction.bind(null, companyId, a.id)} label="Change type" title={`Change the type of ${a.code} ${a.name}?`} confirmLabel="Change type" variant="dark" className="min-w-64 text-left">
                                    <Field label="Type" htmlFor={`type-${a.id}`}>
                                      <Select id={`type-${a.id}`} name="type" defaultValue={a.type}>
                                        {ACCOUNT_TYPES.map((x) => (
                                          <option key={x.type} value={x.type}>
                                            {x.label.replace(/ies$/, "y").replace(/s$/, "")}
                                          </option>
                                        ))}
                                      </Select>
                                      <FieldError name="type" />
                                    </Field>
                                  </ConfirmAction>
                                )}
                                {a.active && !total.get(a.id) && (
                                  <ConfirmAction action={setAccountActiveAction.bind(null, companyId, a.id, false)} label="Switch off" title={`Switch off ${a.code} ${a.name}?`} confirmLabel="Switch off" className="min-w-64 text-left">
                                    <p>It disappears from the new-journal form. Its history stays, and you can switch it back on.</p>
                                  </ConfirmAction>
                                )}
                                {!a.active && (
                                  <ActionButton action={setAccountActiveAction.bind(null, companyId, a.id, true)} pendingLabel="Switching on…">
                                    Switch on
                                  </ActionButton>
                                )}
                              </div>
                            )}
                          </Td>
                        )}
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-ink-500">
        Balances read the way each account normally runs: assets and expenses as debits, the rest as credits (red when the other way round). Income and expense accounts show this financial year only; earlier years are in retained earnings.
      </p>
    </>
  );
}
