import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { db } from "@/server/db";
import { qs } from "@/server/hq/form";
import { tradeNumberQuery } from "@/lib/trade";
import { zar } from "@/lib/money";
import { addDays, fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Td, Tr, SortableTh, TableEmpty, sortParams } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, SearchField } from "@/components/hq/filter-form";
import { ViewOnly } from "@/components/hq/ui";
import { SavedViews } from "@/components/admin/saved-views";
import { FULFIL_LABEL, PAY_LABEL, TradeOrderBadge } from "@/components/admin/trade-ui";
import { orderWhere, tradeScope } from "../scope";
import type { Prisma, TradeOrderStatus } from "@/generated/prisma/client";

export const metadata = { title: "Trade orders" };

type SP = { view?: string; q?: string; sort?: string; dir?: string; page?: string };
const VIEWS: Record<string, { label: string; where: (now: Date) => Prisma.TradeOrderWhereInput; hint?: string }> = {
  open: { label: "Open", where: () => ({ status: { in: ["PENDING_PAYMENT", "PLACED", "PICKING", "READY"] } }) },
  eft: { label: "Pending EFT", where: () => ({ status: "PENDING_PAYMENT" }) },
  pick: { label: "To pick", where: () => ({ status: { in: ["PLACED", "PICKING"] } }) },
  ready: { label: "Ready for collection", where: () => ({ status: "READY" }) },
  transit: { label: "In transit", where: (now) => ({ status: "SHIPPED", shippedAt: { gte: addDays(now, -7) } }), hint: "shipped in the last 7 days" },
  done: { label: "Done", where: () => ({ status: { in: ["SHIPPED", "COLLECTED"] } }) },
  cancelled: { label: "Cancelled", where: () => ({ status: "CANCELLED" }) },
  all: { label: "All", where: () => ({}) },
};
const SORTS = ["created", "number", "account", "store", "status", "total"] as const;
const ORDER_BY: Record<(typeof SORTS)[number], (d: "asc" | "desc") => Prisma.TradeOrderOrderByWithRelationInput[]> = {
  created: (d) => [{ createdAt: d }],
  number: (d) => [{ number: d }],
  account: (d) => [{ account: { name: d } }, { createdAt: "desc" }],
  store: (d) => [{ store: { name: d } }, { createdAt: "desc" }],
  status: (d) => [{ status: d }, { createdAt: "desc" }],
  total: (d) => [{ totalCents: d }, { createdAt: "desc" }],
};
const FULFIL_TONE = { COURIER: "blue", COLLECT: "orange", SAME_DAY: "violet" } as const;

export default async function TradeOrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await tradeScope();
  const view = sp.view && sp.view in VIEWS ? sp.view : "open";
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const page = pageParam(sp.page);
  const pageSize = 25;
  const { sort, dir } = sortParams(SORTS, sp.sort, sp.dir, "created", view === "open" || view === "pick" || view === "eft" || view === "ready" ? "asc" : "desc");
  const now = new Date();
  const number = q ? tradeNumberQuery(q, "TO") : null;
  const search: Prisma.TradeOrderWhereInput = q
    ? { OR: [...(number ? [{ number }] : []), { number: { contains: q, mode: "insensitive" } }, { invoiceNumber: { contains: q, mode: "insensitive" } }, { account: { OR: [{ name: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }] } }] }
    : {};
  const base: Prisma.TradeOrderWhereInput = { AND: [orderWhere(s), search] };
  const where: Prisma.TradeOrderWhereInput = { AND: [base, VIEWS[view].where(now)] };
  const [total, rows, counts, transit] = await Promise.all([
    db.tradeOrder.count({ where }),
    db.tradeOrder.findMany({
      where, orderBy: ORDER_BY[sort](dir), skip: (page - 1) * pageSize, take: pageSize,
      include: { account: { select: { id: true, number: true, name: true } }, store: { select: { code: true, name: true, kind: true } }, _count: { select: { lines: true } } },
    }),
    db.tradeOrder.groupBy({ by: ["status"], where: base, _count: true }),
    db.tradeOrder.count({ where: { AND: [base, VIEWS.transit.where(now)] } }),
  ]);
  const n = (statuses: TradeOrderStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((t, c) => t + c._count, 0);
  const count: Record<string, number> = {
    open: n(["PENDING_PAYMENT", "PLACED", "PICKING", "READY"]), eft: n(["PENDING_PAYMENT"]), pick: n(["PLACED", "PICKING"]), ready: n(["READY"]), transit, done: n(["SHIPPED", "COLLECTED"]), cancelled: n(["CANCELLED"]),
    all: counts.reduce((t, c) => t + c._count, 0),
  };
  const href = (p: Record<string, string | number | undefined>) => `/hq/trade/orders${qs({ ...sp, ...p })}`;
  const sortHref = (key: string, d: "asc" | "desc") => href({ sort: key, dir: d, page: undefined });
  const tabHref = (v: string) => `/hq/trade/orders${qs({ view: v === "open" ? undefined : v, q: q || undefined })}`;

  return (
    <>
      <PageHeader overline="Trade" title="Trade orders" description="Orders from the trade portal and ones HQ placed for an account: EFT pro formas to confirm, courier orders the DC picks and ships, click & collect orders the stores hand over." />
      {!s.canEdit && <ViewOnly className="mb-6">Orders fulfilled in your region (view only).</ViewOnly>}
      <Card>
        <TabLinks className="px-4" current={tabHref(view)} tabs={Object.entries(VIEWS).map(([k, v]) => ({ href: tabHref(k), label: v.label, count: count[k] }))} />
        <div className="space-y-3 border-b border-ink-100 p-4">
          <FilterForm action="/hq/trade/orders" keep={{ view: view === "open" ? undefined : view, sort: sp.sort, dir: sp.dir }}>
            <SearchField defaultValue={q} placeholder="Order number, invoice number, account name or number" />
          </FilterForm>
          <SavedViews pageKey="hq-trade-orders" userKey={s.user.id} />
          {VIEWS[view].hint && <p className="text-xs text-ink-500">{VIEWS[view].label}: {VIEWS[view].hint}.</p>}
        </div>
        <Table className="relative" stickyFirst minWidth="60rem">
          <thead>
            <tr>
              <SortableTh label="Order" sortKey="created" sort={sort} dir={dir} href={sortHref} title="By date placed" />
              <SortableTh label="Account" sortKey="account" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Fulfilled by" sortKey="store" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Status" sortKey="status" sort={sort} dir={dir} href={sortHref} />
              <SortableTh label="Total incl. VAT" sortKey="total" sort={sort} dir={dir} href={sortHref} align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <TableEmpty cols={5} icon={<PackageCheck className="h-5 w-5" aria-hidden />} title={q ? "No orders match" : view === "open" ? "No open trade orders" : "Nothing here"}>
                {q ? "Try the order number (TO-…), the invoice number or the account's name." : "Orders placed in the trade portal, or by HQ for an account, appear here."}
              </TableEmpty>
            )}
            {rows.map((o) => (
              <Tr key={o.id} href={`/hq/trade/orders/${o.id}`}>
                <Td>
                  <Link href={`/hq/trade/orders/${o.id}`} className="font-mono text-[0.8rem] font-semibold text-ink-900 hover:text-brand-700">{o.number}</Link>
                  <span className="block whitespace-nowrap text-xs text-ink-500">{fmtDateTime(o.createdAt)} · {o._count.lines} line{o._count.lines === 1 ? "" : "s"}{o.invoiceNumber ? ` · ${o.invoiceNumber}` : ""}</span>
                </Td>
                <Td>
                  <span className="text-ink-850">{o.account.name}</span>
                  <span className="block font-mono text-xs text-ink-500">{o.account.number}</span>
                </Td>
                <Td className="text-ink-600">
                  {o.store.name}
                  {o.store.kind === "WAREHOUSE" && <Badge className="ml-2">DC</Badge>}
                  <span className="mt-0.5 block"><Badge tone={FULFIL_TONE[o.fulfilment]}>{FULFIL_LABEL[o.fulfilment]}</Badge></span>
                </Td>
                <Td>
                  <TradeOrderBadge status={o.status} />
                  <span className="mt-0.5 block text-xs text-ink-500">{PAY_LABEL[o.payMethod] ?? o.payMethod}{o.payMethod === "EFT" && o.paidAt ? " · paid" : ""}</span>
                </Td>
                <Td align="right" className="font-medium">{zar(o.totalCents)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
      </Card>
    </>
  );
}
