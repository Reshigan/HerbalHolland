import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MapPin, Store } from "lucide-react";
import { db } from "@/server/db";
import { invoicedTotal, nextTradeActions, tradeOrderById } from "@/server/trade/orders";
import { invoiceUrl } from "@/server/invoices";
import { eftReference, tradeLine } from "@/lib/trade";
import { PROVINCES } from "@/lib/sa";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Detail } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ActionButton, ActionForm, ConfirmAction, FieldError, SubmitButton } from "@/components/hq/action-form";
import { BackLink, ViewOnly } from "@/components/hq/ui";
import { Flash } from "@/components/hq/flash";
import { EVENT_LABEL, FULFIL_LABEL, PAY_LABEL, TradeOrderBadge, casesLabel, termsLabel } from "@/components/admin/trade-ui";
import { orderWhere, tradeScope } from "../../scope";
import { cancelOrder, confirmPayment, pickOrder, shipOrder } from "../actions";

export const metadata = { title: "Trade order" };

type Event = { status: string; at: string; note?: string };

export default async function TradeOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ m?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await tradeScope();
  const [o, inScope] = await Promise.all([tradeOrderById(id), s.networkWide ? 1 : db.tradeOrder.count({ where: { AND: [{ id }, orderWhere(s)] } })]);
  if (!o || !inScope) notFound();
  const events = ((o.events as Event[] | null) ?? []).slice().reverse();
  const next = nextTradeActions(o);
  const posted = o.status === "SHIPPED" || o.status === "COLLECTED";
  const invoiced = posted ? invoicedTotal(o) : null;
  const dueEntry = o.saleId ? await db.tradeLedgerEntry.findFirst({ where: { saleId: o.saleId, kind: "INVOICE" }, select: { dueAt: true } }) : null;
  const units = o.lines.reduce((t, l) => t + l.qty, 0);
  const collect = o.fulfilment === "COLLECT";
  const canAct = s.canEdit;

  return (
    <>
      <BackLink href="/hq/trade/orders">Trade orders</BackLink>
      <PageHeader
        overline={`${FULFIL_LABEL[o.fulfilment]} · ${PAY_LABEL[o.payMethod] ?? o.payMethod} · placed ${fmtDateTime(o.createdAt)}`}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{o.number}</span>
            <TradeOrderBadge status={o.status} />
          </span>
        }
        description={`${o.account.name} (${o.account.number}) · ${num(units)} unit${units === 1 ? "" : "s"} on ${o.lines.length} line${o.lines.length === 1 ? "" : "s"} · ${zar(o.totalCents)} incl. VAT · fulfilled by ${o.store.name}`}
        actions={
          collect && o.store.kind === "RETAIL" ? (
            <ButtonLink href={`/store/${o.store.code}/trade/${o.id}`} variant="outline">
              <Store className="h-4 w-4" aria-hidden /> Store&apos;s view
            </ButtonLink>
          ) : undefined
        }
      />
      <Flash message={sp.m} />
      {!s.canEdit && <ViewOnly className="mb-6">View only — the HQ team confirms payments and works the DC queue.</ViewOnly>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {canAct && (next.includes("pick") || next.includes("ship")) && (
            <Card className="border-brand-300 ring-4 ring-brand-500/10">
              <CardHeader title="At the distribution centre" description={o.status === "PLACED" ? "Start picking, or ship it straight away." : "Ship it with the courier and tracking number. A line that can't be filled ships short and is invoiced for what went."} />
              <CardBody className="space-y-4">
                {next.includes("pick") && <ActionButton action={pickOrder.bind(null, o.id)} variant="outline" pendingLabel="Starting…">Start picking</ActionButton>}
                {next.includes("ship") && (
                  <ConfirmAction action={shipOrder.bind(null, o.id)} label="Ship order" title={`Ship ${o.number}?`} confirmLabel="Ship and invoice" variant="primary" triggerVariant="primary" size="md">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Courier" htmlFor="ship-courier">
                        <Input id="ship-courier" name="courier" placeholder="The Courier Guy" maxLength={60} />
                        <FieldError name="courier" />
                      </Field>
                      <Field label="Tracking number (optional)" htmlFor="ship-tracking">
                        <Input id="ship-tracking" name="trackingNo" maxLength={60} />
                      </Field>
                    </div>
                    <div>
                      <p className="mb-2 text-xs text-ink-600">Short-shipping? Enter what was supplied of a line; leave the rest blank to ship in full.</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {o.lines.map((l) => (
                          <Field key={l.id} label={`${l.variant.product.name} · ${l.variant.name} (ordered ${l.qty})`} htmlFor={`short-${l.id}`}>
                            <Input id={`short-${l.id}`} name={`short:${l.id}`} inputMode="numeric" placeholder={String(l.qty)} />
                            <FieldError name={`short:${l.id}`} />
                          </Field>
                        ))}
                      </div>
                    </div>
                    <Field label="Note to the account (optional)" htmlFor="ship-note">
                      <Textarea id="ship-note" name="note" className="min-h-16" maxLength={300} />
                    </Field>
                  </ConfirmAction>
                )}
              </CardBody>
            </Card>
          )}
          {collect && ["PLACED", "PICKING", "READY"].includes(o.status) && (
            <Notice tone="info" title={`Click & collect at ${o.store.name}`}>
              The store picks it, marks it ready (the buyer gets the collection code by email and text) and hands it over with an ID check — that posts the sale and the invoice.{" "}
              {o.store.kind === "RETAIL" && <Link href={`/store/${o.store.code}/trade/${o.id}`} className="font-semibold text-brand-700 hover:underline">Open the store&apos;s view →</Link>}
            </Notice>
          )}

          <Card>
            <CardHeader title="Lines" description={posted ? "Quantities invoiced are what shipped or was handed over; short lines show both." : "Ex VAT unit prices after quantity breaks; VAT is worked out per line."} />
            <Table stickyFirst className="relative mt-4" minWidth="48rem">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Ordered</Th>
                  {posted && <Th align="right">Supplied</Th>}
                  <Th align="right">Unit ex VAT</Th>
                  <Th align="right">Ex VAT</Th>
                  <Th align="right">VAT</Th>
                  <Th align="right">Incl VAT</Th>
                </tr>
              </thead>
              <tbody>
                {o.lines.map((l) => {
                  const qty = posted ? (l.shippedQty ?? l.qty) : l.qty;
                  const t = tradeLine({ unitCents: l.unitCents, qty });
                  const short = posted && l.shippedQty != null && l.shippedQty < l.qty;
                  return (
                    <Tr key={l.id}>
                      <Td>
                        <span className="font-medium text-ink-850">{l.variant.product.name} · {l.variant.name}</span>
                        <span className="block text-xs text-ink-500"><span className="font-mono">{l.variant.sku}</span> · {casesLabel(l.qty, l.variant.caseQty)}</span>
                      </Td>
                      <Td align="right">{l.qty}</Td>
                      {posted && <Td align="right" className={short ? "font-semibold text-rose-600" : ""}>{l.shippedQty ?? l.qty}{short && <span className="block text-xs font-normal">short {l.qty - l.shippedQty!}</span>}</Td>}
                      <Td align="right">{zar(l.unitCents)}</Td>
                      <Td align="right">{zar(t.exCents)}</Td>
                      <Td align="right" className="text-ink-600">{zar(t.vatCents)}</Td>
                      <Td align="right" className="font-medium">{zar(t.inclCents)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <CardBody>
              <dl className="ml-auto max-w-sm divide-y divide-ink-100 text-sm">
                <Detail label="Items ex VAT">{zar(o.subtotalCents)}</Detail>
                {o.deliveryCents > 0 && <Detail label="Courier ex VAT">{zar(o.deliveryCents)}</Detail>}
                {o.fulfilment === "COURIER" && o.deliveryCents === 0 && <Detail label="Courier">Free</Detail>}
                {o.handlingCents > 0 && <Detail label="Handling ex VAT">{zar(o.handlingCents)}</Detail>}
                <Detail label="VAT @ 15%">{zar(o.vatCents)}</Detail>
                <Detail label="Total incl. VAT"><span className="font-display text-base">{zar(o.totalCents)}</span></Detail>
                {invoiced != null && invoiced !== o.totalCents && (
                  <Detail label="Invoiced (short supplied)"><span className="font-display text-base">{zar(invoiced)}</span></Detail>
                )}
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
                      <span className="text-sm font-semibold text-ink-900">{EVENT_LABEL[e.status] ?? e.status}</span>
                      <span className="text-xs text-ink-500">{fmtDateTime(e.at)}</span>
                    </div>
                    {e.note && <p className="mt-1 text-sm text-ink-700">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Account" />
            <CardBody>
              <Link href={`/hq/trade/accounts/${o.account.id}`} className="font-semibold text-ink-900 hover:text-brand-700">{o.account.name}</Link>
              <div className="mt-1 text-xs text-ink-500"><span className="font-mono">{o.account.number}</span> · {termsLabel(o.account)}</div>
              <dl className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                <Detail label="Legal name">{o.account.legalName}</Detail>
                <Detail label="VAT number">{o.account.vatNumber ?? "—"}</Detail>
                <Detail label="Placed by">{o.buyer ? `${o.buyer.name}` : "HQ, for the account"}</Detail>
                <Detail label="Billing email">{o.account.email}</Detail>
                {o.reference && <Detail label="Buyer's reference">{o.reference}</Detail>}
              </dl>
              {o.notes && <p className="mt-3 rounded-xl bg-ink-50 p-3 text-xs text-ink-600">“{o.notes}”</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={collect ? "Collection" : "Delivery"} />
            <CardBody className="space-y-3 text-sm">
              <p className="flex gap-2 text-ink-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                {collect ? (
                  <span>
                    Herbal Holland {o.store.name}
                    <span className="block text-ink-500">{[o.store.addressLine, o.store.suburb, o.store.city].filter(Boolean).join(", ")}</span>
                  </span>
                ) : (
                  <span>
                    {o.addressLine}
                    <span className="block text-ink-500">{[o.suburb, o.city, o.province ? PROVINCES[o.province] : null, o.postalCode].filter(Boolean).join(", ")}</span>
                  </span>
                )}
              </p>
              <dl className="divide-y divide-ink-100 border-t border-ink-100">
                <Detail label="Fulfilled by">
                  {o.store.kind === "RETAIL" ? <Link href={`/hq/stores/${o.store.code}`} className="hover:text-brand-700">{o.store.name}</Link> : <span>{o.store.name} <Badge className="ml-1">DC</Badge></span>}
                </Detail>
                {collect && o.collectionCode && ["PLACED", "PICKING", "READY"].includes(o.status) && <Detail label="Collection code"><span className="font-mono tracking-[0.2em]">{o.collectionCode}</span></Detail>}
                {o.readyAt && <Detail label="Ready since">{fmtDateTime(o.readyAt)}</Detail>}
                {o.collectedAt && <Detail label="Collected">{fmtDateTime(o.collectedAt)}</Detail>}
                {o.courier && <Detail label="Courier">{o.courier}</Detail>}
                {o.trackingNo && <Detail label="Tracking"><span className="font-mono text-xs">{o.trackingNo}</span></Detail>}
                {o.shippedAt && <Detail label="Shipped">{fmtDateTime(o.shippedAt)}</Detail>}
                {o.reservedAt && !posted && o.status !== "CANCELLED" && <Detail label="Stock reserved">{fmtDateTime(o.reservedAt)}</Detail>}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment" />
            <CardBody>
              <dl className="divide-y divide-ink-100">
                <Detail label="Method">{PAY_LABEL[o.payMethod] ?? o.payMethod}</Detail>
                {o.payMethod === "EFT" && <Detail label="EFT reference">{o.paymentRef ?? eftReference(o.number)}</Detail>}
                {o.paidAt && <Detail label="Paid">{fmtDateTime(o.paidAt)}</Detail>}
                {o.payMethod === "ACCOUNT" && <Detail label="Falls due">{dueEntry?.dueAt ? fmtDate(dueEntry.dueAt) : `${o.account.paymentDays} days after the invoice`}</Detail>}
                {o.invoiceNumber && (
                  <Detail label="Tax invoice">
                    {o.saleId ? (
                      <a href={invoiceUrl(o.saleId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand-700">
                        {o.invoiceNumber} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    ) : (
                      o.invoiceNumber
                    )}
                  </Detail>
                )}
              </dl>
              {canAct && o.status === "PENDING_PAYMENT" && (
                <ActionForm action={confirmPayment.bind(null, o.id)} className="mt-4 space-y-3 rounded-2xl border border-ink-200 bg-ink-50 p-4">
                  <div className="font-display text-sm font-semibold text-ink-900">Confirm the EFT</div>
                  <p className="text-xs text-ink-600">When {zar(o.totalCents)} shows on the bank statement with the reference {eftReference(o.number)}: the stock is reserved and the payment lands on the ledger.</p>
                  <Field label="Bank reference" htmlFor="eft-reference">
                    <Input id="eft-reference" name="reference" defaultValue={eftReference(o.number)} maxLength={80} />
                    <FieldError name="reference" />
                  </Field>
                  <Field label="Paid on" htmlFor="eft-date" hint="Blank: today">
                    <Input id="eft-date" name="paidAt" type="date" />
                    <FieldError name="paidAt" />
                  </Field>
                  <SubmitButton pendingLabel="Confirming…">Confirm payment</SubmitButton>
                </ActionForm>
              )}
            </CardBody>
          </Card>

          {canAct && next.includes("cancel") && (
            <Card>
              <CardHeader title="Cancel" description={o.payMethod === "EFT" && o.paidAt ? "Paid by EFT: cancelling notes the refund to make by hand" : "Releases any reserved stock; the account is told"} />
              <CardBody>
                <ConfirmAction action={cancelOrder.bind(null, o.id)} label="Cancel order" title={`Cancel ${o.number}?`} confirmLabel="Cancel order" className="w-full">
                  <Field label="Reason (the account is told)" htmlFor="cancel-reason">
                    <Textarea id="cancel-reason" name="reason" className="min-h-16" placeholder="e.g. The account asked to cancel by phone" maxLength={300} />
                    <FieldError name="reason" />
                  </Field>
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
