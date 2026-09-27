import Link from "next/link";
import { Truck, Warehouse } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { can } from "@/server/hq/guard";
import { dcStockHealth } from "@/server/hq/distribution";
import { qs } from "@/server/hq/form";
import { zar, zarCompact } from "@/lib/money";
import { fmtDate, num, timeAgo, addDays } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { ActionButton } from "@/components/hq/action-form";
import { FilterForm, FilterSelect } from "@/components/hq/filter-form";
import { EmptyRow } from "@/components/hq/ui";
import { actOnDcOrder } from "./actions";
import type { Prisma, StockOrderStatus } from "@/generated/prisma/client";

export const metadata = { title: "Distribution" };

type SP = { dc?: string; view?: string; low?: string; page?: string };
const VIEWS: { key: string; label: string; status?: StockOrderStatus }[] = [
  { key: "incoming", label: "Incoming", status: "SUBMITTED" },
  { key: "ship", label: "To pick & ship", status: "APPROVED" },
  { key: "transit", label: "In transit", status: "SHIPPED" },
  { key: "received", label: "Received", status: "RECEIVED" },
  { key: "stock", label: "DC stock" },
];

export default async function DistributionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const dcs = await db.store.findMany({
    where: { kind: "WAREHOUSE", ...(scope.kind === "HQ" ? {} : { served: { some: { id: { in: ids } } } }) },
    select: { id: true, code: true, name: true, city: true },
    orderBy: { name: "asc" },
  });
  if (!dcs.length)
    return (
      <>
        <PageHeader overline="Supply" title="Distribution" />
        <Card>
          <EmptyState icon={<Warehouse className="h-6 w-6" />} title="No distribution centres serve your stores yet" />
        </Card>
      </>
    );
  const dc = dcs.find((d) => d.code === sp.dc) ?? dcs[0];
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const page = pageParam(sp.page);
  const pageSize = 25;
  const base: Prisma.StockOrderWhereInput = { kind: "WHOLESALE", sellerId: dc.id, buyerId: { in: ids } };
  const recent = addDays(new Date(), -30);
  const where: Prisma.StockOrderWhereInput = { ...base, status: view.status, ...(view.status === "RECEIVED" && { receivedAt: { gte: recent } }) };
  const act = can(user, "network");

  const [counts, orders, total, stock, monthValue, waiting] = await Promise.all([
    db.stockOrder.groupBy({ by: ["status"], where: { ...base, status: { in: ["SUBMITTED", "APPROVED", "SHIPPED"] } }, _count: true, _sum: { totalCents: true } }),
    view.status
      ? db.stockOrder.findMany({
          where,
          include: { buyer: { select: { code: true, name: true, region: { select: { name: true } } } }, lines: { select: { qty: true } } },
          orderBy: view.status === "SUBMITTED" ? { submittedAt: "asc" } : view.status === "APPROVED" ? { approvedAt: "asc" } : view.status === "SHIPPED" ? { shippedAt: "asc" } : { receivedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        })
      : [],
    view.status ? db.stockOrder.count({ where }) : 0,
    view.key === "stock" ? dcStockHealth(dc.id) : null,
    db.stockOrder.aggregate({ where: { ...base, status: { in: ["SHIPPED", "RECEIVED"] }, shippedAt: { gte: recent } }, _sum: { totalCents: true }, _count: true }),
    db.stockOrder.groupBy({ by: ["sellerId"], where: { kind: "WHOLESALE", sellerId: { in: dcs.map((d) => d.id) }, buyerId: { in: ids }, status: { in: ["SUBMITTED", "APPROVED"] } }, _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const tabHref = (p: Record<string, string | undefined>) => `/hq/distribution${qs({ dc: dc.code, view: view.key, ...p })}`;
  const stockRows = stock ? (sp.low ? stock.filter((r) => r.low) : stock) : [];
  const stockPage = stockRows.slice((page - 1) * 50, page * 50);

  return (
    <>
      <PageHeader overline="Supply" title="Distribution" description="Store orders from the distribution centres: approve, pick first-expiry-first-out, ship. Stores are invoiced for what they receive, settled on their monthly statement." />
      <TabLinks className="mb-5" current={tabHref({ view: undefined, page: undefined })} tabs={dcs.map((d) => ({ href: `/hq/distribution${qs({ dc: d.code })}`, label: d.name, count: waiting.find((w) => w.sellerId === d.id)?._count }))} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting approval" value={num(count("SUBMITTED"))} sub={zarCompact(counts.find((c) => c.status === "SUBMITTED")?._sum.totalCents ?? 0) + " incl. VAT"} />
        <Stat label="To pick & ship" value={num(count("APPROVED"))} />
        <Stat label="In transit" value={num(count("SHIPPED"))} />
        <Stat label="Shipped · 30 days" value={zarCompact(monthValue._sum.totalCents ?? 0)} sub={`${num(monthValue._count)} orders`} />
      </div>

      <TabLinks
        className="mb-4"
        current={tabHref({})}
        tabs={VIEWS.map((v) => ({ href: `/hq/distribution${qs({ dc: dc.code, view: v.key })}`, label: v.label, count: v.status && v.status !== "RECEIVED" ? count(v.status) : undefined }))}
      />

      {view.status ? (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Store</Th>
                <Th align="right" className="hidden sm:table-cell">Units</Th>
                <Th align="right">Value</Th>
                <Th className="hidden md:table-cell">{view.status === "SUBMITTED" ? "Waiting" : view.status === "RECEIVED" ? "Received" : view.status === "SHIPPED" ? "Shipped" : "Approved"}</Th>
                <Th align="right">{view.status === "SUBMITTED" && act ? "Action" : "Status"}</Th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <EmptyRow cols={6}>
                  <Truck className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                  {view.status === "SUBMITTED" ? "No orders waiting for approval." : view.status === "APPROVED" ? "Nothing to pick right now." : view.status === "SHIPPED" ? "Nothing in transit." : "No deliveries received in the last 30 days."}
                </EmptyRow>
              )}
              {orders.map((o) => {
                const at = o.receivedAt ?? o.shippedAt ?? o.approvedAt ?? o.submittedAt ?? o.createdAt;
                return (
                  <Tr key={o.id}>
                    <Td>
                      <Link href={`/hq/distribution/${o.id}`} className="font-mono text-[0.8rem] font-semibold text-ink-900 hover:text-oranje-700">
                        {o.number}
                      </Link>
                      <span className="block text-xs text-ink-500">{o.lines.length} line{o.lines.length === 1 ? "" : "s"}</span>
                    </Td>
                    <Td>
                      <span className="font-medium text-ink-850">{o.buyer.name}</span>
                      <span className="block text-xs text-ink-500">
                        <span className="font-mono">{o.buyer.code}</span> · {o.buyer.region.name}
                      </span>
                    </Td>
                    <Td align="right" className="hidden sm:table-cell">{num(o.lines.reduce((s, l) => s + l.qty, 0))}</Td>
                    <Td align="right">{zar(o.totalCents)}</Td>
                    <Td className="hidden whitespace-nowrap text-ink-600 md:table-cell">
                      {view.status === "RECEIVED" ? fmtDate(at) : timeAgo(at)}
                    </Td>
                    <Td align="right">
                      {view.status === "SUBMITTED" && act ? (
                        <div className="flex justify-end gap-2">
                          <ActionButton action={actOnDcOrder.bind(null, o.id, "approve")} variant="dark" pendingLabel="Approving…">
                            Approve
                          </ActionButton>
                          <Link href={`/hq/distribution/${o.id}`} className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-ink-600 hover:bg-ink-100">
                            Review
                          </Link>
                        </div>
                      ) : view.status === "APPROVED" && act ? (
                        <Link href={`/hq/distribution/${o.id}`} className="inline-flex h-8 items-center rounded-full bg-oranje-500 px-3 text-xs font-semibold text-ink-950 hover:bg-oranje-400">
                          Pick list →
                        </Link>
                      ) : (
                        <StatusBadge status={o.status} />
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={total} href={(p) => tabHref({ page: String(p) })} />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 p-4">
            <p className="text-sm text-ink-600">
              {dc.name}: {num(stock!.reduce((s, r) => s + r.onHand, 0))} sellable units across {stock!.length} SKUs · <b className="text-amber-700">{stock!.filter((r) => r.low).length} under two weeks&apos; cover</b>
            </p>
            <FilterForm action="/hq/distribution" keep={{ dc: dc.code, view: "stock" }}>
              <FilterSelect name="low" label="Show" allLabel={null} defaultValue={sp.low ?? ""} options={[{ value: "", label: "All SKUs" }, { value: "1", label: "Low stock only" }]} />
            </FilterForm>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th align="right">On hand</Th>
                <Th align="right" className="hidden sm:table-cell">Committed</Th>
                <Th align="right">Available</Th>
                <Th align="right" className="hidden md:table-cell">Shipped 28d</Th>
                <Th align="right">Cover</Th>
                <Th className="hidden lg:table-cell">Next expiry</Th>
              </tr>
            </thead>
            <tbody>
              {stockPage.length === 0 && <EmptyRow cols={7}>{sp.low ? "No SKUs are running low." : "No stock at this DC."}</EmptyRow>}
              {stockPage.map((r) => (
                <Tr key={r.variantId}>
                  <Td>
                    <span className="font-medium text-ink-850">{r.name}</span>
                    <span className="block font-mono text-xs text-ink-500">{r.sku}</span>
                  </Td>
                  <Td align="right">
                    {num(r.onHand)}
                    {r.blocked > 0 && <span className="block text-xs text-rose-600">+{num(r.blocked)} held</span>}
                  </Td>
                  <Td align="right" className="hidden text-ink-600 sm:table-cell">{num(r.committed)}</Td>
                  <Td align="right" className={r.available <= 0 ? "font-semibold text-rose-600" : "font-semibold"}>{num(r.available)}</Td>
                  <Td align="right" className="hidden text-ink-600 md:table-cell">{num(r.shipped28)}</Td>
                  <Td align="right">
                    {r.cover === Infinity ? <span className="text-ink-400">No demand</span> : r.low ? <Badge tone={r.cover <= 0 ? "red" : "amber"}>{Math.max(0, Math.floor(r.cover))} days</Badge> : `${Math.floor(r.cover)} days`}
                  </Td>
                  <Td className="hidden whitespace-nowrap text-ink-600 lg:table-cell">{r.nextExpiry ? fmtDate(r.nextExpiry) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={50} total={stockRows.length} href={(p) => tabHref({ low: sp.low, page: String(p) })} />
        </Card>
      )}
    </>
  );
}
