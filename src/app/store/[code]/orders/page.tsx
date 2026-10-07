import Link from "next/link";
import { Briefcase, ShoppingBag } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { customerSearch } from "@/server/store/members";
import { FULFIL_LABEL, hrefWith, sp1 } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, TierBadge } from "@/components/ui/status";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Td, Th, Tr, SortableTh, sortParams } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { SearchForm } from "@/components/store/ui";
import { SavedViews } from "@/components/admin/saved-views";
import type { OrderStatus, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Online orders" };
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;

const TABS: Record<string, { label: string; statuses: OrderStatus[] }> = {
  todo: { label: "To fulfil", statuses: ["PLACED", "PICKING", "READY"] },
  payment: { label: "Awaiting payment", statuses: ["PENDING_PAYMENT"] },
  delivery: { label: "Out for delivery", statuses: ["OUT_FOR_DELIVERY"] },
  completed: { label: "Completed", statuses: ["COMPLETED"] },
  cancelled: { label: "Cancelled", statuses: ["CANCELLED"] },
  all: { label: "All", statuses: ["PENDING_PAYMENT", "PLACED", "PICKING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] },
};

const SORTS = ["age", "member", "fulfilment", "total", "payment", "status"] as const;
const ORDER_BY: Record<(typeof SORTS)[number], (d: "asc" | "desc") => Prisma.OrderOrderByWithRelationInput[]> = {
  age: (d) => [{ createdAt: d }],
  member: (d) => [{ customer: { firstName: d } }, { customer: { lastName: d } }, { createdAt: "asc" }],
  fulfilment: (d) => [{ fulfilment: d }, { createdAt: "asc" }],
  total: (d) => [{ totalCents: d }, { createdAt: "asc" }],
  payment: (d) => [{ paymentStatus: d }, { createdAt: "asc" }],
  status: (d) => [{ status: d }, { createdAt: "asc" }],
};

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const path = `/store/${store.code}/orders`;
  const tab = sp1(sp.tab) in TABS ? sp1(sp.tab) : "todo";
  const q = sp1(sp.q).trim();
  const page = pageParam(sp.page);
  // Oldest first while there's work to do; newest first in the history tabs. Column headers override that.
  const { sort, dir } = sortParams(SORTS, sp.sort, sp.dir, "age", tab === "todo" ? "asc" : "desc");

  const search: Prisma.OrderWhereInput = q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { customer: customerSearch(q) }] } : {};
  const where: Prisma.OrderWhereInput = { storeId: store.id, status: { in: TABS[tab].statuses }, ...search };
  const [counts, total, orders, tradeOpen] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: { storeId: store.id, ...search }, _count: true }),
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: ORDER_BY[sort](dir),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { customer: { select: { firstName: true, lastName: true, tier: true, memberNo: true } }, lines: { select: { qty: true } } },
    }),
    db.tradeOrder.count({ where: { storeId: store.id, fulfilment: "COLLECT", status: { in: ["PLACED", "PICKING", "READY"] } } }),
  ]);
  const n = (statuses: OrderStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c._count, 0);
  const tabHref = (t: string) => hrefWith(path, { q: q || undefined }, { tab: t === "todo" ? null : t });
  const sortHref = (s: string, d: "asc" | "desc") => hrefWith(path, sp, { sort: s, dir: d, page: null });
  const now = Date.now();

  return (
    <>
      <PageHeader
        overline={`Orders · ${store.name}`}
        title="Online orders"
        description="Click & collect and delivery orders routed to your store. Stock is reserved until handover or dispatch; oldest first while there's work to do."
      />
      {tradeOpen > 0 && (
        <Link href={`/store/${store.code}/trade`} className="mb-4 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-ink-800 transition hover:border-brand-300 hover:bg-brand-50">
          <Briefcase className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
          <span className="flex-1"><b className="text-ink-900">{tradeOpen} trade order{tradeOpen === 1 ? "" : "s"}</b> to fulfil: click &amp; collect for business accounts, handled on the Trade orders page.</span>
          <span className="font-semibold text-brand-700">Trade orders →</span>
        </Link>
      )}
      <Card>
        <TabLinks className="px-4" current={tabHref(tab)} tabs={Object.entries(TABS).map(([k, t]) => ({ href: tabHref(k), label: t.label, count: n(t.statuses) }))} />
        <div className="space-y-3 border-b border-ink-100 p-4 sm:px-5">
          <SearchForm path={path} q={q} keep={{ tab: tab === "todo" ? undefined : tab, sort: sp1(sp.sort), dir: sp1(sp.dir) }} placeholder="Order code, member name, number or mobile" />
          <SavedViews pageKey="store-orders" userKey={user.id} />
        </div>
        {orders.length === 0 ? (
          <EmptyState icon={<ShoppingBag className="h-5 w-5" />} title={tab === "todo" ? "All caught up" : "No orders here"}>
            {tab === "todo" ? "New click & collect and delivery orders will appear here as they come in." : "Try another tab or search."}
          </EmptyState>
        ) : (
          <Table stickyFirst minWidth="56rem">
            <thead>
              <tr>
                <Th>Order</Th>
                <SortableTh label="Member" sortKey="member" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="Fulfilment" sortKey="fulfilment" sort={sort} dir={dir} href={sortHref} />
                <Th align="right">Items</Th>
                <SortableTh label="Total" sortKey="total" sort={sort} dir={dir} href={sortHref} align="right" />
                <SortableTh label="Payment" sortKey="payment" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="Status" sortKey="status" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="Age" sortKey="age" sort={sort} dir={dir} href={sortHref} align="right" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const mins = (now - o.createdAt.getTime()) / 60_000;
                const open = ["PLACED", "PICKING"].includes(o.status);
                const late = open && mins > 180 ? "text-rose-600 font-semibold" : open && mins > 60 ? "text-amber-700 font-semibold" : "text-ink-500";
                return (
                  <Tr key={o.id} href={`${path}/${o.id}`}>
                    <Td>
                      <Link href={`${path}/${o.id}`} className="font-mono text-sm font-bold tracking-wide text-ink-900 hover:text-brand-700">
                        {o.code}
                      </Link>
                      <div className="text-xs text-ink-500">{fmtDateTime(o.createdAt)}</div>
                    </Td>
                    <Td>
                      <div className="font-medium text-ink-850">
                        {o.customer.firstName} {o.customer.lastName ?? ""}
                      </div>
                      <TierBadge tier={o.customer.tier} />
                    </Td>
                    <Td>
                      <Badge tone={o.fulfilment === "COLLECT" ? "orange" : o.fulfilment === "SAME_DAY" ? "violet" : "blue"}>{FULFIL_LABEL[o.fulfilment]}</Badge>
                    </Td>
                    <Td align="right">{o.lines.reduce((s, l) => s + l.qty, 0)}</Td>
                    <Td align="right" className="font-medium text-ink-900">{zar(o.totalCents)}</Td>
                    <Td>
                      <StatusBadge status={o.paymentStatus} />
                    </Td>
                    <Td>
                      <StatusBadge status={o.status} />
                    </Td>
                    <Td align="right" className={cn("whitespace-nowrap", late)}>
                      {timeAgo(o.createdAt)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => hrefWith(path, sp, { page: p })} />
        </div>
      </Card>
    </>
  );
}
