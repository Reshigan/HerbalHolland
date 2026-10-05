// Stores buy stock from HQ distribution centres (WHOLESALE) or from each other
// (NETWORK). Shipping moves batches out FEFO; receiving books the same batches in
// at the agreed cost, so traceability survives every hop.
import { db, tx } from "./db";
import { takeStock, putStock, availability, availKey } from "./inventory";
import { nextNumber } from "./counters";
import { audit, type Actor } from "./audit";
import { recordStatementInvoice } from "./supplier-invoices";
import { vatOnExcl } from "@/lib/money";
import type { StockOrderKind, StockOrderStatus } from "@/generated/prisma/client";

export class PurchaseError extends Error {}

type Shipped = { batchId: string; qty: number }[];

export async function createStockOrder(a: {
  buyerId: string;
  sellerId: string;
  kind: StockOrderKind;
  lines: { variantId: string; qty: number; unitCostCents?: number }[];
  notes?: string;
  actor: Actor;
  submit?: boolean;
  listingId?: string;
}) {
  const lines = a.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new PurchaseError("Add at least one item");
  if (a.buyerId === a.sellerId) throw new PurchaseError("A store can't buy from itself");
  const variants = await db.variant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } } });
  const unit = (id: string, given?: number) => given ?? variants.find((v) => v.id === id)!.wholesaleCents;
  const priced = lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitCostCents: unit(l.variantId, l.unitCostCents) }));
  const subtotal = priced.reduce((s, l) => s + l.qty * l.unitCostCents, 0);
  const vat = vatOnExcl(subtotal);

  return tx(async (t) => {
    const n = await nextNumber(t, "PO");
    const order = await t.stockOrder.create({
      data: {
        number: `PO-${String(n).padStart(6, "0")}`,
        kind: a.kind,
        status: a.submit ? "SUBMITTED" : "DRAFT",
        buyerId: a.buyerId,
        sellerId: a.sellerId,
        subtotalCents: subtotal,
        vatCents: vat,
        totalCents: subtotal + vat,
        notes: a.notes,
        createdById: a.actor.id,
        submittedAt: a.submit ? new Date() : null,
        lines: { create: priced },
      },
    });
    if (a.listingId) {
      const l = await t.listing.findUnique({ where: { id: a.listingId } });
      if (l) {
        const left = Math.max(0, l.qty - priced.reduce((s, x) => s + x.qty, 0));
        await t.listing.update({ where: { id: l.id }, data: { qty: left, active: left > 0 } });
      }
    }
    await audit(t, a.actor, "stockorder.create", { storeId: a.buyerId, entity: "StockOrder", entityId: order.id, data: { number: order.number, kind: a.kind } });
    return order;
  });
}

export type StockOrderAction = "submit" | "approve" | "reject" | "ship" | "receive" | "cancel";

const ALLOWED: Record<StockOrderAction, StockOrderStatus[]> = {
  submit: ["DRAFT"],
  approve: ["SUBMITTED"],
  reject: ["SUBMITTED"],
  ship: ["APPROVED"],
  receive: ["SHIPPED"],
  cancel: ["DRAFT", "SUBMITTED", "APPROVED"],
};

const STATUS_AFTER: Record<StockOrderAction, StockOrderStatus> = {
  submit: "SUBMITTED", approve: "APPROVED", reject: "REJECTED", ship: "SHIPPED", receive: "RECEIVED", cancel: "CANCELLED",
};

export async function actOnStockOrder(
  id: string,
  action: StockOrderAction,
  actor: Actor,
  opts: { received?: Record<string, number> } = {},
) {
  const o = await db.stockOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  if (!ALLOWED[action].includes(o.status)) throw new PurchaseError(`Can't ${action} an order that is ${o.status.toLowerCase()}`);

  const result = await tx(async (t) => {
    const now = new Date();
    // One step at a time: the order moves only from a status the action allows, so a second ship or receive (or a
    // cancel racing a ship) finds it moved and stops before stock moves twice.
    const claimed = await t.stockOrder.updateMany({ where: { id, status: { in: ALLOWED[action] } }, data: { status: STATUS_AFTER[action] } });
    if (claimed.count !== 1) throw new PurchaseError("This order changed while you were working on it — refresh and try again");
    if (action === "ship") {
      // Ship what the seller actually has; shortfalls are visible on the order.
      const avail = await availability([o.sellerId], o.lines.map((l) => l.variantId));
      for (const line of o.lines) {
        const qty = Math.min(line.qty, Math.max(0, avail.get(availKey(o.sellerId, line.variantId))?.available ?? 0));
        const shipped: Shipped = qty
          ? (await takeStock(t, { storeId: o.sellerId, variantId: line.variantId, qty, type: "TRANSFER_OUT", stockOrderId: o.id, userId: actor.id, note: o.number })).map(
              (a) => ({ batchId: a.batchId, qty: a.qty }),
            )
          : [];
        await t.stockOrderLine.update({ where: { id: line.id }, data: { shipped } });
      }
    }
    if (action === "receive") {
      for (const line of o.lines) {
        const shipped = (line.shipped as Shipped | null) ?? [];
        const shippedQty = shipped.reduce((s, b) => s + b.qty, 0);
        let left = Math.min(opts.received?.[line.id] ?? shippedQty, shippedQty);
        const receivedQty = left;
        for (const b of shipped) {
          if (left <= 0) break;
          const q = Math.min(left, b.qty);
          await putStock(t, {
            storeId: o.buyerId, variantId: line.variantId, batchId: b.batchId, qty: q, unitCostCents: line.unitCostCents,
            type: "TRANSFER_IN", stockOrderId: o.id, userId: actor.id, note: o.number,
          });
          left -= q;
        }
        await t.stockOrderLine.update({ where: { id: line.id }, data: { receivedQty } });
      }
      // On the buyer's supplier invoices for what was received, settled on the month's statement.
      await recordStatementInvoice(t, id, actor, now);
    }
    const stamp = { submit: "submittedAt", approve: "approvedAt", ship: "shippedAt", receive: "receivedAt" } as const;
    const updated = await t.stockOrder.update({
      where: { id },
      data: { status: STATUS_AFTER[action], ...(action in stamp && { [stamp[action as keyof typeof stamp]]: now }) },
    });
    await audit(t, actor, `stockorder.${action}`, { storeId: action === "receive" || action === "submit" ? o.buyerId : o.sellerId, entity: "StockOrder", entityId: id, data: { number: o.number } });
    return updated;
  });
  // After commit, so the invoice bills the quantities actually received (not the ordered total).
  if (action === "receive") queueMicrotask(() => import("./invoices").then((m) => m.emailStockOrderInvoice(id)).catch((e) => console.error("[invoice] stock order", id, e)));
  return result;
}

/** Value actually received on a stock order (VAT incl.) — what the buyer is invoiced. */
export function receivedValue(o: { lines: { receivedQty: number | null; unitCostCents: number }[] }) {
  const ex = o.lines.reduce((s, l) => s + (l.receivedQty ?? 0) * l.unitCostCents, 0);
  return ex + vatOnExcl(ex);
}
