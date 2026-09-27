import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { placeOrder, advanceOrder } from "@/server/orders";
import { postPosSale } from "@/server/sales";
import { availability, availKey } from "@/server/inventory";
import { expireUnpaidOrders, releaseUncollected, retryInvoices, birthdayPoints } from "@/server/jobs";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const reserved = async () => (await availability([w.store.id], [w.oilV.id])).get(availKey(w.store.id, w.oilV.id))!.reserved;

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500));
  await db.$disconnect();
});

describe("Scheduled jobs", () => {
  it("cancels unpaid online orders after the payment window and releases their stock", async () => {
    const stale = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "ONLINE" });
    const fresh = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "ONLINE" });
    expect(stale.status).toBe("PENDING_PAYMENT");
    await db.order.update({ where: { id: stale.id }, data: { createdAt: hoursAgo(2) } });
    expect(await reserved()).toBe(2);

    expect(await expireUnpaidOrders()).toEqual({ done: 1, failed: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("CANCELLED");
    expect((await db.order.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("PENDING_PAYMENT");
    expect(await reserved()).toBe(1);
    await advanceOrder(fresh.id, "CANCELLED", { type: "SYSTEM" });
  });

  it("releases pay-in-store collections that were never collected", async () => {
    const o = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "IN_STORE" });
    for (const s of ["PICKING", "READY"] as const) await advanceOrder(o.id, s, { type: "SYSTEM" });
    expect(await releaseUncollected()).toEqual({ done: 0, failed: 0 });
    await db.$executeRaw`UPDATE "Order" SET "updatedAt" = ${hoursAgo(8 * 24)} WHERE id = ${o.id}`;
    expect(await releaseUncollected()).toEqual({ done: 1, failed: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("CANCELLED");
    expect(await reserved()).toBe(0);
  });

  it("retries tax-invoice emails that failed to send", async () => {
    const { sale } = await postPosSale(
      { id: randomUUID(), number: "TST01-J00001", lines: [{ variantId: w.oilV.id, qty: 1 }], ageCheck: "ID_SIGHTED", payments: [{ method: "CARD", amountCents: 59_500 }], invoiceEmail: "walkin@example.co.za" },
      { storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Staff" },
    );
    await expect.poll(async () => (await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).invoiceSentAt).not.toBeNull();
    await db.sale.update({ where: { id: sale.id }, data: { invoiceSentAt: null, createdAt: hoursAgo(1) } }); // as if the mail server was down

    expect(await retryInvoices()).toEqual({ done: 1, failed: 0 });
    const s = await db.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(s.invoiceSentAt).not.toBeNull();
    expect(s.invoiceEmail).toBe("walkin@example.co.za");
    expect(await retryInvoices()).toEqual({ done: 0, failed: 0 });
  });

  it("awards birthday points once a year, and 29 February birthdays on 28 February", async () => {
    await db.customer.update({ where: { id: w.walkIn.id }, data: { dob: new Date("1990-03-15") } });
    await db.customer.update({ where: { id: w.patient.id }, data: { dob: new Date("1992-02-29") } });
    const before = (await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id } })).points;

    expect(await birthdayPoints(new Date("2027-03-15T08:00:00Z"))).toEqual({ done: 1, failed: 0 });
    expect(await birthdayPoints(new Date("2027-03-15T20:00:00Z"))).toEqual({ done: 0, failed: 0 });
    expect((await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id } })).points).toBe(before + 100);

    expect(await birthdayPoints(new Date("2027-02-28T08:00:00Z"))).toEqual({ done: 1, failed: 0 });
    expect(await db.loyaltyEntry.count({ where: { customerId: w.patient.id, kind: "BIRTHDAY" } })).toBe(1);
  });
});
