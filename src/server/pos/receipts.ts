// Receipts and the till's sales history (bounded by store and date range).
import { db } from "@/server/db";
import { invoiceUrl } from "@/server/invoices";
import { addDays } from "@/lib/format";
import { PosError } from "./http";
import type { ReceiptDTO, SaleRow, TierKey } from "./types";

type LineAlloc = { lineId?: string };

const receiptInclude = {
  store: { select: { company: { select: { vatNumber: true } } } },
  customer: { select: { id: true, firstName: true, lastName: true, memberNo: true, tier: true, points: true } },
  staff: { select: { name: true } },
  lines: { include: { variant: { select: { name: true, sku: true, product: { select: { name: true } } } } }, orderBy: { id: "asc" } },
  payments: true,
  refundOf: { select: { id: true, number: true } },
  refunds: { include: { lines: true }, orderBy: { createdAt: "asc" } },
} as const;

export async function receipt(saleId: string, storeId: string): Promise<ReceiptDTO> {
  const s = await db.sale.findUnique({ where: { id: saleId }, include: receiptInclude });
  if (!s || s.storeId !== storeId) throw new PosError("Sale not found at this store", 404);

  // Quantities already refunded per original line (refund lines point back via allocations[].lineId).
  const refunded = new Map<string, number>();
  for (const r of s.refunds)
    for (const l of r.lines) {
      const src = (l.allocations as LineAlloc[])[0]?.lineId;
      if (src) refunded.set(src, (refunded.get(src) ?? 0) - l.qty);
    }
  const vendor = !!s.store.company.vatNumber;
  const loyalty = s.payments.filter((p) => p.method === "LOYALTY").reduce((a, p) => a + p.amountCents, 0);

  return {
    id: s.id,
    number: s.number,
    kind: s.kind,
    channel: s.channel,
    title: s.kind === "REFUND" ? (vendor ? "Credit note" : "Refund") : vendor ? "Tax invoice" : "Invoice",
    createdAt: s.createdAt.toISOString(),
    offline: s.offline,
    refundOf: s.refundOf,
    staff: s.staff?.name ?? null,
    customer: s.customer && {
      id: s.customer.id,
      name: [s.customer.firstName, s.customer.lastName].filter(Boolean).join(" "),
      memberNo: s.customer.memberNo,
      tier: s.customer.tier as TierKey,
      points: s.customer.points,
    },
    lines: s.lines.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      name: l.variant.product.name,
      variantName: l.variant.name,
      sku: l.variant.sku,
      qty: l.qty,
      unitPriceCents: l.unitPriceCents,
      discountCents: l.discountCents,
      totalCents: l.totalCents,
      vatCents: l.vatCents,
      refundedQty: refunded.get(l.id) ?? 0,
    })),
    subtotalCents: s.subtotalCents,
    discountCents: s.discountCents,
    memberSavingsCents: s.memberSavingsCents ?? 0,
    totalCents: s.totalCents,
    vatCents: s.vatCents,
    pointsEarned: s.pointsEarned,
    pointsRedeemed: Math.round(loyalty / 100),
    payments: s.payments
      .filter((p) => p.method !== "LOYALTY")
      .map((p) => ({
        method: p.method,
        amountCents: p.amountCents,
        tenderedCents: p.tenderedCents,
        changeCents: p.changeCents,
        provider: p.provider,
        reference: p.reference,
        cardBrand: p.cardBrand,
        cardLast4: p.cardLast4,
      })),
    promoCode: s.promoCode,
    invoiceEmail: s.invoiceEmail,
    buyer: (s.buyer as ReceiptDTO["buyer"]) ?? null,
    note: s.note,
    refunds: s.refunds.map((r) => ({ id: r.id, number: r.number, totalCents: r.totalCents, createdAt: r.createdAt.toISOString() })),
    invoiceUrl: invoiceUrl(s.id),
  };
}

export const HISTORY_DAYS = 30;
const PAGE = 25;

/** Recent sales at the store, newest first; `q` matches the receipt number. */
export async function salesHistory(storeId: string, opts: { q?: string; before?: string }) {
  const q = opts.q?.trim().toUpperCase();
  const since = addDays(new Date(), -(q ? 90 : HISTORY_DAYS));
  const before = opts.before ? new Date(opts.before) : null;
  const rows = await db.sale.findMany({
    where: {
      storeId,
      createdAt: { gte: since, ...(before && !Number.isNaN(before.getTime()) && { lt: before }) },
      ...(q && { number: { contains: q, mode: "insensitive" as const } }),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
    select: {
      id: true, number: true, kind: true, channel: true, createdAt: true, totalCents: true, offline: true,
      customer: { select: { firstName: true, lastName: true } },
      staff: { select: { name: true } },
      payments: { select: { method: true } },
      lines: { select: { qty: true } },
      _count: { select: { refunds: true } },
    },
  });
  const more = rows.length > PAGE;
  const sales: SaleRow[] = rows.slice(0, PAGE).map((s) => ({
    id: s.id,
    number: s.number,
    kind: s.kind,
    channel: s.channel,
    createdAt: s.createdAt.toISOString(),
    totalCents: s.totalCents,
    customer: s.customer ? [s.customer.firstName, s.customer.lastName].filter(Boolean).join(" ") : null,
    staff: s.staff?.name ?? null,
    methods: [...new Set(s.payments.map((p) => p.method))],
    items: s.lines.reduce((a, l) => a + Math.abs(l.qty), 0),
    refunded: s._count.refunds > 0,
    offline: s.offline,
  }));
  return { sales, next: more ? sales[sales.length - 1].createdAt : null, days: q ? 90 : HISTORY_DAYS };
}
