import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { supplierInvoiceList, supplierInvoicesByStore, supplierInvoiceSummary, STATUS_LABEL } from "@/server/supplier-invoices";
import { getSettings } from "@/server/settings";
import { qs } from "@/server/hq/form";
import { dueState } from "@/lib/supplier-invoice-rules";
import { zar, zarCompact } from "@/lib/money";
import { dayKey, fmtDate, num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge, type Tone } from "@/components/ui/badge";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { BackLink, EmptyRow } from "@/components/hq/ui";
import { cn } from "@/lib/cn";
import type { SupplierInvoiceStatus } from "@/generated/prisma/client";

export const metadata = { title: "Supplier invoices" };
const PAGE_SIZE = 25;
const STATUSES: SupplierInvoiceStatus[] = ["DUE", "QUERIED", "PAID"];
const DUE_TONE: Record<string, Tone> = { paid: "green", queried: "red", overdue: "red", soon: "amber", due: "neutral" };

type SP = { q?: string; status?: string; store?: string; page?: string };

export default async function HqSupplierInvoices({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope, { kind: "RETAIL" });
  const now = new Date();
  const today = dayKey(now);
  const status = STATUSES.find((s) => s === sp.status) ?? null;
  const page = pageParam(sp.page);
  // Narrow to one store by code (within scope) — the store picker itself stays a search at 1,000 stores.
  const chosen = sp.store ? await db.store.findFirst({ where: { code: sp.store.toUpperCase(), id: { in: ids } }, select: { id: true, code: true, name: true } }) : null;
  const storeIds = chosen ? [chosen.id] : ids;
  const [{ operations }, summary, byStore, { total, rows }] = await Promise.all([
    getSettings(),
    supplierInvoiceSummary(storeIds, now),
    supplierInvoicesByStore(ids, now),
    supplierInvoiceList({ storeIds, status, q: sp.q }, page, PAGE_SIZE),
  ]);
  const storeInfo = new Map(
    (await db.store.findMany({ where: { id: { in: [...new Set([...byStore.map((b) => b.storeId), ...rows.map((r) => r.storeId)])] } }, select: { id: true, code: true, name: true, region: { select: { name: true } } } })).map((s) => [s.id, s]),
  );
  const worst = [...byStore].filter((b) => b.overdue > 0).sort((a, b) => b.overdueCents - a.overdueCents).slice(0, 8);
  const href = (p: Record<string, string | number | undefined>) => `/hq/finance/supplier-invoices${qs({ ...sp, ...p })}`;

  return (
    <>
      <BackLink href="/hq/finance">Finance</BackLink>
      <PageHeader
        overline={scope.kind === "REGION" ? `Region · ${user.region?.name}` : "Network"}
        title="Supplier invoices"
        description={`What stores owe their suppliers — the distribution centres, each other and outside suppliers — as captured in each store's back office${chosen ? ` · ${chosen.name}` : ""}.`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Due" value={zarCompact(summary.dueCents)} sub={`${num(summary.due)} invoices`} />
        <Stat label="Overdue" value={<span className={summary.overdue ? "text-rose-600" : undefined}>{zarCompact(summary.overdueCents)}</span>} sub={summary.overdue ? `${num(summary.overdue)} invoices past due` : "Nothing overdue"} />
        <Stat label={`Due within ${operations.supplierInvoiceDays} days`} value={zarCompact(summary.dueSoonCents)} sub={`${num(summary.dueSoon)} invoices`} />
        <Stat label="Queried" value={num(summary.queried)} sub={summary.queried ? `${zarCompact(summary.queriedCents)} in dispute` : "None open"} />
      </div>

      {worst.length > 0 && !chosen && (
        <Card className="mt-6">
          <CardHeader title="Stores with overdue invoices" description="Most overdue first · open a store to see its invoices" />
          <Table stickyFirst className="mt-3 border-t border-ink-100">
            <thead>
              <tr>
                <Th>Store</Th>
                <Th className="hidden sm:table-cell">Region</Th>
                <Th align="right">Overdue</Th>
                <Th align="right" className="hidden md:table-cell">Invoices</Th>
                <Th align="right">All due</Th>
                <Th className="hidden md:table-cell">Oldest due</Th>
              </tr>
            </thead>
            <tbody>
              {worst.map((w) => {
                const s = storeInfo.get(w.storeId);
                return (
                  <Tr key={w.storeId}>
                    <Td>
                      <Link href={href({ store: s?.code, page: undefined })} className="font-medium text-ink-850 hover:text-brand-700">{s?.name ?? "—"}</Link>
                    </Td>
                    <Td className="hidden text-ink-600 sm:table-cell">{s?.region.name}</Td>
                    <Td align="right" className="font-semibold text-rose-600">{zar(w.overdueCents)}</Td>
                    <Td align="right" className="hidden md:table-cell">{num(w.overdue)}</Td>
                    <Td align="right">{zar(w.dueCents)}</Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">{w.oldestDue ? fmtDate(`${w.oldestDue.toISOString().slice(0, 10)}T12:00:00Z`) : "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Card className="mt-6">
        <div className="border-b border-ink-100 p-4">
          <FilterForm action="/hq/finance/supplier-invoices">
            <SearchField defaultValue={sp.q} placeholder="Supplier or invoice number" />
            <SearchField name="store" label="Store code" defaultValue={sp.store} placeholder="e.g. PTA01" />
            <FilterSelect name="status" label="Status" defaultValue={sp.status} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
          </FilterForm>
        </div>
        <Table stickyFirst className="relative">
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Supplier · invoice</Th>
              <Th>Due</Th>
              <Th align="right">Total incl. VAT</Th>
              <Th align="right" className="hidden sm:table-cell">VAT</Th>
              <Th>Status</Th>
              <Th align="right">Invoice</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <EmptyRow cols={7}>
                <ReceiptText className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                No supplier invoices match.
              </EmptyRow>
            )}
            {rows.map((r) => {
              const s = storeInfo.get(r.storeId);
              const d = dueState(r.status, r.dueDay, today, operations.supplierInvoiceDays);
              return (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/store/${s?.code}/finance/supplier-invoices`} className="font-medium text-ink-850 hover:text-brand-700">{s?.name ?? "—"}</Link>
                    <span className="block font-mono text-xs text-ink-500">{s?.code}</span>
                  </Td>
                  <Td>
                    <div className="font-medium text-ink-900">{r.supplierName}</div>
                    <div className="font-mono text-xs text-ink-500">{r.number}{r.stockOrderNumber ? ` · ${r.stockOrderNumber}` : ""}</div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className={cn("block", d.key === "overdue" && "font-semibold text-rose-600", d.key === "soon" && "font-semibold text-amber-700")}>{fmtDate(`${r.dueDay}T12:00:00Z`)}</span>
                    {r.status === "DUE" && d.key !== "due" && <span className="text-xs text-ink-500">{d.label}</span>}
                  </Td>
                  <Td align="right" className="font-medium text-ink-900">{zar(r.totalCents)}</Td>
                  <Td align="right" className="hidden text-ink-600 sm:table-cell">{r.vatCents ? zar(r.vatCents) : "—"}</Td>
                  <Td>
                    <Badge tone={DUE_TONE[d.key]} dot>{r.status === "DUE" ? (d.key === "overdue" ? "Overdue" : "Due") : STATUS_LABEL[r.status]}</Badge>
                  </Td>
                  <Td align="right">
                    <a href={`/store/${s?.code}/finance/supplier-invoices/${r.id}/file`} target="_blank" rel="noopener" className="text-xs font-semibold text-brand-700 hover:underline">
                      {r.file?.contentType === "application/pdf" ? "PDF" : "Photo"}
                    </a>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
