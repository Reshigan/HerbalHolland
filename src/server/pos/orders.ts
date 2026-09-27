// Online orders at the till: the pick board for this store (click & collect + delivery)
// and handover verification. Status changes go through orders.advanceOrder.
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { startOfDaySA } from "@/lib/format";
import { maskPhone } from "@/components/pos/lib/rules";
import type { OrderCard } from "./types";

type Event = { status: string; at: string; note?: string };
const firstAt = (events: Event[], status: string) => events.find((e) => e.status === status)?.at ?? null;

export async function orderBoard(storeId: string): Promise<OrderCard[]> {
  const [settings, orders] = await Promise.all([
    getSettings(),
    db.order.findMany({
      where: {
        storeId,
        OR: [{ status: { in: ["PLACED", "PICKING", "READY", "OUT_FOR_DELIVERY"] } }, { status: "COMPLETED", completedAt: { gte: startOfDaySA(new Date()) } }],
      },
      orderBy: { createdAt: "asc" },
      take: 150,
      include: {
        customer: { select: { firstName: true, lastName: true, phone: true, memberNo: true, ageVerifiedAt: true } },
        lines: { include: { variant: { select: { name: true, sku: true, product: { select: { name: true, regClass: true } } } } } },
      },
    }),
  ]);
  const { licensedOnly, ageRestricted } = settings.compliance;
  return orders.map((o) => {
    const events = o.events as Event[];
    const paid = o.paymentStatus === "PAID";
    return {
      id: o.id,
      code: o.code,
      status: o.status as OrderCard["status"],
      fulfilment: o.fulfilment,
      paid,
      dueCents: paid ? 0 : o.totalCents - o.pointsRedeemed * 100,
      totalCents: o.totalCents,
      pointsRedeemed: o.pointsRedeemed,
      customer: {
        name: [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" "),
        phone: maskPhone(o.customer.phone),
        memberNo: o.customer.memberNo,
        ageVerified: !!o.customer.ageVerifiedAt,
      },
      lines: o.lines.map((l) => ({
        name: l.variant.product.name,
        variantName: l.variant.name,
        sku: l.variant.sku,
        qty: l.qty,
        licensed: licensedOnly.includes(l.variant.product.regClass),
      })),
      units: o.lines.reduce((a, l) => a + l.qty, 0),
      licensed: o.lines.some((l) => licensedOnly.includes(l.variant.product.regClass)),
      ageRestricted: o.lines.some((l) => ageRestricted.includes(l.variant.product.regClass)),
      placedAt: firstAt(events, "PLACED") ?? o.createdAt.toISOString(),
      readyAt: firstAt(events, "READY"),
      doneAt: o.completedAt?.toISOString() ?? firstAt(events, "OUT_FOR_DELIVERY"),
      address: o.addressLine ? [o.addressLine, o.suburb, o.city].filter(Boolean).join(", ") : null,
      deliveryNotes: o.deliveryNotes,
      courier: o.courier,
      trackingNo: o.trackingNo,
      idChecked: o.idChecked,
    };
  });
}

/** The customer proves it's their order with the 6-digit collection code (or the order code). */
export function codeMatches(order: { code: string; collectionCode: string }, entered: string) {
  const v = entered.replace(/\s/g, "").toUpperCase();
  return !!v && (v === order.collectionCode || v === order.code.toUpperCase());
}
