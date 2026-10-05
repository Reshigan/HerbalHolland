import Link from "next/link";
import { Download, NotebookPen, Plus } from "lucide-react";
import { requireBooks } from "@/server/ledger/access";
import { db } from "@/server/db";
import { MANUAL_SOURCES } from "@/server/ledger/core";
import { SOURCE_LABEL, sourceLabel } from "@/lib/ledger-admin";
import { addMonths, periodOf } from "@/lib/ledger";
import { dayKey, fmtDate, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";
import { hrefWith, sp1 } from "@/server/store/rules";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Table, TableEmpty, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { Chips } from "@/components/store/ui";
import { Flash } from "@/components/hq/flash";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Journals" };
const PAGE_SIZE = 50;
const SEARCH_MONTHS = 12; // a search without a month reads the last year

export default async function JournalsPage({ params, searchParams }: { params: Promise<{ companyId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ companyId }, sp] = await Promise.all([params, searchParams]);
  const { company, role } = await requireBooks(companyId);
  const base = `/books/${companyId}`;
  const path = `${base}/journals`;
  const current = periodOf(dayKey(new Date()));
  const months = Array.from({ length: 24 }, (_, i) => addMonths(current, -i));
  const month = months.find((m) => m === sp1(sp.month)) ?? null;
  const source = sp1(sp.source) in SOURCE_LABEL ? sp1(sp.source) : null;
  const status = sp1(sp.status) === "DRAFT" || sp1(sp.status) === "POSTED" ? (sp1(sp.status) as "DRAFT" | "POSTED") : null;
  const q = sp1(sp.q).trim().slice(0, 80);
  const page = pageParam(sp.page);
  const own = await db.store.findMany({ where: { companyId }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } });
  // HQ's journals also name franchisee stores (its side of their trading), so HQ filters by any store code.
  const storeCode = sp1(sp.store).trim().toUpperCase();
  const store = storeCode ? await db.store.findFirst({ where: { code: storeCode, ...(company.kind === "FRANCHISEE" && { companyId }) }, select: { id: true, code: true } }) : null;

  const filters: Prisma.JournalWhereInput = {
    companyId,
    ...(month ? { period: month } : q ? { period: { gte: addMonths(current, -(SEARCH_MONTHS - 1)) } } : {}),
    ...(source && { source }),
    AND: [
      // Automatic journals carry their store; a manual one is found by its lines.
      storeCode ? { OR: [{ storeId: store?.id ?? "__none__" }, { source: { in: [...MANUAL_SOURCES] }, lines: { some: { storeId: store?.id ?? "__none__" } } }] } : {},
      q ? { OR: [...(/^\d{1,9}$/.test(q) ? [{ number: Number(q) }] : []), { memo: { contains: q, mode: "insensitive" as const } }] } : {},
    ],
  };
  const where = { ...filters, ...(status && { status }) };
  const [total, rows, drafts] = await Promise.all([
    db.journal.count({ where }),
    db.journal.findMany({ where, orderBy: { number: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.journal.count({ where: { ...filters, status: "DRAFT" } }),
  ]);
  const ids = rows.map((r) => r.id);
  const [sums, stores, reversed] = await Promise.all([
    ids.length ? db.journalLine.groupBy({ by: ["journalId"], where: { journalId: { in: ids }, amountCents: { gt: 0 } }, _sum: { amountCents: true } }) : [],
    db.store.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => (r.storeId ? [r.storeId] : [])))] } }, select: { id: true, name: true } }),
    ids.length ? db.journal.findMany({ where: { reversalOfId: { in: ids } }, select: { reversalOfId: true } }) : [],
  ]);
  const amount = new Map(sums.map((s) => [s.journalId, s._sum.amountCents ?? 0]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const isReversed = new Set(reversed.map((r) => r.reversalOfId));
  const keep = { month: month ?? undefined, source: source ?? undefined, store: storeCode || undefined, q: q || undefined };
  const filtered = !!(month || source || storeCode || q || status);

  return (
    <>
      <PageHeader
        overline={`Books · ${company.name}`}
        title="Journals"
        description="Every entry in the books: posted automatically from trading, stock, banking and statements, or by hand. A posted journal is never changed — an automatic one corrects itself through its source, a manual one by its reversal."
        actions={
          <>
            <ButtonLink href={`${base}/export/journals${month ? `?from=${month}&to=${month}` : ""}`} variant="outline" prefetch={false} title={month ? `Posted journals for ${fmtMonth(`${month}-15T12:00:00Z`)}` : "Posted journals for the financial year to date"}>
              <Download className="h-4 w-4" aria-hidden />
              Download CSV
            </ButtonLink>
            {role.write && (
              <ButtonLink href={`${path}/new`}>
                <Plus className="h-4 w-4" aria-hidden />
                New journal
              </ButtonLink>
            )}
          </>
        }
      />
      <Flash message={sp1(sp.m) || undefined} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <Chips
            label="Status"
            current={status ?? "all"}
            items={[
              { key: "all", label: "All", href: hrefWith(path, keep) },
              { key: "DRAFT", label: "Waiting for approval", count: drafts, tone: drafts ? "amber" : undefined, href: hrefWith(path, keep, { status: "DRAFT" }) },
              { key: "POSTED", label: "Posted", href: hrefWith(path, keep, { status: "POSTED" }) },
            ]}
          />
          <FilterForm action={path} keep={{ status: status ?? undefined }} className="lg:justify-end">
            <FilterSelect name="month" label="Month" defaultValue={month ?? ""} allLabel="All" options={months.map((m) => ({ value: m, label: fmtMonth(`${m}-15T12:00:00Z`) }))} />
            <FilterSelect name="source" label="Source" defaultValue={source ?? ""} allLabel="All" options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} />
            {company.kind === "FRANCHISEE" ? (
              own.length > 1 && <FilterSelect name="store" label="Store" defaultValue={storeCode} allLabel="All" options={own.map((s) => ({ value: s.code, label: s.name }))} />
            ) : (
              <label className="block">
                <span className="sr-only">Store code</span>
                <Input name="store" defaultValue={storeCode} placeholder="Store code" className="w-32 uppercase" maxLength={20} />
              </label>
            )}
            <SearchField defaultValue={q} placeholder="Number or description" label="Search journals" className="basis-48" />
          </FilterForm>
        </div>
        {q && !month && <p className="border-b border-ink-100 px-5 py-2 text-xs text-ink-500">Searching the last {SEARCH_MONTHS} months — choose a month to search further back.</p>}
        <Table stickyFirst minWidth="44rem">
          <thead>
            <tr>
              <Th>No.</Th>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th className="hidden md:table-cell">Store</Th>
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty cols={5} icon={<NotebookPen className="h-5 w-5" />} title={filtered ? "No journals match" : "No journals yet"}>
                {filtered ? "Try another month, source or search." : "Journals appear here as the stores trade and stock, banking and statements post — or add one by hand."}
              </TableEmpty>
            ) : (
              rows.map((j) => (
                <Tr key={j.id} href={`${path}/${j.id}`}>
                  <Td>
                    <Link href={`${path}/${j.id}`} className="tnum font-semibold text-ink-900 hover:text-brand-700">
                      {j.number}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-600">{fmtDate(j.date)}</Td>
                  <Td>
                    <div className="max-w-xl truncate font-medium text-ink-900" title={j.memo}>
                      {j.memo}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                      {sourceLabel(j.source)}
                      {j.status === "DRAFT" && <Badge tone="amber">Draft</Badge>}
                      {j.late && <Badge tone="neutral">Posted late</Badge>}
                      {j.reversalOfId && <Badge tone="neutral">Reversal</Badge>}
                      {isReversed.has(j.id) && <Badge tone="neutral">Reversed</Badge>}
                    </div>
                  </Td>
                  <Td className="hidden text-ink-600 md:table-cell">{j.storeId ? (storeName.get(j.storeId) ?? "—") : "—"}</Td>
                  <Td align="right" className="font-medium text-ink-900">
                    {zar(amount.get(j.id) ?? 0)}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, { ...keep, status: status ?? undefined }, { page: p })} />
      </Card>
    </>
  );
}
