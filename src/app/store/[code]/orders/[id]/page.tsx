import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, ShieldCheck, TriangleAlert } from "lucide-react";
import { requireStaff } from "@/server/auth";
import { canManageStore, storeForUser } from "@/server/scope";
import { nextStatuses } from "@/server/orders";
import { orderForStore } from "@/server/store/orders";
import { FULFIL_LABEL } from "@/server/store/rules";
import { zar } from "@/lib/money";
import { fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { displayPhone, PROVINCES } from "@/lib/sa";
import { moveOrder, shipMerch } from "../actions";
import { OrderActions } from "./order-actions";
import { MerchShippedForm } from "./merch-shipped-form";
import { PageHeader, Notice } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, TierBadge } from "@/components/ui/status";
import { ButtonLink } from "@/components/ui/button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { BackLink, Line, ReadOnlyNote } from "@/components/store/ui";
import { cn } from "@/lib/cn";

export const metadata = { title: "Online order" };

const EVENT_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PLACED: "Order placed",
  PICKING: "Picking started",
  READY: "Packed & ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  MERCH: "Merch partner",
};

export default async function OrderPage({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const user = await requireStaff();
  const store = await storeForUser(user, code);
  const canManage = canManageStore(user);
  const d = await orderForStore(store.id, id);
  if (!d) notFound();
  const { order: o, lines } = d;
  const merch = lines.filter((l) => l.made);
  const merchOnly = merch.length > 0 && merch.length === lines.length;
  const next = nextStatuses(o);
  const due = o.totalCents - o.pointsRedeemed * 100;
  const c = o.customer;
  const base = `/store/${store.code}`;
  const open = ["PLACED", "PICKING", "READY"].includes(o.status);
  const shortLines = lines.filter((l) => open && l.short > 0);
  const units = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <>
      <BackLink href={`${base}/orders`}>Online orders</BackLink>
      <PageHeader
        overline={`${FULFIL_LABEL[o.fulfilment]} · placed ${timeAgo(o.createdAt)}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono tracking-wide">{o.code}</span>
            <StatusBadge status={o.status} />
            <StatusBadge status={o.paymentStatus} />
          </span>
        }
        description={`${c.firstName} ${c.lastName ?? ""} · ${units} item${units === 1 ? "" : "s"} · ${zar(o.totalCents)}`}
        actions={
          <ButtonLink href={`${base}/orders/${o.id}/pick-list`} variant="outline" size="sm">
            <Printer className="h-4 w-4" aria-hidden /> Pick list
          </ButtonLink>
        }
      />

      {shortLines.length > 0 && (
        <Notice tone="danger" className="mb-4" title="Not enough stock to fill this order">
          {shortLines.map((l) => `${l.variant.product.name} · ${l.variant.name} (short ${l.short})`).join(", ")}. Count the shelf, or cancel and let the customer know.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {merch.length > 0 && (
            <Card className={cn(o.podRef && o.podStatus !== "shipped" && "border-brand-300 ring-4 ring-brand-500/10")}>
              <CardHeader
                title="Made-to-order merch"
                description={`${merch.reduce((s, l) => s + l.qty, 0)} piece(s) made and couriered by our merch partner — nothing to pick here.`}
              />
              <CardBody>
                {!o.podRef ? (
                  <p className="text-sm text-ink-600">The production order goes to the merch partner as soon as the payment clears.</p>
                ) : o.podStatus === "shipped" ? (
                  <p className="text-sm text-ink-600">Shipped — the tracking number is in the timeline and was sent to the customer.</p>
                ) : canManage ? (
                  <>
                    <p className="mb-3 text-sm text-ink-600">Production order sent. When the partner emails the courier and tracking number, enter it here: the customer is texted their tracking{merchOnly ? " and the order goes out for delivery" : ""}.</p>
                    <MerchShippedForm action={shipMerch.bind(null, store.code, o.id)} />
                  </>
                ) : (
                  <ReadOnlyNote>Production order sent — a manager records the partner&apos;s tracking number.</ReadOnlyNote>
                )}
              </CardBody>
            </Card>
          )}
          {next.length > 0 && !(merchOnly && o.podStatus !== "shipped") && (
            <Card className="border-brand-300 ring-4 ring-brand-500/10">
              <CardHeader title="Next step" description={o.status === "PENDING_PAYMENT" ? "Waiting for the online payment to clear." : merchOnly ? "The merch partner couriered it — mark delivered once the courier confirms." : o.fulfilment === "COLLECT" ? "Pick, pack, then hand over when the customer arrives." : "Pick, pack and dispatch."} />
              <CardBody>
                {canManage ? (
                  <OrderActions
                    next={next}
                    fulfilment={o.fulfilment}
                    paid={o.paymentStatus === "PAID"}
                    dueCents={due}
                    ageRestricted={d.ageRestricted}
                    needsDispenser={d.licensed && d.medical}
                    canDispense={user.canDispense}
                    collectionCode={o.collectionCode}
                    action={moveOrder.bind(null, store.code, o.id)}
                  />
                ) : (
                  <ReadOnlyNote>Read-only — hand over or dispatch at the POS.</ReadOnlyNote>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Items" description={open && !merchOnly ? "Pick from the batches shown — first expiry, first out" : undefined} />
            <Table className="mt-3">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Unit</Th>
                  <Th align="right">Total</Th>
                  {open && <Th>Pick from</Th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <Tr key={l.id}>
                    <Td className="min-w-48">
                      <Link href={`${base}/inventory/${l.variantId}`} className="font-medium text-ink-900 hover:text-brand-700">
                        {l.variant.product.name} <span className="text-ink-500">· {l.variant.name}</span>
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-ink-400">
                        <span className="font-mono">{l.variant.sku}</span>
                        {l.licensed && <Badge tone="violet">Licensed</Badge>}
                        {l.made && <Badge tone="orange">Made to order · ships from the merch partner</Badge>}
                      </div>
                    </Td>
                    <Td align="right" className="font-semibold text-ink-950">{l.qty}</Td>
                    <Td align="right" className="text-ink-600">{zar(l.unitPriceCents)}</Td>
                    <Td align="right">
                      {zar(l.totalCents)}
                      {l.totalCents < l.qty * l.unitPriceCents && <div className="text-xs text-leaf-700">−{zar(l.qty * l.unitPriceCents - l.totalCents)}</div>}
                    </Td>
                    {open && (
                      <Td className="whitespace-nowrap">
                        {l.pick.map((p) => (
                          <div key={p.code} className="font-mono text-xs text-ink-700">
                            {p.code} ×{p.qty}
                            {p.expiresAt && <span className="font-sans text-ink-400"> · exp {fmtDate(p.expiresAt)}</span>}
                          </div>
                        ))}
                        {l.short > 0 && <div className="text-xs font-semibold text-rose-600">{l.short} not on hand</div>}
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="grid gap-x-10 border-t border-ink-100 px-5 py-4 sm:grid-cols-2">
              <div />
              <div>
                <Line label="Subtotal" value={zar(o.subtotalCents)} />
                {o.discountCents > 0 && <Line label={`Discount${o.promoCode ? ` (${o.promoCode})` : ""}`} value={`−${zar(o.discountCents)}`} />}
                {o.deliveryCents > 0 && <Line label="Delivery" value={zar(o.deliveryCents)} />}
                <Line label="Total" value={zar(o.totalCents)} strong />
                <Line label="incl. VAT" value={zar(o.vatCents)} muted />
                {o.pointsRedeemed > 0 && <Line label="Paid with points" value={`${fmtPoints(o.pointsRedeemed)} (${zar(o.pointsRedeemed * 100)})`} />}
                <Line label={o.paymentStatus === "PAID" ? "Paid" : "To pay"} value={zar(due)} strong />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <ol className="space-y-3">
                {d.events.map((e, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", i === d.events.length - 1 ? "bg-brand-500 ring-4 ring-brand-500/20" : "bg-ink-300")} aria-hidden />
                    <div>
                      <div className="font-semibold text-ink-900">{EVENT_LABEL[e.status] ?? e.status}</div>
                      <div className="text-xs text-ink-500">
                        {fmtDateTime(e.at)}
                        {e.note && ` · ${e.note}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {o.fulfilment === "COLLECT" && (
            <div className="rounded-2xl bg-ink-950 p-5 text-white shadow-card">
              <div className="eyebrow text-brand-500">Collection code</div>
              <div className="mt-1 font-mono text-4xl font-bold tracking-[0.25em]">{o.collectionCode}</div>
              <p className="mt-2 text-xs text-ink-300">The customer shows this code and an ID document (18+) at the counter. Never read it out to them.</p>
            </div>
          )}

          <Card>
            <CardHeader title="Customer" />
            <CardBody className="space-y-1 pt-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink-900">
                  {c.firstName} {c.lastName ?? ""}
                </span>
                <TierBadge tier={c.tier} />
              </div>
              <Line label="Member no." value={c.homeStoreId === store.id ? <Link href={`${base}/customers/${c.id}`} className="text-brand-700 hover:underline">{c.memberNo}</Link> : c.memberNo} />
              <Line label="Mobile" value={displayPhone(c.phone)} />
              <Line
                label="Age check"
                value={c.ageVerifiedAt ? <span className="inline-flex items-center gap-1 text-leaf-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {c.ageCheck === "VERIFIED" ? "Verified" : c.ageCheck === "ID_NUMBER" ? "ID number" : "ID sighted"}</span> : <span className="text-amber-700">Check ID at handover</span>}
              />
            </CardBody>
          </Card>

          {d.licensed && d.medical && (
            <Card>
              <CardBody className="flex gap-3 text-sm">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                <div className="text-ink-700">
                  <b className="text-ink-900">Licensed medicines.</b> An authorised dispenser hands this over; the patient authorisation and monthly limit were checked at checkout.{" "}
                  {user.canDispense ? <span className="text-leaf-700">You&apos;re an authorised dispenser.</span> : <span className="text-rose-600">You&apos;re not an authorised dispenser.</span>}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Fulfilment" />
            <CardBody className="space-y-1 pt-3 text-sm">
              <Line label="Method" value={FULFIL_LABEL[o.fulfilment]} />
              {o.fulfilment !== "COLLECT" && (
                <div className="py-1.5">
                  <div className="text-ink-500">Deliver to</div>
                  <div className="mt-0.5 text-ink-850">
                    {o.addressLine}, {o.suburb}
                    <br />
                    {o.city}, {o.province ? PROVINCES[o.province] : ""} {o.postalCode}
                  </div>
                  {o.deliveryNotes && <div className="mt-1 text-xs text-ink-500">“{o.deliveryNotes}”</div>}
                </div>
              )}
              {o.courier && <Line label="Courier" value={o.courier} />}
              {o.trackingNo && <Line label="Tracking" value={<span className="font-mono">{o.trackingNo}</span>} />}
              {o.routingNote && <Line label="Routing" value={<span className="text-ink-600">{o.routingNote}</span>} />}
              <Line label="Payment" value={o.payMethod === "ONLINE" ? "Paid online" : "Pay in store"} />
              {o.paymentRef && <Line label="Reference" value={<span className="font-mono text-xs">{o.paymentRef}</span>} />}
              {o.sale && <Line label="Sale" value={<span className="font-mono text-xs">{o.sale.number}</span>} />}
              {o.status === "COMPLETED" && <Line label="ID checked" value={o.idChecked ? "Yes" : "Not recorded"} />}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
