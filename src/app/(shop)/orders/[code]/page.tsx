import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, Circle, Clock, CreditCard, FileText, IdCard, MapPin, Navigation, Package, Phone, Truck, XCircle } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { invoiceUrl } from "@/server/invoices";
import { openState, parseHours, weekRows } from "@/server/shop/hours";
import { directionsUrl } from "@/components/shop/store-card";
import { QrCode } from "@/components/shop/qr";
import { ButtonLink } from "@/components/ui/button";
import { Callout, Container, Panel, Tag, type TagTone } from "@/components/shop/ui";
import { ProductArt } from "@/components/product/art";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { zar } from "@/lib/money";
import { PROVINCES, type ProvinceCode } from "@/lib/sa";
import { cn } from "@/lib/cn";
import type { OrderStatus } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Track your order", robots: { index: false } };

type Event = { status: OrderStatus; at: string; note?: string };
const STATUS: Record<OrderStatus, [string, TagTone]> = {
  PENDING_PAYMENT: ["Awaiting payment", "amber"],
  PLACED: ["Order placed", "orange"],
  PICKING: ["Being packed", "violet"],
  READY: ["Ready", "green"],
  OUT_FOR_DELIVERY: ["Out for delivery", "violet"],
  COMPLETED: ["Completed", "neutral"],
  CANCELLED: ["Cancelled", "red"],
};

export default async function OrderPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ placed?: string; paid?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const order = await db.order.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      store: { select: { name: true, slug: true, addressLine: true, suburb: true, city: true, phone: true, hours: true, lat: true, lng: true } },
      lines: { include: { variant: { include: { product: { select: { name: true, slug: true, strain: true, regClass: true } } } } } },
      sale: { select: { id: true, number: true, pointsEarned: true } },
    },
  });
  if (!order) notFound();
  const [customer, settings] = await Promise.all([getCustomer(), getSettings()]);
  const mine = customer?.id === order.customerId;
  const events = (order.events as Event[]) ?? [];
  const at = (s: OrderStatus) => events.filter((e) => e.status === s).at(-1)?.at;
  const collect = order.fulfilment === "COLLECT";
  const medicine = order.lines.some((l) => settings.compliance.licensedOnly.includes(l.variant.product.regClass));
  // Made-to-order merch is made for this order and ships on its own (the maker is never named to customers).
  const made = order.lines.filter((l) => l.variant.podSku);
  const merchOnly = made.length > 0 && made.length === order.lines.length;
  const idAtDoor = order.lines.some((l) => settings.compliance.ageRestricted.includes(l.variant.product.regClass));
  const steps: { key: OrderStatus; label: string; sub: string }[] = [
    ...(order.paymentStatus !== "PAID" && order.payMethod === "ONLINE" && order.status !== "CANCELLED" ? [{ key: "PENDING_PAYMENT" as const, label: "Awaiting payment", sub: "Complete payment to confirm your order" }] : []),
    { key: "PLACED", label: "Order placed", sub: collect ? `Sent to ${order.store.name}` : "We've received your order" },
    merchOnly ? { key: "PICKING", label: "Being made", sub: "Embroidered and printed for you" } : { key: "PICKING", label: "Being packed", sub: "Checked against the batch on the shelf" },
    { key: "READY", label: collect ? "Ready for collection" : merchOnly ? "Made and packed" : "Packed and ready", sub: collect ? "We'll SMS you — bring your ID" : merchOnly ? "Handed to the courier" : "Waiting for the driver" },
    ...(collect ? [] : [{ key: "OUT_FOR_DELIVERY" as const, label: "Out for delivery", sub: order.courier ? `${order.courier}${order.trackingNo ? ` · ${order.trackingNo}` : ""}` : idAtDoor ? "ID (18+) checked at the door" : "On its way to you" }]),
    { key: "COMPLETED", label: collect ? "Collected" : "Delivered", sub: medicine ? "Use only as directed by your prescriber" : "Enjoy — responsibly" },
  ];
  const order_ = steps.map((s) => s.key);
  const current = order.status === "CANCELLED" ? -1 : order_.indexOf(order.status);
  const open = !["COMPLETED", "CANCELLED"].includes(order.status);
  const due = order.totalCents - order.pointsRedeemed * 100;
  const saved = order.lines.reduce((s, l) => s + l.memberSavingsCents, 0);
  const [statusLabel, tone] = STATUS[order.status];
  const holdUntil = new Date(order.createdAt.getTime() + settings.ecommerce.unpaidHoldMinutes * 60_000);
  const readyAt = at("READY");
  const store = openState(parseHours(order.store.hours));

  return (
    <Container className="pt-10 sm:pt-14">
      {mine && sp.placed && order.status !== "CANCELLED" && (
        <Callout tone="success" icon={<CheckCircle2 className="h-5 w-5" />} title={`Thank you${customer ? `, ${customer.firstName}` : ""} — your order is in.`} className="mb-8">
          We&apos;ve sent a confirmation by SMS{collect ? ` and ${order.store.name} is getting it ready` : ""}. {order.payMethod !== "ONLINE" ? `Pay ${zar(due)} when you collect.` : ""}
        </Callout>
      )}
      {mine && sp.paid && order.paymentStatus === "PAID" && (
        <Callout tone="success" icon={<CreditCard className="h-5 w-5" />} title="Payment received — thank you." className="mb-8">
          Your tax invoice will be emailed{collect ? " when you collect" : " when your order is dispatched"}.
        </Callout>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow text-brand-500">Order {order.code}</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {order.status === "CANCELLED" ? "Order cancelled" : order.status === "COMPLETED" ? (collect ? "Collected — thank you" : "Delivered — thank you") : collect ? `Collect at ${order.store.name}` : "On its way to you"}
          </h1>
          <p className="mt-2 text-ink-400">
            Placed {fmtDateTime(order.createdAt)} · {collect ? "Click & collect" : order.fulfilment === "SAME_DAY" ? "Same-day delivery" : "Courier delivery"}
          </p>
        </div>
        <Tag tone={tone} className="self-start px-3 py-1 text-xs sm:self-auto">
          {statusLabel}
        </Tag>
      </div>

      {order.status === "PENDING_PAYMENT" && (
        <Callout tone="warn" icon={<Clock className="h-5 w-5" />} title={`Complete payment by ${fmtTime(holdUntil)}`} className="mt-8">
          Unpaid orders are released after {settings.ecommerce.unpaidHoldMinutes} minutes and the stock goes back on the shelf.
          {mine && (
            <div className="mt-3">
              <ButtonLink href={`/checkout/pay/${order.id}`} size="md">
                Pay {zar(due)} now
              </ButtonLink>
            </div>
          )}
        </Callout>
      )}

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <div className="space-y-8">
          {/* Collection pass */}
          {collect && open && order.status !== "PENDING_PAYMENT" && (
            <Panel className="overflow-hidden">
              <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                {mine ? (
                  <div className="mx-auto w-44 rounded-2xl bg-white p-3 sm:mx-0">
                    <QrCode value={`HHORDER:${order.code}:${order.collectionCode}`} label={`Collection QR for order ${order.code}`} />
                  </div>
                ) : (
                  <div className="mx-auto grid h-44 w-44 place-items-center rounded-2xl border border-dashed border-ink-700 text-center text-xs text-ink-400 sm:mx-0">Sign in to see your collection code</div>
                )}
                <div>
                  <div className="eyebrow text-ink-400">Collection code</div>
                  <div className="tnum mt-1 font-display text-5xl font-semibold tracking-[0.15em] text-white">{mine ? order.collectionCode : "••••••"}</div>
                  <p className="mt-3 flex items-start gap-2 text-sm text-ink-300">
                    <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> Show this code and your ID (18+) at the counter. Only you can collect this order.
                  </p>
                  {order.status === "READY" && (
                    <p className="mt-2 text-sm text-leaf-100">
                      Ready since {readyAt ? fmtDateTime(readyAt) : "today"} — we&apos;ll hold it for {settings.ecommerce.collectHoldDays} days{order.paymentStatus !== "PAID" ? `. Pay ${zar(due)} at the counter` : ""}.
                    </p>
                  )}
                  {order.status !== "READY" && <p className="mt-2 text-sm text-ink-400">We&apos;ll SMS you as soon as it&apos;s ready. Collections are held for {settings.ecommerce.collectHoldDays} days.</p>}
                </div>
              </div>
            </Panel>
          )}

          {/* Timeline */}
          <Panel className="p-6">
            <h2 className="font-display text-lg font-semibold text-white">Progress</h2>
            {order.status === "CANCELLED" ? (
              <p className="mt-4 flex items-start gap-3 text-sm text-ink-300">
                <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
                Cancelled {at("CANCELLED") ? fmtDateTime(at("CANCELLED")!) : ""}.{" "}
                {order.paymentStatus === "REFUNDED" ? "Your payment has been refunded." : ""} {order.pointsRedeemed ? `${fmtPoints(order.pointsRedeemed)} have been returned to your balance.` : ""}
              </p>
            ) : (
              <ol className="mt-5">
                {steps.map((s, i) => {
                  const done = i < current || order.status === "COMPLETED";
                  const now = i === current && order.status !== "COMPLETED";
                  const when = at(s.key);
                  return (
                    <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < steps.length - 1 && <span className={cn("absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-0.5", done ? "bg-leaf-500" : "bg-ink-800")} aria-hidden />}
                      <span className="relative z-10 mt-0.5 shrink-0">
                        {done ? (
                          <CheckCircle2 className="h-6 w-6 text-leaf-500" />
                        ) : now ? (
                          <span className="relative grid h-6 w-6 place-items-center">
                            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-500/50" />
                            <span className="h-3.5 w-3.5 rounded-full bg-brand-500" />
                          </span>
                        ) : (
                          <Circle className="h-6 w-6 text-ink-700" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className={cn("font-semibold", done || now ? "text-white" : "text-ink-500")}>{s.label}</div>
                        <div className="text-sm text-ink-400">
                          {when && (done || now) ? `${fmtDateTime(when)} · ` : ""}
                          {s.sub}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>

          {/* Items */}
          {mine && (
            <Panel>
              <h2 className="px-6 pt-5 font-display text-lg font-semibold text-white">Items</h2>
              <ul className="divide-y divide-ink-800 px-6">
                {order.lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-4 py-4">
                    <ProductArt slug={l.variant.product.slug} strain={l.variant.product.strain} regClass={l.variant.product.regClass} label={l.variant.product.name} className="h-14 w-14 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-white">{l.variant.product.name}</div>
                      <div className="text-sm text-ink-400">
                        {l.variant.name} · qty {l.qty}
                      </div>
                    </div>
                    <div className="tnum text-right text-sm text-ink-100">{zar(l.totalCents)}</div>
                  </li>
                ))}
              </ul>
              <dl className="space-y-2 border-t border-ink-800 px-6 py-5 text-sm">
                {order.discountCents > 0 && (
                  <div className="flex justify-between text-leaf-100">
                    <dt>Discounts</dt>
                    <dd className="tnum">−{zar(order.discountCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink-300">{collect ? "Collection" : "Delivery"}</dt>
                  <dd className="tnum text-ink-100">{order.deliveryCents ? zar(order.deliveryCents) : "Free"}</dd>
                </div>
                {order.pointsRedeemed > 0 && (
                  <div className="flex justify-between text-leaf-100">
                    <dt>Points redeemed</dt>
                    <dd className="tnum">−{zar(order.pointsRedeemed * 100)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-ink-800 pt-3">
                  <dt className="font-semibold text-white">{order.paymentStatus === "PAID" ? "Paid" : collect && order.payMethod !== "ONLINE" ? "To pay in store" : "Total"}</dt>
                  <dd className="tnum font-display text-2xl font-semibold text-white">{zar(due)}</dd>
                </div>
                {order.vatCents > 0 && <p className="text-right text-xs text-ink-500">Includes VAT of {zar(order.vatCents)}</p>}
                {saved > 0 && <p className="rounded-xl bg-brand-500/10 px-3 py-2 text-sm font-semibold text-brand-100">You saved {zar(saved)} with Herbal Holland Rewards</p>}
              </dl>
            </Panel>
          )}
        </div>

        <aside className="space-y-4">
          {collect ? (
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                <MapPin className="h-5 w-5 text-brand-500" /> Herbal Holland {order.store.name}
              </h2>
              <p className="mt-1 text-sm text-ink-300">
                {order.store.addressLine}, {order.store.suburb}, {order.store.city}
              </p>
              <p className={cn("mt-2 text-sm font-medium", store.open ? "text-leaf-100" : "text-ink-400")}>{store.label}</p>
              <dl className="mt-4 space-y-1 text-sm">
                {weekRows(parseHours(order.store.hours)).map((r) => (
                  <div key={r.key} className={cn("flex justify-between", r.today ? "font-semibold text-white" : "text-ink-400")}>
                    <dt>{r.label}</dt>
                    <dd className="tnum">{r.span}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={directionsUrl(order.store)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-500 px-4 text-sm font-semibold text-ink-950 hover:bg-brand-400">
                  <Navigation className="h-4 w-4" /> Directions
                </a>
                {order.store.phone && (
                  <a href={`tel:${order.store.phone.replace(/\s/g, "")}`} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-700 px-4 text-sm font-semibold text-ink-100 hover:border-ink-500">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                )}
              </div>
            </Panel>
          ) : (
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                <Truck className="h-5 w-5 text-brand-500" /> Delivery
              </h2>
              {mine && order.addressLine ? (
                <p className="mt-2 text-sm leading-relaxed text-ink-300">
                  {order.addressLine}
                  <br />
                  {order.suburb}, {order.city}
                  <br />
                  {order.province ? PROVINCES[order.province as ProvinceCode] : ""} {order.postalCode}
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink-400">Sign in to see the delivery address.</p>
              )}
              <p className="mt-3 text-sm text-ink-400">{merchOnly ? "Made to order in South Africa and couriered to you." : `Ships from ${order.store.name}.`}</p>
              {order.trackingNo && (
                <p className="mt-2 text-sm text-ink-300">
                  {order.courier} · tracking <span className="tnum font-semibold text-white">{order.trackingNo}</span>
                </p>
              )}
              {made.length > 0 && !merchOnly && (
                <p className="mt-2 text-sm text-ink-300">
                  Your merch is made to order and ships separately
                  {order.podTracking ? (
                    <>
                      {" "}· tracking <span className="tnum font-semibold text-white">{order.podTracking}</span>
                    </>
                  ) : (
                    " — we'll SMS its tracking number"
                  )}
                  .
                </p>
              )}
              {idAtDoor && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-ink-850 px-3 py-2.5 text-sm text-ink-200">
                  <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> ID (18+) is checked on delivery. We can&apos;t leave the parcel without it.
                </p>
              )}
            </Panel>
          )}

          {mine && order.sale && (
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                <FileText className="h-5 w-5 text-brand-500" /> Your invoice
              </h2>
              <p className="mt-1 text-sm text-ink-400">
                Invoice {order.sale.number}
                {order.sale.pointsEarned > 0 && ` · you earned ${fmtPoints(order.sale.pointsEarned)}`}
              </p>
              <ButtonLink href={invoiceUrl(order.sale.id).replace(/^https?:\/\/[^/]+/, "")} variant="outline-dark" size="md" className="mt-4">
                View or print invoice
              </ButtonLink>
            </Panel>
          )}

          <Panel className="p-5 text-sm text-ink-400">
            <p>
              <Package className="mr-1.5 inline h-4 w-4 align-[-3px] text-ink-500" />
              Questions about this order? Quote <strong className="text-ink-100">{order.code}</strong>{" "}
              {order.store.phone ? (
                <>
                  and call {order.store.name} on <a href={`tel:${order.store.phone.replace(/\s/g, "")}`} className="text-brand-400 underline">{order.store.phone}</a>.
                </>
              ) : (
                "at any store."
              )}
            </p>
            {!mine && (
              <p className="mt-3">
                <Link href={`/club/join?next=${encodeURIComponent(`/orders/${order.code}`)}`} className="font-semibold text-brand-400 hover:underline">
                  Sign in
                </Link>{" "}
                to see your collection code, items and invoice.
              </p>
            )}
            {mine && <p className="mt-3">Order history lives in <Link href="/club/orders" className="font-semibold text-brand-400 hover:underline">your Rewards account</Link>. Placed {fmtDate(order.createdAt)}.</p>}
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
