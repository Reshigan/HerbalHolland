import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { postPosSale, refundSale } from "@/server/sales";
import { createCustomer, STORE_CONSENT_WORDING } from "@/server/customers";
import { audienceSize } from "@/server/marketing";
import { TERMS_VERSION } from "@/lib/terms";
import { placeOrder, advanceOrder } from "@/server/orders";
import { availability, availKey, startStockTake, approveStockTake, recordCounts, adjustStock } from "@/server/inventory";
import { createStockOrder, actOnStockOrder, receivedValue } from "@/server/stock-orders";
import { quote } from "@/server/pricing";
import { tx } from "@/server/db";
import { vatOf } from "@/lib/money";
import { pointsFor } from "@/lib/loyalty-rules";
import { dayKey } from "@/lib/format";
import { buildWorld, onHand, resetDb, type World } from "./world";

let w: World;
const actor = () => ({ type: "USER" as const, id: w.manager.id, name: w.manager.name });
const pos = (staffId = w.manager.id) => ({ storeId: w.store.id, deviceId: w.device.id, staffId, staffName: "Staff" });
let seq = 0;
/** A fresh adult member, so a test's spend doesn't move the shared member's tier. */
const member = (n: number) =>
  db.customer.create({ data: { memberNo: `HH00001${String(n).padStart(2, "0")}`, phone: `+277100001${String(n).padStart(2, "0")}`, firstName: `Member ${n}`, referralCode: `MEM${n}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date() } });

const saleInput = (over: Partial<Parameters<typeof postPosSale>[0]>) => ({
  id: randomUUID(),
  number: `TST01-A${String(++seq).padStart(5, "0")}`,
  lines: [],
  payments: [],
  ...over,
});

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500)); // let fire-and-forget invoice emails settle
  await db.$disconnect();
});

describe("POS", () => {
  it("posts a CBD sale at the member's instant Rewards price: FEFO lots, VAT, rollups and points", async () => {
    const unit = Math.round(59_500 * 0.97); // Seed members save 3% instantly
    const total = 2 * unit;
    const r = await postPosSale(
      saleInput({ customerId: w.walkIn.id, lines: [{ variantId: w.oilV.id, qty: 2 }], payments: [{ method: "CASH", amountCents: total, tenderedCents: 120_000, changeCents: 1_000 }], ageCheck: "ID_SIGHTED" }),
      pos(),
    );
    expect(r.sale.totalCents).toBe(total);
    expect(r.sale.vatCents).toBe(vatOf(total));
    expect(r.sale.memberSavingsCents).toBe(2 * (59_500 - unit));
    // The earliest-expiring lot goes first.
    expect(await onHand(w.store.id, w.oilOld.id)).toBe(0);
    expect(await onHand(w.store.id, w.oilNew.id)).toBe(10);
    const stat = await db.dailyStoreStat.findFirst({ where: { storeId: w.store.id, date: new Date(`${dayKey(new Date())}T00:00:00Z`), channel: "POS" } });
    expect(stat?.grossCents).toBe(total);
    expect(stat?.cashCents).toBe(total);
    expect(stat?.memberSavingsCents).toBe(2 * (59_500 - unit));
    const c = await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id } });
    expect(c.points).toBe(200 + pointsFor(total, "SEED"));
    expect(c.visits).toBe(1);
  });

  it("makes members accept the membership terms, and records the version", async () => {
    const join = (termsAccepted: boolean) =>
      createCustomer({ phone: "0721234567", firstName: "Thandi", dob: new Date("1990-01-01"), ageCheck: "ID_SIGHTED", consents: {}, source: "POS", termsAccepted }, { type: "USER", id: w.manager.id, name: "Mia" });
    await expect(join(false)).rejects.toThrow(/membership terms/);
    const c = await join(true);
    expect(c.termsVersion).toBe(TERMS_VERSION);
    expect(c.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("records the deals answer (with the question asked) and interests when someone joins in store", async () => {
    const c = await createCustomer(
      { phone: "0721234599", firstName: "Lwazi", dob: new Date("1992-03-04"), ageCheck: "ID_SIGHTED", consents: { SMS: true }, source: "POS", termsAccepted: true, interests: ["CBD", "THC", "CBD"], consentWording: STORE_CONSENT_WORDING },
      { type: "USER", id: w.manager.id, name: "Mia" },
    );
    expect(c).toMatchObject({ consentSms: true, consentEmail: false, interests: ["CBD"] });
    const sms = await db.consentEvent.findFirstOrThrow({ where: { customerId: c.id, channel: "SMS" } });
    expect(sms).toMatchObject({ granted: true, source: "POS", wording: STORE_CONSENT_WORDING });
    expect(await audienceSize("interest:CBD", "SMS")).toEqual({ total: 1, reachable: 1 });
    expect(await audienceSize("interest:GROW", "SMS")).toEqual({ total: 0, reachable: 0 });
    await expect(
      createCustomer({ phone: "0721234598", firstName: "Zee", dob: new Date("1992-13-04T00:00:00Z"), ageCheck: "ID_SIGHTED", consents: {}, source: "POS", termsAccepted: true }, { type: "USER", id: w.manager.id, name: "Mia" }),
    ).rejects.toThrow(/valid date of birth/);
  });

  it("sells to members only; an offline sale finds its member by number when it syncs", async () => {
    const oil = { variantId: w.oilV.id, qty: 1, unitPriceCents: 59_500 };
    await expect(postPosSale(saleInput({ lines: [oil], payments: [{ method: "CASH", amountCents: 59_500 }], ageCheck: "ID_SIGHTED" }), pos())).rejects.toThrow(/Members only/);
    // Offline the till takes the number from the member's card; the server resolves it when the sale syncs.
    const m = await member(1);
    const known = await postPosSale(saleInput({ offline: true, memberNo: m.memberNo.toLowerCase(), lines: [oil], payments: [{ method: "CASH", amountCents: 59_500 }], ageCheck: "ID_SIGHTED" }), pos());
    expect(known.sale.customerId).toBe(m.id);
    // A number that doesn't exist: the money was taken, so the sale stands and HQ sees the exception.
    const unknown = await postPosSale(saleInput({ offline: true, memberNo: "HH9999999", lines: [oil], payments: [{ method: "CASH", amountCents: 59_500 }], ageCheck: "ID_SIGHTED" }), pos());
    expect(unknown.sale.customerId).toBeNull();
    expect(await db.auditLog.count({ where: { action: "compliance.offline_exception", entityId: unknown.sale.id } })).toBe(1);
  });

  it("is idempotent for offline sync retries", async () => {
    const m = await member(2);
    const lines = [{ variantId: w.oilV.id, qty: 1 }];
    const q = await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId: m.id });
    const input = saleInput({ customerId: m.id, lines, payments: [{ method: "CASH", amountCents: q.totalCents }], ageCheck: "ID_SIGHTED" });
    const a = await postPosSale(input, pos());
    const b = await postPosSale(input, pos());
    expect(b.duplicate).toBe(true);
    expect(await db.sale.count({ where: { id: a.sale.id } })).toBe(1);
  });

  it("blocks licensed flower without a patient authorisation", async () => {
    await expect(
      postPosSale(saleInput({ customerId: w.walkIn.id, lines: [{ variantId: w.flowerV.id, qty: 1 }], payments: [{ method: "CARD", amountCents: 65_000 }] }), pos()),
    ).rejects.toThrow(/authorisation/);
  });

  it("requires an authorised dispenser for licensed products", async () => {
    await expect(
      postPosSale(saleInput({ customerId: w.patient.id, lines: [{ variantId: w.flowerV.id, qty: 1 }], payments: [{ method: "CARD", amountCents: 65_000 }] }), pos(w.budtender.id)),
    ).rejects.toThrow(/dispenser/);
  });

  it("dispenses to a patient; medicines earn no points (s18A)", async () => {
    const r = await postPosSale(
      saleInput({ customerId: w.patient.id, lines: [{ variantId: w.flowerV.id, qty: 1 }], payments: [{ method: "CARD", amountCents: 65_000, provider: "SIMULATED", reference: "T1" }] }),
      pos(),
    );
    expect(r.sale.pointsEarned).toBe(0);
    expect(await onHand(w.store.id, w.flowerOld.id)).toBe(2);
  });

  it("refunds a line back into the same batch and reverses points", async () => {
    const sale = await postPosSale(
      saleInput({ customerId: w.walkIn.id, lines: [{ variantId: w.oilV.id, qty: 1 }], payments: [{ method: "CARD", amountCents: Math.round(59_500 * 0.97) }], ageCheck: "ID_SIGHTED" }),
      pos(),
    );
    const before = await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id } });
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: sale.sale.id } });
    const lotBefore = await onHand(w.store.id, w.oilNew.id);
    const refund = await refundSale({ id: randomUUID(), number: `TST01-A${String(++seq).padStart(5, "0")}`, saleId: sale.sale.id, lines: [{ saleLineId: line.id, qty: 1, restock: true }], method: "CARD", reason: "Changed mind", staffId: w.manager.id, staffName: "Mia" });
    expect(refund.totalCents).toBe(-Math.round(59_500 * 0.97));
    expect(refund.memberSavingsCents).toBe(-sale.sale.memberSavingsCents);
    expect(await onHand(w.store.id, w.oilNew.id)).toBe(lotBefore + 1);
    const after = await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id } });
    expect(after.points).toBe(before.points - sale.sale.pointsEarned);
    await expect(
      refundSale({ id: randomUUID(), number: "X", saleId: sale.sale.id, lines: [{ saleLineId: line.id, qty: 1, restock: true }], method: "CARD", reason: "again", staffId: w.manager.id, staffName: "Mia" }),
    ).rejects.toThrow(/left to refund/);
  });
});

describe("Omnichannel", () => {
  it("reserves stock for a click & collect order and posts it at handover with an ID check", async () => {
    const before = (await availability([w.store.id], [w.oilV.id])).get(availKey(w.store.id, w.oilV.id))!.available;
    const order = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.oilV.id, qty: 2 }], payMethod: "IN_STORE" });
    expect(order.storeId).toBe(w.store.id);
    const reserved = (await availability([w.store.id], [w.oilV.id])).get(availKey(w.store.id, w.oilV.id))!;
    expect(reserved.available).toBe(before - 2);

    for (const s of ["PICKING", "READY"] as const) await advanceOrder(order.id, s, actor());
    await expect(advanceOrder(order.id, "COMPLETED", actor(), { staffId: w.manager.id })).rejects.toThrow(/ID/);
    await advanceOrder(order.id, "COMPLETED", actor(), { idChecked: true, staffId: w.manager.id, staffCanDispense: true, payments: [{ method: "CARD", amountCents: order.totalCents }] });
    const sale = await db.sale.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(sale.channel).toBe("ONLINE");
    expect(sale.totalCents).toBe(order.totalCents);
    expect(sale.memberSavingsCents).toBe(2 * (59_500 - Math.round(59_500 * 0.97))); // Rewards price carried from order to sale
    const after = (await availability([w.store.id], [w.oilV.id])).get(availKey(w.store.id, w.oilV.id))!;
    expect(after.reserved).toBe(0);
    expect(after.onHand).toBe(before - 2);
  });

  it("never routes licensed products to courier delivery", async () => {
    await expect(
      placeOrder({ customerId: w.patient.id, fulfilment: "COURIER", items: [{ variantId: w.flowerV.id, qty: 1 }], payMethod: "ONLINE", address: { addressLine: "1 Main", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083" } }),
    ).rejects.toThrow(/courier/);
  });
});

describe("Purchasing & stock control", () => {
  it("ships a wholesale order FEFO from the DC and receives the same batches at the store", async () => {
    const dcOldBefore = await onHand(w.dc.id, w.oilOld.id);
    const po = await createStockOrder({ buyerId: w.store.id, sellerId: w.dc.id, kind: "WHOLESALE", lines: [{ variantId: w.oilV.id, qty: 8 }], actor: actor(), submit: true });
    await actOnStockOrder(po.id, "approve", actor());
    await actOnStockOrder(po.id, "ship", actor());
    expect(await onHand(w.dc.id, w.oilOld.id)).toBe(dcOldBefore - 5); // oldest lot emptied first
    const storeOldBefore = await onHand(w.store.id, w.oilOld.id);
    const line = await db.stockOrderLine.findFirstOrThrow({ where: { stockOrderId: po.id } });
    await actOnStockOrder(po.id, "receive", actor(), { received: { [line.id]: 7 } }); // one short in transit
    expect(await onHand(w.store.id, w.oilOld.id)).toBe(storeOldBefore + 5);
    const done = await db.stockOrder.findUniqueOrThrow({ where: { id: po.id }, include: { lines: true } });
    expect(done.status).toBe("RECEIVED");
    expect(done.lines[0].receivedQty).toBe(7);
    expect(receivedValue(done)).toBe(Math.round(7 * 28_000 * 1.15));
  });

  it("posts stock-take variances as COUNT movements on approval", async () => {
    const st = await startStockTake(w.store.id, "FULL", true, w.manager.id, "ST-00001");
    const line = await db.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: st.id, batchId: w.flowerNew.id } });
    await db.stockTakeLine.update({ where: { id: line.id }, data: { countedQty: line.expectedQty - 1 } });
    const value = await tx((t) => approveStockTake(t, st.id, w.manager.id));
    expect(value).toBeLessThan(0);
    expect(await onHand(w.store.id, w.flowerNew.id)).toBe(line.expectedQty - 1);
    expect(await db.stockMovement.count({ where: { stockTakeId: st.id, type: "COUNT" } })).toBe(1);
  });

  it("doesn't treat sales made after a line was counted as variance", async () => {
    const st = await startStockTake(w.store.id, "FULL", true, w.manager.id, "ST-00002");
    const line = await db.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: st.id, batchId: w.oilNew.id } });
    const before = await onHand(w.store.id, w.oilNew.id);
    await recordCounts(w.store.id, st.id, [{ lineId: line.id, qty: before }]); // counted correctly…
    await tx((t) => adjustStock(t, { storeId: w.store.id, variantId: w.oilV.id, batchId: w.oilNew.id, delta: -1, reason: "DAMAGED", type: "ADJUST", userId: w.manager.id })); // …then trading moves stock
    await tx((t) => approveStockTake(t, st.id, w.manager.id));
    expect(await onHand(w.store.id, w.oilNew.id)).toBe(before - 1);
    expect(await db.stockMovement.count({ where: { stockTakeId: st.id } })).toBe(0);
  });
});

describe("Pricing & promotions", () => {
  it("applies a bonus buy on non-medicinal items but never on medicines", async () => {
    await db.promotion.create({
      data: { name: "Buy 1 oil get 1 half price", kind: "BUY_X_GET_Y", value: 0, buyQty: 1, getQty: 1, rewardPercent: 50, productIds: [w.oilV.productId], categoryIds: [], rewardProductIds: [], rewardCategoryIds: [], channels: ["POS"], storeIds: [], startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000), days: [] },
    });
    await db.promotion.create({
      data: { name: "10% off everything", kind: "PERCENT", value: 10, productIds: [], categoryIds: [], rewardProductIds: [], rewardCategoryIds: [], channels: ["POS"], storeIds: [], startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000), days: [] },
    });
    const q = await quote({ storeId: w.store.id, channel: "POS", items: [{ variantId: w.oilV.id, qty: 2 }, { variantId: w.flowerV.id, qty: 1 }] });
    const oil = q.lines.find((l) => l.variantId === w.oilV.id)!;
    const flower = q.lines.find((l) => l.variantId === w.flowerV.id)!;
    // Half price on the reward unit; the trigger unit is claimed by the deal, so the 10% doesn't stack on it.
    expect(oil.discountCents).toBe(Math.round(59_500 / 2));
    expect(flower.discountCents).toBe(0);
    expect(flower.noEarn).toBe(true);
  });

  it("stops a promotion once it reaches its maximum uses", async () => {
    await db.promotion.updateMany({ data: { active: false } });
    const promo = await db.promotion.create({
      data: { name: "First sale R20 off", kind: "FIXED", value: 2_000, maxUses: 1, productIds: [w.oilV.productId], channels: ["POS"], startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000) },
    });
    const m = await member(3);
    const basket = { storeId: w.store.id, channel: "POS" as const, items: [{ variantId: w.oilV.id, qty: 1 }], customerId: m.id };
    const first = await quote(basket);
    expect(first.promotionId).toBe(promo.id);
    await postPosSale(saleInput({ customerId: m.id, lines: basket.items, payments: [{ method: "CARD", amountCents: first.totalCents }], ageCheck: "ID_SIGHTED" }), pos());
    expect((await quote(basket)).applied).toEqual([]);
  });
});
