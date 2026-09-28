// Peach Payments (Peach Orchestration, Hosted Checkout): the order's payment and its reuse, the webhook route marking an
// order paid, a status query finding a payment before its webhook, and refunds when a paid order is cancelled.
// Peach is never called: global fetch is a small in-memory Peach, and webhooks are signed here with Peach's documented
// scheme (hex HMAC-SHA512 of the raw body, keyed with the profile's payment_response_hash_key).
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { advanceOrder, peachCheckoutFor, placeOrder } from "@/server/orders";
import { POST } from "@/app/api/payments/peach/route";
import type { PeachPayment, PeachRefund } from "@/lib/peach";
import type { Order } from "@/generated/prisma/client";
import { buildWorld, resetDb, type World } from "./world";

const KEY = randomBytes(32).toString("hex");
const ENV = { ONLINE_GATEWAY: "PEACH", PEACH_API_KEY: "snd_integration_only", PEACH_PAYMENT_RESPONSE_HASH_KEY: KEY };
const API = "https://app.sandbox-next.peachpayments.com/api"; // PEACH_ENV unset = test = the sandbox
const address = { addressLine: "9 Protea Road", suburb: "Brooklyn", city: "Pretoria", province: "GP" as const, postalCode: "0181" };
type Note = { note?: string };

let w: World;
let n = 0;
const actor = () => ({ type: "USER" as const, id: w.manager.id, name: w.manager.name });
const member = () =>
  db.customer.create({ data: { memberNo: `HH78${String(++n).padStart(5, "0")}`, phone: `+2782800${String(n).padStart(4, "0")}`, firstName: `Peach ${n}`, referralCode: `PCH${n}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date() } });
const courierOrder = async () => placeOrder({ customerId: (await member()).id, fulfilment: "COURIER", address, items: [{ variantId: w.oilV.id, qty: 1 }], payMethod: "ONLINE" });
const due = (o: { totalCents: number; pointsRedeemed: number }) => o.totalCents - o.pointsRedeemed * 100;
const fresh = (id: string) => db.order.findUniqueOrThrow({ where: { id } });
const lastNote = async (id: string) => ((await fresh(id)).events as Note[]).at(-1)?.note;

type Call = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null };
const fail = (status: number, message: string) => ({ status, json: { error: { type: "invalid_request", message, code: "IR_00" } } });

/** Peach's API in memory: payments (payment_id unique), status queries, refunds. `refund` answers POST /refunds. */
function fakePeach(refund: (b: Record<string, unknown>) => { status?: number; json: unknown } = (b) => ({ json: { refund_id: `ref_${randomUUID().slice(0, 8)}`, payment_id: b.payment_id, amount: b.amount, currency: "ZAR", status: "pending", metadata: b.metadata } })) {
  const payments = new Map<string, PeachPayment>();
  const refunds: PeachRefund[] = [];
  const calls: Call[] = [];
  const answer = (c: Call): { status?: number; json: unknown } => {
    const path = c.url.slice(API.length);
    const b = c.body ?? {};
    if (!c.url.startsWith(API) || c.headers["api-key"] !== ENV.PEACH_API_KEY) return fail(401, "API key not provided or invalid API key used");
    if (c.method === "POST" && path === "/payments") {
      const id = String(b.payment_id);
      if (payments.has(id)) return fail(400, "The payment with the specified payment_id already exists in our records");
      const p = {
        payment_id: id, status: "requires_payment_method", amount: Number(b.amount), amount_received: null, currency: String(b.currency), metadata: b.metadata as Record<string, unknown>,
        merchant_order_reference_id: String(b.merchant_order_reference_id), payment_link: { link: `https://app.sandbox-next.peachpayments.com/api/payment_link/merchant_1/${id}`, payment_link_id: `plink_${id.slice(-6)}` },
        expires_on: new Date(Date.now() + Number(b.session_expiry) * 1000).toISOString(),
      };
      payments.set(id, p);
      return { json: p };
    }
    const status = path.match(/^\/payments\/([^/?]+)\?force_sync=true$/);
    if (c.method === "GET" && status) return payments.has(status[1]) ? { json: payments.get(status[1]) } : fail(404, "Payment does not exist in our records");
    if (c.method === "POST" && path === "/refunds/list") {
      const data = refunds.filter((r) => r.payment_id === b.payment_id);
      return { json: { count: data.length, total_count: data.length, data } };
    }
    if (c.method === "POST" && path === "/refunds") {
      const r = refund(b);
      if (!r.status || r.status < 300) refunds.push(r.json as PeachRefund);
      return r;
    }
    return fail(404, "Unrecognized request URL");
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const c = { url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null };
      calls.push(c);
      const r = answer(c);
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  /** The member pays on Peach's page. */
  const pay = (id: string, over: Partial<PeachPayment> = {}) => {
    const p = payments.get(id)!;
    Object.assign(p, { status: "succeeded", amount_received: p.amount, payment_method: "card", payment_method_type: "credit", payment_method_data: { card: { last4: "4242", card_network: "Visa" } }, ...over });
    return p;
  };
  return { calls, payments, refunds, pay };
}

/** A webhook delivery as Peach sends it: the raw JSON body, signed in x-webhook-signature-512. */
function deliver(event: object, opts: { key?: string; tamper?: boolean; signature?: string | null } = {}) {
  const raw = JSON.stringify(event);
  const signature = opts.signature !== undefined ? opts.signature : createHmac("sha512", opts.key ?? KEY).update(raw).digest("hex");
  return POST(
    new Request("http://app/api/payments/peach", {
      method: "POST",
      headers: { "content-type": "application/json", ...(signature ? { "x-webhook-signature-512": signature } : {}) },
      body: opts.tamper ? raw.replace(/"amount":\d+/, '"amount":1') : raw,
    }),
  );
}
const call = async (res: Promise<Response>) => {
  const r = await res;
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
const webhook = (event_type: string, object: object, type = "payment_details") => ({ merchant_id: "merchant_1", event_id: `evt_${randomUUID()}`, event_type, content: { type, object }, timestamp: new Date().toISOString() });
/** Peach's payment_succeeded for one of our payments (content.object is the payment, with our metadata). */
const succeeded = (o: { id: string; code: string }, paymentId: string, amount: number, over: object = {}) =>
  webhook("payment_succeeded", {
    payment_id: paymentId, merchant_id: "merchant_1", status: "succeeded", amount, net_amount: amount, amount_capturable: 0, amount_received: amount, currency: "ZAR",
    payment_method: "card", payment_method_type: "credit", payment_method_data: { card: { last4: "4242", card_network: "Visa", card_type: "credit" } },
    metadata: { orderId: o.id, orderCode: o.code }, merchant_order_reference_id: o.code, attempt_count: 1, connector: "peachpayments", profile_id: "pro_1", ...over,
  });

beforeAll(async () => {
  Object.assign(process.env, ENV);
  delete process.env.PEACH_ENV;
  delete process.env.PEACH_PROFILE_ID;
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

describe("Peach Payments: the order's payment", () => {
  it("creates it once, with our own payment_id, for the amount due, and sends the member back to the same page", async () => {
    const order = await courierOrder();
    const peach = fakePeach();
    const first = await peachCheckoutFor(order, "https://shop.example/");
    expect(first).toMatchObject({ step: "open", created: true, dueCents: due(order), mode: "test", checkoutId: expect.stringMatching(/^pay_[0-9a-f]{25}0$/) });
    if (first.step !== "open") throw new Error("no page");
    expect(first.url).toBe(`https://app.sandbox-next.peachpayments.com/api/payment_link/merchant_1/${first.checkoutId}`);
    expect(peach.calls).toHaveLength(1); // no payment yet, so no status query
    expect(peach.calls[0]).toEqual({
      url: `${API}/payments`,
      method: "POST",
      headers: { "api-key": "snd_integration_only", "Content-Type": "application/json", Accept: "application/json" },
      body: {
        payment_id: first.checkoutId, amount: due(order), currency: "ZAR", confirm: false, capture_method: "automatic", payment_link: true, session_expiry: expect.any(Number),
        return_url: `https://shop.example/orders/${order.code}?pay=peach`, merchant_order_reference_id: order.code, description: `Herbal Holland order ${order.code}`,
        metadata: { orderId: order.id, orderCode: order.code }, payment_link_config: { seller_name: "Herbal Holland", theme: "#F5913C" },
      },
    });
    // Peach's page closes when the order's payment window does (60 minutes from placing it).
    expect(peach.calls[0].body!.session_expiry).toBeGreaterThan(59 * 60);
    expect(peach.calls[0].body!.session_expiry).toBeLessThanOrEqual(60 * 60);
    expect((await fresh(order.id)).paymentRef).toBe(first.checkoutId);

    // Back again (Try again, or after leaving Peach's page): a status query, and the same page.
    expect(await peachCheckoutFor(await fresh(order.id), "https://shop.example")).toEqual({ ...first, created: false });
    expect(peach.calls[1]).toMatchObject({ url: `${API}/payments/${first.checkoutId}?force_sync=true`, method: "GET", headers: { "api-key": "snd_integration_only" }, body: null });
    expect(peach.calls).toHaveLength(2);

    // The page expired (or the payment failed): the next payment id, and the order keeps that one.
    peach.payments.get(first.checkoutId)!.status = "expired";
    const second = await peachCheckoutFor(await fresh(order.id), "https://shop.example");
    expect(second).toMatchObject({ step: "open", created: true, checkoutId: `${first.checkoutId.slice(0, 29)}1` });
    expect((await fresh(order.id)).paymentRef).toBe(`${first.checkoutId.slice(0, 29)}1`);
  });

  it("opens one payment, not two, when the member clicks twice at once", async () => {
    const order = await courierOrder();
    const peach = fakePeach();
    const [a, b] = await Promise.all([peachCheckoutFor(order, "https://shop.example"), peachCheckoutFor(order, "https://shop.example")]);
    expect(peach.payments.size).toBe(1);
    expect(a).toMatchObject({ step: "open" });
    expect(b).toMatchObject({ step: "open" });
    if (a.step !== "open" || b.step !== "open") throw new Error("no page");
    expect(b.checkoutId).toBe(a.checkoutId);
    expect(b.url).toBe(a.url);
    expect([a.created, b.created].sort()).toEqual([false, true]); // Peach refused the second payment_id; it's the same payment
    expect((await fresh(order.id)).paymentRef).toBe(a.checkoutId);
  });

  it("says why when Peach isn't reachable or set up, and opens nothing", async () => {
    const order = await courierOrder();
    fakePeach();
    delete process.env.PEACH_API_KEY;
    await expect(peachCheckoutFor(order, "https://shop.example")).rejects.toThrow("Peach Payments isn't set up (PEACH_API_KEY)");
    process.env.PEACH_API_KEY = "snd_wrong_key";
    await expect(peachCheckoutFor(order, "https://shop.example")).rejects.toThrow(/^Peach 401: API key not provided or invalid/);
    process.env.PEACH_API_KEY = ENV.PEACH_API_KEY;
    expect((await fresh(order.id)).paymentRef).toBeNull();
  });
});

describe("Peach Payments: webhooks", () => {
  let order: Order;
  let paymentId: string;

  it("marks the order paid; a redelivery changes nothing", async () => {
    order = await courierOrder();
    const peach = fakePeach();
    const c = await peachCheckoutFor(order, "https://shop.example");
    if (c.step !== "open") throw new Error("no page");
    paymentId = c.checkoutId;
    peach.pay(paymentId);

    const res = await call(deliver(succeeded(order, paymentId, due(order))));
    expect(res).toEqual({ status: 200, body: { ok: true, action: "pay", reason: "Checkout and amount match the order" } });
    expect(await fresh(order.id)).toMatchObject({ status: "PLACED", paymentStatus: "PAID", paymentRef: paymentId });
    expect(await lastNote(order.id)).toBe(`Paid with Peach Payments · Visa •••• 4242 · payment ${paymentId}`);
    expect(await db.auditLog.findFirst({ where: { action: "order.pay_online", entityId: order.id } })).toMatchObject({
      actorName: "Peach Payments", data: { gateway: "PEACH", type: "payment_succeeded", checkoutId: paymentId, amount: due(order), mode: "test", method: "Visa •••• 4242" },
    });
    const texts = () => db.messageLog.count({ where: { customerId: order.customerId, body: { contains: `order ${order.code} received` } } });
    expect(await texts()).toBe(1);

    expect(await call(deliver(succeeded(order, paymentId, due(order))))).toMatchObject({ status: 200, body: { action: "repeat" } });
    expect(await texts()).toBe(1);
    expect(await db.auditLog.count({ where: { action: "order.pay_online", entityId: order.id } })).toBe(1);
  });

  it("refuses what Peach didn't sign, and flags payments that don't match the order", async () => {
    const o = await courierOrder();
    await db.order.update({ where: { id: o.id }, data: { paymentRef: "pay_int_2" } });
    const good = succeeded(o, "pay_int_2", due(o));
    expect((await deliver(good, { key: randomBytes(32).toString("hex") })).status).toBe(401);
    expect((await deliver(good, { tamper: true })).status).toBe(401);
    expect((await deliver(good, { signature: null })).status).toBe(401);
    expect((await deliver(good, { signature: createHmac("sha256", KEY).update(JSON.stringify(good)).digest("hex") })).status).toBe(401);
    expect(await call(deliver({ hello: "peach" }))).toMatchObject({ status: 400, body: { error: "Unreadable event" } }); // signed, but not an event
    // Signed, but short, or paid on another payment than the order's: logged for a person, not paid.
    expect(await call(deliver(succeeded(o, "pay_int_2", due(o) - 100)))).toMatchObject({ status: 200, body: { action: "review", reason: expect.stringMatching(/^Paid R[\d,.]+, but R[\d,.]+ is due$/) } });
    expect(await call(deliver(succeeded(o, "pay_int_9", due(o))))).toMatchObject({ status: 200, body: { action: "review" } });
    expect(await fresh(o.id)).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "UNPAID" });
    expect(await db.auditLog.count({ where: { action: "payment.review", entityId: o.id, actorName: "Peach Payments" } })).toBe(2);
    // Not ours (a payment link made in the Dashboard), or an event we don't use: 200, so Peach stops retrying.
    expect(await call(deliver(succeeded(o, "pay_someone_else", 5_000, { metadata: null, merchant_order_reference_id: null })))).toMatchObject({ status: 200, body: { action: "ignore" } });
    expect(await call(deliver({ ...good, event_type: "payment_processing" }))).toMatchObject({ status: 200, body: { action: "ignore" } });
    // No key configured yet: 503, so Peach keeps retrying until it is.
    delete process.env.PEACH_PAYMENT_RESPONSE_HASH_KEY;
    expect((await deliver(good)).status).toBe(503);
    process.env.PEACH_PAYMENT_RESPONSE_HASH_KEY = KEY;
  });

  it("the pay page finds a payment that went through before its webhook, and opens none while Peach is processing", async () => {
    const o = await courierOrder();
    const peach = fakePeach();
    const c = await peachCheckoutFor(o, "https://shop.example");
    if (c.step !== "open") throw new Error("no page");
    peach.payments.get(c.checkoutId)!.status = "processing"; // e.g. PayShap, not confirmed yet
    expect(await peachCheckoutFor(await fresh(o.id), "https://shop.example")).toEqual({ step: "wait" });
    peach.pay(c.checkoutId);
    expect(await peachCheckoutFor(await fresh(o.id), "https://shop.example")).toEqual({ step: "paid" });
    expect(peach.calls.filter((x) => x.method === "POST")).toHaveLength(1);
    expect(await fresh(o.id)).toMatchObject({ status: "PLACED", paymentStatus: "PAID", paymentRef: c.checkoutId });
    expect(await db.auditLog.findFirst({ where: { action: "order.pay_online", entityId: o.id } })).toMatchObject({ actorName: "Peach Payments", data: { gateway: "PEACH", type: "payment_status", event: null } });
    // Its webhook lands later: nothing more to do.
    expect(await call(deliver(succeeded(o, c.checkoutId, due(o))))).toMatchObject({ status: 200, body: { action: "repeat" } });
  });

  it("cancelling a paid Peach order refunds it in full first", async () => {
    const peach = fakePeach();
    await advanceOrder(order.id, "CANCELLED", actor(), { note: "Cancelled by HQ: out of stock" });
    expect(peach.calls.map((c) => [c.method, c.url])).toEqual([["POST", `${API}/refunds/list`], ["POST", `${API}/refunds`]]);
    expect(peach.calls[0].body).toEqual({ payment_id: paymentId });
    expect(peach.calls[1].body).toEqual({ payment_id: paymentId, amount: due(order), reason: `Order ${order.code} cancelled`, metadata: { orderId: order.id, orderCode: order.code } });
    const refundId = peach.refunds[0].refund_id;
    expect(await fresh(order.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(await lastNote(order.id)).toMatch(new RegExp(`^Cancelled by HQ: out of stock · Refunded R[\\d,.]+ by Peach Payments \\(refund ${refundId}, pending\\)$`));
    expect(await db.auditLog.findFirst({ where: { action: "order.cancelled", entityId: order.id } })).toMatchObject({ data: { refundId, refundStatus: "pending", amount: due(order) } });

    // Peach confirms the refund later: logged.
    const done = webhook("refund_succeeded", { ...peach.refunds[0], status: "succeeded" }, "refund_details");
    expect(await call(deliver(done))).toMatchObject({ status: 200, body: { action: "logged", reason: "payment.refunded" } });
    expect(await db.auditLog.count({ where: { action: "payment.refunded", entityId: order.id } })).toBe(1);
  });

  it("never refunds twice: a retried cancel counts what's already refunded, and refunds only the rest", async () => {
    const paidOrder = async () => {
      const o = await courierOrder();
      const peach = fakePeach();
      const c = await peachCheckoutFor(o, "https://shop.example");
      if (c.step !== "open") throw new Error("no page");
      peach.pay(c.checkoutId);
      await deliver(succeeded(o, c.checkoutId, due(o)));
      return { o, paymentId: c.checkoutId };
    };
    // The refund went through, but the cancel didn't finish (a crash, a timeout): cancelling again refunds nothing more.
    const a = await paidOrder();
    const peachA = fakePeach();
    peachA.refunds.push({ refund_id: "ref_earlier", payment_id: a.paymentId, amount: due(a.o), currency: "ZAR", status: "succeeded" });
    await advanceOrder(a.o.id, "CANCELLED", actor(), { note: "Cancelled by HQ: duplicate" });
    expect(peachA.calls.map((c) => c.url)).toEqual([`${API}/refunds/list`]);
    expect(await fresh(a.o.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect(await lastNote(a.o.id)).toMatch(/by Peach Payments \(refund ref_earlier, succeeded\)$/);

    // Part refunded in the Peach Dashboard first: the cancel refunds the rest.
    const b = await paidOrder();
    const peachB = fakePeach();
    peachB.refunds.push({ refund_id: "ref_part", payment_id: b.paymentId, amount: 10_000, currency: "ZAR", status: "succeeded" }, { refund_id: "ref_no", payment_id: b.paymentId, amount: 5_000, currency: "ZAR", status: "failed" });
    await advanceOrder(b.o.id, "CANCELLED", actor(), { note: "Cancelled by HQ: member asked" });
    expect(peachB.calls[1].body).toMatchObject({ payment_id: b.paymentId, amount: due(b.o) - 10_000 });
    expect(await lastNote(b.o.id)).toMatch(/by Peach Payments \(refund ref_part, ref_\w+, pending\)$/);
  });

  it("keeps the order when Peach won't refund; a refund that later fails goes back to staff", async () => {
    const o = await courierOrder();
    let peach = fakePeach();
    const c = await peachCheckoutFor(o, "https://shop.example");
    if (c.step !== "open") throw new Error("no page");
    peach.pay(c.checkoutId, { payment_method: "bank_transfer", payment_method_type: "capitec_pay", payment_method_data: null });
    expect(await call(deliver(succeeded(o, c.checkoutId, due(o), { payment_method: "bank_transfer", payment_method_type: "capitec_pay", payment_method_data: null })))).toMatchObject({ body: { action: "pay" } });
    expect(await lastNote(o.id)).toBe(`Paid with Peach Payments · Capitec Pay · payment ${c.checkoutId}`);

    fakePeach(() => fail(400, "Refunds are not supported for this payment method"));
    await expect(advanceOrder(o.id, "CANCELLED", actor(), { note: "Cancelled by HQ: duplicate" })).rejects.toThrow(
      /^Peach Payments didn't refund R[\d,.]+, so the order hasn't been cancelled\. Peach 400: Refunds are not supported for this payment method$/,
    );
    fakePeach((b) => ({ json: { refund_id: "ref_int_x", payment_id: b.payment_id, amount: b.amount, currency: "ZAR", status: "failed", error_message: "Issuer declined the refund" } }));
    await expect(advanceOrder(o.id, "CANCELLED", actor(), { note: "Cancelled by HQ: duplicate" })).rejects.toThrow(/Issuer declined the refund$/);
    expect(await fresh(o.id)).toMatchObject({ status: "PLACED", paymentStatus: "PAID" });

    peach = fakePeach();
    await advanceOrder(o.id, "CANCELLED", actor(), { note: "Cancelled by HQ: duplicate" });
    expect(await fresh(o.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });

    // Peach reports later that the refund failed: the payment is back on the order, for staff to refund by hand.
    const refundFailed = webhook("refund_failed", { ...peach.refunds[0], status: "failed", error_message: "Card account closed" }, "refund_details");
    expect(await call(deliver(refundFailed))).toMatchObject({ status: 200, body: { action: "logged", reason: "payment.refund_failed" } });
    expect(await fresh(o.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "PAID" });
    expect(await lastNote(o.id)).toBe("Peach Payments refund failed (Card account closed): refund the member by hand");
    expect(await db.auditLog.count({ where: { action: "payment.refund_failed", entityId: o.id } })).toBe(1);
  });
});
