// One return for staff: what's coming back and why, the member's photos and note, the order, the refund plan and the
// next step. Shared by HQ and the store back office; each passes its own actions and links.
import Link from "next/link";
import { Camera, Info } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Detail } from "@/components/ui/misc";
import { Notice } from "@/components/ui/page";
import { StatusBadge, TierBadge } from "@/components/ui/status";
import { Table, Th, Td, Tr } from "@/components/ui/table";
import { ViewOnly } from "@/components/hq/ui";
import { ReasonBadge, ReturnStatusBadge } from "./badges";
import { BookCollectionForm, DecideForms, ReceiveForm, RefundForm, type StaffAction } from "./staff-forms";
import type { returnDetail } from "@/server/returns";
import { RETURN_REASON, RETURN_STATUS } from "@/lib/returns";
import { displayPhone } from "@/lib/sa";
import { fmtDateTime } from "@/lib/format";
import { zar } from "@/lib/money";
import { asList } from "@/lib/json-list";

export type ReturnView = NonNullable<Awaited<ReturnType<typeof returnDetail>>>;

const ACTION_LABEL: Record<string, string> = {
  "return.request": "Requested",
  "return.approve": "Approved",
  "return.decline": "Declined",
  "return.book_collection": "Collection booked",
  "return.receive": "Received",
  "return.refund": "Refunded",
};

export function ReturnPanel({ d, canWork, actions, links }: {
  d: ReturnView;
  canWork: boolean;
  actions: { approve: StaffAction; decline: StaffAction; book: StaffAction; receive: StaffAction; refund: StaffAction };
  links: { order: string; member: string | null };
}) {
  const { r, order, items, plan } = d;
  const c = order.customer;
  const next =
    r.status === "REQUESTED" ? (
      <DecideForms approve={actions.approve} decline={actions.decline} />
    ) : r.status === "APPROVED" ? (
      <div className="space-y-3">
        <BookCollectionForm action={actions.book} />
        <div className="flex items-center gap-3 text-sm text-ink-600">
          <span>Or, if the member dropped it off:</span>
          <ReceiveForm action={actions.receive} />
        </div>
      </div>
    ) : r.status === "COLLECTION_BOOKED" ? (
      <ReceiveForm action={actions.receive} />
    ) : r.status === "RECEIVED" ? (
      <RefundForm action={actions.refund} items={items} plan={{ ...plan.breakdown, gateway: plan.gateway, voucherCents: plan.voucher.toVoucher, voucherCodes: plan.voucher.parts.map((v) => v.code), moneyCents: plan.voucher.toTender }} restockDefault={plan.restock} />
    ) : null;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        {next && (
          <Card className="border-brand-300 ring-4 ring-brand-500/10">
            <CardHeader title="Next step" description={RETURN_STATUS[r.status].hint} />
            <CardBody>{canWork ? next : <ViewOnly>Read-only. Managers and owners handle returns.</ViewOnly>}</CardBody>
          </Card>
        )}
        {r.status === "REFUNDED" && (
          <Notice tone="success" title={`Refunded ${zar(r.refundCents ?? 0)}`}>
            {r.refundRef === "POINTS" ? "Nothing was paid in money: the points came back with the credit note." : r.refundRef === "VOUCHER" ? `Nothing to pay out in money: it went back onto the gift voucher with the credit note at ${order.store.name}, and the member has been told.` : `Reference ${r.refundRef}. The credit note is posted at ${order.store.name} and the member has been told.`}
          </Notice>
        )}
        {r.status === "DECLINED" && (
          <Notice tone="warn" title="Declined">
            {r.decisionNote}
          </Notice>
        )}

        <Card>
          <CardHeader title="Coming back" description={`${RETURN_REASON[r.reason].label} · ${RETURN_REASON[r.reason].hint}`} />
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Paid</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <Tr key={it.variantId}>
                  <Td>
                    <span className="font-medium text-ink-900">{it.name}</span>
                    <span className="block font-mono text-xs text-ink-500">{it.sku}</span>
                  </Td>
                  <Td align="right" className="font-semibold text-ink-950">{it.qty}</Td>
                  <Td align="right">{zar(it.unitCents * it.qty)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <CardBody className="space-y-3 border-t border-ink-100">
            {r.note && (
              <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-800">
                <b className="text-ink-900">The member says:</b> “{r.note}”
              </p>
            )}
            {asList(r.photoUploadIds).length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {asList(r.photoUploadIds).map((id) => (
                  <li key={id}>
                    <a href={`/media/${id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-ink-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/media/${id}`} alt="The member's photo" className="h-28 w-28 object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-xs text-ink-500">
                <Camera className="h-3.5 w-3.5" aria-hidden /> No photos sent.
              </p>
            )}
            <p className="flex items-start gap-2 text-xs text-ink-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Refund plan: {zar(plan.breakdown.linesCents)} for the items{plan.breakdown.deliveryCents ? ` + ${zar(plan.breakdown.deliveryCents)} delivery` : ""} = {zar(plan.breakdown.totalCents)}
              {plan.breakdown.note ? `. ${plan.breakdown.note}` : "."}{" "}
              {plan.voucher.toVoucher > 0 ? `${zar(plan.voucher.toVoucher)} goes back onto gift voucher ${plan.voucher.parts.map((v) => v.code).join(", ")} with the credit note (a voucher is never cashed out)${plan.voucher.toTender > 0 ? `; ${zar(plan.voucher.toTender)} in money` : "; nothing to pay out in money"}. ` : ""}
              {plan.voucher.toTender > 0 || plan.voucher.toVoucher === 0 ? (plan.gateway ? `Paid through ${plan.gateway === "PEACH" ? "Peach Payments" : "Yoco"}: refunded by amount there.` : "Not paid through the online gateway: refunded by hand.") : ""}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="History" />
          <CardBody>
            <ol className="relative space-y-4 border-l border-ink-150 pl-5">
              {d.history.map((h, i) => (
                <li key={h.id} className="relative">
                  <span className={`absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full ring-4 ring-white ${i === d.history.length - 1 ? "bg-brand-500" : "bg-ink-300"}`} aria-hidden />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b className="text-ink-900">{ACTION_LABEL[h.action] ?? h.action}</b>
                    <span className="text-xs text-ink-500">
                      {h.actorName ?? "System"} · {fmtDateTime(h.at)}
                    </span>
                  </div>
                  {!!(h.data as { note?: string } | null)?.note && <p className="mt-1 text-sm text-ink-700">{(h.data as { note?: string }).note}</p>}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Status" />
          <CardBody>
            <dl className="divide-y divide-ink-100 text-sm">
              <Detail label="Return">
                <ReturnStatusBadge status={r.status} />
              </Detail>
              <Detail label="Reason">
                <ReasonBadge reason={r.reason} />
              </Detail>
              <Detail label="Requested">{fmtDateTime(r.createdAt)}</Detail>
              {r.decidedAt && <Detail label="Decided">{`${fmtDateTime(r.decidedAt)}${d.decidedBy ? ` · ${d.decidedBy.name}` : ""}`}</Detail>}
              {r.courier && <Detail label="Courier">{r.courier}</Detail>}
              {r.waybill && <Detail label="Waybill">{r.waybill}</Detail>}
              {r.refundCents != null && <Detail label="Refund">{zar(r.refundCents)}</Detail>}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Order" />
          <CardBody>
            <dl className="divide-y divide-ink-100 text-sm">
              <Detail label="Code">
                <Link href={links.order} className="font-mono hover:text-brand-700">
                  {order.code}
                </Link>
              </Detail>
              <Detail label="Status">
                <StatusBadge status={order.status} />
              </Detail>
              <Detail label="Payment">
                <StatusBadge status={order.paymentStatus} />
              </Detail>
              <Detail label="Fulfilled by">{order.store.name}</Detail>
              <Detail label="Delivered">{order.completedAt ? fmtDateTime(order.completedAt) : "—"}</Detail>
              <Detail label="Total">{zar(order.totalCents)}</Detail>
              {order.sale && <Detail label="Sale">{order.sale.number}</Detail>}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Member" />
          <CardBody className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              {links.member ? (
                <Link href={links.member} className="font-semibold text-ink-900 hover:text-brand-700">
                  {c.firstName} {c.lastName ?? ""}
                </Link>
              ) : (
                <span className="font-semibold text-ink-900">
                  {c.firstName} {c.lastName ?? ""}
                </span>
              )}
              <TierBadge tier={c.tier} />
            </div>
            <p className="font-mono text-xs text-ink-500">{c.memberNo}</p>
            <p className="text-ink-700">{displayPhone(c.phone)}</p>
            {c.email && <p className="text-ink-700 [overflow-wrap:anywhere]">{c.email}</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
