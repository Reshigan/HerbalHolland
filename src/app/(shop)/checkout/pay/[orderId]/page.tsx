import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Clock, Lock, ShieldCheck } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getFranchisor } from "@/server/shop/context";
import { hostedGateway, HOSTED_GATEWAYS } from "@/server/payments";
import { payOnline, simulatePayment } from "./actions";
import { HostedPayForm, PayForm } from "@/components/shop/pay-form";
import { Container, Panel } from "@/components/shop/ui";
import { Mark } from "@/components/brand/logo";
import { fmtTime } from "@/lib/format";
import { zar } from "@/lib/money";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };

export default async function PayPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const customer = await getCustomer();
  if (!customer) redirect(`/club/join?next=${encodeURIComponent(`/checkout/pay/${orderId}`)}`);
  const gateway = hostedGateway();
  const name = gateway && HOSTED_GATEWAYS[gateway];
  const [order, settings, company] = await Promise.all([
    db.order.findFirst({ where: { id: orderId, customerId: customer.id }, include: { store: { select: { name: true, company: { select: { legalName: true } } } }, lines: { include: { variant: { include: { product: { select: { name: true } } } } } } } }),
    getSettings(),
    gateway ? getFranchisor() : null,
  ]);
  if (!order) notFound();
  if (order.status !== "PENDING_PAYMENT") redirect(`/orders/${order.code}`);
  const due = order.totalCents - order.pointsRedeemed * 100;
  const holdUntil = new Date(order.createdAt.getTime() + settings.ecommerce.unpaidHoldMinutes * 60_000);
  // Peach or Yoco: online payments go to the company that owns the online shop. Simulated: the fulfilling store, as before.
  const merchant = gateway ? (company?.legalName ?? "Herbal Holland") : order.store.company.legalName;

  return (
    <Container className="max-w-xl pt-10 sm:pt-16">
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900 px-6 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <Lock className="h-4 w-4 text-leaf-500" /> Secure payment
          </span>
          <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider text-sky-50">{name ?? "Simulated gateway"}</span>
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Mark className="h-10 w-10 text-brand-500" />
            <div>
              <div className="text-sm text-ink-400">Paying {merchant}</div>
              <div className="font-semibold text-white">Herbal Holland order {order.code}</div>
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-ink-950 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Amount due</div>
            <div className="tnum mt-1 font-display text-4xl font-semibold text-white">{zar(due)}</div>
            <ul className="mt-3 space-y-1 text-sm text-ink-400">
              {order.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {l.qty}× {l.variant.product.name} · {l.variant.name}
                  </span>
                  <span className="tnum shrink-0">{zar(l.totalCents)}</span>
                </li>
              ))}
              {order.deliveryCents > 0 && (
                <li className="flex justify-between">
                  <span>Delivery</span>
                  <span className="tnum">{zar(order.deliveryCents)}</span>
                </li>
              )}
              {order.pointsRedeemed > 0 && (
                <li className="flex justify-between text-leaf-100">
                  <span>Points</span>
                  <span className="tnum">−{zar(order.pointsRedeemed * 100)}</span>
                </li>
              )}
            </ul>
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm text-amber-100">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            Complete payment by {fmtTime(holdUntil)} ({settings.ecommerce.unpaidHoldMinutes} minutes) or the order is released and the stock goes back on the shelf.
          </p>
          {name ? <HostedPayForm action={payOnline.bind(null, order.id)} amount={zar(due)} gateway={name} /> : <PayForm action={simulatePayment.bind(null, order.id)} amount={zar(due)} />}
          <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
            {gateway === "PEACH"
              ? "You pay on Peach Payments' secure page. We never see your card details. Your order is confirmed the moment Peach Payments tells us the payment went through."
              : gateway === "YOCO"
                ? "You pay on Yoco's secure page, by card or Instant EFT. We never see your card details. Your order is confirmed the moment Yoco tells us the payment went through."
                : "Demo environment: no money moves. In production this page is your bank or payment partner, and the store that fulfils your order is the merchant of record."}
          </p>
        </div>
      </Panel>
    </Container>
  );
}
