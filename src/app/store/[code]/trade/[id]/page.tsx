import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { db } from "@/server/db";
import { availability, availKey } from "@/server/inventory";
import { invoicedTotal, nextTradeActions, tradeOrderById } from "@/server/trade/orders";
import { invoiceUrl } from "@/server/invoices";
import { tradeLine } from "@/lib/trade";
import { zar } from "@/lib/money";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Textarea } from "@/components/ui/form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionButton, ConfirmAction, FieldError } from "@/components/hq/action-form";
import { BackLink, Line, ReadOnlyNote } from "@/components/store/ui";
import { EVENT_LABEL, PAY_LABEL, TradeOrderBadge, casesLabel, termsLabel } from "@/components/admin/trade-ui";
import { cancelTradeOrder, collectTradeOrder, pickTradeOrder, readyTradeOrder } from "../actions";
import { HandoverForm } from "./handover-form";

export const metadata = { title: "Trade order" };

type Event = { status: string; at: string; note?: string };

export default async function StoreTradeOrderPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const o = await tradeOrderById(id);
  if (!o || o.storeId !== store.id) notFound();
  const avail = await availability([store.id], o.lines.map((l) => l.variantId));
  const next = nextTradeActions(o);
  const posted = o.status === "COLLECTED" || o.status === "SHIPPED";
  const open = ["PLACED", "PICKING", "READY"].includes(o.status);
  const invoiced = posted ? invoicedTotal(o) : null;
  const events = ((o.events as Event[] | null) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const base = `/store/${store.code}`;
  const lines = o.lines.map((l) => ({ ...l, name: `${l.variant.product.name} · ${l.variant.name}`, onHand: avail.get(availKey(store.id, l.variantId))?.onHand ?? 0 }));
  const shortNow = lines.filter((l) => open && l.onHand < l.qty);
  const units = o.lines.reduce((t, l) => t + l.qty, 0);
  const sale = o.saleId ? await db.sale.findUnique({ where: { id: o.saleId }, select: { id: true, number: true, invoiceSentAt: true, totalCents: true } }) : null;

  return (
    <>
      <BackLink href={`${base}/trade`}>Trade orders</BackLink>
      <PageHeader
        overline={`Click & collect · trade · placed ${timeAgo(o.createdAt)}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono tracking-wide">{o.number}</span>
            <TradeOrderBadge status={o.status} />
          </span>
        }
        description={`${o.account.name} · ${units} unit${units === 1 ? "" : "s"} on ${o.lines.length} line${o.lines.length === 1 ? "" : "s"} · ${zar(o.totalCents)} incl. VAT · ${PAY_LABEL[o.payMethod] ?? o.payMethod}`}
      />

      {shortNow.length > 0 && (
        <Notice tone="danger" className="mb-4" title="Not enough on hand to fill this order">
          {shortNow.map((l) => `${l.name} (${l.onHand} of ${l.qty})`).join(", ")}. Count the shelf, hand over short, or a manager can cancel and the account is told.
        </Notice>
      )}
      {o.status === "PENDING_PAYMENT" && <Notice tone="info" className="mb-4" title="Waiting for the account's EFT">HQ confirms the payment; the order comes to you as “to pick” once it has.</Notice>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {open && (
            <Card className="border-brand-300 ring-4 ring-brand-500/10">
              <CardHeader
                title="Next step"
                description={o.status === "READY" ? "Hand over when the collector arrives: check their ID (18+) and the collection code." : "Pick and pack, then mark it ready — the buyer gets the collection code by email and text."}
              />
              <CardBody className="space-y-3">
                {next.includes("pick") && <ActionButton action={pickTradeOrder.bind(null, store.code, o.id)} variant="outline" pendingLabel="Starting…">Start picking</ActionButton>}
                {next.includes("ready") && <ActionButton action={readyTradeOrder.bind(null, store.code, o.id)} variant={o.status === "PICKING" ? "primary" : "outline"} pendingLabel="Marking ready…">Packed — ready for collection</ActionButton>}
                {next.includes("collect") && <HandoverForm action={collectTradeOrder.bind(null, store.code, o.id)} number={o.number} lines={lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, onHand: l.onHand }))} />}
                {next.includes("cancel") &&
                  (canManageStore(user) ? (
                    <ConfirmAction action={cancelTradeOrder.bind(null, store.code, o.id)} label="Cancel order" title="Cancel this trade order?" confirmLabel="Cancel order">
                      <Field label="Reason (the account is told)" htmlFor="cancel-reason">
                        <Textarea id="cancel-reason" name="reason" className="min-h-16" placeholder="e.g. The buyer asked us to cancel" maxLength={300} />
                        <FieldError name="reason" />
                      </Field>
                    </ConfirmAction>
                  ) : (
                    <ReadOnlyNote>A manager or owner cancels trade orders.</ReadOnlyNote>
                  ))}
              </CardBody>
            </Card>
          )}
          {o.status === "COLLECTED" && sale && (
            <Notice tone="success" className="mb-0" title={`Handed over — sale ${sale.number} posted at ${store.name}`}>
              {zar(sale.totalCents)} incl. VAT in the trade (wholesale) channel, collected by HQ.{" "}
              <a href={invoiceUrl(sale.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-leaf-700 hover:underline">
                Tax invoice {o.invoiceNumber} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              {sale.invoiceSentAt ? ` · emailed to ${o.account.email}` : " · being emailed to the account"}
            </Notice>
          )}

          <Card>
            <CardHeader title="Items" description={open ? "Quantities are in units (ordered in whole cases); on hand is this store's released stock right now." : posted ? "What was handed over; short lines show both." : undefined} />
            <Table stickyFirst className="mt-3" minWidth="44rem">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Ordered</Th>
                  {posted && <Th align="right">Supplied</Th>}
                  {open && <Th align="right">On hand</Th>}
                  <Th align="right">Unit ex VAT</Th>
                  <Th align="right">Incl VAT</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const qty = posted ? (l.shippedQty ?? l.qty) : l.qty;
                  const short = posted && l.shippedQty != null && l.shippedQty < l.qty;
                  return (
                    <Tr key={l.id}>
                      <Td className="min-w-48">
                        <Link href={`${base}/inventory/${l.variantId}`} className="font-medium text-ink-900 hover:text-brand-700">
                          {l.variant.product.name} <span className="text-ink-500">· {l.variant.name}</span>
                        </Link>
                        <div className="text-xs text-ink-500"><span className="font-mono">{l.variant.sku}</span> · {casesLabel(l.qty, l.variant.caseQty)}</div>
                      </Td>
                      <Td align="right" className="font-semibold text-ink-950">{l.qty}</Td>
                      {posted && <Td align="right" className={short ? "font-semibold text-rose-600" : ""}>{l.shippedQty ?? l.qty}</Td>}
                      {open && <Td align="right" className={cn(l.onHand < l.qty ? "font-semibold text-rose-600" : "text-ink-700")}>{l.onHand}</Td>}
                      <Td align="right" className="text-ink-600">{zar(l.unitCents)}</Td>
                      <Td align="right">{zar(tradeLine({ unitCents: l.unitCents, qty }).inclCents)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <div className="grid gap-x-10 border-t border-ink-100 px-5 py-4 sm:grid-cols-2">
              <div />
              <div>
                <Line label="Items ex VAT" value={zar(o.subtotalCents)} />
                {o.handlingCents > 0 && <Line label="Handling ex VAT" value={zar(o.handlingCents)} />}
                <Line label="VAT @ 15%" value={zar(o.vatCents)} />
                <Line label="Total incl. VAT" value={zar(o.totalCents)} strong />
                {invoiced != null && invoiced !== o.totalCents && <Line label="Invoiced (short)" value={zar(invoiced)} strong />}
                <Line label={o.payMethod === "ACCOUNT" ? "Invoiced to the account" : "Paid to HQ by EFT"} value={o.payMethod === "ACCOUNT" ? `due ${o.account.paymentDays} days after collection` : o.paidAt ? "paid" : "awaiting"} muted />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="space-y-3">
                {events.map((e, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", i === events.length - 1 ? "bg-brand-500 ring-4 ring-brand-500/20" : "bg-ink-300")} aria-hidden />
                    <div>
                      <div className="font-semibold text-ink-900">{EVENT_LABEL[e.status] ?? e.status}</div>
                      <div className="text-xs text-ink-500">{fmtDateTime(e.at)}{e.note && ` · ${e.note}`}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {open && o.collectionCode && (
            <div className="rounded-2xl bg-ink-950 p-5 text-white shadow-card">
              <div className="eyebrow text-brand-500">Collection code</div>
              <div className="mt-1 font-mono text-4xl font-bold tracking-[0.25em]">{o.collectionCode}</div>
              <p className="mt-2 text-xs text-ink-300">The buyer gets this by email and text when the order is ready. At handover they give it to you and show an ID document (18+). Never read it out to them.</p>
            </div>
          )}

          <Card>
            <CardHeader title="Trade account" />
            <CardBody className="space-y-1 pt-3 text-sm">
              <div className="font-semibold text-ink-900">{o.account.name}</div>
              <div className="text-xs text-ink-500">{o.account.legalName} · <span className="font-mono">{o.account.number}</span></div>
              <Line label="Terms" value={termsLabel(o.account)} />
              <Line label="Buyer" value={o.buyer ? o.buyer.name : "Placed by HQ"} />
              {o.buyer?.phone && <Line label="Buyer's phone" value={o.buyer.phone} />}
              {!o.buyer?.phone && o.account.phone && <Line label="Phone" value={o.account.phone} />}
              {o.reference && <Line label="Their reference" value={o.reference} />}
              {o.notes && <div className="pt-1 text-xs text-ink-500">“{o.notes}”</div>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payment" />
            <CardBody className="space-y-1 pt-3 text-sm">
              <Line label="Method" value={PAY_LABEL[o.payMethod] ?? o.payMethod} />
              {o.payMethod === "EFT" && <Line label="Status" value={o.paidAt ? <Badge tone="green">Paid to HQ</Badge> : <Badge tone="amber">Awaiting EFT</Badge>} />}
              {o.payMethod === "ACCOUNT" && <Line label="Status" value={<Badge tone="blue">On HQ&apos;s ledger</Badge>} />}
              {o.invoiceNumber && <Line label="Tax invoice" value={sale ? <a href={invoiceUrl(sale.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">{o.invoiceNumber} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : o.invoiceNumber} />}
              {sale && <Line label="Sale" value={<span className="font-mono text-xs">{sale.number}</span>} />}
              <p className="pt-2 text-xs text-ink-500">The money is collected by HQ (EFT to HQ, or the trade ledger), so this sale shows under HQ-collected takings on your statement.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
