// The trade (wholesale) channel end to end: apply → approve → order on account (reserved) → over the limit refused →
// ship short → WHOLESALE sale at the DC with trade VAT, the TI invoice and the ledger → payment → EFT order → confirm →
// ship → ledger nets to zero → cancel releases stock → click & collect at a store → till trade sales, refunds and
// refusals → sign-in codes → the daily jobs.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, tx } from "@/server/db";
import { putStock, availability, availKey } from "@/server/inventory";
import { quote, tradeRange } from "@/server/pricing";
import { postPosSale, refundSale } from "@/server/sales";
import { tradeBuyerForToken } from "@/server/auth";
import { sha256 } from "@/server/crypto";
import { applyForTradeAccount, approveTradeAccount, holdTradeAccount, releaseTradeHold, closeTradeAccount, addTradeBuyer, removeTradeBuyer, updateTradeAccount, tradeAccountSummary, listTradeAccounts, tradeAccountLookup } from "@/server/trade/accounts";
import { placeTradeOrder, confirmTradePayment, advanceTradeOrder, collectStoresFor, tradeOrderById, listTradeOrders, nextTradeActions } from "@/server/trade/orders";
import { recordTradePayment, issueCreditNote, adjustTradeLedger, tradeBalance, tradeAgeing, tradeStatementFor, emailTradeStatement } from "@/server/trade/ledger";
import { requestTradeCode, verifyTradeCode } from "@/server/trade/auth";
import { tradeEftExpiry, tradeOverdueHolds, tradeStatements } from "@/server/jobs";
import { saveSetting, DEFAULT_SETTINGS } from "@/server/settings";
import { dayKey } from "@/lib/format";
import { buildWorld, onHand, resetDb, type World } from "./world";

let w: World;
let accountId: string;
let buyerId: string;
const BUYER_EMAIL = "thandi@hatfield.example";
const BILLING = "accounts@hatfield.example";
const hq = { type: "USER" as const, id: "hq-1", name: "HQ Trade" };
const pos = () => ({ storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Mia Manager" });
let seq = 0;
const saleNumber = () => `TST01-A${String(++seq).padStart(5, "0")}`;
const avail = async (storeId: string, variantId: string) => (await availability([storeId], [variantId])).get(availKey(storeId, variantId)) ?? { onHand: 0, reserved: 0, available: 0 };
const mailsTo = (to: string) => db.messageLog.findMany({ where: { to }, orderBy: { createdAt: "desc" } });
const lastMailTo = async (to: string) => (await mailsTo(to))[0];
const stat = (storeId: string) => db.dailyStoreStat.findUnique({ where: { storeId_date_channel: { storeId, date: new Date(`${dayKey(new Date())}T00:00:00Z`), channel: "WHOLESALE" } } });

const application = {
  legalName: "Hatfield Pharmacy (Pty) Ltd", name: "Hatfield Pharmacy", kind: "PHARMACY", regNumber: "2015/123456/07", vatNumber: "4123456789", email: BILLING, phone: "012 342 1234",
  addressLine: "12 Burnett St", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083", classes: ["CBD", "CBD_FOOD"], buyerName: "Thandi Nkosi", buyerEmail: BUYER_EMAIL, buyerPhone: "082 555 0199", adult: "on", terms: "on",
};

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  // Case packs, a trade price list (ex VAT, with a 12+ break on the oil) and coffee stock at the DC.
  await db.variant.update({ where: { id: w.oilV.id }, data: { caseQty: 6 } });
  await db.variant.update({ where: { id: w.coffeeV.id }, data: { caseQty: 12 } });
  await db.priceList.create({ data: { name: "Trade 2026", kind: "TRADE", items: { create: [{ variantId: w.oilV.id, priceCents: 20_000, minQty: 1 }, { variantId: w.oilV.id, priceCents: 18_000, minQty: 12 }] } } });
  await tx((t) => putStock(t, { storeId: w.dc.id, variantId: w.coffeeV.id, batchId: w.coffeeNew.id, qty: 60, unitCostCents: 6_500, type: "RECEIVE" }));
  await saveSetting("trade", { ...DEFAULT_SETTINGS.trade, bank: { bank: "FNB", accountName: "Herbal Holland (Pty) Ltd", accountNumber: "62000000000", branchCode: "250655" } });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 800)); // fire-and-forget invoice emails
  await db.$disconnect();
});

describe("Accounts", () => {
  it("takes an application: a pending account with its owner buyer, two emails and an audit entry", async () => {
    const bad = await applyForTradeAccount({ ...application, classes: ["THC"], terms: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fields).sort()).toEqual(["classes", "terms"]);

    const r = await applyForTradeAccount(application, { source: "portal" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    accountId = r.account.id;
    buyerId = r.buyer.id;
    expect(r.account).toMatchObject({ number: "TA-000001", status: "PENDING", terms: "PREPAID", classes: ["CBD", "CBD_FOOD"], vatNumber: "4123456789", phone: "+27123421234", termsVersion: "trade-1" });
    expect(r.account.adultAttestedAt).toBeTruthy();
    expect(r.buyer).toMatchObject({ role: "OWNER", email: BUYER_EMAIL, phone: "+27825550199", active: true });
    expect((await lastMailTo(BUYER_EMAIL)).body).toMatch(/application TA-000001 received/);
    expect((await lastMailTo("franchise@herbalholland.com")).body).toMatch(/new application TA-000001/);
    expect(await db.auditLog.findFirst({ where: { action: "trade.apply", entityId: accountId } })).toBeTruthy();
    const dup = await applyForTradeAccount(application);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.fields.buyerEmail).toMatch(/already signs in/);
  });

  it("refuses orders and on-account sales until HQ approves", async () => {
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "EFT" })).rejects.toThrow(/hasn't been approved/);
    expect(await tradeAccountLookup("hatfield")).toEqual([]);
  });

  it("approves on account with a R10,000 limit, 30 days, and emails the terms", async () => {
    await expect(approveTradeAccount(accountId, { terms: "ACCOUNT", creditLimitCents: 1_000_000, paymentDays: 30, classes: ["CBD", "THC"] }, hq)).rejects.toThrow(/never traded/);
    const a = await approveTradeAccount(accountId, { terms: "ACCOUNT", creditLimitCents: 1_000_000, paymentDays: 30, classes: ["CBD", "CBD_FOOD"] }, hq);
    expect(a).toMatchObject({ status: "APPROVED", terms: "ACCOUNT", creditLimitCents: 1_000_000, approvedById: "hq-1" });
    expect((await lastMailTo(BILLING)).body).toMatch(/account TA-000001 approved[\s\S]*credit limit R10,000.00/);
    const hit = await tradeAccountLookup("TA 1");
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ number: "TA-000001", terms: "ACCOUNT", creditLimitCents: 1_000_000, balanceCents: 0, availableCents: 1_000_000 });
    expect((await listTradeAccounts({ q: "pharmacy" })).total).toBe(1);
  });

  it("lets the owner manage buyers and details, never the terms", async () => {
    const b = await addTradeBuyer(accountId, { name: "Sipho", email: "sipho@hatfield.example", role: "BUYER" }, { type: "CUSTOMER", id: buyerId, name: "Thandi" }, { byBuyerId: buyerId });
    expect(b.role).toBe("BUYER");
    await expect(removeTradeBuyer(buyerId, hq, { byBuyerId: buyerId })).rejects.toThrow(/at least one owner/);
    await expect(updateTradeAccount(accountId, { creditLimitCents: 5_000_000 }, hq, { byBuyerId: buyerId })).rejects.toThrow(/set by Herbal Holland Trade/);
    await expect(updateTradeAccount(accountId, { name: "Hatfield Pharmacy" }, hq, { byBuyerId: b.id })).rejects.toThrow(/owner/);
    const updated = await updateTradeAccount(accountId, { phone: "011 555 0000", deliveryLine: "Loading bay, 12 Burnett St", deliveryCity: "Pretoria", deliveryProvince: "GP", deliveryPostalCode: "0083" }, hq, { byBuyerId: buyerId });
    expect(updated.phone).toBe("+27115550000");
    expect(updated.deliveryLine).toBe("Loading bay, 12 Burnett St");
    await removeTradeBuyer(b.id, hq, { byBuyerId: buyerId });
    expect((await db.tradeBuyer.findUniqueOrThrow({ where: { id: b.id } })).active).toBe(false);
  });
});

describe("Trade pricing", () => {
  it("quotes ex VAT from the trade list with breaks, VAT per line, and ignores tiers, My Deals and consumer deals", async () => {
    await db.promotion.create({ data: { name: "10% off (shop)", kind: "PERCENT", value: 10, channels: ["POS", "ONLINE"], startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000) } });
    const q = await quote({ channel: "WHOLESALE", storeId: w.dc.id, tradeAccountId: accountId, customerId: w.walkIn.id, items: [{ variantId: w.oilV.id, qty: 12 }, { variantId: w.coffeeV.id, qty: 12 }, { variantId: w.flowerV.id, qty: 1 }] });
    const oil = q.lines.find((l) => l.variantId === w.oilV.id)!;
    const coffee = q.lines.find((l) => l.variantId === w.coffeeV.id)!;
    const flower = q.lines.find((l) => l.variantId === w.flowerV.id)!;
    expect(oil).toMatchObject({ unitPriceCents: 18_000, exCents: 216_000, vatCents: 32_400, totalCents: 248_400, discountCents: 0, priceRule: "Trade 2026 (12+)", caseQty: 6, noEarn: true, memberSavingsCents: 0, offerCents: 0 });
    expect(coffee).toMatchObject({ unitPriceCents: 11_000, exCents: 132_000, vatCents: 19_800, totalCents: 151_800, priceRule: "Trade price", caseQty: 12 });
    expect(flower).toMatchObject({ unitPriceCents: 0, totalCents: 0, priceRule: "Not available to trade" });
    expect(q.applied).toEqual([]);
    expect(q.offerIds).toEqual([]);
    expect(q).toMatchObject({ exCents: 348_000, vatCents: 52_200, totalCents: 400_200, subtotalCents: 400_200, discountCents: 0, memberSavingsCents: 0, joinSavingsCents: 0, pointsMultiplier: 1, tradeAccountId: accountId });
    expect((await quote({ channel: "WHOLESALE", items: [{ variantId: w.oilV.id, qty: 6 }] })).lines[0].unitPriceCents).toBe(20_000);
  });

  it("applies a promotion only when its channels include WHOLESALE, rounded to the cent per unit", async () => {
    const promo = await db.promotion.create({ data: { name: "Trade launch 10%", kind: "PERCENT", value: 10, channels: ["WHOLESALE"], productIds: [w.coffeeV.productId], startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000) } });
    const q = await quote({ channel: "WHOLESALE", tradeAccountId: accountId, items: [{ variantId: w.coffeeV.id, qty: 12 }] });
    expect(q.lines[0]).toMatchObject({ unitPriceCents: 11_000, exCents: 118_800, vatCents: 17_820, totalCents: 136_620, promoId: promo.id });
    expect(q.applied).toEqual([{ id: promo.id, name: "Trade launch 10%", discountCents: 13_200 }]);
    expect(q.discountCents).toBe(151_800 - 136_620);
    await db.promotion.update({ where: { id: promo.id }, data: { active: false } });
  });

  it("lists the trade range at the DC: the account's classes, case packs, breaks and availability — never THC", async () => {
    const r = await tradeRange(w.dc.id, { classes: ["CBD", "CBD_FOOD"], priceListId: null });
    expect(r.total).toBe(2);
    const oil = r.rows.find((x) => x.variantId === w.oilV.id)!;
    expect(oil).toMatchObject({ caseQty: 6, unitCents: 20_000, breaks: [{ minQty: 1, unitCents: 20_000 }, { minQty: 12, unitCents: 18_000 }], onHand: 105, available: 105 });
    expect(r.rows.find((x) => x.variantId === w.flowerV.id)).toBeUndefined();
    expect((await tradeRange(w.dc.id, { classes: ["CBD", "CBD_FOOD"] }, { q: "coffee" })).rows.map((x) => x.variantId)).toEqual([w.coffeeV.id]);
    expect((await tradeRange(w.dc.id, { classes: ["APPAREL"] })).total).toBe(0);
  });
});

describe("Orders from the DC", () => {
  let onAccountId: string;
  let shippedId: string;

  it("places an order on account within the limit: PLACED, stock reserved at the DC, confirmation emailed", async () => {
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 7 }], payMethod: "ACCOUNT" })).rejects.toThrow(/cases of 6/);
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 6 }], payMethod: "ACCOUNT" })).rejects.toThrow(/Minimum order is R2,000.00/);
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.flowerV.id, qty: 1 }, { variantId: w.oilV.id, qty: 12 }], payMethod: "ACCOUNT" })).rejects.toThrow(/licensed medicine/);
    const before = await avail(w.dc.id, w.oilV.id);
    const o = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "ACCOUNT", reference: "PO-1001" });
    onAccountId = o.id;
    expect(o).toMatchObject({ number: "TO-000001", status: "PLACED", fulfilment: "COURIER", payMethod: "ACCOUNT", storeId: w.dc.id, subtotalCents: 216_000, deliveryCents: 15_000, handlingCents: 0, vatCents: 34_650, totalCents: 265_650, addressLine: "Loading bay, 12 Burnett St", reference: "PO-1001" });
    expect(o.reservedAt).toBeTruthy();
    expect(o.lines[0]).toMatchObject({ qty: 12, unitCents: 18_000, vatCents: 32_400, shippedQty: null });
    const after = await avail(w.dc.id, w.oilV.id);
    expect(after.reserved).toBe(before.reserved + 12);
    expect(after.available).toBe(before.available - 12);
    expect((await lastMailTo(BILLING)).body).toMatch(/order TO-000001 is confirmed/);
    expect(await db.auditLog.findFirst({ where: { action: "trade.order", entityId: o.id } })).toBeTruthy();
    expect(nextTradeActions(o)).toEqual(["pick", "ship", "cancel"]);
  });

  it("refuses an on-account order over the limit (open orders count) but takes it by EFT", async () => {
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 48 }], payMethod: "ACCOUNT" })).rejects.toThrow(/Over the credit limit: R7,343.50 available on a limit of R10,000.00 \(owing R0.00, R2,656.50 on open orders\)/);
    const s = await tradeAccountSummary(accountId);
    expect(s).toMatchObject({ balanceCents: 0, openOnAccountCents: 265_650, availableCents: 734_350, openOrders: { count: 1, cents: 265_650 } });
  });

  it("ships with one short line: a WHOLESALE sale at the DC with trade VAT, the TI invoice, one ACCOUNT tender, the ledger invoice due in 30 days", async () => {
    const o = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }, { variantId: w.coffeeV.id, qty: 12 }], payMethod: "ACCOUNT" });
    shippedId = o.id;
    const oilLine = o.lines.find((l) => l.variantId === w.oilV.id)!;
    await expect(advanceTradeOrder(o.id, "collect", hq, { idChecked: true })).rejects.toThrow(/click & collect/);
    await advanceTradeOrder(o.id, "pick", hq);
    const shipped = await advanceTradeOrder(o.id, "ship", hq, { courier: "The Courier Guy", trackingNo: "TCG123", shortShip: [{ lineId: oilLine.id, shippedQty: 6 }] });
    expect(shipped).toMatchObject({ status: "SHIPPED", invoiceNumber: "TI-000001", courier: "The Courier Guy", trackingNo: "TCG123" });
    expect(shipped.shippedAt).toBeTruthy();
    expect(shipped.lines.find((l) => l.variantId === w.oilV.id)).toMatchObject({ shippedQty: 6, shipped: [{ batchId: w.oilOld.id, qty: 5 }, { batchId: w.oilNew.id, qty: 1 }] });
    expect(shipped.lines.find((l) => l.variantId === w.coffeeV.id)!.shippedQty).toBe(12);
    expect((shipped.events as { note?: string }[]).at(-1)!.note).toMatch(/Short: Calm Oil · 30ml: 6 of 12/);

    const sale = await db.sale.findUniqueOrThrow({ where: { id: shipped.saleId! }, include: { lines: true, payments: true } });
    expect(sale).toMatchObject({ number: "TI-000001", channel: "WHOLESALE", storeId: w.dc.id, tradeAccountId: accountId, customerId: null, pointsEarned: 0, totalCents: 124_200 + 151_800 + 17_250, vatCents: 16_200 + 19_800 + 2_250, subtotalCents: 276_000 + 17_250 });
    expect(sale.buyer).toEqual({ name: "Hatfield Pharmacy (Pty) Ltd (trading as Hatfield Pharmacy)", address: "12 Burnett St, Hatfield, Pretoria, 0083", vatNumber: "4123456789" });
    expect(sale.lines.find((l) => l.variantId === w.oilV.id)).toMatchObject({ qty: 6, unitPriceCents: 18_000, totalCents: 124_200, vatCents: 16_200 });
    expect(sale.payments).toEqual([expect.objectContaining({ method: "ACCOUNT", amountCents: 293_250 })]);
    expect(await onHand(w.dc.id, w.oilOld.id)).toBe(0);
    expect(await onHand(w.dc.id, w.oilNew.id)).toBe(99);
    expect(await onHand(w.dc.id, w.coffeeNew.id)).toBe(48);

    const inv = await db.tradeLedgerEntry.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(inv).toMatchObject({ kind: "INVOICE", cents: 293_250, reference: "TI-000001", tradeOrderId: o.id });
    expect(Math.round((inv.dueAt!.getTime() - inv.createdAt.getTime()) / 86_400_000)).toBe(30);
    expect(await tradeBalance(accountId)).toBe(293_250);
    // HQ collected the money (on its ledger), so the rollup shows it in the HQ-collected column, not as account at the store.
    const st = await stat(w.dc.id);
    expect(st).toMatchObject({ sales: 1, grossCents: 293_250, vatCents: 38_250, onlineCents: 293_250, accountCents: 0, members: 0, pointsIssued: 0 });
    await new Promise((r) => setTimeout(r, 400));
    const mails = await mailsTo(BILLING);
    expect(mails.some((m) => /order TO-000002 has shipped[\s\S]*TCG123/.test(m.body))).toBe(true);
    expect(mails.some((m) => /tax invoice TI-000001[\s\S]*Sold to Hatfield Pharmacy \(Pty\) Ltd[\s\S]*VAT no. 4123456789/.test(m.body))).toBe(true);
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).invoiceEmail).toBe(BILLING);
    expect((await avail(w.dc.id, w.oilV.id)).reserved).toBe(12); // only the first order still holds stock
  });

  it("clears the balance with a payment", async () => {
    const r = await recordTradePayment(accountId, { cents: 293_250, reference: "FNB 20261003 HATF", tradeOrderId: shippedId }, hq);
    expect(r.balanceCents).toBe(0);
    expect(r.released).toBe(false);
    expect(await tradeAgeing(accountId)).toMatchObject({ total: 0, overdue: 0 });
    await expect(recordTradePayment(accountId, { cents: 0, reference: "x" }, hq)).rejects.toThrow(/amount/);
  });

  it("holds an EFT order without stock until the payment is confirmed, then ships it and the ledger nets to zero", async () => {
    const before = await avail(w.dc.id, w.coffeeV.id);
    const o = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.coffeeV.id, qty: 24 }], payMethod: "EFT" });
    expect(o).toMatchObject({ status: "PENDING_PAYMENT", subtotalCents: 264_000, deliveryCents: 15_000, totalCents: 264_000 + 15_000 + 39_600 + 2_250 });
    expect(o.reservedAt).toBeNull();
    expect((await avail(w.dc.id, w.coffeeV.id)).reserved).toBe(before.reserved);
    const pro = await lastMailTo(BILLING);
    expect(pro.body).toMatch(/pro forma TO-000003 — pay R3,208.50 with reference HH-TO-000003/);
    expect(pro.body).toMatch(/62000000000/);
    await expect(advanceTradeOrder(o.id, "ship", hq)).rejects.toThrow(/pending payment/);

    const paid = await confirmTradePayment(o.id, { reference: "HH-TO-000003" }, hq);
    expect(paid).toMatchObject({ status: "PLACED", paymentRef: "HH-TO-000003" });
    expect(paid.reservedAt).toBeTruthy();
    expect((await avail(w.dc.id, w.coffeeV.id)).reserved).toBe(before.reserved + 24);
    expect(await tradeBalance(accountId)).toBe(-320_850);
    expect((await confirmTradePayment(o.id, { reference: "again" }, hq)).paymentRef).toBe("HH-TO-000003"); // idempotent
    expect((await lastMailTo(BILLING)).body).toMatch(/order TO-000003 is confirmed/);

    const shipped = await advanceTradeOrder(o.id, "ship", hq, { courier: "Courier" });
    const sale = await db.sale.findUniqueOrThrow({ where: { id: shipped.saleId! }, include: { payments: true } });
    expect(sale.payments).toEqual([expect.objectContaining({ method: "EFT", amountCents: 320_850, reference: "HH-TO-000003" })]);
    const inv = await db.tradeLedgerEntry.findFirstOrThrow({ where: { saleId: sale.id } });
    expect(inv.dueAt!.getTime()).toBe(inv.createdAt.getTime());
    expect(await tradeBalance(accountId)).toBe(0);
    expect((await avail(w.dc.id, w.coffeeV.id)).reserved).toBe(before.reserved);
  });

  it("cancels an order and releases its stock; a paid EFT order is noted for a refund by hand", async () => {
    const before = await avail(w.dc.id, w.oilV.id);
    const cancelled = await advanceTradeOrder(onAccountId, "cancel", hq, { note: "Buyer changed their mind" });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledAt).toBeTruthy();
    expect((await avail(w.dc.id, w.oilV.id)).reserved).toBe(before.reserved - 12);
    expect((await lastMailTo(BILLING)).body).toMatch(/order TO-000001 was cancelled[\s\S]*cancelled: Buyer changed their mind/);
    await expect(advanceTradeOrder(onAccountId, "ship", hq)).rejects.toThrow(/cancelled/);

    const eft = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.coffeeV.id, qty: 24 }], payMethod: "EFT" });
    await confirmTradePayment(eft.id, { reference: "EFT-2" }, hq);
    const c = await advanceTradeOrder(eft.id, "cancel", hq);
    expect((c.events as { note?: string }[]).at(-1)!.note).toMatch(/Paid by EFT \(ref EFT-2\): refund R3,208.50 by hand/);
    expect((await lastMailTo(BILLING)).body).toMatch(/refunded by hand/);
    expect(await tradeBalance(accountId)).toBe(-320_850); // the payment stays on the ledger until HQ adjusts it
    await adjustTradeLedger(accountId, { cents: 320_850, note: "EFT-2 refunded by hand", reference: "EFT-2", tradeOrderId: eft.id }, hq);
    expect(await tradeBalance(accountId)).toBe(0);
    expect((await listTradeOrders({ accountId, status: "ALL" })).total).toBe(4);
    expect((await listTradeOrders({ storeId: w.dc.id, status: "OPEN" })).total).toBe(0);
    expect((await tradeOrderById(shippedId))?.status).toBe("SHIPPED");
  });
});

describe("Click & collect at a store", () => {
  let orderId: string;
  it("offers click & collect stores with the basket's availability, the account's province first", async () => {
    const r = await collectStoresFor([{ variantId: w.oilV.id, qty: 6, regClass: "CBD" }], { classes: ["CBD"], province: "GP" });
    expect(r.total).toBe(1);
    expect(r.rows[0]).toMatchObject({ id: w.store.id, allInStock: true, short: [] });
    const big = await collectStoresFor([{ variantId: w.oilV.id, qty: 24, regClass: "CBD" }], { classes: ["CBD"], province: "WC" });
    expect(big.rows[0]).toMatchObject({ allInStock: false, short: [{ variantId: w.oilV.id, qty: 24, available: 12 }] });
    await db.store.update({ where: { id: w.store.id }, data: { clickCollect: false } });
    expect((await collectStoresFor([{ variantId: w.oilV.id, qty: 6, regClass: "CBD" }], { classes: ["CBD"], province: "GP" })).total).toBe(0);
    await db.store.update({ where: { id: w.store.id }, data: { clickCollect: true } });
  });

  it("places a collect order at the store with the handling fee and a collection code, reserving the store's stock", async () => {
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "ACCOUNT", fulfilment: "COLLECT" })).rejects.toThrow(/Choose the store/);
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "ACCOUNT", fulfilment: "COLLECT", storeId: w.dc.id })).rejects.toThrow(/doesn't offer click & collect/);
    const before = await avail(w.store.id, w.oilV.id);
    const o = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "ACCOUNT", fulfilment: "COLLECT", storeId: w.store.id });
    orderId = o.id;
    expect(o).toMatchObject({ status: "PLACED", fulfilment: "COLLECT", storeId: w.store.id, subtotalCents: 216_000, deliveryCents: 0, handlingCents: 7_500, vatCents: 32_400 + 1_125, totalCents: 216_000 + 7_500 + 33_525, addressLine: null });
    expect(o.collectionCode).toMatch(/^\d{6}$/);
    expect((await avail(w.store.id, w.oilV.id)).reserved).toBe(before.reserved + 12);
    expect(nextTradeActions(o)).toEqual(["pick", "ready", "cancel"]);
    expect((await lastMailTo(BILLING)).body).toMatch(/order TO-000005 is confirmed[\s\S]*Collect from: Herbal Holland Test Store/);
  });

  it("gets ready (email and text with the code), then hands over with an ID check: the sale posts at the store with the handling fee", async () => {
    await expect(advanceTradeOrder(orderId, "ship", hq)).rejects.toThrow(/handed over at the store/);
    const ready = await advanceTradeOrder(orderId, "ready", hq);
    expect(ready.status).toBe("READY");
    expect(ready.readyAt).toBeTruthy();
    expect((await lastMailTo(BILLING)).body).toMatch(new RegExp(`Collection code: ${ready.collectionCode} \\(bring your ID\\)`));
    const text = await lastMailTo("+27825550199");
    expect(text).toMatchObject({ channel: "SMS", status: "SENT" });
    expect(text.body).toContain(`Collection code ${ready.collectionCode}`);
    await expect(advanceTradeOrder(orderId, "collect", hq)).rejects.toThrow(/Check the collector's ID/);
    expect(nextTradeActions(ready)).toEqual(["collect", "cancel"]);

    const before = await stat(w.store.id);
    const done = await advanceTradeOrder(orderId, "collect", { type: "USER", id: w.manager.id, name: "Mia Manager" }, { idChecked: true, staffId: w.manager.id });
    expect(done).toMatchObject({ status: "COLLECTED", invoiceNumber: "TI-000003" });
    expect(done.collectedAt).toBeTruthy();
    const sale = await db.sale.findUniqueOrThrow({ where: { id: done.saleId! }, include: { payments: true, lines: true } });
    expect(sale).toMatchObject({ channel: "WHOLESALE", storeId: w.store.id, staffId: w.manager.id, ageCheck: "ID_SIGHTED", totalCents: 248_400 + 8_625, vatCents: 32_400 + 1_125, tradeAccountId: accountId });
    expect(sale.payments).toEqual([expect.objectContaining({ method: "ACCOUNT", amountCents: 257_025 })]);
    expect(await onHand(w.store.id, w.oilOld.id)).toBe(0); // FEFO at the store
    expect((await avail(w.store.id, w.oilV.id)).reserved).toBe(0);
    const after = await stat(w.store.id);
    expect((after?.onlineCents ?? 0) - (before?.onlineCents ?? 0)).toBe(257_025); // HQ collected it: settled on the statement
    expect((after?.accountCents ?? 0) - (before?.accountCents ?? 0)).toBe(0);
    expect(await tradeBalance(accountId)).toBe(257_025);
    expect(await db.staffPushEvent.findUnique({ where: { key: `trade-order:${orderId}` } })).toBeNull(); // nobody subscribed, nothing claimed
    await recordTradePayment(accountId, { cents: 257_025, reference: "FNB HATF 2", tradeOrderId: orderId }, hq);
  });
});

describe("Trade sales at the till", () => {
  let saleId: string;
  let saleNo: string;
  it("posts a WHOLESALE sale part cash, part on account: trade prices, the buyer block, a ledger invoice, no points", async () => {
    const r = await postPosSale({ id: randomUUID(), number: saleNumber(), lines: [{ variantId: w.oilV.id, qty: 2 }], payments: [{ method: "CASH", amountCents: 20_000, tenderedCents: 20_000, changeCents: 0 }, { method: "ACCOUNT", amountCents: 26_000 }], trade: { tradeAccountId: accountId } }, pos());
    saleId = r.sale.id;
    saleNo = r.sale.number;
    const sale = await db.sale.findUniqueOrThrow({ where: { id: saleId }, include: { lines: true, payments: true } });
    expect(sale).toMatchObject({ channel: "WHOLESALE", tradeAccountId: accountId, customerId: null, pointsEarned: 0, totalCents: 46_000, vatCents: 6_000, memberSavingsCents: 0 });
    expect(sale.lines[0]).toMatchObject({ qty: 2, unitPriceCents: 20_000, totalCents: 46_000, vatCents: 6_000, offerCents: 0 });
    expect(sale.buyer).toMatchObject({ name: "Hatfield Pharmacy (Pty) Ltd (trading as Hatfield Pharmacy)", vatNumber: "4123456789" });
    expect(sale.payments.map((p) => [p.method, p.amountCents])).toEqual([["CASH", 20_000], ["ACCOUNT", 26_000]]);
    const inv = await db.tradeLedgerEntry.findFirstOrThrow({ where: { saleId } });
    expect(inv).toMatchObject({ kind: "INVOICE", cents: 26_000, reference: saleNo });
    expect(Math.round((inv.dueAt!.getTime() - inv.createdAt.getTime()) / 86_400_000)).toBe(30);
    expect(await db.loyaltyEntry.count({ where: { saleId } })).toBe(0);
    expect(await db.auditLog.findFirst({ where: { action: "trade.sale", entityId: saleId } })).toBeTruthy();
    const st = await stat(w.store.id);
    expect(st).toMatchObject({ cashCents: 20_000, accountCents: 26_000 });
    await new Promise((r) => setTimeout(r, 400));
    expect((await db.sale.findUniqueOrThrow({ where: { id: saleId } })).invoiceEmail).toBe(BILLING);
  });

  it("refuses what trade sales never carry: vouchers, points, a member, an offline queue, and on-account over the limit or for consumers", async () => {
    const base = { lines: [{ variantId: w.oilV.id, qty: 1 }], trade: { tradeAccountId: accountId } };
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), ...base, payments: [{ method: "VOUCHER", amountCents: 23_000, reference: "HH-AAAA-BBBB-CCCC" }] }, pos())).rejects.toThrow(/Gift vouchers can't pay for a trade sale/);
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), ...base, pointsRedeemed: 10, payments: [{ method: "CASH", amountCents: 22_000 }] }, pos())).rejects.toThrow(/Points can't be redeemed/);
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), ...base, customerId: w.walkIn.id, payments: [{ method: "CASH", amountCents: 23_000 }] }, pos())).rejects.toThrow(/not a Rewards member/);
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), ...base, offline: true, createdAt: new Date().toISOString(), payments: [{ method: "CASH", amountCents: 23_000 }] }, pos())).rejects.toThrow(/queued trade sale/);
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), ...base, payments: [{ method: "ACCOUNT", amountCents: 23_000 }], lines: [{ variantId: w.oilV.id, qty: 50 }] }, pos())).rejects.toThrow(/Payments .* don't match/);
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), ...base, lines: [{ variantId: w.oilV.id, qty: 50 }], payments: [{ method: "ACCOUNT", amountCents: 1_035_000 }] }, pos())).rejects.toThrow(/Over the credit limit/); // 50 × R180 (12+ break) + VAT
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), ...base, lines: [{ variantId: w.flowerV.id, qty: 1 }], payments: [{ method: "CASH", amountCents: 0 }] }, pos())).rejects.toThrow(/licensed medicine/);
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), lines: [{ variantId: w.coffeeV.id, qty: 1 }], payments: [{ method: "ACCOUNT", amountCents: 22_900 }], customerId: w.walkIn.id, ageCheck: "ID_SIGHTED" }, pos())).rejects.toThrow(/trade sales only/);
  });

  it("refunds a trade sale: the on-account part comes back as a credit note, the rest as money", async () => {
    const line = (await db.saleLine.findFirstOrThrow({ where: { saleId } })).id;
    const first = await refundSale({ id: randomUUID(), number: saleNumber(), saleId, lines: [{ saleLineId: line, qty: 1, restock: true }], method: "CASH", reason: "damaged", staffId: w.manager.id, staffName: "Mia" });
    const p1 = await db.payment.findMany({ where: { saleId: first.id } });
    expect(p1.map((p) => [p.method, p.amountCents])).toEqual([["ACCOUNT", -23_000]]);
    const cn = await db.tradeLedgerEntry.findFirstOrThrow({ where: { reference: first.number } });
    expect(cn).toMatchObject({ kind: "CREDIT_NOTE", cents: -23_000, saleId }); // credits the original sale's invoice
    expect(first).toMatchObject({ channel: "WHOLESALE", tradeAccountId: accountId, totalCents: -23_000, vatCents: -3_000, pointsEarned: 0 });
    const second = await refundSale({ id: randomUUID(), number: saleNumber(), saleId, lines: [{ saleLineId: line, qty: 1, restock: false }], method: "CASH", reason: "damaged", staffId: w.manager.id, staffName: "Mia" });
    const p2 = await db.payment.findMany({ where: { saleId: second.id }, orderBy: { amountCents: "asc" } });
    expect(p2.map((p) => [p.method, p.amountCents])).toEqual([["CASH", -20_000], ["ACCOUNT", -3_000]]);
    expect(await tradeBalance(accountId)).toBe(0);
  });

  it("lets a held account pay in money but not on account; a closed account can't trade at all", async () => {
    await holdTradeAccount(accountId, "Paperwork outstanding", hq);
    expect((await lastMailTo(BILLING)).body).toMatch(/account TA-000001 on hold[\s\S]*Reason: Paperwork outstanding/);
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "EFT" })).rejects.toThrow(/on hold/);
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), lines: [{ variantId: w.oilV.id, qty: 1 }], payments: [{ method: "ACCOUNT", amountCents: 23_000 }], trade: { tradeAccountId: accountId } }, pos())).rejects.toThrow(/on hold/);
    const cash = await postPosSale({ id: randomUUID(), number: saleNumber(), lines: [{ variantId: w.oilV.id, qty: 1 }], payments: [{ method: "CARD", amountCents: 23_000 }], trade: { tradeAccountId: accountId } }, pos());
    expect(cash.sale.channel).toBe("WHOLESALE");
    expect((await tradeAccountLookup("hatfield", { includeOnHold: false }))).toEqual([]);
    expect((await tradeAccountLookup("hatfield"))[0]).toMatchObject({ status: "ON_HOLD", availableCents: 0 });
    await releaseTradeHold(accountId, hq);
    expect((await db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("APPROVED");
  });
});

describe("Sign-in with a code", () => {
  it("emails a code (logged without it), signs the buyer in, throttles, and ignores unknown addresses", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const r = await requestTradeCode(BUYER_EMAIL.toUpperCase());
    expect(r.email).toBe(BUYER_EMAIL);
    expect(r.demoCode).toMatch(/^\d{6}$/);
    const log = await lastMailTo(BUYER_EMAIL);
    expect(log.body).toMatch(/sign-in code/);
    expect(log.body).not.toContain(r.demoCode);
    await expect(verifyTradeCode(BUYER_EMAIL, "000000")).rejects.toThrow(/isn't right/);
    const buyer = await verifyTradeCode(BUYER_EMAIL, r.demoCode!);
    expect(buyer).toMatchObject({ id: buyerId, account: { number: "TA-000001" } });
    await expect(verifyTradeCode(BUYER_EMAIL, r.demoCode!)).rejects.toThrow(/expired/);
    const unknown = await requestTradeCode("nobody@example.com");
    expect(unknown.demoCode).toBeUndefined();
    expect(await db.otp.count({ where: { email: "nobody@example.com" } })).toBe(0);
    for (let i = 0; i < 5; i++) await requestTradeCode(BUYER_EMAIL); // the verified code's rows are gone; five fresh ones fill the window
    await expect(requestTradeCode(BUYER_EMAIL)).rejects.toThrow(/Too many codes/);
    await db.otp.deleteMany({ where: { email: BUYER_EMAIL } });
  });

  it("resolves a session token to the buyer and their account, but not once the account is closed", async () => {
    const token = "trade-session-token";
    await db.session.create({ data: { id: sha256(token), tradeBuyerId: buyerId, expiresAt: new Date(Date.now() + 3_600_000) } });
    expect((await tradeBuyerForToken(token))?.account.id).toBe(accountId);
    expect(await tradeBuyerForToken("nope")).toBeNull();
    await db.session.create({ data: { id: sha256("stale"), tradeBuyerId: buyerId, expiresAt: new Date(Date.now() - 1) } });
    expect(await tradeBuyerForToken("stale")).toBeNull();
  });
});

describe("Ledger and the daily jobs", () => {
  it("lapses unpaid EFT orders after the hold period", async () => {
    const o = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.coffeeV.id, qty: 24 }], payMethod: "EFT" });
    await db.tradeOrder.update({ where: { id: o.id }, data: { createdAt: new Date(Date.now() - 4 * 86_400_000) } });
    const fresh = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.coffeeV.id, qty: 24 }], payMethod: "EFT" });
    expect(await tradeEftExpiry()).toEqual({ done: 1, failed: 0 });
    expect((await db.tradeOrder.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("CANCELLED");
    expect((await db.tradeOrder.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("PENDING_PAYMENT");
    expect((await lastMailTo(BILLING)).body).toMatch(/Payment not received within 3 days/);
    await advanceTradeOrder(fresh.id, "cancel", hq);
  });

  it("puts an account with an invoice past due plus grace on hold, and lifts it when the payment clears it", async () => {
    const o = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.coffeeV.id, qty: 24 }], payMethod: "ACCOUNT" });
    const shipped = await advanceTradeOrder(o.id, "ship", hq);
    const inv = await db.tradeLedgerEntry.findFirstOrThrow({ where: { saleId: shipped.saleId! } });
    expect(await tradeOverdueHolds()).toMatchObject({ held: 0 });
    await db.tradeLedgerEntry.update({ where: { id: inv.id }, data: { dueAt: new Date(Date.now() - 10 * 86_400_000) } });
    expect(await tradeOverdueHolds()).toMatchObject({ held: 1, failed: 0 });
    expect(await db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } })).toMatchObject({ status: "ON_HOLD", holdReason: "overdue" });
    expect((await lastMailTo(BILLING)).body).toMatch(/on hold[\s\S]*R3,208.50 is overdue/);
    expect(await tradeOverdueHolds()).toMatchObject({ held: 0 }); // already on hold
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.coffeeV.id, qty: 24 }], payMethod: "ACCOUNT" })).rejects.toThrow(/on hold/);

    const part = await recordTradePayment(accountId, { cents: 1_000_00, reference: "part" }, hq);
    expect(part.released).toBe(false);
    const rest = await recordTradePayment(accountId, { cents: inv.cents - 100_000, reference: "rest" }, hq);
    expect(rest.released).toBe(true);
    expect((await db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("APPROVED");
    expect((await lastMailTo(BILLING)).body).toMatch(/hold lifted/);
  });

  it("issues credit notes and adjustments with notes, and builds the statement", async () => {
    await expect(issueCreditNote(accountId, { cents: 500, note: "" }, hq)).rejects.toThrow(/why/);
    const cn = await issueCreditNote(accountId, { cents: 500, note: "Breakage on TO-000002" }, hq);
    expect(cn).toMatchObject({ kind: "CREDIT_NOTE", cents: -500, reference: "TC-000001" });
    await adjustTradeLedger(accountId, { cents: 500, note: "Credit note reversed" }, hq);
    const month = dayKey(new Date()).slice(0, 7);
    const st = await tradeStatementFor(accountId, month);
    expect(st.opening).toBe(0);
    expect(st.closing).toBe(0);
    expect(st.lines.length).toBeGreaterThan(5);
    expect(st.lines.at(-1)!.balanceCents).toBe(0);
    expect(await emailTradeStatement(accountId, month)).toEqual({ sent: true, reason: null });
    expect(await emailTradeStatement(accountId, month)).toEqual({ sent: false, reason: "already sent" });
    expect((await db.messageLog.findUniqueOrThrow({ where: { id: `trade-statement-${accountId}-${month}` } })).kind).toBe("trade-statement");
  });

  it("sends last month's statements on the statement day only, once", async () => {
    const notTheDay = new Date("2026-12-15T06:00:00+02:00");
    expect(await tradeStatements(notTheDay)).toMatchObject({ done: 0, skipped: "not the statement day" });
    const theDay = new Date("2026-12-01T06:00:00+02:00"); // November's statement (October's went out by hand above)
    expect(await tradeStatements(theDay)).toMatchObject({ done: 1, failed: 0, month: "2026-11" });
    expect(await tradeStatements(theDay)).toMatchObject({ done: 0, month: "2026-11" });
    expect((await lastMailTo(BILLING)).body).toMatch(/statement TA-000001, November 2026/);
  });

  it("closes the account: buyers are signed out and can't sign in", async () => {
    await closeTradeAccount(accountId, "Business closed", hq);
    expect(await db.session.count({ where: { tradeBuyerId: buyerId } })).toBe(0);
    expect(await tradeBuyerForToken("trade-session-token")).toBeNull();
    vi.stubEnv("DEMO_MODE", "true");
    expect((await requestTradeCode(BUYER_EMAIL)).demoCode).toBeUndefined();
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "EFT" })).rejects.toThrow(/closed/);
    expect((await lastMailTo(BILLING)).body).toMatch(/account TA-000001 closed/);
  });
});
