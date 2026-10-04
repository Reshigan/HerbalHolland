// Money races in checkout, payments and returns: requests that arrive at the same moment take effect once. Two
// checkouts for the last unit; a new member's welcome gift, a capped promotion's last use, a drop's per-member limit
// and a My Deal, each wanted twice at once; a webhook delivered twice; a payment landing as its order is cancelled; a
// return refunded twice; the merch job running twice; and the status-only races (returns, deposits, stock takes).
// Gateways are never called: global fetch is mocked, and webhooks are signed here with each gateway's scheme.
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db, tx } from "@/server/db";
import { SYSTEM } from "@/server/audit";
import { advanceOrder, markOrderPaid, onceForEvent, placeOrder, refundOrderAmount, yocoCheckoutFor } from "@/server/orders";
import { OfferError, redeemOffers } from "@/server/offers";
import { LoyaltyError } from "@/server/loyalty";
import { decideReturn, receiveReturn, refundReturn, requestReturn } from "@/server/returns";
import { recordDeposit, reviewDeposit } from "@/server/banking";
import { approveStockTake, availability, availKey, cancelStockTake, putStock, recordCounts, startStockTake } from "@/server/inventory";
import { submitMerchOrders } from "@/server/merch";
import { POST as yocoPost } from "@/app/api/payments/yoco/route";
import { POST as peachPost } from "@/app/api/payments/peach/route";
import type { PeachRefund } from "@/lib/peach";
import type { PodOrder } from "@/server/pod";
import { buildWorld, resetDb, type World } from "./world";

// The merch partner: production orders are recorded (and can be made to fail, or to take a moment).
const pod = vi.hoisted(() => ({ sent: [] as unknown[], fail: false, delayMs: 0 }));
vi.mock("@/server/pod", async (real) => ({
  ...(await real<typeof import("@/server/pod")>()),
  sendProductionOrder: async (o: unknown) => {
    await new Promise((r) => setTimeout(r, pod.delayMs));
    if (pod.fail) throw new Error("SMTP 421: try again later");
    pod.sent.push(o);
  },
}));
// A payment that lands as its order is cancelled: `race.beforeDue` runs once, just after the webhook has read the
// order and before it decides what the payment means (the expiry job cancelling it at that moment, say).
const race = vi.hoisted(() => ({ beforeDue: null as null | (() => Promise<unknown>) }));
vi.mock("@/server/shop/vouchers", async (real) => {
  const m = await real<typeof import("@/server/shop/vouchers")>();
  return {
    ...m,
    orderDue: async (o: { id: string; totalCents: number; pointsRedeemed: number }) => {
      const hook = race.beforeDue;
      race.beforeDue = null;
      if (hook) await hook();
      return m.orderDue(o);
    },
  };
});

const YOCO_SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const PEACH_KEY = randomBytes(32).toString("hex");
const ENV = {
  ONLINE_GATEWAY: "PEACH",
  PEACH_API_KEY: "snd_integration_only",
  PEACH_PAYMENT_RESPONSE_HASH_KEY: PEACH_KEY,
  YOCO_SECRET_KEY: "sk_live_integration_only",
  YOCO_WEBHOOK_SECRET: YOCO_SECRET,
};
const PEACH_API = "https://app.sandbox-next.peachpayments.com/api";
const address = { addressLine: "14 Jacaranda Street", suburb: "Hatfield", city: "Pretoria", province: "GP" as const, postalCode: "0083" };
const HQ = { kind: "HQ" as const };

let w: World;
let who: { type: "USER"; id: string; name: string };
let n = 0;
const member = (over: object = {}) => {
  n++;
  return db.customer.create({
    data: { memberNo: `HH55${String(n).padStart(5, "0")}`, phone: `+2782550${String(n).padStart(4, "0")}`, email: `race.${n}@example.co.za`, firstName: `Racer ${n}`, referralCode: `RAC${n}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date(), ...over },
  });
};
const collect = (customerId: string, variantId: string, qty = 1) => placeOrder({ customerId, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId, qty }], payMethod: "IN_STORE" });
const settled = async <T>(ps: Promise<T>[]) => {
  const all = await Promise.allSettled(ps);
  return {
    ok: all.filter((r): r is PromiseFulfilledResult<Awaited<T>> => r.status === "fulfilled").map((r) => r.value),
    errors: all.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String((r.reason as Error)?.message ?? r.reason)),
  };
};
const days = (d: number) => new Date(Date.now() + d * 86_400_000);
const due = (o: { totalCents: number; pointsRedeemed: number }) => o.totalCents - o.pointsRedeemed * 100;
const notes = async (id: string) => ((await db.order.findUniqueOrThrow({ where: { id } })).events as { note?: string }[]).map((e) => e.note ?? "");

/** One gateway's API, mocked: records each call and answers with `reply` (after `delayMs`, to hold a request open). */
function mockFetch(reply: (url: string, body: Record<string, unknown>) => { status?: number; json: unknown }, delayMs = 0) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, body });
      await new Promise((r) => setTimeout(r, delayMs));
      const r = reply(url, body);
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

/** Peach's refund API in memory: /refunds/list and /refunds (each refund held open for `delayMs`). */
function fakePeachRefunds(opts: { delayMs?: number; refuse?: string } = {}) {
  const refunds: PeachRefund[] = [];
  const calls = mockFetch((url, b) => {
    const path = url.slice(PEACH_API.length);
    if (path === "/refunds/list") return { json: { count: refunds.length, data: refunds.filter((r) => r.payment_id === b.payment_id) } };
    if (path === "/refunds") {
      if (opts.refuse) return { status: 400, json: { error: { message: opts.refuse } } };
      const r: PeachRefund = { refund_id: `ref_${randomUUID().slice(0, 8)}`, payment_id: String(b.payment_id), amount: Number(b.amount), currency: "ZAR", status: "succeeded" };
      refunds.push(r);
      return { json: r };
    }
    return { status: 404, json: { error: { message: "Unrecognized request URL" } } };
  }, opts.delayMs);
  return { refunds, calls, posts: () => calls.filter((c) => c.url === `${PEACH_API}/refunds`).length };
}

/** A Yoco webhook delivery (Standard Webhooks): `msgId` is Yoco's webhook-id, the same on every retry of a message. */
function yocoDeliver(event: object, msgId: string) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", Buffer.from(YOCO_SECRET.split("_")[1], "base64")).update(`${msgId}.${ts}.${raw}`).digest("base64");
  return yocoPost(new Request("http://app/api/payments/yoco", { method: "POST", headers: { "content-type": "application/json", "webhook-id": msgId, "webhook-timestamp": String(ts), "webhook-signature": `v1,${sig}` }, body: raw }));
}
/** A Peach webhook delivery: the raw body signed in x-webhook-signature-512. */
function peachDeliver(event: object) {
  const raw = JSON.stringify(event);
  return peachPost(new Request("http://app/api/payments/peach", { method: "POST", headers: { "content-type": "application/json", "x-webhook-signature-512": createHmac("sha512", PEACH_KEY).update(raw).digest("hex") }, body: raw }));
}
const body = async (res: Promise<Response>): Promise<Record<string, unknown> & { status: number }> => {
  const r = await res;
  return { ...((await r.json()) as Record<string, unknown>), status: r.status };
};
const yocoPayment = (o: { id: string; code: string }, checkoutId: string, amount: number) => ({
  id: `evt_${randomUUID()}`,
  type: "payment.succeeded",
  createdDate: new Date().toISOString(),
  payload: { id: `p_${randomUUID().slice(0, 8)}`, type: "payment", status: "succeeded", mode: "live", amount, currency: "ZAR", metadata: { checkoutId, orderId: o.id, orderCode: o.code }, paymentMethodDetails: { type: "card", card: { maskedCard: "424242******4242", scheme: "visa" } } },
});
const yocoRefundFailed = (o: { id: string }, checkoutId: string, amount: number) => ({
  id: `evt_${randomUUID()}`,
  type: "refund.failed",
  createdDate: new Date().toISOString(),
  payload: { id: `rfd_${randomUUID().slice(0, 8)}`, type: "refund", status: "failed", mode: "live", amount, currency: "ZAR", failureReason: "Card account closed", metadata: { checkoutId, orderId: o.id } },
});

/** A courier order paid through Yoco (checkout `checkoutId`), with Yoco's API mocked for the checkout. */
async function yocoPaidOrder(checkoutId: string) {
  const o = await placeOrder({ customerId: (await member()).id, fulfilment: "COURIER", address, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "ONLINE" });
  mockFetch(() => ({ json: { id: checkoutId, status: "created", currency: "ZAR", redirectUrl: `https://c.yoco.com/checkout/${checkoutId}`, processingMode: "live" } }));
  await yocoCheckoutFor(o, "https://shop.example");
  expect(await body(yocoDeliver(yocoPayment(o, checkoutId, due(o)), `msg_${randomUUID()}`))).toMatchObject({ status: 200, action: "pay" });
  return db.order.findUniqueOrThrow({ where: { id: o.id } });
}

/** A Peach-paid courier order (2 oils + 1 coffee), delivered, with a received return of one oil. */
async function receivedReturn() {
  const c = await member();
  const placed = await placeOrder({ customerId: c.id, fulfilment: "COURIER", address, items: [{ variantId: w.oilV.id, qty: 2 }, { variantId: w.coffeeV.id, qty: 1 }], payMethod: "ONLINE" });
  await markOrderPaid(placed.id, `pay_${randomUUID().slice(0, 8)}`);
  for (const s of ["PICKING", "READY", "OUT_FOR_DELIVERY"] as const) await advanceOrder(placed.id, s, who, { staffId: w.manager.id, courier: "The Courier Guy", trackingNo: "TCG1" });
  await advanceOrder(placed.id, "COMPLETED", who, { idChecked: true, staffId: w.manager.id });
  const ret = await requestReturn({ orderCode: placed.code, reason: "DEFECTIVE", items: [{ variantId: w.oilV.id, qty: 1 }], note: "The dropper leaks.", sealedConfirmed: false, photos: [] }, c);
  await decideReturn(ret.id, "APPROVED", "", who, HQ);
  await receiveReturn(ret.id, who, HQ);
  return { c, order: await db.order.findUniqueOrThrow({ where: { id: placed.id } }), ret };
}

beforeAll(async () => {
  Object.assign(process.env, ENV);
  delete process.env.PEACH_ENV;
  process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "hh-race-uploads-"));
  await resetDb();
  w = await buildWorld();
  who = { type: "USER", id: w.manager.id, name: w.manager.name };
  // Plenty of coffee at the store: several tests below buy it, and the races are about rules, not stock.
  const lot = await db.batch.create({ data: { variantId: w.coffeeV.id, code: "COF-RACE", supplier: "Test Farm", packedAt: days(-3), expiresAt: days(300) } });
  await tx((t) => putStock(t, { storeId: w.store.id, variantId: w.coffeeV.id, batchId: lot.id, qty: 40, unitCostCents: 11_000, type: "RECEIVE" }));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  race.beforeDue = null;
  // Promotions and drops made by a test end with it, even when it fails half-way.
  await db.promotion.updateMany({ where: { active: true }, data: { active: false } });
  await db.drop.deleteMany();
});
afterAll(async () => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  await new Promise((r) => setTimeout(r, 300));
  await db.$disconnect();
});

describe("checkouts at the same moment", () => {
  it("sells the last unit once when several members check out together", async () => {
    const cat = await db.category.create({ data: { slug: "grinders", name: "Grinders", icon: "Cog" } });
    const p = await db.product.create({ data: { slug: "last-grinder", name: "Last Grinder", categoryId: cat.id, description: "x", regClass: "ACCESSORY", effects: [], flavours: [], claims: [] } });
    const v = await db.variant.create({ data: { productId: p.id, sku: "ACC-LAST", name: "Black", priceCents: 25_000, wholesaleCents: 11_000, costCents: 8_000 } });
    const b = await db.batch.create({ data: { variantId: v.id, code: "GR-1", supplier: "Test Works", packedAt: days(-5) } });
    await tx((t) => putStock(t, { storeId: w.store.id, variantId: v.id, batchId: b.id, qty: 1, unitCostCents: 11_000, type: "RECEIVE" }));
    const shoppers = await Promise.all([member(), member(), member(), member()]);

    const r = await settled(shoppers.map((c) => collect(c.id, v.id)));
    expect(r.ok).toHaveLength(1);
    expect(r.errors).toHaveLength(3);
    for (const e of r.errors) expect(e).toMatch(/^Someone just bought the last Last Grinder · Black at Test Store — choose another store or fewer$|^Not everything is in stock at that store$/);
    expect(await db.orderLine.count({ where: { variantId: v.id } })).toBe(1);
    expect((await availability([w.store.id], [v.id])).get(availKey(w.store.id, v.id))).toMatchObject({ onHand: 1, reserved: 1, available: 0 });
  });

  it("keeps a welcome gift to one order when a new member checks out twice at once", async () => {
    const gift = await db.promotion.create({
      data: { name: "Welcome 10%", kind: "PERCENT", value: 10, productIds: [w.coffeeV.productId], channels: ["ONLINE"], firstPurchaseOnly: true, startsAt: days(-1), endsAt: days(1) },
    });
    const c = await member();
    const r = await settled([collect(c.id, w.coffeeV.id), collect(c.id, w.coffeeV.id)]);
    expect(r.ok).toHaveLength(1);
    expect(r.ok[0]).toMatchObject({ promotionId: gift.id });
    expect(r.ok[0].discountCents).toBeGreaterThan(0);
    expect(r.errors).toEqual(["Welcome 10% is for a member's first purchase only"]);
    expect(await db.order.count({ where: { customerId: c.id } })).toBe(1);
  });

  it("gives a capped promotion's last use to one of two members checking out together", async () => {
    const promo = await db.promotion.create({ data: { name: "First 1 shopper: 10% off coffee", kind: "PERCENT", value: 10, maxUses: 1, productIds: [w.coffeeV.productId], channels: ["ONLINE"], startsAt: days(-1), endsAt: days(1) } });
    const [a, b] = await Promise.all([member(), member()]);
    const r = await settled([collect(a.id, w.coffeeV.id), collect(b.id, w.coffeeV.id)]);
    expect(await db.order.count({ where: { promotionId: promo.id } })).toBe(1);
    // The other was refused at the last moment — or, had it priced after the first order, placed at full price.
    for (const e of r.errors) expect(e).toBe("First 1 shopper: 10% off coffee has been fully claimed");
    expect(r.ok.filter((o) => o.promotionId === promo.id)).toHaveLength(1);
  });

  it("holds a drop's per-member limit when the member checks out twice at once", async () => {
    await db.drop.create({ data: { slug: "race-drop", name: "Race drop", blurb: "x", variantIds: [w.coffeeV.id], startsAt: days(-1), perMemberLimit: 1 } });
    const c = await member();
    const r = await settled([collect(c.id, w.coffeeV.id), collect(c.id, w.coffeeV.id)]);
    expect(r.ok).toHaveLength(1);
    expect(r.errors).toEqual(["Race drop: limit 1 per member"]);
    expect(await db.order.count({ where: { customerId: c.id } })).toBe(1);
  });

  it("uses a My Deal on one order only, and the till hears why a second use is refused", async () => {
    const c = await member();
    const deal = await db.memberOffer.create({ data: { customerId: c.id, title: "20% off Test CBD Coffee", kind: "PERCENT", value: 20, productIds: [w.coffeeV.productId], startsAt: days(-1), endsAt: days(6) } });
    const r = await settled([collect(c.id, w.coffeeV.id), collect(c.id, w.coffeeV.id)]);
    expect(r.ok).toHaveLength(1);
    expect(r.errors).toEqual(["A My Deals offer in this basket was just used on another purchase — refresh to see the price without it"]);
    expect(await db.memberOffer.findUniqueOrThrow({ where: { id: deal.id } })).toMatchObject({ orderId: r.ok[0].id, redeemedAt: expect.any(Date) });
    expect((await db.orderLine.findFirstOrThrow({ where: { orderId: r.ok[0].id } })).offerCents).toBeGreaterThan(0);
    expect(await db.order.count({ where: { customerId: c.id } })).toBe(1);
    // A till sale posting the same deal stops the same way (a Rewards error, which the till shows as it is).
    const used = tx((t) => redeemOffers(t, [`offer:${deal.id}`], { saleId: "sale-x" }));
    await expect(used).rejects.toThrow(OfferError);
    await expect(used).rejects.toBeInstanceOf(LoyaltyError);
  });
});

describe("gateway webhooks", () => {
  it("handles a Yoco message once when it's delivered twice at the same moment", async () => {
    const o = await yocoPaidOrder("ch_race_1");
    mockFetch(() => ({ json: { id: "ch_race_1", refundId: "rfd_race_1", status: "pending" } }));
    await advanceOrder(o.id, "CANCELLED", who, { note: "Cancelled by HQ: duplicate" });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });

    const failed = yocoRefundFailed(o, "ch_race_1", due(o));
    const msgId = `msg_${randomUUID()}`;
    const [a, b] = await Promise.all([body(yocoDeliver(failed, msgId)), body(yocoDeliver(failed, msgId))]);
    expect([a.action, b.action].sort()).toEqual(["logged", "repeat"]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "PAID" });
    expect((await notes(o.id)).filter((x) => /refund failed/.test(x))).toHaveLength(1);
    expect(await db.auditLog.count({ where: { action: "payment.refund_failed", entityId: o.id } })).toBe(1);
    expect(await db.paymentEvent.count({ where: { gateway: "YOCO", eventId: msgId } })).toBe(1);
    // Yoco retries later (the same webhook-id): nothing again.
    expect(await body(yocoDeliver(failed, msgId))).toMatchObject({ status: 200, ok: true, action: "repeat" });
    expect(await db.auditLog.count({ where: { action: "payment.refund_failed", entityId: o.id } })).toBe(1);
  });

  it("puts a failed refund back on the order once, even when two refund failures arrive together", async () => {
    const o = await yocoPaidOrder("ch_race_2");
    mockFetch(() => ({ json: { id: "ch_race_2", refundId: "rfd_race_2", status: "pending" } }));
    await advanceOrder(o.id, "CANCELLED", who, { note: "Cancelled by HQ: duplicate" });
    // Two different messages (Yoco reporting the refund twice): the dedupe can't help, the flip itself happens once.
    await Promise.all([yocoDeliver(yocoRefundFailed(o, "ch_race_2", due(o)), `msg_${randomUUID()}`), yocoDeliver(yocoRefundFailed(o, "ch_race_2", due(o)), `msg_${randomUUID()}`)]);
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "PAID" });
    expect((await notes(o.id)).filter((x) => /refund failed/.test(x))).toHaveLength(1);
  });

  it("handles a Peach event once when Peach delivers it again", async () => {
    const o = await placeOrder({ customerId: (await member()).id, fulfilment: "COURIER", address, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "ONLINE" });
    await db.order.update({ where: { id: o.id }, data: { paymentRef: "pay_race_1" } });
    const event = {
      merchant_id: "merchant_1", event_id: `evt_${randomUUID()}`, event_type: "payment_succeeded", timestamp: new Date().toISOString(),
      content: { type: "payment_details", object: { payment_id: "pay_race_1", status: "succeeded", amount: due(o), amount_received: due(o), currency: "ZAR", payment_method_type: "credit", metadata: { orderId: o.id, orderCode: o.code } } },
    };
    const [a, b] = await Promise.all([body(peachDeliver(event)), body(peachDeliver(event))]);
    expect([a.action, b.action].sort()).toEqual(["pay", "repeat"]);
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "PLACED", paymentStatus: "PAID" });
    expect(await db.auditLog.count({ where: { action: "order.pay_online", entityId: o.id } })).toBe(1);
    expect(await db.messageLog.count({ where: { customerId: o.customerId, body: { contains: `order ${o.code} received` } } })).toBe(1);
  });

  it("lets the gateway's retry through when handling an event failed", async () => {
    await expect(onceForEvent("PEACH", "evt_flaky", async () => Promise.reject(new Error("database went away")))).rejects.toThrow("database went away");
    expect(await db.paymentEvent.count({ where: { eventId: "evt_flaky" } })).toBe(0);
    expect(await onceForEvent("PEACH", "evt_flaky", async () => ({ action: "ignore", reason: "handled on the retry" }))).toEqual({ action: "ignore", reason: "handled on the retry" });
    expect(await onceForEvent("PEACH", "evt_flaky", async () => ({ action: "ignore", reason: "again" }))).toMatchObject({ action: "repeat" });
    // The same id from the other gateway is another event.
    expect(await onceForEvent("YOCO", "evt_flaky", async () => ({ action: "ignore", reason: "Yoco's" }))).toEqual({ action: "ignore", reason: "Yoco's" });
  });
});

describe("a payment that lands as its order is cancelled", () => {
  it("is logged for HQ to refund by hand, never as paid", async () => {
    const o = await placeOrder({ customerId: (await member()).id, fulfilment: "COURIER", address, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "ONLINE" });
    mockFetch(() => ({ json: { id: "ch_late_1", status: "created", currency: "ZAR", redirectUrl: "https://c.yoco.com/checkout/ch_late_1", processingMode: "live" } }));
    await yocoCheckoutFor(o, "https://shop.example");
    // The expiry job cancels the order just after the webhook has read it as awaiting payment.
    race.beforeDue = () => advanceOrder(o.id, "CANCELLED", SYSTEM, { note: "Payment not received in time" });
    const res = await body(yocoDeliver(yocoPayment(o, "ch_late_1", due(o)), `msg_${randomUUID()}`));
    expect(res).toMatchObject({ status: 200, ok: true, action: "review", reason: "Paid after the order was cancelled: refund the member in the Yoco portal" });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "CANCELLED", paymentStatus: "UNPAID" });
    expect(await db.auditLog.count({ where: { action: "order.pay_online", entityId: o.id } })).toBe(0);
    expect(await db.auditLog.findFirst({ where: { action: "payment.review", entityId: o.id } })).toMatchObject({
      actorName: "Yoco", data: { checkoutId: "ch_late_1", amount: due(o), reason: "Paid after the order was cancelled: refund the member in the Yoco portal" },
    });
    expect(await db.messageLog.count({ where: { customerId: o.customerId, body: { contains: `order ${o.code} received` } } })).toBe(0);
    // Marking it paid now moves nothing, and says so.
    expect(await markOrderPaid(o.id, "ch_late_1")).toMatchObject({ moved: false, status: "CANCELLED" });
  });
});

describe("a return refunded twice at once", () => {
  it("calls the gateway once", async () => {
    const { order, ret } = await receivedReturn();
    const peach = fakePeachRefunds({ delayMs: 150 });
    const r = await settled([refundReturn(ret.id, { restock: {} }, who, HQ), refundReturn(ret.id, { restock: {} }, who, HQ)]);
    expect(r.ok).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^RT-\d{6} is already being refunded — refresh in a minute to see how it went$/);
    expect(peach.posts()).toBe(1);
    expect(await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } })).toMatchObject({ status: "REFUNDED", refundRef: peach.refunds[0].refund_id });
    expect(await db.auditLog.count({ where: { action: "order.refund", entityId: order.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "return.refund", entityId: ret.id } })).toBe(1);
  });

  it("lets go when the gateway refuses, and takes over a refund that died half-way", async () => {
    const { ret } = await receivedReturn();
    let peach = fakePeachRefunds({ refuse: "Refunds are not supported for this payment method" });
    await expect(refundReturn(ret.id, { restock: {} }, who, HQ)).rejects.toThrow(/^Peach Payments didn't refund R[\d,.]+\. Peach 400: Refunds are not supported/);
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } })).refundRef).toBeNull();

    // Someone else's refund is on its way: hands off.
    await db.returnRequest.update({ where: { id: ret.id }, data: { refundRef: "PENDING" } });
    peach = fakePeachRefunds();
    await expect(refundReturn(ret.id, { restock: {} }, who, HQ)).rejects.toThrow(/is already being refunded/);
    expect(peach.posts()).toBe(0);
    // That attempt died (a crash, a timeout) and its claim went stale: the next one takes over.
    await db.$executeRaw`UPDATE "ReturnRequest" SET "updatedAt" = now() - interval '11 minutes' WHERE id = ${ret.id}`;
    await refundReturn(ret.id, { restock: {} }, who, HQ);
    expect(peach.posts()).toBe(1);
    expect(await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } })).toMatchObject({ status: "REFUNDED", refundRef: peach.refunds[0].refund_id });
  });

  it("never sends money for a declined return, and can't decline one whose money is on its way", async () => {
    const a = await receivedReturn();
    await decideReturn(a.ret.id, "DECLINED", "The seal is broken.", who, HQ);
    const peach = fakePeachRefunds();
    // A refund that read the return just before it was declined:
    await expect(refundOrderAmount(a.order.id, 1_000, "late click", { returnId: a.ret.id, actor: who })).rejects.toThrow(/changed while you were on it/);
    expect(peach.posts()).toBe(0);

    const b = await receivedReturn();
    await db.returnRequest.update({ where: { id: b.ret.id }, data: { refundRef: "PENDING" } }); // the money is on its way
    await expect(decideReturn(b.ret.id, "DECLINED", "Changed our mind.", who, HQ)).rejects.toThrow(/^The refund for RT-\d{6} has already started, so it can't be declined now$/);
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: b.ret.id } })).status).toBe("RECEIVED");
  });
});

describe("status changes at the same moment: one wins", () => {
  it("a return: two decisions, or two receipts", async () => {
    const c = await member();
    const o = await collect(c.id, w.coffeeV.id, 2);
    for (const s of ["PICKING", "READY"] as const) await advanceOrder(o.id, s, who);
    await advanceOrder(o.id, "COMPLETED", who, { idChecked: true, staffId: w.manager.id, payments: [{ method: "CARD", amountCents: o.totalCents }] });
    const ret = await requestReturn({ orderCode: o.code, reason: "DEFECTIVE", items: [{ variantId: w.coffeeV.id, qty: 1 }], note: "Stale beans.", sealedConfirmed: false, photos: [] }, c);
    const d = await settled([decideReturn(ret.id, "APPROVED", "", who, HQ), decideReturn(ret.id, "DECLINED", "Opened food can't come back.", who, HQ)]);
    expect(d.ok).toHaveLength(1);
    expect(d.errors[0]).toMatch(/changed while you were on it|can't be/);
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe(d.ok[0].status);
    expect(await db.auditLog.count({ where: { entityId: ret.id, action: { in: ["return.approve", "return.decline"] } } })).toBe(1);

    if (d.ok[0].status === "APPROVED") {
      const rec = await settled([receiveReturn(ret.id, who, HQ), receiveReturn(ret.id, who, HQ)]);
      expect(rec.ok).toHaveLength(1);
      expect(await db.auditLog.count({ where: { entityId: ret.id, action: "return.receive" } })).toBe(1);
    }
  });

  it("a deposit: two checkers decide once, and a verified deposit stays verified", async () => {
    const owner = await db.user.create({ data: { name: "Olive Owner", email: "olive@example.co.za", role: "OWNER", companyId: w.owner.id } });
    const area = await db.user.create({ data: { name: "Ari Area", email: "ari@example.co.za", role: "AREA_MANAGER", regionId: w.region.id } });
    const s = await db.shift.create({ data: { storeId: w.store.id, openedById: w.manager.id, openedAt: days(-1), openingFloatCents: 100_000, closedById: w.manager.id, closedAt: days(-0.9), expectedCashCents: 250_000, countedCashCents: 250_000 } });
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70])], "slip.jpg", { type: "image/jpeg" });
    const dep = await recordDeposit({ storeId: w.store.id, storeCode: w.store.code, shiftIds: [s.id], amountCents: 150_000, bankedOn: new Date(), reference: "RACE-1", file: jpeg }, { type: "USER", id: w.manager.id, name: w.manager.name });
    const as = (u: { id: string; name: string }) => ({ type: "USER" as const, id: u.id, name: u.name });
    const r = await settled([reviewDeposit(dep.id, w.store.id, "VERIFIED", null, as(owner)), reviewDeposit(dep.id, w.store.id, "QUERIED", "The slip says R1,400", as(area))]);
    expect(r.ok).toHaveLength(1);
    expect(r.errors).toEqual([`${dep.number} was just checked by a colleague — refresh to see what they decided`]);
    const after = await db.cashDeposit.findUniqueOrThrow({ where: { id: dep.id } });
    expect(await db.auditLog.count({ where: { entityId: dep.id, action: { in: ["deposit.verify", "deposit.query"] } } })).toBe(1);
    if (after.status === "QUERIED") await reviewDeposit(dep.id, w.store.id, "VERIFIED", null, as(owner));
    expect((await db.cashDeposit.findUniqueOrThrow({ where: { id: dep.id } })).status).toBe("VERIFIED");
    await expect(reviewDeposit(dep.id, w.store.id, "QUERIED", "late", as(area))).rejects.toThrow(/verified and locked/);
  });

  it("a stock take: approving and cancelling at once", async () => {
    const st = await startStockTake(w.store.id, "coffee-drinks", true, w.manager.id, "ST-RACE1");
    const line = await db.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: st.id } });
    await recordCounts(w.store.id, st.id, [{ lineId: line.id, qty: line.expectedQty + 1 }]);
    const r = await settled<unknown>([tx((t) => approveStockTake(t, st.id, w.manager.id)), tx((t) => cancelStockTake(t, w.store.id, st.id))]);
    expect(r.ok).toHaveLength(1);
    const after = await db.stockTake.findUniqueOrThrow({ where: { id: st.id } });
    expect(["APPROVED", "CANCELLED"]).toContain(after.status);
    // The variance posted only if the approval won.
    expect(await db.stockMovement.count({ where: { stockTakeId: st.id } })).toBe(after.status === "APPROVED" ? 1 : 0);
    await expect(tx((t) => cancelStockTake(t, w.store.id, st.id))).rejects.toThrow(/closed a moment ago/);
  });

  it("the merch job: a production order goes once when two runs overlap, and again after a failed send", async () => {
    const cat = await db.category.create({ data: { slug: "race-apparel", name: "Apparel", icon: "Shirt" } });
    const p = await db.product.create({ data: { slug: "race-tee", name: "Race Tee", categoryId: cat.id, description: "x", regClass: "APPAREL", effects: [], flavours: [], claims: [] } });
    const tee = await db.variant.create({ data: { productId: p.id, sku: "APP-RACE-M", name: "M", priceCents: 45_000, wholesaleCents: 20_000, costCents: 24_000, podSku: "HH-RACE-M" } });
    const o = await placeOrder({ customerId: (await member()).id, fulfilment: "COURIER", items: [{ variantId: tee.id, qty: 1 }], payMethod: "ONLINE", address });
    await markOrderPaid(o.id, "SIM-EFT-RACE");

    pod.fail = true;
    expect(await submitMerchOrders()).toMatchObject({ done: 0, failed: 1 });
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ podRef: null, podStatus: null }); // let go: the next run tries again

    pod.fail = false;
    pod.delayMs = 150;
    const [a, b] = await Promise.all([submitMerchOrders(), submitMerchOrders()]);
    pod.delayMs = 0;
    expect(a.done + b.done).toBe(1);
    expect(pod.sent.filter((x) => (x as PodOrder).ref === o.code)).toHaveLength(1);
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ podRef: o.code, podStatus: "sent", status: "PICKING" });
  });
});
