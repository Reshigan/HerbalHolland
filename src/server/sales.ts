// Posting sales and refunds. One code path for POS and online orders so stock,
// loyalty, rollups and finance always agree.
import { randomUUID } from "node:crypto";
import { db, tx, type Tx } from "./db";
import { quote, type Quote } from "./pricing";
import { takeStock, putStock, allocationCost } from "./inventory";
import { bumpStoreStat, bumpVariantStats, paymentColumn, type StoreStatDelta } from "./rollups";
import { recordPurchase, redeemPoints, addPoints } from "./loyalty";
import { getSettings } from "./settings";
import { audit, type Actor } from "./audit";
import { shortCode } from "./counters";
import { queueSaleInvoice } from "./invoices";
import { evaluateBasket } from "./compliance";
import { dayKey } from "@/lib/format";
import { vatOf, zar } from "@/lib/money";
import type { Allocation } from "@/lib/fefo";
import type { AgeCheck, PayMethod } from "@/generated/prisma/client";

export class SaleError extends Error {}

export type TenderInput = {
  method: "CARD" | "CASH" | "PAYSHAP" | "EFT";
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
  channel: "POS" | "ONLINE";
  orderId?: string;
  shiftId?: string | null;
  staffId?: string | null;
  deviceId?: string | null;
  customerId?: string | null;
  quote: {
    lines: { variantId: string; qty: number; unitPriceCents: number; discountCents: number; totalCents: number; vatCents: number; noEarn?: boolean; memberSavingsCents?: number }[];
  } & Pick<Quote, "subtotalCents" | "discountCents" | "totalCents" | "vatCents" | "pointsMultiplier" | "promotionId">;
  buyer?: { name: string; address: string; vatNumber?: string } | null;
  promoCode?: string | null;
  payments: PaymentRow[];
  pointsRedeemed: number;
  redeemNow: boolean; // online orders redeem at checkout
  extraCents?: number; // delivery fee (VAT incl.)
  ageCheck: AgeCheck;
  offline: boolean;
  createdAt: Date;
  campaignId?: string | null;
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
  const campaignId =
    a.campaignId ??
    (a.quote.promotionId
      ? (await t.campaign.findFirst({ where: { promotionId: a.quote.promotionId, status: "SENT" }, orderBy: { sentAt: "desc" }, select: { id: true } }))?.id
      : null);

  const sale = await t.sale.create({
    data: {
      id: a.id, number: a.number, storeId: a.storeId, channel: a.channel, orderId: a.orderId, shiftId: a.shiftId,
      staffId: a.staffId, deviceId: a.deviceId, customerId: a.customerId,
      subtotalCents: a.quote.subtotalCents + extra, discountCents: a.quote.discountCents, totalCents: total, vatCents: vat, memberSavingsCents: memberSavings,
      costCents: 0, promoCode: a.promoCode, promotionId: a.quote.promotionId, campaignId, ageCheck: a.ageCheck,
      buyer: a.buyer ?? undefined, offline: a.offline, createdAt: a.createdAt,
    },
  });

  let cost = 0, units = 0;
  const vstats: { variantId: string; units: number; netCents: number; costCents: number }[] = [];
  for (const l of a.quote.lines) {
    const allocations = await takeStock(t, {
      storeId: a.storeId, variantId: l.variantId, qty: l.qty, type: a.channel === "POS" ? "SALE" : "ONLINE",
      saleId: sale.id, orderId: a.orderId, userId: a.staffId, allowNegative: true,
    });
    const c = allocationCost(allocations);
    cost += c;
    units += l.qty;
    await t.saleLine.create({
      data: {
        saleId: sale.id, variantId: l.variantId, qty: l.qty, unitPriceCents: l.unitPriceCents, discountCents: l.discountCents,
        memberSavingsCents: a.customerId ? (l.memberSavingsCents ?? 0) : 0, totalCents: l.totalCents, vatCents: lineVat(l.totalCents, l.vatCents), costCents: c, allocations,
      },
    });
    vstats.push({ variantId: l.variantId, units: l.qty, netCents: l.totalCents - lineVat(l.totalCents, l.vatCents), costCents: c });
  }

  const payments: PaymentRow[] = [...a.payments];
  if (a.pointsRedeemed > 0) payments.push({ method: "LOYALTY", amountCents: a.pointsRedeemed * 100 });
  if (payments.length) await t.payment.createMany({ data: payments.map((p) => ({ saleId: sale.id, ...p })) });

  let pointsEarned = 0;
  if (a.customerId) {
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
    discountCents: a.quote.discountCents, memberSavingsCents: memberSavings, members: a.customerId ? 1 : 0, pointsIssued: pointsEarned,
  };
  for (const p of payments) {
    const col = paymentColumn(p.method) as "cardCents";
    delta[col] = (delta[col] ?? 0) + p.amountCents;
  }
  await bumpStoreStat(t, delta);
  await bumpVariantStats(t, a.storeId, date, vstats);
  return { ...sale, costCents: cost, pointsEarned };
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
  lines: { variantId: string; qty: number; unitPriceCents?: number }[];
  promoCode?: string | null;
  pointsRedeemed?: number;
  payments: TenderInput[];
  ageCheck?: AgeCheck;
  campaignId?: string | null;
  buyer?: { name: string; address: string; vatNumber?: string } | null;
  invoiceEmail?: string | null; // walk-in customers can still get their invoice by email
};

/** SARS: supplies above R5,000 need a full tax invoice (recipient name and address). */
export const FULL_TAX_INVOICE_OVER_CENTS = 500_000;

export async function postPosSale(input: PosSaleInput, ctx: { storeId: string; deviceId: string; staffId: string; staffName: string }) {
  const existing = await db.sale.findUnique({ where: { id: input.id } });
  if (existing) return { sale: existing, duplicate: true };

  const offline = !!input.offline;
  const q = await quote({
    storeId: ctx.storeId, channel: "POS", items: input.lines, code: input.promoCode, customerId: input.customerId, trustClientPrices: offline,
  });
  if (!q.lines.length) throw new SaleError("The sale has no items");
  if (q.codeError && !offline) throw new SaleError(q.codeError);

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
  const createdAt = offline && input.createdAt ? new Date(input.createdAt) : new Date();

  const result = await tx(async (t) => {
    const taken = await t.sale.findUnique({ where: { number: input.number }, select: { id: true } });
    const number = taken ? `${input.number}-${shortCode(3)}` : input.number;
    const sale = await postSaleTx(t, {
      id: input.id, number, storeId: ctx.storeId, channel: "POS", shiftId: input.shiftId, staffId: ctx.staffId,
      deviceId: ctx.deviceId, customerId: customer?.id, quote: q, promoCode: input.promoCode, payments: input.payments,
      pointsRedeemed: points, redeemNow: true, ageCheck: input.ageCheck ?? (customer?.ageVerifiedAt ? "VERIFIED" : "NONE"),
      offline, createdAt, campaignId: input.campaignId, buyer: input.buyer,
    });
    if (input.seq) await t.device.updateMany({ where: { id: ctx.deviceId, seq: { lt: input.seq } }, data: { seq: input.seq } });
    if (!comp.ok) await audit(t, actor, "compliance.offline_exception", { storeId: ctx.storeId, entity: "Sale", entityId: sale.id, data: { blocks: comp.blocks } });
    if (paid !== q.totalCents) await audit(t, actor, "sale.tender_variance", { storeId: ctx.storeId, entity: "Sale", entityId: sale.id, data: { paid, total: q.totalCents } });
    return { sale, duplicate: false };
  });
  const to = input.invoiceEmail?.trim() || customer?.email;
  if (to) queueSaleInvoice(result.sale.id, to);
  return result;
}

// ── Refunds (a refund is a negative sale, so every report nets naturally) ─────

type LineAlloc = Allocation & { lineId?: string };

export async function refundSale(a: {
  id: string;
  number: string;
  saleId: string;
  lines: { saleLineId: string; qty: number; restock: boolean }[];
  method: TenderInput["method"];
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
    include: { lines: true, payments: true, refunds: { include: { lines: true } } },
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
      return { x, line, amount: Math.round(line.totalCents * share), vat: Math.round(line.vatCents * share), saved: Math.round(line.memberSavingsCents * share) };
    });
  if (!picks.length) throw new SaleError("Choose at least one item to refund");

  const amount = picks.reduce((s, p) => s + p.amount, 0);
  const vat = picks.reduce((s, p) => s + p.vat, 0);
  const saved = picks.reduce((s, p) => s + p.saved, 0);
  const loyaltyPaid = orig.payments.filter((p) => p.method === "LOYALTY").reduce((s, p) => s + p.amountCents, 0);
  const loyaltyBack = orig.totalCents > 0 ? Math.floor((amount * loyaltyPaid) / orig.totalCents / 100) * 100 : 0;
  const moneyBack = amount - loyaltyBack;
  const earnedBack = orig.totalCents > 0 ? Math.round((orig.pointsEarned * amount) / orig.totalCents) : 0;

  return tx(async (t) => {
    const refund = await t.sale.create({
      data: {
        id: a.id, number: a.number, kind: "REFUND", refundOfId: orig.id, channel: orig.channel, storeId: orig.storeId,
        shiftId: a.shiftId, staffId: a.staffId, deviceId: a.deviceId, customerId: orig.customerId,
        subtotalCents: -amount, discountCents: 0, totalCents: -amount, vatCents: -vat, costCents: 0, memberSavingsCents: -saved,
        pointsEarned: -earnedBack, note: a.reason,
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
          saleId: refund.id, variantId: p.line.variantId, qty: -p.x.qty, unitPriceCents: p.line.unitPriceCents, memberSavingsCents: -p.saved,
          totalCents: -p.amount, vatCents: -p.vat, costCents: -c, allocations: back.length ? back : [{ batchId: "", qty: 0, unitCostCents: 0, lineId: p.line.id }],
        },
      });
      vstats.push({ variantId: p.line.variantId, units: -p.x.qty, netCents: -(p.amount - p.vat), costCents: -c });
    }
    const payments: PaymentRow[] = [];
    if (moneyBack) payments.push({ method: a.method, amountCents: -moneyBack });
    if (loyaltyBack) payments.push({ method: "LOYALTY", amountCents: -loyaltyBack });
    await t.payment.createMany({ data: payments.map((p) => ({ saleId: refund.id, ...p })) });
    await t.sale.update({ where: { id: refund.id }, data: { costCents: -cost } });

    if (orig.customerId) {
      if (loyaltyBack) await addPoints(t, { customerId: orig.customerId, points: loyaltyBack / 100, kind: "REVERSAL", storeId: orig.storeId, saleId: refund.id, note: "points returned on refund" });
      if (earnedBack) await addPoints(t, { customerId: orig.customerId, points: -earnedBack, kind: "REVERSAL", storeId: orig.storeId, saleId: refund.id, note: "points reversed on refund" });
      await t.customer.update({ where: { id: orig.customerId }, data: { lifetimeCents: { decrement: amount } } });
    }

    const date = dayKey(new Date());
    const delta: StoreStatDelta = {
      storeId: orig.storeId, date, channel: orig.channel, refunds: 1, units: -units, grossCents: -amount, vatCents: -vat,
      costCents: -cost, memberSavingsCents: -saved, pointsIssued: -earnedBack,
    };
    for (const p of payments) {
      const col = paymentColumn(p.method) as "cardCents";
      delta[col] = (delta[col] ?? 0) + p.amountCents;
    }
    await bumpStoreStat(t, delta);
    await bumpVariantStats(t, orig.storeId, date, vstats);
    await audit(t, { type: "USER", id: a.staffId, name: a.staffName }, "sale.refund", {
      storeId: orig.storeId, entity: "Sale", entityId: refund.id, data: { of: orig.number, amount, reason: a.reason },
    });
    return refund;
  }).then((refund) => {
    const to = orig.invoiceEmail ?? null;
    if (to) queueSaleInvoice(refund.id, to);
    return refund;
  });
}

export const newSaleId = () => randomUUID();
