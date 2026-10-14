// Peach Payments (Peach Orchestration, Hosted Checkout): webhook signatures (built here from Peach's documented scheme,
// independently of the code under test), webhook payloads → our facts, the shared decision rules, the payment we ask
// Peach for, our idempotent payment ids, what the pay page does with an existing payment, and the member's return.
import { createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { parsePeachEvent, peachEventKind, peachFacts, peachNextStep, peachPaymentId, peachPaymentRequest, peachReturn, verifyPeachWebhook, type PeachEvent, type PeachPayment } from "@/lib/peach";
import { cardLabel, decidePayment, possessive } from "@/lib/online-payments";
import { paidOnlineWith } from "@/server/payments";

// Peach's docs: x-webhook-signature-512 = hex(HMAC-SHA512(raw body)), keyed with the profile's payment_response_hash_key.
const KEY = randomBytes(32).toString("hex");
const sign = (key: string, body: string | Buffer) => createHmac("sha512", key).update(body).digest("hex");

describe("Peach webhook signatures", () => {
  const body = JSON.stringify({ merchant_id: "merchant_1", event_id: "evt_1", event_type: "payment_succeeded", content: { type: "payment_details", object: { payment_id: "pay_1", amount: 12_345 } } });

  it("accepts Peach's signature over the raw body", () => {
    expect(verifyPeachWebhook(KEY, sign(KEY, body), body)).toBe(true);
    expect(verifyPeachWebhook(KEY, sign(KEY, body), Buffer.from(body))).toBe(true);
    expect(verifyPeachWebhook(KEY, sign(KEY, body).toUpperCase(), body)).toBe(true); // hex either case
  });

  it("rejects a tampered body, another key, a missing or malformed header", () => {
    expect(verifyPeachWebhook(KEY, sign(KEY, body), body.replace("12345", "1"))).toBe(false);
    expect(verifyPeachWebhook(KEY, sign(KEY, body), `${body} `)).toBe(false);
    expect(verifyPeachWebhook(KEY, sign(KEY, body), JSON.stringify(JSON.parse(body), null, 2))).toBe(false); // same JSON, other bytes
    expect(verifyPeachWebhook(randomBytes(32).toString("hex"), sign(KEY, body), body)).toBe(false);
    expect(verifyPeachWebhook(KEY, null, body)).toBe(false);
    expect(verifyPeachWebhook(KEY, "", body)).toBe(false);
    expect(verifyPeachWebhook(KEY, sign(KEY, body).slice(0, 127), body)).toBe(false);
    expect(verifyPeachWebhook(KEY, `${sign(KEY, body).slice(0, 126)}zz`, body)).toBe(false);
    expect(verifyPeachWebhook(KEY, createHmac("sha256", KEY).update(body).digest("hex"), body)).toBe(false); // SHA-256 isn't Peach's scheme
    expect(verifyPeachWebhook(KEY, createHmac("sha512", KEY).update(body).digest("base64"), body)).toBe(false);
    expect(verifyPeachWebhook("", sign("", body), body)).toBe(false);
  });
});

// A payment object as Peach sends it: GET /payments/{id}, and a webhook's content.object.
const payment = (over: Partial<PeachPayment> = {}): PeachPayment => ({
  payment_id: "pay_abc",
  status: "succeeded",
  amount: 64_500,
  amount_received: 64_500,
  currency: "ZAR",
  metadata: { orderId: "ord_1", orderCode: "K7P2QD" },
  merchant_order_reference_id: "K7P2QD",
  payment_method: "card",
  payment_method_type: "credit",
  payment_method_data: { card: { last4: "4242", card_network: "Visa" } },
  ...over,
});
const event = (type: string, object: object, contentType = "payment_details"): PeachEvent => ({ event_id: "evt_9x", event_type: type, timestamp: "2026-09-28T10:00:00.000Z", content: { type: contentType, object: object as Record<string, unknown> } });

describe("Peach events → orders", () => {
  const order = { status: "PENDING_PAYMENT", paymentStatus: "UNPAID", paymentRef: "pay_abc", dueCents: 64_500 };
  const decide = (p: PeachPayment, o: typeof order | null = order) => decidePayment(peachFacts(event("payment_succeeded", p), "test"), o, "the Peach Dashboard");

  it("reads a webhook delivery", () => {
    const raw = JSON.stringify({ merchant_id: "merchant_1", ...event("payment_succeeded", payment()) });
    expect(parsePeachEvent(raw)).toMatchObject({ event_id: "evt_9x", event_type: "payment_succeeded", content: { type: "payment_details", object: { payment_id: "pay_abc" } } });
    expect(parsePeachEvent("{not json")).toBeNull();
    expect(parsePeachEvent(JSON.stringify({ event_id: "evt_1", event_type: "payment_succeeded" }))).toBeNull();
    expect(parsePeachEvent(JSON.stringify({ event_type: "payment_succeeded", content: { type: "payment_details", object: {} } }))?.event_id).toBeNull();
  });

  it("maps a payment to our order id, the payment (= checkout), the amount received and the card", () => {
    expect(peachFacts(event("payment_succeeded", payment()), "live")).toEqual({
      orderId: "ord_1", checkoutId: "pay_abc", id: "pay_abc", amountCents: 64_500, currency: "ZAR", mode: "live", method: "Visa •••• 4242", failureReason: null,
    });
    expect(peachFacts(event("payment_succeeded", payment({ amount_received: null })), null).amountCents).toBe(64_500);
    expect(peachFacts(event("payment_succeeded", payment({ payment_method_data: { card: { last4: "0005", card_network: "AmericanExpress" } } })), null).method).toBe("Amex •••• 0005");
    expect(peachFacts(event("payment_succeeded", payment({ payment_method: "wallet", payment_method_type: "apple_pay", payment_method_data: null })), null).method).toBe("Apple Pay");
    expect(peachFacts(event("payment_succeeded", payment({ payment_method: "bank_transfer", payment_method_type: "pay_shap", payment_method_data: null })), null).method).toBe("PayShap");
    expect(peachFacts(event("payment_failed", payment({ status: "failed", amount_received: 0, error_message: "Insufficient funds" })), null)).toMatchObject({ failureReason: "Insufficient funds" });
  });

  it("maps a refund to the payment it refunds", () => {
    const refund = { refund_id: "ref_1", payment_id: "pay_abc", amount: 64_500, currency: "ZAR", status: "failed", error_message: "Card account closed", metadata: { orderId: "ord_1", orderCode: "K7P2QD" } };
    expect(peachFacts(event("refund_failed", refund, "refund_details"), "live")).toEqual({
      orderId: "ord_1", checkoutId: "pay_abc", id: "ref_1", amountCents: 64_500, currency: "ZAR", mode: "live", method: null, failureReason: "Card account closed",
    });
  });

  it("acts on payment_succeeded, logs failures and refunds, and ignores everything else", () => {
    expect(peachEventKind("payment_succeeded")).toBe("paid");
    expect(peachEventKind("payment_failed")).toBe("payment.failed");
    expect(peachEventKind("refund_succeeded")).toBe("payment.refunded");
    expect(peachEventKind("refund_failed")).toBe("payment.refund_failed");
    for (const t of ["payment_processing", "payment_cancelled", "payment_expired", "action_required", "dispute_opened", "constructor", "toString"]) expect(peachEventKind(t)).toBeUndefined();
  });

  it("marks the order paid only when the payment and the amount match (the rules Yoco uses too)", () => {
    expect(decide(payment())).toMatchObject({ action: "pay" });
    expect(decide(payment({ amount: 64_400, amount_received: 64_400 }))).toEqual({ action: "review", reason: "Paid R644.00, but R645.00 is due" });
    expect(decide(payment({ amount_received: 60_000 })).action).toBe("review"); // captured less than the order
    expect(decide(payment({ currency: "USD" })).action).toBe("review");
    expect(decide(payment({ payment_id: "pay_other" })).action).toBe("review"); // not the order's current payment
    expect(decide(payment(), null).action).toBe("ignore");
    expect(decide(payment(), { ...order, status: "PLACED", paymentStatus: "PAID" }).action).toBe("repeat");
    expect(decide(payment(), { ...order, status: "CANCELLED" })).toEqual({ action: "review", reason: "Paid after the order was cancelled: refund the member in the Peach Dashboard" });
  });
});

describe("the payment we ask Peach for", () => {
  it("is Hosted Checkout for the amount due, in ZAR, with our order code and id, back to the member's order page", () => {
    expect(peachPaymentRequest({ id: "ord_1", code: "K7P2QD", dueCents: 64_500 }, "https://shop.herbalholland.com/", { paymentId: "pay_x", sessionExpiry: 3_300, profileId: "pro_1" })).toEqual({
      payment_id: "pay_x",
      amount: 64_500,
      currency: "ZAR",
      confirm: false,
      capture_method: "automatic",
      payment_link: true,
      session_expiry: 3_300,
      return_url: "https://shop.herbalholland.com/orders/K7P2QD?pay=peach",
      merchant_order_reference_id: "K7P2QD",
      description: "Herbal Holland order K7P2QD",
      metadata: { orderId: "ord_1", orderCode: "K7P2QD" },
      payment_link_config: { seller_name: "Herbal Holland", theme: "#F5913C" },
      profile_id: "pro_1",
    });
    expect(peachPaymentRequest({ id: "ord_1", code: "K7P2QD", dueCents: 100 }, "https://x.co.za", { paymentId: "pay_x", sessionExpiry: 300 })).not.toHaveProperty("profile_id");
  });

  it("uses our own 30-character payment ids: the same for a repeat, the next one only after the last", () => {
    const first = peachPaymentId("cmg1ord0000abc", null)!;
    expect(first).toMatch(/^pay_[0-9a-f]{25}0$/);
    expect(first).toHaveLength(30);
    expect(peachPaymentId("cmg1ord0000abc", null)).toBe(first);
    const second = peachPaymentId("cmg1ord0000abc", first)!;
    expect(second).toBe(`${first.slice(0, 29)}1`);
    expect(peachPaymentId("cmg1ord0000abc", `${first.slice(0, 29)}9`)).toBe(`${first.slice(0, 29)}a`);
    expect(peachPaymentId("cmg1ord0000abc", `${first.slice(0, 29)}z`)).toBeNull(); // 36 attempts
    // Another order's payment, one Peach named, or a Yoco checkout: start again at 0.
    expect(peachPaymentId("cmg1ord0000abc", peachPaymentId("cmg1other000", null))).toBe(first);
    expect(peachPaymentId("cmg1ord0000abc", "pay_mbabizu24mvu3mela5njyhpit4")).toBe(first);
    expect(peachPaymentId("cmg1ord0000abc", "ch_Wx1")).toBe(first);
  });
});

describe("the pay page and an order's current Peach payment", () => {
  const now = Date.UTC(2026, 8, 28, 10, 0, 0);
  const open = (over: Partial<PeachPayment> = {}) =>
    payment({ status: "requires_payment_method", amount_received: null, payment_link: { link: "https://app.sandbox-next.peachpayments.com/api/payment_link/m/pay_abc" }, expires_on: new Date(now + 20 * 60_000).toISOString(), ...over });

  it("reuses a page nothing was tried on while it stays open", () => {
    expect(peachNextStep(open(), 64_500, now)).toBe("reuse");
    expect(peachNextStep(open({ status: "requires_confirmation" }), 64_500, now)).toBe("reuse");
  });

  it("never opens a second payment while one went through or is still processing", () => {
    expect(peachNextStep(payment(), 64_500, now)).toBe("paid");
    for (const status of ["processing", "requires_capture", "requires_merchant_action"]) expect(peachNextStep(open({ status }), 64_500, now)).toBe("wait");
  });

  it("opens a new payment when there's none, or it failed, was abandoned, expired or doesn't fit", () => {
    expect(peachNextStep(null, 64_500, now)).toBe("new");
    for (const status of ["failed", "cancelled", "expired", "requires_customer_action"]) expect(peachNextStep(open({ status }), 64_500, now)).toBe("new");
    expect(peachNextStep(open({ expires_on: new Date(now + 30_000).toISOString() }), 64_500, now)).toBe("new"); // closes within the minute
    expect(peachNextStep(open({ expires_on: null }), 64_500, now)).toBe("new");
    expect(peachNextStep(open({ payment_link: null }), 64_500, now)).toBe("new");
    expect(peachNextStep(open({ amount: 60_000 }), 64_500, now)).toBe("new");
  });

  it("shows the member a hint from Peach's return, never proof of payment", () => {
    expect(peachReturn("succeeded")).toBe("success");
    expect(peachReturn("processing")).toBe("success");
    expect(peachReturn("failed")).toBe("failed");
    for (const s of ["cancelled", "expired", "requires_payment_method", "requires_customer_action", undefined]) expect(peachReturn(s)).toBe("cancelled");
  });
});

describe("gateway odds and ends", () => {
  afterEach(() => {
    delete process.env.ONLINE_GATEWAY;
  });

  it("refunds a paid order where it was paid, whichever gateway is switched on now", () => {
    const paid = (paymentRef: string | null) => ({ payMethod: "ONLINE", paymentStatus: "PAID", paymentRef });
    process.env.ONLINE_GATEWAY = "PEACH";
    expect(paidOnlineWith(paid("pay_abc"))).toBe("PEACH");
    expect(paidOnlineWith(paid("ch_Wx1"))).toBe("YOCO");
    expect(paidOnlineWith(paid("SIM-CARD-AB12CD34"))).toBeNull();
    expect(paidOnlineWith(paid(null))).toBeNull();
    expect(paidOnlineWith({ ...paid("pay_abc"), paymentStatus: "UNPAID" })).toBeNull();
    expect(paidOnlineWith({ ...paid("pay_abc"), payMethod: "CARD" })).toBeNull();
    process.env.ONLINE_GATEWAY = "SIMULATED";
    expect(paidOnlineWith(paid("pay_abc"))).toBe("PEACH");
    expect(paidOnlineWith(paid("other-ref"))).toBeNull();
  });

  it("names cards by scheme and last four only, and gateways in plain English", () => {
    expect(cardLabel("mastercard", "5353")).toBe("Mastercard •••• 5353");
    expect(cardLabel("DinersClub", "0004")).toBe("Diners •••• 0004");
    expect(cardLabel(null, "1111")).toBe("Card •••• 1111");
    expect(cardLabel("constructor", "1111")).toBe("Card •••• 1111");
    expect(possessive("Yoco")).toBe("Yoco's");
    expect(possessive("Peach Payments")).toBe("Peach Payments'");
  });
});
