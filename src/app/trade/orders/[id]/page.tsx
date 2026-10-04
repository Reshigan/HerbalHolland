// One trade order: what to do next (pay the pro forma, wait for the pick, collect with the code, track the courier),
// the timeline from its events, the lines ex VAT / VAT / incl. with short-shipped notes, the tax invoice once it
// exists, and "order again". Re-renders by itself while the order is open.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, Circle, Clock, FileText, IdCard, Landmark, MapPin, Package, Phone, Store, Truck, XCircle } from "lucide-react";
import { getSettings } from "@/server/settings";
import { invoicedTotal, tradeOrderById } from "@/server/trade/orders";
import { invoiceUrl } from "@/server/invoices";
import { LiveRefresh } from "@/components/shop/live-refresh";
import { Callout, Container, Panel } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { OrderStatusTag } from "@/components/trade/status";
import { ReorderTradeButton } from "@/components/trade/reorder-button";
import { FULFILMENT_LABEL, PAY_LABEL, fmtCases } from "@/components/trade/format";
import { addressLineOf, eftReference } from "@/lib/trade";
import { CopyButton } from "@/components/trade/copy-button";
import { addDays, fmtDate, fmtDateTime } from "@/lib/format";
import { zar } from "@/lib/money";
import { displayPhone, PROVINCES, type ProvinceCode } from "@/lib/sa";
import { cn } from "@/lib/cn";
import { requireBuyer } from "../../_lib/context";

export const metadata: Metadata = { title: "Order", robots: { index: false, follow: false } };

type Event = { status: string; at: string; note?: string };
const EVENT_LABEL: Record<string, string> = { PENDING_PAYMENT: "Pro forma sent", PLACED: "Confirmed — stock reserved", PICKING: "Being picked", READY: "Ready to collect", SHIPPED: "Shipped", COLLECTED: "Collected", CANCELLED: "Cancelled" };
const OPEN = ["PENDING_PAYMENT", "PLACED", "PICKING", "READY"];

export default async function TradeOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const buyer = await requireBuyer(`/trade/orders/${id}`);
  const [order, settings] = await Promise.all([tradeOrderById(id), getSettings()]);
  if (!order || order.tradeAccountId !== buyer.tradeAccountId) notFound();
  const t = settings.trade;
  const collect = order.fulfilment === "COLLECT";
  const events = ((order.events as Event[]) ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const open = OPEN.includes(order.status);
  const posted = order.status === "SHIPPED" || order.status === "COLLECTED";
  const short = order.lines.filter((l) => l.shippedQty != null && l.shippedQty < l.qty);
  const invoiced = posted ? invoicedTotal(order) : null;
  const payBy = addDays(order.createdAt, t.eftHoldDays);
  const bank = [["Bank", t.bank.bank], ["Account name", t.bank.accountName], ["Account number", t.bank.accountNumber], ["Branch code", t.bank.branchCode]].filter(([, v]) => v);
  const storeAddress = `${[order.store.addressLine, order.store.suburb, order.store.city].filter(Boolean).join(", ")}`;
  const province = order.province && order.province in PROVINCES ? PROVINCES[order.province as ProvinceCode] : order.province;
  const headline =
    order.status === "CANCELLED" ? "Order cancelled"
      : order.status === "PENDING_PAYMENT" ? `Pay ${zar(order.totalCents)} by EFT`
        : order.status === "READY" ? `Ready to collect at ${order.store.name}`
          : order.status === "SHIPPED" ? "On its way to you"
            : order.status === "COLLECTED" ? "Collected — thank you"
              : collect ? `Being prepared at ${order.store.name}` : `Being prepared at ${order.store.name}`;

  return (
    <Container className="pt-10 sm:pt-14">
      <LiveRefresh active={open} />
      {sp.placed && order.status !== "CANCELLED" && (
        <Callout tone="success" icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} title={`Thank you — order ${order.number} is in.`} className="mb-8">
          {order.status === "PENDING_PAYMENT" ? `A pro forma is on its way to ${order.account.email}. Pay it by EFT with the reference below and we pick the order as soon as the payment is confirmed.` : `A confirmation is on its way to ${order.account.email}. ${collect ? `${order.store.name} has your order and will let you know when it's packed.` : "Your stock is reserved and the order is in the picking queue."}`}
        </Callout>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/trade/orders" className="text-sm text-ink-400 hover:text-white">
            ← All orders
          </Link>
          <div className="eyebrow mt-3 text-brand-500">
            Order <span className="tnum">{order.number}</span>
          </div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{headline}</h1>
          <p className="mt-2 text-ink-400">
            Placed {fmtDateTime(order.createdAt)}
            {order.buyer ? ` by ${order.buyer.name}` : ""} · {FULFILMENT_LABEL[order.fulfilment] ?? order.fulfilment} · {PAY_LABEL[order.payMethod] ?? order.payMethod}
            {order.reference ? ` · your ref ${order.reference}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <OrderStatusTag status={order.status} className="px-3 py-1 text-xs" />
          {open && <span className="text-[0.7rem] text-ink-450">Updates by itself while it&apos;s open</span>}
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div className="space-y-8">
          {/* ── What to do next ─────────────────────────────────────── */}
          {order.status === "PENDING_PAYMENT" && (
            <Panel className="p-6" data-testid="pro-forma">
              <div className="eyebrow flex items-center gap-2 text-brand-500">
                <Landmark className="h-4 w-4" aria-hidden /> Pro forma · pay by EFT
              </div>
              <p className="mt-3 text-ink-200">
                Pay <strong className="tnum text-white">{zar(order.totalCents)}</strong> by EFT using the reference <strong className="tnum text-white">{eftReference(order.number)}</strong>, by {fmtDate(payBy)}. Unpaid orders lapse after {t.eftHoldDays} {t.eftHoldDays === 1 ? "day" : "days"}; stock is reserved as soon as we confirm the payment.
              </p>
              <dl className="tnum mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between gap-4 border-b border-ink-800 py-1.5">
                  <dt className="text-ink-400">Reference</dt>
                  <dd className="flex items-center gap-1 font-semibold text-white">
                    <span data-testid="eft-reference">{eftReference(order.number)}</span>
                    <CopyButton text={eftReference(order.number)} label="Copy the EFT reference" className="-my-1" />
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-ink-800 py-1.5">
                  <dt className="text-ink-400">Amount</dt>
                  <dd className="font-semibold text-white">{zar(order.totalCents)}</dd>
                </div>
                {bank.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-ink-800 py-1.5">
                    <dt className="text-ink-400">{k}</dt>
                    <dd className="text-white">{v}</dd>
                  </div>
                ))}
              </dl>
              {!bank.length && <p className="mt-3 text-xs text-ink-400">The bank details are on the pro forma email — or ask the trade team.</p>}
            </Panel>
          )}

          {collect && order.collectionCode && order.status !== "CANCELLED" && (
            <Panel className={cn("hh-beads-foot relative overflow-hidden p-6 pb-8", order.status === "READY" && "border-leaf-500/50")} data-testid="collection">
              <div className="eyebrow flex items-center gap-2 text-brand-500">
                <Store className="h-4 w-4" aria-hidden /> {order.status === "READY" ? "Ready to collect" : "Collect from"} · Herbal Holland {order.store.name}
              </div>
              <p className="mt-3 text-sm text-ink-300">
                {order.status === "READY"
                  ? `Packed and waiting at the counter${order.readyAt ? ` since ${fmtDateTime(order.readyAt)}` : ""}.`
                  : order.status === "PENDING_PAYMENT"
                    ? "The store starts picking once your EFT is confirmed."
                    : "The store is picking your order; we'll email and text when it's packed."}
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <div className="text-xs text-ink-400">Collection code</div>
                  <div className="tnum mt-1 font-display text-4xl font-semibold tracking-[0.12em] text-white" data-testid="collection-code">
                    {order.collectionCode}
                  </div>
                </div>
                <p className="flex items-center gap-2 text-sm text-ink-200">
                  <IdCard className="h-5 w-5 text-brand-500" aria-hidden /> Bring your ID (18+) and this code.
                </p>
              </div>
              <dl className="mt-5 space-y-1.5 text-sm text-ink-300">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-450" aria-hidden />
                  <dd>{storeAddress}</dd>
                </div>
                {order.store.phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-ink-450" aria-hidden />
                    <dd>
                      <a href={`tel:${order.store.phone.replace(/\s/g, "")}`} className="hover:text-white">
                        {order.store.phone}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </Panel>
          )}

          {!collect && order.status !== "CANCELLED" && order.status !== "PENDING_PAYMENT" && (
            <Panel className="p-6" data-testid="courier">
              <div className="eyebrow flex items-center gap-2 text-brand-500">
                <Truck className="h-4 w-4" aria-hidden /> {order.status === "SHIPPED" ? "Shipped" : "Courier from the DC"}
              </div>
              <p className="mt-3 text-sm text-ink-300">
                {order.status === "SHIPPED"
                  ? `Left ${order.store.name}${order.shippedAt ? ` on ${fmtDateTime(order.shippedAt)}` : ""} with ${order.courier ?? "the courier"}${order.trackingNo ? `, tracking ${order.trackingNo}` : ""}.`
                  : `Stock reserved at ${order.store.name}; the order is in the picking queue. We'll email when it ships, with the tracking number and the tax invoice.`}
              </p>
              <dl className="mt-4 space-y-1.5 text-sm text-ink-300">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-450" aria-hidden />
                  <dd>
                    {addressLineOf(order)}
                    {province ? `, ${province}` : ""}
                  </dd>
                </div>
                {order.trackingNo && (
                  <div className="flex items-start gap-2">
                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-ink-450" aria-hidden />
                    <dd className="tnum">
                      {order.courier} · {order.trackingNo}
                    </dd>
                  </div>
                )}
              </dl>
            </Panel>
          )}

          {order.status === "CANCELLED" && (
            <Callout tone="danger" icon={<XCircle className="h-5 w-5" aria-hidden />} title="This order was cancelled">
              {events.findLast((e) => e.status === "CANCELLED")?.note ?? "Any stock reserved for it is back on sale."}
            </Callout>
          )}

          {/* ── Timeline ──────────────────────────────────────────── */}
          <section aria-labelledby="timeline">
            <h2 id="timeline" className="font-display text-xl font-semibold text-white">
              Timeline
            </h2>
            <ol className="mt-4 space-y-3" data-testid="timeline">
              {events.map((e, i) => {
                const last = i === events.length - 1;
                return (
                  <li key={`${e.status}-${e.at}`} className="flex gap-3">
                    {last ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-leaf-500" aria-hidden /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-ink-600" aria-hidden />}
                    <div>
                      <div className={cn("font-semibold", last ? "text-white" : "text-ink-200")}>{EVENT_LABEL[e.status] ?? e.status}</div>
                      <div className="text-xs text-ink-400">
                        {fmtDateTime(e.at)}
                        {e.note ? ` · ${e.note}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* ── Lines ──────────────────────────────────────────────── */}
          <section aria-labelledby="lines">
            <h2 id="lines" className="font-display text-xl font-semibold text-white">
              Lines
            </h2>
            <ul className="tnum mt-4 divide-y divide-ink-800 rounded-2xl border border-ink-800 sm:hidden">
              {order.lines.map((l) => {
                const qty = l.shippedQty ?? l.qty;
                const isShort = l.shippedQty != null && l.shippedQty < l.qty;
                return (
                  <li key={l.id} className="p-4 text-sm">
                    <div className="font-medium text-white">
                      {l.variant.product.name} <span className="text-ink-300">· {l.variant.name}</span>
                    </div>
                    <div className="text-xs text-ink-400">
                      {l.variant.sku} · {fmtCases(l.qty, l.variant.caseQty)} · {zar(l.unitCents)} ex VAT each
                      {isShort ? ` · ordered ${l.qty}, ${l.shippedQty} supplied — invoiced for ${l.shippedQty}` : ""}
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-ink-400">Ex VAT</dt>
                        <dd className="text-white">{zar(l.unitCents * (posted ? qty : l.qty))}</dd>
                      </div>
                      <div>
                        <dt className="text-ink-400">VAT</dt>
                        <dd className="text-ink-200">{posted && isShort ? "—" : zar(l.vatCents)}</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-ink-400">Incl.</dt>
                        <dd className="text-ink-200">{posted && isShort ? "—" : zar(l.unitCents * l.qty + l.vatCents)}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-ink-800 sm:block">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="text-left text-[0.68rem] uppercase tracking-[0.12em] text-ink-400">
                  <tr className="border-b border-ink-800">
                    <th scope="col" className="px-4 py-3 font-semibold">Line</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Qty</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Unit ex VAT</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Ex VAT</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">VAT</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Incl.</th>
                  </tr>
                </thead>
                <tbody className="tnum divide-y divide-ink-800">
                  {order.lines.map((l) => {
                    const qty = l.shippedQty ?? l.qty;
                    const isShort = l.shippedQty != null && l.shippedQty < l.qty;
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">
                            {l.variant.product.name} <span className="text-ink-300">· {l.variant.name}</span>
                          </div>
                          <div className="text-xs text-ink-400">
                            {l.variant.sku}
                            {isShort ? ` · ordered ${l.qty}, ${l.shippedQty} supplied — invoiced for ${l.shippedQty}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-ink-200">{fmtCases(l.qty, l.variant.caseQty)}</td>
                        <td className="px-4 py-3 text-right text-ink-200">{zar(l.unitCents)}</td>
                        <td className="px-4 py-3 text-right text-white">{zar(l.unitCents * (posted ? qty : l.qty))}</td>
                        <td className="px-4 py-3 text-right text-ink-200">{posted && isShort ? "—" : zar(l.vatCents)}</td>
                        <td className="px-4 py-3 text-right text-ink-200">{posted && isShort ? "—" : zar(l.unitCents * l.qty + l.vatCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {short.length > 0 && <p className="mt-2 text-xs text-ink-400">Short-supplied lines are invoiced for what was supplied; the tax invoice carries the exact figures.</p>}
          </section>
        </div>

        {/* ── Totals and actions ─────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <Panel className="p-6">
            <h2 className="font-display text-lg font-semibold text-white">Totals</h2>
            <dl className="tnum mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-300">Subtotal ex VAT</dt>
                <dd className="text-white">{zar(order.subtotalCents)}</dd>
              </div>
              {order.deliveryCents > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-300">Courier ex VAT</dt>
                  <dd className="text-white">{zar(order.deliveryCents)}</dd>
                </div>
              )}
              {!collect && order.deliveryCents === 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-300">Courier</dt>
                  <dd className="text-white">Free</dd>
                </div>
              )}
              {order.handlingCents > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-300">Handling ex VAT</dt>
                  <dd className="text-white">{zar(order.handlingCents)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-ink-300">VAT @ 15%</dt>
                <dd className="text-white">{zar(order.vatCents)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-ink-800 pt-3 text-base">
                <dt className="font-semibold text-white">{invoiced != null && invoiced !== order.totalCents ? "Ordered incl. VAT" : "Total incl. VAT"}</dt>
                <dd className="font-display text-xl font-semibold text-white" data-testid="order-total">{zar(order.totalCents)}</dd>
              </div>
              {invoiced != null && invoiced !== order.totalCents && (
                <div className="flex justify-between gap-4 text-base">
                  <dt className="font-semibold text-white">Invoiced incl. VAT</dt>
                  <dd className="font-display text-xl font-semibold text-white">{zar(invoiced)}</dd>
                </div>
              )}
            </dl>
            {order.payMethod === "ACCOUNT" && (
              <p className="mt-3 text-xs text-ink-400">On account: the tax invoice falls due {order.account.paymentDays} days from {collect ? "collection" : "shipping"}.</p>
            )}
            {order.payMethod === "EFT" && order.paidAt && <p className="mt-3 text-xs text-ink-400">EFT confirmed {fmtDate(order.paidAt)} (ref {order.paymentRef}).</p>}
          </Panel>
          {order.saleId && (
            <a href={invoiceUrl(order.saleId)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/60 p-4 transition hover:border-brand-500/60">
              <FileText className="h-5 w-5 text-brand-500" aria-hidden />
              <span>
                <span className="block font-semibold text-white">Tax invoice {order.invoiceNumber}</span>
                <span className="block text-xs text-ink-400">View or print it (opens in a new tab)</span>
              </span>
            </a>
          )}
          {order.status === "PENDING_PAYMENT" && (
            <p className="flex items-start gap-2 text-xs text-ink-400">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Paid already? It shows here as soon as the trade team matches the payment.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <ReorderTradeButton orderId={order.id} />
            <ButtonLink href="/trade/range" variant="ghost-dark" size="md" className="h-11">
              Browse the range
            </ButtonLink>
          </div>
          {order.notes && (
            <Panel className="p-4 text-sm text-ink-300">
              <div className="eyebrow text-ink-400">Your notes</div>
              <p className="mt-1 whitespace-pre-line">{order.notes}</p>
            </Panel>
          )}
          {order.buyer?.phone && collect && <p className="text-xs text-ink-450">Ready-to-collect texts go to {displayPhone(order.buyer.phone)}.</p>}
        </aside>
      </div>
    </Container>
  );
}
