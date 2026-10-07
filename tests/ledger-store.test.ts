import { describe, expect, it } from "vitest";
import { sumCents, type Line } from "@/lib/ledger";
import {
  depositLines, expenseLines, hqTenderKey, shiftLines, stockReceiveLines, stockShipLines, storeDayLines, supplierInvoiceLines, supplierPaymentLines,
  type CompanyLines, type DayChannel, type StoreRef,
} from "@/lib/ledger-store";

// Two franchisees (c1 with stores s1 and s3, c2 with s2), a non-vendor (c4), and HQ with its DC and a store of its own.
const s1: StoreRef = { storeId: "s1", companyId: "c1", hqOwned: false, vendor: true };
const s3: StoreRef = { storeId: "s3", companyId: "c1", hqOwned: false, vendor: true };
const s2: StoreRef = { storeId: "s2", companyId: "c2", hqOwned: false, vendor: true };
const nv: StoreRef = { storeId: "s4", companyId: "c4", hqOwned: false, vendor: false };
const dc: StoreRef = { storeId: "dc", companyId: "hq", hqOwned: true, vendor: true };
const hqShop: StoreRef = { storeId: "hs", companyId: "hq", hqOwned: true, vendor: true };

/** Lines as { "account[@party]#store": cents }, easy to read in an assertion. */
const show = (lines: Line[]) => Object.fromEntries(lines.map((l) => [`${l.key ?? l.accountId}${l.partyId ? `@${l.partyId}` : ""}#${l.storeId ?? ""}`, l.cents]));
const books = (out: CompanyLines[]) => Object.fromEntries(out.map((c) => [c.companyId, show(c.lines)]));
const balanced = (out: CompanyLines[] | Line[]) => {
  for (const lines of Array.isArray(out) && out.length && "companyId" in out[0] ? (out as CompanyLines[]).map((c) => c.lines) : [out as Line[]]) expect(sumCents(lines)).toBe(0);
};
const channel = (c: Partial<DayChannel> & Pick<DayChannel, "channel">): DayChannel => ({
  grossCents: 0, vatCents: 0, cardCents: 0, cashCents: 0, payshapCents: 0, eftCents: 0, loyaltyCents: 0, onlineCents: 0, accountCents: 0, ...c,
});
const day = (store: StoreRef, x: Partial<Parameters<typeof storeDayLines>[0]>) => storeDayLines({ store, hqCompanyId: "hq", label: "PTA01 2026-10-04", days: [], tenders: [], stock: [], ...x });

describe("store day", () => {
  it("credits sales ex VAT by channel, debits each tender, and sends what HQ collected or funds to its current account", () => {
    const out = day(s1, {
      days: [
        channel({ channel: "POS", grossCents: 100_000, vatCents: 13_043, cashCents: 30_000, cardCents: 60_000, payshapCents: 5_000, loyaltyCents: 2_000, onlineCents: 3_000 }),
        channel({ channel: "ONLINE", grossCents: 50_000, vatCents: 6_522, onlineCents: 48_000, loyaltyCents: 2_000 }),
        channel({ channel: "WHOLESALE", grossCents: 115_000, vatCents: 15_000, eftCents: 0, accountCents: 115_000 }),
      ],
      tenders: [
        { method: "CARD", cents: 60_000 }, // the store's own money: not HQ's
        { method: "VOUCHER", cents: 3_000 },
        { method: "LOYALTY", cents: 4_000 },
        { method: "ONLINE", cents: 48_000 },
        { method: "ACCOUNT", cents: 115_000, tradeAccountId: "ta1" },
      ],
    });
    expect(books(out)).toEqual({
      c1: {
        "hq#s1": 170_000, "card#s1": 60_000, "cash#s1": 30_000, "bank#s1": 5_000,
        "vat.output#s1": -34_565, "sales.online#s1": -43_478, "sales.pos#s1": -86_957, "sales.trade#s1": -100_000,
      },
      hq: { "debtors@ta1#s1": 115_000, "prepaid#s1": 48_000, "points#s1": 4_000, "vouchers#s1": 3_000, "franchisees@c1#s1": -170_000 },
    });
    balanced(out);
  });

  it("posts the day's stock at cost: sales and refunds to cost of sales, write-offs, counts and deliveries", () => {
    const out = day(s1, {
      stock: [
        { type: "SALE", cents: -40_000 },
        { type: "ONLINE", cents: -10_000 },
        { type: "REFUND", cents: 4_000 },
        { type: "ADJUST", cents: -1_500 },
        { type: "COUNT", cents: 500 },
        { type: "RECEIVE", cents: 20_000 },
        { type: "TRANSFER_IN", cents: 9_999 }, // a stock order's: posted with the order
        { type: "REVALUE", cents: 3 }, // a lot's cost re-averaged on receiving
      ],
    });
    expect(books(out)).toEqual({ c1: { "cogs#s1": 45_997, "stock.loss#s1": 1_500, "stock.count#s1": -500, "grni#s1": -20_000, "stock#s1": -26_997 } });
    balanced(out);
  });

  it("puts a refund's money back the way it came, with negative amounts on both sides of the network", () => {
    const out = day(s1, {
      days: [channel({ channel: "POS", grossCents: -22_900, vatCents: -2_987, cashCents: -10_000, loyaltyCents: -2_900, onlineCents: -10_000 })],
      tenders: [{ method: "LOYALTY", cents: -2_900 }, { method: "VOUCHER", cents: -10_000 }],
      stock: [{ type: "REFUND", cents: 6_500 }],
    });
    expect(books(out)).toEqual({
      c1: { "sales.pos#s1": 19_913, "stock#s1": 6_500, "vat.output#s1": 2_987, "cogs#s1": -6_500, "cash#s1": -10_000, "hq#s1": -12_900 },
      hq: { "franchisees@c1#s1": 12_900, "points#s1": -2_900, "vouchers#s1": -10_000 },
    });
    balanced(out);
  });

  it("posts HQ's own store (a DC) straight into HQ's books, with no current-account legs", () => {
    const out = day(dc, {
      days: [channel({ channel: "WHOLESALE", grossCents: 230_000, vatCents: 30_000, onlineCents: 230_000 })], // trade orders: EFT to HQ and on account
      tenders: [{ method: "EFT", cents: 115_000, collectedByHq: true }, { method: "ACCOUNT", cents: 115_000, tradeAccountId: "ta2" }],
      stock: [{ type: "SALE", cents: -120_000 }, { type: "RECEIVE", cents: 500_000 }],
    });
    expect(books(out)).toEqual({
      hq: {
        "stock#dc": 380_000, "cogs#dc": 120_000, "debtors@ta2#dc": 115_000, "prepaid#dc": 115_000,
        "vat.output#dc": -30_000, "sales.trade#dc": -200_000, "grni#dc": -500_000,
      },
    });
    balanced(out);
  });

  it("knows which tenders are HQ's: till EFT is the store's, a trade order's EFT went to HQ", () => {
    expect([hqTenderKey({ method: "EFT" }), hqTenderKey({ method: "EFT", collectedByHq: true }), hqTenderKey({ method: "CASH" }), hqTenderKey({ method: "PAYSHAP" })]).toEqual([null, "prepaid", null, null]);
    expect(["ONLINE", "VOUCHER", "LOYALTY", "ACCOUNT"].map((method) => hqTenderKey({ method }))).toEqual(["prepaid", "vouchers", "points", "debtors"]);
  });

  it("sends tenders that don't add up to the takings to cash over and short", () => {
    const short = day(s1, { days: [channel({ channel: "POS", grossCents: 22_900, vatCents: 2_987, cashCents: 20_000 })] });
    expect(books(short).c1).toMatchObject({ "cash#s1": 20_000, "cash.diff#s1": 2_900 });
    const over = day(s1, { days: [channel({ channel: "POS", grossCents: 22_900, vatCents: 2_987, cashCents: 25_000 })] });
    expect(books(over).c1).toMatchObject({ "cash#s1": 25_000, "cash.diff#s1": -2_100 });
    balanced(short);
    balanced(over);
  });

  it("charges a non-vendor's takings with the VAT the sales carried, which is none", () => {
    const out = day(nv, { days: [channel({ channel: "POS", grossCents: 22_900, cardCents: 22_900 })] });
    expect(books(out)).toEqual({ c4: { "card#s4": 22_900, "sales.pos#s4": -22_900 } });
  });

  it("posts nothing for a quiet day, or one whose sales were all refunded", () => {
    expect(day(s1, {})).toEqual([]);
    expect(day(s1, { days: [channel({ channel: "POS" }), channel({ channel: "ONLINE" })], stock: [{ type: "SALE", cents: 0 }] })).toEqual([]);
    expect(day(s1, { days: [channel({ channel: "POS", grossCents: 0, cashCents: 0 })], stock: [{ type: "SALE", cents: -6_500 }, { type: "REFUND", cents: 6_500 }] })).toEqual([]);
  });

  it("refuses a day whose payments don't agree with the rollup, naming the store, day and difference", () => {
    expect(() => day(s1, { days: [channel({ channel: "ONLINE", grossCents: 10_000, vatCents: 1_304, onlineCents: 10_000 })], tenders: [{ method: "ONLINE", cents: 9_000 }] })).toThrow(
      "PTA01 2026-10-04: the payments HQ collected or funds come to R90.00 and the day's rollup to R100.00, so they're out by -R10.00",
    );
  });
});

describe("cash, expenses and outside suppliers", () => {
  it("moves a cash-up's difference between cash and over-and-short, and banks a deposit", () => {
    expect(show(shiftLines({ storeId: "s1", varianceCents: -1_200 }))).toEqual({ "cash.diff#s1": 1_200, "cash#s1": -1_200 });
    expect(show(shiftLines({ storeId: "s1", varianceCents: 500 }))).toEqual({ "cash#s1": 500, "cash.diff#s1": -500 });
    expect(shiftLines({ storeId: "s1", varianceCents: 0 })).toEqual([]);
    expect(show(depositLines({ storeId: "s1", amountCents: 400_000 }))).toEqual({ "bank#s1": 400_000, "cash#s1": -400_000 });
  });

  it("claims VAT on an expense for a vendor only: a non-vendor's stays in the cost", () => {
    const vendor = expenseLines({ storeId: "s1", category: "RENT", amountCents: 115_000, vatCents: 15_000, vendor: true });
    expect(show(vendor)).toEqual({ "exp.RENT#s1": 100_000, "vat.input#s1": 15_000, "bank#s1": -115_000 });
    const not = expenseLines({ storeId: "s4", category: "SECURITY", amountCents: 115_000, vatCents: 15_000, vendor: false });
    expect(show(not)).toEqual({ "exp.SECURITY#s4": 115_000, "bank#s4": -115_000 });
    balanced(vendor);
    balanced(not);
  });

  it("charges a supplier's invoice to the chosen account (other expenses by default) and owes the supplier by name", () => {
    const inv = supplierInvoiceLines({ storeId: "s1", supplierName: " ACME (Pty)  Ltd", accountId: "acc-utilities", totalCents: 115_000, vatCents: 15_000, vendor: true });
    expect(show(inv)).toEqual({ "acc-utilities#s1": 100_000, "vat.input#s1": 15_000, "creditors@acme (pty) ltd#s1": -115_000 });
    expect(show(supplierInvoiceLines({ storeId: "s4", supplierName: "Acme", totalCents: 23_000, vatCents: 3_000, vendor: false }))).toEqual({ "exp.OTHER#s4": 23_000, "creditors@acme#s4": -23_000 });
    const paid = supplierPaymentLines({ storeId: "s1", supplierName: "acme (pty) ltd", totalCents: 115_000 });
    expect(show(paid)).toEqual({ "creditors@acme (pty) ltd#s1": 115_000, "bank#s1": -115_000 });
    balanced(inv);
    balanced(paid);
  });
});

describe("stock orders", () => {
  const order = { receivedCents: 90_000, valueCents: 103_500, shippedCostCents: 60_000, receivedCostCents: 54_000 }; // 10 shipped at R60 cost, 9 arrived at R100 + VAT
  const receive = (buyer: StoreRef, seller: StoreRef, o: Partial<typeof order> = {}) => stockReceiveLines({ hqCompanyId: "hq", buyer, seller, ...order, ...o });

  it("puts shipped stock in transit at the seller's cost", () => {
    expect(show(stockShipLines({ storeId: "dc", costCents: 60_000 }))).toEqual({ "transit#dc": 60_000, "stock#dc": -60_000 });
  });

  it("WHOLESALE: the buyer owes HQ the invoice; HQ sells from its DC and loses the unit that never arrived", () => {
    const out = receive(s1, dc);
    expect(books(out)).toEqual({
      c1: { "stock#s1": 90_000, "vat.input#s1": 13_500, "hq#s1": -103_500 },
      hq: { "franchisees@c1#s1": 103_500, "cogs#dc": 54_000, "stock.transit#dc": 6_000, "vat.output#dc": -13_500, "transit#dc": -60_000, "sales.wholesale#dc": -90_000 },
    });
    balanced(out);
  });

  it("NETWORK between companies: the seller sells, both settle through HQ, which carries it on their accounts", () => {
    const out = receive(s1, s2, { receivedCents: 50_000, valueCents: 57_500, shippedCostCents: 30_000, receivedCostCents: 30_000 });
    expect(books(out)).toEqual({
      c1: { "stock#s1": 50_000, "vat.input#s1": 7_500, "hq#s1": -57_500 },
      c2: { "hq#s2": 57_500, "cogs#s2": 30_000, "vat.output#s2": -7_500, "transit#s2": -30_000, "sales.network#s2": -50_000 },
      hq: { "franchisees@c1#s1": 57_500, "franchisees@c2#s2": -57_500 },
    });
    balanced(out);
  });

  it("between two stores of one company: a transfer (VAT legs between own stores, the transfer price difference, any short a loss)", () => {
    const out = receive(s1, s3, { receivedCents: 40_000, valueCents: 46_000, shippedCostCents: 30_000, receivedCostCents: 24_000 });
    expect(books(out)).toEqual({
      c1: {
        "hq#s3": 46_000, "stock#s1": 40_000, "interstore#s1": 6_000, "stock.transit#s3": 6_000,
        "interstore#s3": -6_000, "transfer.diff#s3": -16_000, "transit#s3": -30_000, "hq#s1": -46_000,
      },
      hq: { "franchisees@c1#s1": 46_000, "franchisees@c1#s3": -46_000 },
    });
    balanced(out);
  });

  it("keeps VAT out of input tax unless both sides are VAT vendors", () => {
    const buyerNot = books(receive(nv, dc));
    expect(buyerNot.c4).toEqual({ "stock#s4": 90_000, "vat.nonclaimable#s4": 13_500, "hq#s4": -103_500 });
    const sellerNot = books(receive(s1, nv, { shippedCostCents: 54_000 }));
    expect(sellerNot.c1).toEqual({ "stock#s1": 90_000, "vat.nonclaimable#s1": 13_500, "hq#s1": -103_500 });
    expect(sellerNot.c4).toEqual({ "hq#s4": 103_500, "cogs#s4": 54_000, "transit#s4": -54_000, "sales.network#s4": -103_500 }); // no VAT charged
  });

  it("writes off everything shipped when nothing arrives, and moves stock between HQ's own stores with no current accounts", () => {
    const lost = receive(s1, dc, { receivedCents: 0, valueCents: 0, receivedCostCents: 0 });
    expect(books(lost)).toEqual({ hq: { "stock.transit#dc": 60_000, "transit#dc": -60_000 } });
    const own = receive(hqShop, dc, { receivedCents: 40_000, valueCents: 46_000, shippedCostCents: 30_000, receivedCostCents: 24_000 });
    expect(books(own)).toEqual({ hq: { "stock#hs": 40_000, "stock.transit#dc": 6_000, "transfer.diff#dc": -16_000, "transit#dc": -30_000 } });
    balanced(own);
  });
});
