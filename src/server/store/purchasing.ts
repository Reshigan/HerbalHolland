// Store purchasing read models: stock orders the store buys (wholesale from its DC,
// network from other stores) and network orders it sells, with shipped batches and a
// timeline built from order timestamps plus the audit trail.
import { db } from "@/server/db";
import type { Prisma, StockOrderStatus } from "@/generated/prisma/client";
import { inBatches } from "@/lib/json-list";

export const PO_TABS: Record<string, { label: string; statuses: StockOrderStatus[] }> = {
  open: { label: "Open", statuses: ["DRAFT", "SUBMITTED", "APPROVED", "SHIPPED"] },
  transit: { label: "To receive", statuses: ["SHIPPED"] },
  received: { label: "Received", statuses: ["RECEIVED"] },
  closed: { label: "Cancelled & rejected", statuses: ["CANCELLED", "REJECTED"] },
  all: { label: "All", statuses: ["DRAFT", "SUBMITTED", "APPROVED", "SHIPPED", "RECEIVED", "REJECTED", "CANCELLED"] },
};

export async function stockOrderList(where: Prisma.StockOrderWhereInput, page: number, pageSize: number) {
  const [total, rows] = await Promise.all([
    db.stockOrder.count({ where }),
    db.stockOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        seller: { select: { name: true, code: true, kind: true } },
        buyer: { select: { name: true, code: true } },
        lines: { select: { qty: true, receivedQty: true, unitCostCents: true } },
      },
    }),
  ]);
  return { total, rows };
}

export async function stockOrderDetail(storeId: string, id: string) {
  const o = await db.stockOrder.findFirst({
    where: { id, OR: [{ buyerId: storeId }, { sellerId: storeId }] },
    include: {
      buyer: { include: { company: { select: { legalName: true, vatNumber: true } } } },
      seller: { include: { company: { select: { legalName: true, vatNumber: true } } } },
      lines: { include: { variant: { select: { id: true, sku: true, name: true, product: { select: { name: true } } } } } },
    },
  });
  if (!o) return null;
  type Shipped = { batchId: string; qty: number }[];
  const batchIds = [...new Set(o.lines.flatMap((l) => ((l.shipped as Shipped | null) ?? []).map((b) => b.batchId)))];
  const [batches, logs, creator] = await Promise.all([
    inBatches(batchIds, (part) => db.batch.findMany({ where: { id: { in: part } }, select: { id: true, code: true, expiresAt: true } })),
    db.auditLog.findMany({ where: { entity: "StockOrder", entityId: id }, orderBy: { at: "asc" }, select: { action: true, at: true, actorName: true } }),
    o.createdById ? db.user.findUnique({ where: { id: o.createdById }, select: { name: true } }) : null,
  ]);
  const batch = new Map(batches.map((b) => [b.id, b]));
  const lines = o.lines
    .map((l) => {
      const shipped = ((l.shipped as Shipped | null) ?? []).map((s) => ({ ...s, code: batch.get(s.batchId)?.code ?? "—", expiresAt: batch.get(s.batchId)?.expiresAt ?? null }));
      return { ...l, shippedLots: shipped, shippedQty: l.shipped == null ? null : shipped.reduce((s, b) => s + b.qty, 0) };
    })
    .sort((a, b) => a.variant.product.name.localeCompare(b.variant.product.name) || a.variant.name.localeCompare(b.variant.name));

  // Timeline: one step per stage, stamped from the order and attributed from the audit trail.
  const who = (action: string) => logs.find((x) => x.action === `stockorder.${action}`)?.actorName ?? null;
  const at = (action: string) => logs.find((x) => x.action === `stockorder.${action}`)?.at ?? null;
  const steps: { key: string; label: string; at: Date | null; by: string | null; state: "done" | "current" | "todo" | "stopped" }[] = [
    { key: "create", label: "Created", at: o.createdAt, by: creator?.name ?? who("create"), state: "done" },
    { key: "submit", label: "Submitted", at: o.submittedAt, by: who("submit") ?? (o.submittedAt ? creator?.name ?? null : null), state: o.submittedAt ? "done" : "todo" },
    { key: "approve", label: o.kind === "WHOLESALE" ? "Approved by the DC" : "Accepted by the seller", at: o.approvedAt, by: who("approve"), state: o.approvedAt ? "done" : "todo" },
    { key: "ship", label: "Shipped", at: o.shippedAt, by: who("ship"), state: o.shippedAt ? "done" : "todo" },
    { key: "receive", label: "Received", at: o.receivedAt, by: who("receive"), state: o.receivedAt ? "done" : "todo" },
  ];
  if (o.status === "REJECTED" || o.status === "CANCELLED") {
    const k = o.status === "REJECTED" ? "reject" : "cancel";
    const firstTodo = steps.findIndex((s) => s.state === "todo");
    const stop = { key: k, label: o.status === "REJECTED" ? "Rejected" : "Cancelled", at: at(k), by: who(k), state: "stopped" as const };
    steps.splice(firstTodo < 0 ? steps.length : firstTodo, steps.length, stop);
  } else {
    const next = steps.find((s) => s.state === "todo");
    if (next) next.state = "current";
  }
  return { order: o, lines, steps, invoiceSentAt: o.invoiceSentAt };
}

export type StockOrderDetail = NonNullable<Awaited<ReturnType<typeof stockOrderDetail>>>;
