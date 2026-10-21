// Trade orders: placed in the portal (or by HQ for an account), priced ex VAT with VAT per line, in case multiples
// above the minimum, by courier from the DC or click & collect at a store. EFT orders wait (PENDING_PAYMENT, no
// stock held) for HQ to confirm the payment; on-account orders are PLACED at once within the credit limit and
// reserve stock at their store (inventory.availability). Shipping (courier) or handover (collect) posts the WHOLESALE
// Sale at that store through postSaleTx (FEFO lots, the TI-… tax invoice, the ledger INVOICE) and emails the buyer.
import { randomUUID } from "node:crypto";
import { db, tx, Prisma, type Tx } from "../db";
import { audit, SYSTEM, type Actor } from "../audit";
import { nextNumber, pinCode } from "../counters";
import { getSettings } from "../settings";
import { quote, type Quote } from "../pricing";
import { availability, availKey } from "../inventory";
import { postSaleTx, type TenderInput } from "../sales";
import { queueSaleInvoice, invoiceUrl } from "../invoices";
import { sendEmail } from "../email";
import { send } from "../messaging";
import { checkTradeBasket } from "../compliance";
import { claimEvents, peopleFor, pushToStaff, subscribedStores } from "../staff-push";
import { sms } from "@/lib/sms";
import { zar } from "@/lib/money";
import { addDays } from "@/lib/format";
import type { RegClass } from "@/lib/compliance";
import { ACCOUNT_STATUS_PROBLEM, addressLineOf, tradeBuyerBlock, tradeDelivery, tradeHandling, tradeInvoiceNumber, tradeLine, tradeOrderNumber, tradeTotals, validateTradeBasket, vatHalfUp } from "@/lib/trade";
import { lockedCreditCheck, postLedgerEntry } from "./ledger";
import { queuePosting } from "../ledger/core";
import { licenceProblem } from "./licences";
import { tradeActor } from "./accounts";
import { asList } from "@/lib/json-list";
import { tradeOrderEmail, tradePortalUrl, tradeProFormaEmail, tradeReadySms, type TradeOrderEmailInfo, type TradeOrderEvent } from "./emails";
import type { TradeAccount, TradeOrder, TradeOrderStatus } from "@/generated/prisma/client";
import { likeTerm } from "@/lib/search";

export class TradeOrderError extends Error {}

type Event = { status: string; at: string; note?: string };
type Shipped = { batchId: string; qty: number }[];

const ORDER_INCLUDE = {
  account: true,
  buyer: true,
  store: { select: { id: true, code: true, name: true, kind: true, addressLine: true, suburb: true, city: true, phone: true, licences: true, companyId: true, regionId: true } },
  lines: { include: { variant: { include: { product: { select: { name: true, regClass: true, status: true } } } } } },
} satisfies Prisma.TradeOrderInclude;
export type TradeOrderFull = Prisma.TradeOrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** The network's default distribution centre: the first active warehouse by code (an account may name its own, `dcId`). */
export async function defaultDc() {
  const dc = await db.store.findFirst({ where: { kind: "WAREHOUSE", status: "ACTIVE" }, orderBy: { code: "asc" } });
  if (!dc) throw new TradeOrderError("No distribution centre is set up yet");
  return dc;
}

const mail = async (r: { subject: string; html: string; text: string }, to: string) => sendEmail({ ...r, to }).catch((e) => console.error("[trade] email failed", r.subject, e));

const emailInfo = (o: TradeOrderFull, shipped = false): TradeOrderEmailInfo => ({
  number: o.number,
  fulfilment: o.fulfilment,
  payMethod: o.payMethod,
  paymentRef: o.paymentRef,
  subtotalCents: shipped ? o.lines.reduce((s, l) => s + (l.shippedQty ?? l.qty) * l.unitCents, 0) : o.subtotalCents,
  deliveryCents: o.deliveryCents,
  handlingCents: o.handlingCents,
  vatCents: shipped ? o.lines.reduce((s, l) => s + vatHalfUp((l.shippedQty ?? l.qty) * l.unitCents), 0) + vatHalfUp(o.deliveryCents) + vatHalfUp(o.handlingCents) : o.vatCents,
  totalCents: shipped ? invoicedTotal(o) : o.totalCents,
  address: o.fulfilment === "COLLECT" ? null : addressLineOf(o),
  reference: o.reference,
  store: o.store,
  collectionCode: o.collectionCode,
  courier: o.courier,
  trackingNo: o.trackingNo,
  invoiceNumber: o.invoiceNumber,
  lines: o.lines.map((l) => ({ name: `${l.variant.product.name} · ${l.variant.name}`, qty: l.qty, unitCents: l.unitCents, exCents: l.qty * l.unitCents, vatCents: l.vatCents, shippedQty: l.shippedQty })),
});

/** What an order is invoiced for: the shipped (or collected) quantities plus courier or handling, incl. VAT. */
export function invoicedTotal(o: { lines: { qty: number; shippedQty: number | null; unitCents: number }[]; deliveryCents: number; handlingCents: number }) {
  return tradeTotals(o.lines.map((l) => tradeLine({ unitCents: l.unitCents, qty: l.shippedQty ?? l.qty })), { deliveryCents: o.deliveryCents, handlingCents: o.handlingCents }).totalCents;
}

// ── Click & collect: where the basket can be collected ───────────────────────

export type CollectStore = {
  id: string;
  code: string;
  name: string;
  suburb: string;
  city: string;
  province: string;
  allInStock: boolean;
  short: { variantId: string; qty: number; available: number }[];
};

/**
 * Stores a trade basket can be collected from: active retail stores with click & collect whose licences cover the
 * lines' classes, the account's province first, then the rest by name, a page at a time (never the whole network),
 * each with the basket's availability there (all in stock, or which lines are short and by how much).
 */
export async function collectStoresFor(
  lines: { variantId: string; qty: number; regClass: RegClass }[],
  account: Pick<TradeAccount, "classes" | "province">,
  opts: { page?: number; pageSize?: number; province?: string | null; q?: string | null } = {},
) {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(opts.pageSize ?? 12)));
  const settings = await getSettings();
  const needLicence = [...new Set(lines.map((l) => l.regClass).filter((c) => settings.compliance.licensedOnly.includes(c)))];
  const q = likeTerm(opts.q?.trim() ?? "");
  const where: Prisma.StoreWhereInput = {
    kind: "RETAIL", status: "ACTIVE", clickCollect: true,
    ...(opts.province ? { province: opts.province as Prisma.StoreWhereInput["province"] } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { suburb: { contains: q } }, { city: { contains: q } }] } : {}),
  };
  // licences is a JSON list: the stores that hold every licence needed are counted here (the network is at most ~1,000 stores).
  const holds = (licences: unknown) => needLicence.every((c) => asList<string>(licences).includes(c));
  const [total, stores] = await Promise.all([
    needLicence.length ? db.store.findMany({ where, select: { licences: true } }).then((rows) => rows.filter((s) => holds(s.licences)).length) : db.store.count({ where }),
    db.$queryRaw<{ id: string; code: string; name: string; suburb: string; city: string; province: string }[]>`
      SELECT s.id, s.code, s.name, s.suburb, s.city, s.province AS province FROM "Store" s
      WHERE s.kind = 'RETAIL' AND s.status = 'ACTIVE' AND s."clickCollect" = 1
        ${needLicence.length ? Prisma.sql`AND ${Prisma.join(needLicence.map((c) => Prisma.sql`EXISTS (SELECT 1 FROM json_each(s.licences) WHERE value = ${c})`), " AND ")}` : Prisma.empty}
        ${opts.province ? Prisma.sql`AND s.province = ${opts.province}` : Prisma.empty}
        ${q ? Prisma.sql`AND (s.name LIKE ${`%${q}%`} OR s.suburb LIKE ${`%${q}%`} OR s.city LIKE ${`%${q}%`})` : Prisma.empty}
      ORDER BY (s.province = ${account.province}) DESC, s.name ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  ]);
  const avail = await availability(stores.map((s) => s.id), lines.map((l) => l.variantId));
  const rows: CollectStore[] = stores.map((s) => {
    const short = lines
      .map((l) => ({ variantId: l.variantId, qty: l.qty, available: Math.max(0, avail.get(availKey(s.id, l.variantId))?.available ?? 0) }))
      .filter((x) => x.available < x.qty);
    return { ...s, allInStock: short.length === 0, short };
  });
  return { rows, total, page, pageSize };
}

// ── Placing ──────────────────────────────────────────────────────────────────

export type PlaceTradeOrderInput = {
  accountId: string;
  buyerId?: string | null; // null when HQ places it for the account
  actor?: Actor; // HQ's actor when there's no buyer
  lines: { variantId: string; qty: number }[];
  payMethod: "EFT" | "ACCOUNT";
  fulfilment?: "COURIER" | "COLLECT"; // default COURIER
  storeId?: string | null; // COLLECT: the chosen store
  deliver?: "BILLING" | "DELIVERY"; // COURIER: which of the account's addresses (default DELIVERY when it has one)
  reference?: string | null; // the buyer's PO number, printed on the invoice
  notes?: string | null;
  code?: string | null; // a promotion code (WHOLESALE promotions only)
};

/**
 * Places an order for an approved account: classes allowed (and the store licensed), whole cases, the minimum order,
 * the WHOLESALE quote, delivery or handling from settings, the credit decision for ACCOUNT (balance + open on-account
 * orders + this order within the limit). EFT → PENDING_PAYMENT with a pro forma (no stock held); ACCOUNT → PLACED with
 * the stock reserved at the store and a confirmation. Collect orders at a store also buzz the store's phones.
 */
export async function placeTradeOrder(input: PlaceTradeOrderInput) {
  const account = await db.tradeAccount.findUnique({ where: { id: input.accountId } });
  if (!account) throw new TradeOrderError("Unknown trade account");
  // A held account (overdue, or held by HQ) may still order prepaid (the hold stops credit, not trade), as its emails say.
  const canOrder = account.status === "APPROVED" || (account.status === "ON_HOLD" && input.payMethod === "EFT");
  if (account.status === "ON_HOLD" && account.holdReason === "licence") throw new TradeOrderError((await licenceProblem(account)) ?? "This trade account's licences need attention. See Account › Licences.");
  if (!canOrder) throw new TradeOrderError(account.status === "ON_HOLD" ? `${ACCOUNT_STATUS_PROBLEM.ON_HOLD}, or pay this order by EFT` : ACCOUNT_STATUS_PROBLEM[account.status as keyof typeof ACCOUNT_STATUS_PROBLEM]);
  // We only supply an account whose required licences are verified and in date (src/lib/trade-licences.ts).
  const lp = await licenceProblem(account);
  if (lp) throw new TradeOrderError(`${lp} (Account › Licences)`);
  const buyer = input.buyerId ? await db.tradeBuyer.findUnique({ where: { id: input.buyerId } }) : null;
  if (input.buyerId && (!buyer || buyer.tradeAccountId !== account.id || !buyer.active)) throw new TradeOrderError("This buyer can't order for the account");
  const actor: Actor = buyer ? tradeActor(buyer) : (input.actor ?? SYSTEM);
  if (input.payMethod !== "EFT" && input.payMethod !== "ACCOUNT") throw new TradeOrderError("Pay by EFT or on account");
  const settings = await getSettings();
  const s = settings.trade;
  const fulfilment = input.fulfilment ?? "COURIER";

  // The fulfilling store: the account's DC (or the default one) for courier; a click & collect store for collect.
  let store;
  if (fulfilment === "COLLECT") {
    if (!input.storeId) throw new TradeOrderError("Choose the store to collect from");
    store = await db.store.findUnique({ where: { id: input.storeId } });
    if (!store || store.kind !== "RETAIL" || store.status !== "ACTIVE" || !store.clickCollect) throw new TradeOrderError("That store doesn't offer click & collect");
  } else {
    store = account.dcId ? await db.store.findUnique({ where: { id: account.dcId } }) : null;
    if (!store || store.kind !== "WAREHOUSE" || store.status === "CLOSED") store = await defaultDc();
  }

  const items = input.lines.filter((l) => l.qty > 0).map((l) => ({ variantId: l.variantId, qty: Math.floor(l.qty) }));
  const q = await quote({ channel: "WHOLESALE", storeId: store.id, tradeAccountId: account.id, items, code: input.code });
  if (!q.lines.length) throw new TradeOrderError("The order has no items");
  if (q.lines.length !== items.length) throw new TradeOrderError("One of the items isn't in the trade range any more");
  if (q.codeError) throw new TradeOrderError(q.codeError);
  const variants = await db.variant.findMany({ where: { id: { in: q.lines.map((l) => l.variantId) } }, select: { id: true, active: true, podSku: true, product: { select: { status: true } } } });
  const byId = new Map(variants.map((v) => [v.id, v]));
  for (const l of q.lines) {
    const v = byId.get(l.variantId);
    if (!v?.active || v.podSku) throw new TradeOrderError(`${l.name} isn't in the trade range`);
  }
  const comp = await checkTradeBasket({ items: q.lines.map((l) => ({ name: l.name, regClass: l.regClass, productStatus: byId.get(l.variantId)?.product.status })), accountClasses: asList<string>(account.classes), storeLicences: asList<string>(store.licences) });
  if (!comp.ok) throw new TradeOrderError(comp.blocks[0]);
  const problems = validateTradeBasket(q.lines.map((l) => ({ name: l.name, qty: l.qty, unitCents: l.exCents / l.qty, caseQty: l.caseQty })), { minOrderCents: s.minOrderCents });
  if (problems.length) throw new TradeOrderError(problems[0]);

  const deliveryCents = fulfilment === "COURIER" ? tradeDelivery(q.exCents ?? 0, s) : 0;
  const handlingCents = fulfilment === "COLLECT" ? tradeHandling(s) : 0;
  const lineTotals = q.lines.map((l) => ({ unitCents: l.exCents / l.qty, qty: l.qty, ...tradeLine({ unitCents: l.exCents / l.qty, qty: l.qty }) }));
  const totals = tradeTotals(lineTotals, { deliveryCents, handlingCents });
  if (totals.vatCents !== q.vatCents + vatHalfUp(deliveryCents) + vatHalfUp(handlingCents)) throw new TradeOrderError("Pricing changed while the order was being placed. Please try again.");

  const useDelivery = fulfilment === "COURIER" && !!account.deliveryLine && input.deliver !== "BILLING";
  const address = fulfilment === "COLLECT"
    ? {}
    : useDelivery
      ? { addressLine: account.deliveryLine!, suburb: account.deliverySuburb, city: account.deliveryCity!, province: account.deliveryProvince!, postalCode: account.deliveryPostalCode! }
      : { addressLine: account.addressLine, suburb: account.suburb, city: account.city, province: account.province, postalCode: account.postalCode };
  const avail = await availability([store.id], q.lines.map((l) => l.variantId));
  const shortNow = q.lines.filter((l) => (avail.get(availKey(store.id, l.variantId))?.available ?? 0) < l.qty).map((l) => l.name);
  const status: TradeOrderStatus = input.payMethod === "EFT" ? "PENDING_PAYMENT" : "PLACED";
  const now = new Date();
  const note = [input.payMethod === "EFT" ? `Pro forma sent; payment expected within ${s.eftHoldDays} days` : "Placed on account; stock reserved", shortNow.length ? `Short at ${store.name} right now: ${shortNow.join(", ")}` : null].filter(Boolean).join(" · ");
  const events: Event[] = [{ status, at: now.toISOString(), note }];

  const order = await tx(async (t) => {
    if (input.payMethod === "ACCOUNT") {
      const d = await lockedCreditCheck(t, account.id, totals.totalCents);
      if (!d.ok) throw new TradeOrderError(d.reason!);
    }
    const number = tradeOrderNumber(await nextNumber(t, "trade-order"));
    const o = await t.tradeOrder.create({
      data: {
        number, tradeAccountId: account.id, buyerId: buyer?.id ?? null, storeId: store.id, fulfilment, status, payMethod: input.payMethod,
        subtotalCents: totals.subtotalCents, deliveryCents, handlingCents, vatCents: totals.vatCents, totalCents: totals.totalCents,
        ...address,
        collectionCode: fulfilment === "COLLECT" ? pinCode() : null,
        reference: input.reference?.trim().slice(0, 60) || null, notes: input.notes?.trim().slice(0, 1_000) || null,
        events, reservedAt: status === "PLACED" ? now : null,
        lines: { create: lineTotals.map((l, i) => ({ variantId: q.lines[i].variantId, qty: l.qty, unitCents: l.unitCents, vatCents: l.vatCents })) },
      },
      include: ORDER_INCLUDE,
    });
    await audit(t, actor, "trade.order", { storeId: store.id, entity: "TradeOrder", entityId: o.id, data: { number, account: account.number, payMethod: input.payMethod, fulfilment, total: totals.totalCents, status } });
    return o;
  });
  if (status === "PENDING_PAYMENT") await mail(tradeProFormaEmail({ order: emailInfo(order), account, bank: s.bank, holdDays: s.eftHoldDays, url: tradePortalUrl(`/orders/${order.id}`) }), account.email);
  else await onConfirmed(order);
  return order;
}

/** A confirmed (PLACED) order: the buyer's confirmation, and the store's phones for click & collect. */
async function onConfirmed(o: TradeOrderFull) {
  await mail(tradeOrderEmail("confirmed", { order: emailInfo(o), account: o.account, url: tradePortalUrl(`/orders/${o.id}`) }), o.account.email);
  if (o.fulfilment === "COLLECT") await notifyStoreOfTradeOrder(o).catch((e) => console.error("[trade] staff push failed", o.number, e));
}

/**
 * The same push a new consumer online order sends to a store's managers and owners ("New online order · store"),
 * keyed `trade-order:<id>` so it goes once. Opens the store's trade-order page.
 */
export async function notifyStoreOfTradeOrder(o: TradeOrderFull) {
  const { stores, people } = await subscribedStores();
  const store = stores.find((s) => s.id === o.storeId);
  if (!store) return { users: 0 };
  const fresh = await claimEvents([`trade-order:${o.id}`]);
  if (!fresh.size) return { users: 0 };
  const how = o.fulfilment === "COLLECT" ? "click & collect (trade)" : "courier (trade)";
  return pushToStaff(peopleFor(store, people), { title: `New online order · ${store.name}`, body: `${o.number} · ${o.account.name} · ${zar(o.totalCents)} · ${how}`, url: `/store/${store.code}/trade/${o.id}` });
}

// ── Payment ──────────────────────────────────────────────────────────────────

/**
 * HQ confirms an EFT against its reference: PENDING_PAYMENT → PLACED (stock reserved from now), the PAYMENT on the
 * ledger (negative, with the bank reference), the confirmation email. Compare-and-set, so a double confirm changes
 * nothing. The payment is for the ordered total; a short shipment later leaves the difference as credit on the ledger.
 */
export async function confirmTradePayment(orderId: string, a: { reference: string; paidAt?: Date }, actor: Actor) {
  const reference = a.reference.trim().slice(0, 80);
  if (!reference) throw new TradeOrderError("Enter the bank reference");
  const before = await db.tradeOrder.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (before.status !== "PENDING_PAYMENT") {
    if (before.paidAt) return before; // already confirmed: nothing to do again
    throw new TradeOrderError(`Order ${before.number} isn't waiting for payment (it's ${before.status.toLowerCase().replace("_", " ")})`);
  }
  if (before.account.status === "CLOSED") throw new TradeOrderError(ACCOUNT_STATUS_PROBLEM.CLOSED);
  const now = new Date();
  const paidAt = a.paidAt ?? now;
  const events: Event[] = [...(before.events as Event[]), { status: "PLACED", at: now.toISOString(), note: `EFT confirmed (ref ${reference}); stock reserved` }];
  const moved = await tx(async (t) => {
    const { count } = await t.tradeOrder.updateMany({ where: { id: orderId, status: "PENDING_PAYMENT" }, data: { status: "PLACED", paymentRef: reference, paidAt, reservedAt: now, events } });
    if (!count) return false;
    await postLedgerEntry(t, { accountId: before.tradeAccountId, kind: "PAYMENT", cents: -before.totalCents, reference, tradeOrderId: orderId, note: `EFT for ${before.number}`, createdAt: paidAt, actor });
    await queuePosting(t, "trade-eft", orderId); // in the bank, held until it ships: HQ's books
    await audit(t, actor, "trade.order.paid", { storeId: before.storeId, entity: "TradeOrder", entityId: orderId, data: { number: before.number, reference, cents: before.totalCents } });
    return true;
  });
  const order = await db.tradeOrder.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (moved) await onConfirmed(order);
  return order;
}

// ── Picking, shipping, collecting, cancelling ────────────────────────────────

export type TradeOrderAction = "pick" | "ready" | "ship" | "collect" | "cancel";

const FROM: Record<TradeOrderAction, TradeOrderStatus[]> = {
  pick: ["PLACED"],
  ready: ["PLACED", "PICKING"],
  ship: ["PLACED", "PICKING"],
  collect: ["READY"],
  cancel: ["PENDING_PAYMENT", "PLACED", "PICKING", "READY"],
};

/** What can be done to an order next (for buttons): by status and fulfilment. */
export const nextTradeActions = (o: Pick<TradeOrder, "status" | "fulfilment">): TradeOrderAction[] =>
  (Object.keys(FROM) as TradeOrderAction[]).filter((a) => FROM[a].includes(o.status) && !(a === "ship" && o.fulfilment === "COLLECT") && !((a === "ready" || a === "collect") && o.fulfilment !== "COLLECT"));

export type AdvanceOpts = {
  courier?: string | null;
  trackingNo?: string | null;
  /** Lines that ship or hand over short: the rest ship in full. */
  shortShip?: { lineId: string; shippedQty: number }[];
  /** collect (required): the store checked the collector's ID (18+) and the collection code. */
  idChecked?: boolean;
  staffId?: string | null;
  deviceId?: string | null;
  shiftId?: string | null;
  note?: string | null;
};

/**
 * Moves an order on. pick → PICKING. ready (collect) → READY: the buyer gets the collection code by email and text.
 * ship (courier) and collect (collect, ID checked) post the WHOLESALE Sale at the fulfilling store through postSaleTx:
 * FEFO lots for what shipped (short lines keep `shippedQty`), one ACCOUNT or EFT tender, the account's buyer block,
 * the TI-… invoice as the sale number, the ledger INVOICE (due after the account's payment days on account; due on
 * the day for EFT, so it nets against the payment). Then they email the news and the tax invoice. cancel releases the
 * reservation; a paid EFT order is noted "refund by hand" (no money moves by itself).
 */
export async function advanceTradeOrder(orderId: string, action: TradeOrderAction, actor: Actor, opts: AdvanceOpts = {}) {
  const o = await db.tradeOrder.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  if (action === "ship" && o.fulfilment === "COLLECT") throw new TradeOrderError("A click & collect order is handed over at the store, not shipped");
  if ((action === "ready" || action === "collect") && o.fulfilment !== "COLLECT") throw new TradeOrderError("Only a click & collect order is made ready and collected");
  if (!FROM[action].includes(o.status)) throw new TradeOrderError(`Can't ${action} an order that is ${o.status.toLowerCase().replace("_", " ")}`);
  if (action === "collect" && !opts.idChecked) throw new TradeOrderError("Check the collector's ID (18+) and the collection code before handing over");
  if ((action === "ship" || action === "collect") && o.account.status === "CLOSED") throw new TradeOrderError(ACCOUNT_STATUS_PROBLEM.CLOSED);
  if (action === "ship" || action === "collect") {
    const lp = await licenceProblem(o.account);
    if (lp) throw new TradeOrderError(`This order can't be supplied until the account's licences are in order: ${lp}`);
  }
  const now = new Date();
  const posting = action === "ship" || action === "collect";

  // Short lines: what's handed over of each line.
  const shipQty = new Map<string, number>();
  for (const l of o.lines) shipQty.set(l.id, l.qty);
  for (const s of opts.shortShip ?? []) {
    const l = o.lines.find((x) => x.id === s.lineId);
    if (!l) throw new TradeOrderError("Unknown order line");
    const qty = Math.floor(s.shippedQty);
    if (!Number.isInteger(qty) || qty < 0 || qty > l.qty) throw new TradeOrderError(`Supply between 0 and ${l.qty} of ${l.variant.product.name} · ${l.variant.name}`);
    shipQty.set(l.id, qty);
  }
  if (posting && [...shipQty.values()].every((q) => q === 0)) throw new TradeOrderError("Nothing to supply. Cancel the order instead.");

  const refundByHand = action === "cancel" && o.payMethod === "EFT" && !!o.paidAt;
  const noteParts = [opts.note?.trim() || null];
  if (refundByHand) noteParts.push(`Paid by EFT (ref ${o.paymentRef}): refund ${zar(o.totalCents)} by hand`);
  const shortNotes = o.lines.filter((l) => shipQty.get(l.id)! < l.qty).map((l) => `${l.variant.product.name} · ${l.variant.name}: ${shipQty.get(l.id)} of ${l.qty}`);
  if (posting && shortNotes.length) noteParts.push(`Short: ${shortNotes.join("; ")}`);
  const to: TradeOrderStatus = ({ pick: "PICKING", ready: "READY", ship: "SHIPPED", collect: "COLLECTED", cancel: "CANCELLED" } as const)[action];
  const events: Event[] = [...(o.events as Event[]), { status: to, at: now.toISOString(), note: noteParts.filter(Boolean).join(" · ") || undefined }];

  let saleId: string | null = null;
  const updated = await tx(async (t) => {
    // One step at a time: the order moves only from the status it was read in, so a second ship or collect (or a
    // cancel racing one) finds it moved and stops before anything is posted twice.
    const claimed = await t.tradeOrder.updateMany({ where: { id: o.id, status: o.status }, data: { status: to } });
    if (claimed.count !== 1) throw new TradeOrderError("This order changed while you were working on it. Refresh and try again.");
    const data: Prisma.TradeOrderUpdateInput = { status: to, events };
    if (action === "pick") data.reservedAt = o.reservedAt ?? now;
    if (action === "ready") data.readyAt = now;
    if (action === "cancel") data.cancelledAt = now;
    if (refundByHand) await queuePosting(t, "trade-eft", `${o.id}:refund`); // the EFT goes back: HQ's books
    if (posting) {
      const invoiceNumber = tradeInvoiceNumber(await nextNumber(t, "trade-invoice"));
      saleId = randomUUID();
      const sale = await postTradeOrderSale(t, o, shipQty, { saleId, invoiceNumber, actor, now, staffId: opts.staffId, deviceId: opts.deviceId, shiftId: opts.shiftId });
      const saleLines = await t.saleLine.findMany({ where: { saleId: sale.id }, select: { variantId: true, allocations: true } });
      for (const l of o.lines) {
        const qty = shipQty.get(l.id)!;
        const shipped: Shipped = qty ? ((saleLines.find((x) => x.variantId === l.variantId)?.allocations as Shipped | null) ?? []).map((a) => ({ batchId: a.batchId, qty: a.qty })) : [];
        await t.tradeOrderLine.update({ where: { id: l.id }, data: { shippedQty: qty, shipped } });
      }
      const total = sale.totalCents;
      const dueAt = o.payMethod === "ACCOUNT" ? addDays(now, o.account.paymentDays) : now;
      await postLedgerEntry(t, { accountId: o.tradeAccountId, kind: "INVOICE", cents: total, reference: invoiceNumber, tradeOrderId: o.id, saleId: sale.id, dueAt, note: `${action === "ship" ? "Shipped" : "Collected"} ${o.number}`, createdAt: now, actor });
      data.invoiceNumber = invoiceNumber;
      data.sale = { connect: { id: sale.id } };
      if (action === "ship") {
        data.shippedAt = now;
        data.courier = opts.courier?.trim().slice(0, 60) || "Courier";
        data.trackingNo = opts.trackingNo?.trim().slice(0, 60) || null;
      } else {
        data.collectedAt = now;
      }
    }
    await audit(t, actor, `trade.order.${to.toLowerCase()}`, { storeId: o.storeId, entity: "TradeOrder", entityId: o.id, data: { number: o.number, ...(saleId ? { saleId } : {}), ...(shortNotes.length ? { short: shortNotes } : {}), ...(refundByHand ? { refundByHand: o.totalCents } : {}) } });
    return t.tradeOrder.update({ where: { id: o.id }, data, include: ORDER_INCLUDE });
  });

  const event: Partial<Record<TradeOrderAction, TradeOrderEvent>> = { ready: "ready", ship: "shipped", collect: "collected", cancel: "cancelled" };
  if (event[action]) {
    await mail(tradeOrderEmail(event[action]!, { order: emailInfo(updated, posting), account: updated.account, url: tradePortalUrl(`/orders/${o.id}`), invoiceUrl: saleId ? invoiceUrl(saleId) : null, note: opts.note?.trim() || null, refundByHand }), updated.account.email);
    if (action === "ready") {
      const phone = o.buyer?.phone ?? o.account.phone;
      if (phone) await send({ channel: "SMS", to: phone, body: sms(tradeReadySms({ number: o.number, storeName: o.store.name, collectionCode: updated.collectionCode ?? "" })), kind: "TRANSACTIONAL" }).catch((e) => console.error("[trade] ready text failed", o.number, e));
    }
  }
  if (saleId) queueSaleInvoice(saleId, updated.account.email);
  return updated;
}

/** Posts the WHOLESALE sale for what ships or is handed over, at the fulfilling store, inside the order's transaction. */
async function postTradeOrderSale(
  t: Tx,
  o: TradeOrderFull,
  shipQty: Map<string, number>,
  a: { saleId: string; invoiceNumber: string; actor: Actor; now: Date; staffId?: string | null; deviceId?: string | null; shiftId?: string | null },
) {
  const lines = o.lines
    .filter((l) => shipQty.get(l.id)! > 0)
    .map((l) => {
      const qty = shipQty.get(l.id)!;
      const { exCents, vatCents, inclCents } = tradeLine({ unitCents: l.unitCents, qty });
      return { variantId: l.variantId, qty, unitPriceCents: l.unitCents, discountCents: 0, totalCents: inclCents, vatCents, exCents, noEarn: true, memberSavingsCents: 0, offerCents: 0 };
    });
  const extraEx = o.deliveryCents + o.handlingCents;
  const extraCents = extraEx + vatHalfUp(extraEx);
  const linesIncl = lines.reduce((s, l) => s + l.totalCents, 0);
  const total = linesIncl + extraCents;
  const quote: Pick<Quote, "subtotalCents" | "discountCents" | "totalCents" | "vatCents" | "pointsMultiplier" | "promotionId"> & { lines: typeof lines } = {
    lines, subtotalCents: linesIncl, discountCents: 0, totalCents: linesIncl, vatCents: lines.reduce((s, l) => s + l.vatCents, 0), pointsMultiplier: 1, promotionId: null,
  };
  const payments: TenderInput[] = o.payMethod === "ACCOUNT" ? [{ method: "ACCOUNT", amountCents: total }] : [{ method: "EFT", amountCents: total, reference: o.paymentRef ?? undefined, provider: "Trade EFT" }];
  return postSaleTx(t, {
    id: a.saleId, number: a.invoiceNumber, storeId: o.storeId, channel: "WHOLESALE", shiftId: a.shiftId, staffId: a.staffId ?? null, deviceId: a.deviceId,
    customerId: null, tradeAccountId: o.tradeAccountId, quote, payments, pointsRedeemed: 0, redeemNow: false, extraCents, ageCheck: o.fulfilment === "COLLECT" ? "ID_SIGHTED" : "NONE",
    offline: false, createdAt: a.now, buyer: tradeBuyerBlock(o.account), collectedByHq: true, tradeOrderRef: o.number,
  });
}

// ── Reading ──────────────────────────────────────────────────────────────────

export const tradeOrderById = (id: string) => db.tradeOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });

/** Orders for HQ (all), a store (its own, by `storeId`) or the portal (`accountId`): by status, newest first, paginated. */
export async function listTradeOrders(f: { accountId?: string | null; storeId?: string | null; status?: TradeOrderStatus | "OPEN" | "ALL" | null; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(f.pageSize ?? 25)));
  const where: Prisma.TradeOrderWhereInput = {
    ...(f.accountId ? { tradeAccountId: f.accountId } : {}),
    ...(f.storeId ? { storeId: f.storeId } : {}),
    ...(f.status === "OPEN" ? { status: { in: ["PENDING_PAYMENT", "PLACED", "PICKING", "READY"] as TradeOrderStatus[] } } : f.status && f.status !== "ALL" ? { status: f.status } : {}),
  };
  const [total, rows] = await Promise.all([
    db.tradeOrder.count({ where }),
    db.tradeOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { account: { select: { id: true, number: true, name: true } }, store: { select: { id: true, code: true, name: true } }, _count: { select: { lines: true } } } }),
  ]);
  return { rows, total, page, pageSize };
}
