import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { postPosSale, refundSale } from "@/server/sales";
import { placeOrder, advanceOrder } from "@/server/orders";
import { availability, availKey, startStockTake, approveStockTake } from "@/server/inventory";
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
  it("posts a CBD sale: FEFO lots, VAT, rollups and Guilders", async () => {
    const total = 2 * 59_500;
    const r = await postPosSale(
      saleInput({ customerId: w.walkIn.id, lines: [{ variantId: w.oilV.id, qty: 2 }], payments: [{ method: "CASH", amountCents: total, tenderedCents: 120_000, changeCents: 1_000 }], ageCheck: "ID_SIGHTED" }),
      pos(),
    );
    expect(r.sale.totalCents).toBe(total);
    expect(r.sale.vatCents).toBe(vatOf(total));
    // The earliest-expiring lot goes first.
    expect(await onHand(w.store.id, w.oilOld.id)).toBe(0);
    expect(await onHand(w.store.id, w.oilNew.id)).toBe(10);
    const stat = await db.dailyStoreStat.findFirst({ where: { storeId: w.store.id, date: new Date(`${dayKey(new Date())}T00:00:00Z`), channel: "POS" } });
    expect(stat?.grossCents).toBe(total);
    expect(stat?.cashCents).toBe(total);
    const c = await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id } });
    expect(c.points).toBe(200 + pointsFor(total, "SEED"));
    expect(c.visits).toBe(1);
  });

  it("is idempotent for offline sync retries", async () => {
    const input = saleInput({ lines: [{ variantId: w.oilV.id, qty: 1 }], payments: [{ method: "CASH", amountCents: 59_500 }], ageCheck: "ID_SIGHTED" });
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

  it("dispenses to a patient; medicines earn no Guilders (s18A)", async () => {
    const r = await postPosSale(
      saleInput({ customerId: w.patient.id, lines: [{ variantId: w.flowerV.id, qty: 1 }], payments: [{ method: "CARD", amountCents: 65_000, provider: "SIMULATED", reference: "T1" }] }),
      pos(),
    );
    expect(r.sale.pointsEarned).toBe(0);
    expect(await onHand(w.store.id, w.flowerOld.id)).toBe(2);
  });

  it("refunds a line back into the same batch and reverses Guilders", async () => {
    const sale = await postPosSale(
      saleInput({ customerId: w.walkIn.id, lines: [{ variantId: w.oilV.id, qty: 1 }], payments: [{ method: "CARD", amountCents: 59_500 }], ageCheck: "ID_SIGHTED" }),
      pos(),
    );
    const before = await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id } });
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: sale.sale.id } });
    const lotBefore = await onHand(w.store.id, w.oilNew.id);
    const refund = await refundSale({ id: randomUUID(), number: `TST01-A${String(++seq).padStart(5, "0")}`, saleId: sale.sale.id, lines: [{ saleLineId: line.id, qty: 1, restock: true }], method: "CARD", reason: "Changed mind", staffId: w.manager.id, staffName: "Mia" });
    expect(refund.totalCents).toBe(-59_500);
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
});
