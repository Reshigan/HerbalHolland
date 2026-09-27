// Made-to-order merch: variants with a print-partner product code (Variant.podSku) are printed on demand and
// couriered by the partner — no stock anywhere, so they skip stock routing and stock movements, cost what the
// partner charges, and always ship (the order books to HQ's distribution centre).
//
// Paid orders are sent to the partner by the frequent job, with our print files (public/merch/print) for each
// placement; the same job reads the partner's progress back: shipped → out for delivery with tracking (the sale
// posts), delivered → completed. Orders that also carry stocked items keep their own dispatch; the merch
// parcel just gets its tracking added.
import { db, type Tx } from "./db";
import { SYSTEM } from "./audit";
import { advanceOrder } from "./orders";
import { notifyCustomer } from "./messaging";
import { APP_URL } from "./invoices";
import { pod, type PodItem } from "./pod";
import { merchFor } from "@/lib/merch";

/** The made-to-order variants among `ids`, with the partner's price (VAT excl.). */
export async function madeToOrder(ids: string[], t: Tx | typeof db = db) {
  if (!ids.length) return new Map<string, number>();
  const rows = await t.variant.findMany({ where: { id: { in: ids }, podSku: { not: null } }, select: { id: true, costCents: true } });
  return new Map(rows.map((v) => [v.id, v.costCents]));
}

type Event = { status: string; at: string; note?: string };
const note = (o: { events: unknown }, text: string) => [...((o.events as Event[] | null) ?? []), { status: "MERCH", at: new Date().toISOString(), note: text }];
const OPEN = ["PLACED", "PICKING", "READY", "OUT_FOR_DELIVERY"] as const;

/** Sends paid orders with made-to-order lines to the print partner (once). */
export async function submitMerchOrders() {
  const due = await db.order.findMany({
    where: { podRef: null, paymentStatus: "PAID", status: { in: [...OPEN] }, lines: { some: { variant: { podSku: { not: null } } } } },
    include: { customer: true, lines: { include: { variant: { include: { product: { select: { slug: true, name: true } } } } } } },
    take: 50,
  });
  let done = 0, failed = 0;
  for (const o of due) {
    const items: PodItem[] = o.lines
      .filter((l) => l.variant.podSku)
      .map((l) => ({
        sku: l.variant.podSku!,
        qty: l.qty,
        name: `${l.variant.product.name} · ${l.variant.name}`,
        files: (merchFor(l.variant.product.slug)?.prints ?? []).map((p) => ({ placement: p.side, url: `${APP_URL()}/merch/print/${p.art}.png` })),
      }));
    try {
      const r = await pod().submit({
        ref: o.code,
        recipient: {
          name: [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" "), phone: o.customer.phone, email: o.customer.email,
          addressLine: o.addressLine ?? "", suburb: o.suburb ?? "", city: o.city ?? "", province: o.province ?? "", postalCode: o.postalCode ?? "", notes: o.deliveryNotes,
        },
        items,
      });
      await db.order.update({ where: { id: o.id }, data: { podRef: r.id, podStatus: "submitted", events: note(o, `Sent to the print partner (${r.id})`) } });
      // Merch-only orders have nothing for the distribution centre to pick: they're "being made" from here.
      if (o.status === "PLACED" && o.lines.every((l) => l.variant.podSku)) await advanceOrder(o.id, "PICKING", SYSTEM, { note: "Being printed by our print partner" });
      done++;
    } catch (e) {
      failed++;
      console.error("[merch] submit", o.code, e);
    }
  }
  return { done, failed };
}

/** Reads the partner's progress back onto open orders. */
export async function syncMerchOrders() {
  const open = await db.order.findMany({
    where: { podRef: { not: null }, status: { in: [...OPEN] }, NOT: { podStatus: { in: ["delivered", "cancelled"] } } },
    include: { customer: true, lines: { select: { variant: { select: { podSku: true } } } } },
    take: 200,
  });
  let changed = 0;
  for (const o of open) {
    try {
      const s = await pod().state(o.podRef!);
      if (s.status === o.podStatus) continue;
      changed++;
      const merchOnly = o.lines.every((l) => l.variant.podSku);
      await db.order.update({ where: { id: o.id }, data: { podStatus: s.status, events: note(o, `Print partner: ${s.status.replace("_", " ")}${s.trackingNo ? ` · ${s.courier ?? "courier"} ${s.trackingNo}` : ""}`) } });
      if (s.status === "shipped" || s.status === "delivered") {
        if (merchOnly && o.status === "PICKING") await advanceOrder(o.id, "READY", SYSTEM, { note: "Printed and packed" });
        if (merchOnly && ["PICKING", "READY"].includes(o.status))
          await advanceOrder(o.id, "OUT_FOR_DELIVERY", SYSTEM, { courier: s.courier, trackingNo: s.trackingNo, note: "Shipped by our print partner" });
        else if (!merchOnly && s.status === "shipped")
          await notifyCustomer(o.customer, `Herbal Holland: your merch from order ${o.code} is on its way${s.trackingNo ? ` — ${s.courier ?? "courier"} tracking ${s.trackingNo}` : ""}. The rest of your order ships separately.`);
      }
      if (s.status === "delivered" && merchOnly) await advanceOrder(o.id, "COMPLETED", SYSTEM, { note: "Delivered by our print partner" });
    } catch (e) {
      console.error("[merch] sync", o.code, e);
    }
  }
  return { checked: open.length, changed };
}
