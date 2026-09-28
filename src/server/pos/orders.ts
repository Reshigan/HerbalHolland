// Online orders at the till: the pick board for this store (click & collect + delivery)
// and handover verification. Status changes go through orders.advanceOrder.
import { db, Prisma } from "@/server/db";
import { getSettings, type Settings } from "@/server/settings";
import { startOfDaySA } from "@/lib/format";
import { maskPhone, parseOrderQr } from "@/components/pos/lib/rules";
import { PosError } from "./http";
import type { OrderCard } from "./types";

type Event = { status: string; at: string; note?: string };
const firstAt = (events: Event[], status: string) => events.find((e) => e.status === status)?.at ?? null;

const include = {
  customer: { select: { firstName: true, lastName: true, phone: true, memberNo: true, ageVerifiedAt: true } },
  lines: { include: { variant: { select: { name: true, sku: true, product: { select: { name: true, regClass: true } } } } } },
} as const;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof include }>;

function toCard(o: OrderRow, settings: Settings): OrderCard {
  const { licensedOnly, ageRestricted } = settings.compliance;
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
}

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
      include,
    }),
  ]);
  return orders.map((o) => toCard(o, settings));
}

/** Customer's collection QR ("HHORDER:{orderCode}:{collectionCode}") → the order, if it's this store's and the code matches. */
export async function orderFromScan(storeId: string, text: string): Promise<OrderCard> {
  const qr = parseOrderQr(text);
  if (!qr) throw new PosError("That isn't a Herbal Holland order QR code", 400);
  const [settings, o] = await Promise.all([getSettings(), db.order.findFirst({ where: { code: qr.orderCode }, include })]);
  if (!o || o.storeId !== storeId) throw new PosError(`Order ${qr.orderCode} isn't for this store`, 404);
  if (!codeMatches(o, qr.collectionCode)) throw new PosError(`That QR's collection code doesn't match order ${o.code} — ask the member for the code in their SMS`, 422, "BAD_CODE");
  return toCard(o, settings);
}

/** The customer proves it's their order with the 6-digit collection code (or the order code). */
export function codeMatches(order: { code: string; collectionCode: string }, entered: string) {
  const v = entered.replace(/\s/g, "").toUpperCase();
  return !!v && (v === order.collectionCode || v === order.code.toUpperCase());
}
