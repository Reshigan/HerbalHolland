import { describe, expect, it } from "vitest";
import {
  ageing, caseMultiple, creditDecision, eftExpired, eftReference, normaliseTradePhone, normaliseRegNumber, normaliseVatNumber, openInvoices, overdueBeyondGrace, previousMonth,
  statementMonth, tradeAccountNumber, tradeAllowed, tradeBuyerBlock, tradeCreditNumber, tradeDelivery, tradeHandling, tradeInvoiceNumber, tradeLine, tradeNumberQuery, tradeOrderNumber,
  tradeProblem, tradeStatement, tradeTotals, validateTradeApplication, validateTradeBasket, vatHalfUp, TRADE_CLASSES, type LedgerEntryLike,
} from "@/lib/trade";
import { evaluateTradeBasket } from "@/lib/compliance";
import { listApplies, resolveTradePrice, tradeBreaks, type PriceListRule } from "@/lib/pricing-rules";
import { vatOf } from "@/lib/money";
import { tradeApprovedEmail, tradeCodeEmail, tradeInvoiceEmail, tradeOrderEmail, tradeProFormaEmail, tradeReadySms, tradeStatementEmail, type TradeOrderEmailInfo } from "@/server/trade/emails";
import { smsSegments } from "@/lib/sms";

const days = (n: number, from = new Date("2026-10-03T10:00:00+02:00")) => new Date(from.getTime() + n * 86_400_000);
const NOW = new Date("2026-10-03T10:00:00+02:00");

describe("Trade VAT per line (15%, half up to the cent)", () => {
  it("works VAT out from the ex-VAT line, never backed out of an inclusive price", () => {
    expect(tradeLine({ unitCents: 100, qty: 1 })).toEqual({ exCents: 100, vatCents: 15, inclCents: 115 });
    expect(tradeLine({ unitCents: 18_000, qty: 12 })).toEqual({ exCents: 216_000, vatCents: 32_400, inclCents: 248_400 });
  });
  it("rounds half up", () => {
    expect(vatHalfUp(1)).toBe(0); // 0.15c
    expect(vatHalfUp(3)).toBe(0); // 0.45c
    expect(vatHalfUp(10)).toBe(2); // 1.5c → 2
    expect(vatHalfUp(30)).toBe(5); // 4.5c → 5
    expect(vatHalfUp(17)).toBe(3); // 2.55c → 3
    expect(vatHalfUp(-10)).toBe(-2);
    expect(tradeLine({ unitCents: 1, qty: 10, vatBps: 1500 }).vatCents).toBe(2);
  });
  it("agrees with the inclusive-price VAT the sale posting uses, for every amount", () => {
    for (let ex = 0; ex <= 5_000; ex++) expect(vatOf(ex + vatHalfUp(ex))).toBe(vatHalfUp(ex));
  });
  it("totals the lines with VAT on the courier or handling fee as a line of its own", () => {
    const lines = [tradeLine({ unitCents: 18_000, qty: 12 }), tradeLine({ unitCents: 11_000, qty: 12 })];
    const t = tradeTotals(lines, 15_000);
    expect(t).toEqual({ subtotalCents: 348_000, deliveryCents: 15_000, handlingCents: 0, exCents: 363_000, vatCents: 32_400 + 19_800 + 2_250, totalCents: 363_000 + 54_450 });
    const c = tradeTotals(lines, { handlingCents: 7_500 });
    expect(c.vatCents).toBe(32_400 + 19_800 + 1_125);
    expect(c.totalCents).toBe(355_500 + 53_325);
    expect(tradeTotals([]).totalCents).toBe(0);
  });
});

describe("Cases and the minimum order", () => {
  it("rounds up to the next case, at least one", () => {
    expect(caseMultiple(0, 6)).toBe(6);
    expect(caseMultiple(1, 6)).toBe(6);
    expect(caseMultiple(6, 6)).toBe(6);
    expect(caseMultiple(7, 6)).toBe(12);
    expect(caseMultiple(5, 1)).toBe(5);
    expect(caseMultiple(0, 1)).toBe(1);
    expect(caseMultiple(3, 0)).toBe(3);
  });
  it("names broken cases and a short order in plain English", () => {
    const min = { minOrderCents: 200_000 };
    expect(validateTradeBasket([], min)).toEqual(["The order has no items"]);
    const bad = validateTradeBasket([{ name: "Calm Oil · 30ml", qty: 7, unitCents: 18_000, caseQty: 6 }], min);
    expect(bad[0]).toMatch(/cases of 6: order 6, 12, 18… \(the next case up from 7 is 12\)/);
    const short = validateTradeBasket([{ name: "Coffee", qty: 12, unitCents: 11_000, caseQty: 12 }], min);
    expect(short).toEqual(["Minimum order is R2,000.00 ex VAT — this order is R1,320.00, R680.00 short"]);
    expect(validateTradeBasket([{ name: "Coffee", qty: 24, unitCents: 11_000 }], { ...min, caseQty: 12 })).toEqual([]);
    expect(validateTradeBasket([{ name: "Coffee", qty: 0, unitCents: 11_000 }], { ...min, caseQty: 12 })[0]).toMatch(/at least 12/);
  });
});

describe("Delivery, handling, EFT", () => {
  const s = { deliveryCents: 15_000, freeDeliveryOverCents: 500_000, collectHandlingCents: 7_500 };
  it("charges the flat courier fee under the threshold and nothing from it", () => {
    expect(tradeDelivery(499_999, s)).toBe(15_000);
    expect(tradeDelivery(500_000, s)).toBe(0);
    expect(tradeDelivery(1_000_000, { ...s, freeDeliveryOverCents: 0 })).toBe(15_000);
    expect(tradeHandling(s)).toBe(7_500);
  });
  it("prints the pro forma reference and knows when an unpaid order has lapsed", () => {
    expect(eftReference("TO-000123")).toBe("HH-TO-000123");
    expect(eftExpired({ status: "PENDING_PAYMENT", createdAt: days(-4) }, NOW, 3)).toBe(true);
    expect(eftExpired({ status: "PENDING_PAYMENT", createdAt: days(-2) }, NOW, 3)).toBe(false);
    expect(eftExpired({ status: "PLACED", createdAt: days(-40) }, NOW, 3)).toBe(false);
  });
});

describe("Credit decision", () => {
  const base = { terms: "ACCOUNT" as const, status: "APPROVED" as const, creditLimitCents: 1_000_000, balanceCents: 300_000, openOrdersCents: 200_000, orderInclCents: 500_000 };
  it("allows an order that keeps balance + open orders + this order within the limit", () => {
    expect(creditDecision(base)).toEqual({ ok: true, availableCents: 500_000 });
    const over = creditDecision({ ...base, orderInclCents: 500_001 });
    expect(over.ok).toBe(false);
    expect(over.availableCents).toBe(500_000);
    expect(over.reason).toMatch(/Over the credit limit: R5,000.00 available on a limit of R10,000.00 \(owing R3,000.00, R2,000.00 on open orders\) — this order is R5,000.01/);
  });
  it("never lets prepaid, pending, held or closed accounts buy on account", () => {
    expect(creditDecision({ ...base, terms: "PREPAID" })).toMatchObject({ ok: false, reason: expect.stringMatching(/prepaid/) });
    expect(creditDecision({ ...base, status: "PENDING" }).reason).toMatch(/hasn't been approved/);
    expect(creditDecision({ ...base, status: "ON_HOLD" }).reason).toMatch(/on hold/);
    expect(creditDecision({ ...base, status: "CLOSED" }).reason).toMatch(/closed/);
    expect(creditDecision({ ...base, creditLimitCents: 0 }).reason).toMatch(/no credit limit/);
  });
  it("counts a credit balance in the account's favour", () => {
    expect(creditDecision({ ...base, balanceCents: -100_000, openOrdersCents: 0 }).availableCents).toBe(1_100_000);
  });
});

describe("Ledger ageing (FIFO on due dates)", () => {
  const e = (kind: LedgerEntryLike["kind"], cents: number, createdDays: number, dueDays?: number): LedgerEntryLike => ({ kind, cents, createdAt: days(createdDays), dueAt: dueDays == null ? null : days(dueDays) });
  const invoices = [e("INVOICE", 1_000, -75, -45), e("INVOICE", 2_000, -40, -10), e("INVOICE", 3_000, -25, 5)];
  it("applies payments to the oldest due invoice first and buckets what's left by days past due", () => {
    expect(ageing(invoices, NOW)).toEqual({ current: 3_000, d30: 2_000, d60: 1_000, d90plus: 0, overdue: 3_000, total: 6_000 });
    const paid = [...invoices, e("PAYMENT", -1_500, -5)];
    expect(ageing(paid, NOW)).toEqual({ current: 3_000, d30: 1_500, d60: 0, d90plus: 0, overdue: 1_500, total: 4_500 });
    expect(openInvoices(paid).open.map((d) => d.openCents)).toEqual([1_500, 3_000]);
  });
  it("shows an overpayment as negative current so the total is always the balance", () => {
    const a = ageing([...invoices, e("PAYMENT", -7_000, -1)], NOW);
    expect(a).toEqual({ current: -1_000, d30: 0, d60: 0, d90plus: 0, overdue: 0, total: -1_000 });
    expect(openInvoices([...invoices, e("PAYMENT", -7_000, -1)]).unappliedCreditCents).toBe(1_000);
  });
  it("puts anything more than 60 days past due in the 90+ column and treats a positive adjustment as due on its date", () => {
    expect(ageing([e("INVOICE", 500, -100, -61)], NOW).d90plus).toBe(500);
    expect(ageing([e("INVOICE", 500, -100, -60)], NOW).d60).toBe(500);
    expect(ageing([e("ADJUSTMENT", 400, -35)], NOW).d60).toBe(400);
    expect(ageing([e("ADJUSTMENT", -400, -35), e("INVOICE", 400, -1, 29)], NOW)).toMatchObject({ current: 0, total: 0 });
  });
  it("settles a credit that names an order or a sale against that item first, then the rest oldest-due-first", () => {
    const entries: LedgerEntryLike[] = [
      { ...e("INVOICE", 1_000, -40, -10), tradeOrderId: "o1" }, // overdue, unpaid
      { ...e("INVOICE", 2_000, -3, 27), tradeOrderId: "o2" }, // an EFT order, paid for
      { ...e("PAYMENT", -2_000, -2), tradeOrderId: "o2" },
      { ...e("INVOICE", 500, -2, 28), saleId: "s1" }, // a till sale, half returned
      { ...e("CREDIT_NOTE", -250, -1), saleId: "s1" },
    ];
    expect(ageing(entries, NOW)).toEqual({ current: 250, d30: 1_000, d60: 0, d90plus: 0, overdue: 1_000, total: 1_250 });
    expect(openInvoices(entries).open.map((d) => [d.tradeOrderId ?? d.saleId, d.openCents])).toEqual([["o1", 1_000], ["s1", 250]]);
    // Without the references, FIFO would have settled the overdue invoice with the EFT instead.
    expect(ageing(entries.map((x) => ({ ...x, tradeOrderId: null, saleId: null })), NOW)).toMatchObject({ overdue: 0, total: 1_250 });
  });
  it("finds what is past due beyond a grace period", () => {
    expect(overdueBeyondGrace(invoices, NOW, 7)).toBe(3_000);
    expect(overdueBeyondGrace(invoices, NOW, 30)).toBe(1_000);
    expect(overdueBeyondGrace([...invoices, e("PAYMENT", -3_000, -1)], NOW, 7)).toBe(0);
  });
});

describe("Statement", () => {
  it("has the opening balance before the period, each line with a running balance, the closing balance and ageing at the period end", () => {
    const from = new Date("2026-09-01T00:00:00+02:00");
    const to = new Date("2026-10-01T00:00:00+02:00");
    const entries: LedgerEntryLike[] = [
      { kind: "INVOICE", cents: 10_000, createdAt: new Date("2026-08-20T09:00:00+02:00"), dueAt: new Date("2026-09-19T09:00:00+02:00"), reference: "TI-000001" },
      { kind: "PAYMENT", cents: -4_000, createdAt: new Date("2026-09-02T09:00:00+02:00"), reference: "EFT 1" },
      { kind: "INVOICE", cents: 5_000, createdAt: new Date("2026-09-15T09:00:00+02:00"), dueAt: new Date("2026-10-15T09:00:00+02:00"), reference: "TI-000002" },
      { kind: "CREDIT_NOTE", cents: -500, createdAt: new Date("2026-10-02T09:00:00+02:00"), reference: "TC-000001" }, // after the period
    ];
    const st = tradeStatement(entries, { from, to });
    expect(st.opening).toBe(10_000);
    expect(st.lines.map((l) => [l.reference, l.debitCents, l.creditCents, l.balanceCents])).toEqual([
      ["EFT 1", 0, 4_000, 6_000],
      ["TI-000002", 5_000, 0, 11_000],
    ]);
    expect(st.closing).toBe(11_000);
    expect(st.ageing).toMatchObject({ current: 5_000, d30: 6_000, total: 11_000 });
  });
  it("knows SAST months", () => {
    const { from, to } = statementMonth("2026-02");
    expect(from.toISOString()).toBe("2026-01-31T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-02-28T22:00:00.000Z");
    expect(statementMonth("2026-12").to.toISOString()).toBe("2026-12-31T22:00:00.000Z");
    expect(() => statementMonth("2026-13")).toThrow();
    expect(previousMonth(new Date("2026-01-01T00:30:00+02:00"))).toBe("2025-12");
    expect(previousMonth(new Date("2026-10-03T10:00:00+02:00"))).toBe("2026-09");
  });
});

describe("What may be traded", () => {
  const base = { accountClasses: ["CBD", "CBD_FOOD"], sellerLicences: ["THC"], productStatus: "ACTIVE" };
  it("never THC, only the account's classes, only live products, licences where a class needs one", () => {
    expect(tradeAllowed({ ...base, productClass: "THC" })).toBe(false);
    expect(tradeAllowed({ ...base, accountClasses: ["THC"], productClass: "THC" })).toBe(false);
    expect(tradeAllowed({ ...base, productClass: "CBD" })).toBe(true);
    expect(tradeAllowed({ ...base, productClass: "HEMP" })).toBe(false);
    expect(tradeAllowed({ ...base, productClass: "CBD", productStatus: "DRAFT" })).toBe(false);
    expect(tradeAllowed({ ...base, productClass: "CBD", sellerLicences: [], licensedOnly: ["THC", "CBD"] })).toBe(false);
    expect(TRADE_CLASSES).not.toContain("THC");
    expect(TRADE_CLASSES).toContain("CBD_FOOD");
  });
  it("explains the trade rule per line", () => {
    expect(tradeProblem({ ...base, name: "Test Haze · 3.5g", productClass: "THC" })).toMatch(/licensed medicine/);
    expect(tradeProblem({ ...base, name: "Hemp tee", productClass: "APPAREL" })).toMatch(/Apparel, which this account isn't approved to buy/);
    expect(tradeProblem({ ...base, name: "Calm Oil", productClass: "CBD" })).toBeNull();
    const r = evaluateTradeBasket({ items: [{ name: "Test Haze", regClass: "THC" }, { name: "Calm Oil", regClass: "CBD" }, { name: "Old", regClass: "CBD", productStatus: "ARCHIVED" }], accountClasses: ["CBD"], sellerLicences: [] });
    expect(r.ok).toBe(false);
    expect(r.blocks).toEqual(["Test Haze is a licensed medicine and isn't available to trade customers", "Old isn't available right now"]);
    expect(evaluateTradeBasket({ items: [{ name: "Calm Oil", regClass: "CBD" }], accountClasses: ["CBD"], sellerLicences: [] })).toEqual({ ok: true, blocks: [] });
  });
});

describe("Numbers", () => {
  it("formats and parses trade numbers", () => {
    expect(tradeAccountNumber(1)).toBe("TA-000001");
    expect(tradeOrderNumber(123)).toBe("TO-000123");
    expect(tradeInvoiceNumber(7)).toBe("TI-000007");
    expect(tradeCreditNumber(2)).toBe("TC-000002");
    expect(tradeNumberQuery("ta 12", "TA")).toBe("TA-000012");
    expect(tradeNumberQuery("TO-000005", "TO")).toBe("TO-000005");
    expect(tradeNumberQuery("TO-000005", "TA")).toBeNull();
    expect(tradeNumberQuery("Hatfield Pharmacy", "TA")).toBeNull();
  });
});

describe("The application form", () => {
  const good = {
    legalName: "Hatfield Pharmacy (Pty) Ltd", name: "Hatfield Pharmacy", kind: "pharmacy", regNumber: "2015/123456/07", vatNumber: "4 123 456 789", email: "Accounts@Hatfield.co.za ", phone: "012 342 1234",
    addressLine: "12 Burnett St", suburb: "Hatfield", city: "Pretoria", province: "gp", postalCode: "0083", classes: ["CBD", "CBD_FOOD"], buyerName: "Thandi Nkosi", buyerEmail: "thandi@hatfield.co.za", buyerPhone: "082 555 0199",
    adult: "on", terms: "true",
  };
  it("tidies a good application", () => {
    const r = validateTradeApplication(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ kind: "PHARMACY", vatNumber: "4123456789", regNumber: "2015/123456/07", email: "accounts@hatfield.co.za", phone: "+27123421234", province: "GP", buyerPhone: "+27825550199", delivery: null, classes: ["CBD", "CBD_FOOD"] });
  });
  it("refuses THC, bad numbers, missing attestations and a bad delivery address, by field", () => {
    const r = validateTradeApplication({ ...good, classes: ["CBD", "THC"], vatNumber: "123", regNumber: "abc", adult: "", terms: undefined, deliveryLine: "1 Depot Rd", deliveryCity: "", deliveryProvince: "", deliveryPostalCode: "12" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fields.classes).toMatch(/Licensed medicines/);
    expect(r.fields.vatNumber).toMatch(/ten digits/);
    expect(r.fields.regNumber).toMatch(/2015\/123456\/07/);
    expect(r.fields.adult).toMatch(/18 or older/);
    expect(r.fields.terms).toMatch(/trade terms/);
    expect(r.fields.deliveryCity).toBeTruthy();
    expect(r.fields.deliveryProvince).toBeTruthy();
    expect(r.fields.deliveryPostalCode).toBeTruthy();
    expect(validateTradeApplication({}).ok).toBe(false);
  });
  it("normalises business phones, registration and VAT numbers", () => {
    expect(normaliseTradePhone("011 555 1234")).toBe("+27115551234");
    expect(normaliseTradePhone("+27 82 555 0199")).toBe("+27825550199");
    expect(normaliseTradePhone("0999")).toBeNull();
    expect(normaliseRegNumber("2015 / 123456 / 07")).toBe("2015/123456/07");
    expect(normaliseRegNumber("CK1999/001")).toBeNull();
    expect(normaliseVatNumber("4123456789")).toBe("4123456789");
    expect(normaliseVatNumber("5123456789")).toBeNull();
  });
  it("builds the buyer block for the full tax invoice", () => {
    expect(tradeBuyerBlock({ legalName: "Hatfield Pharmacy (Pty) Ltd", name: "Hatfield Pharmacy", vatNumber: "4123456789", addressLine: "12 Burnett St", suburb: "Hatfield", city: "Pretoria", postalCode: "0083" })).toEqual({
      name: "Hatfield Pharmacy (Pty) Ltd (trading as Hatfield Pharmacy)", address: "12 Burnett St, Hatfield, Pretoria, 0083", vatNumber: "4123456789",
    });
    expect(tradeBuyerBlock({ legalName: "Sole Trader", name: "Sole Trader", vatNumber: null, addressLine: "1 Main Rd", city: "Durban", postalCode: "4001" })).toEqual({ name: "Sole Trader", address: "1 Main Rd, Durban, 4001" });
  });
});

describe("Trade prices", () => {
  const at = new Date("2026-10-03T10:00:00+02:00");
  const mk = (over: Partial<PriceListRule>): PriceListRule => ({ id: "l", name: "List", kind: "TRADE", tiers: [], storeIds: [], regionIds: [], active: true, priority: 0, createdAt: at, items: [], ...over });
  const v = { variantId: "v", wholesaleCents: 28_000 };
  const national = mk({ id: "nat", name: "Trade 2026", items: [{ variantId: "v", priceCents: 20_000, minQty: 1 }, { variantId: "v", priceCents: 18_000, minQty: 12 }] });
  const pharmacy = mk({ id: "ph", name: "Pharmacy group", priority: -1, items: [{ variantId: "v", priceCents: 17_000, minQty: 1 }] });
  it("uses the account's own list first, then the live TRADE lists by priority, with quantity breaks, else the wholesale price", () => {
    expect(resolveTradePrice({ ...v, qty: 6 }, [national, pharmacy], { at })).toMatchObject({ unitCents: 20_000, rule: "Trade 2026", listId: "nat" });
    expect(resolveTradePrice({ ...v, qty: 12 }, [national, pharmacy], { at })).toMatchObject({ unitCents: 18_000, rule: "Trade 2026 (12+)", minQty: 12 });
    expect(resolveTradePrice({ ...v, qty: 12 }, [national, pharmacy], { at, accountListId: "ph" })).toMatchObject({ unitCents: 17_000, rule: "Pharmacy group" });
    expect(resolveTradePrice({ ...v, qty: 1 }, [], { at })).toEqual({ unitCents: 28_000, rule: null, validUntil: null, minQty: 1, listId: null });
    expect(resolveTradePrice({ ...v, qty: 1 }, [mk({ id: "pct", name: "Launch −10%", adjustPct: -10 })], { at }).unitCents).toBe(25_200);
    expect(resolveTradePrice({ ...v, qty: 1 }, [mk({ ...national, endsAt: new Date("2026-09-30T00:00:00+02:00") })], { at }).unitCents).toBe(28_000);
    expect(tradeBreaks(v, [national], { at })).toEqual([{ minQty: 1, unitCents: 20_000 }, { minQty: 12, unitCents: 18_000 }]);
    expect(tradeBreaks(v, [], { at })).toEqual([{ minQty: 1, unitCents: 28_000 }]);
  });
  it("keeps TRADE lists out of consumer quotes and consumer lists out of trade quotes", () => {
    const ctx = { storeId: "s1", regionId: "WC", member: true, tier: "HARVEST" as const, tierPct: 10, at };
    expect(listApplies(national, { ...ctx, channel: "POS" })).toBe(false);
    expect(listApplies(mk({ kind: "ZONE" }), { ...ctx, channel: "WHOLESALE" })).toBe(false);
    expect(listApplies(mk({ kind: "MEMBER" }), { ...ctx, channel: "WHOLESALE" })).toBe(false);
    expect(listApplies(mk({ kind: "ZONE" }), { ...ctx, channel: "POS" })).toBe(true);
  });
});

describe("Trade emails", () => {
  const account = { number: "TA-000001", name: "Hatfield Pharmacy", legalName: "Hatfield Pharmacy (Pty) Ltd", email: "accounts@hatfield.co.za", terms: "ACCOUNT" as const, creditLimitCents: 1_000_000, paymentDays: 30, classes: ["CBD", "CBD_FOOD"] };
  const order: TradeOrderEmailInfo = {
    number: "TO-000007", fulfilment: "COLLECT", payMethod: "ACCOUNT", subtotalCents: 216_000, deliveryCents: 0, handlingCents: 7_500, vatCents: 33_525, totalCents: 257_025, address: null, reference: "PO-55",
    store: { name: "Hatfield", addressLine: "1 Burnett St", suburb: "Hatfield", city: "Pretoria" }, collectionCode: "482913", invoiceNumber: "TI-000003",
    lines: [{ name: "Calm Oil · 30ml", qty: 12, unitCents: 18_000, exCents: 216_000, vatCents: 32_400, shippedQty: 6 }],
  };
  const terms = { minOrderCents: 200_000, deliveryCents: 15_000, freeDeliveryOverCents: 500_000, collectHandlingCents: 7_500, eftHoldDays: 3 };
  it("render with the essentials and subjects that start with Herbal Holland Trade", () => {
    const all = [
      tradeCodeEmail({ code: "123456", minutes: 10 }),
      tradeApprovedEmail({ account, terms, url: "https://x/trade/login" }),
      tradeProFormaEmail({ order: { ...order, fulfilment: "COURIER", payMethod: "EFT", address: "12 Burnett St, Pretoria, 0083" }, account, bank: { bank: "FNB", accountName: "Herbal Holland", accountNumber: "62000000", branchCode: "250655" }, holdDays: 3, url: "https://x/trade/orders/1" }),
      tradeOrderEmail("ready", { order, account, url: "https://x/trade/orders/1" }),
      tradeOrderEmail("collected", { order, account, url: "https://x/trade/orders/1", invoiceUrl: "https://x/invoice/1?t=abc" }),
      tradeOrderEmail("cancelled", { order: { ...order, payMethod: "EFT", paymentRef: "HH-TO-000007" }, account, url: "https://x/trade", refundByHand: true }),
      tradeStatementEmail({ account, month: "2026-09", opening: 0, lines: [{ at: new Date("2026-09-15T09:00:00+02:00"), kind: "INVOICE", reference: "TI-000003", note: null, debitCents: 257_025, creditCents: 0, balanceCents: 257_025 }], closing: 257_025, ageing: { current: 257_025, d30: 0, d60: 0, d90plus: 0, overdue: 0, total: 257_025 }, url: "https://x/trade/statements/2026-09" }),
    ];
    for (const r of all) {
      expect(r.subject.startsWith("Herbal Holland Trade")).toBe(true);
      expect(r.html).toContain("<!doctype html>");
      expect(r.html.length).toBeLessThan(102 * 1024);
      expect(r.text.length).toBeGreaterThan(40);
    }
    expect(all[0].text).toContain("123456");
    expect(all[1].text).toMatch(/30 days from invoice · credit limit R10,000.00/);
    expect(all[2].text).toContain("HH-TO-000007");
    expect(all[2].text).toContain("62000000");
    expect(all[3].text).toContain("Collection code: 482913 (bring your ID)");
    expect(all[4].text).toMatch(/ordered 12, 6 supplied/);
    expect(all[4].text).toContain("https://x/invoice/1?t=abc");
    expect(all[5].text).toMatch(/refunded by hand/);
    expect(all[6].text).toMatch(/Balance due: R2,570.25/);
  });
  it("renders the tax invoice with the buyer block and ex-VAT lines", () => {
    const r = tradeInvoiceEmail(
      {
        id: "s1", number: "TI-000003", kind: "SALE", createdAt: new Date("2026-10-03T10:00:00+02:00"), totalCents: 257_025, vatCents: 33_525,
        buyer: { name: "Hatfield Pharmacy (Pty) Ltd (trading as Hatfield Pharmacy)", address: "12 Burnett St, Hatfield, Pretoria, 0083", vatNumber: "4123456789" },
        store: { name: "Hatfield", addressLine: "1 Burnett St", suburb: "Hatfield", city: "Pretoria", company: { legalName: "Test Retail (Pty) Ltd", vatNumber: "4410000000" } },
        tradeAccount: { number: "TA-000001", name: "Hatfield Pharmacy", legalName: "Hatfield Pharmacy (Pty) Ltd", vatNumber: "4123456789" }, refundOf: null,
        lines: [{ id: "l1", qty: 12, unitPriceCents: 18_000, totalCents: 248_400, vatCents: 32_400, variant: { name: "30ml", product: { name: "Calm Oil" } } }],
        payments: [{ method: "ACCOUNT", amountCents: 257_025 }],
      },
      { url: "https://x/invoice/s1?t=abc", batchCodes: { l1: ["OIL-B"] }, orderNumber: "TO-000007", orderRef: "PO-55", dueAt: new Date("2026-11-02T10:00:00+02:00"), handlingCents: 7_500 },
    );
    expect(r.subject).toBe("Herbal Holland Trade: tax invoice TI-000003 — Hatfield Pharmacy");
    expect(r.text).toContain("Sold to Hatfield Pharmacy (Pty) Ltd (trading as Hatfield Pharmacy), 12 Burnett St, Hatfield, Pretoria, 0083 — VAT no. 4123456789 — account TA-000001");
    expect(r.text).toContain("12 x Calm Oil · 30ml (batch OIL-B) @ R180.00  R2,160.00");
    expect(r.text).toContain("Handling (click & collect)  R75.00");
    expect(r.text).toContain("Total excl. VAT: R2,235.00");
    expect(r.text).toContain("VAT @ 15%: R335.25");
    expect(r.text).toMatch(/Paid by: On account R2,570.25 · due 2 Nov 2026/);
  });
  it("texts the collection code in one segment", () => {
    const t = tradeReadySms({ number: "TO-000007", storeName: "Hatfield", collectionCode: "482913" });
    expect(t).toContain("482913");
    expect(smsSegments(`Herbal Holland: ${t}`)).toBe(1);
  });
});
