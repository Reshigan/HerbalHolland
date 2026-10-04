import Link from "next/link";
import { Mail, PackageCheck, Plus, Truck } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { stockAlerts } from "@/server/dashboard";
import { receivedValue } from "@/server/stock-orders";
import { PO_TABS, stockOrderList } from "@/server/store/purchasing";
import { hrefWith, sp1 } from "@/server/store/rules";
import { zar, zarCompact } from "@/lib/money";
import { fmtDate, timeAgo } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { TabLinks } from "@/components/ui/tabs";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { plural } from "@/lib/plural";

export const metadata = { title: "Purchasing" };
const PAGE_SIZE = 20;
type SP = Record<string, string | string[] | undefined>;

export default async function PurchasingPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const path = `/store/${store.code}/purchasing`;
  const tab = sp1(sp.tab) in PO_TABS ? sp1(sp.tab) : "open";
  const page = pageParam(sp.page);
  const monthStart = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit" }).format(new Date())}-01T00:00:00+02:00`);

  const [counts, list, alerts, openValue, receivedMonth] = await Promise.all([
    db.stockOrder.groupBy({ by: ["status"], where: { buyerId: store.id }, _count: true }),
    stockOrderList({ buyerId: store.id, status: { in: PO_TABS[tab].statuses } }, page, PAGE_SIZE),
    stockAlerts([store.id]),
    db.stockOrder.aggregate({ where: { buyerId: store.id, status: { in: ["SUBMITTED", "APPROVED", "SHIPPED"] } }, _sum: { totalCents: true } }),
    db.stockOrder.findMany({ where: { buyerId: store.id, status: "RECEIVED", receivedAt: { gte: monthStart } }, include: { lines: true } }),
  ]);
  const n = (statuses: string[]) => counts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c._count, 0);
  const inTransit = n(["SHIPPED"]);

  return (
    <>
      <PageHeader
        overline={`Buying · ${store.name}`}
        title="Purchasing"
        description={`Stock you buy from ${store.dc?.name ?? "your distribution centre"} and from other Herbal Holland stores. Tax invoices are emailed on receipt and settled on your monthly franchise statement.`}
        actions={
          canManage && (
            <ButtonLink href={`${path}/new`}>
              <Plus className="h-4 w-4" aria-hidden /> New order
            </ButtonLink>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="On order" value={zarCompact(openValue._sum.totalCents ?? 0)} sub={`${n(["SUBMITTED", "APPROVED", "SHIPPED"])} open order${n(["SUBMITTED", "APPROVED", "SHIPPED"]) === 1 ? "" : "s"}, incl. VAT`} />
        <Stat label="Deliveries to receive" value={inTransit.toLocaleString()} sub={inTransit ? "in transit — receive on arrival" : "nothing in transit"} />
        <Stat label="Received this month" value={zarCompact(receivedMonth.reduce((s, o) => s + receivedValue(o), 0))} sub={`${plural(receivedMonth.length, "delivery", "deliveries")}, incl. VAT`} />
        <Stat
          label="Below reorder point"
          value={alerts.low.toLocaleString()}
          sub={alerts.low && canManage ? <Link href={`${path}/new`} className="font-semibold text-brand-700 hover:underline">Build a replenishment order →</Link> : "SKUs"}
        />
      </div>

      {inTransit > 0 && tab !== "transit" && (
        <Link href={hrefWith(path, {}, { tab: "transit" })} className="mt-6 flex items-center gap-3 rounded-2xl bg-ink-950 p-4 text-white transition hover:bg-ink-900">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-ink-950">
            <Truck className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex-1 text-sm">
            <b className="font-display text-base">{inTransit} deliver{inTransit === 1 ? "y is" : "ies are"} on the way.</b>
            <span className="block text-ink-300">Check each box against the delivery note and receive it — stock only becomes sellable once received.</span>
          </span>
          <span className="text-sm font-semibold text-brand-400">Receive →</span>
        </Link>
      )}

      <Card className="mt-6">
        <TabLinks
          className="px-4"
          current={hrefWith(path, {}, { tab: tab === "open" ? null : tab })}
          tabs={Object.entries(PO_TABS).map(([k, t]) => ({ href: hrefWith(path, {}, { tab: k === "open" ? null : k }), label: t.label, count: n(t.statuses) }))}
        />
        {list.rows.length === 0 ? (
          <EmptyState icon={<PackageCheck className="h-5 w-5" />} title="No orders here" action={canManage && tab === "open" && <ButtonLink href={`${path}/new`} size="sm">Build an order</ButtonLink>}>
            {tab === "transit" ? "Nothing is on its way right now." : "Orders you place will show up here."}
          </EmptyState>
        ) : (
          <Table stickyFirst>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Supplier</Th>
                <Th align="right">Units</Th>
                <Th align="right">Value incl. VAT</Th>
                <Th>Status</Th>
                <Th>Last update</Th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((o) => {
                const units = o.lines.reduce((s, l) => s + l.qty, 0);
                const recv = o.status === "RECEIVED" ? o.lines.reduce((s, l) => s + (l.receivedQty ?? 0), 0) : null;
                const last = o.receivedAt ?? o.shippedAt ?? o.approvedAt ?? o.submittedAt ?? o.createdAt;
                return (
                  <Tr key={o.id}>
                    <Td>
                      <Link href={`${path}/${o.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                        {o.number}
                      </Link>
                      <div className="text-xs text-ink-500">Created {fmtDate(o.createdAt)}</div>
                    </Td>
                    <Td>
                      <div className="font-medium text-ink-850">{o.seller.name}</div>
                      <Badge tone={o.kind === "WHOLESALE" ? "neutral" : "violet"}>{o.kind === "WHOLESALE" ? "Wholesale" : "Network"}</Badge>
                    </Td>
                    <Td align="right">
                      {recv != null && recv !== units ? (
                        <span title="Received / ordered">
                          <span className="font-semibold text-amber-700">{recv}</span> / {units}
                        </span>
                      ) : (
                        units.toLocaleString()
                      )}
                    </Td>
                    <Td align="right" className="font-medium text-ink-900">
                      {zar(o.status === "RECEIVED" ? receivedValue(o) : o.totalCents)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={o.status} />
                        {o.invoiceSentAt && <Mail className="h-3.5 w-3.5 text-ink-400" aria-label="Tax invoice emailed" />}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-600">{timeAgo(last)}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="border-t border-ink-100">
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.total} href={(p) => hrefWith(path, sp, { page: p })} />
        </div>
      </Card>
    </>
  );
}
