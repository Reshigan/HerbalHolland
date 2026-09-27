import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, PackageCheck, X } from "lucide-react";
import { requireStaff, HQ_ROLES } from "@/server/auth";
import { scopeOf, scopedStoreIds } from "@/server/scope";
import { db } from "@/server/db";
import { availability, availKey } from "@/server/inventory";
import { receivedValue } from "@/server/stock-orders";
import { can } from "@/server/hq/guard";
import { pickList } from "@/server/hq/distribution";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status";
import { Badge } from "@/components/ui/badge";
import { Detail } from "@/components/ui/misc";
import { Field, Textarea } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ActionButton, ConfirmAction, FieldError } from "@/components/hq/action-form";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { actOnDcOrder } from "../actions";

export const metadata = { title: "Store order" };

type Shipped = { batchId: string; qty: number }[];

export default async function DcOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireStaff(HQ_ROLES);
  const scope = scopeOf(user);
  const ids = await scopedStoreIds(scope);
  const order = await db.stockOrder.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, code: true, name: true, addressLine: true, suburb: true, city: true, company: { select: { legalName: true, vatNumber: true } } } },
      seller: { select: { id: true, code: true, name: true, kind: true } },
      lines: { include: { variant: { select: { sku: true, name: true, product: { select: { name: true } } } } } },
    },
  });
  if (!order || !ids.includes(order.buyerId)) notFound();
  const [avail, picks, batches, createdBy] = await Promise.all([
    availability([order.sellerId], order.lines.map((l) => l.variantId)),
    order.status === "APPROVED" || order.status === "SUBMITTED" ? pickList(order) : null,
    db.batch.findMany({ where: { id: { in: order.lines.flatMap((l) => ((l.shipped as Shipped | null) ?? []).map((s) => s.batchId)) } }, select: { id: true, code: true, expiresAt: true } }),
    order.createdById ? db.user.findUnique({ where: { id: order.createdById }, select: { name: true } }) : null,
  ]);
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const act = can(user, "network") && order.seller.kind === "WAREHOUSE";
  const units = order.lines.reduce((s, l) => s + l.qty, 0);
  const short = picks ? [...picks.values()].reduce((s, p) => s + p.short, 0) : 0;
  const timeline = [
    ["Created", order.createdAt, createdBy?.name],
    ["Submitted", order.submittedAt],
    ["Approved", order.approvedAt],
    ["Shipped", order.shippedAt],
    ["Received", order.receivedAt],
  ] as const;

  return (
    <>
      <BackLink href={`/hq/distribution?dc=${order.seller.code}`}>Distribution · {order.seller.name}</BackLink>
      <PageHeader
        overline={`${order.kind === "WHOLESALE" ? "Wholesale order" : "Network trade"} · ${order.seller.name} → ${order.buyer.name}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{order.number}</span>
            <StatusBadge status={order.status} />
          </span>
        }
        description={`${order.lines.length} lines · ${num(units)} units · ${zar(order.totalCents)} incl. VAT`}
      />
      <Flash message={sp.m} />
      {order.notes && <Notice className="mb-6" title="Notes">{order.notes.split("\n").map((n, i) => <span key={i} className="block">{n}</span>)}</Notice>}
      {short > 0 && order.status !== "SHIPPED" && (
        <Notice tone="warn" className="mb-6" title="Not enough released stock at the DC">
          {num(short)} units can&apos;t be picked right now. Shipping sends what&apos;s available; the shortfall shows on the order and the store isn&apos;t invoiced for it.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Actions" />
            <CardBody className="space-y-3">
              {!act && <ViewOnly>Orders are approved and shipped by the HQ distribution team.</ViewOnly>}
              {act && order.status === "SUBMITTED" && (
                <>
                  <ActionButton action={actOnDcOrder.bind(null, order.id, "approve")} variant="dark" size="md" pendingLabel="Approving…" className="w-full">
                    <Check className="h-4 w-4" /> Approve order
                  </ActionButton>
                  <ConfirmAction action={actOnDcOrder.bind(null, order.id, "reject")} label="Reject" icon={<X className="h-4 w-4" />} title="Reject this order" confirmLabel="Reject order" className="w-full">
                    <Field label="Reason for the store" htmlFor="reject-reason">
                      <Textarea id="reject-reason" name="reason" className="min-h-16" placeholder="e.g. Duplicate of PO-000123" />
                      <FieldError name="reason" />
                    </Field>
                  </ConfirmAction>
                </>
              )}
              {act && order.status === "APPROVED" && (
                <>
                  <ConfirmAction
                    action={actOnDcOrder.bind(null, order.id, "ship")}
                    label="Ship order"
                    icon={<PackageCheck className="h-4 w-4" />}
                    triggerVariant="primary"
                    variant="primary"
                    title="Ship now?"
                    confirmLabel="Confirm shipment"
                    className="w-full"
                  >
                    <p>Stock leaves {order.seller.name} from the batches on the pick list (first expiry first). {short > 0 ? `${num(short)} units will ship short.` : "Everything is available."}</p>
                  </ConfirmAction>
                  <ConfirmAction action={actOnDcOrder.bind(null, order.id, "cancel")} label="Cancel order" title="Cancel this order" confirmLabel="Cancel order" className="w-full">
                    <Field label="Reason for the store" htmlFor="cancel-reason">
                      <Textarea id="cancel-reason" name="reason" className="min-h-16" />
                      <FieldError name="reason" />
                    </Field>
                  </ConfirmAction>
                </>
              )}
              {order.status === "SHIPPED" && <p className="text-sm text-ink-600">In transit. {order.buyer.name} books it in on arrival from their back office; they&apos;re invoiced for what they receive.</p>}
              {(order.status === "RECEIVED" || order.status === "REJECTED" || order.status === "CANCELLED") && <p className="text-sm text-ink-600">This order is closed.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Deliver to" />
            <CardBody>
              <div className="text-sm">
                <Link href={`/hq/stores/${order.buyer.code}`} className="font-semibold text-ink-900 hover:text-oranje-700">
                  Herbal Holland {order.buyer.name}
                </Link>
                <p className="text-ink-600">{order.buyer.addressLine}, {order.buyer.suburb}, {order.buyer.city}</p>
                <p className="mt-1 text-xs text-ink-500">{order.buyer.company.legalName}{order.buyer.company.vatNumber ? ` · VAT ${order.buyer.company.vatNumber}` : " · not VAT registered"}</p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="space-y-3">
                {timeline.map(([label, at, who]) => (
                  <li key={label} className="flex items-start gap-3 text-sm">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${at ? "bg-oranje-500" : "bg-ink-200"}`} aria-hidden />
                    <span className="flex-1">
                      <span className={at ? "font-medium text-ink-900" : "text-ink-400"}>{label}</span>
                      {who && <span className="text-ink-500"> by {who}</span>}
                    </span>
                    <span className="text-xs text-ink-500">{at ? fmtDateTime(at) : "—"}</span>
                  </li>
                ))}
              </ol>
              <dl className="mt-4 divide-y divide-ink-100 border-t border-ink-100">
                <Detail label="Invoice emailed">{order.invoiceSentAt ? fmtDateTime(order.invoiceSentAt) : "On receipt"}</Detail>
              </dl>
            </CardBody>
          </Card>
        </div>
        <Card className="mt-6">
          <CardHeader title={order.status === "APPROVED" ? "Pick list" : "Lines"} description={order.status === "APPROVED" ? "Pick first-expiry-first-out from these batches" : undefined} />
          <Table className="relative mt-4">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th align="right">Ordered</Th>
                <Th align="right" className="hidden sm:table-cell">Unit ex VAT</Th>
                {order.status === "SUBMITTED" || order.status === "APPROVED" ? <Th>Pick from (FEFO)</Th> : <Th>Batches shipped</Th>}
                <Th align="right">{order.status === "RECEIVED" ? "Received" : order.status === "SHIPPED" ? "Shipped" : "DC available"}</Th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => {
                const p = picks?.get(l.id);
                const shipped = (l.shipped as Shipped | null) ?? [];
                const a = avail.get(availKey(order.sellerId, l.variantId))?.available ?? 0;
                return (
                  <Tr key={l.id} className="align-top">
                    <Td>
                      <span className="font-medium text-ink-850">{l.variant.product.name} · {l.variant.name}</span>
                      <span className="block font-mono text-xs text-ink-500">{l.variant.sku}</span>
                    </Td>
                    <Td align="right" className="font-semibold">{num(l.qty)}</Td>
                    <Td align="right" className="hidden sm:table-cell">{zar(l.unitCostCents)}</Td>
                    <Td>
                      {p ? (
                        <ul className="space-y-1">
                          {p.picks.map((x) => (
                            <li key={x.batchId} className="flex items-center gap-2 text-xs">
                              <span className="tnum w-8 text-right font-semibold text-ink-900">{x.qty}×</span>
                              <Link href={`/hq/batches/${x.batchId}`} className="font-mono text-ink-700 hover:text-oranje-700">{x.code}</Link>
                              {x.expiresAt && <span className="text-ink-400">exp {fmtDate(x.expiresAt)}</span>}
                            </li>
                          ))}
                          {p.short > 0 && <li><Badge tone="red">{p.short} short</Badge></li>}
                        </ul>
                      ) : shipped.length ? (
                        <ul className="space-y-1">
                          {shipped.map((s) => (
                            <li key={s.batchId} className="flex items-center gap-2 text-xs">
                              <span className="tnum w-8 text-right font-semibold text-ink-900">{s.qty}×</span>
                              <Link href={`/hq/batches/${s.batchId}`} className="font-mono text-ink-700 hover:text-oranje-700">{batchById.get(s.batchId)?.code ?? "batch"}</Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      {order.status === "RECEIVED" ? (
                        <span className={(l.receivedQty ?? 0) < l.qty ? "text-amber-700" : undefined}>{num(l.receivedQty ?? 0)}</span>
                      ) : order.status === "SHIPPED" ? (
                        num(shipped.reduce((s, x) => s + x.qty, 0))
                      ) : (
                        <span className={a < l.qty ? "font-semibold text-rose-600" : undefined}>{num(a)}</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <CardBody className="flex flex-wrap justify-end gap-x-8 gap-y-1 border-t border-ink-100 text-sm">
            <span className="text-ink-500">Subtotal <b className="tnum text-ink-900">{zar(order.subtotalCents)}</b></span>
            <span className="text-ink-500">VAT <b className="tnum text-ink-900">{zar(order.vatCents)}</b></span>
            <span className="text-ink-500">Total <b className="tnum text-ink-900">{zar(order.totalCents)}</b></span>
            {order.status === "RECEIVED" && <span className="text-ink-500">Invoiced on receipt <b className="tnum text-ink-900">{zar(receivedValue(order))}</b></span>}
          </CardBody>
        </Card>
    </>
  );
}
