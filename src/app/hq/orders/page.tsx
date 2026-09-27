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
import { zar, zarCompact } from "@/lib/money";
import { addDays, fmtDateTime, num } from "@/lib/format";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Stat } from "@/components/ui/stat";
import { TabLinks } from "@/components/ui/tabs";
import { Field, Input } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { Pagination, pageParam } from "@/components/ui/pagination";
import { FilterForm, FilterSelect, SearchField } from "@/components/hq/filter-form";
import { ActionForm, FieldError, SubmitButton } from "@/components/hq/action-form";
import { EmptyRow, ViewOnly } from "@/components/hq/ui";
import { saveEcommerceSettings } from "./actions";
import type { Fulfilment, OrderStatus, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Online orders" };

type SP = { tab?: string; q?: string; status?: string; fulfilment?: string; store?: string; from?: string; to?: string; page?: string };
const STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "PLACED", "PICKING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"];
const FULFIL: Record<Fulfilment, [string, Tone]> = { COLLECT: ["Click & collect", "neutral"], SAME_DAY: ["Same-day", "violet"], COURIER: ["Courier", "blue"] };
const OPEN: OrderStatus[] = ["PLACED", "PICKING", "READY", "OUT_FOR_DELIVERY"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const settingsTab = sp.tab === "settings";
  const page = pageParam(sp.page);
  const pageSize = 25;
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
          orderBy: { createdAt: "desc" },
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
  const e = settings.ecommerce;
  const rand = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, "");

  return (
    <>
      <PageHeader overline="Supply" title="Online orders" description="One web shop for the whole network. Orders route to the store or DC that can fill them fastest; stores fulfil and hand over with an ID check." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open orders" value={num(OPEN.reduce((s, x) => s + qn(x), 0))} sub={`${num(qn("READY"))} ready · ${num(qn("OUT_FOR_DELIVERY"))} out for delivery`} />
        <Stat label="Awaiting payment" value={num(qn("PENDING_PAYMENT"))} sub={`auto-cancel after ${e.unpaidHoldMinutes} min`} />
        <Stat label="Online sales · 30 days" value={zarCompact(online.netCents)} sub="net of VAT, fulfilled" />
        <Stat label="Online orders · 30 days" value={num(online.sales)} sub={online.atvCents ? `ATV ${zar(online.atvCents)}` : undefined} />
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
            {!can(user, "admin") && <ViewOnly className="mb-4">View only — set by the HQ administrator.</ViewOnly>}
            <ActionForm action={saveEcommerceSettings}>
              <fieldset disabled={!can(user, "admin")} className="min-w-0 grid gap-4 sm:grid-cols-3">
                <Field label="Same-day delivery fee (R)" htmlFor="sameDayFee">
                  <Input id="sameDayFee" name="sameDayFee" defaultValue={rand(e.sameDayFeeCents)} inputMode="decimal" />
                  <FieldError name="sameDayFee" />
                </Field>
                <Field label="Courier fee (R)" htmlFor="courierFee">
                  <Input id="courierFee" name="courierFee" defaultValue={rand(e.courierFeeCents)} inputMode="decimal" />
                  <FieldError name="courierFee" />
                </Field>
                <Field label="Free delivery over (R)" htmlFor="freeDeliveryOver">
                  <Input id="freeDeliveryOver" name="freeDeliveryOver" defaultValue={rand(e.freeDeliveryOverCents)} inputMode="decimal" />
                  <FieldError name="freeDeliveryOver" />
                </Field>
                <Field label="Merch courier (R)" htmlFor="merchCourier" hint="Made-to-order merch: the print partner's courier, always on top">
                  <Input id="merchCourier" name="merchCourier" defaultValue={rand(e.merchCourierCents)} inputMode="decimal" />
                  <FieldError name="merchCourier" />
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
          <div className="border-b border-ink-100 p-4">
            <FilterForm action="/hq/orders">
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
          </div>
          <Table className="relative">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th className="hidden md:table-cell">Fulfilled by</Th>
                <Th className="hidden sm:table-cell">Fulfilment</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <EmptyRow cols={6}>
                  <ShoppingBag className="mx-auto mb-2 h-6 w-6 text-ink-300" aria-hidden />
                  No orders match these filters.
                </EmptyRow>
              )}
              {orders.map((o) => (
                <Tr key={o.id}>
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
                  <Td className="hidden text-ink-600 md:table-cell">
                    {o.store.name}
                    {o.store.kind === "WAREHOUSE" && <Badge className="ml-2">DC</Badge>}
                  </Td>
                  <Td className="hidden sm:table-cell">
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
