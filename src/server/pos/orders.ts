// Online orders at the till: the pick board for this store (click & collect + delivery)
// and handover verification. Status changes go through orders.advanceOrder. Trade click &
// collect orders at this store ride on the same board, tagged "Trade · TO-…": READY ones are
// handed over at the till (api/pos/trade/orders/[id]/collect); the rest are packed in the back office.
import { db, Prisma } from "@/server/db";
import { getSettings, type Settings } from "@/server/settings";
import { listTradeOrders } from "@/server/trade/orders";
import { startOfDaySA } from "@/lib/format";
import { maskPhone, parseOrderQr } from "@/components/pos/lib/rules";
import { PosError } from "./http";
import type { OrderCard } from "./types";
import { inBatches } from "@/lib/json-list";

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

const TRADE_STATUS = { PLACED: "PLACED", PICKING: "PICKING", READY: "READY", COLLECTED: "COMPLETED" } as const;

/**
 * Trade click & collect orders at this store as cards on the board: confirmed (PLACED), being packed (PICKING),
 * READY for the buyer to collect, and those COLLECTED today. The buyer is a business, so the card names the
 * account; nothing is paid at the till (HQ's EFT, or the account's terms) and every handover checks an ID (18+).
 */
async function tradeCards(storeId: string): Promise<OrderCard[]> {
  const [open, collected] = await Promise.all([listTradeOrders({ storeId, status: "OPEN", pageSize: 100 }), listTradeOrders({ storeId, status: "COLLECTED", pageSize: 25 })]);
  const today = startOfDaySA(new Date()).getTime();
  const rows = [...open.rows.filter((o) => o.fulfilment === "COLLECT" && o.status !== "PENDING_PAYMENT"), ...collected.rows.filter((o) => o.fulfilment === "COLLECT" && (o.collectedAt?.getTime() ?? 0) >= today)];
  if (!rows.length) return [];
  const lines = await inBatches(rows.map((o) => o.id), (part) => db.tradeOrderLine.findMany({
    where: { tradeOrderId: { in: part } },
    include: { variant: { select: { name: true, sku: true, product: { select: { name: true } } } } },
  }));
  return rows.map((o) => {
    const events = o.events as Event[];
    const mine = lines.filter((l) => l.tradeOrderId === o.id);
    return {
      id: o.id,
      code: o.number,
      status: TRADE_STATUS[o.status as keyof typeof TRADE_STATUS],
      fulfilment: "COLLECT",
      paid: true, // EFT to HQ, or on the account's terms: nothing is taken at the till
      dueCents: 0,
      totalCents: o.totalCents,
      pointsRedeemed: 0,
      customer: { name: o.account.name, phone: "", memberNo: o.account.number, ageVerified: false },
      lines: mine.map((l) => ({ name: l.variant.product.name, variantName: l.variant.name, sku: l.variant.sku, qty: l.shippedQty ?? l.qty, licensed: false })),
      units: mine.reduce((a, l) => a + (l.shippedQty ?? l.qty), 0),
      licensed: false, // THC is never traded
      ageRestricted: true, // every trade handover checks the collector's ID (18+)
      placedAt: firstAt(events, "PLACED") ?? o.createdAt.toISOString(),
      readyAt: o.readyAt?.toISOString() ?? firstAt(events, "READY"),
      doneAt: o.collectedAt?.toISOString() ?? null,
      address: null,
      deliveryNotes: o.notes,
      courier: null,
      trackingNo: null,
      idChecked: o.status === "COLLECTED",
      trade: { id: o.id, number: o.number, account: { number: o.account.number, name: o.account.name }, payMethod: o.payMethod === "ACCOUNT" ? "ACCOUNT" : "EFT", handlingCents: o.handlingCents, reference: o.reference },
    };
  });
}

export async function orderBoard(storeId: string): Promise<OrderCard[]> {
  const [settings, orders, trade] = await Promise.all([
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
    tradeCards(storeId),
  ]);
  return [...orders.map((o) => toCard(o, settings)), ...trade].sort((a, b) => a.placedAt.localeCompare(b.placedAt));
}

/** Customer's collection QR ("HHORDER:{orderCode}:{collectionCode}") → the order, if it's this store's and the code matches. */
export async function orderFromScan(storeId: string, text: string): Promise<OrderCard> {
  const qr = parseOrderQr(text);
  if (!qr) throw new PosError("That isn't a Herbal Holland order QR code", 400);
  const [settings, o] = await Promise.all([getSettings(), db.order.findFirst({ where: { code: qr.orderCode }, include })]);
  if (!o || o.storeId !== storeId) throw new PosError(`Order ${qr.orderCode} isn't for this store`, 404);
  if (!codeMatches(o, qr.collectionCode)) throw new PosError(`That QR's collection code doesn't match order ${o.code}, so ask the member for the code in their SMS`, 422, "BAD_CODE");
  return toCard(o, settings);
}

/** The customer proves it's their order with the 6-digit collection code from their SMS, or their collection QR. The order
 *  code is not proof: it's printed on the board and the order card. */
export function codeMatches(order: { code: string; collectionCode: string }, entered: string) {
  const qr = parseOrderQr(entered.trim());
  if (qr) return qr.orderCode === order.code.toUpperCase() && qr.collectionCode === order.collectionCode;
  const v = entered.replace(/\s/g, "");
  return !!v && v === order.collectionCode;
}
