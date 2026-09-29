// Online orders: checkout → routing → pick/pack → handover or dispatch.
// Stock is reserved while an order is open and posted as a Sale (at the fulfilling
// store, which is merchant of record) on handover/dispatch.
import { randomUUID } from "node:crypto";
import { madeToOrder } from "./merch";
import { db, tx } from "./db";
import { quote } from "./pricing";
import { availability, availKey } from "./inventory";
import { evaluateBasket } from "./compliance";
import { getSettings } from "./settings";
import { redeemPoints, addPoints } from "./loyalty";
import { postSaleTx, type TenderInput } from "./sales";
import { notifyCustomer } from "./messaging";
import { audit, type Actor } from "./audit";
import { shortCode, pinCode } from "./counters";
import { queueSaleInvoice } from "./invoices";
import { redeemOffers, releaseOffers } from "./offers";
import { dropBlocks } from "./drops";
import {
  createPeachPayment, createYocoCheckout, paidOnlineWith, PaymentError, peachMode, peachPayment, refundPeachPayment, refundYocoCheckout, yocoTestMode, type HostedGateway,
} from "./payments";
import { routeOrder, type Fulfil, type RouteCandidate } from "@/lib/routing";
import { incentiveExcluded } from "@/lib/compliance";
import { decidePayment, type PaymentDecision, type PaymentEventKind, type PaymentFacts } from "@/lib/online-payments";
import { yocoCheckoutRequest, yocoEventKind, yocoFacts, YOCO_MIN_CENTS, type YocoEvent } from "@/lib/yoco";
import { peachEventKind, peachFacts, peachNextStep, peachPaymentFacts, peachPaymentId, peachPaymentRequest, PEACH_MIN_SESSION_SECONDS, type PeachEvent } from "@/lib/peach";
import { addDays } from "@/lib/format";
import { vatOf, zar } from "@/lib/money";
import type { OrderStatus, Prisma, Province } from "@/generated/prisma/client";

export class OrderError extends Error {
  constructor(message: string, public alternatives: { id: string; name: string }[] = []) {
    super(message);
  }
}

/**
 * Delivery for a bag: the usual rules for stocked items (free over the threshold), plus the merch partner's courier
 * for made-to-order merch — always charged on top, since merch ships on its own from the partner.
 */
export async function deliveryFee(fulfilment: Fulfil, lines: { variantId: string; totalCents: number }[], tier: string) {
  const s = (await getSettings()).ecommerce;
  const made = await madeToOrder(lines.map((l) => l.variantId));
  const stocked = lines.filter((l) => !made.has(l.variantId));
  const subtotal = stocked.reduce((a, l) => a + l.totalCents, 0);
  const merch = made.size ? s.merchCourierCents : 0;
  if (!stocked.length || fulfilment === "COLLECT" || subtotal >= s.freeDeliveryOverCents) return merch;
  if (fulfilment === "SAME_DAY") return merch + (tier === "BLOOM" || tier === "HARVEST" ? 0 : s.sameDayFeeCents);
  return merch + s.courierFeeCents;
}

export async function routingCandidates(variantIds: string[]): Promise<RouteCandidate[]> {
  const stores = await db.store.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, kind: true, city: true, province: true, lat: true, lng: true, sameDay: true, clickCollect: true, licences: true },
  });
  const avail = await availability(stores.map((s) => s.id), variantIds);
  return stores.map((s) => ({
    ...s,
    active: true,
    available: Object.fromEntries(variantIds.map((v) => [v, avail.get(availKey(s.id, v))?.available ?? 0])),
  }));
}

export type CheckoutInput = {
  customerId: string;
  fulfilment: Fulfil;
  storeId?: string | null;
  address?: { addressLine: string; suburb: string; city: string; province: Province; postalCode: string; notes?: string };
  items: { variantId: string; qty: number }[];
  code?: string | null;
  points?: number;
  payMethod: "ONLINE" | "IN_STORE";
  campaignId?: string | null;
};

type Event = { status: OrderStatus; at: string; note?: string };

export async function placeOrder(input: CheckoutInput) {
  const settings = await getSettings();
  const q = await quote({ channel: "ONLINE", items: input.items, code: input.code, customerId: input.customerId });
  if (!q.lines.length) throw new OrderError("Your bag is empty");
  if (q.codeError) throw new OrderError(q.codeError);
  const dropped = await dropBlocks(input.customerId, q.lines);
  if (dropped.length) throw new OrderError(dropped[0]);
  if (input.payMethod === "IN_STORE" && input.fulfilment !== "COLLECT") throw new OrderError("Pay in store is only available for click & collect");
  if (input.fulfilment !== "COLLECT" && !input.address) throw new OrderError("Add a delivery address");

  const comp = await evaluateBasket({
    items: q.lines.map((l) => ({ name: l.name, regClass: l.regClass, grams: l.grams, qty: l.qty, tobaccoRelated: l.tobaccoRelated })),
    channel: input.fulfilment,
    customerId: input.customerId,
    // Licences are enforced by routing: only licensed stores can be chosen.
    storeLicences: settings.compliance.licensedOnly,
  });
  if (!comp.ok) throw new OrderError(comp.blocks[0]);
  const customer = comp.ctx.record!;

  const requiredLicences = [...new Set(q.lines.filter((l) => settings.compliance.licensedOnly.includes(l.regClass)).map((l) => l.regClass))];
  // No online payment provider accepts licensed cannabis (Peach and Yoco both prohibit it): those orders are paid at the counter.
  if (requiredLicences.length && input.payMethod === "ONLINE") throw new OrderError("Licensed medicines are paid for in store, when you collect");
  // Made-to-order merch ships from the merch partner: courier only, and it needs no stock to route.
  const made = await madeToOrder(q.lines.map((l) => l.variantId));
  if (made.size && input.fulfilment !== "COURIER") throw new OrderError("Made-to-order merch ships by courier — choose delivery");
  const stocked = q.lines.filter((l) => !made.has(l.variantId));
  const route = routeOrder(
    {
      fulfilment: input.fulfilment,
      storeId: input.storeId,
      city: input.address?.city ?? null,
      province: input.address?.province ?? null,
      lines: stocked.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      requiredLicences,
    },
    await routingCandidates(stocked.map((l) => l.variantId)),
  );
  if (!route.ok) throw new OrderError(route.reason, route.alternatives);

  const fee = await deliveryFee(input.fulfilment, q.lines, customer.tier);
  const total = q.totalCents + fee;
  const maxPoints = Math.floor((total * settings.loyalty.maxRedeemPct) / 100 / 100);
  const points = Math.max(0, Math.min(Math.floor(input.points ?? 0), customer.points, maxPoints));
  const status: OrderStatus = input.payMethod === "ONLINE" && total - points * 100 > 0 ? "PENDING_PAYMENT" : "PLACED";
  const events: Event[] = [{ status, at: new Date().toISOString(), note: route.reason }];

  const order = await tx(async (t) => {
    const o = await t.order.create({
      data: {
        code: shortCode(6),
        collectionCode: pinCode(),
        customerId: customer.id,
        storeId: route.storeId,
        status,
        fulfilment: input.fulfilment,
        routingNote: route.reason,
        ...(input.address && {
          addressLine: input.address.addressLine, suburb: input.address.suburb, city: input.address.city,
          province: input.address.province, postalCode: input.address.postalCode, deliveryNotes: input.address.notes,
        }),
        subtotalCents: q.subtotalCents,
        discountCents: q.discountCents,
        deliveryCents: fee,
        pointsRedeemed: points,
        totalCents: total,
        vatCents: q.vatCents + vatOf(fee),
        payMethod: input.payMethod === "ONLINE" ? "ONLINE" : "CARD",
        paymentStatus: status === "PLACED" && input.payMethod === "ONLINE" ? "PAID" : "UNPAID",
        promoCode: input.code?.toUpperCase() || null,
        promotionId: q.promotionId,
        campaignId: input.campaignId,
        events,
        lines: {
          create: q.lines.map((l) => ({
            variantId: l.variantId, qty: l.qty, unitPriceCents: l.unitPriceCents, memberSavingsCents: l.memberSavingsCents, offerCents: l.offerCents, totalCents: l.totalCents,
          })),
        },
      },
      include: { store: true },
    });
    if (points) await redeemPoints(t, { customerId: customer.id, points, orderId: o.id, storeId: route.storeId });
    await redeemOffers(t, q.offerIds, { orderId: o.id });
    await audit(t, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "order.place", {
      storeId: route.storeId, entity: "Order", entityId: o.id, data: { total, fulfilment: input.fulfilment },
    });
    return o;
  });
  if (order.status === "PLACED") await notifyPlaced(order.id);
  return order;
}

async function notifyPlaced(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true, store: true } });
  const how = o.fulfilment === "COLLECT" ? `for collection at ${o.store.name}` : "for delivery";
  await notifyCustomer(o.customer, `Herbal Holland: order ${o.code} received ${how}. We'll let you know when it's ready. Track: /orders/${o.code}`);
}

/** Confirms an online payment (the simulated gateway, or a gateway's verified webhook): the order goes to the store. Safe to repeat. */
export async function markOrderPaid(orderId: string, reference: string, note = "Payment received") {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (o.status !== "PENDING_PAYMENT") return o;
  const events = [...(o.events as Event[]), { status: "PLACED" as const, at: new Date().toISOString(), note }];
  // Compare-and-set: when the same confirmation arrives twice at once, only one moves the order (and texts the member).
  const { count } = await db.order.updateMany({ where: { id: orderId, status: "PENDING_PAYMENT" }, data: { status: "PLACED", paymentStatus: "PAID", paymentRef: reference, events } });
  if (count) await notifyPlaced(orderId);
  return db.order.findUniqueOrThrow({ where: { id: orderId } });
}

// ── Online payments: Peach Payments (ONLINE_GATEWAY=PEACH) and Yoco (YOCO) ───

const GATEWAYS: Record<HostedGateway, { name: string; actor: Actor; refundIn: string }> = {
  PEACH: { name: "Peach Payments", actor: { type: "SYSTEM", name: "Peach Payments" }, refundIn: "the Peach Dashboard" },
  YOCO: { name: "Yoco", actor: { type: "SYSTEM", name: "Yoco" }, refundIn: "the Yoco portal" },
};
type PayingOrder = { id: string; code: string; createdAt: Date; totalCents: number; pointsRedeemed: number; paymentRef: string | null };
/** Where the pay page sends the member: the gateway's page ("open"), or back to the order (already paid, still processing, or to be checked). */
export type OnlineCheckout = { step: "open"; url: string; checkoutId: string; created: boolean; dueCents: number; mode: string | null } | { step: "paid" | "wait" | "review" };

/** The member's payment page for an unpaid order, on the configured hosted gateway. */
export async function onlineCheckoutFor(gateway: HostedGateway, o: PayingOrder, appUrl: string): Promise<OnlineCheckout> {
  if (gateway === "PEACH") return peachCheckoutFor(o, appUrl);
  const { checkout, created, dueCents } = await yocoCheckoutFor(o, appUrl);
  return { step: "open", url: checkout.redirectUrl, checkoutId: checkout.id, created, dueCents, mode: checkout.processingMode ?? null };
}

/**
 * The member's Yoco checkout for an unpaid order. The order id is the Idempotency-Key, so asking again (a retry, or after
 * cancelling on Yoco's page) replays the same checkout instead of opening a second one. Its id becomes the order's
 * paymentRef: the webhook must name it, and a refund goes back to it.
 */
export async function yocoCheckoutFor(o: { id: string; code: string; totalCents: number; pointsRedeemed: number; paymentRef: string | null }, appUrl: string) {
  const dueCents = o.totalCents - o.pointsRedeemed * 100;
  if (dueCents < YOCO_MIN_CENTS) throw new PaymentError(`Online payments start at ${zar(YOCO_MIN_CENTS)}`);
  const checkout = await createYocoCheckout(yocoCheckoutRequest({ id: o.id, code: o.code, dueCents }, appUrl), o.id);
  if (!checkout.id || !/^https:\/\//.test(checkout.redirectUrl ?? "")) throw new PaymentError("Yoco didn't return a payment page");
  const created = checkout.id !== o.paymentRef;
  if (created) await db.order.updateMany({ where: { id: o.id, status: "PENDING_PAYMENT" }, data: { paymentRef: checkout.id } });
  return { checkout, created, dueCents };
}

/**
 * The member's Peach payment page for an unpaid order. The order's current payment (paymentRef) is asked about first:
 * paid → applied now, exactly as its webhook would be; still processing → no second payment; nothing tried yet and still
 * open → the same page again. Otherwise a new payment, with our own payment_id (a double click opens one payment, not
 * two) and Peach's page open until the order's payment window closes. Its id becomes the order's paymentRef: the
 * webhook must name it, and a refund goes back to it.
 */
export async function peachCheckoutFor(o: PayingOrder, appUrl: string): Promise<OnlineCheckout> {
  const dueCents = o.totalCents - o.pointsRedeemed * 100;
  const mode = peachMode();
  const current = o.paymentRef?.startsWith("pay_") ? await peachPayment(o.paymentRef) : null;
  const step = peachNextStep(current, dueCents);
  if (step === "paid") {
    const d = await applyOnlineEvent("PEACH", { id: null, type: "payment_status", kind: "paid", facts: peachPaymentFacts(current!, mode) });
    return { step: d.action === "review" ? "review" : "paid" };
  }
  if (step === "wait") return { step };
  if (step === "reuse") return { step: "open", url: current!.payment_link!.link, checkoutId: current!.payment_id, created: false, dueCents, mode };

  const paymentId = peachPaymentId(o.id, o.paymentRef);
  if (!paymentId) throw new PaymentError(`Too many payment attempts on order ${o.code}`);
  const { ecommerce } = await getSettings();
  const left = Math.ceil((o.createdAt.getTime() + ecommerce.unpaidHoldMinutes * 60_000 - Date.now()) / 1000);
  const body = peachPaymentRequest({ id: o.id, code: o.code, dueCents }, appUrl, { paymentId, sessionExpiry: Math.max(left, PEACH_MIN_SESSION_SECONDS), profileId: process.env.PEACH_PROFILE_ID });
  let created = true;
  // Peach won't create the same payment_id twice: if it refuses, the payment already exists (another click, or a lost reply).
  const p = await createPeachPayment(body).catch(async (e: unknown) => {
    const existing = await peachPayment(paymentId).catch(() => null);
    if (!existing) throw e;
    created = false;
    return existing;
  });
  const url = p.payment_link?.link ?? "";
  if (!p.payment_id || !/^https:\/\//.test(url)) throw new PaymentError("Peach didn't return a payment page");
  await db.order.updateMany({ where: { id: o.id, status: "PENDING_PAYMENT" }, data: { paymentRef: p.payment_id } });
  return { step: "open", url, checkoutId: p.payment_id, created, dueCents, mode };
}

/**
 * Refunds a paid online order in full before it's cancelled; any error stops the cancel and staff see why. A retried
 * cancel can't refund twice: Yoco replays the Idempotency-Key "<order id>:refund"; Peach counts what's already refunded.
 */
async function refundOnline(gateway: HostedGateway, o: { id: string; code: string; paymentRef: string | null }, amountCents: number) {
  const { name } = GATEWAYS[gateway];
  if (gateway === "YOCO" && yocoTestMode()) return { refundId: null, status: "test", note: "Yoco test payment: nothing to refund" }; // Yoco can't refund test payments
  const meta = { orderId: o.id, orderCode: o.code };
  try {
    const r = gateway === "YOCO" ? await refundYocoCheckout(o.paymentRef!, amountCents, `${o.id}:refund`, meta) : await refundPeachPayment(o.paymentRef!, amountCents, `Order ${o.code} cancelled`, meta);
    return { ...r, note: `Refunded ${zar(amountCents)} by ${name} (refund ${r.refundId}, ${r.status})` };
  } catch (e) {
    throw new OrderError(`${name} didn't refund ${zar(amountCents)}, so the order hasn't been cancelled. ${(e as Error).message}`);
  }
}

/**
 * A verified gateway event (webhook, or a Peach status query). A payment that went through marks the order paid once the
 * checkout and the amount match it; a redelivery changes nothing. Money that doesn't fit the order is logged for a
 * person (payment.review in HQ → Audit log), never guessed at. A failed refund puts the payment back on the cancelled
 * order so staff refund it by hand. Other events about our orders are logged; the rest are ignored.
 */
async function applyOnlineEvent(
  gateway: HostedGateway,
  e: { id: string | null; type: string; kind: PaymentEventKind | undefined; facts: PaymentFacts },
): Promise<PaymentDecision | { action: "logged"; reason: string }> {
  const { name, actor, refundIn } = GATEWAYS[gateway];
  const f = e.facts;
  const order = f.orderId
    ? await db.order.findUnique({ where: { id: f.orderId } })
    : f.checkoutId // paymentRef has no index: bound the look-up to recent orders
      ? await db.order.findFirst({ where: { paymentRef: f.checkoutId, createdAt: { gte: addDays(new Date(), -120) } } })
      : null;
  const log = (action: string, extra: Record<string, string | null> = {}) =>
    audit(db, actor, action, { storeId: order?.storeId, entity: "Order", entityId: order?.id, data: { event: e.id, type: e.type, checkoutId: f.checkoutId, id: f.id, amount: f.amountCents, mode: f.mode, ...extra } });

  if (e.kind === "paid") {
    const d = decidePayment(f, order && { ...order, dueCents: order.totalCents - order.pointsRedeemed * 100 }, refundIn);
    if (d.action === "pay") {
      await markOrderPaid(order!.id, f.checkoutId!, `Paid with ${name}${f.method ? ` · ${f.method}` : ""} · payment ${f.id}`);
      await log("order.pay_online", { gateway, method: f.method });
    } else if (d.action === "review") await log("payment.review", { reason: d.reason });
    return d;
  }
  if (!order || (f.checkoutId && f.checkoutId !== order.paymentRef)) return { action: "ignore", reason: "Not one of our checkouts" };
  if (e.kind === "payment.refund_failed" && order.status === "CANCELLED" && order.paymentStatus === "REFUNDED") {
    const note = `${name} refund failed${f.failureReason ? ` (${f.failureReason})` : ""}: refund the member by hand`;
    await db.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", events: [...(order.events as Event[]), { status: order.status, at: new Date().toISOString(), note }] } });
  }
  if (!e.kind) return { action: "ignore", reason: `${e.type} isn't used` };
  await log(e.kind, { reason: f.failureReason });
  return { action: "logged", reason: e.kind };
}

/** A verified Yoco webhook event (/api/payments/yoco): payment.succeeded, payment.failed, refund.succeeded, refund.failed. */
export const applyYocoEvent = (e: YocoEvent) => applyOnlineEvent("YOCO", { id: e.id, type: e.type, kind: yocoEventKind(e.type), facts: yocoFacts(e) });

/** A verified Peach webhook event (/api/payments/peach): payment_succeeded, payment_failed, refund_succeeded, refund_failed. */
export const applyPeachEvent = (e: PeachEvent) => applyOnlineEvent("PEACH", { id: e.event_id, type: e.event_type, kind: peachEventKind(e.event_type), facts: peachFacts(e, peachMode()) });

const FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PLACED", "CANCELLED"],
  PLACED: ["PICKING", "CANCELLED"],
  PICKING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const nextStatuses = (o: { status: OrderStatus; fulfilment: Fulfil }) =>
  FLOW[o.status].filter((s) => !(s === "OUT_FOR_DELIVERY" && o.fulfilment === "COLLECT") && !(o.status === "READY" && s === "COMPLETED" && o.fulfilment !== "COLLECT"));

export async function advanceOrder(
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  opts: {
    payments?: TenderInput[];
    idChecked?: boolean;
    staffId?: string | null;
    staffCanDispense?: boolean;
    deviceId?: string | null;
    shiftId?: string | null;
    courier?: string;
    trackingNo?: string;
    note?: string;
  } = {},
) {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { lines: { include: { variant: { include: { product: true } } } }, store: true, customer: true },
  });
  if (!nextStatuses(o).includes(to)) throw new OrderError(`Can't move an order from ${o.status} to ${to}`);
  const settings = await getSettings();
  const licensed = o.lines.some((l) => settings.compliance.licensedOnly.includes(l.variant.product.regClass));
  const ageRestricted = o.lines.some((l) => settings.compliance.ageRestricted.includes(l.variant.product.regClass));
  const handover = to === "COMPLETED" && o.fulfilment === "COLLECT";
  const dispatch = to === "OUT_FOR_DELIVERY";
  const delivered = to === "COMPLETED" && o.fulfilment !== "COLLECT";

  if ((handover || delivered) && ageRestricted && !opts.idChecked) throw new OrderError("Check the member's ID (18+) before handing over");
  if (handover && licensed && settings.compliance.thcMode === "MEDICAL" && opts.staffCanDispense === false)
    throw new OrderError("An authorised dispenser must hand over this order");

  const due = o.totalCents - o.pointsRedeemed * 100;
  const gateway = paidOnlineWith(o);
  let payments: TenderInput[] | { method: "ONLINE"; amountCents: number; provider: string; reference?: string }[] = [];
  if (handover || dispatch) {
    if (o.paymentStatus === "PAID") payments = due > 0 ? [{ method: "ONLINE", amountCents: due, provider: gateway ?? "GATEWAY", reference: o.paymentRef ?? undefined }] : [];
    else {
      if (dispatch) throw new OrderError("Delivery orders must be paid before dispatch");
      const paid = (opts.payments ?? []).reduce((s, p) => s + p.amountCents, 0);
      if (paid !== due) throw new OrderError(`Take payment of ${zar(due)} before handover`);
      payments = opts.payments ?? [];
    }
  }

  // A paid Peach or Yoco order is refunded in full before it's cancelled. If the gateway refuses, nothing changes and staff see why.
  const refund = to === "CANCELLED" && gateway ? await refundOnline(gateway, o, due) : null;
  const events = [...(o.events as Event[]), { status: to, at: new Date().toISOString(), note: [opts.note, refund?.note].filter(Boolean).join(" · ") || undefined }];
  let postedSaleId: string | null = null;
  const updated = await tx(async (t) => {
    if (handover || dispatch) {
      const excluded = incentiveExcluded(settings.compliance);
      const lines = o.lines.map((l) => ({
        variantId: l.variantId, qty: l.qty, unitPriceCents: l.unitPriceCents,
        discountCents: l.qty * l.unitPriceCents - l.totalCents, totalCents: l.totalCents, vatCents: vatOf(l.totalCents),
        noEarn: excluded.includes(l.variant.product.regClass), memberSavingsCents: l.memberSavingsCents, offerCents: l.offerCents,
      }));
      postedSaleId = randomUUID();
      await postSaleTx(t, {
        id: postedSaleId,
        number: `${o.store.code}-W${o.code}`,
        storeId: o.storeId,
        channel: "ONLINE",
        orderId: o.id,
        shiftId: opts.shiftId,
        staffId: opts.staffId,
        deviceId: opts.deviceId,
        customerId: o.customerId,
        quote: {
          lines,
          subtotalCents: o.subtotalCents,
          discountCents: o.discountCents,
          totalCents: o.subtotalCents - o.discountCents,
          vatCents: lines.reduce((s, l) => s + l.vatCents, 0),
          pointsMultiplier: 1,
          promotionId: o.promotionId,
        },
        promoCode: o.promoCode,
        payments: payments as TenderInput[],
        pointsRedeemed: o.pointsRedeemed,
        redeemNow: false,
        extraCents: o.deliveryCents,
        ageCheck: opts.idChecked ? "ID_SIGHTED" : o.customer.ageVerifiedAt ? "VERIFIED" : "NONE",
        offline: false,
        createdAt: new Date(),
        campaignId: o.campaignId,
      });
    }
    if (to === "CANCELLED") {
      await releaseOffers(t, o.id);
      if (o.pointsRedeemed) await addPoints(t, { customerId: o.customerId, points: o.pointsRedeemed, kind: "REVERSAL", orderId: o.id, note: `Order ${o.code} cancelled` });
    }
    const data: Prisma.OrderUpdateInput = { status: to, events };
    if (handover || dispatch) data.paymentStatus = "PAID";
    if (to === "CANCELLED" && o.paymentStatus === "PAID") data.paymentStatus = "REFUNDED";
    if (to === "COMPLETED") (data.completedAt = new Date()), (data.idChecked = !!opts.idChecked);
    if (dispatch) (data.courier = opts.courier ?? (o.fulfilment === "SAME_DAY" ? "Herbal Holland driver" : "Courier")), (data.trackingNo = opts.trackingNo ?? `HH${shortCode(8)}`);
    await audit(t, actor, `order.${to.toLowerCase()}`, { storeId: o.storeId, entity: "Order", entityId: o.id, data: refund ? { refundId: refund.refundId, refundStatus: refund.status, amount: due } : undefined });
    return t.order.update({ where: { id: o.id }, data });
  });

  const msg: Partial<Record<OrderStatus, string>> = {
    READY: `Herbal Holland: order ${o.code} is ready at ${o.store.name}. Show code ${o.collectionCode} and your ID (18+) to collect.`,
    OUT_FOR_DELIVERY: `Herbal Holland: order ${o.code} is on its way${opts.trackingNo ? ` (${opts.courier ?? "courier"} tracking ${opts.trackingNo})` : ""}.${ageRestricted ? " Have your ID (18+) ready for the driver." : ""}`,
    COMPLETED: `Herbal Holland: order ${o.code} complete. Thanks — your points have been added.`,
    CANCELLED: `Herbal Holland: order ${o.code} was cancelled. Any payment or points used have been returned.`,
  };
  // Delivery orders are "ready" only on the packing bench: the customer hears when they're on the way.
  if (msg[to] && !(to === "READY" && o.fulfilment !== "COLLECT")) await notifyCustomer(o.customer, msg[to]!);
  if (postedSaleId && o.customer.email) queueSaleInvoice(postedSaleId, o.customer.email);
  return updated;
}
