// The order tracker: a live page for an open order (re-rendered when the tab comes back and every minute), with the
// collection code large for click & collect, courier and tracking for delivery, every event with its time, the
// expected arrival, the items and totals (points and gift vouchers shown), "buy again", the invoice and returns.
// A gift voucher purchase shows the voucher instead of a parcel.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, Circle, Clock, CreditCard, FileText, Gift, IdCard, Loader2, MapPin, Navigation, Package, Phone, Truck, Undo2, XCircle } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { invoiceUrl } from "@/server/invoices";
import { hostedGateway, HOSTED_GATEWAYS } from "@/server/payments";
import { openState, parseHours, weekRows } from "@/server/shop/hours";
import { isVoucherOrder, redemptionsOf, voucherOfOrder } from "@/server/shop/vouchers";
import { mainImages, productImageUrl } from "@/server/shop/images";
import { directionsUrl } from "@/components/shop/store-card";
import { QrCode } from "@/components/shop/qr";
import { AwaitPayment } from "@/components/shop/pay-form";
import { LiveRefresh } from "@/components/shop/live-refresh";
import { ReorderButton } from "@/components/shop/reorder-button";
import { ButtonLink } from "@/components/ui/button";
import { Callout, Container, Panel, Tag, type TagTone } from "@/components/shop/ui";
import { ProductArt } from "@/components/product/art";
import { deliveryEstimate } from "@/lib/delivery";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { fmtPoints } from "@/lib/loyalty-rules";
import { RETURN_STATUS, RETURN_WINDOWS } from "@/lib/returns";
import { zar } from "@/lib/money";
import { possessive } from "@/lib/online-payments";
import { peachReturn } from "@/lib/peach";
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

export default async function OrderPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ placed?: string; paid?: string; pay?: string; status?: string }> }) {
  const [{ code }, sp] = await Promise.all([params, searchParams]);
  const order = await db.order.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      store: { select: { name: true, slug: true, addressLine: true, suburb: true, city: true, phone: true, hours: true, lat: true, lng: true } },
      lines: { include: { variant: { include: { product: { select: { id: true, name: true, slug: true, strain: true, regClass: true } } } } } },
      sale: { select: { id: true, number: true, pointsEarned: true } },
    },
  });
  if (!order) notFound();
  const [customer, settings] = await Promise.all([getCustomer(), getSettings()]);
  const mine = customer?.id === order.customerId;
  const gift = isVoucherOrder(order.lines);
  // The member's own delivered order can be returned (or a problem reported) from here.
  const [returns, vouchers, voucher, photos] = await Promise.all([
    mine && order.status === "COMPLETED" && !gift ? db.returnRequest.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, createdAt: true } }) : [],
    redemptionsOf(order.id),
    gift ? voucherOfOrder(order.id) : null,
    mine ? mainImages(order.lines.map((l) => l.variant.product.id)) : new Map(),
  ]);
  const events = (order.events as Event[]) ?? [];
  const at = (s: OrderStatus) => events.filter((e) => e.status === s).at(-1)?.at;
  const collect = order.fulfilment === "COLLECT";
  const medicine = order.lines.some((l) => settings.compliance.licensedOnly.includes(l.variant.product.regClass));
  // Made-to-order merch is made for this order and ships on its own (the maker is never named to customers).
  const made = order.lines.filter((l) => l.variant.podSku);
  const merchOnly = made.length > 0 && made.length === order.lines.length;
  const idAtDoor = order.lines.some((l) => settings.compliance.ageRestricted.includes(l.variant.product.regClass));
  const steps: { key: OrderStatus; label: string; sub: string }[] = gift
    ? [
        ...(order.paymentStatus !== "PAID" && order.status !== "CANCELLED" ? [{ key: "PENDING_PAYMENT" as const, label: "Awaiting payment", sub: "The voucher is issued the moment it's paid" }] : []),
        { key: "COMPLETED", label: "Voucher issued", sub: voucher?.recipientEmail ? `Emailed to you and to ${voucher.recipientEmail}` : "Emailed to you, with the code below" },
      ]
    : [
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
  const voucherCents = vouchers.reduce((s, v) => s + v.cents, 0);
  const due = order.totalCents - order.pointsRedeemed * 100 - voucherCents;
  const saved = order.lines.reduce((s, l) => s + l.memberSavingsCents, 0);
  const [statusLabel, tone] = STATUS[order.status];
  const holdUntil = new Date(order.createdAt.getTime() + settings.ecommerce.unpaidHoldMinutes * 60_000);
  const readyAt = at("READY");
  const store = openState(parseHours(order.store.hours));
  // Expected arrival, as estimated when the order was placed (working days by province from the settings).
  const eta = !collect && !gift ? deliveryEstimate({ fulfilment: order.fulfilment, province: (order.province as ProvinceCode | null) ?? null, days: settings.ecommerce.deliveryDays, cutoffHour: settings.ecommerce.sameDayCutoffHour, now: order.createdAt }) : null;
  // Back from the gateway: Yoco ?pay=success|cancelled|failed, Peach ?pay=peach&status=<its payment status>. Only the
  // gateway (its webhook) marks an order paid: until then, wait for it.
  const g = hostedGateway();
  const partner = g ? HOSTED_GATEWAYS[g] : "";
  const pay = !g ? undefined : sp.pay === "peach" ? peachReturn(sp.status) : sp.pay;
  const pending = mine && order.status === "PENDING_PAYMENT";
  const waiting = pending && pay === "success";
  const payCancelled = pending && (pay === "cancelled" || pay === "failed");
  const EVENT_LABEL: Record<string, string> = { PENDING_PAYMENT: "Awaiting payment", PLACED: gift ? "Paid" : "Placed", PICKING: merchOnly ? "Being made" : "Being packed", READY: collect ? "Ready for collection" : "Packed", OUT_FOR_DELIVERY: "Out for delivery", COMPLETED: gift ? "Voucher issued" : collect ? "Collected" : "Delivered", CANCELLED: "Cancelled" };

  return (
    <Container className="pt-10 sm:pt-14">
      <LiveRefresh active={open} />
      {mine && sp.placed && order.status !== "CANCELLED" && (
        <Callout tone="success" icon={<CheckCircle2 className="h-5 w-5" />} title={`Thank you${customer ? `, ${customer.firstName}` : ""} — your order is in.`} className="mb-8">
          We&apos;ve sent a confirmation by SMS{collect ? ` and ${order.store.name} is getting it ready` : ""}. {order.payMethod !== "ONLINE" ? `Pay ${zar(due)} when you collect.` : ""}
        </Callout>
      )}
      {mine && (sp.paid || pay) && order.paymentStatus === "PAID" && order.status !== "CANCELLED" && (
        <Callout tone="success" icon={<CreditCard className="h-5 w-5" />} title="Payment received — thank you." className="mb-8">
          {gift ? "Your gift voucher is ready — the code is below, and it's on its way by email." : `Your tax invoice will be emailed${collect ? " when you collect" : " when your order is dispatched"}.`}
        </Callout>
      )}
      {waiting && (
        <Callout tone="info" icon={<Loader2 className="h-5 w-5 animate-spin" />} title="Waiting for payment confirmation…" className="mb-8">
          {partner} is confirming your payment. This page updates by itself.
          <AwaitPayment gateway={partner} />
        </Callout>
      )}
      {mine && pay === "success" && order.status === "CANCELLED" && order.paymentStatus !== "REFUNDED" && (
        <Callout tone="warn" icon={<CreditCard className="h-5 w-5" />} title="This order was cancelled before your payment reached us" className="mb-8">
          We&apos;ll refund you in full; there&apos;s nothing you need to do. Questions? Quote order {order.code}.
        </Callout>
      )}
      {payCancelled && (
        <Callout tone="warn" icon={<XCircle className="h-5 w-5" />} title="Payment cancelled" className="mb-8">
          {pay === "failed" ? "The payment didn't go through, so nothing was charged." : `You left ${possessive(partner)} page before paying, so nothing was charged.`} We&apos;re holding your order until {fmtTime(holdUntil)}.
          <div className="mt-3">
            <ButtonLink href={`/checkout/pay/${order.id}`} size="md">
              Try again · {zar(due)}
            </ButtonLink>
          </div>
        </Callout>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow text-brand-500">Order {order.code}</div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {gift
              ? order.status === "COMPLETED" ? "Your gift voucher is ready" : order.status === "CANCELLED" ? "Order cancelled" : "Gift voucher"
              : order.status === "CANCELLED" ? "Order cancelled" : order.status === "COMPLETED" ? (collect ? "Collected — thank you" : "Delivered — thank you") : collect ? `Collect at ${order.store.name}` : "On its way to you"}
          </h1>
          <p className="mt-2 text-ink-400">
            Placed {fmtDateTime(order.createdAt)} · {gift ? "Gift voucher" : collect ? "Click & collect" : order.fulfilment === "SAME_DAY" ? "Same-day delivery" : "Courier delivery"}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Tag tone={tone} className="px-3 py-1 text-xs">
            {statusLabel}
          </Tag>
          {open && <span className="text-[0.7rem] text-ink-450">Updates by itself while it&apos;s open</span>}
        </div>
      </div>

      {order.status === "PENDING_PAYMENT" && !waiting && !payCancelled && (
        <Callout tone="warn" icon={<Clock className="h-5 w-5" />} title={`Complete payment by ${fmtTime(holdUntil)}`} className="mt-8">
          {gift ? "Unpaid voucher orders lapse after " : "Unpaid orders are released after "}
          {settings.ecommerce.unpaidHoldMinutes} minutes{gift ? "." : " and the stock goes back on the shelf."}
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
          {/* Gift voucher */}
          {gift && voucher && (
            <Panel className="hh-beads-foot relative overflow-hidden p-6 pb-8">
              <div className="eyebrow flex items-center gap-2 text-brand-500">
                <Gift className="h-4 w-4" /> Gift voucher · {zar(voucher.amountCents)}
              </div>
              {mine && voucher.status !== "PENDING" && voucher.status !== "CANCELLED" ? (
                <>
                  <div className="tnum mt-3 font-display text-3xl font-semibold tracking-[0.08em] text-white sm:text-4xl">{voucher.code}</div>
                  <p className="mt-2 text-sm text-ink-300">
                    {zar(voucher.balanceCents)} left · valid until {fmtDate(voucher.expiresAt)}
                    {voucher.status === "REDEEMED" ? " · used up" : voucher.status === "EXPIRED" ? " · expired" : ""}
                  </p>
                  <p className="mt-3 text-sm text-ink-400">
                    {voucher.recipientEmail ? `Emailed to ${voucher.recipientName ? `${voucher.recipientName} at ` : ""}${voucher.recipientEmail}${customer?.email ? ` and to you at ${customer.email}` : ""}.` : customer?.email ? `Emailed to you at ${customer.email}.` : "Add an email address in Settings to have it emailed; the code above is all that's needed."}{" "}
                    Redeem it at checkout under Gift voucher, or show it at the counter.
                  </p>
                  {voucher.message && <blockquote className="mt-4 rounded-xl bg-ink-850 px-4 py-3 text-sm italic text-ink-200">“{voucher.message}”</blockquote>}
                  <Link href="/club/vouchers" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-400 hover:underline">
                    All your vouchers →
                  </Link>
                </>
              ) : (
                <p className="mt-3 text-sm text-ink-300">{voucher.status === "CANCELLED" ? "This voucher purchase was cancelled." : mine ? "The code appears here, and goes out by email, as soon as the order is paid." : "Sign in to see the voucher."}</p>
              )}
            </Panel>
          )}

          {/* Collection pass */}
          {collect && !gift && open && order.status !== "PENDING_PAYMENT" && (
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
                  <div className="tnum mt-1 font-display text-5xl font-semibold tracking-[0.15em] text-white sm:text-6xl">{mine ? order.collectionCode : "••••••"}</div>
                  <p className="mt-3 flex items-start gap-2 text-sm text-ink-300">
                    <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> Show this code and your ID (18+) at the counter — your ID will be checked. Only you can collect this order.
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
                Cancelled {at("CANCELLED") ? fmtDateTime(at("CANCELLED")!) : ""}. {order.paymentStatus === "REFUNDED" ? "Your payment has been refunded." : ""} {order.pointsRedeemed ? `${fmtPoints(order.pointsRedeemed)} have been returned to your balance.` : ""}{" "}
                {voucherCents ? "The gift voucher's balance has been restored." : ""}
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
                        <div className={cn("font-semibold", done || now ? "text-white" : "text-ink-450")}>{s.label}</div>
                        <div className="text-sm text-ink-400">
                          {when && (done || now) ? <time dateTime={when}>{fmtDateTime(when)}</time> : null}
                          {when && (done || now) ? " · " : ""}
                          {s.sub}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {events.length > 1 && (
              <details className="mt-5 border-t border-ink-800 pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink-300 hover:text-white">Every update ({events.length})</summary>
                <ol className="mt-3 space-y-1.5 text-sm">
                  {events.map((e, i) => (
                    <li key={`${e.at}-${i}`} className="flex flex-wrap gap-x-3 text-ink-400">
                      <time dateTime={e.at} className="tnum shrink-0 text-ink-450">
                        {fmtDateTime(e.at)}
                      </time>
                      <span className="font-medium text-ink-100">{EVENT_LABEL[e.status] ?? e.status}</span>
                      {e.note && <span>{e.note}</span>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </Panel>

          {/* Items */}
          {mine && !gift && (
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
                <h2 className="font-display text-lg font-semibold text-white">Items</h2>
                <ReorderButton orderId={order.id} size="sm" />
              </div>
              <ul className="divide-y divide-ink-800 px-6">
                {order.lines.map((l) => {
                  const photo = photos.get(l.variant.product.id);
                  return (
                    <li key={l.id} className="flex items-center gap-4 py-4">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={productImageUrl(photo.id)} alt="" width={56} height={56} loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <ProductArt slug={l.variant.product.slug} strain={l.variant.product.strain} regClass={l.variant.product.regClass} label={l.variant.product.name} className="h-14 w-14 shrink-0 rounded-xl" />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link href={`/p/${l.variant.product.slug}?v=${l.variantId}`} className="block truncate font-medium text-white hover:text-brand-300">
                          {l.variant.product.name}
                        </Link>
                        <div className="text-sm text-ink-400">
                          {l.variant.name} · qty {l.qty}
                        </div>
                      </div>
                      <div className="tnum text-right text-sm text-ink-100">{zar(l.totalCents)}</div>
                    </li>
                  );
                })}
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
                {vouchers.map((v) => (
                  <div key={v.code} className="flex justify-between gap-3 text-leaf-100">
                    <dt className="truncate">Gift voucher {v.code}</dt>
                    <dd className="tnum shrink-0">−{zar(v.cents)}</dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between border-t border-ink-800 pt-3">
                  <dt className="font-semibold text-white">{order.paymentStatus === "PAID" ? "Paid" : collect && order.payMethod !== "ONLINE" ? "To pay in store" : "Total"}</dt>
                  <dd className="tnum font-display text-2xl font-semibold text-white">{zar(due)}</dd>
                </div>
                <div className="space-y-2">
                  {order.vatCents > 0 && <p className="text-right text-xs text-ink-450">Includes VAT of {zar(order.vatCents)}</p>}
                  {saved > 0 && <p className="rounded-xl bg-brand-500/10 px-3 py-2 text-sm font-semibold text-brand-100">You saved {zar(saved)} with Herbal Holland Rewards</p>}
                </div>
              </dl>
            </Panel>
          )}
        </div>

        <aside className="space-y-4">
          {gift ? null : collect ? (
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
              {eta && open && (
                <p className="mt-3 flex items-center gap-2 text-sm text-ink-200">
                  <Clock className="h-4 w-4 shrink-0 text-brand-500" /> Expected <strong className="text-white">{eta.label}</strong>
                </p>
              )}
              <p className="mt-3 text-sm text-ink-400">{merchOnly ? "Made to order in South Africa and couriered to you." : `Ships from ${order.store.name}.`}</p>
              {order.trackingNo ? (
                <dl className="mt-3 rounded-xl bg-ink-850 px-3 py-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-400">Courier</dt>
                    <dd className="font-medium text-ink-100">{order.courier}</dd>
                  </div>
                  <div className="mt-1 flex justify-between gap-3">
                    <dt className="text-ink-400">Tracking number</dt>
                    <dd className="tnum select-all font-semibold text-white">{order.trackingNo}</dd>
                  </div>
                </dl>
              ) : (
                open && <p className="mt-2 text-xs text-ink-450">The courier and tracking number appear here once it&apos;s on its way.</p>
              )}
              {made.length > 0 && !merchOnly && (
                <p className="mt-2 text-sm text-ink-300">
                  Your merch is made to order and ships separately
                  {order.podTracking ? (
                    <>
                      {" "}
                      · tracking <span className="tnum font-semibold text-white">{order.podTracking}</span>
                    </>
                  ) : (
                    " — we'll SMS its tracking number"
                  )}
                  .
                </p>
              )}
              {idAtDoor && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-ink-850 px-3 py-2.5 text-sm text-ink-200">
                  <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> Your ID (18+) will be checked on delivery. We can&apos;t leave the parcel without it.
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

          {mine && order.status === "COMPLETED" && !gift && (
            <Panel className="p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                <Undo2 className="h-5 w-5 text-brand-500" /> Returns
              </h2>
              {returns.length ? (
                <ul className="mt-2 space-y-1.5 text-sm">
                  {returns.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-white">{r.number}</span>
                      <span className="text-ink-300">{RETURN_STATUS[r.status].member}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-400">
                  Faulty, damaged or not what you ordered? You have {RETURN_WINDOWS.defectMonths} months. Changed your mind? {RETURN_WINDOWS.coolingOffDays} days from delivery.
                </p>
              )}
              <ButtonLink href={`/club/orders/${order.code}/return`} variant="outline-dark" size="md" className="mt-4">
                Return or report a problem
              </ButtonLink>
            </Panel>
          )}

          <Panel className="p-5 text-sm text-ink-400">
            <p>
              <Package className="mr-1.5 inline h-4 w-4 align-[-3px] text-ink-450" />
              Questions about this order? Quote <strong className="text-ink-100">{order.code}</strong>{" "}
              {order.store.phone && !gift ? (
                <>
                  and call {order.store.name} on{" "}
                  <a href={`tel:${order.store.phone.replace(/\s/g, "")}`} className="text-brand-400 underline">
                    {order.store.phone}
                  </a>
                  .
                </>
              ) : (
                <>
                  in{" "}
                  <Link href="/club/support" className="text-brand-400 underline">
                    Help
                  </Link>
                  .
                </>
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
            {mine && (
              <p className="mt-3">
                Order history lives in{" "}
                <Link href="/club/orders" className="font-semibold text-brand-400 hover:underline">
                  your Rewards account
                </Link>
                . Placed {fmtDate(order.createdAt)}.
              </p>
            )}
          </Panel>
        </aside>
      </div>
    </Container>
  );
}
