import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MapPin, Route } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { nextStatuses } from "@/server/orders";
import { invoiceUrl } from "@/server/invoices";
import { zar } from "@/lib/money";
import { fmtDateTime, num } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { displayPhone, PROVINCES } from "@/lib/sa";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, TierBadge } from "@/components/ui/status";
import { Detail } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ConfirmAction, FieldError } from "@/components/hq/action-form";
import { BackLink } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { cancelOrder } from "../actions";

export const metadata = { title: "Online order" };

type Event = { status: string; at: string; note?: string };
const FULFIL = { COLLECT: "Click & collect", SAME_DAY: "Same-day delivery", COURIER: "Courier delivery" } as const;
const PAY = { ONLINE: "Paid online", CARD: "Pay in store", CASH: "Cash", PAYSHAP: "PayShap", EFT: "EFT", LOYALTY: "Points" } as const;

export default async function OrderPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const order = await db.order.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, memberNo: true, phone: true, email: true, tier: true } },
      store: { select: { code: true, name: true, kind: true, addressLine: true, suburb: true, city: true } },
      lines: { include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } } },
      sale: { select: { id: true, number: true, invoiceSentAt: true, pointsEarned: true } },
    },
  });
  if (!order || !ids.includes(order.storeId)) notFound();
  const events = ((order.events as Event[] | null) ?? []).slice().reverse();
  const canCancel = nextStatuses(order).includes("CANCELLED");
  const itemsTotal = order.lines.reduce((s, l) => s + l.totalCents, 0);
  const units = order.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      <BackLink href="/hq/orders">Online orders</BackLink>
      <PageHeader
        overline={`${FULFIL[order.fulfilment]} · ${fmtDateTime(order.createdAt)}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{order.code}</span>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.paymentStatus} />
          </span>
        }
        description={`${num(units)} item${units === 1 ? "" : "s"} · ${zar(order.totalCents)} · fulfilled by ${order.store.name}`}
        actions={
          order.store.kind === "RETAIL" && (
            <ButtonLink href={`/store/${order.store.code}/orders`} variant="outline">
              Store&apos;s order queue <ExternalLink className="h-4 w-4" />
            </ButtonLink>
          )
        }
      />

      <Flash message={sp.m} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Items" />
            <Table stickyFirst className="relative mt-4">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right" className="hidden sm:table-cell">Unit</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <Tr key={l.id}>
                    <Td>
                      <span className="font-medium text-ink-850">{l.variant.product.name} · {l.variant.name}</span>
                      <span className="block font-mono text-xs text-ink-500">{l.variant.sku}</span>
                    </Td>
                    <Td align="right">{l.qty}</Td>
                    <Td align="right" className="hidden sm:table-cell">{zar(l.unitPriceCents)}</Td>
                    <Td align="right">{zar(l.totalCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <CardBody>
              <dl className="ml-auto max-w-xs divide-y divide-ink-100 text-sm">
                <Detail label="Items">{zar(itemsTotal)}</Detail>
                {order.discountCents > 0 && <Detail label={`Discount${order.promoCode ? ` (${order.promoCode})` : ""}`}>−{zar(order.discountCents)}</Detail>}
                <Detail label="Delivery">{order.deliveryCents ? zar(order.deliveryCents) : "Free"}</Detail>
                {order.pointsRedeemed > 0 && <Detail label="Points redeemed">−{zar(order.pointsRedeemed * 100)} ({fmtPoints(order.pointsRedeemed)})</Detail>}
                <Detail label="Total incl. VAT">
                  <span className="font-display text-base">{zar(order.totalCents)}</span>
                </Detail>
                <Detail label="VAT">{zar(order.vatCents)}</Detail>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="relative space-y-4 border-l border-ink-150 pl-5">
                {events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ring-4 ring-white ${i === 0 ? "bg-brand-500" : "bg-ink-300"}`} aria-hidden />
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={e.status} />
                      <span className="text-xs text-ink-500">{fmtDateTime(e.at)}</span>
                    </div>
                    {e.note && <p className="mt-1 text-sm text-ink-700">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Member" />
            <CardBody>
              <Link href={`/hq/customers/${order.customer.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                {order.customer.firstName} {order.customer.lastName ?? ""}
              </Link>
              <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                <span className="font-mono">{order.customer.memberNo}</span>
                <TierBadge tier={order.customer.tier} />
              </div>
              <dl className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                <Detail label="Mobile">{displayPhone(order.customer.phone)}</Detail>
                <Detail label="Email">{order.customer.email ?? "—"}</Detail>
                <Detail label="ID checked at handover">{order.status === "COMPLETED" ? (order.idChecked ? "Yes" : "No") : "—"}</Detail>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={order.fulfilment === "COLLECT" ? "Collection" : "Delivery"} />
            <CardBody className="space-y-3 text-sm">
              {order.fulfilment === "COLLECT" ? (
                <p className="flex gap-2 text-ink-700">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                  <span>
                    Herbal Holland {order.store.name}
                    <span className="block text-ink-500">{order.store.addressLine}, {order.store.suburb}, {order.store.city}</span>
                  </span>
                </p>
              ) : (
                <p className="flex gap-2 text-ink-700">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                  <span>
                    {order.addressLine}
                    <span className="block text-ink-500">{[order.suburb, order.city, order.province ? PROVINCES[order.province] : null, order.postalCode].filter(Boolean).join(", ")}</span>
                    {order.deliveryNotes && <span className="mt-1 block text-xs text-ink-500">“{order.deliveryNotes}”</span>}
                  </span>
                </p>
              )}
              {order.routingNote && (
                <p className="flex gap-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
                  <Route className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                  <span>
                    <b className="text-ink-800">Routing:</b> {order.routingNote}
                  </span>
                </p>
              )}
              <dl className="divide-y divide-ink-100 border-t border-ink-100">
                <Detail label="Fulfilled by">
                  <Link href={order.store.kind === "RETAIL" ? `/hq/stores/${order.store.code}` : `/hq/distribution?dc=${order.store.code}`} className="hover:text-brand-700">
                    {order.store.name}
                  </Link>
                </Detail>
                {order.courier && <Detail label="Courier">{order.courier}</Detail>}
                {order.trackingNo && <Detail label="Tracking">{order.trackingNo}</Detail>}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment" />
            <CardBody>
              <dl className="divide-y divide-ink-100">
                <Detail label="Method">{PAY[order.payMethod]}</Detail>
                <Detail label="Status">
                  <StatusBadge status={order.paymentStatus} />
                </Detail>
                {order.paymentRef && <Detail label="Reference"><span className="font-mono text-xs">{order.paymentRef}</span></Detail>}
                {order.sale && (
                  <Detail label="Tax invoice">
                    <a href={invoiceUrl(order.sale.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand-700">
                      {order.sale.number} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Detail>
                )}
                {order.sale && order.sale.pointsEarned > 0 && <Detail label="Points earned">{fmtPoints(order.sale.pointsEarned)}</Detail>}
              </dl>
            </CardBody>
          </Card>

          {canCancel && (
            <Card>
              <CardHeader title="Member service" description="Cancelling releases the stock, returns points and refunds online payments" />
              <CardBody>
                <ConfirmAction action={cancelOrder.bind(null, order.id)} label="Cancel order" title={`Cancel order ${order.code}?`} confirmLabel="Cancel order" className="w-full">
                  <Field label="Reason (the member is told their order was cancelled)" htmlFor="cancel-reason">
                    <Textarea id="cancel-reason" name="reason" className="min-h-16" placeholder="e.g. Member asked to cancel by phone" />
                    <FieldError name="reason" />
                  </Field>
                  {order.paymentStatus === "PAID" && <Badge tone="amber">Paid online — cancelling refunds it in full</Badge>}
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
