// Online orders: checkout → routing → pick/pack → handover or dispatch.
// Stock is reserved while an order is open and posted as a Sale (at the fulfilling
// store, which is merchant of record) on handover/dispatch.
import { randomUUID } from "node:crypto";
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
import { routeOrder, type Fulfil, type RouteCandidate } from "@/lib/routing";
import { incentiveExcluded } from "@/lib/compliance";
import { vatOf, zar } from "@/lib/money";
import type { OrderStatus, Prisma, Province } from "@/generated/prisma/client";

export class OrderError extends Error {
  constructor(message: string, public alternatives: { id: string; name: string }[] = []) {
    super(message);
  }
}

export async function deliveryFee(fulfilment: Fulfil, subtotalCents: number, tier: string) {
  const s = (await getSettings()).ecommerce;
  if (fulfilment === "COLLECT" || subtotalCents >= s.freeDeliveryOverCents) return 0;
  if (fulfilment === "SAME_DAY") return tier === "BLOOM" || tier === "HARVEST" ? 0 : s.sameDayFeeCents;
  return s.courierFeeCents;
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
  const route = routeOrder(
    {
      fulfilment: input.fulfilment,
      storeId: input.storeId,
      city: input.address?.city ?? null,
      province: input.address?.province ?? null,
      lines: q.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      requiredLicences,
    },
    await routingCandidates(q.lines.map((l) => l.variantId)),
  );
  if (!route.ok) throw new OrderError(route.reason, route.alternatives);

  const fee = await deliveryFee(input.fulfilment, q.totalCents, customer.tier);
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
        lines: { create: q.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPriceCents: l.unitPriceCents, memberSavingsCents: l.memberSavingsCents, totalCents: l.totalCents })) },
      },
      include: { store: true },
    });
    if (points) await redeemPoints(t, { customerId: customer.id, points, orderId: o.id, storeId: route.storeId });
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

/** Simulated gateway confirmation (real gateways call this from their webhook). */
export async function markOrderPaid(orderId: string, reference: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (o.status !== "PENDING_PAYMENT") return o;
  const events = [...(o.events as Event[]), { status: "PLACED" as const, at: new Date().toISOString(), note: "Payment received" }];
  const updated = await db.order.update({ where: { id: orderId }, data: { status: "PLACED", paymentStatus: "PAID", paymentRef: reference, events } });
  await notifyPlaced(orderId);
  return updated;
}

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

  if ((handover || delivered) && ageRestricted && !opts.idChecked) throw new OrderError("Check the customer's ID (18+) before handing over");
  if (handover && licensed && settings.compliance.thcMode === "MEDICAL" && opts.staffCanDispense === false)
    throw new OrderError("An authorised dispenser must hand over this order");

  const due = o.totalCents - o.pointsRedeemed * 100;
  let payments: TenderInput[] | { method: "ONLINE"; amountCents: number; provider: string; reference?: string }[] = [];
  if (handover || dispatch) {
    if (o.paymentStatus === "PAID") payments = due > 0 ? [{ method: "ONLINE", amountCents: due, provider: "GATEWAY", reference: o.paymentRef ?? undefined }] : [];
    else {
      if (dispatch) throw new OrderError("Delivery orders must be paid before dispatch");
      const paid = (opts.payments ?? []).reduce((s, p) => s + p.amountCents, 0);
      if (paid !== due) throw new OrderError(`Take payment of ${zar(due)} before handover`);
      payments = opts.payments ?? [];
    }
  }

  const events = [...(o.events as Event[]), { status: to, at: new Date().toISOString(), note: opts.note }];
  let postedSaleId: string | null = null;
  const updated = await tx(async (t) => {
    if (handover || dispatch) {
      const excluded = incentiveExcluded(settings.compliance);
      const lines = o.lines.map((l) => ({
        variantId: l.variantId, qty: l.qty, unitPriceCents: l.unitPriceCents,
        discountCents: l.qty * l.unitPriceCents - l.totalCents, totalCents: l.totalCents, vatCents: vatOf(l.totalCents),
        noEarn: excluded.includes(l.variant.product.regClass), memberSavingsCents: l.memberSavingsCents,
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
      if (o.pointsRedeemed) await addPoints(t, { customerId: o.customerId, points: o.pointsRedeemed, kind: "REVERSAL", orderId: o.id, note: `Order ${o.code} cancelled` });
    }
    const data: Prisma.OrderUpdateInput = { status: to, events };
    if (handover || dispatch) data.paymentStatus = "PAID";
    if (to === "CANCELLED" && o.paymentStatus === "PAID") data.paymentStatus = "REFUNDED";
    if (to === "COMPLETED") (data.completedAt = new Date()), (data.idChecked = !!opts.idChecked);
    if (dispatch) (data.courier = opts.courier ?? (o.fulfilment === "SAME_DAY" ? "Herbal Holland driver" : "Courier")), (data.trackingNo = opts.trackingNo ?? `HH${shortCode(8)}`);
    await audit(t, actor, `order.${to.toLowerCase()}`, { storeId: o.storeId, entity: "Order", entityId: o.id });
    return t.order.update({ where: { id: o.id }, data });
  });

  const msg: Partial<Record<OrderStatus, string>> = {
    READY: `Herbal Holland: order ${o.code} is ready at ${o.store.name}. Show code ${o.collectionCode} and your ID (18+) to collect.`,
    OUT_FOR_DELIVERY: `Herbal Holland: order ${o.code} is on its way. Have your ID (18+) ready for the driver.`,
    COMPLETED: `Herbal Holland: order ${o.code} complete. Thanks — your points have been added.`,
    CANCELLED: `Herbal Holland: order ${o.code} was cancelled. Any payment or points used have been returned.`,
  };
  if (msg[to]) await notifyCustomer(o.customer, msg[to]!);
  if (postedSaleId && o.customer.email) queueSaleInvoice(postedSaleId, o.customer.email);
  return updated;
}
