// The trade (wholesale) channel end to end: apply → approve → order on account (reserved) → over the limit refused →
// ship short → WHOLESALE sale at the DC with trade VAT, the TI invoice and the ledger → payment → EFT order → confirm →
// ship → ledger nets to zero → cancel releases stock → click & collect at a store → till trade sales, refunds and
// refusals → sign-in codes → the daily jobs → licences (mandatory at registration, verified before approval, a lapse
// pauses trading until the renewal is verified).
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { tradeEftExpiry, tradeLicenceExpiry, tradeOverdueHolds, tradeStatements } from "@/server/jobs";
import { licenceOverview, licenceProblem, rejectTradeLicence, submitTradeLicence, verifyTradeLicence } from "@/server/trade/licences";
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
  // A pharmacy selling CBD food: its licence to own the pharmacy, its SAPC recording and a food certificate.
  licences: { PHARMACY_LICENCE: { number: "GP-PL-0042" }, SAPC_RECORDING: { number: "P1234567" }, FOOD_COA: { number: "COA/TSH/2026/88" } },
};
const pdf = (name = "licence.pdf") => new File([new TextEncoder().encode("%PDF-1.4\n% Herbal Holland test licence\n%%EOF\n")], name, { type: "application/pdf" });
const licenceFiles = () => ({ PHARMACY_LICENCE: pdf(), SAPC_RECORDING: pdf(), FOOD_COA: pdf() });

beforeAll(async () => {
  process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "hh-trade-licences-"));
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

    // Licences are mandatory: each one this kind of business needs, with its document.
    const noDocs = await applyForTradeAccount(application, { source: "portal" });
    expect(noDocs.ok).toBe(false);
    if (!noDocs.ok) expect(Object.keys(noDocs.fields).sort()).toEqual(["licence.FOOD_COA.file", "licence.PHARMACY_LICENCE.file", "licence.SAPC_RECORDING.file"]);
    const uploadsBefore = await db.upload.count();
    const notPdf = await applyForTradeAccount(application, { files: { ...licenceFiles(), FOOD_COA: new File(["just text"], "coa.txt") } });
    expect(notPdf.ok).toBe(false);
    if (!notPdf.ok) expect(notPdf.fields).toEqual({ "licence.FOOD_COA.file": expect.stringMatching(/PDF, or a JPG or PNG/) });
    expect(await db.upload.count()).toBe(uploadsBefore); // the good documents weren't kept either

    const r = await applyForTradeAccount(application, { source: "portal", ip: "196.25.1.1", files: licenceFiles() });
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
    const lic = await db.tradeLicence.findMany({ where: { tradeAccountId: accountId } });
    expect(lic.map((l) => [l.kind, l.number, l.status, l.submittedById]).sort()).toEqual([
      ["FOOD_COA", "COA/TSH/2026/88", "SUBMITTED", buyerId],
      ["PHARMACY_LICENCE", "GP-PL-0042", "SUBMITTED", buyerId],
      ["SAPC_RECORDING", "P1234567", "SUBMITTED", buyerId],
    ]);
    expect(await db.upload.count({ where: { id: { in: lic.map((l) => l.uploadId) }, contentType: "application/pdf" } })).toBe(3);
    const dup = await applyForTradeAccount(application, { files: licenceFiles() });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.fields.buyerEmail).toMatch(/already signs in/);
  });

  it("refuses orders and on-account sales until HQ approves", async () => {
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "EFT" })).rejects.toThrow(/hasn't been approved/);
    expect(await tradeAccountLookup("hatfield")).toEqual([]);
  });

  it("approves only once every licence is verified; a document HQ can't accept goes back to the account", async () => {
    const terms = { terms: "ACCOUNT" as const, creditLimitCents: 1_000_000, paymentDays: 30, classes: ["CBD", "CBD_FOOD"] };
    await expect(approveTradeAccount(accountId, terms, hq)).rejects.toThrow(/Verify the licences first: Pharmacy licence is waiting to be checked/);
    const lic = await db.tradeLicence.findMany({ where: { tradeAccountId: accountId } });
    const coa = lic.find((l) => l.kind === "FOOD_COA")!;
    await rejectTradeLicence(coa.id, "The certificate is for another address", hq);
    expect((await lastMailTo(BILLING)).body).toMatch(/not accepted[\s\S]*another address/i);
    for (const l of lic.filter((l) => l.kind !== "FOOD_COA")) await verifyTradeLicence(l.id, hq);
    await expect(approveTradeAccount(accountId, terms, hq)).rejects.toThrow(/Certificate of acceptability \(food premises\) wasn't accepted \(The certificate is for another address\)/);
    // Approving without CBD food needs no food certificate; but the account asked for it, so it uploads a new one.
    const again = await submitTradeLicence(accountId, { kind: "FOOD_COA", number: "COA/TSH/2026/91" }, pdf("coa.pdf"), { type: "CUSTOMER", id: buyerId, name: "Thandi" }, { byBuyerId: buyerId });
    expect((await lastMailTo("franchise@herbalholland.com")).body).toMatch(/licence to check/);
    await verifyTradeLicence(again.id, hq);
    expect(await db.auditLog.count({ where: { action: { in: ["trade.licence.verify", "trade.licence.reject", "trade.licence.submit"] } } })).toBe(5);
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
    // The hold stops credit, not trade: a prepaid (EFT) order is still welcome, an on-account one isn't.
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "ACCOUNT" })).rejects.toThrow(/on hold/);
    const held = await placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "EFT" });
    expect(held.status).toBe("PENDING_PAYMENT");
    await advanceTradeOrder(held.id, "cancel", hq, { note: "test" });
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

describe("Licences after approval", () => {
  // The ledger tests close the account; trade it again for these (its buyers and licences are as they were).
  beforeAll(() => db.tradeAccount.update({ where: { id: accountId }, data: { status: "APPROVED", holdReason: null } }));

  it("won't add ranges or change the kind of business without the licences they need — which can be sent ahead", async () => {
    await expect(updateTradeAccount(accountId, { kind: "CAFE" }, hq)).rejects.toThrow(/Business licence is needed/);
    // Sent from the portal before asking for the change: on file, neither needed nor counted against the account.
    const bl = await submitTradeLicence(accountId, { kind: "BUSINESS_LICENCE", number: "BL/GP/00412" }, pdf("business-licence.pdf"), { type: "CUSTOMER", id: buyerId, name: "Thandi" }, { byBuyerId: buyerId });
    const view = await licenceOverview(await db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } }));
    expect(view.standing.ok).toBe(true);
    expect(view.others.map((l) => [l.kind, l.state])).toEqual([["BUSINESS_LICENCE", "pending"]]);
    await verifyTradeLicence(bl.id, hq);
    await updateTradeAccount(accountId, { kind: "CAFE" }, hq);
    await updateTradeAccount(accountId, { kind: "PHARMACY" }, hq); // and back, for the tests below
  });

  it("reminds before a licence lapses, pauses trading when it has, and lifts the pause when the renewal is verified", async () => {
    const sapc = await db.tradeLicence.findFirstOrThrow({ where: { tradeAccountId: accountId, kind: "SAPC_RECORDING", status: "VERIFIED" } });
    // Due in ten days: one reminder, once.
    await db.tradeLicence.update({ where: { id: sapc.id }, data: { expiresAt: new Date(Date.now() + 10 * 86_400_000), remindedAt: null } });
    expect((await tradeLicenceExpiry()).reminded).toBe(1);
    expect((await lastMailTo(BILLING)).body).toMatch(/SAPC pharmacy recording[\s\S]*expires on/);
    expect((await tradeLicenceExpiry()).reminded).toBe(0);
    // Lapsed: no orders, no till sale, no shipping; the job pauses the account and says why.
    await db.tradeLicence.update({ where: { id: sapc.id }, data: { expiresAt: new Date(Date.now() - 3_600_000) } });
    expect(await licenceProblem({ id: accountId, kind: "PHARMACY", classes: ["CBD", "CBD_FOOD"], regNumber: null })).toMatch(/^SAPC pharmacy recording expired on/);
    await expect(placeTradeOrder({ accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "EFT" })).rejects.toThrow(/SAPC pharmacy recording expired/);
    await expect(postPosSale({ id: randomUUID(), number: saleNumber(), lines: [{ variantId: w.oilV.id, qty: 1 }], payments: [{ method: "CARD", amountCents: 23_000 }], trade: { tradeAccountId: accountId } }, pos())).rejects.toThrow(/until its licences are in order/);
    expect((await tradeLicenceExpiry()).held).toBe(1);
    expect(await db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } })).toMatchObject({ status: "ON_HOLD", holdReason: "licence" });
    expect((await lastMailTo(BILLING)).body).toMatch(/ordering paused[\s\S]*SAPC pharmacy recording expired/i);
    expect((await tradeAccountLookup("hatfield"))[0].licenceProblem).toMatch(/SAPC pharmacy recording expired/);
    // The renewal, uploaded in the portal and verified: the pause lifts by itself.
    const renewal = await submitTradeLicence(accountId, { kind: "SAPC_RECORDING", number: "P1234567" }, pdf("sapc-2027.pdf"), { type: "CUSTOMER", id: buyerId, name: "Thandi" }, { byBuyerId: buyerId });
    expect(await licenceProblem({ id: accountId, kind: "PHARMACY", classes: ["CBD", "CBD_FOOD"], regNumber: null })).toBe("SAPC pharmacy recording is waiting to be checked");
    expect((await verifyTradeLicence(renewal.id, hq)).released).toBe(true);
    expect(await db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } })).toMatchObject({ status: "APPROVED", holdReason: null });
    expect((await lastMailTo(BILLING)).body).toMatch(/hold lifted/i);
    expect(await licenceProblem({ id: accountId, kind: "PHARMACY", classes: ["CBD", "CBD_FOOD"], regNumber: null })).toBeNull();
  });

  it("lets a shop apply as a sole proprietor, and asks for the CIPC certificate before it becomes a company", async () => {
    const r = await applyForTradeAccount(
      { ...application, kind: "RETAILER", legalName: "Sipho Dlamini", name: "Kasi Corner Shop", regNumber: "", vatNumber: "", classes: ["ACCESSORY", "HEMP"], buyerEmail: "sipho@kasicorner.example", licences: { SARS_REGISTRATION: { number: "0123 456 789" } } },
      { files: { SARS_REGISTRATION: pdf("sars-notice.pdf") } },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sars = await db.tradeLicence.findFirstOrThrow({ where: { tradeAccountId: r.account.id } });
    expect(sars).toMatchObject({ kind: "SARS_REGISTRATION", number: "0123456789", status: "SUBMITTED" });
    await verifyTradeLicence(sars.id, hq);
    const approved = await approveTradeAccount(r.account.id, { terms: "PREPAID", creditLimitCents: 0, paymentDays: 30, classes: ["ACCESSORY", "HEMP"] }, hq);
    expect(await licenceProblem(approved)).toBeNull();
    // Registering a company later: the certificate first (its number typed, as the account has none yet), then the number.
    await expect(updateTradeAccount(r.account.id, { regNumber: "2019/123456/07" }, hq)).rejects.toThrow(/Company registration certificate is needed/);
    const cipc = await submitTradeLicence(r.account.id, { kind: "CIPC_REGISTRATION", number: "2019/123456/07" }, pdf("cor14-3.pdf"), { type: "CUSTOMER", id: r.buyer.id, name: "Sipho" }, { byBuyerId: r.buyer.id });
    await verifyTradeLicence(cipc.id, hq);
    const company = await updateTradeAccount(r.account.id, { regNumber: "2019/123456/07" }, hq);
    expect(company.regNumber).toBe("2019/123456/07");
    expect(await licenceProblem(company)).toBeNull();
  });

  it("limits applications from one connection to five an hour", async () => {
    const one = (n: number) => applyForTradeAccount({ ...application, buyerEmail: `owner${n}@limit.example`, legalName: `Limit ${n} (Pty) Ltd` }, { ip: "41.1.2.3", files: licenceFiles() });
    for (let n = 1; n <= 5; n++) expect((await one(n)).ok).toBe(true);
    const sixth = await one(6);
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.error).toMatch(/several applications from this connection/);
  });
});

describe("Credit under concurrency", () => {
  it("decides credit one order at a time: of three orders at once that fit only singly, one is placed", async () => {
    const one = { accountId, buyerId, lines: [{ variantId: w.oilV.id, qty: 12 }], payMethod: "ACCOUNT" as const };
    const a = await db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } });
    const [{ _sum: bal }, { _sum: open }] = await Promise.all([
      db.tradeLedgerEntry.aggregate({ where: { tradeAccountId: accountId }, _sum: { cents: true } }),
      db.tradeOrder.aggregate({ where: { tradeAccountId: accountId, payMethod: "ACCOUNT", status: { in: ["PLACED", "PICKING", "READY"] } }, _sum: { totalCents: true } }),
    ]);
    // Headroom for one order of R2,656.50 and a half.
    await db.tradeAccount.update({ where: { id: accountId }, data: { status: "APPROVED", terms: "ACCOUNT", creditLimitCents: (bal.cents ?? 0) + (open.totalCents ?? 0) + 400_000 } });
    const results = await Promise.allSettled([placeTradeOrder(one), placeTradeOrder(one), placeTradeOrder(one)]);
    const placed = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    expect(placed).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason)).toMatch(/credit/i);
    await db.tradeOrder.deleteMany({ where: { id: { in: placed.map((o) => o.id) } } });
    await db.tradeAccount.update({ where: { id: accountId }, data: { status: a.status, terms: a.terms, creditLimitCents: a.creditLimitCents } });
  });
});
