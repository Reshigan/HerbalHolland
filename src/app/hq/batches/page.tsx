import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { qs } from "@/server/hq/form";
import { addDays, fmtDate, num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { EmptyRow } from "@/components/hq/ui";
import type { BatchStatus, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Batches & recalls" };

type SP = { q?: string; status?: string; expiring?: string; page?: string };
const STATUSES: BatchStatus[] = ["RELEASED", "QUARANTINE", "RECALLED"];

export default async function BatchesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const page = pageParam(sp.page);
  const pageSize = 25;
  const now = new Date();
  const days = Number(sp.expiring) || 0;
  const q = sp.q?.trim();
  const where: Prisma.BatchWhereInput = {
    AND: [
      STATUSES.includes(sp.status as BatchStatus) ? { status: sp.status as BatchStatus } : {},
      days ? { expiresAt: { gt: now, lte: addDays(now, days) } } : {},
      q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { variant: { product: { name: { contains: q, mode: "insensitive" } } } }, { variant: { sku: { contains: q, mode: "insensitive" } } }, { supplier: { contains: q, mode: "insensitive" } }] } : {},
    ],
  };
  const [total, batches, counts, expiringSoon] = await Promise.all([
    db.batch.count({ where }),
    db.batch.findMany({
      where,
      include: { variant: { select: { name: true, sku: true, product: { select: { name: true } } } } },
      orderBy: [{ status: "desc" }, { expiresAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.batch.groupBy({ by: ["status"], _count: true }),
    db.batch.count({ where: { status: "RELEASED", expiresAt: { gt: now, lte: addDays(now, 60) }, stock: { some: { onHand: { gt: 0 }, storeId: { in: ids } } } } }),
  ]);
  const stock = await db.stockLevel.groupBy({ by: ["batchId"], where: { batchId: { in: batches.map((b) => b.id) }, storeId: { in: ids } }, _sum: { onHand: true } });
  const onHand = new Map(stock.map((s) => [s.batchId, s._sum.onHand ?? 0]));
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const href = (p: Record<string, string | number | undefined>) => `/hq/batches${qs({ ...sp, ...p })}`;
  const daysLeft = (d: Date | null) => (d ? Math.ceil((d.getTime() - now.getTime()) / 86_400_000) : null);

  return (
    <>
      <PageHeader overline="Product" title="Batches & recalls" description="Every lot is lab-tested and traceable from the distribution centre to the member. Quarantine or recall a batch and every till, DC and the web shop stop selling it at once." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Released batches" value={num(count("RELEASED"))} />
        <Stat label="In quarantine" value={num(count("QUARANTINE"))} sub={count("QUARANTINE") ? "awaiting review" : "none"} />
        <Stat label="Recalled" value={num(count("RECALLED"))} />
        <Stat label="Expiring in 60 days" value={num(expiringSoon)} sub="released, with stock on hand" />
      </div>
      <Card>
        <div className="border-b border-ink-100 p-4">
          <FilterForm action="/hq/batches">
            <SearchField defaultValue={sp.q} placeholder="Batch code, product, SKU or supplier" />
            <FilterSelect name="status" label="Status" defaultValue={sp.status} options={[{ value: "RELEASED", label: "Released" }, { value: "QUARANTINE", label: "Quarantine" }, { value: "RECALLED", label: "Recalled" }]} />
            <FilterSelect name="expiring" label="Expiry" allLabel="Any" defaultValue={sp.expiring} options={[{ value: "30", label: "Expiring in 30 days" }, { value: "60", label: "Expiring in 60 days" }, { value: "90", label: "Expiring in 90 days" }]} />
          </FilterForm>
        </div>
        <Table className="relative">
          <thead>
            <tr>
              <Th>Batch</Th>
              <Th>Product</Th>
              <Th className="hidden lg:table-cell">Supplier</Th>
              <Th className="hidden md:table-cell">Expires</Th>
              <Th align="right" className="hidden sm:table-cell">THC / CBD</Th>
              <Th align="right">On hand</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <EmptyRow cols={7}>
                <FlaskConical className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                No batches match these filters.
              </EmptyRow>
            )}
            {batches.map((b) => {
              const left = daysLeft(b.expiresAt);
              return (
                <Tr key={b.id}>
                  <Td>
                    <Link href={`/hq/batches/${b.id}`} className="whitespace-nowrap font-mono text-[0.8rem] font-semibold text-ink-900 hover:text-brand-700">
                      {b.code}
                    </Link>
                    <div className="text-xs text-ink-500">Packed {fmtDate(b.packedAt)}</div>
                  </Td>
                  <Td>
                    <span className="font-medium text-ink-850">{b.variant.product.name}</span>
                    <span className="block text-xs text-ink-500">
                      {b.variant.name} · <span className="font-mono">{b.variant.sku}</span>
                    </span>
                  </Td>
                  <Td className="hidden max-w-56 truncate text-ink-600 lg:table-cell">{b.supplier}</Td>
                  <Td className="hidden whitespace-nowrap md:table-cell">
                    {b.expiresAt ? fmtDate(b.expiresAt) : "—"}
                    {left != null && left <= 90 && (
                      <span className={`block text-xs font-medium ${left <= 0 ? "text-rose-600" : left <= 30 ? "text-amber-700" : "text-ink-500"}`}>{left <= 0 ? "Expired" : `in ${left} days`}</span>
                    )}
                  </Td>
                  <Td align="right" className="hidden whitespace-nowrap text-ink-600 sm:table-cell">
                    {b.thc != null ? `${b.thc}%` : "—"} / {b.cbd != null ? `${b.cbd}%` : "—"}
                  </Td>
                  <Td align="right" className="font-medium">{num(onHand.get(b.id) ?? 0)}</Td>
                  <Td>
                    <StatusBadge status={b.status} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
