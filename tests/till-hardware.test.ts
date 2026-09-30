import { describe, expect, it } from "vitest";
import { isTrainingNumber, TOUR, trainingAllows, TrainingError, trainingNumber } from "@/components/pos/lib/training";
import { BRAND_MESSAGES, buildSnapshot, displayKey, displayUrl, idleMessages, idleSnapshot, isSnapshot, LICENSED_LINE_NAME, tenderName } from "@/components/pos/lib/display";
import { idleDelay, QUIET_AFTER_MS, quietDashboard, saleIsOpen } from "@/components/pos/lib/idle";
import { parseBatchScan, tenderLine } from "@/components/pos/lib/rules";
import { DEFAULT_COMPLIANCE } from "@/lib/compliance";
import type { BootData, BootPromotion, CustomerDetail, OrderCard, QuoteDTO, ReceiptDTO, ZReport } from "@/server/pos/types";

describe("training mode guard", () => {
  it("lets reads and pure calculations through, and refuses every write of record", () => {
    for (const p of ["/api/pos/bootstrap", "/api/pos/session", "/api/pos/orders", "/api/pos/customers?q=HH01", "/api/pos/sales?q=X", "/api/pos/stock?q=a", "/api/pos/shift", "/api/pos/qr?text=x"]) expect(trainingAllows("GET", p), p).toBe(true);
    for (const p of ["/api/pos/quote", "/api/pos/compliance", "/api/pos/session", "/api/pos/display", "/api/pos/audit", "/api/pos/vouchers"]) expect(trainingAllows("POST", p), p).toBe(true);
    expect(trainingAllows("DELETE", "/api/pos/session")).toBe(true);
    for (const p of ["/api/pos/sales", "/api/pos/refunds", "/api/pos/customers", "/api/pos/customers/c1/age-check", "/api/pos/events/checkin", "/api/pos/orders/o1", "/api/pos/shift", "/api/pos/sales/s1/invoice", "/api/pos/card", "/api/pos/pair"])
      expect(trainingAllows("POST", p), p).toBe(false);
    expect(trainingAllows("DELETE", "/api/pos/device")).toBe(false);
    expect(new TrainingError().message).toMatch(/Training mode/);
  });

  it("numbers practice receipts unlike real ones", () => {
    expect(trainingNumber(7)).toBe("TRAINING 0007");
    expect(isTrainingNumber("TRAINING 0007")).toBe(true);
    expect(isTrainingNumber("PTA01-B00042")).toBe(false);
    // Real receipt numbers are validated server-side as CODE-PREFIX+digits; a training number never passes.
    expect(/^[A-Z0-9]{2,12}-[A-Z0-9]{1,3}\d{3,9}$/.test(trainingNumber(7))).toBe(false);
  });

  it("has a five-step tour", () => {
    expect(TOUR).toHaveLength(5);
    expect(TOUR.every((s) => s.title && s.body.length > 40)).toBe(true);
  });
});

const promo = (p: Partial<BootPromotion> & Pick<BootPromotion, "id" | "kind" | "value">): BootPromotion => ({
  name: p.id,
  description: null,
  code: null,
  categoryIds: [],
  productIds: [],
  minSpendCents: 0,
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: "2027-01-01T00:00:00Z",
  days: [],
  startMinute: null,
  endMinute: null,
  ...p,
});

const products = [
  { id: "p-flower", categoryId: "flower", regClass: "THC" as const },
  { id: "p-oil", categoryId: "wellness", regClass: "CBD" as const },
  { id: "p-balm", categoryId: "skin-care", regClass: "CBD_TOPICAL" as const },
  { id: "p-grinder", categoryId: "accessories", regClass: "ACCESSORY" as const },
];

const quote = (over: Partial<QuoteDTO> = {}): QuoteDTO => ({
  lines: [
    { variantId: "v-flower", qty: 1, unitPriceCents: 62000, shelfCents: 62000, rrpCents: 62000, priceRule: null, grossCents: 62000, discountCents: 0, totalCents: 62000, vatCents: 8087, noEarn: true, memberSavingsCents: 0, offerCents: 0, offerName: null },
    { variantId: "v-grinder", qty: 2, unitPriceCents: 32900, shelfCents: 32900, rrpCents: 35000, priceRule: null, grossCents: 65800, discountCents: 6580, totalCents: 59220, vatCents: 7724, noEarn: false, memberSavingsCents: 2000, offerCents: 0, offerName: null, promoId: "acc10" },
  ],
  subtotalCents: 127800,
  discountCents: 6580,
  offerCents: 0,
  totalCents: 121220,
  vatCents: 15811,
  pointsMultiplier: 1,
  applied: [{ id: "acc10", name: "10% off accessories", discountCents: 6580 }],
  suggestions: [],
  pointsEstimate: 30,
  memberSavingsCents: 2000,
  joinSavingsCents: 0,
  ...over,
});

const member: CustomerDetail = {
  id: "c1", memberNo: "HH0100002", firstName: "Thandi", lastName: "Mokoena", phone: "082 ••• 1234", email: "t@example.co.za", tier: "SPROUT", points: 1230, ageCheck: "VERIFIED", ageVerified: true, age: 31,
  homeStore: "Hatfield", visitsHere: 4, lastVisitHere: null, foundingNo: 12, tierFloor: null, offers: [],
  patient: { authNumber: "PA-9981", prescriber: "Dr N Dlamini", prescriberRegNo: "MP0123", scope: "Flower", monthlyLimitGrams: 30, remainingGrams: 26.5, validTo: "2027-01-01" },
};

const productOf = (id: string) => ({ "v-flower": { name: "Durban Poison", variantName: "3.5g", regClass: "THC" as const }, "v-grinder": { name: "Windmill Grinder", variantName: "Black", regClass: "ACCESSORY" as const } })[id];

describe("customer display snapshot", () => {
  const base = { store: { name: "Hatfield", code: "PTA01" }, productOf, licensedClasses: ["THC"], idle: BRAND_MESSAGES, training: false, at: new Date("2026-09-27T10:00:00Z") };

  it("shows the sale without private details: first name and points only, licensed medicine anonymised", () => {
    const s = buildSnapshot({ ...base, cart: { lines: [{ variantId: "v-flower", qty: 1 }, { variantId: "v-grinder", qty: 2 }], customer: member }, quote: quote(), stage: "basket" });
    expect(s.state).toBe("sale");
    expect(s.lines.map((l) => l.name)).toEqual([LICENSED_LINE_NAME, "Windmill Grinder"]);
    expect(s.lines[0].detail).toBeNull();
    expect(s.member).toEqual({ firstName: "Thandi", tier: "SPROUT", points: 1230, pointsEstimate: 30 });
    expect(s.promos).toEqual(["10% off accessories"]);
    expect(s.totalCents).toBe(121220);
    const json = JSON.stringify(s);
    for (const secret of ["HH0100002", "082", "1234", "PA-9981", "Dlamini", "Durban", "Mokoena", "example.co.za", "26.5"]) expect(json, secret).not.toContain(secret);
  });

  it("moves through pay and thank-you states, then idles", () => {
    const cart = { lines: [{ variantId: "v-grinder", qty: 1 }], customer: member };
    const pay = buildSnapshot({ ...base, cart, quote: quote(), stage: "pay", pay: { dueCents: 121220, paidCents: 0, tapping: true, method: "card" } });
    expect(pay.state).toBe("pay");
    expect(pay.pay?.tapping).toBe(true);
    const receipt = {
      id: "s1", number: "PTA01-B00042", kind: "SALE", channel: "POS", title: "Tax invoice", createdAt: "2026-09-27T10:00:00Z", offline: false, refundOf: null, staff: "Shireen",
      customer: { id: "c1", name: "Thandi Mokoena", memberNo: "HH0100002", tier: "SPROUT", points: 1260 }, lines: [], subtotalCents: 59220, discountCents: 0, offerCents: 0, offers: [], memberSavingsCents: 0,
      totalCents: 59220, vatCents: 7724, pointsEarned: 30, pointsRedeemed: 0, payments: [{ method: "CASH", amountCents: 59220, tenderedCents: 60000, changeCents: 780, provider: null, reference: null, cardBrand: null, cardLast4: null }],
      promoCode: null, invoiceEmail: null, buyer: null, note: null, refunds: [], invoiceUrl: null,
    } satisfies ReceiptDTO;
    const done = buildSnapshot({ ...base, cart, quote: quote(), stage: "done", done: receipt });
    expect(done.state).toBe("done");
    expect(done.done).toEqual({ totalCents: 59220, changeCents: 780, pointsEarned: 30, balance: 1260, firstName: "Thandi" });
    expect(JSON.stringify(done)).not.toContain("HH0100002");
    // Training: no points are ever shown as earned.
    expect(buildSnapshot({ ...base, cart, quote: quote(), stage: "done", done: receipt, training: true }).done?.pointsEarned).toBe(0);
    const idle = buildSnapshot({ ...base, cart: { lines: [], customer: null }, quote: quote({ lines: [], totalCents: 0 }), stage: "basket" });
    expect(idle.state).toBe("idle");
    expect(isSnapshot(idle)).toBe(true);
    expect(isSnapshot({ v: 2 })).toBe(false);
    expect(idleSnapshot(base.store, ["hi"]).state).toBe("idle");
  });

  it("never advertises a deal on a medicine in the idle messages (s18A)", () => {
    const msgs = idleMessages(
      {
        promotions: [
          promo({ id: "acc10", name: "10% off accessories", kind: "PERCENT", value: 10, categoryIds: ["accessories"] }),
          promo({ id: "oil", name: "Calm oil special", kind: "PERCENT", value: 15, productIds: ["p-oil"] }),
          promo({ id: "wellness", name: "Wellness week", kind: "MULTIBUY", value: 65000, buyQty: 2, categoryIds: ["wellness", "skin-care"] }),
          promo({ id: "flower", name: "Flower Friday", kind: "PERCENT", value: 20, categoryIds: ["flower"] }),
          promo({ id: "old", name: "Last year", kind: "PERCENT", value: 20, categoryIds: ["accessories"], endsAt: "2026-02-01T00:00:00Z" }),
        ],
        products,
        compliance: DEFAULT_COMPLIANCE,
        nextEvent: { title: "Members' evening", startsAt: "2026-10-01T16:00:00Z" },
      },
      new Date("2026-09-27T10:00:00Z"),
    );
    const deals = msgs.filter((m) => m.startsWith("Today's deal"));
    expect(deals).toEqual(["Today's deal: 10% off accessories"]);
    expect(msgs.some((m) => m.startsWith("Next in store: Members' evening"))).toBe(true);
    expect(msgs.slice(0, BRAND_MESSAGES.length)).toEqual(BRAND_MESSAGES);
    expect(msgs.join(" ")).toContain("Adults 18+");
  });

  it("builds pairing keys and links for a separate screen", () => {
    const key = displayKey((n) => Uint8Array.from({ length: n }, (_, i) => i * 7));
    expect(key).toHaveLength(16);
    expect(key).toMatch(/^[a-z2-9]+$/);
    expect(displayUrl("https://till.example", "dev 1", key)).toBe(`https://till.example/pos/display?d=dev%201&k=${key}`);
  });
});

describe("quiet hours", () => {
  const boot = {
    version: 1,
    fetchedAt: "2026-09-27T06:00:00Z",
    device: { id: "d1", name: "Counter 1", prefix: "B", seq: 41 },
    store: { id: "s1", code: "PTA01", name: "Hatfield" },
    products: [
      { id: "p1", name: "Windmill Grinder", regClass: "ACCESSORY", variants: [{ id: "v1", name: "Black", available: 0 }, { id: "v2", name: "Orange", available: 12 }] },
      { id: "p2", name: "Calm CBD Oil", regClass: "CBD", variants: [{ id: "v3", name: "30 ml", available: 2 }] },
    ],
    shift: { id: "sh1", openedAt: "2026-09-27T07:00:00Z", openingFloatCents: 100000, openedBy: "Shireen" },
    nextEvent: { title: "Members' evening", startsAt: "2026-10-01T16:00:00Z", endsAt: "2026-10-01T19:00:00Z" },
  } as unknown as BootData;
  const order = (o: Partial<OrderCard>): OrderCard => ({ id: "o", code: "HH1", status: "READY", fulfilment: "COLLECT", paid: true, dueCents: 0, totalCents: 1000, pointsRedeemed: 0, customer: { name: "T", phone: "", memberNo: "", ageVerified: true }, lines: [], units: 1, licensed: false, ageRestricted: false, placedAt: "2026-09-27T09:00:00Z", readyAt: "2026-09-27T09:10:00Z", doneAt: null, address: null, deliveryNotes: null, courier: null, trackingNo: null, idChecked: false, ...o });
  const now = new Date("2026-09-27T10:00:00Z");

  it("summarises the till's cached data into a calm dashboard", () => {
    const x = { takingsCents: 1234500, sales: { count: 41 }, refunds: { count: 1 } } as ZReport;
    const d = quietDashboard({ boot, orders: [order({ code: "A" }), order({ code: "B", status: "PLACED", placedAt: "2026-09-27T09:30:00Z" }), order({ code: "C", status: "READY", fulfilment: "COURIER" })], outbox: [], x, online: true, now });
    expect(d.takings).toEqual({ cents: 1234500, sales: 41, refunds: 1 });
    expect(d.handover.map((o) => o.code)).toEqual(["A"]);
    expect(d.toPick).toBe(1);
    expect(d.lowStock.map((l) => `${l.name} ${l.variantName}`)).toEqual(["Windmill Grinder Black", "Calm CBD Oil 30 ml"]);
    expect(d.tasks.map((t) => t.key)).toEqual(["late", "out"]);
    expect(d.nextEvent?.title).toBe("Members' evening");
  });

  it("flags a missing shift and queued offline sales, and is all clear otherwise", () => {
    const d = quietDashboard({ boot: { ...boot, shift: null, products: [] }, orders: [], outbox: [{ deviceId: "d1" } as never], x: null, online: false, now });
    expect(d.takings).toBeNull();
    expect(d.tasks.map((t) => t.key)).toEqual(["shift", "outbox"]);
    const clear = quietDashboard({ boot: { ...boot, products: [], fetchedAt: now.toISOString() }, orders: [], outbox: [], x: null, online: true, now });
    expect(clear.tasks.map((t) => t.key)).toEqual(["clear"]);
  });

  it("knows when a sale is open and how long to wait", () => {
    expect(saleIsOpen({ lines: [], customer: null })).toBe(false);
    expect(saleIsOpen({ lines: [], customer: member })).toBe(true);
    expect(saleIsOpen({ lines: [{ qty: 1 }], customer: null })).toBe(true);
    expect(idleDelay("", null)).toBe(QUIET_AFTER_MS);
    expect(idleDelay("?idleMs=4000", null)).toBe(4000);
    expect(idleDelay("?idleMs=10", 9000)).toBe(9000);
    expect(idleDelay("", 500)).toBe(QUIET_AFTER_MS);
  });
});

describe("batch code scans", () => {
  it("recognises pack codes and lab-certificate links, never barcodes, members or tickets", () => {
    expect(parseBatchScan("DUPO0-35G-2605A")).toBe("DUPO0-35G-2605A");
    expect(parseBatchScan("dupo0-35g-2605a")).toBe("DUPO0-35G-2605A");
    expect(parseBatchScan("https://herbalholland.co.za/batch/DUPO0-35G-2605A?utm=pack")).toBe("DUPO0-35G-2605A");
    expect(parseBatchScan("6001234000013")).toBeNull();
    expect(parseBatchScan("HH0100002")).toBeNull();
    expect(parseBatchScan("HHORDER:ABCD12:123456")).toBeNull();
    expect(parseBatchScan("HHRSVP:K7Q2M9XA")).toBeNull();
    expect(parseBatchScan("HH-K7PM-3QXR-9ZAB")).toBeNull(); // a gift voucher code (dashed too) is the voucher tender's, not a batch
    expect(parseBatchScan("hello world")).toBeNull();
    expect(parseBatchScan("ABC-DEF")).toBeNull(); // no digit: not a batch
  });
});

describe("tender lines", () => {
  it("name a gift voucher by its code on receipts, and the tender on the customer display", () => {
    expect(tenderLine({ method: "VOUCHER", reference: "HH-K7PM-3QXR-9ZAB" })).toBe("Gift voucher HH-K7PM-3QXR-9ZAB");
    expect(tenderLine({ method: "CARD", reference: "A1B2", cardLast4: "1234" })).toBe("Card •••• 1234 (A1B2)");
    expect(tenderLine({ method: "CARD", reference: "A1B2", cardLast4: "1234" }, "****")).toBe("Card **** 1234 (A1B2)");
    expect(tenderLine({ method: "CASH" })).toBe("Cash");
    expect(tenderName("voucher")).toBe("Gift voucher");
    expect(tenderName("VOUCHER")).toBe("Gift voucher");
    expect(tenderName("external")).toBe("Card");
    expect(tenderName("points")).toBe("Rewards points");
    expect(tenderName(null)).toBeNull();
    expect(tenderName("nope")).toBeNull();
  });
});
