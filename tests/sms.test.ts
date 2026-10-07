import { describe, expect, it } from "vitest";
import { gsmSafe, isGsm7, orderSms, shortLink, sms, SMS_SINGLE_SEGMENT, smsLength, smsSegments, type OrderSmsEvent } from "@/lib/sms";

const link = shortLink("https://herbalholland.co.za", "/orders/X7K2P9");
const base = { code: "X7K2P9", storeName: "Hatfield", link, collectionCode: "4821" };
const collect = { ...base, fulfilment: "COLLECT" as const };
const courier = { ...base, fulfilment: "COURIER" as const, courier: "Aramex", trackingNo: "HH2K7Q9D4F", ageRestricted: true };

describe("SMS copy", () => {
  const cases: [OrderSmsEvent, Parameters<typeof orderSms>[1], string][] = [
    ["placed", { ...collect, paid: true }, "order X7K2P9 received for collection at Hatfield"],
    ["placed", { ...collect, paid: false }, "pay at the counter"],
    ["placed", { ...courier, paid: true }, "order X7K2P9 received for delivery"],
    ["ready", { ...collect, paid: true }, "X7K2P9 is ready at Hatfield. Show code 4821 and your ID (18+)"],
    ["dispatched", courier, "X7K2P9 is on its way (Aramex tracking HH2K7Q9D4F). Have your ID (18+) ready"],
    ["delivered", courier, "X7K2P9 delivered"],
    ["collected", collect, "X7K2P9 complete"],
    ["cancelled", collect, "X7K2P9 was cancelled. Any payment or points used have been returned"],
  ];
  it.each(cases)("%s: sender name first, code next, one GSM-7 segment, short link, no STOP", (kind, input, phrase) => {
    const text = orderSms(kind, input);
    expect(text.startsWith("Herbal Holland: order X7K2P9")).toBe(true);
    expect(text).toContain(phrase);
    expect(text).toContain("herbalholland.co.za/orders/X7K2P9");
    expect(text).not.toContain("https://");
    expect(isGsm7(text)).toBe(true);
    expect(smsLength(text)).toBeLessThanOrEqual(SMS_SINGLE_SEGMENT);
    expect(smsSegments(text)).toBe(1);
    expect(text).not.toMatch(/STOP/);
  });

  it("tidies typography that would force UCS-2", () => {
    const s = gsmSafe("Thanks — your “order” is on its way… • R1 234,50 incl.");
    expect(s).toBe('Thanks - your "order" is on its way... - R1 234,50 incl.');
    expect(isGsm7("Thanks — your order")).toBe(false);
    expect(isGsm7(s)).toBe(true);
    expect(sms("order X7K2P9 — done")).toBe("Herbal Holland: order X7K2P9 - done");
  });

  it("counts segments the way the network bills them", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("a".repeat(306))).toBe(2);
    expect(smsSegments("a".repeat(307))).toBe(3);
    expect(smsLength("€10 {x}")).toBe(10); // €, { and } are extension characters: two septets each
    expect(smsSegments("—" + "a".repeat(69))).toBe(1); // UCS-2: 70 a segment
    expect(smsSegments("—" + "a".repeat(70))).toBe(2);
  });

  it("links: scheme dropped on https, kept on http (dev), never a trailing slash doubled", () => {
    expect(shortLink("https://herbalholland.co.za", "/orders/X7K2P9")).toBe("herbalholland.co.za/orders/X7K2P9");
    expect(shortLink("https://herbalholland.co.za/", "/orders/X7K2P9")).toBe("herbalholland.co.za/orders/X7K2P9");
    expect(shortLink("http://localhost:3000", "/orders/X7K2P9")).toBe("http://localhost:3000/orders/X7K2P9");
  });
});
