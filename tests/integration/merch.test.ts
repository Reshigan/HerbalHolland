// Made-to-order merch: no stock anywhere, courier only (charged on top), emailed to the print partner once paid,
// tracking entered from the partner's shipping email.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { advanceOrder, markOrderPaid, placeOrder } from "@/server/orders";
import { merchShipped, submitMerchOrders } from "@/server/merch";
import type { PodOrder } from "@/server/pod";
import { buildWorld, resetDb, type World } from "./world";

const sent = vi.hoisted(() => [] as unknown[]);
vi.mock("@/server/pod", async (real) => ({
  ...(await real<typeof import("@/server/pod")>()),
  sendProductionOrder: async (o: unknown) => void sent.push(o),
}));

let w: World;
let tee: { id: string };
const address = { addressLine: "12 Jacaranda St", suburb: "Hatfield", city: "Pretoria", province: "GP" as const, postalCode: "0083" };
const staff = () => ({ type: "USER" as const, id: w.manager.id, name: w.manager.name });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  const cat = await db.category.create({ data: { slug: "apparel", name: "Apparel", icon: "Shirt" } });
  const p = await db.product.create({ data: { slug: "windmill-tee", name: "Windmill Tee", categoryId: cat.id, description: "x", regClass: "APPAREL", effects: [], flavours: [], claims: [] } });
  tee = await db.variant.create({ data: { productId: p.id, sku: "APP-TEE-M", name: "M", priceCents: 45_000, wholesaleCents: 20_000, costCents: 24_000, podSku: "HH-TEE-BLK-M" } });
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await db.$disconnect();
});

describe("made-to-order merch", () => {
  it("is made and couriered by the print partner, courier on top, tracked from the partner's email", async () => {
    await expect(placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: tee.id, qty: 1 }], payMethod: "IN_STORE" })).rejects.toThrow(/courier/);
    // Three tees clear the free-delivery threshold, but merch always carries the partner's courier (R100).
    const o = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COURIER", items: [{ variantId: tee.id, qty: 3 }], payMethod: "ONLINE", address });
    expect(o.storeId).toBe(w.dc.id);
    expect(o.subtotalCents - o.discountCents).toBeGreaterThan(90_000);
    expect(o.deliveryCents).toBe(10_000);

    // Unpaid orders aren't sent; paid ones are, once, with the print files and specs.
    expect((await submitMerchOrders()).done).toBe(0);
    await markOrderPaid(o.id, "PAY-1");
    expect((await submitMerchOrders()).done).toBe(1);
    expect((await submitMerchOrders()).done).toBe(0);
    const po = sent[0] as PodOrder;
    expect(po.ref).toBe(o.code);
    expect(po.recipient).toMatchObject({ city: "Pretoria", phone: w.walkIn.phone });
    expect(po.items).toHaveLength(1);
    expect(po.items[0]).toMatchObject({ code: "HH-TEE-BLK-M", qty: 3, size: "M", name: "Windmill Tee" });
    expect(po.items[0].prints.map((p) => [p.technique, p.placement, p.url.replace(/^.*\/merch/, "/merch"), p.vector.replace(/^.*\/merch/, "/merch")])).toEqual([
      ["Embroidery", "Left chest, 80 mm below the shoulder seam", "/merch/print/mark-stitch.png", "/merch/print/mark-stitch.pdf"],
      ["DTF", "Centre back, 75 mm below the collar", "/merch/print/window-back.png", "/merch/print/window-back.pdf"],
    ]);
    let order = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect([order.podRef, order.podStatus, order.status]).toEqual([o.code, "sent", "PICKING"]);

    // The partner's shipping email → out for delivery with tracking; the sale posts at the partner's price, no stock moves.
    await merchShipped(o.id, w.dc.id, { courier: "Aramex", trackingNo: "ARX123" }, staff());
    await expect(merchShipped(o.id, w.dc.id, { courier: "Aramex", trackingNo: "ARX123" }, staff())).rejects.toThrow(/Already/);
    order = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect([order.status, order.courier, order.trackingNo, order.podStatus]).toEqual(["OUT_FOR_DELIVERY", "Aramex", "ARX123", "shipped"]);
    const sale = await db.sale.findUniqueOrThrow({ where: { orderId: o.id }, include: { lines: true } });
    expect(sale.storeId).toBe(w.dc.id);
    expect(sale.costCents).toBe(3 * 24_000);
    expect(sale.lines[0].allocations).toEqual([]);
    expect(await db.stockMovement.count({ where: { variantId: tee.id } })).toBe(0);
    const sms = await db.messageLog.findFirst({ where: { customerId: w.walkIn.id, body: { contains: "on its way" } }, orderBy: { createdAt: "desc" } });
    expect(sms?.body).toContain("ARX123");
    expect(sms?.body).not.toContain("ID (18+)"); // apparel isn't age-restricted

    // Delivered: no ID check needed for apparel.
    await advanceOrder(o.id, "COMPLETED", staff());
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("COMPLETED");
  });

  it("ships a mixed order as two parcels: stocked items from the DC, merch from the partner — each courier charged", async () => {
    sent.length = 0;
    const o = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COURIER", items: [{ variantId: w.oilV.id, qty: 1 }, { variantId: tee.id, qty: 1 }], payMethod: "ONLINE", address });
    expect(o.storeId).toBe(w.dc.id);
    expect(o.deliveryCents).toBe(9_900 + 10_000); // stocked items under the free-delivery threshold + the merch courier
    await markOrderPaid(o.id, "PAY-2");
    await submitMerchOrders();
    expect((sent[0] as PodOrder).items.map((i) => i.code)).toEqual(["HH-TEE-BLK-M"]); // only the merch goes to the partner
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PLACED"); // the DC still picks the oil

    await merchShipped(o.id, w.dc.id, { courier: "Aramex", trackingNo: "ARX456" }, staff());
    const order = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect([order.status, order.podTracking, order.trackingNo]).toEqual(["PLACED", "Aramex · ARX456", null]);
    const sms = await db.messageLog.findFirst({ where: { customerId: w.walkIn.id, body: { contains: "ARX456" } } });
    expect(sms?.body).toMatch(/merch .* on its way .* ships separately/);

    // The DC dispatches its parcel as usual; the sale takes the oil from stock and costs the tee at the partner's price.
    for (const s of ["PICKING", "READY"] as const) await advanceOrder(o.id, s, staff());
    await advanceOrder(o.id, "OUT_FOR_DELIVERY", staff(), { courier: "The Courier Guy", trackingNo: "TCG9" });
    const sale = await db.sale.findUniqueOrThrow({ where: { orderId: o.id }, include: { lines: true } });
    expect(sale.lines.find((l) => l.variantId === tee.id)?.costCents).toBe(24_000);
    expect(sale.lines.find((l) => l.variantId === w.oilV.id)?.allocations).not.toEqual([]);
  });

  it("writes the production order down when no partner email is set", async () => {
    const real = await vi.importActual<typeof import("@/server/pod")>("@/server/pod");
    await real.sendProductionOrder({
      ref: "TEST01",
      recipient: { name: "Wally Walker", phone: "+27820000002", email: null, addressLine: "12 Jacaranda St", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083", notes: null },
      items: [{ code: "HH-TEE-BLK-M", name: "Windmill Tee", blank: "Black tee", size: "M", qty: 1, prints: [{ placement: "Centre back", technique: "DTF", size: "250 × 340 mm", note: "Store-window poster", url: "http://localhost:3000/merch/print/window-back.png", vector: "http://localhost:3000/merch/print/window-back.pdf" }] }],
    });
    const log = await db.messageLog.findFirstOrThrow({ where: { reason: "logged (POD_EMAIL not set)" }, orderBy: { createdAt: "desc" } });
    expect(log.body).toContain("Production order TEST01");
    expect(log.body).toContain("/merch/print/window-back.png");
  });
});
