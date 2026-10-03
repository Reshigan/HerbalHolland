// Posting sales and refunds. One code path for POS and online orders so stock,
// loyalty, rollups and finance always agree.
import { randomUUID } from "node:crypto";
import { db, tx, type Tx } from "./db";
import { quote, type Quote } from "./pricing";
import { takeStock, putStock, allocationCost } from "./inventory";
import { madeToOrder } from "./merch";
import { bumpStoreStat, bumpVariantStats, paymentColumn, type StoreStatDelta } from "./rollups";
import { recordPurchase, redeemPoints, addPoints } from "./loyalty";
import { getSettings } from "./settings";
import { audit, type Actor } from "./audit";
import { shortCode } from "./counters";
import { queueSaleInvoice } from "./invoices";
import { redeemOffers } from "./offers";
import { dropBlocks } from "./drops";
import { checkTradeBasket, evaluateBasket } from "./compliance";
import { redeemVoucherTx, restoreVoucherTx, VoucherError } from "./shop/vouchers";
import { creditCheckFor, postLedgerEntry } from "./trade/ledger";
import { addDays, dayKey, fmtDate } from "@/lib/format";
import { vatOf, zar } from "@/lib/money";
import { ACCOUNT_STATUS_PROBLEM, tradeBuyerBlock } from "@/lib/trade";
import { allocateRefundAcross, normaliseVoucherCode, voucherProblem } from "@/lib/vouchers";
import type { Allocation } from "@/lib/fefo";
import type { AgeCheck, GiftVoucher, PayMethod } from "@/generated/prisma/client";

export class SaleError extends Error {}

/**
 * A tender on a sale. VOUCHER is a gift voucher: `reference` is its code, and posting the sale redeems it (online only).
 * ACCOUNT is a trade account's credit terms (trade sales only): invoiced on the account's ledger, never money now.
 */
export type TenderInput = {
  method: "CARD" | "CASH" | "PAYSHAP" | "EFT" | "VOUCHER" | "ACCOUNT";
  amountCents: number;
  tenderedCents?: number;
  changeCents?: number;
  provider?: string;
  reference?: string;
  cardBrand?: string;
  cardLast4?: string;
};
type PaymentRow = Omit<TenderInput, "method"> & { method: PayMethod };

type PostArgs = {
  id: string;
  number: string;
  storeId: string;
  channel: "POS" | "ONLINE" | "WHOLESALE";
  orderId?: string;
  shiftId?: string | null;
  staffId?: string | null;
  deviceId?: string | null;
  customerId?: string | null;
  /** WHOLESALE: the trade account that bought (the buyer block carries its legal name, address and VAT number). */
  tradeAccountId?: string | null;
  quote: {
    lines: { variantId: string; qty: number; unitPriceCents: number; discountCents: number; totalCents: number; vatCents: number; noEarn?: boolean; memberSavingsCents?: number; offerCents?: number }[];
    offerIds?: string[]; // My Deals to mark redeemed (online orders redeem at placement)
  } & Pick<Quote, "subtotalCents" | "discountCents" | "totalCents" | "vatCents" | "pointsMultiplier" | "promotionId">;
  buyer?: { name: string; address: string; vatNumber?: string } | null;
  promoCode?: string | null;
  payments: PaymentRow[];
  pointsRedeemed: number;
  redeemNow: boolean; // online orders redeem at checkout
  extraCents?: number; // delivery fee (VAT incl.) — or a trade order's courier / click & collect handling fee
  ageCheck: AgeCheck;
  offline: boolean;
  createdAt: Date;
  campaignId?: string | null;
  /**
   * The money for this sale was collected by HQ (an online trade order: EFT to HQ's account, or HQ's trade ledger on
   * ACCOUNT) and is settled to the store on its statement — so its EFT and ACCOUNT tenders roll up under
   * `onlineCents`, the HQ-collected column, exactly as gift vouchers do. Till trade sales keep their real columns.
   */
  collectedByHq?: boolean;
  tradeOrderRef?: string | null; // the TO-… number, kept on the sale's note
};

export async function postSaleTx(t: Tx, a: PostArgs) {
  const settings = await getSettings();
  const vendor = !!(await t.store.findUniqueOrThrow({ where: { id: a.storeId }, select: { company: { select: { vatNumber: true } } } })).company.vatNumber;
  const extra = a.extraCents ?? 0;
  const total = a.quote.totalCents + extra;
  // Non-VAT-vendor franchisees (below the R2.3m threshold) charge no VAT.
  const lineVat = (cents: number, v: number) => (vendor ? v : 0);
  const vat = vendor ? a.quote.lines.reduce((s, l) => s + l.vatCents, 0) + vatOf(extra) : 0;
  const memberSavings = a.customerId ? a.quote.lines.reduce((s, l) => s + (l.memberSavingsCents ?? 0), 0) : 0;
  const offers = a.customerId ? a.quote.lines.reduce((s, l) => s + (l.offerCents ?? 0), 0) : 0;
  const campaignId =
    a.campaignId ??
    (a.quote.promotionId
      ? (await t.campaign.findFirst({ where: { promotionId: a.quote.promotionId, status: "SENT" }, orderBy: { sentAt: "desc" }, select: { id: true } }))?.id
      : null);

  const sale = await t.sale.create({
    data: {
      id: a.id, number: a.number, storeId: a.storeId, channel: a.channel, orderId: a.orderId, shiftId: a.shiftId,
      staffId: a.staffId, deviceId: a.deviceId, customerId: a.customerId, tradeAccountId: a.tradeAccountId ?? null,
      subtotalCents: a.quote.subtotalCents + extra, discountCents: a.quote.discountCents, totalCents: total, vatCents: vat, memberSavingsCents: memberSavings,
      costCents: 0, promoCode: a.promoCode, promotionId: a.quote.promotionId, campaignId, ageCheck: a.ageCheck,
      buyer: a.buyer ?? undefined, offline: a.offline, createdAt: a.createdAt, note: a.tradeOrderRef ? `Trade order ${a.tradeOrderRef}` : undefined,
    },
  });

  let cost = 0, units = 0;
  const vstats: { variantId: string; units: number; netCents: number; costCents: number }[] = [];
  const made = await madeToOrder(a.quote.lines.map((l) => l.variantId), t); // no stock: costed at the partner's price
  for (const l of a.quote.lines) {
    const allocations = made.has(l.variantId)
      ? []
      : await takeStock(t, {
          storeId: a.storeId, variantId: l.variantId, qty: l.qty, type: a.channel === "ONLINE" ? "ONLINE" : "SALE",
          saleId: sale.id, orderId: a.orderId, userId: a.staffId, allowNegative: true,
        });
    const c = made.has(l.variantId) ? made.get(l.variantId)! * l.qty : allocationCost(allocations);
    cost += c;
    units += l.qty;
    await t.saleLine.create({
      data: {
        saleId: sale.id, variantId: l.variantId, qty: l.qty, unitPriceCents: l.unitPriceCents, discountCents: l.discountCents,
        memberSavingsCents: a.customerId ? (l.memberSavingsCents ?? 0) : 0, offerCents: a.customerId ? (l.offerCents ?? 0) : 0, totalCents: l.totalCents, vatCents: lineVat(l.totalCents, l.vatCents), costCents: c, allocations,
      },
    });
    vstats.push({ variantId: l.variantId, units: l.qty, netCents: l.totalCents - lineVat(l.totalCents, l.vatCents), costCents: c });
  }

  const payments: PaymentRow[] = [...a.payments];
  if (a.pointsRedeemed > 0) payments.push({ method: "LOYALTY", amountCents: a.pointsRedeemed * 100 });
  if (payments.length) await t.payment.createMany({ data: payments.map((p) => ({ saleId: sale.id, ...p })) });

  let pointsEarned = 0;
  if (a.customerId) {
    if (a.quote.offerIds?.length) await redeemOffers(t, a.quote.offerIds, { saleId: sale.id });
    if (a.redeemNow && a.pointsRedeemed > 0) await redeemPoints(t, { customerId: a.customerId, points: a.pointsRedeemed, storeId: a.storeId, saleId: sale.id });
    const noEarn = a.quote.lines.filter((l) => l.noEarn).reduce((s, l) => s + l.totalCents, 0);
    const r = await recordPurchase(t, {
      customerId: a.customerId, storeId: a.storeId, paidCents: Math.max(0, total - a.pointsRedeemed * 100 - noEarn), totalCents: total,
      multiplier: a.quote.pointsMultiplier, saleId: sale.id, orderId: a.orderId, at: a.createdAt,
      earnPer100: settings.loyalty.earnPer100, referralBonus: settings.loyalty.referralBonus,
    });
    pointsEarned = r.points;
  }
  await t.sale.update({ where: { id: sale.id }, data: { costCents: cost, pointsEarned } });

  const date = dayKey(a.createdAt);
  const delta: StoreStatDelta = {
    storeId: a.storeId, date, channel: a.channel, sales: 1, units, grossCents: total, vatCents: vat, costCents: cost,
    discountCents: a.quote.discountCents, memberSavingsCents: memberSavings, offerCents: offers, members: a.customerId ? 1 : 0, pointsIssued: pointsEarned,
  };
  for (const p of payments) {
    const col = (a.collectedByHq && (p.method === "EFT" || p.method === "ACCOUNT") ? "onlineCents" : paymentColumn(p.method)) as "cardCents";
    delta[col] = (delta[col] ?? 0) + p.amountCents;
  }
  await bumpStoreStat(t, delta);
  await bumpVariantStats(t, a.storeId, date, vstats);
  return { ...sale, costCents: cost, pointsEarned };
}

// ── Gift vouchers as a tender ─────────────────────────────────────────────────

export type VoucherTender = { code: string; cents: number; voucher: GiftVoucher };

/**
 * The gift vouchers among a sale's tenders, checked before anything is posted: each code must be on record, active,
 * unexpired and hold at least what it is tendered for (the same code tendered twice counts once). The failure names
 * the voucher and the shortfall so the operator can lower the amount or add another tender.
 */
export async function checkVoucherTenders(payments: { method: string; amountCents: number; reference?: string | null }[], now = new Date()): Promise<VoucherTender[]> {
  const cents = new Map<string, number>();
  for (const p of payments) {
    if (p.method !== "VOUCHER") continue;
    const code = normaliseVoucherCode(p.reference ?? "");
    if (!code) throw new SaleError("A gift voucher tender needs the voucher code (HH-XXXX-XXXX-XXXX)");
    cents.set(code, (cents.get(code) ?? 0) + p.amountCents);
  }
  const out: VoucherTender[] = [];
  for (const [code, amount] of cents) {
    const voucher = await db.giftVoucher.findUnique({ where: { code } });
    const problem = voucherProblem(voucher, now, fmtDate);
    if (problem || !voucher) throw new SaleError(`Gift voucher ${code}: ${problem ?? "can't pay right now"}`);
    if (amount > voucher.balanceCents)
      throw new SaleError(`Gift voucher ${code} has ${zar(voucher.balanceCents)} left, ${zar(amount - voucher.balanceCents)} short of the ${zar(amount)} tendered — lower the voucher amount or add another tender`);
    out.push({ code, cents: amount, voucher });
  }
  return out;
}

/** Voucher tenders as posted: the code in its canonical form (the refund looks the voucher up by it), no provider. */
export const normaliseVoucherTenders = <T extends { method: string; reference?: string | null; provider?: string | null }>(payments: T[]): T[] =>
  payments.map((p) => (p.method === "VOUCHER" ? { ...p, reference: normaliseVoucherCode(p.reference ?? "") ?? p.reference, provider: undefined } : p));

/** Redeems checked voucher tenders inside the sale's transaction; a balance that moved meanwhile stops the sale. */
export async function redeemVoucherTendersTx(t: Tx, vouchers: VoucherTender[], a: { saleId: string; orderId?: string | null; storeId: string; actor: Actor }) {
  for (const v of vouchers) {
    try {
      await redeemVoucherTx(t, { voucher: v.voucher, cents: v.cents, actor: a.actor, saleId: a.saleId, orderId: a.orderId ?? null, storeId: a.storeId });
    } catch (e) {
      if (e instanceof VoucherError) throw new SaleError(e.message);
      throw e;
    }
  }
}

// ── POS ──────────────────────────────────────────────────────────────────────

export type PosSaleInput = {
  id: string;
  number: string;
  seq?: number;
  createdAt?: string;
  offline?: boolean;
  shiftId?: string | null;
  customerId?: string | null;
  memberNo?: string | null; // a member the till took from their card while offline
  lines: { variantId: string; qty: number; unitPriceCents?: number }[];
  promoCode?: string | null;
  pointsRedeemed?: number;
  payments: TenderInput[];
  ageCheck?: AgeCheck;
  campaignId?: string | null;
  buyer?: { name: string; address: string; vatNumber?: string } | null;
  invoiceEmail?: string | null; // another address for the tax invoice
  /**
   * Trade-sale mode: the sale is for a trade account — WHOLESALE channel, ex-VAT trade prices with VAT per line, the
   * account's buyer block on the full tax invoice, an ACCOUNT tender allowed within its credit terms. No member, no
   * points, no My Deals, no vouchers, never offline.
   */
  trade?: { tradeAccountId: string } | null;
};

/** SARS: supplies above R5,000 need a full tax invoice (recipient name and address). */
export const FULL_TAX_INVOICE_OVER_CENTS = 500_000;

export async function postPosSale(input: PosSaleInput, ctx: { storeId: string; deviceId: string; staffId: string; staffName: string }) {
  const existing = await db.sale.findUnique({ where: { id: input.id } });
  if (existing) return { sale: existing, duplicate: true };
  if (input.trade) return postTradeSale(input, ctx);

  const offline = !!input.offline;
  if (input.payments.some((p) => p.method === "ACCOUNT")) throw new SaleError("On account is for trade sales only: choose the trade account first");
  if (!input.customerId && input.memberNo)
    input = { ...input, customerId: (await db.customer.findUnique({ where: { memberNo: input.memberNo.toUpperCase() }, select: { id: true } }))?.id ?? null };
  const q = await quote({
    storeId: ctx.storeId, channel: "POS", items: input.lines, code: input.promoCode, customerId: input.customerId, trustClientPrices: offline,
  });
  if (!q.lines.length) throw new SaleError("The sale has no items");
  if (q.codeError && !offline) throw new SaleError(q.codeError);
  // Drop limits are checked at the till before payment. If a card/PayShap payment already went through (a race with
  // an online order), post the sale and flag it for HQ rather than leave the customer charged without a sale.
  const dropped = offline ? [] : await dropBlocks(input.customerId, q.lines);
  const charged = input.payments.some((p) => p.method !== "CASH" && p.method !== "VOUCHER" && !!p.reference);
  if (dropped.length && !charged) throw new SaleError(dropped[0]);
  // A gift voucher is redeemed on the server when the sale posts, so it needs the connection: a sale queued offline can
  // never carry one (the till refuses it too). The operator re-tenders that sale with another payment.
  if (offline && input.payments.some((p) => p.method === "VOUCHER"))
    throw new SaleError("Gift vouchers can't be taken on an offline sale — this queued sale needs another tender: ring it up again and discard this one");
  const vouchers = await checkVoucherTenders(input.payments, createdAtOf(input));
  const tenders = normaliseVoucherTenders(input.payments);

  const [store, staff] = await Promise.all([
    db.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { licences: true } }),
    db.user.findUniqueOrThrow({ where: { id: ctx.staffId }, select: { canDispense: true } }),
  ]);
  const comp = await evaluateBasket({
    items: q.lines.map((l) => ({ name: l.name, regClass: l.regClass, grams: l.grams, qty: l.qty, tobaccoRelated: l.tobaccoRelated })),
    channel: "POS",
    customerId: input.customerId,
    storeLicences: store.licences,
    ageCheckedAtCounter: input.ageCheck === "ID_SIGHTED" || input.ageCheck === "ID_NUMBER",
    staffCanDispense: staff.canDispense,
  });
  const customer = comp.ctx.record;
  const points = Math.max(0, Math.floor(input.pointsRedeemed ?? 0));
  if (points && !customer) throw new SaleError("Attach a member to redeem points");
  if (customer && points > customer.points && !offline) throw new SaleError(`Only ${customer.points} points available`);
  if (!comp.ok && !offline) throw new SaleError(comp.blocks[0]);
  if (q.totalCents > FULL_TAX_INVOICE_OVER_CENTS && !input.buyer?.name && !offline)
    throw new SaleError("Over R5,000: capture the buyer's name and address for a full tax invoice");

  const paid = input.payments.reduce((s, p) => s + p.amountCents, 0) + points * 100;
  if (paid !== q.totalCents && !offline) throw new SaleError(`Payments (${zar(paid)}) don't match the total (${zar(q.totalCents)})`);

  const actor: Actor = { type: "USER", id: ctx.staffId, name: ctx.staffName };
  const createdAt = createdAtOf(input);

  const result = await tx(async (t) => {
    const taken = await t.sale.findUnique({ where: { number: input.number }, select: { id: true } });
    const number = taken ? `${input.number}-${shortCode(3)}` : input.number;
    const sale = await postSaleTx(t, {
      id: input.id, number, storeId: ctx.storeId, channel: "POS", shiftId: input.shiftId, staffId: ctx.staffId,
      deviceId: ctx.deviceId, customerId: customer?.id, quote: q, promoCode: input.promoCode, payments: tenders,
      pointsRedeemed: points, redeemNow: true, ageCheck: input.ageCheck ?? (customer?.ageVerifiedAt ? "VERIFIED" : "NONE"),
      offline, createdAt, campaignId: input.campaignId, buyer: input.buyer,
    });
    await redeemVoucherTendersTx(t, vouchers, { saleId: sale.id, storeId: ctx.storeId, actor });
    if (input.seq) await t.device.updateMany({ where: { id: ctx.deviceId, seq: { lt: input.seq } }, data: { seq: input.seq } });
    if (!comp.ok) await audit(t, actor, "compliance.offline_exception", { storeId: ctx.storeId, entity: "Sale", entityId: sale.id, data: { blocks: comp.blocks } });
    if (paid !== q.totalCents) await audit(t, actor, "sale.tender_variance", { storeId: ctx.storeId, entity: "Sale", entityId: sale.id, data: { paid, total: q.totalCents } });
    if (dropped.length) await audit(t, actor, "drop.limit_after_payment", { storeId: ctx.storeId, entity: "Sale", entityId: sale.id, data: { blocks: dropped } });
    return { sale, duplicate: false };
  });
  const to = input.invoiceEmail?.trim() || customer?.email;
  if (to) queueSaleInvoice(result.sale.id, to);
  return result;
}

// ── Trade sales at the till ──────────────────────────────────────────────────

/**
 * A trade sale rung up at any till (a retail store or the DC): priced with the WHOLESALE quote for the account (ex VAT,
 * VAT per line; the till's store's licences apply), checked with the trade basket rule (classes allowed, THC never —
 * no member or age-gate rules), paid in money as usual and/or on ACCOUNT when the credit decision allows (that part
 * is invoiced on the account's ledger, due after its payment days). Posts the Sale in channel WHOLESALE with the
 * account's buyer block, earns and redeems nothing, refuses gift vouchers (consumer money) and queued offline sales,
 * and emails the tax invoice to the account's billing address.
 */
async function postTradeSale(input: PosSaleInput, ctx: { storeId: string; deviceId: string; staffId: string; staffName: string }) {
  if (input.offline) throw new SaleError("Trade sales need a connection — this queued trade sale can't be posted: ring it up again online and discard this one");
  if (input.payments.some((p) => p.method === "VOUCHER")) throw new SaleError("Gift vouchers can't pay for a trade sale — vouchers are consumer money");
  if ((input.pointsRedeemed ?? 0) > 0) throw new SaleError("Points can't be redeemed on a trade sale");
  if (input.customerId || input.memberNo) throw new SaleError("A trade sale is for the trade account, not a Rewards member — remove the member first");
  const account = await db.tradeAccount.findUnique({ where: { id: input.trade!.tradeAccountId } });
  if (!account) throw new SaleError("Unknown trade account");
  if (account.status !== "APPROVED" && account.status !== "ON_HOLD") throw new SaleError(ACCOUNT_STATUS_PROBLEM[account.status as keyof typeof ACCOUNT_STATUS_PROBLEM]);
  const q = await quote({ storeId: ctx.storeId, channel: "WHOLESALE", items: input.lines, code: input.promoCode, tradeAccountId: account.id });
  if (!q.lines.length) throw new SaleError("The sale has no items");
  if (q.codeError) throw new SaleError(q.codeError);
  const store = await db.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { code: true, licences: true } });
  const comp = await checkTradeBasket({ items: q.lines.map((l) => ({ name: l.name, regClass: l.regClass })), accountClasses: account.classes, storeLicences: store.licences });
  if (!comp.ok) throw new SaleError(comp.blocks[0]);

  const paid = input.payments.reduce((s, p) => s + p.amountCents, 0);
  if (paid !== q.totalCents) throw new SaleError(`Payments (${zar(paid)}) don't match the total (${zar(q.totalCents)})`);
  const onAccount = input.payments.filter((p) => p.method === "ACCOUNT").reduce((s, p) => s + p.amountCents, 0);
  if (onAccount < 0) throw new SaleError("The on-account part can't be negative");
  if (onAccount > 0) {
    const d = await creditCheckFor(account, onAccount);
    if (!d.ok) throw new SaleError(d.reason!);
  }

  const actor: Actor = { type: "USER", id: ctx.staffId, name: ctx.staffName };
  const createdAt = new Date();
  const result = await tx(async (t) => {
    const taken = await t.sale.findUnique({ where: { number: input.number }, select: { id: true } });
    const number = taken ? `${input.number}-${shortCode(3)}` : input.number;
    const sale = await postSaleTx(t, {
      id: input.id, number, storeId: ctx.storeId, channel: "WHOLESALE", shiftId: input.shiftId, staffId: ctx.staffId, deviceId: ctx.deviceId,
      customerId: null, tradeAccountId: account.id, quote: q, promoCode: input.promoCode, payments: input.payments, pointsRedeemed: 0, redeemNow: true,
      ageCheck: input.ageCheck ?? "NONE", offline: false, createdAt, campaignId: input.campaignId, buyer: tradeBuyerBlock(account),
    });
    if (onAccount > 0)
      await postLedgerEntry(t, { accountId: account.id, kind: "INVOICE", cents: onAccount, reference: sale.number, saleId: sale.id, dueAt: addDays(createdAt, account.paymentDays), note: `Till sale ${sale.number} at ${store.code}`, createdAt, actor });
    if (input.seq) await t.device.updateMany({ where: { id: ctx.deviceId, seq: { lt: input.seq } }, data: { seq: input.seq } });
    await audit(t, actor, "trade.sale", { storeId: ctx.storeId, entity: "Sale", entityId: sale.id, data: { account: account.number, total: q.totalCents, onAccount } });
    return { sale, duplicate: false };
  });
  queueSaleInvoice(result.sale.id, input.invoiceEmail?.trim() || account.email);
  return result;
}

// ── Refunds (a refund is a negative sale, so every report nets naturally) ─────

type LineAlloc = Allocation & { lineId?: string };

type PaymentLike = { method: PayMethod; amountCents: number; reference: string | null };

/**
 * What each gift voucher paid on a sale and what refunds of it have already put back, in tender order: the
 * VOUCHER payment rows on the sale (positive) and on its refunds (negative), by voucher code.
 */
export function voucherPartsOf(sale: { payments: PaymentLike[]; refunds: { payments: PaymentLike[] }[] }) {
  const parts = new Map<string, { code: string; paidCents: number; refundedCents: number }>();
  for (const p of sale.payments) {
    if (p.method !== "VOUCHER" || !p.reference) continue;
    const part = parts.get(p.reference) ?? { code: p.reference, paidCents: 0, refundedCents: 0 };
    part.paidCents += Math.max(0, p.amountCents);
    parts.set(p.reference, part);
  }
  for (const r of sale.refunds)
    for (const p of r.payments) {
      const part = p.method === "VOUCHER" && p.reference ? parts.get(p.reference) : undefined;
      if (part) part.refundedCents += Math.max(0, -p.amountCents);
    }
  return [...parts.values()];
}

export async function refundSale(a: {
  id: string;
  number: string;
  saleId: string;
  lines: { saleLineId: string; qty: number; restock: boolean }[];
  /** Where the money part goes. ONLINE: back through the shop's payment gateway (a return). The voucher part never
   *  goes here: it returns to the gift voucher(s) that paid, first (lib/vouchers.allocateRefund). On a trade sale the
   *  part that was on account comes back as a credit note on the account's ledger first (never as money). */
  method: Exclude<TenderInput["method"], "VOUCHER" | "ACCOUNT"> | "ONLINE";
  extraCents?: number; // a delivery fee refunded with the lines (VAT incl.), when a whole online order comes back
  reason: string;
  staffId: string;
  staffName: string;
  deviceId?: string | null;
  shiftId?: string | null;
}) {
  const dup = await db.sale.findUnique({ where: { id: a.id } });
  if (dup) return dup;
  const orig = await db.sale.findUniqueOrThrow({
    where: { id: a.saleId },
    include: { lines: true, payments: true, refunds: { include: { lines: true, payments: true } } },
  });
  if (orig.kind !== "SALE") throw new SaleError("Only sales can be refunded");

  const refunded = new Map<string, number>();
  for (const r of orig.refunds)
    for (const l of r.lines) {
      const src = (l.allocations as LineAlloc[])[0]?.lineId;
      if (src) refunded.set(src, (refunded.get(src) ?? 0) - l.qty);
    }

  const picks = a.lines
    .filter((x) => x.qty > 0)
    .map((x) => {
      const line = orig.lines.find((l) => l.id === x.saleLineId);
      if (!line) throw new SaleError("Unknown sale line");
      const left = line.qty - (refunded.get(line.id) ?? 0);
      if (x.qty > left) throw new SaleError(`Only ${left} left to refund on that line`);
      const share = x.qty / line.qty;
      return { x, line, amount: Math.round(line.totalCents * share), vat: Math.round(line.vatCents * share), saved: Math.round(line.memberSavingsCents * share), offer: Math.round(line.offerCents * share) };
    });
  if (!picks.length) throw new SaleError("Choose at least one item to refund");

  const amount = picks.reduce((s, p) => s + p.amount, 0);
  const vat = picks.reduce((s, p) => s + p.vat, 0);
  const saved = picks.reduce((s, p) => s + p.saved, 0);
  const offer = picks.reduce((s, p) => s + p.offer, 0);
  const loyaltyPaid = orig.payments.filter((p) => p.method === "LOYALTY").reduce((s, p) => s + p.amountCents, 0);
  const loyaltyBack = orig.totalCents > 0 ? Math.floor((amount * loyaltyPaid) / orig.totalCents / 100) * 100 : 0;
  const extra = Math.max(0, Math.min(a.extraCents ?? 0, Math.max(0, orig.totalCents - orig.subtotalCents + orig.discountCents)));
  const extraVat = orig.vatCents > 0 ? vatOf(extra) : 0; // non-VAT-vendor stores charged none
  const moneyBack = amount - loyaltyBack + extra;
  const earnedBack = orig.totalCents > 0 ? Math.round((orig.pointsEarned * amount) / orig.totalCents) : 0;
  // Gift vouchers that paid on the sale take the refund first, up to what each paid less what earlier refunds put back.
  const split = allocateRefundAcross(moneyBack, voucherPartsOf(orig));
  // Trade sales: what was on account comes back onto the account (a credit note), before any money moves.
  const accountPaid = orig.tradeAccountId ? orig.payments.filter((p) => p.method === "ACCOUNT").reduce((s, p) => s + Math.max(0, p.amountCents), 0) : 0;
  const accountBack = orig.refunds.flatMap((r) => r.payments).filter((p) => p.method === "ACCOUNT").reduce((s, p) => s + Math.max(0, -p.amountCents), 0);
  const toAccount = Math.min(split.toTender, Math.max(0, accountPaid - accountBack));
  const toTender = split.toTender - toAccount;

  return tx(async (t) => {
    const refund = await t.sale.create({
      data: {
        id: a.id, number: a.number, kind: "REFUND", refundOfId: orig.id, channel: orig.channel, storeId: orig.storeId,
        shiftId: a.shiftId, staffId: a.staffId, deviceId: a.deviceId, customerId: orig.customerId, tradeAccountId: orig.tradeAccountId,
        subtotalCents: -amount, discountCents: 0, totalCents: -(amount + extra), vatCents: -(vat + extraVat), costCents: 0, memberSavingsCents: -saved,
        pointsEarned: -earnedBack, note: a.reason, buyer: orig.buyer ?? undefined,
      },
    });
    let cost = 0, units = 0;
    const vstats: { variantId: string; units: number; netCents: number; costCents: number }[] = [];
    for (const p of picks) {
      // Return units to the same batches they were sold from.
      let need = p.x.qty;
      const back: LineAlloc[] = [];
      for (const al of p.line.allocations as LineAlloc[]) {
        if (need <= 0) break;
        const q = Math.min(need, al.qty);
        back.push({ batchId: al.batchId, qty: q, unitCostCents: al.unitCostCents, lineId: p.line.id });
        need -= q;
      }
      const lineCost = allocationCost(back);
      if (p.x.restock)
        for (const b of back)
          await putStock(t, { storeId: orig.storeId, variantId: p.line.variantId, batchId: b.batchId, qty: b.qty, unitCostCents: b.unitCostCents, type: "REFUND", saleId: refund.id, userId: a.staffId });
      const c = p.x.restock ? lineCost : 0; // unrestocked returns stay a cost of the original sale
      cost += c;
      units += p.x.qty;
      await t.saleLine.create({
        data: {
          saleId: refund.id, variantId: p.line.variantId, qty: -p.x.qty, unitPriceCents: p.line.unitPriceCents, memberSavingsCents: -p.saved, offerCents: -p.offer,
          totalCents: -p.amount, vatCents: -p.vat, costCents: -c, allocations: back.length ? back : [{ batchId: "", qty: 0, unitCostCents: 0, lineId: p.line.id }],
        },
      });
      vstats.push({ variantId: p.line.variantId, units: -p.x.qty, netCents: -(p.amount - p.vat), costCents: -c });
    }
    const payments: PaymentRow[] = [];
    for (const v of split.parts) payments.push({ method: "VOUCHER", amountCents: -v.cents, reference: v.code });
    if (toAccount) payments.push({ method: "ACCOUNT", amountCents: -toAccount, reference: refund.number });
    if (toTender) payments.push({ method: a.method, amountCents: -toTender });
    if (loyaltyBack) payments.push({ method: "LOYALTY", amountCents: -loyaltyBack });
    await t.payment.createMany({ data: payments.map((p) => ({ saleId: refund.id, ...p })) });
    await t.sale.update({ where: { id: refund.id }, data: { costCents: -cost } });
    // The credit note (numbered as the refund sale) credits the original sale's invoice: saleId names what it settles.
    if (toAccount && orig.tradeAccountId)
      await postLedgerEntry(t, { accountId: orig.tradeAccountId, kind: "CREDIT_NOTE", cents: -toAccount, reference: refund.number, saleId: orig.id, note: `Credit note ${refund.number} for ${orig.number}`, actor: { type: "USER", id: a.staffId, name: a.staffName } });
    for (const v of split.parts) {
      try {
        await restoreVoucherTx(t, { code: v.code, cents: v.cents, actor: { type: "USER", id: a.staffId, name: a.staffName }, saleId: refund.id, orderId: orig.orderId, storeId: orig.storeId });
      } catch (e) {
        if (e instanceof VoucherError) throw new SaleError(e.message);
        throw e;
      }
    }

    if (orig.customerId) {
      if (loyaltyBack) await addPoints(t, { customerId: orig.customerId, points: loyaltyBack / 100, kind: "REVERSAL", storeId: orig.storeId, saleId: refund.id, note: "points returned on refund" });
      if (earnedBack) await addPoints(t, { customerId: orig.customerId, points: -earnedBack, kind: "REVERSAL", storeId: orig.storeId, saleId: refund.id, note: "points reversed on refund" });
      await t.customer.update({ where: { id: orig.customerId }, data: { lifetimeCents: { decrement: amount } } });
    }

    const date = dayKey(new Date());
    const delta: StoreStatDelta = {
      storeId: orig.storeId, date, channel: orig.channel, refunds: 1, units: -units, grossCents: -(amount + extra), vatCents: -(vat + extraVat),
      costCents: -cost, memberSavingsCents: -saved, offerCents: -offer, pointsIssued: -earnedBack,
    };
    for (const p of payments) {
      const col = paymentColumn(p.method) as "cardCents";
      delta[col] = (delta[col] ?? 0) + p.amountCents;
    }
    await bumpStoreStat(t, delta);
    await bumpVariantStats(t, orig.storeId, date, vstats);
    await audit(t, { type: "USER", id: a.staffId, name: a.staffName }, "sale.refund", {
      storeId: orig.storeId, entity: "Sale", entityId: refund.id,
      data: { of: orig.number, amount, reason: a.reason, ...(split.parts.length && { toVouchers: split.parts.map((v) => ({ code: v.code, cents: v.cents })), toTender }), ...(toAccount && { creditNote: toAccount }) },
    });
    return refund;
  }).then((refund) => {
    const to = orig.invoiceEmail ?? null;
    if (to) queueSaleInvoice(refund.id, to);
    return refund;
  });
}

const createdAtOf = (input: Pick<PosSaleInput, "offline" | "createdAt">) => (input.offline && input.createdAt ? new Date(input.createdAt) : new Date());

export const newSaleId = () => randomUUID();
