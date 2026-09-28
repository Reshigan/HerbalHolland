// Delivery-first checkout and payments: which fulfilment options checkout offers, Yoco webhook signatures (built here
// from Yoco's documented scheme, independently of the code under test), Yoco events → orders, and the till's Yoco
// card-machine tender.
import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { offeredFulfilment } from "@/lib/routing";
import { parseYocoEvent, paymentDecision, verifyYocoWebhook, yocoCheckoutRequest, yocoFacts, YOCO_TOLERANCE_SECONDS, type YocoEvent } from "@/lib/yoco";
import { cardMachineTender } from "@/components/pos/lib/rules";

describe("checkout fulfilment options", () => {
  const store = (over: Partial<Parameters<typeof offeredFulfilment>[0][number]> = {}) => ({ kind: "RETAIL" as const, active: true, clickCollect: true, sameDay: true, ...over });
  const dc = store({ kind: "WAREHOUSE", sameDay: true, clickCollect: true });

  it("offers everything trading stores can serve", () => {
    expect(offeredFulfilment([store(), store({ sameDay: false }), dc])).toEqual({ options: ["COLLECT", "SAME_DAY", "COURIER"], deliveryOnly: false });
    expect(offeredFulfilment([store({ sameDay: false }), dc])).toEqual({ options: ["COLLECT", "COURIER"], deliveryOnly: false });
    expect(offeredFulfilment([store({ clickCollect: false }), dc])).toEqual({ options: ["SAME_DAY", "COURIER"], deliveryOnly: false });
  });

  it("is delivery only until a retail store trades: opening-soon stores and warehouses don't count", () => {
    expect(offeredFulfilment([store({ active: false }), store({ active: false }), dc])).toEqual({ options: ["COURIER"], deliveryOnly: true });
    expect(offeredFulfilment([dc])).toEqual({ options: ["COURIER"], deliveryOnly: true });
    expect(offeredFulfilment([store({ clickCollect: false, sameDay: false })])).toEqual({ options: ["COURIER"], deliveryOnly: true });
    expect(offeredFulfilment([])).toEqual({ options: ["COURIER"], deliveryOnly: true });
  });
});

// Yoco's docs: signed content `${webhook-id}.${webhook-timestamp}.${body}`, key = base64-decoded secret after "whsec_",
// HMAC-SHA256, base64; header "v1,<signature>" (space-separated list).
const SECRET = `whsec_${randomBytes(24).toString("base64")}`;
const sign = (secret: string, id: string, ts: number, body: string) =>
  createHmac("sha256", Buffer.from(secret.split("_")[1], "base64")).update(`${id}.${ts}.${body}`).digest("base64");

describe("Yoco webhook signatures", () => {
  const body = JSON.stringify({ id: "evt_1", type: "payment.succeeded", payload: { id: "p_1", amount: 12_345, currency: "ZAR" } });
  const now = Date.UTC(2026, 8, 28, 10, 0, 0);
  const ts = Math.floor(now / 1000);
  const headers = (over: Partial<{ id: string; timestamp: string; signature: string }> = {}) => ({ id: "msg_1", timestamp: String(ts), signature: `v1,${sign(SECRET, "msg_1", ts, body)}`, ...over });

  it("accepts Yoco's signature over the raw body", () => {
    expect(verifyYocoWebhook(SECRET, headers(), body, now)).toBe(true);
    // Any signature in the list may match (Yoco sends several while it rotates secrets).
    expect(verifyYocoWebhook(SECRET, headers({ signature: `v1,${Buffer.from("x".repeat(32)).toString("base64")} v1,${sign(SECRET, "msg_1", ts, body)}` }), body, now)).toBe(true);
  });

  it("rejects a tampered body, another secret, another message id and unknown versions", () => {
    expect(verifyYocoWebhook(SECRET, headers(), body.replace("12345", "1"), now)).toBe(false);
    expect(verifyYocoWebhook(SECRET, headers(), `${body} `, now)).toBe(false);
    const other = `whsec_${randomBytes(24).toString("base64")}`;
    expect(verifyYocoWebhook(other, headers(), body, now)).toBe(false);
    expect(verifyYocoWebhook(SECRET, headers({ signature: `v1,${sign(other, "msg_1", ts, body)}` }), body, now)).toBe(false);
    expect(verifyYocoWebhook(SECRET, headers({ id: "msg_2" }), body, now)).toBe(false);
    expect(verifyYocoWebhook(SECRET, headers({ signature: `v2,${sign(SECRET, "msg_1", ts, body)}` }), body, now)).toBe(false);
    expect(verifyYocoWebhook(SECRET, headers({ signature: sign(SECRET, "msg_1", ts, body) }), body, now)).toBe(false);
    expect(verifyYocoWebhook(SECRET, { id: null, timestamp: null, signature: null }, body, now)).toBe(false);
    expect(verifyYocoWebhook("", headers(), body, now)).toBe(false);
  });

  it("rejects timestamps more than 5 minutes off (replays), even when properly signed", () => {
    expect(YOCO_TOLERANCE_SECONDS).toBe(300);
    for (const [offset, ok] of [[-301, false], [-290, true], [290, true], [301, false], [-3600, false]] as const) {
      const t = ts + offset;
      expect(verifyYocoWebhook(SECRET, { id: "msg_1", timestamp: String(t), signature: `v1,${sign(SECRET, "msg_1", t, body)}` }, body, now)).toBe(ok);
    }
    expect(verifyYocoWebhook(SECRET, headers({ timestamp: `${ts}.5` }), body, now)).toBe(false);
  });
});

describe("Yoco events → orders", () => {
  // The Checkout API's payment notification, as documented.
  const event = (over: Partial<YocoEvent["payload"]> = {}): YocoEvent => ({
    createdDate: "2026-09-28T10:00:00.000Z",
    id: "evt_2zN",
    type: "payment.succeeded",
    payload: {
      amount: 64_500, createdDate: "2026-09-28T09:59:58.000Z", currency: "ZAR", id: "p_8Kq", mode: "live", status: "succeeded",
      metadata: { checkoutId: "ch_Wx1", orderId: "ord_1", orderCode: "K7P2QD" },
      paymentMethodDetails: { type: "card", card: { maskedCard: "424242******4242", scheme: "visa" } },
      ...over,
    },
  });
  const order = { status: "PENDING_PAYMENT", paymentStatus: "UNPAID", paymentRef: "ch_Wx1", dueCents: 64_500 };

  it("reads our ids, the amount and the card from the payload", () => {
    expect(parseYocoEvent(JSON.stringify(event()))).toEqual(event());
    expect(parseYocoEvent("{not json")).toBeNull();
    expect(parseYocoEvent(JSON.stringify({ id: "x", type: "payment.succeeded" }))).toBeNull();
    expect(yocoFacts(event())).toEqual({
      orderId: "ord_1", checkoutId: "ch_Wx1", id: "p_8Kq", amountCents: 64_500, currency: "ZAR", mode: "live", method: "Visa •••• 4242", failureReason: null,
    });
    expect(yocoFacts(event({ paymentMethodDetails: { type: "instant_eft" } })).method).toBe("Instant EFT");
  });

  it("marks the order paid only when the checkout and the amount match", () => {
    expect(paymentDecision(yocoFacts(event()), order)).toMatchObject({ action: "pay" });
    // Amount mismatch: logged for a person, never marked paid.
    const short = paymentDecision(yocoFacts(event({ amount: 64_400 })), order);
    expect(short).toEqual({ action: "review", reason: "Paid R644.00, but R645.00 is due" });
    expect(paymentDecision(yocoFacts(event({ currency: "USD" })), order).action).toBe("review");
    expect(paymentDecision(yocoFacts(event({ amount: undefined })), order).action).toBe("review");
    // Another checkout than the order's.
    expect(paymentDecision(yocoFacts(event({ metadata: { checkoutId: "ch_other", orderId: "ord_1" } })), order).action).toBe("review");
    expect(paymentDecision(yocoFacts(event({ metadata: { orderId: "ord_1" } })), order).action).toBe("review");
  });

  it("ignores payments that aren't ours, treats redeliveries as done, and flags payments after a cancel", () => {
    expect(paymentDecision(yocoFacts(event()), null).action).toBe("ignore");
    expect(paymentDecision(yocoFacts(event()), { ...order, status: "PLACED", paymentStatus: "PAID" }).action).toBe("repeat");
    expect(paymentDecision(yocoFacts(event()), { ...order, status: "CANCELLED", paymentStatus: "REFUNDED" }).action).toBe("repeat");
    expect(paymentDecision(yocoFacts(event()), { ...order, status: "CANCELLED" })).toMatchObject({ action: "review", reason: expect.stringMatching(/cancelled/) });
  });

  it("asks Yoco for the amount due, in ZAR, and brings the member back to their order page", () => {
    expect(yocoCheckoutRequest({ id: "ord_1", code: "K7P2QD", dueCents: 64_500 }, "https://herbalholland.co.za/")).toEqual({
      amount: 64_500,
      currency: "ZAR",
      successUrl: "https://herbalholland.co.za/orders/K7P2QD?pay=success",
      cancelUrl: "https://herbalholland.co.za/orders/K7P2QD?pay=cancelled",
      failureUrl: "https://herbalholland.co.za/orders/K7P2QD?pay=failed",
      metadata: { orderId: "ord_1", orderCode: "K7P2QD" },
      externalId: "K7P2QD",
    });
  });
});

describe("till: Yoco card machine", () => {
  it("records a card payment with the machine's reference and, optionally, the last 4", () => {
    expect(cardMachineTender("YOCO", 45_000, " 8F3K-22019 ", "4242")).toEqual({ tender: { method: "CARD", amountCents: 45_000, provider: "YOCO", reference: "8F3K-22019", cardLast4: "4242" } });
    expect(cardMachineTender("YOCO", 45_000, "#Rx81kQ2")).toEqual({ tender: { method: "CARD", amountCents: 45_000, provider: "YOCO", reference: "Rx81kQ2", cardLast4: undefined } });
    // Bank terminals keep their upper-case approval codes.
    expect(cardMachineTender("EXTERNAL", 1_000, "ab12cd")).toMatchObject({ tender: { provider: "EXTERNAL", reference: "AB12CD" } });
  });

  it("needs the reference, and a last 4 that is four digits", () => {
    expect(cardMachineTender("YOCO", 45_000, "")).toEqual({ error: "Key in the reference from the Yoco machine" });
    expect(cardMachineTender("YOCO", 45_000, "12")).toMatchObject({ error: expect.any(String) });
    expect(cardMachineTender("YOCO", 45_000, "ref with spaces")).toMatchObject({ error: expect.any(String) });
    expect(cardMachineTender("YOCO", 45_000, "8F3K22019", "42")).toEqual({ error: "The card's last 4 digits, or leave it blank" });
  });
});
