import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CircleDot, Mail, X } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { availability, availKey } from "@/server/inventory";
import { receivedValue } from "@/server/stock-orders";
import { stockOrderDetail } from "@/server/store/purchasing";
import { plural } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, fmtMonth } from "@/lib/format";
import { cancelOrder, receiveOrder, sellerAct, submitDraft } from "../actions";
import { ReceiveForm } from "./receive-form";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { BackLink, Line, ReadOnlyNote } from "@/components/store/ui";
import { ActionButton, ConfirmAction } from "@/components/store/action-form";
import { cn } from "@/lib/cn";

export const metadata = { title: "Stock order" };

export default async function StockOrderPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const d = await stockOrderDetail(store.id, id);
  if (!d) notFound();
  const { order: o, lines, steps } = d;
  const isBuyer = o.buyerId === store.id;
  const isSeller = o.sellerId === store.id && o.kind === "NETWORK";
  const avail = isSeller && o.status === "APPROVED" ? await availability([store.id], lines.map((l) => l.variantId)) : null;
  const back = isBuyer ? `/store/${store.code}/purchasing` : `/store/${store.code}/network?tab=orders`;
  const received = o.status === "RECEIVED" ? receivedValue(o) : null;
  const receivedEx = lines.reduce((s, l) => s + (l.receivedQty ?? 0) * l.unitCostCents, 0);
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const shortReceived = lines.reduce((s, l) => s + (l.receivedQty != null && l.shippedQty != null ? Math.max(0, l.shippedQty - l.receivedQty) : 0), 0);

  return (
    <>
      <BackLink href={back}>{isBuyer ? "Purchasing" : "Network trading"}</BackLink>
      <PageHeader
        overline={`${o.kind === "WHOLESALE" ? "Wholesale order" : "Network order"} · ${isBuyer ? "you're buying" : "you're selling"}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {o.number}
            <StatusBadge status={o.status} />
          </span>
        }
        description={`${o.seller.name} → ${o.buyer.name} · ${plural(lines.length, "line")}, ${plural(units, "unit")} · created ${fmtDate(o.createdAt)}`}
        actions={
          canManage && (
            <>
              {isBuyer && o.status === "DRAFT" && <ActionButton action={submitDraft.bind(null, store.code, id)} variant="primary" size="md">Submit order</ActionButton>}
              {isBuyer && ["DRAFT", "SUBMITTED", "APPROVED"].includes(o.status) && (
                <ConfirmAction action={cancelOrder.bind(null, store.code, id)} label="Cancel order" title={`Cancel ${o.number}?`} confirmLabel="Yes, cancel it" className="sm:max-w-sm">
                  {o.status === "APPROVED" ? "The supplier has accepted it but not shipped yet." : "Nothing has been shipped yet."}
                  {o.kind === "NETWORK" && " The units go back on the seller's listing."}
                </ConfirmAction>
              )}
            </>
          )
        }
      />

      {!canManage && (isBuyer ? o.status === "SHIPPED" : ["SUBMITTED", "APPROVED"].includes(o.status)) && <ReadOnlyNote className="mb-4">Read-only — a manager or owner handles this order.</ReadOnlyNote>}

      {isBuyer && o.status === "SHIPPED" && canManage && (
        <Card className="mb-6 border-oranje-300 ring-4 ring-oranje-500/10">
          <CardHeader title="Receive this delivery" description="Count each line against the delivery note. Received quantities are prefilled with what was shipped — change any that are short." />
          <div className="mt-3">
            <ReceiveForm
              action={receiveOrder.bind(null, store.code, id)}
              lines={lines.map((l) => ({
                id: l.id,
                name: `${l.variant.product.name} · ${l.variant.name}`,
                sku: l.variant.sku,
                ordered: l.qty,
                shipped: l.shippedQty ?? 0,
                lots: l.shippedLots.map((b) => `${b.code} ×${b.qty}`).join(", "),
                unitCostCents: l.unitCostCents,
              }))}
            />
          </div>
        </Card>
      )}

      {isSeller && canManage && o.status === "SUBMITTED" && (
        <Card className="mb-6 border-oranje-300 ring-4 ring-oranje-500/10">
          <CardHeader title={`${o.buyer.name} wants to buy from you`} description="Accept to commit the stock, then ship it. Declining puts the units back on your listing." />
          <CardBody className="flex flex-wrap items-start gap-3">
            <ActionButton action={sellerAct.bind(null, store.code, id, "approve")} variant="primary" size="md">Accept order</ActionButton>
            <ConfirmAction action={sellerAct.bind(null, store.code, id, "reject")} label="Decline" size="md" title={`Decline ${o.number}?`} confirmLabel="Decline order">
              {o.buyer.name} will see it as rejected.
            </ConfirmAction>
          </CardBody>
        </Card>
      )}

      {isSeller && canManage && o.status === "APPROVED" && (
        <Card className="mb-6 border-oranje-300 ring-4 ring-oranje-500/10">
          <CardHeader title="Ship this order" description="Stock leaves your store first-expiry-first-out. If you have less than ordered, the shortfall is shown to the buyer." />
          <CardBody>
            <ConfirmAction action={sellerAct.bind(null, store.code, id, "ship")} label="Ship now" triggerVariant="primary" size="md" variant="primary" title={`Ship ${o.number} to ${o.buyer.name}?`} confirmLabel="Ship & book out">
              {lines.map((l) => {
                const a = Math.max(0, avail?.get(availKey(store.id, l.variantId))?.available ?? 0);
                return (
                  <div key={l.id} className="flex justify-between gap-4">
                    <span>{l.variant.product.name} · {l.variant.name}</span>
                    <span className={cn("tnum font-semibold", a < l.qty && "text-amber-700")}>
                      {Math.min(a, l.qty)} of {l.qty}
                    </span>
                  </div>
                );
              })}
            </ConfirmAction>
          </CardBody>
        </Card>
      )}

      {o.status === "RECEIVED" &&
        (isBuyer ? (
          <Notice tone="success" className="mb-6">
            Received {o.receivedAt ? fmtDateTime(o.receivedAt) : ""} — {zar(received ?? 0)} incl. VAT.{" "}
            {d.invoiceSentAt ? `Tax invoice emailed ${fmtDateTime(d.invoiceSentAt)}.` : "Tax invoice is being emailed."} Settled on the {fmtMonth(o.receivedAt ?? o.createdAt)} franchise statement.
            {shortReceived > 0 && <span className="mt-1 block font-semibold">{plural(shortReceived, "unit")} short against the delivery note — recorded on the order for {o.seller.name}. You&apos;re only invoiced for what you received.</span>}
          </Notice>
        ) : (
          <Notice tone={shortReceived > 0 ? "warn" : "success"} className="mb-6">
            {o.buyer.name} received this {o.receivedAt ? fmtDateTime(o.receivedAt) : ""} — {zar(received ?? 0)} incl. VAT, cleared by HQ on the {fmtMonth(o.receivedAt ?? o.createdAt)} franchise statement.
            {shortReceived > 0 && <span className="mt-1 block font-semibold">They received {plural(shortReceived, "unit")} fewer than you shipped, so those units aren&apos;t paid for — check the dispatch and courier.</span>}
          </Notice>
        ))}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Lines" description="Prices are ex VAT" />
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th align="right">Ordered</Th>
                <Th align="right">Unit</Th>
                <Th align="right">Line</Th>
                <Th>Shipped</Th>
                <Th align="right">Received</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const shortShip = l.shippedQty != null && l.shippedQty < l.qty;
                const shortRecv = l.receivedQty != null && l.shippedQty != null && l.receivedQty < l.shippedQty;
                return (
                  <Tr key={l.id} className={shortShip || shortRecv ? "bg-amber-50/70 hover:bg-amber-50" : undefined}>
                    <Td className="min-w-48">
                      {isBuyer ? (
                        <Link href={`/store/${store.code}/inventory/${l.variantId}`} className="font-medium text-ink-900 hover:text-oranje-700">
                          {l.variant.product.name} <span className="text-ink-500">· {l.variant.name}</span>
                        </Link>
                      ) : (
                        <span className="font-medium text-ink-900">
                          {l.variant.product.name} <span className="text-ink-500">· {l.variant.name}</span>
                        </span>
                      )}
                      <div className="font-mono text-xs text-ink-400">{l.variant.sku}</div>
                    </Td>
                    <Td align="right">{l.qty}</Td>
                    <Td align="right" className="text-ink-600">{zar(l.unitCostCents)}</Td>
                    <Td align="right">{zar(l.qty * l.unitCostCents)}</Td>
                    <Td>
                      {l.shippedQty == null ? (
                        <span className="text-ink-300">—</span>
                      ) : (
                        <div>
                          <span className={cn("tnum font-semibold", shortShip ? "text-amber-700" : "text-ink-900")}>{l.shippedQty}</span>
                          {shortShip && <span className="ml-1 text-xs text-amber-700">short {l.qty - l.shippedQty}</span>}
                          {l.shippedLots.map((b) => (
                            <div key={b.batchId} className="whitespace-nowrap font-mono text-[0.7rem] text-ink-500" title={b.expiresAt ? `Expires ${fmtDate(b.expiresAt)}` : undefined}>
                              <Link href={`/batch/${b.code}`} target="_blank" className="hover:text-oranje-700">{b.code}</Link> ×{b.qty}
                            </div>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td align="right">
                      {l.receivedQty == null ? <span className="text-ink-300">—</span> : <span className={cn("font-semibold", shortRecv ? "text-amber-700" : "text-leaf-700")}>{l.receivedQty}</span>}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          {o.notes && (
            <div className="border-t border-ink-100 px-5 py-4 text-sm">
              <div className="eyebrow mb-1 text-ink-400">Notes</div>
              <p className="whitespace-pre-line text-ink-700">{o.notes}</p>
            </div>
          )}
        </Card>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Progress" />
            <CardBody>
              <ol className="relative space-y-4">
                {steps.map((s, i) => (
                  <li key={s.key} className="relative flex gap-3">
                    {i < steps.length - 1 && <span className={cn("absolute left-[11px] top-7 h-[calc(100%-0.5rem)] w-0.5", s.state === "done" ? "bg-oranje-300" : "bg-ink-150")} aria-hidden />}
                    <span
                      className={cn(
                        "relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full",
                        s.state === "done" && "bg-oranje-500 text-ink-950",
                        s.state === "current" && "bg-oranje-100 text-oranje-700 ring-2 ring-oranje-500",
                        s.state === "todo" && "bg-ink-100 text-ink-400",
                        s.state === "stopped" && "bg-rose-500 text-white",
                      )}
                    >
                      {s.state === "done" ? <Check className="h-3.5 w-3.5" aria-hidden /> : s.state === "stopped" ? <X className="h-3.5 w-3.5" aria-hidden /> : <CircleDot className="h-3.5 w-3.5" aria-hidden />}
                    </span>
                    <div className="min-w-0 pb-1 text-sm">
                      <div className={cn("font-semibold", s.state === "todo" ? "text-ink-400" : s.state === "stopped" ? "text-rose-600" : "text-ink-900")}>
                        {s.label}
                        {s.state === "current" && <span className="ml-2 font-normal text-oranje-700">· waiting</span>}
                      </div>
                      {s.at && <div className="text-xs text-ink-500">{fmtDateTime(s.at)}{s.by ? ` · ${s.by}` : ""}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Value" />
            <CardBody className="pt-3">
              <Line label="Ordered, ex VAT" value={zar(o.subtotalCents)} />
              <Line label="VAT 15%" value={zar(o.vatCents)} muted />
              <Line label="Ordered, incl. VAT" value={zar(o.totalCents)} strong />
              {received != null && (
                <>
                  <div className="my-2 border-t border-ink-100" />
                  <Line label="Received, ex VAT" value={zar(receivedEx)} muted />
                  <Line label="Invoiced, incl. VAT" value={zar(received)} strong />
                </>
              )}
              <div className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-xs text-ink-500">
                <div>
                  <b className="text-ink-700">Seller:</b> {o.seller.company.legalName}
                  {o.seller.company.vatNumber ? ` · VAT ${o.seller.company.vatNumber}` : " · not VAT-registered"}
                </div>
                <div>
                  <b className="text-ink-700">Buyer:</b> {o.buyer.company.legalName}
                  {o.buyer.company.vatNumber ? ` · VAT ${o.buyer.company.vatNumber}` : " · not VAT-registered"}
                </div>
                {d.invoiceSentAt && (
                  <div className="flex items-center gap-1.5 text-leaf-700">
                    <Mail className="h-3.5 w-3.5" aria-hidden /> Tax invoice emailed {fmtDateTime(d.invoiceSentAt)}
                  </div>
                )}
              </div>
              <div className="mt-3">
                <Badge tone={o.kind === "WHOLESALE" ? "neutral" : "violet"}>{o.kind === "WHOLESALE" ? "Wholesale · settled on statement" : "Network trade · cleared by HQ"}</Badge>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
