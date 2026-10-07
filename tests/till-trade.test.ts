import { describe, expect, it } from "vitest";
import { classifyBlock, tradeCodeMatches, tradeSummary, tradeTenders, tradeTermsLabel } from "@/components/pos/lib/rules";
import { lineEx, receiptBytes, TRADE_LINE, tradeLineRows, tradeTenderLabel, tradeTenderRows, tradeTotalRows, type ReceiptStore } from "@/components/pos/lib/receipt";
import { zReportBytes } from "@/components/pos/lib/print-z";
import { trainingAllows } from "@/components/pos/lib/training";
import { buildSnapshot, tenderName } from "@/components/pos/lib/display";
import { allocateRefund } from "@/lib/vouchers";
import type { QuoteDTO, ReceiptDTO, TradeAccountDTO, ZReport } from "@/server/pos/types";

const account = (over: Partial<TradeAccountDTO> = {}): TradeAccountDTO => ({
  id: "ta1",
  number: "TA-000123",
  name: "Green Leaf Pharmacy",
  legalName: "Green Leaf Pharmacy (Pty) Ltd",
  vatNumber: "4123456789",
  status: "APPROVED",
  terms: "ACCOUNT",
  classes: ["CBD", "CBD_TOPICAL", "ACCESSORY"],
  creditLimitCents: 500_000,
  paymentDays: 30,
  balanceCents: 120_000,
  availableCents: 380_000,
  licenceProblem: null,
  ...over,
});

describe("trade-sale tenders", () => {
  it("offers money as usual and On account only within what the credit decision allows", () => {
    const r = tradeTenders({ account: account(), online: true, amountCents: 100_000 });
    expect(r).toMatchObject({ cash: true, card: true, eft: true, payshap: true, account: true, accountReason: null, points: false, voucher: false });
    // What this sale already put on account counts: R3,800 available, R3,000 on account so far, another R1,000 is too much.
    const r2 = tradeTenders({ account: account(), online: true, amountCents: 100_000, onAccountSoFarCents: 300_000 });
    expect(r2.account).toBe(false);
    expect(r2.accountReason).toBe("Only R800.00 available on account");
    expect(tradeTenders({ account: account(), online: true, amountCents: 80_000, onAccountSoFarCents: 300_000 }).account).toBe(true);
  });

  it("never puts a held or prepaid account's sale on account, and nothing without a connection", () => {
    expect(tradeTenders({ account: account({ status: "ON_HOLD", availableCents: 0 }), online: true, amountCents: 1000 })).toMatchObject({ account: false, accountReason: "On hold, so money only", cash: true });
    expect(tradeTenders({ account: account({ terms: "PREPAID", availableCents: 0 }), online: true, amountCents: 1000 })).toMatchObject({ account: false, accountReason: "Prepaid account, so money only" });
    expect(tradeTenders({ account: account({ availableCents: 0 }), online: true, amountCents: 1000 }).accountReason).toBe("Nothing available on account");
    // A trade sale needs the connection anyway: offline, only cash is left on the sheet and nothing goes on account.
    const off = tradeTenders({ account: account(), online: false, amountCents: 1000 });
    expect(off).toMatchObject({ cash: true, card: false, eft: false, payshap: false, account: false });
  });

  it("labels the terms and classifies the trade basket rule's messages", () => {
    expect(tradeTermsLabel(account())).toBe("On account · 30 days");
    expect(tradeTermsLabel(account({ terms: "PREPAID" }))).toBe("Prepaid (EFT)");
    expect(classifyBlock("Durban Poison · 3.5g is a licensed medicine and isn't available to trade customers")).toBe("TRADE");
    expect(classifyBlock("Hoodie · L is Apparel, which this account isn't approved to buy")).toBe("TRADE");
    expect(classifyBlock("Calm CBD Oil · 30ml isn't available right now")).toBe("TRADE");
    expect(classifyBlock("Age verification required (18+): the person buying for Green Leaf must be an adult")).toBe("AGE");
  });

  it("lets training mode look accounts up but never hand a trade order over", () => {
    expect(trainingAllows("POST", "/api/pos/trade/accounts")).toBe(true);
    expect(trainingAllows("POST", "/api/pos/trade/orders/o1/collect")).toBe(false);
    expect(trainingAllows("POST", "/api/pos/sales")).toBe(false);
  });
});

describe("trade collection code", () => {
  it("matches the order's 6-digit code exactly: never the order number, never a partial code", () => {
    expect(tradeCodeMatches("483920", "483920")).toBe(true);
    expect(tradeCodeMatches("483920", " 483 920 ")).toBe(true);
    expect(tradeCodeMatches("483920", "48392")).toBe(false);
    expect(tradeCodeMatches("483920", "TO-000123")).toBe(false);
    expect(tradeCodeMatches("483920", "4839201")).toBe(false);
    expect(tradeCodeMatches(null, "483920")).toBe(false);
    expect(tradeCodeMatches("483920", "")).toBe(false);
  });
});

describe("trade refund split (mirrors sales.refundSale)", () => {
  it("credits the account first, up to what's still open on it, then pays the rest out", () => {
    // R4,300 sale: R100 cash, R4,200 on account. Refunding a R104.50 line goes back onto the account as a credit note.
    expect(allocateRefund({ refundCents: 10_450, voucherPaidCents: 420_000, voucherRefundedCents: 0 })).toEqual({ toVoucher: 10_450, toTender: 0 });
    // Only R100 was on account and R40 of it already credited: R60 to the account, the rest in money.
    expect(allocateRefund({ refundCents: 10_450, voucherPaidCents: 10_000, voucherRefundedCents: 4_000 })).toEqual({ toVoucher: 6_000, toTender: 4_450 });
    // Nothing on account (a prepaid account paid cash): all money.
    expect(allocateRefund({ refundCents: 10_450, voucherPaidCents: 0, voucherRefundedCents: 0 })).toEqual({ toVoucher: 0, toTender: 10_450 });
  });
});

describe("Z-report trade section", () => {
  const rows = [
    { kind: "SALE", channel: "POS", count: 40, totalCents: 1_000_000, vatCents: 130_435 },
    { kind: "SALE", channel: "WHOLESALE", count: 2, totalCents: 46_000, vatCents: 6_000 },
    { kind: "REFUND", channel: "WHOLESALE", count: 1, totalCents: -11_500, vatCents: -1_500 },
    { kind: "REFUND", channel: "POS", count: 1, totalCents: -38_500, vatCents: -5_022 },
  ];
  const tenders = [
    { method: "CASH", amountCents: 300_000 },
    { method: "CARD", amountCents: 700_000 },
    { method: "ACCOUNT", amountCents: 36_000 - 11_500 }, // net of the credit note
  ];
  it("counts WHOLESALE sales ex VAT, VAT and incl, their credit notes, and the on-account part (which is not money)", () => {
    const t = tradeSummary(rows, tenders);
    expect(t).toEqual({ count: 2, exCents: 40_000, vatCents: 6_000, inclCents: 46_000, refundCents: 11_500, onAccountCents: 24_500 });
    expect(t.exCents + t.vatCents).toBe(t.inclCents);
    // The retail figures are untouched, and nothing on account appears under cash or card.
    expect(tradeSummary(rows.filter((r) => r.channel === "POS"), tenders.filter((x) => x.method !== "ACCOUNT"))).toEqual({ count: 0, exCents: 0, vatCents: 0, inclCents: 0, refundCents: 0, onAccountCents: 0 });
  });

  it("prints the section on the Z-report slip, with On account as its own tender line", () => {
    const z: ZReport = {
      shiftId: "s1",
      closed: true,
      store: { code: "PTA01", name: "Hatfield", legalName: "Hatfield Herbal (Pty) Ltd", vatNumber: "4123456789" },
      device: { name: "Counter 1", prefix: "B" },
      openedAt: "2026-10-03T08:00:00+02:00",
      closedAt: "2026-10-03T18:00:00+02:00",
      openedBy: "Shireen Singh",
      closedBy: "Shireen Singh",
      sales: { count: 42, grossCents: 1_046_000, vatCents: 136_435, netCents: 909_565, discountCents: 0, memberSavingsCents: 0, units: 60 },
      refunds: { count: 0, totalCents: 0 },
      online: { count: 0, grossCents: 0 },
      tenders: [
        { method: "CARD", label: "Card", amountCents: 700_000, count: 30 },
        { method: "CASH", label: "Cash", amountCents: 310_000, count: 12 },
        { method: "ACCOUNT", label: "On account", amountCents: 36_000, count: 1 },
      ],
      points: { issued: 0, redeemed: 0 },
      cash: { floatCents: 100_000, cashNetCents: 310_000, expectedCents: 410_000, countedCents: 410_000, varianceCents: 0, counts: null },
      takingsCents: 1_046_000,
      dispensing: null,
      trade: tradeSummary(rows.filter((r) => r.kind === "SALE"), tenders),
      notes: null,
      emailedTo: null,
    };
    const text = new TextDecoder("latin1").decode(zReportBytes(z, { cols: 48, at: new Date("2026-10-03T18:01:00+02:00") }));
    expect(text).toContain("Trade sales (wholesale)");
    expect(text).toContain("Sales (2) incl VAT");
    expect(text).toContain("R460.00");
    expect(text).toContain("Ex VAT");
    expect(text).toContain("R400.00");
    expect(text).toContain("On account (not money)");
    expect(text).toContain("On account (1)"); // its own tender line, apart from cash and card
    expect(text).toMatch(/Expected\s+R4,100\.00/); // the cash-up ignores what's on account
  });
});

describe("trade tax invoice lines", () => {
  const trade = { accountId: "ta1", number: "TA-000123", name: "Green Leaf Pharmacy", terms: "ACCOUNT" as const, paymentDays: 30, onAccountCents: 36_000, creditedCents: 0, dueAt: "2026-11-02T10:00:00+02:00", orderNumber: null };
  const line = { id: "l1", variantId: "v-pouch", name: "Smell-proof Pouch", variantName: "One size", sku: "ACC-SMPR42", qty: 2, unitPriceCents: 9_087, discountCents: 0, offerCents: 0, totalCents: 20_900, vatCents: 2_726, exCents: 18_174, refundedQty: 0 };
  const store: ReceiptStore = { code: "PTA01", name: "Hatfield", legalName: "Hatfield Herbal (Pty) Ltd", vatNumber: "4123456789", addressLine: "12 Burnett Street", suburb: "Hatfield", city: "Pretoria", postalCode: "0083", phone: null, licenceRef: null, receiptFooter: null };
  const receipt = (over: Partial<ReceiptDTO> = {}): ReceiptDTO => ({
    id: "0f7e2c4a-1111-4222-8333-444455556666",
    number: "PTA01-B00050",
    kind: "SALE",
    channel: "WHOLESALE",
    title: "Tax invoice",
    createdAt: "2026-10-03T12:03:00+02:00",
    offline: false,
    refundOf: null,
    staff: "Shireen Singh",
    customer: null,
    lines: [line, { id: "l2", variantId: "v-oil", name: "Calm CBD Oil 600mg", variantName: "30ml", sku: "WEL-CALM-30", qty: 1, unitPriceCents: 28_457, discountCents: 0, offerCents: 0, totalCents: 32_726, vatCents: 4_269, exCents: 28_457, refundedQty: 0 }],
    subtotalCents: 53_626,
    discountCents: 0,
    offerCents: 0,
    offers: [],
    memberSavingsCents: 0,
    totalCents: 53_626,
    vatCents: 6_995,
    pointsEarned: 0,
    pointsRedeemed: 0,
    payments: [
      { method: "CASH", amountCents: 10_000, tenderedCents: 10_000, changeCents: 0, provider: null, reference: null, cardBrand: null, cardLast4: null },
      { method: "ACCOUNT", amountCents: 43_626, tenderedCents: null, changeCents: null, provider: null, reference: "TA-000123", cardBrand: null, cardLast4: null },
    ],
    trade: { ...trade, onAccountCents: 43_626 },
    promoCode: null,
    invoiceEmail: "accounts@greenleaf.co.za",
    buyer: { name: "Green Leaf Pharmacy (Pty) Ltd (trading as Green Leaf Pharmacy)", address: "1 Burnett St, Hatfield, Pretoria, 0083", vatNumber: "4123456789" },
    note: null,
    refunds: [],
    invoiceUrl: "https://shop.herbalholland.com/invoice/0f7e2c4a-1111-4222-8333-444455556666?t=abc123",
    ...over,
  });

  it("prints unit ex VAT, VAT and incl per line, the ex-VAT subtotal, and the handling fee of a collected order", () => {
    expect(tradeLineRows(line)).toEqual([
      ["  2 x R90.87 ex VAT", "R181.74"],
      ["  VAT 15%", "R27.26"],
      ["  Incl VAT", "R209.00"],
    ]);
    // A promotion on a trade line: the discount shows ex VAT.
    expect(tradeLineRows({ ...line, exCents: 16_174, vatCents: 2_426, totalCents: 18_600 })[1]).toEqual(["  Trade discount ex VAT", "-R20.00"]);
    expect(lineEx({ totalCents: 20_900, vatCents: 2_726 })).toBe(18_174);
    expect(tradeTotalRows(receipt())).toEqual([
      ["Subtotal ex VAT", "R466.31"],
      ["VAT 15%", "R69.95"],
    ]);
    // A handed-over trade order carries the store's handling fee (R75 ex VAT + R11.25 VAT) beyond its lines.
    expect(tradeTotalRows(receipt({ totalCents: 53_626 + 8_625, vatCents: 6_995 + 1_125 }))).toEqual([
      ["Subtotal ex VAT", "R466.31"],
      ["Handling fee ex VAT", "R75.00"],
      ["VAT 15%", "R81.20"],
    ]);
  });

  it("labels On account with its due date, and a credit note's account part as credited", () => {
    expect(tradeTenderLabel({ method: "ACCOUNT", amountCents: 43_626, reference: "TA-000123", cardLast4: null }, trade)).toBe("On account - due 2 Nov 2026");
    // On paper the due date takes a row of its own, so the amount never pushes the label off 58 mm paper.
    expect(tradeTenderRows({ method: "ACCOUNT", amountCents: 43_626, reference: "TA-000123", cardLast4: null }, trade)).toEqual([
      ["On account", "R436.26"],
      ["  Due 2 Nov 2026", ""],
    ]);
    expect(tradeTenderRows({ method: "CASH", amountCents: 10_000, reference: null, cardLast4: null }, trade)).toEqual([["Cash", "R100.00"]]);
    expect(tradeTenderLabel({ method: "ACCOUNT", amountCents: 43_626, reference: "TA-000123", cardLast4: null }, { dueAt: null })).toBe("On account");
    expect(tradeTenderLabel({ method: "ACCOUNT", amountCents: -10_450, reference: "PTA01-B00051", cardLast4: null }, trade)).toBe("Credited to the account");
    expect(tradeTenderLabel({ method: "CASH", amountCents: 10_000, reference: null, cardLast4: null }, trade)).toBe("Cash");
    expect(tradeTenderLabel({ method: "CARD", amountCents: 10_000, reference: "A1B2", cardLast4: "1234" }, trade)).toBe("Card **** 1234 (A1B2)");
  });

  it("prints a trade sale as a TAX INVOICE with the buyer block, ex-VAT lines and the on-account terms (no points, deals or member)", () => {
    const bytes = receiptBytes(receipt(), { cols: 48, store, devicePrefix: "B" });
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("TAX INVOICE");
    expect(text).toContain("2 x R90.87 ex VAT");
    expect(text).toContain("Subtotal ex VAT");
    expect(text).toContain("TOTAL INCL VAT");
    expect(text).toContain("On account");
    expect(text).toContain("Due 2 Nov 2026");
    expect(text).toContain("Buyer: Green Leaf Pharmacy (Pty) Ltd (trading as");
    expect(text).toContain("Buyer VAT no. 4123456789");
    expect(text).toContain("Trade account TA-000123 - Green Leaf Pharmacy");
    expect(text).toContain("Payment terms: 30 days - R436.26 on account, due");
    expect(text).toContain(TRADE_LINE.slice(0, 30));
    expect(text).not.toContain("Points");
    expect(text).not.toContain("Rewards");
    expect(text).not.toContain("My Deals");
    // 58 mm paper (32 columns): every trade row fits without the amount cutting the label short.
    const r = receipt();
    const rows = [...r.lines.flatMap((l) => tradeLineRows(l)), ...tradeTotalRows(r), ...r.payments.flatMap((t) => tradeTenderRows(t, r.trade)), ["TOTAL INCL VAT", "R536.26"]];
    for (const [left, right] of rows) expect(left.length + (right ? right.length + 1 : 0), `${left}|${right}`).toBeLessThanOrEqual(32);
  });

  it("prints the credit note of a trade sale with the account part credited back", () => {
    const text = new TextDecoder("latin1").decode(
      receiptBytes(
        receipt({
          kind: "REFUND",
          title: "Credit note",
          number: "PTA01-B00051",
          refundOf: { id: "x", number: "PTA01-B00050" },
          lines: [{ ...line, qty: -1, totalCents: -10_450, vatCents: -1_363, exCents: -9_087 }],
          totalCents: -10_450,
          vatCents: -1_363,
          payments: [{ method: "ACCOUNT", amountCents: -10_450, tenderedCents: null, changeCents: null, provider: null, reference: "PTA01-B00051", cardBrand: null, cardLast4: null }],
          trade: { ...trade, onAccountCents: -10_450 },
          note: "Wrong item sold",
        }),
        { cols: 48, store, devicePrefix: "B" },
      ),
    );
    expect(text).toContain("CREDIT NOTE");
    expect(text).toContain("Refund of PTA01-B00050");
    expect(text).toContain("Credited to the account");
    expect(text).toContain("-R104.50");
  });
});

describe("customer display in trade mode", () => {
  it("names the business (never its number or balance) and shows ex VAT, VAT and the total", () => {
    const q: QuoteDTO = { lines: [{ variantId: "v-pouch", qty: 2, unitPriceCents: 9_087, shelfCents: 9_087, rrpCents: 19_000, priceRule: "Trade price", grossCents: 20_900, discountCents: 0, totalCents: 20_900, vatCents: 2_726, exCents: 18_174, noEarn: true, memberSavingsCents: 0, offerCents: 0, offerName: null }], subtotalCents: 20_900, discountCents: 0, offerCents: 0, totalCents: 20_900, vatCents: 2_726, exCents: 18_174, pointsMultiplier: 1, applied: [], suggestions: [], pointsEstimate: 0, memberSavingsCents: 0, joinSavingsCents: 0 };
    const s = buildSnapshot({
      store: { name: "Hatfield", code: "PTA01" },
      cart: { lines: [{ variantId: "v-pouch", qty: 2 }], customer: null, trade: account() },
      quote: q,
      productOf: () => ({ name: "Smell-proof Pouch", variantName: "One size", regClass: "ACCESSORY" }),
      licensedClasses: ["THC"],
      stage: "basket",
      idle: [],
      training: false,
    });
    expect(s.state).toBe("sale");
    expect(s.trade).toEqual({ account: "Green Leaf Pharmacy" });
    expect(s.exCents).toBe(18_174);
    expect(s.vatCents).toBe(2_726);
    expect(s.totalCents).toBe(20_900);
    expect(s.member).toBeNull();
    expect(JSON.stringify(s)).not.toContain("TA-000123");
    expect(JSON.stringify(s)).not.toContain("380");
    expect(tenderName("account")).toBe("On account");
    expect(tenderName("eft")).toBe("EFT");
  });
});
