// Made-to-order merch: no stock anywhere, courier only, sent to the print partner once paid, tracked back.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { markOrderPaid, placeOrder } from "@/server/orders";
import { submitMerchOrders, syncMerchOrders } from "@/server/merch";
import { buildWorld, resetDb, type World } from "./world";

// A scripted print partner: records what it was sent and reports whatever state the test sets.
const partner = vi.hoisted(() => ({ sent: [] as unknown[], state: { status: "in_production" } as { status: string; courier?: string; trackingNo?: string } }));
vi.mock("@/server/pod", () => ({
  pod: () => ({
    submit: async (o: unknown) => (partner.sent.push(o), { id: "PP-1001" }),
    state: async () => partner.state,
  }),
}));

let w: World;
let tee: { id: string };
const address = { addressLine: "12 Jacaranda St", suburb: "Hatfield", city: "Pretoria", province: "GP" as const, postalCode: "0083" };

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const cat = await db.category.create({ data: { slug: "apparel", name: "Apparel", icon: "Shirt" } });
  const p = await db.product.create({ data: { slug: "windmill-tee", name: "Windmill Tee", categoryId: cat.id, description: "x", regClass: "APPAREL", effects: [], flavours: [], claims: [] } });
  tee = await db.variant.create({ data: { productId: p.id, sku: "APP-TEE-M", name: "M", priceCents: 45_000, wholesaleCents: 20_000, costCents: 18_500, podSku: "HH-TEE-BLK-M" } });
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await db.$disconnect();
});

describe("made-to-order merch", () => {
  it("ships by courier only, from the distribution centre's books, with no stock anywhere", async () => {
    await expect(placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: tee.id, qty: 1 }], payMethod: "IN_STORE" })).rejects.toThrow(/courier/);
    const o = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COURIER", items: [{ variantId: tee.id, qty: 2 }], payMethod: "ONLINE", address });
    expect(o.storeId).toBe(w.dc.id);
    expect(o.status).toBe("PENDING_PAYMENT");

    // Unpaid orders aren't sent; paid ones are, once, with our print files.
    expect((await submitMerchOrders()).done).toBe(0);
    await markOrderPaid(o.id, "PAY-1");
    expect((await submitMerchOrders()).done).toBe(1);
    expect((await submitMerchOrders()).done).toBe(0);
    const sent = partner.sent[0] as { ref: string; items: { sku: string; qty: number; files: { placement: string; url: string }[] }[]; recipient: { city: string } };
    expect(sent.ref).toBe(o.code);
    expect(sent.recipient.city).toBe("Pretoria");
    expect(sent.items).toEqual([
      { sku: "HH-TEE-BLK-M", qty: 2, name: "Windmill Tee · M", files: [
        { placement: "front", url: expect.stringMatching(/\/merch\/print\/chest-mark\.png$/) },
        { placement: "back", url: expect.stringMatching(/\/merch\/print\/window-back\.png$/) },
      ] },
    ]);
    let order = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect([order.podRef, order.status]).toEqual(["PP-1001", "PICKING"]);

    // Shipped: out for delivery with the partner's tracking; the sale posts at the partner's cost, no stock moves.
    partner.state = { status: "shipped", courier: "The Courier Guy", trackingNo: "TCG123" };
    await syncMerchOrders();
    order = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect([order.status, order.courier, order.trackingNo]).toEqual(["OUT_FOR_DELIVERY", "The Courier Guy", "TCG123"]);
    const sale = await db.sale.findUniqueOrThrow({ where: { orderId: o.id }, include: { lines: true } });
    expect(sale.storeId).toBe(w.dc.id);
    expect(sale.costCents).toBe(2 * 18_500);
    expect(sale.lines[0].allocations).toEqual([]);
    expect(await db.stockMovement.count({ where: { variantId: tee.id } })).toBe(0);
    const sms = await db.messageLog.findFirst({ where: { customerId: w.walkIn.id, body: { contains: "on its way" } }, orderBy: { createdAt: "desc" } });
    expect(sms?.body).toContain("TCG123");
    expect(sms?.body).not.toContain("ID (18+)"); // apparel isn't age-restricted

    partner.state = { status: "delivered", courier: "The Courier Guy", trackingNo: "TCG123" };
    await syncMerchOrders();
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("COMPLETED");
  });
});
