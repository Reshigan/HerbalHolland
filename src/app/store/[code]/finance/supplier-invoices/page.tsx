import Link from "next/link";
import { FileText, ImageIcon, Plus, ReceiptText } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { tx } from "@/server/db";
import { canManageStore, storeForUser } from "@/server/scope";
import { invoiceAccounts, supplierInvoiceList, supplierInvoiceSummary, STATUS_LABEL } from "@/server/supplier-invoices";
import { getSettings } from "@/server/settings";
import { hrefWith, plural, sp1 } from "@/server/store/rules";
import { dueState, DEFAULT_TERMS_DAYS } from "@/lib/supplier-invoice-rules";
import { zar, zarCompact } from "@/lib/money";
import { addDays, dayKey, fmtDate } from "@/lib/format";
import { captureInvoice, payInvoice, queryInvoice, reopenInvoice } from "./actions";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge, type Tone } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { BackLink, Chips, ReadOnlyNote, SearchForm } from "@/components/store/ui";
import { ConfirmAction, FieldError } from "@/components/store/action-form";
import { Drawer } from "@/components/store/drawer";
import { SupplierInvoiceForm } from "@/components/store/supplier-invoice-form";
import { cn } from "@/lib/cn";
import type { SupplierInvoiceStatus } from "@/generated/prisma/client";

export const metadata = { title: "Supplier invoices" };
const PAGE_SIZE = 25;
const STATUSES: SupplierInvoiceStatus[] = ["DUE", "QUERIED", "PAID"];
const DUE_TONE: Record<string, Tone> = { paid: "green", queried: "red", overdue: "red", soon: "amber", due: "neutral" };

export default async function SupplierInvoicesPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/finance/supplier-invoices`;
  const now = new Date();
  const today = dayKey(now);
  const status = STATUSES.find((s) => s === sp1(sp.status)) ?? null;
  const q = sp1(sp.q).trim();
  const page = pageParam(sp.page);
  const [{ operations }, summary, { total, rows }, accounts] = await Promise.all([
    getSettings(),
    supplierInvoiceSummary([store.id], now),
    supplierInvoiceList({ storeIds: [store.id], status, q }, page, PAGE_SIZE),
    canManage ? tx((t) => invoiceAccounts(t, store.companyId)) : [], // opens the company's books the first time
  ]);
  const vendor = !!store.company.vatNumber;

  return (
    <>
      <BackLink href={`/store/${store.code}/finance`}>Finance</BackLink>
      <PageHeader
        overline={`Money · ${store.name}`}
        title="Supplier invoices"
        description="What you owe your suppliers. Capture invoices from outside suppliers with a photo or PDF, then mark them paid or query one that doesn't match the delivery. Stock orders from the distribution centre and other stores are added when you receive them and settle on your franchise statement."
        actions={
          canManage && (
            <Drawer label="Add invoice" icon={<Plus className="h-4 w-4" aria-hidden />} title="Capture a supplier invoice" description="Details from the invoice, and a photo or PDF of it">
              <SupplierInvoiceForm
                action={captureInvoice.bind(null, store.code)}
                vendor={vendor}
                accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
                defaults={{ invoiceDate: today, dueDate: dayKey(addDays(now, DEFAULT_TERMS_DAYS)) }}
                resetOnSuccess
              />
            </Drawer>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Due" value={zarCompact(summary.dueCents)} sub={`${plural(summary.due, "invoice")}${summary.onStatement ? ` · ${zarCompact(summary.onStatementCents)} on the statement` : ""}`} />
        <Stat label="Overdue" value={<span className={summary.overdue ? "text-rose-600" : undefined}>{zarCompact(summary.overdueCents)}</span>} sub={summary.overdue ? plural(summary.overdue, "invoice") + " past due" : "Nothing overdue"} />
        <Stat label={`Due within ${operations.supplierInvoiceDays} days`} value={zarCompact(summary.dueSoonCents)} sub={plural(summary.dueSoon, "invoice")} />
        <Stat label="Paid · last 30 days" value={zarCompact(summary.paid30Cents)} sub={plural(summary.paid30, "invoice")} />
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
          <Chips
            label="Status"
            current={status ?? "all"}
            items={[
              { key: "all", label: "All", href: hrefWith(path, { q }, { status: null }) },
              ...STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], count: s === "DUE" ? summary.due : s === "QUERIED" ? summary.queried : undefined, tone: s === "QUERIED" && summary.queried ? ("red" as const) : undefined, href: hrefWith(path, { q }, { status: s }) })),
            ]}
          />
          <SearchForm path={path} q={q} keep={{ status: status ?? undefined }} placeholder="Supplier or invoice number" />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-5 w-5" />} title={q || status ? "No invoices match" : "No supplier invoices yet"}>
            {q || status ? (
              "Try another status or search."
            ) : (
              <>
                Stock you receive from your Herbal Holland distribution centre or other stores appears here and settles on your monthly franchise statement. Capture invoices from outside suppliers here.
              </>
            )}
          </EmptyState>
        ) : (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>Supplier · invoice</Th>
                <Th className="hidden md:table-cell">Dated</Th>
                <Th className="hidden lg:table-cell">Charged to</Th>
                <Th>Due</Th>
                <Th align="right">Total incl. VAT</Th>
                <Th align="right" className="hidden sm:table-cell">VAT</Th>
                <Th>Status</Th>
                <Th align="right">Invoice</Th>
                {canManage && <Th align="right">Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                // A stock order is never overdue: it settles on the month's statement.
                const d = r.onStatement ? { key: r.status === "PAID" ? "paid" : "due", label: "" } : dueState(r.status, r.dueDay, today, operations.supplierInvoiceDays);
                return (
                  <Tr key={r.id} id={r.id}>
                    <Td>
                      <div className="font-medium text-ink-900">{r.supplierName}</div>
                      <div className="text-xs text-ink-500">
                        <span className="font-mono">{r.number}</span>
                        {r.note && <span className="block truncate text-ink-500" title={r.note}>{r.note}</span>}
                      </div>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">{fmtDate(`${r.invoiceDay}T12:00:00Z`)}</Td>
                    {/* A stock order's invoice goes to stock with the order; one captured without a choice, to other expenses. */}
                    <Td className="hidden text-ink-600 lg:table-cell">{r.onStatement ? "Stock on hand" : (r.account ?? "Other expenses")}</Td>
                    <Td className="whitespace-nowrap">
                      <span className={cn("block", d.key === "overdue" && "font-semibold text-rose-600", d.key === "soon" && "font-semibold text-amber-700")}>{fmtDate(`${r.dueDay}T12:00:00Z`)}</span>
                      {r.status === "DUE" && d.key !== "due" && <span className="text-xs text-ink-500">{d.label}</span>}
                      {r.onStatement && r.status === "DUE" && <span className="text-xs text-ink-500">on the statement</span>}
                      {r.status === "PAID" && r.paidAt && <span className="text-xs text-ink-500">{r.onStatement ? "settled" : "paid"} {fmtDate(r.paidAt)}{r.paidBy ? ` by ${r.paidBy}` : ""}</span>}
                    </Td>
                    <Td align="right" className="font-medium text-ink-900">{zar(r.totalCents)}</Td>
                    <Td align="right" className="hidden text-ink-600 sm:table-cell">{r.vatCents ? zar(r.vatCents) : "—"}</Td>
                    <Td>
                      <Badge tone={DUE_TONE[d.key]} dot>{r.onStatement ? (r.status === "PAID" ? "Settled" : "On statement") : r.status === "DUE" ? (d.key === "overdue" ? "Overdue" : "Due") : STATUS_LABEL[r.status]}</Badge>
                    </Td>
                    <Td align="right">
                      {r.onStatement ? (
                        <Link href={`/store/${store.code}/purchasing/${r.stockOrderId}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                          <FileText className="h-3.5 w-3.5" aria-hidden />
                          Stock order
                        </Link>
                      ) : (
                        <a href={`${path}/${r.id}/file`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                          {r.file?.contentType === "application/pdf" ? <FileText className="h-3.5 w-3.5" aria-hidden /> : <ImageIcon className="h-3.5 w-3.5" aria-hidden />}
                          {r.file?.contentType === "application/pdf" ? "PDF" : "Photo"}
                        </a>
                      )}
                    </Td>
                    {canManage && (
                      <Td align="right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {r.status !== "PAID" && !r.onStatement && (
                            <ConfirmAction action={payInvoice.bind(null, store.code, r.id)} label="Mark paid" title={`Mark ${r.number} as paid?`} confirmLabel="Mark paid" variant="primary" className="min-w-64 text-left">
                              <Field label="Paid on" htmlFor={`paid-${r.id}`}>
                                <Input id={`paid-${r.id}`} name="paidOn" type="date" defaultValue={today} max={today} />
                                <FieldError name="paidOn" />
                              </Field>
                              <Field label="Note (optional)" htmlFor={`paynote-${r.id}`}>
                                <Input id={`paynote-${r.id}`} name="note" maxLength={300} placeholder="EFT reference" />
                              </Field>
                            </ConfirmAction>
                          )}
                          {r.status === "DUE" && !r.onStatement && (
                            <ConfirmAction action={queryInvoice.bind(null, store.code, r.id)} label="Query" title={`Query ${r.number}?`} confirmLabel="Query invoice" className="min-w-64 text-left">
                              <Field label="What doesn't match?" htmlFor={`qnote-${r.id}`}>
                                <Textarea id={`qnote-${r.id}`} name="note" maxLength={300} className="min-h-16" placeholder="Short delivery, wrong price…" />
                                <FieldError name="note" />
                              </Field>
                            </ConfirmAction>
                          )}
                          {r.status === "QUERIED" && (
                            <ConfirmAction action={reopenInvoice.bind(null, store.code, r.id)} label="Reopen" title={`Reopen ${r.number}?`} confirmLabel="It's due again" variant="dark">
                              The query is settled and the invoice is payable as captured.
                            </ConfirmAction>
                          )}
                        </div>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
      </Card>
      {!canManage && <ReadOnlyNote className="mt-4">Managers and owners capture and pay supplier invoices.</ReadOnlyNote>}
    </>
  );
}
