// Delivery-first launch and Yoco: checkout before any store trades (courier from the warehouse), the Yoco checkout for
// an order, the webhook route marking it paid, refunds when a paid order is cancelled, and the till's Yoco card machine.
// Yoco is never called: global fetch is mocked, and webhooks are signed here with Yoco's documented scheme.
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { advanceOrder, placeOrder, routingCandidates, yocoCheckoutFor } from "@/server/orders";
import { postPosSale } from "@/server/sales";
import { quote } from "@/server/pricing";
import { POST } from "@/app/api/payments/yoco/route";
import { offeredFulfilment } from "@/lib/routing";
import { cardMachineTender } from "@/components/pos/lib/rules";
import type { Order } from "@/generated/prisma/client";
import { buildWorld, resetDb, type World } from "./world";

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const ENV = { ONLINE_GATEWAY: "YOCO", YOCO_SECRET_KEY: "sk_live_integration_only", YOCO_WEBHOOK_SECRET: SECRET };
const address = { addressLine: "14 Jacaranda Street", suburb: "Hatfield", city: "Pretoria", province: "GP" as const, postalCode: "0083" };
type Note = { note?: string };

let w: World;
let n = 0;
const actor = () => ({ type: "USER" as const, id: w.manager.id, name: w.manager.name });
const member = () =>
  db.customer.create({ data: { memberNo: `HH77${String(++n).padStart(5, "0")}`, phone: `+2782700${String(n).padStart(4, "0")}`, firstName: `Yoco ${n}`, referralCode: `YOC${n}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date() } });
const courierOrder = async () => placeOrder({ customerId: (await member()).id, fulfilment: "COURIER", address, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "ONLINE" });
const due = (o: { totalCents: number; pointsRedeemed: number }) => o.totalCents - o.pointsRedeemed * 100;
const lastNote = async (id: string) => ((await db.order.findUniqueOrThrow({ where: { id } })).events as Note[]).at(-1)?.note;

/** Yoco's API, mocked: records each call and answers with `reply`. */
function mockYoco(reply: (url: string) => { status?: number; json: unknown }) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      const r = reply(url);
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}
const checkoutReply = (id: string) => () => ({ json: { id, status: "created", currency: "ZAR", redirectUrl: `https://c.yoco.com/checkout/${id}`, paymentId: null, processingMode: "live" } });

/** A webhook delivery as Yoco sends it: webhook-id, webhook-timestamp and webhook-signature over the raw body. */
function deliver(event: object, opts: { secret?: string; at?: number; tamper?: boolean } = {}) {
  const raw = JSON.stringify(event);
  const id = `msg_${randomUUID()}`;
  const ts = Math.floor((opts.at ?? Date.now()) / 1000);
  const sig = createHmac("sha256", Buffer.from((opts.secret ?? SECRET).split("_")[1], "base64")).update(`${id}.${ts}.${raw}`).digest("base64");
  return POST(
    new Request("http://app/api/payments/yoco", {
      method: "POST",
      headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${sig}` },
      body: opts.tamper ? raw.replace(/"amount":\d+/, '"amount":1') : raw,
    }),
  );
}
const call = async (res: Promise<Response>) => {
  const r = await res;
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
/** Yoco's payment notification for a checkout (metadata = ours + Yoco's checkoutId). */
const payment = (o: { id: string; code: string }, checkoutId: string, amount: number, over: object = {}) => ({
  createdDate: new Date().toISOString(),
  id: `evt_${randomUUID()}`,
  type: "payment.succeeded",
  payload: {
    id: `p_${randomUUID().slice(0, 8)}`, type: "payment", status: "succeeded", mode: "live", amount, currency: "ZAR", createdDate: new Date().toISOString(),
    metadata: { checkoutId, orderId: o.id, orderCode: o.code },
    paymentMethodDetails: { type: "card", card: { expiryMonth: 11, expiryYear: 2029, maskedCard: "535353******5353", scheme: "mastercard" } },
  },
  ...over,
});

beforeAll(async () => {
  Object.assign(process.env, ENV);
  await resetDb();
  w = await buildWorld();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(async () => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  await db.$disconnect();
});

describe("Delivery-first launch", () => {
  it("offers courier delivery only before any store trades, ships from the warehouse and places the order", async () => {
    await db.store.updateMany({ where: { kind: "RETAIL" }, data: { status: "OPENING_SOON" } });
    const cands = await routingCandidates([w.oilV.id]);
    expect(cands.map((c) => c.id)).toEqual([w.dc.id]);
    expect(offeredFulfilment(cands)).toEqual({ options: ["COURIER"], deliveryOnly: true });

    const o = await courierOrder();
    expect(o).toMatchObject({ storeId: w.dc.id, fulfilment: "COURIER", status: "PENDING_PAYMENT", paymentStatus: "UNPAID", routingNote: "Ships from Test DC" });
    // What checkout doesn't offer, the server doesn't take either.
    await expect(placeOrder({ customerId: o.customerId, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "IN_STORE" })).rejects.toThrow();
  });
});

describe("Yoco online payments", () => {
  let order: Order;

  it("creates the order's checkout once (Idempotency-Key = order id) and reuses it", async () => {
    order = await courierOrder();
    const calls = mockYoco(checkoutReply("ch_int_1"));
    expect(await yocoCheckoutFor(order, "https://shop.example/")).toMatchObject({ created: true, checkout: { id: "ch_int_1", redirectUrl: "https://c.yoco.com/checkout/ch_int_1" } });
    expect(calls[0]).toEqual({
      url: "https://payments.yoco.com/api/checkouts",
      headers: { Authorization: "Bearer sk_live_integration_only", "Content-Type": "application/json", "Idempotency-Key": order.id },
      body: {
        amount: due(order), currency: "ZAR",
        successUrl: `https://shop.example/orders/${order.code}?pay=success`, cancelUrl: `https://shop.example/orders/${order.code}?pay=cancelled`, failureUrl: `https://shop.example/orders/${order.code}?pay=failed`,
        metadata: { orderId: order.id, orderCode: order.code }, externalId: order.code,
      },
    });
    order = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(order.paymentRef).toBe("ch_int_1");
    // Back again (a retry, or after cancelling on Yoco's page): the same key, so Yoco replays the same checkout.
    expect(await yocoCheckoutFor(order, "https://shop.example")).toMatchObject({ created: false, checkout: { id: "ch_int_1" } });
    expect(calls[1]).toEqual(calls[0]);
  });

  it("the webhook marks the order paid; a redelivery changes nothing", async () => {
    const res = await call(deliver(payment(order, "ch_int_1", due(order))));
    expect(res).toMatchObject({ status: 200, body: { ok: true, action: "pay" } });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "PLACED", paymentStatus: "PAID", paymentRef: "ch_int_1" });
    expect(await lastNote(order.id)).toMatch(/^Paid with Yoco · Mastercard •••• 5353 · payment p_/);
    expect(await db.auditLog.findFirst({ where: { action: "order.pay_online", entityId: order.id } })).toMatchObject({ actorName: "Yoco", data: { gateway: "YOCO", checkoutId: "ch_int_1", amount: due(order) } });
    const texts = () => db.messageLog.count({ where: { customerId: order.customerId, body: { contains: `order ${order.code} received` } } });
    expect(await texts()).toBe(1);

    expect(await call(deliver(payment(order, "ch_int_1", due(order))))).toMatchObject({ status: 200, body: { action: "repeat" } });
    expect(await texts()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "order.pay_online", entityId: order.id } })).toBe(1);
  });

  it("refuses what Yoco didn't sign, and flags payments that don't match the order", async () => {
    const o = await courierOrder();
    await db.order.update({ where: { id: o.id }, data: { paymentRef: "ch_int_2" } });
    const good = payment(o, "ch_int_2", due(o));
    expect((await deliver(good, { secret: `whsec_${randomBytes(24).toString("base64")}` })).status).toBe(400);
    expect((await deliver(good, { tamper: true })).status).toBe(400);
    expect((await deliver(good, { at: Date.now() - 6 * 60_000 })).status).toBe(400);
    // Signed, but short, or paid on another checkout: logged for a person, not paid.
    expect(await call(deliver(payment(o, "ch_int_2", due(o) - 100)))).toMatchObject({ status: 200, body: { action: "review" } });
    expect(await call(deliver(payment(o, "ch_int_9", due(o))))).toMatchObject({ status: 200, body: { action: "review" } });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "UNPAID" });
    expect(await db.auditLog.count({ where: { action: "payment.review", entityId: o.id } })).toBe(2);
    // Not our checkout, or an event we don't use: 200, so Yoco stops retrying.
    expect(await call(deliver({ ...good, payload: { ...good.payload, metadata: { checkoutId: "ch_someone_else" } } }))).toMatchObject({ status: 200, body: { action: "ignore" } });
    expect(await call(deliver({ ...good, type: "checkout.expired" }))).toMatchObject({ status: 200, body: { action: "ignore" } });
    // No secret configured yet: 503, so Yoco keeps retrying until it is.
    delete process.env.YOCO_WEBHOOK_SECRET;
    expect((await deliver(good)).status).toBe(503);
    process.env.YOCO_WEBHOOK_SECRET = SECRET;
  });

  it("cancelling a paid Yoco order refunds it in full first", async () => {
    const calls = mockYoco(() => ({ json: { id: "ch_int_1", refundId: "rfd_int_1", message: "Your refund has been processed", status: "succeeded" } }));
    await advanceOrder(order.id, "CANCELLED", actor(), { note: "Cancelled by HQ: out of stock" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://payments.yoco.com/api/checkouts/ch_int_1/refund",
      headers: { "Idempotency-Key": `${order.id}:refund` },
      body: { amount: due(order), metadata: { orderId: order.id, orderCode: order.code } },
    });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(await lastNote(order.id)).toMatch(/^Cancelled by HQ: out of stock · Refunded R[\d,.]+ by Yoco \(refund rfd_int_1, succeeded\)$/);
    expect(await db.auditLog.findFirst({ where: { action: "order.cancelled", entityId: order.id } })).toMatchObject({ data: { refundId: "rfd_int_1", refundStatus: "succeeded" } });
  });

  it("keeps the order when Yoco won't refund; a pending refund that later fails goes back to staff", async () => {
    const o = await courierOrder();
    mockYoco(checkoutReply("ch_int_3"));
    await yocoCheckoutFor(o, "https://shop.example");
    await deliver(payment(o, "ch_int_3", due(o)));

    mockYoco(() => ({ status: 403, json: { message: "A key is required, but has not been specified.", reason: "Missing key", solution: "Add the key" } }));
    await expect(advanceOrder(o.id, "CANCELLED", actor(), { note: "Cancelled by HQ: duplicate" })).rejects.toThrow(
      /^Yoco didn't refund R[\d,.]+, so the order hasn't been cancelled\. Yoco 403: A key is required/,
    );
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "PLACED", paymentStatus: "PAID" });

    mockYoco(() => ({ json: { id: "ch_int_3", refundId: "rfd_int_3", message: "Refund pending", status: "pending" } }));
    await advanceOrder(o.id, "CANCELLED", actor(), { note: "Cancelled by HQ: duplicate" });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(await lastNote(o.id)).toMatch(/refund rfd_int_3, pending/);

    // Yoco reports later that the refund failed: the payment is back on the order, for staff to refund by hand.
    const refundFailed = {
      createdDate: new Date().toISOString(), id: `evt_${randomUUID()}`, type: "refund.failed",
      payload: { id: "rfd_int_3", type: "refund", status: "failed", mode: "live", amount: due(o), currency: "ZAR", createdDate: new Date().toISOString(), failureReason: "Card account closed", metadata: { checkoutId: "ch_int_3", orderId: o.id } },
    };
    expect(await call(deliver(refundFailed))).toMatchObject({ status: 200, body: { action: "logged" } });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "PAID" });
    expect(await lastNote(o.id)).toBe("Yoco refund failed (Card account closed): refund the member by hand");
    expect(await db.auditLog.count({ where: { action: "payment.refund_failed", entityId: o.id } })).toBe(1);
  });

  it("doesn't call Yoco to refund test payments (test keys can't refund)", async () => {
    const o = await courierOrder();
    mockYoco(checkoutReply("ch_int_4"));
    await yocoCheckoutFor(o, "https://shop.example");
    await deliver(payment(o, "ch_int_4", due(o)));
    process.env.YOCO_SECRET_KEY = "sk_test_integration_only";
    const calls = mockYoco(() => ({ status: 500, json: {} }));
    await advanceOrder(o.id, "CANCELLED", actor(), { note: "Cancelled by HQ: test order" });
    process.env.YOCO_SECRET_KEY = ENV.YOCO_SECRET_KEY;
    expect(calls).toHaveLength(0);
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(await lastNote(o.id)).toMatch(/Yoco test payment: nothing to refund/);
  });
});

describe("Till: Yoco card machine", () => {
  it("records a card sale taken on the Yoco machine while the till is offline, with the machine's reference", async () => {
    await db.store.update({ where: { id: w.store.id }, data: { status: "ACTIVE" } });
    const m = await member();
    const lines = [{ variantId: w.coffeeV.id, qty: 1 }];
    const q = await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId: m.id });
    const t = cardMachineTender("YOCO", q.totalCents, "8F3K-22019", "4242");
    if ("error" in t) throw new Error(t.error);
    const r = await postPosSale(
      { id: randomUUID(), number: "TST01-Y00001", customerId: m.id, lines, payments: [t.tender], ageCheck: "ID_SIGHTED", offline: true, createdAt: new Date(Date.now() - 60_000).toISOString() },
      { storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Staff" },
    );
    expect(r.sale).toMatchObject({ offline: true, totalCents: q.totalCents });
    expect(await db.payment.findMany({ where: { saleId: r.sale.id }, select: { method: true, provider: true, reference: true, cardLast4: true, amountCents: true } })).toEqual([
      { method: "CARD", provider: "YOCO", reference: "8F3K-22019", cardLast4: "4242", amountCents: q.totalCents },
    ]);
    expect(await db.auditLog.count({ where: { action: "sale.tender_variance", entityId: r.sale.id } })).toBe(0);
  });
});
