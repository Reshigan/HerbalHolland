// Made-to-order merch: variants with a print-partner product code (Variant.podSku) are printed on demand and
// couriered by the partner — no stock anywhere, so they skip stock routing and stock movements, cost what the
// partner charges, and always ship (the order books to HQ's distribution centre; courier is charged on top).
//
// Paid orders go to the partner as an emailed production order (pod.ts) from the frequent job. The partner emails
// back the courier and tracking number; the distribution centre enters it ("Merch shipped"), which puts a merch-only
// order out for delivery (the sale posts) and texts the customer their tracking. Orders that also carry stocked
// items keep their own dispatch; the merch parcel just gets its tracking.
import { db, type Tx } from "./db";
import { audit, SYSTEM, type Actor } from "./audit";
import { advanceOrder, OrderError } from "./orders";
import { notifyCustomer } from "./messaging";
import { APP_URL } from "./invoices";
import { partnerName, sendProductionOrder } from "./pod";
import { ART } from "@/components/merch/art";
import { merchFor } from "@/lib/merch";

/** The made-to-order variants among `ids`, with the partner's price (VAT excl.). */
export async function madeToOrder(ids: string[], t: Tx | typeof db = db) {
  if (!ids.length) return new Map<string, number>();
  const rows = await t.variant.findMany({ where: { id: { in: ids }, podSku: { not: null } }, select: { id: true, costCents: true } });
  return new Map(rows.map((v) => [v.id, v.costCents]));
}

type Event = { status: string; at: string; note?: string };
const withNote = (o: { events: unknown }, note: string) => [...((o.events as Event[] | null) ?? []), { status: "MERCH", at: new Date().toISOString(), note }];

/** Sends paid orders with made-to-order lines to the merch partner (once each). */
export async function submitMerchOrders() {
  const due = await db.order.findMany({
    where: { podRef: null, paymentStatus: "PAID", status: { in: ["PLACED", "PICKING", "READY", "OUT_FOR_DELIVERY"] }, lines: { some: { variant: { podSku: { not: null } } } } },
    include: { customer: true, lines: { include: { variant: { include: { product: { select: { slug: true, name: true } } } } } } },
    take: 50,
  });
  let done = 0, failed = 0;
  for (const o of due) {
    // Claimed before it goes, so two runs of the job at once send it once. Our order code is the partner's reference.
    const claimed = await db.order.updateMany({ where: { id: o.id, podRef: null }, data: { podRef: o.code, podStatus: "sending" } });
    if (claimed.count !== 1) continue;
    let sent = false;
    try {
      await sendProductionOrder({
        ref: o.code,
        recipient: {
          name: [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" "), phone: o.customer.phone, email: o.customer.email,
          addressLine: o.addressLine ?? "", suburb: o.suburb ?? "", city: o.city ?? "", province: o.province ?? "", postalCode: o.postalCode ?? "", notes: o.deliveryNotes,
        },
        items: o.lines
          .filter((l) => l.variant.podSku)
          .map((l) => {
            const m = merchFor(l.variant.product.slug);
            return {
              code: l.variant.podSku!, name: l.variant.product.name, blank: m?.blank ?? "", size: l.variant.name, qty: l.qty,
              prints: (m?.prints ?? []).map((p) => ({
                placement: p.where, technique: p.technique, size: `${ART[p.art].w} × ${ART[p.art].h} mm`, note: ART[p.art].note,
                url: `${APP_URL()}/merch/print/${p.art}.png`, vector: `${APP_URL()}/merch/print/${p.art}.pdf`,
              })),
            };
          }),
      });
      sent = true;
      await db.order.update({ where: { id: o.id }, data: { podStatus: "sent", events: withNote(o, `Production order sent to ${partnerName()}`) } });
      // Merch-only orders have nothing for the distribution centre to pick: they're "being made" from here.
      if (o.status === "PLACED" && o.lines.every((l) => l.variant.podSku)) await advanceOrder(o.id, "PICKING", SYSTEM, { note: "Being made by our merch partner" });
      done++;
    } catch (e) {
      failed++;
      // Not sent: let go, so the next run tries again. (Sent: keep the claim — the partner never gets it twice.)
      if (!sent) await db.order.updateMany({ where: { id: o.id, podRef: o.code, podStatus: "sending" }, data: { podRef: null, podStatus: null } }).catch(() => undefined);
      console.error("[merch] production order", o.code, e);
    }
  }
  return { done, failed };
}

/** The partner has couriered the merch: record its tracking and tell the customer. */
export async function merchShipped(orderId: string, storeId: string, ship: { courier: string; trackingNo: string }, actor: Actor) {
  const o = await db.order.findFirst({ where: { id: orderId, storeId }, include: { customer: true, lines: { select: { variant: { select: { podSku: true } } } } } });
  if (!o) throw new OrderError("Order not found");
  if (!o.podRef) throw new OrderError("This order hasn't gone to the merch partner yet");
  if (o.podStatus === "shipped") throw new OrderError("Already marked as shipped");
  const note = `Merch shipped by ${partnerName()}: ${ship.courier} ${ship.trackingNo}`;
  await db.order.update({ where: { id: o.id }, data: { podStatus: "shipped", podTracking: `${ship.courier} · ${ship.trackingNo}`, events: withNote(o, note) } });
  await audit(db, actor, "order.merch_shipped", { storeId: o.storeId, entity: "Order", entityId: o.id, data: ship });
  if (o.lines.every((l) => l.variant.podSku)) {
    if (o.status === "PICKING") await advanceOrder(o.id, "READY", actor, { note: "Printed and packed" });
    await advanceOrder(o.id, "OUT_FOR_DELIVERY", actor, { courier: ship.courier, trackingNo: ship.trackingNo, note: `Shipped by ${partnerName()}` });
  } else await notifyCustomer(o.customer, `Herbal Holland: the merch from order ${o.code} is on its way (${ship.courier} tracking ${ship.trackingNo}). The rest of your order ships separately.`);
}
