// The returns and delivery policies: every line passes the copy screen (no medical claims), says "members", takes its
// fees, threshold and cut-off from the settings, states the CPA/ECTA rights, and marks the line counsel must confirm.
import { describe, expect, it } from "vitest";
import { LEGAL_DOCS, deliveryPolicy, returnsPolicy, type PolicyBlock, type PolicyFacts } from "@/lib/policies";
import { screenCopy } from "@/lib/compliance";

// As the defaults in HQ → Online orders (settings.ecommerce).
const ECOMMERCE = { sameDayFeeCents: 6_500, courierFeeCents: 9_900, freeDeliveryOverCents: 90_000, merchCourierCents: 10_000, merchNotice: "", sameDayCutoffHour: 15, unpaidHoldMinutes: 60 };
const facts = (over: Partial<PolicyFacts["ecommerce"]> = {}): PolicyFacts => ({
  entity: "Herbal Holland (Pty) Ltd", email: "hello@herbalholland.co.za", phone: "012 004 4200", minAge: 18, ecommerce: { ...ECOMMERCE, ...over },
});
const lines = (blocks: PolicyBlock[]) =>
  blocks.flatMap((b) => ("h" in b ? [b.h] : "p" in b ? [b.p] : "important" in b ? b.important : b.list.flatMap((l) => (typeof l === "string" ? [l] : [l.text, l.counsel]))));
const text = (blocks: PolicyBlock[]) => lines(blocks).join("\n");
const both = (f = facts()) => [...lines(returnsPolicy(f)), ...lines(deliveryPolicy(f))];

describe("shop policies", () => {
  it("are listed with the legal documents (page, footer and sitemap read this)", () => {
    expect(Object.keys(LEGAL_DOCS)).toEqual(["terms", "privacy", "returns", "delivery"]);
    expect([LEGAL_DOCS.returns.title, LEGAL_DOCS.delivery.title]).toEqual(["Returns & refunds", "Delivery"]);
  });

  it("pass screenCopy and say members", () => {
    const all = both(facts({ merchNotice: "Our merch partner closes from 20 December: order by 10 December for Christmas." }));
    expect(all.flatMap((t) => screenCopy(t).map((f) => `“${f.term}” in: ${t}`))).toEqual([]);
    expect(all.filter((t) => /\b(customers?|shoppers?|clients?)\b/i.test(t))).toEqual([]);
    expect(all.some((t) => /\bmembers?\b/.test(t))).toBe(true);
    expect(all.filter((t) => /(once|as) (our stores|they) open/i.test(t))).toEqual([]); // the stores are trading
  });

  it("state the returns rights: CPA s56, ECTA s44 cooling-off, how to return, refunds to the payment method", () => {
    const r = text(returnsPolicy(facts()));
    expect(r).toContain("within 6 months after you received it");
    expect(r).toContain("repair it, replace it or refund you");
    expect(r).toContain("within 7 days after you receive the goods");
    expect(r).toContain("You pay only the direct cost of returning them");
    expect(r).toContain("within 30 days after the day you cancel");
    expect(r).toContain("with your order number");
    expect(r).toContain("courier to collect it");
    expect(r).toContain("drop it off at a Herbal Holland store");
    expect(r).toContain("Refunds go back to the payment method you used");
    expect(r).toContain("[hello@herbalholland.co.za](mailto:hello@herbalholland.co.za) or call 012 004 4200");
  });

  it("marks the ECTA s42 exclusions for counsel", () => {
    const marked = returnsPolicy(facts()).flatMap((b) => ("list" in b ? b.list.filter((l) => typeof l !== "string") : []));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toMatchObject({ text: expect.stringContaining("Anything made to order for you"), counsel: expect.stringContaining("s42(2)") });
    expect((marked[0] as { text: string }).text).toMatch(/food, drink, supplements or skin care once opened/);
  });

  it("reads delivery fees, the free-delivery threshold, the cut-off and the payment window from the settings", () => {
    const d = text(deliveryPolicy(facts()));
    expect(d).toContain("Courier delivery: R99 an order, free when your order comes to R900 or more.");
    expect(d).toContain("R65, when you order by 15:00");
    expect(d).toContain("with a R100 courier fee on top");
    expect(d).toContain("Pay within 60 minutes of ordering");
    const changed = text(deliveryPolicy(facts({ courierFeeCents: 12_300, freeDeliveryOverCents: 150_000, sameDayFeeCents: 7_750, sameDayCutoffHour: 9, merchCourierCents: 11_000, unpaidHoldMinutes: 30, merchNotice: "Last merch orders for Christmas: 10 December." })));
    expect(changed).toContain("Courier delivery: R123 an order, free when your order comes to R1,500 or more.");
    expect(changed).toContain("R77.50, when you order by 09:00");
    expect(changed).toContain("a new courier fee of R123 applies");
    expect(changed).toContain("Pay within 30 minutes");
    expect(changed).toContain("Last merch orders for Christmas: 10 December.");
    expect(changed).not.toMatch(/R99|R900|15:00/);
  });

  it("delivers only to the member named on the order, never licensed medicines, tracked by SMS", () => {
    const blocks = deliveryPolicy(facts());
    const d = text(blocks);
    expect(blocks.find((b) => "important" in b)).toMatchObject({ important: [expect.stringContaining("only to the member named on the order"), expect.any(String)] });
    expect(d).toContain("adults 18+");
    expect(d).toContain("the courier may ask to see your ID");
    expect(d).toContain("Licensed medicines are never delivered");
    expect(d).toContain("We never send them by courier");
    expect(d).toContain("We send you an SMS");
    expect(d).toContain("tracking number");
    expect(d).toContain("If the second attempt fails too");
    expect(d).toContain("tell us as soon as possible");
    expect(d).toContain("by courier from our warehouse");
  });
});
