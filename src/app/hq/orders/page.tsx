import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { salesSummary } from "@/server/finance";
import { can } from "@/server/hq/guard";
import { qs, parseDay } from "@/server/hq/form";
import { resolveRange } from "@/lib/ranges";
import { centsToInput, zar, zarCompact } from "@/lib/money";
import { addDays, fmtDateTime, num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { TabLinks } from "@/components/ui/tabs";
import { Field, Input } from "@/components/ui/form";
import { Table, Td, Tr, SortableTh, TableEmpty, sortParams } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { ActionForm, FieldError, SubmitButton } from "@/components/ui/action-form";
import { ViewOnly } from "@/components/hq/ui";
import { SavedViews } from "@/components/admin/saved-views";
import { saveEcommerceSettings } from "./actions";
import type { Fulfilment, OrderStatus, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Online orders" };

type SP = { tab?: string; q?: string; status?: string; fulfilment?: string; store?: string; from?: string; to?: string; sort?: string; dir?: string; page?: string };
const STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "PLACED", "PICKING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"];
const FULFIL: Record<Fulfilment, [string, Tone]> = { COLLECT: ["Click & collect", "neutral"], SAME_DAY: ["Same-day", "violet"], COURIER: ["Courier", "blue"] };
const OPEN: OrderStatus[] = ["PLACED", "PICKING", "READY", "OUT_FOR_DELIVERY"];
const SORTS = ["created", "member", "store", "fulfilment", "status", "total"] as const;
const ORDER_BY: Record<(typeof SORTS)[number], (d: "asc" | "desc") => Prisma.OrderOrderByWithRelationInput[]> = {
  created: (d) => [{ createdAt: d }],
  member: (d) => [{ customer: { firstName: d } }, { customer: { lastName: d } }, { createdAt: "desc" }],
  store: (d) => [{ store: { name: d } }, { createdAt: "desc" }],
  fulfilment: (d) => [{ fulfilment: d }, { createdAt: "desc" }],
  status: (d) => [{ status: d }, { createdAt: "desc" }],
  total: (d) => [{ totalCents: d }, { createdAt: "desc" }],
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const settingsTab = sp.tab === "settings";
  const page = pageParam(sp.page);
  const pageSize = 25;
  const { sort, dir } = sortParams(SORTS, sp.sort, sp.dir, "created", "desc");
  const q = sp.q?.trim();
  const from = parseDay(sp.from);
  const to = parseDay(sp.to);
  const where: Prisma.OrderWhereInput = {
    AND: [
      { storeId: { in: ids } },
      STATUSES.includes(sp.status as OrderStatus) ? { status: sp.status as OrderStatus } : sp.status === "OPEN" ? { status: { in: OPEN } } : {},
      sp.fulfilment && sp.fulfilment in FULFIL ? { fulfilment: sp.fulfilment as Fulfilment } : {},
      sp.store ? { store: { code: sp.store } } : {},
      from ? { createdAt: { gte: from } } : {},
      to ? { createdAt: { lt: addDays(to, 1) } } : {},
      q ? { OR: [{ code: { equals: q.toUpperCase() } }, { code: { startsWith: q.toUpperCase() } }, { customer: { memberNo: q.toUpperCase() } }] } : {},
    ],
  };
  const r30 = resolveRange({ range: "30d" });
  const [total, orders, queue, online, stores, settings] = await Promise.all([
    db.order.count({ where }),
    settingsTab
      ? []
      : db.order.findMany({
          where,
          include: { customer: { select: { id: true, firstName: true, lastName: true, memberNo: true } }, store: { select: { code: true, name: true, kind: true } } },
          orderBy: ORDER_BY[sort](dir),
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
    db.order.groupBy({ by: ["status"], where: { storeId: { in: ids }, status: { in: ["PENDING_PAYMENT", ...OPEN] } }, _count: true }),
    salesSummary(ids, r30, "ONLINE"),
    db.store.findMany({ where: { id: { in: ids } }, select: { code: true, name: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  const qn = (s: OrderStatus) => queue.find((x) => x.status === s)?._count ?? 0;
  const href = (p: Record<string, string | number | undefined>) => `/hq/orders${qs({ ...sp, ...p })}`;
  const sortHref = (key: string, d: "asc" | "desc") => href({ sort: key, dir: d, page: undefined });
  const e = settings.ecommerce;

  return (
    <>
      <PageHeader overline="Supply" title="Online orders" description="One web shop for the whole network. Orders route to the store or DC that can fill them fastest; stores fulfil and hand over with an ID check." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open orders" value={num(OPEN.reduce((s, x) => s + qn(x), 0))} sub={`${num(qn("READY"))} ready · ${num(qn("OUT_FOR_DELIVERY"))} out for delivery`} />
        <Stat label="Awaiting payment" value={num(qn("PENDING_PAYMENT"))} sub={`auto-cancel after ${e.unpaidHoldMinutes} min`} />
        <Stat label="Online sales · 30 days" value={zarCompact(online.netCents)} sub="net of VAT, fulfilled" />
        <Stat label="Online orders · 30 days" value={num(online.sales)} sub={online.atvCents ? `Average basket ${zar(online.atvCents)}` : undefined} />
      </div>
      <TabLinks
        className="mb-4"
        current={settingsTab ? "/hq/orders?tab=settings" : "/hq/orders"}
        tabs={[
          { href: "/hq/orders", label: "Orders" },
          { href: "/hq/orders?tab=settings", label: "Delivery & collection settings" },
        ]}
      />
      {settingsTab ? (
        <Card className="max-w-3xl">
          <CardHeader title="Delivery & collection" description="Fees are VAT-inclusive. Free delivery applies on baskets over the threshold; Bloom and Harvest members always get free same-day delivery." />
          <CardBody>
            {!can(user, "admin") && <ViewOnly className="mb-4">View only: set by the HQ administrator.</ViewOnly>}
            <ActionForm action={saveEcommerceSettings}>
              <fieldset disabled={!can(user, "admin")} className="min-w-0 grid gap-4 sm:grid-cols-3">
                <Field label="Same-day delivery fee (R)" htmlFor="sameDayFee">
                  <Input id="sameDayFee" name="sameDayFee" defaultValue={centsToInput(e.sameDayFeeCents)} inputMode="decimal" />
                  <FieldError name="sameDayFee" />
                </Field>
                <Field label="Courier fee (R)" htmlFor="courierFee">
                  <Input id="courierFee" name="courierFee" defaultValue={centsToInput(e.courierFeeCents)} inputMode="decimal" />
                  <FieldError name="courierFee" />
                </Field>
                <Field label="Free delivery over (R)" htmlFor="freeDeliveryOver">
                  <Input id="freeDeliveryOver" name="freeDeliveryOver" defaultValue={centsToInput(e.freeDeliveryOverCents)} inputMode="decimal" />
                  <FieldError name="freeDeliveryOver" />
                </Field>
                <Field label="Merch courier (R)" htmlFor="merchCourier" hint="Made-to-order merch: the merch partner's courier, always on top">
                  <Input id="merchCourier" name="merchCourier" defaultValue={centsToInput(e.merchCourierCents)} inputMode="decimal" />
                  <FieldError name="merchCourier" />
                </Field>
                <Field label="Merch notice" htmlFor="merchNotice" hint="Shown with made-to-order merch in the shop, e.g. the partner's festive closure. Leave empty when there's nothing to say." className="sm:col-span-3">
                  <Input id="merchNotice" name="merchNotice" defaultValue={e.merchNotice} maxLength={200} placeholder="Order by 10 December for Christmas. Orders after that ship from 12 January." />
                  <FieldError name="merchNotice" />
                </Field>
                <Field label="Same-day cut-off (hour)" htmlFor="sameDayCutoffHour" hint="Orders after this ship next day">
                  <Input id="sameDayCutoffHour" name="sameDayCutoffHour" defaultValue={e.sameDayCutoffHour} inputMode="numeric" />
                  <FieldError name="sameDayCutoffHour" />
                </Field>
                <Field label="Unpaid order hold (minutes)" htmlFor="unpaidHoldMinutes" hint="Then cancelled and stock released (min 15)">
                  <Input id="unpaidHoldMinutes" name="unpaidHoldMinutes" defaultValue={e.unpaidHoldMinutes} inputMode="numeric" />
                  <FieldError name="unpaidHoldMinutes" />
                </Field>
                <Field label="Collection hold (days)" htmlFor="collectHoldDays" hint="Pay-in-store orders not collected are cancelled (min 1)">
                  <Input id="collectHoldDays" name="collectHoldDays" defaultValue={e.collectHoldDays} inputMode="numeric" />
                  <FieldError name="collectHoldDays" />
                </Field>
              </fieldset>
              {can(user, "admin") && (
                <div className="mt-5 flex justify-end">
                  <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
                </div>
              )}
            </ActionForm>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="space-y-3 border-b border-ink-100 p-4">
            <FilterForm action="/hq/orders" keep={{ sort: sp.sort, dir: sp.dir }}>
              <SearchField defaultValue={sp.q} placeholder="Order code or member no." />
              <FilterSelect name="status" label="Status" defaultValue={sp.status} options={[{ value: "OPEN", label: "All open" }, ...STATUSES.map((s) => ({ value: s, label: s.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) }))]} />
              <FilterSelect name="fulfilment" label="Fulfilment" defaultValue={sp.fulfilment} options={Object.entries(FULFIL).map(([k, [l]]) => ({ value: k, label: l }))} />
              {stores.length > 1 && <FilterSelect name="store" label="Store" defaultValue={sp.store} options={stores.map((s) => ({ value: s.code, label: s.name }))} />}
              <label className="block">
                <span className="sr-only">From date</span>
                <input type="date" name="from" defaultValue={sp.from} aria-label="From date" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
              </label>
              <label className="block">
                <span className="sr-only">To date</span>
                <input type="date" name="to" defaultValue={sp.to} aria-label="To date" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15" />
              </label>
            </FilterForm>
            <SavedViews pageKey="hq-orders" userKey={user.id} />
          </div>
          <Table className="relative" stickyFirst minWidth="52rem">
            <thead>
              <tr>
                <SortableTh label="Order" sortKey="created" sort={sort} dir={dir} href={sortHref} title="Newest first" />
                <SortableTh label="Member" sortKey="member" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="Fulfilled by" sortKey="store" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="Fulfilment" sortKey="fulfilment" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="Status" sortKey="status" sort={sort} dir={dir} href={sortHref} />
                <SortableTh label="Total" sortKey="total" sort={sort} dir={dir} href={sortHref} align="right" />
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <TableEmpty cols={6} icon={<ShoppingBag className="h-5 w-5" aria-hidden />} title="No orders match these filters">
                  Try another status, store or date range.
                </TableEmpty>
              )}
              {orders.map((o) => (
                <Tr key={o.id} href={`/hq/orders/${o.code}`}>
                  <Td>
                    <Link href={`/hq/orders/${o.code}`} className="font-mono text-[0.8rem] font-semibold text-ink-900 hover:text-brand-700">
                      {o.code}
                    </Link>
                    <span className="block whitespace-nowrap text-xs text-ink-500">{fmtDateTime(o.createdAt)}</span>
                  </Td>
                  <Td>
                    <span className="text-ink-850">{o.customer.firstName} {o.customer.lastName ?? ""}</span>
                    <span className="block font-mono text-xs text-ink-500">{o.customer.memberNo}</span>
                  </Td>
                  <Td className="text-ink-600">
                    {o.store.name}
                    {o.store.kind === "WAREHOUSE" && <Badge className="ml-2">DC</Badge>}
                  </Td>
                  <Td>
                    <Badge tone={FULFIL[o.fulfilment][1]}>{FULFIL[o.fulfilment][0]}</Badge>
                  </Td>
                  <Td>
                    <StatusBadge status={o.status} />
                    {o.paymentStatus !== "PAID" && o.status !== "CANCELLED" && <span className="mt-0.5 block text-xs text-amber-700">{o.paymentStatus === "REFUNDED" ? "Refunded" : "Unpaid"}</span>}
                  </Td>
                  <Td align="right" className="font-medium">{zar(o.totalCents)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={total} href={(p) => href({ page: p })} />
        </Card>
      )}
    </>
  );
}
