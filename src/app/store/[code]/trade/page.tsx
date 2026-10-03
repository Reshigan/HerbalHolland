import Link from "next/link";
import { Briefcase } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { listTradeOrders } from "@/server/trade/orders";
import { hrefWith, sp1 } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { PAY_LABEL, TradeOrderBadge } from "@/components/admin/trade-ui";
import type { TradeOrderStatus } from "@/generated/prisma/client";

export const metadata = { title: "Trade orders" };
const PAGE_SIZE = 25;
type SP = Record<string, string | string[] | undefined>;

const TABS: Record<string, { label: string; statuses: TradeOrderStatus[]; status: "OPEN" | TradeOrderStatus }> = {
  todo: { label: "To fulfil", statuses: ["PENDING_PAYMENT", "PLACED", "PICKING", "READY"], status: "OPEN" },
  done: { label: "Done", statuses: ["COLLECTED"], status: "COLLECTED" },
  cancelled: { label: "Cancelled", statuses: ["CANCELLED"], status: "CANCELLED" },
};

export default async function StoreTradeOrdersPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const path = `/store/${store.code}/trade`;
  const tab = sp1(sp.tab) in TABS ? sp1(sp.tab) : "todo";
  const page = pageParam(sp.page);
  const [counts, r] = await Promise.all([
    db.tradeOrder.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
    listTradeOrders({ storeId: store.id, status: TABS[tab].status, page, pageSize: PAGE_SIZE }),
  ]);
  const n = (statuses: TradeOrderStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c._count, 0);
  const tabHref = (t: string) => hrefWith(path, {}, { tab: t === "todo" ? null : t });
  const now = Date.now();
  // Oldest first while there's work to do.
  const rows = tab === "todo" ? [...r.rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) : r.rows;

  return (
    <>
      <PageHeader
        overline={`Trade · ${store.name}`}
        title="Trade orders"
        description="Click & collect orders from business accounts, placed on the trade portal at ex-VAT prices. Pick, mark ready (the buyer gets a collection code), then hand over with an ID check — that posts the sale here with the handling fee."
      />
      <Card>
        <TabLinks className="px-4" current={tabHref(tab)} tabs={Object.entries(TABS).map(([k, t]) => ({ href: tabHref(k), label: t.label, count: n(t.statuses) }))} />
        {rows.length === 0 ? (
          <EmptyState icon={<Briefcase className="h-5 w-5" aria-hidden />} title={tab === "todo" ? "No trade orders to fulfil" : "No trade orders here"}>
            {tab === "todo" ? "Click & collect orders from trade accounts appear here as they come in — your phone gets the same push as an online order." : "Try another tab."}
          </EmptyState>
        ) : (
          <Table stickyFirst minWidth="52rem">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Account</Th>
                <Th align="right">Lines</Th>
                <Th align="right">Total incl. VAT</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
                <Th align="right">Age</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => {
                const mins = (now - o.createdAt.getTime()) / 60_000;
                const open = ["PLACED", "PICKING"].includes(o.status);
                const late = open && mins > 24 * 60 ? "text-rose-600 font-semibold" : open && mins > 4 * 60 ? "text-amber-700 font-semibold" : "text-ink-500";
                return (
                  <Tr key={o.id} href={`${path}/${o.id}`}>
                    <Td>
                      <Link href={`${path}/${o.id}`} className="font-mono text-sm font-bold tracking-wide text-ink-900 hover:text-brand-700">{o.number}</Link>
                      <div className="text-xs text-ink-500">{fmtDateTime(o.createdAt)}</div>
                    </Td>
                    <Td>
                      <div className="font-medium text-ink-850">{o.account.name}</div>
                      <div className="font-mono text-xs text-ink-500">{o.account.number}</div>
                    </Td>
                    <Td align="right">{o._count.lines}</Td>
                    <Td align="right" className="font-medium text-ink-900">{zar(o.totalCents)}</Td>
                    <Td className="text-ink-600">{PAY_LABEL[o.payMethod] ?? o.payMethod}</Td>
                    <Td><TradeOrderBadge status={o.status} /></Td>
                    <Td align="right" className={cn("whitespace-nowrap", late)}>{timeAgo(o.createdAt)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={r.page} pageSize={r.pageSize} total={r.total} href={(p) => hrefWith(path, sp, { page: p })} />
        </div>
      </Card>
    </>
  );
}
