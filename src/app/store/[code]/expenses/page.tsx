import { Receipt, Trash2 } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { hrefWith, plural, sp1 } from "@/server/store/rules";
import { resolveRange } from "@/lib/ranges";
import { zar, zarCompact } from "@/lib/money";
import { dayKey, fmtDate } from "@/lib/format";
import { addExpense, deleteExpense } from "./actions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { RangeTabs } from "@/components/ui/range-tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { BarList } from "@/components/charts/bar-list";
import { Chips, ReadOnlyNote } from "@/components/store/ui";
import { Select } from "@/components/store/select";
import { ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/store/action-form";
import type { ExpenseCategory } from "@/generated/prisma/client";

export const metadata = { title: "Expenses" };
const PAGE_SIZE = 25;
const LABEL: Record<ExpenseCategory, string> = { RENT: "Rent", SALARIES: "Salaries & wages", UTILITIES: "Utilities", SECURITY: "Security", MARKETING: "Local marketing", SUPPLIES: "Supplies", BANK_FEES: "Bank & card fees", OTHER: "Other" };

export default async function ExpensesPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/expenses`;
  const r = resolveRange({ range: sp1(sp.range), from: sp1(sp.from), to: sp1(sp.to) }, "mtd");
  const cat = sp1(sp.cat) in LABEL ? (sp1(sp.cat) as ExpenseCategory) : null;
  const page = pageParam(sp.page);
  const inRange = { storeId: store.id, date: { gte: r.start, lt: r.end } };
  const where = { ...inRange, ...(cat && { category: cat }) };
  const [total, rows, byCat, sum] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.expense.groupBy({ by: ["category"], where: inRange, _sum: { amountCents: true, vatCents: true }, _count: true }),
    db.expense.aggregate({ where, _sum: { amountCents: true, vatCents: true } }),
  ]);
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((x) => x.createdById).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
  const who = new Map(users.map((u) => [u.id, u.name]));
  const allIncl = byCat.reduce((s, c) => s + (c._sum.amountCents ?? 0), 0);
  const allVat = byCat.reduce((s, c) => s + (c._sum.vatCents ?? 0), 0);
  const vendor = !!store.company.vatNumber;

  return (
    <>
      <PageHeader
        overline={`Money · ${store.name}`}
        title="Expenses"
        description="Capture the running costs of the store from each supplier invoice. They feed your P&L and, when VAT is claimable, your VAT201 input tax."
        actions={<RangeTabs path={path} current={r.preset} params={{ cat: cat ?? undefined }} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Spent, incl. VAT" value={zarCompact(allIncl)} sub={`${r.from} to ${r.to}`} />
        <Stat label="Ex VAT (P&L)" value={zarCompact(allIncl - allVat)} sub="what the P&L shows" />
        <Stat label="Input VAT claimable" value={zar(allVat)} sub={vendor ? "goes to your VAT201" : "not VAT-registered"} />
        <Stat label="Invoices captured" value={byCat.reduce((s, c) => s + c._count, 0).toLocaleString()} sub="in this period" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <div className="border-b border-ink-100 p-4 sm:px-5">
            <Chips
              label="Category"
              current={cat ?? "ALL"}
              items={[
                { key: "ALL", label: "All", count: byCat.reduce((s, c) => s + c._count, 0), href: hrefWith(path, sp, { cat: null, page: null }) },
                ...byCat.sort((a, b) => (b._sum.amountCents ?? 0) - (a._sum.amountCents ?? 0)).map((c) => ({ key: c.category, label: LABEL[c.category], count: c._count, href: hrefWith(path, sp, { cat: c.category, page: null }) })),
              ]}
            />
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<Receipt className="h-5 w-5" />} title="No expenses in this period">
              Add supplier invoices as they come in so your P&L stays current.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Expense</Th>
                  <Th align="right" className="whitespace-nowrap">Incl. VAT</Th>
                  <Th align="right" className="whitespace-nowrap">Ex VAT</Th>
                  {canManage && <Th><span className="sr-only">Remove</span></Th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-ink-600">{fmtDate(e.date)}</Td>
                    <Td className="min-w-52">
                      <div className="font-medium text-ink-900">{e.description}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                        <Badge>{LABEL[e.category]}</Badge>
                        {e.supplier && <span>{e.supplier}</span>}
                        {e.createdById && who.get(e.createdById) && <span className="text-ink-400">· {who.get(e.createdById)}</span>}
                      </div>
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <div className="font-medium text-ink-900">{zar(e.amountCents)}</div>
                      <div className="text-xs text-ink-400">{e.vatCents ? `VAT ${zar(e.vatCents)}` : "no VAT"}</div>
                    </Td>
                    <Td align="right" className="whitespace-nowrap">{zar(e.amountCents - e.vatCents)}</Td>
                    {canManage && (
                      <Td className="text-right">
                        <ConfirmAction
                          action={deleteExpense.bind(null, store.code, e.id)}
                          label={<span className="sr-only">Remove {e.description}</span>}
                          icon={<Trash2 className="h-4 w-4" aria-hidden />}
                          triggerVariant="ghost"
                          title="Remove this expense?"
                          confirmLabel="Remove"
                          className="min-w-56"
                        >
                          It comes off your P&L and VAT working.
                        </ConfirmAction>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="px-5 py-3 text-xs text-ink-500">{cat ? LABEL[cat] : "All categories"} · {plural(total, "invoice")}</td>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-950">
                    {zar(sum._sum.amountCents ?? 0)}
                    <div className="text-xs font-normal text-ink-500">VAT {zar(sum._sum.vatCents ?? 0)}</div>
                  </td>
                  <td className="tnum whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-ink-950">{zar((sum._sum.amountCents ?? 0) - (sum._sum.vatCents ?? 0))}</td>
                  {canManage && <td />}
                </tr>
              </tfoot>
            </Table>
          )}
          <div className="border-t border-ink-100">
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
          </div>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Add an expense" description="From the supplier's tax invoice" />
            <CardBody>
              {canManage ? (
                <ActionForm action={addExpense.bind(null, store.code)} className="space-y-3" resetOnSuccess>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Invoice date" htmlFor="ex-date">
                      <Input id="ex-date" name="date" type="date" defaultValue={dayKey(new Date())} max={dayKey(new Date())} />
                      <FieldError name="date" />
                    </Field>
                    <Field label="Category" htmlFor="ex-cat">
                      <Select id="ex-cat" name="category" defaultValue="UTILITIES">
                        {(Object.keys(LABEL) as ExpenseCategory[]).map((k) => (
                          <option key={k} value={k}>{LABEL[k]}</option>
                        ))}
                      </Select>
                      <FieldError name="category" />
                    </Field>
                  </div>
                  <Field label="Description" htmlFor="ex-desc">
                    <Input id="ex-desc" name="description" maxLength={160} placeholder="Electricity — September" />
                    <FieldError name="description" />
                  </Field>
                  <Field label="Supplier (optional)" htmlFor="ex-sup">
                    <Input id="ex-sup" name="supplier" maxLength={120} placeholder="City of Tshwane" />
                  </Field>
                  <Field label="Amount incl. VAT" htmlFor="ex-amt">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-500">R</span>
                      <Input id="ex-amt" name="amount" inputMode="decimal" placeholder="0.00" className="pl-7" />
                    </div>
                    <FieldError name="amount" />
                  </Field>
                  <Checkbox
                    name="vatClaimable"
                    defaultChecked={vendor}
                    disabled={!vendor}
                    label="VAT claimable"
                    description={vendor ? "The supplier is a VAT vendor and the invoice shows VAT (15%)" : "Your company isn't VAT-registered, so VAT can't be claimed"}
                  />
                  <SubmitButton className="w-full" pendingLabel="Adding…">Add expense</SubmitButton>
                </ActionForm>
              ) : (
                <ReadOnlyNote />
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="By category" description="Incl. VAT, this period" />
            <CardBody>
              {byCat.length ? (
                <BarList rows={byCat.sort((a, b) => (b._sum.amountCents ?? 0) - (a._sum.amountCents ?? 0)).map((c) => ({ label: LABEL[c.category], value: c._sum.amountCents ?? 0, sub: `${c._count}` }))} />
              ) : (
                <p className="text-sm text-ink-500">Nothing captured yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
