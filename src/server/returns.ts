// Returns: a member asks to send part (or all) of a delivered online order back; the fulfilling store's back office
// (or HQ) approves or declines it, books the courier collection by hand, marks the parcel received and refunds it.
// The rules (windows, what may come back, what's refunded) live in @/lib/returns; the money moves through
// refundOrderAmount (@/server/orders) and the books through refundSale (a credit note at the store, stock back on the
// shelf where it should be, points reversed). The member is told at every step, by email or SMS.
import { db, tx, type Tx } from "./db";
import { audit, type Actor } from "./audit";
import { nextNumber } from "./counters";
import { deliverEmail, type Email } from "./email";
import { APP_URL, emailLayout, esc, para } from "./email-templates";
import { notifyCustomer } from "./messaging";
import { OrderError, REFUND_CLAIM, refundOrderAmount } from "./orders";
import { queuePosting } from "./ledger/core";
import { paidOnlineWith } from "./payments";
import { refundSale, SaleError, voucherPartsOf } from "./sales";
import { storePhotos, UploadError } from "./uploads";
import { gsmSafe } from "@/lib/sms";
import { zar } from "@/lib/money";
import { allocateRefundAcross } from "@/lib/vouchers";
import {
  RETURN_NOTE_MAX,
  RETURN_PHOTOS,
  RETURN_REASON,
  RETURN_REASONS,
  canMoveReturn,
  refundBreakdown,
  restockByDefault,
  returnEligibility,
  returnNumber,
  returnStatusMessage,
  validateReturnItems,
  type Eligibility,
  type ReturnItem,
  type ReturnLine,
  type ReturnReasonKey,
  type ReturnStatusKey,
} from "@/lib/returns";
import type { Prisma, ReturnRequest } from "@/generated/prisma/client";

/** An expected, user-facing failure (shown inline). */
export class ReturnError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

/** HQ sees every return; a store's managers see the returns on the orders it fulfilled. */
export type ReturnScope = { kind: "HQ" } | { kind: "STORES"; storeIds: string[] };
export const returnInScope = (r: { storeId: string }, scope: ReturnScope) => scope.kind === "HQ" || scope.storeIds.includes(r.storeId);

const ORDER_INCLUDE = {
  store: { select: { id: true, code: true, name: true } },
  customer: { select: { id: true, firstName: true, lastName: true, memberNo: true, tier: true, phone: true, email: true } },
  lines: { include: { variant: { select: { id: true, name: true, sku: true, podSku: true, product: { select: { name: true, slug: true, regClass: true, strain: true } } } } } },
  sale: { select: { id: true, number: true, lines: { select: { id: true, variantId: true, qty: true } } } },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** Units of each variant already in a return request on the order (declined ones don't count). */
async function requestedUnits(orderId: string) {
  const rows = await db.returnRequest.findMany({ where: { orderId, status: { not: "DECLINED" } }, select: { items: true } });
  const out = new Map<string, number>();
  for (const r of rows) for (const it of (r.items as ReturnItem[]) ?? []) out.set(it.variantId, (out.get(it.variantId) ?? 0) + it.qty);
  return out;
}

function returnLines(o: OrderRow, requested: Map<string, number>): ReturnLine[] {
  return o.lines.map((l) => ({
    variantId: l.variantId,
    name: `${l.variant.product.name} · ${l.variant.name}`,
    qty: l.qty,
    totalCents: l.totalCents,
    regClass: l.variant.product.regClass,
    madeToOrder: !!l.variant.podSku,
    requested: requested.get(l.variantId) ?? 0,
  }));
}

// ── The member's request ────────────────────────────────────────────────────

/** A member's delivered order with what may come back for each reason (the form switches as they choose). */
export async function returnableOrder(code: string, customerId: string, now = new Date()) {
  const o = await db.order.findFirst({ where: { code: code.toUpperCase(), customerId }, include: ORDER_INCLUDE });
  if (!o) return null;
  const [requested, existing] = await Promise.all([requestedUnits(o.id), db.returnRequest.findMany({ where: { orderId: o.id }, orderBy: { createdAt: "desc" } })]);
  const lines = returnLines(o, requested);
  const eligibility = Object.fromEntries(RETURN_REASONS.map((r) => [r, returnEligibility({ status: o.status, completedAt: o.completedAt, lines }, r, now)])) as Record<ReturnReasonKey, Eligibility>;
  return { order: o, lines, eligibility, existing };
}

export type ReturnInput = { orderCode: string; reason: string; items: { variantId: string; qty: unknown }[]; note: string; sealedConfirmed: boolean; photos: File[] };

/** Opens a return request: checks the window and the items, stores the photos, numbers it, audits it, tells the member. */
export async function requestReturn(a: ReturnInput, customer: { id: string; firstName: string }, now = new Date()): Promise<ReturnRequest> {
  const reason = a.reason.toUpperCase();
  if (!RETURN_REASONS.includes(reason as ReturnReasonKey)) throw new ReturnError("Choose a reason", "reason");
  const r = await returnableOrder(a.orderCode, customer.id, now);
  if (!r) throw new ReturnError("Order not found");
  const e = r.eligibility[reason as ReturnReasonKey];
  const items = validateReturnItems(a.items, e);
  if (!items.ok) throw new ReturnError(items.error, "items");
  if (items.items.some((it) => e.lines.find((l) => l.variantId === it.variantId)?.sealed) && !a.sealedConfirmed)
    throw new ReturnError("Confirm that the items are unopened and sealed: food, supplements and skin care come back for a change of mind only if they are", "sealed");
  const note = a.note.replace(/\r\n?/g, "\n").trim().slice(0, RETURN_NOTE_MAX);
  if (reason === "OTHER" && note.length < 10) throw new ReturnError("Tell us what happened (a sentence or two)", "note");
  let photoUploadIds: string[] = [];
  try {
    photoUploadIds = await storePhotos({ files: a.photos, max: RETURN_PHOTOS.max, folder: "returns", uploadedById: customer.id, storeId: r.order.storeId });
  } catch (err) {
    if (err instanceof UploadError) throw new ReturnError(err.message, "photos");
    throw err;
  }
  const row = await tx(async (t) => {
    const number = returnNumber(await nextNumber(t, "RETURN_REQUEST"));
    const created = await t.returnRequest.create({
      data: { number, orderId: r.order.id, customerId: customer.id, storeId: r.order.storeId, reason: reason as ReturnReasonKey, items: items.items, note: note || null, photoUploadIds },
    });
    await audit(t, { type: "CUSTOMER", id: customer.id, name: customer.firstName }, "return.request", {
      storeId: r.order.storeId, entity: "ReturnRequest", entityId: created.id, data: { number, orderCode: r.order.code, reason, units: items.items.reduce((s, i) => s + i.qty, 0), photos: photoUploadIds.length },
    });
    return created;
  });
  await tell(row, r.order.code, r.order.customer);
  return row;
}

export async function memberReturns(customerId: string, page: number, pageSize = 10) {
  const where = { customerId };
  const [rows, total] = await Promise.all([db.returnRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), db.returnRequest.count({ where })]);
  const orders = new Map((await db.order.findMany({ where: { id: { in: rows.map((r) => r.orderId) } }, select: { id: true, code: true } })).map((o) => [o.id, o.code]));
  return { rows: rows.map((r) => ({ ...r, orderCode: orders.get(r.orderId) ?? "" })), total };
}

// ── Working a return (staff) ────────────────────────────────────────────────

async function load(id: string, scope: ReturnScope) {
  const r = await db.returnRequest.findUnique({ where: { id } });
  if (!r || !returnInScope(r, scope)) throw new ReturnError("Return not found");
  const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: ORDER_INCLUDE });
  return { r, order };
}

function move(r: ReturnRequest, to: ReturnStatusKey) {
  if (!canMoveReturn(r.status, to)) throw new ReturnError(`A return that is ${r.status.toLowerCase().replaceAll("_", " ")} can't be ${to.toLowerCase().replaceAll("_", " ")}`);
}

/**
 * Moves a return on from the status it was read in — once: a second click, or a colleague at the same moment, finds it
 * already moved. `where`: anything else that must still hold (a decline needs no refund under way or made).
 */
async function moveTx(t: Tx, r: ReturnRequest, to: ReturnStatusKey, data: Prisma.ReturnRequestUpdateManyMutationInput = {}, where: Prisma.ReturnRequestWhereInput = {}) {
  const { count } = await t.returnRequest.updateMany({ where: { ...where, id: r.id, status: r.status }, data: { ...data, status: to } });
  if (!count) throw new ReturnError(`${r.number} changed while you were on it. Refresh to see where it is now`);
  return t.returnRequest.findUniqueOrThrow({ where: { id: r.id } });
}

/** Approve (an optional note) or decline (a reason the member reads). */
export async function decideReturn(id: string, to: "APPROVED" | "DECLINED", note: string, actor: Actor & { id: string }, scope: ReturnScope) {
  const { r, order } = await load(id, scope);
  move(r, to);
  const text = note.trim().slice(0, 500);
  if (to === "DECLINED" && text.length < 3) throw new ReturnError("Say why: the member is told the reason", "note");
  if (to === "DECLINED" && r.refundRef) throw new ReturnError(`The refund for ${r.number} has already started, so it can't be declined now`);
  const row = await tx(async (t) => {
    // Declining is possible until the money moves: not once a refund has started.
    const updated = await moveTx(t, r, to, { decisionNote: text || null, decidedById: actor.id, decidedAt: new Date() }, to === "DECLINED" ? { refundRef: null } : {});
    await audit(t, actor, to === "APPROVED" ? "return.approve" : "return.decline", { storeId: r.storeId, entity: "ReturnRequest", entityId: id, data: { number: r.number, orderCode: order.code, note: text || null } });
    return updated;
  });
  await tell(row, order.code, order.customer);
  return row;
}

/** The collection is booked by hand with the courier for now; record who's coming and the waybill so the member knows. */
export async function bookCollection(id: string, a: { courier: string; waybill: string }, actor: Actor & { id: string }, scope: ReturnScope) {
  const { r, order } = await load(id, scope);
  move(r, "COLLECTION_BOOKED");
  const courier = a.courier.trim().slice(0, 80);
  const waybill = a.waybill.trim().slice(0, 80);
  if (!courier) throw new ReturnError("Which courier is collecting?", "courier");
  if (!waybill) throw new ReturnError("Add the waybill or booking reference", "waybill");
  const row = await tx(async (t) => {
    const updated = await moveTx(t, r, "COLLECTION_BOOKED", { courier, waybill });
    await audit(t, actor, "return.book_collection", { storeId: r.storeId, entity: "ReturnRequest", entityId: id, data: { number: r.number, courier, waybill } });
    return updated;
  });
  await tell(row, order.code, order.customer);
  return row;
}

export async function receiveReturn(id: string, actor: Actor & { id: string }, scope: ReturnScope) {
  const { r, order } = await load(id, scope);
  move(r, "RECEIVED");
  const row = await tx(async (t) => {
    const updated = await moveTx(t, r, "RECEIVED");
    await audit(t, actor, "return.receive", { storeId: r.storeId, entity: "ReturnRequest", entityId: id, data: { number: r.number } });
    return updated;
  });
  await tell(row, order.code, order.customer);
  return row;
}

/** What refunding this return would pay out, and how (gateway, or by hand). `prior`: what earlier refunded returns took. */
export function refundPlan(r: ReturnRequest, order: OrderRow, prior: { cents: number; units: Map<string, number> }) {
  const due = order.totalCents - order.pointsRedeemed * 100;
  const items = (r.items as ReturnItem[]) ?? [];
  const breakdown = refundBreakdown({
    lines: order.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, totalCents: l.totalCents, returned: prior.units.get(l.variantId) ?? 0 })),
    items, deliveryCents: order.deliveryCents, reason: r.reason, paidCents: Math.max(0, due - prior.cents),
  });
  const gateway = paidOnlineWith(order);
  return { breakdown, gateway, manual: !gateway, restock: Object.fromEntries(items.map((i) => [i.variantId, restockByDefault(r.reason)])) as Record<string, boolean> };
}

/**
 * How a refund of `cents` on the order splits between the gift voucher(s) that paid for it and money: the voucher
 * part goes back onto the voucher with the credit note (lib/vouchers.allocateRefund), only the rest moves in money.
 * This return's own credit note (a retry) doesn't count as an earlier refund.
 */
export async function voucherSplitFor(order: { sale: { id: string } | null }, returnId: string, cents: number) {
  if (!order.sale) return { parts: [] as { code: string; cents: number }[], toVoucher: 0, toTender: cents };
  const sale = await db.sale.findUniqueOrThrow({ where: { id: order.sale.id }, select: { payments: true, refunds: { where: { NOT: { id: `return-${returnId}` } }, select: { payments: true } } } });
  const split = allocateRefundAcross(cents, voucherPartsOf(sale));
  return { parts: split.parts.map((v) => ({ code: v.code, cents: v.cents })), toVoucher: cents - split.toTender, toTender: split.toTender };
}

/** The money and units earlier refunded returns on the order took. */
export async function priorRefunds(orderId: string, exceptId: string) {
  const rows = await db.returnRequest.findMany({ where: { orderId, status: "REFUNDED", NOT: { id: exceptId } }, select: { refundCents: true, items: true } });
  const units = new Map<string, number>();
  for (const r of rows) for (const it of (r.items as ReturnItem[]) ?? []) units.set(it.variantId, (units.get(it.variantId) ?? 0) + it.qty);
  return { cents: rows.reduce((s, r) => s + (r.refundCents ?? 0), 0), units };
}

/**
 * Refunds a received return: the money first (through the gateway, or by hand with a reference), then the credit note
 * at the store — units back on the shelf where staff say so, points reversed, rollups adjusted — then the status and the
 * member's message. Safe to retry after a failure half-way: money already moved isn't moved twice, and a credit note
 * already posted isn't posted twice.
 */
export async function refundReturn(id: string, a: { restock: Record<string, boolean>; manualRef?: string | null; manualMethod?: string | null }, actor: Actor & { id: string; name: string }, scope: ReturnScope) {
  const { r, order } = await load(id, scope);
  move(r, "REFUNDED");
  const plan = refundPlan(r, order, await priorRefunds(order.id, r.id));
  const cents = plan.breakdown.totalCents;
  // The gift voucher part comes back onto the voucher(s) with the credit note; only the rest moves in money.
  const split = await voucherSplitFor(order, r.id, cents);
  const codes = split.parts.map((v) => v.code).join(", ");
  // Money already sent by an earlier attempt (one under way is refundOrderAmount's to refuse, or to take over if it died).
  const sent = r.refundRef && r.refundRef !== REFUND_CLAIM ? r.refundRef : null;
  const money = sent
    ? { note: `already refunded (${sent})` }
    : split.toTender > 0
      ? await refundOrderAmount(order.id, split.toTender, `Return ${r.number}: ${RETURN_REASON[r.reason].label}`, { returnId: r.id, actor, manualRef: a.manualRef }).catch((e) => {
          if (e instanceof OrderError) throw new ReturnError(e.message, plan.manual ? "manualRef" : undefined);
          throw e;
        })
      : { note: split.toVoucher > 0 ? `nothing to pay out in money: ${zar(split.toVoucher)} goes back onto gift voucher ${codes} with the credit note` : "nothing paid in money: points come back with the credit note" };
  if (!sent && split.toTender === 0) await db.returnRequest.update({ where: { id }, data: { refundRef: split.toVoucher > 0 ? "VOUCHER" : "POINTS", refundCents: 0 } });

  // The credit note: the online sale posted at handover or dispatch is refunded line by line.
  let creditNote: string | null = null;
  if (order.sale) {
    const number = `${order.store.code}-${r.number}`;
    const existing = await db.sale.findUnique({ where: { number }, select: { number: true } });
    if (existing) creditNote = existing.number;
    else {
      const items = (r.items as ReturnItem[]) ?? [];
      const lines = items.flatMap((it) => {
        const sl = order.sale!.lines.find((l) => l.variantId === it.variantId);
        return sl ? [{ saleLineId: sl.id, qty: Math.min(it.qty, sl.qty), restock: a.restock?.[it.variantId] ?? restockByDefault(r.reason) }] : [];
      });
      const manualMethod = (["CARD", "EFT", "CASH", "PAYSHAP"] as const).find((m) => m === a.manualMethod) ?? "EFT";
      try {
        const sale = await refundSale({
          id: `return-${r.id}`,
          number,
          saleId: order.sale.id,
          lines,
          method: plan.gateway ? "ONLINE" : manualMethod,
          extraCents: plan.breakdown.deliveryCents,
          reason: `Return ${r.number}: ${RETURN_REASON[r.reason].label}`,
          staffId: actor.id,
          staffName: actor.name,
        });
        creditNote = sale.number;
      } catch (e) {
        if (e instanceof SaleError) throw new ReturnError(`The money is refunded, but the credit note couldn't be posted: ${e.message}. Try again, or post the refund at the till.`);
        throw e;
      }
    }
  }
  const row = await tx(async (t) => {
    const updated = await moveTx(t, r, "REFUNDED", { refundCents: cents, decidedById: r.decidedById ?? actor.id, decidedAt: r.decidedAt ?? new Date() });
    if (creditNote && plan.gateway) await queuePosting(t, "online-payment", `${order.id}:return-${r.id}`); // out through the gateway: HQ's books
    await audit(t, actor, "return.refund", {
      storeId: r.storeId, entity: "ReturnRequest", entityId: id,
      data: { number: r.number, orderCode: order.code, amount: cents, delivery: plan.breakdown.deliveryCents, money: money.note, creditNote, ...(split.toVoucher > 0 && { toVouchers: split.parts, toTender: split.toTender }) },
    });
    return updated;
  });
  await tell(row, order.code, order.customer, { voucherCents: split.toVoucher });
  return { r: row, cents, creditNote, money, voucherCents: split.toVoucher };
}

// ── Queues and detail ───────────────────────────────────────────────────────

export const RETURN_VIEWS = ["open", "requested", "approved", "received", "refunded", "declined", "all"] as const;
export type ReturnView = (typeof RETURN_VIEWS)[number];
export const returnView = (v: string | undefined): ReturnView => ((RETURN_VIEWS as readonly string[]).includes(v ?? "") ? (v as ReturnView) : "open");

export async function returnWhere(scope: ReturnScope, f: { view?: string; q?: string; reason?: string }): Promise<Prisma.ReturnRequestWhereInput> {
  const q = (f.q ?? "").trim();
  const view: ReturnView = q && !f.view ? "all" : returnView(f.view); // a search with no view chosen looks through everything
  const num = q.match(/^rt[\s-]*0*(\d{1,7})$/i);
  return {
    AND: [
      scope.kind === "HQ" ? {} : { storeId: { in: scope.storeIds } },
      view === "open"
        ? { status: { in: ["REQUESTED", "APPROVED", "COLLECTION_BOOKED", "RECEIVED"] } }
        : view === "approved"
          ? { status: { in: ["APPROVED", "COLLECTION_BOOKED"] } }
          : view === "all"
            ? {}
            : { status: view.toUpperCase() as ReturnStatusKey },
      RETURN_REASONS.includes(f.reason as ReturnReasonKey) ? { reason: f.reason as ReturnReasonKey } : {},
      !q ? {} : num ? { number: returnNumber(Number(num[1])) } : { OR: [{ number: { contains: q.toUpperCase() } }, { waybill: { contains: q, mode: "insensitive" } }, { orderId: { in: await ordersByCode(q) } }] },
    ],
  };
}
// The queue searches by order code too; codes are short, so the lookup is a cheap exact match.
const ordersByCode = (q: string) => db.order.findMany({ where: { code: q.toUpperCase() }, select: { id: true } }).then((rows) => rows.map((o) => o.id));

export async function listReturns(whereP: Prisma.ReturnRequestWhereInput | Promise<Prisma.ReturnRequestWhereInput>, page: number, pageSize = 25) {
  const where = await whereP;
  const [rows, total] = await Promise.all([db.returnRequest.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }), db.returnRequest.count({ where })]);
  const [orders, customers] = await Promise.all([
    db.order.findMany({ where: { id: { in: rows.map((r) => r.orderId) } }, select: { id: true, code: true, store: { select: { code: true, name: true } } } }),
    db.customer.findMany({ where: { id: { in: rows.map((r) => r.customerId) } }, select: { id: true, firstName: true, lastName: true, memberNo: true } }),
  ]);
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const byCustomer = new Map(customers.map((c) => [c.id, c]));
  return { rows: rows.map((r) => ({ ...r, order: byOrder.get(r.orderId) ?? null, customer: byCustomer.get(r.customerId) ?? null, units: ((r.items as ReturnItem[]) ?? []).reduce((s, i) => s + i.qty, 0) })), total };
}

export async function returnCounts(scope: ReturnScope) {
  const base = scope.kind === "HQ" ? {} : { storeId: { in: scope.storeIds } };
  const groups = await db.returnRequest.groupBy({ by: ["status"], where: base, _count: true });
  const n = (s: ReturnStatusKey) => groups.find((g) => g.status === s)?._count ?? 0;
  return { open: n("REQUESTED") + n("APPROVED") + n("COLLECTION_BOOKED") + n("RECEIVED"), requested: n("REQUESTED"), approved: n("APPROVED") + n("COLLECTION_BOOKED"), received: n("RECEIVED"), refunded: n("REFUNDED"), declined: n("DECLINED"), all: groups.reduce((s, g) => s + g._count, 0) };
}

export async function returnDetail(id: string, scope: ReturnScope) {
  const r = await db.returnRequest.findUnique({ where: { id } });
  if (!r || !returnInScope(r, scope)) return null;
  const [order, history, decidedBy] = await Promise.all([
    db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: ORDER_INCLUDE }),
    db.auditLog.findMany({ where: { entity: "ReturnRequest", entityId: id }, orderBy: { at: "asc" }, select: { id: true, at: true, action: true, actorName: true, data: true } }),
    r.decidedById ? db.user.findUnique({ where: { id: r.decidedById }, select: { name: true } }) : null,
  ]);
  const items = ((r.items as ReturnItem[]) ?? []).map((it) => {
    const l = order.lines.find((x) => x.variantId === it.variantId);
    return { ...it, name: l ? `${l.variant.product.name} · ${l.variant.name}` : "Item", sku: l?.variant.sku ?? "", unitCents: l ? Math.round(l.totalCents / l.qty) : 0, slug: l?.variant.product.slug ?? null, strain: l?.variant.product.strain ?? null, regClass: l?.variant.product.regClass ?? null };
  });
  const base = refundPlan(r, order, await priorRefunds(order.id, r.id));
  const plan = { ...base, voucher: await voucherSplitFor(order, r.id, base.breakdown.totalCents) };
  return { r, order, items, history, decidedBy, plan };
}

// ── Telling the member ──────────────────────────────────────────────────────

async function tell(r: ReturnRequest, orderCode: string, c: { id: string; firstName: string; phone: string; email: string | null }, extra: { voucherCents?: number } = {}) {
  const m = returnStatusMessage({ ...r, orderCode, ...extra });
  const link = `${APP_URL()}/club/orders/${orderCode}/return`;
  if (c.email) {
    const html = emailLayout({
      preheader: m.text.slice(0, 90),
      eyebrow: `Returns · ${r.number}`,
      heading: m.subject,
      body: para(`Hi ${esc(c.firstName)},`) + para(esc(m.text)) + (r.status === "DECLINED" ? para(`If you'd like to talk it through, ask us at ${esc(`${APP_URL()}/support`)}.`, { muted: true }) : ""),
      cta: { label: "View your return", href: link },
      footerHtml: `You're receiving this because you asked to return something from order ${esc(orderCode)}.`,
    });
    await sendLogged(r, c.id, { to: c.email, subject: m.subject, text: `Hi ${c.firstName},\n\n${m.text}\n\nView your return: ${link}`, html, customerId: c.id });
  } else await notifyCustomer(c, gsmSafe(`Herbal Holland: ${m.text}`));
}

async function sendLogged(r: ReturnRequest, customerId: string, e: Email) {
  let reason: string | null = null;
  let delivered = false;
  try {
    delivered = await deliverEmail(e);
  } catch (err) {
    reason = String((err as Error)?.message ?? err).slice(0, 300);
    console.error("[returns] email failed", r.number, reason);
  }
  await db.messageLog.create({
    data: { id: `return-${r.id}-${r.status.toLowerCase()}-${Date.now().toString(36)}`, channel: "EMAIL", to: e.to, kind: "TRANSACTIONAL", status: reason ? "FAILED" : "SENT", customerId, body: `${e.subject}\n\n${e.text}`, reason: reason ?? (delivered ? null : "logged (SMTP_URL not set)") },
  });
}
