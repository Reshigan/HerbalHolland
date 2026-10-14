// The trade channel through finance: a WHOLESALE sale on ACCOUNT terms lands in its own rollup row with the tender in
// accountCents; finance derives money taken and what HQ collected from it; the franchise statement carries the trade
// line (royalty and levy at the standard rates, no e-commerce fee) and credits what HQ collected; the P&L and VAT
// working include it; the trade reports list it by account; and its invoice renders as a trade tax invoice.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, tx } from "@/server/db";
import { postPosSale, postSaleTx } from "@/server/sales";
import { quote } from "@/server/pricing";
import { franchiseStatement, profitAndLoss, salesByChannel, salesSummary, shiftCash, vatReport } from "@/server/finance";
import { kpis, todayTakings, tradeQueue } from "@/server/dashboard";
import { getReport } from "@/server/reports";
import { reportContext } from "@/server/reports/context";
import { invoiceData } from "@/server/invoices";
import { saleInvoiceEmail } from "@/server/email-templates";
import { storeForUser } from "@/server/scope";
import type { Staff } from "@/server/auth";
import { dateOnly, dayKey, rangeFromParams } from "@/lib/format";
import { applyBps } from "@/lib/money";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let hq: Staff;
let manager: Staff;
let account: { id: string; number: string; name: string };
let shift: { id: string };
let dcSale: { id: string; totalCents: number; vatCents: number; qty: number };
let tillSale: { id: string; totalCents: number; vatCents: number; qty: number };
let retail: { totalCents: number; vatCents: number };
const now = new Date();
const today = dayKey(now);
const range = rangeFromParams({ from: today, to: today });
const dueAt = new Date(now.getTime() + 30 * 86_400_000);
const staff = (id: string) => db.user.findUniqueOrThrow({ where: { id }, include: { company: true, store: true, region: true } }) as Promise<Staff>;

const UNIT_EX = 28_000; // the oil's trade price, ex VAT
/** A trade sale: ex-VAT lines with 15% added per line, the buyer block, one ACCOUNT tender, invoiced on HQ's ledger. */
async function tradeSale(storeId: string, number: string, qty: number, shiftId?: string) {
  const ex = qty * UNIT_EX;
  const vat = Math.round(ex * 0.15);
  const total = ex + vat;
  const sale = await tx((t) =>
    postSaleTx(t, {
      id: randomUUID(), number, storeId, channel: "WHOLESALE", shiftId: shiftId ?? null, staffId: shiftId ? w.manager.id : null,
      quote: {
        lines: [{ variantId: w.oilV.id, qty, unitPriceCents: UNIT_EX, discountCents: 0, totalCents: total, vatCents: vat, noEarn: true }],
        subtotalCents: total, discountCents: 0, totalCents: total, vatCents: vat, pointsMultiplier: 1, promotionId: null,
      },
      buyer: { name: "Hatfield Pharmacy (Pty) Ltd", address: "12 Burnett St, Hatfield, Pretoria, 0083", vatNumber: "4550001234" },
      payments: [{ method: "ACCOUNT", amountCents: total }],
      pointsRedeemed: 0, redeemNow: false, ageCheck: "NONE", offline: false, createdAt: now,
    }),
  );
  await db.sale.update({ where: { id: sale.id }, data: { tradeAccountId: account.id } });
  await db.tradeLedgerEntry.create({ data: { tradeAccountId: account.id, kind: "INVOICE", cents: total, reference: number, saleId: sale.id, dueAt } });
  return { id: sale.id, totalCents: total, vatCents: vat, qty };
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  hq = await staff((await db.user.create({ data: { name: "Hanna HQ", role: "HQ_STAFF", companyId: w.hq.id } })).id);
  manager = await staff(w.manager.id);
  account = await db.tradeAccount.create({
    data: {
      number: "TA-000001", name: "Hatfield Pharmacy", legalName: "Hatfield Pharmacy (Pty) Ltd", kind: "PHARMACY", vatNumber: "4550001234", email: "orders@hatfieldpharmacy.example",
      addressLine: "12 Burnett St", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083", status: "APPROVED", terms: "ACCOUNT", paymentDays: 30,
      creditLimitCents: 5_000_000_00, classes: ["CBD"], dcId: w.dc.id,
    },
  });
  // A retail sale at the store (cash, a member's coffee), a trade order shipped from the DC on account, and a trade sale
  // rung up at the store's till on account during a shift.
  const lines = [{ variantId: w.coffeeV.id, qty: 1 }];
  const q = await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId: w.walkIn.id });
  const r = await postPosSale(
    { id: randomUUID(), number: "TST01-A00001", customerId: w.walkIn.id, lines, payments: [{ method: "CASH", amountCents: q.totalCents }], ageCheck: "ID_SIGHTED" },
    { storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Mia" },
  );
  retail = { totalCents: r.sale.totalCents, vatCents: r.sale.vatCents };
  shift = await db.shift.create({ data: { storeId: w.store.id, openedById: w.manager.id, deviceId: w.device.id, openingFloatCents: 50_000 } });
  dcSale = await tradeSale(w.dc.id, "DC-T-T00001", 24);
  tillSale = await tradeSale(w.store.id, "TST01-T00001", 2, shift.id);
  await db.tradeOrder.createMany({
    data: [
      { number: "TO-000001", tradeAccountId: account.id, storeId: w.dc.id, status: "PENDING_PAYMENT", payMethod: "EFT", subtotalCents: 56_000, vatCents: 8_400, totalCents: 64_400, events: [] },
      { number: "TO-000002", tradeAccountId: account.id, storeId: w.dc.id, status: "PLACED", payMethod: "ACCOUNT", subtotalCents: 56_000, vatCents: 8_400, totalCents: 64_400, events: [] },
      { number: "TO-000003", tradeAccountId: account.id, storeId: w.store.id, fulfilment: "COLLECT", handlingCents: 2_500, status: "READY", payMethod: "ACCOUNT", subtotalCents: 56_000, vatCents: 8_775, totalCents: 67_275, events: [] },
    ],
  });
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500));
  await db.$disconnect();
});

describe("rollups", () => {
  it("lands a trade sale in the WHOLESALE row with the ACCOUNT tender in accountCents, beside the retail POS row", async () => {
    const dc = await db.dailyStoreStat.findFirst({ where: { storeId: w.dc.id, date: dateOnly(now), channel: "WHOLESALE" } });
    expect(dc).toMatchObject({ sales: 1, units: 24, grossCents: dcSale.totalCents, vatCents: dcSale.vatCents, accountCents: dcSale.totalCents, cashCents: 0, cardCents: 0, eftCents: 0, onlineCents: 0, loyaltyCents: 0, members: 0, pointsIssued: 0 });
    expect(dc!.costCents).toBeGreaterThan(0); // FIFO cost from the DC's lots
    const rows = await db.dailyStoreStat.findMany({ where: { storeId: w.store.id, date: dateOnly(now) } });
    expect(rows.map((x) => x.channel).sort()).toEqual(["POS", "WHOLESALE"]);
    expect(rows.find((x) => x.channel === "POS")).toMatchObject({ grossCents: retail.totalCents, cashCents: retail.totalCents, accountCents: 0 });
    expect(rows.find((x) => x.channel === "WHOLESALE")).toMatchObject({ sales: 1, units: 2, grossCents: tillSale.totalCents, accountCents: tillSale.totalCents, cashCents: 0 });
  });
});

describe("finance", () => {
  it("sums the account column, and derives money taken and what HQ collected", async () => {
    const s = await salesSummary([w.store.id], range);
    expect(s.grossCents).toBe(retail.totalCents + tillSale.totalCents);
    expect(s.accountCents).toBe(tillSale.totalCents);
    expect(s.moneyCents).toBe(retail.totalCents); // cash; the on-account sale is invoiced, not taken
    expect(s.hqCollectedCents).toBe(tillSale.totalCents); // HQ's trade ledger carries it
    const trade = await salesSummary([w.store.id], range, "WHOLESALE");
    expect(trade).toMatchObject({ sales: 1, grossCents: tillSale.totalCents, netCents: tillSale.totalCents - tillSale.vatCents, accountCents: tillSale.totalCents });
    const channels = await salesByChannel([w.store.id], range);
    expect(channels.map((c) => [c.channel, c.label])).toEqual([["POS", "In store"], ["ONLINE", "Online"], ["WHOLESALE", "Trade"]]);
    expect(channels[1].netCents).toBe(0);
    expect(channels[2].netCents).toBe(tillSale.totalCents - tillSale.vatCents);
  });

  it("keeps cash-ups to cash: a trade sale on account in the shift is not expected in the drawer", async () => {
    const c = await shiftCash(shift.id);
    expect(c.cashSalesCents).toBe(0);
    expect(c.expectedCents).toBe(50_000);
  });

  it("puts trade sales on the franchise statement: fees at the standard rates, no e-commerce fee, HQ-collected credited", async () => {
    const st = await franchiseStatement(w.store.id, today.slice(0, 7));
    const tradeNet = tillSale.totalCents - tillSale.vatCents;
    const net = retail.totalCents - retail.vatCents + tradeNet;
    expect(st.input.netSalesExVatCents).toBe(net);
    expect(st.input.tradeSalesExVatCents).toBe(tradeNet);
    expect(st.input.onlineSalesExVatCents).toBe(0);
    expect(st.input.onlineCollectedCents).toBe(tillSale.totalCents);
    expect(st.royalty).toBe(applyBps(net, st.store.royaltyBps));
    expect(st.levy).toBe(applyBps(net, st.store.levyBps));
    expect(st.ecom).toBe(0);
    expect(st.lines.find((l) => l.label === "Collected by HQ (online, vouchers, trade)")).toMatchObject({ kind: "credit", cents: tillSale.totalCents });
  });

  it("includes trade sales in the P&L and the VAT201 working", async () => {
    const pl = await profitAndLoss([w.store.id], range);
    expect(pl.revenue).toBe(retail.totalCents - retail.vatCents + tillSale.totalCents - tillSale.vatCents);
    expect(pl.cogs).toBeGreaterThan(0);
    const v = await vatReport([w.store.id], range);
    expect(v.output).toBe(retail.vatCents + tillSale.vatCents);
    expect(v.salesInclCents).toBe(retail.totalCents + tillSale.totalCents);
  });
});

describe("dashboards", () => {
  it("shows 'of which trade' and every tender, and counts the trade queue", async () => {
    const k = await kpis([w.store.id], range);
    expect(k.trade).toBe(tillSale.totalCents - tillSale.vatCents);
    expect(k.payments.find((p) => p.label === "On account (invoiced)")?.value).toBe(tillSale.totalCents);
    expect(k.payments.reduce((s, p) => s + p.value, 0)).toBe(k.cur.grossCents);
    expect((await todayTakings([w.store.id], now)).tradeCents).toBe(tillSale.totalCents);
    expect(await tradeQueue([w.dc.id, w.store.id], true)).toEqual({ open: 2, ready: 1, pendingEft: 1, onHold: 0 });
    expect(await tradeQueue([w.store.id], false)).toEqual({ open: 1, ready: 1, pendingEft: 0, onHold: 0 });
  });
});

describe("reports", () => {
  const run = async (key: string, sp: Record<string, string>, user: Staff, storeCode?: string) => {
    const def = getReport(key)!;
    const store = storeCode ? await storeForUser(user, storeCode) : undefined;
    const r = await reportContext({ def, scope: store ? "store" : "hq", user, store, sp, mode: "csv", basePath: store ? `/store/${store.code}/reports` : "/hq/reports" });
    return { ...r, result: await def.run(r.ctx) };
  };

  it("offers the Trade channel in the filter and narrows the sales overview to it", async () => {
    const r = await run("sales-overview", { range: "today", channel: "WHOLESALE" }, hq);
    expect(r.ctx.channel).toBe("WHOLESALE");
    expect(r.controls.selects.find((s) => s.name === "channel")?.options.map((o) => o.label)).toEqual(["All channels", "In store", "Online", "Trade"]);
    expect(r.result.totals?.gross).toBe(dcSale.totalCents + tillSale.totalCents);
  });

  it("reports trade sales by account, product and month, network-wide and for one store", async () => {
    const net = await run("trade-sales", { range: "today" }, hq);
    expect(net.result.rows).toHaveLength(1);
    expect(net.result.rows[0]).toMatchObject({
      account: "Hatfield Pharmacy", number: "TA-000001", kind: "Pharmacy", orders: 2, units: 26,
      ex: dcSale.totalCents - dcSale.vatCents + tillSale.totalCents - tillSale.vatCents, vat: dcSale.vatCents + tillSale.vatCents, incl: dcSale.totalCents + tillSale.totalCents, stores: 2, share: 1,
    });
    expect(net.result.summary?.find((s) => s.label === "Accounts buying")?.value).toBe(1);
    const products = net.result.extra?.find((t) => t.title === "By product");
    expect(products?.rows[0]).toMatchObject({ product: "Calm Oil · 30ml", units: 26, unit: UNIT_EX, accounts: 1 });
    expect(net.result.extra?.find((t) => t.title === "By month")?.rows[0]).toMatchObject({ orders: 2, accounts: 1, incl: dcSale.totalCents + tillSale.totalCents });
    const mine = await run("trade-sales-store", { range: "today" }, manager, "TST01");
    expect(mine.result.rows[0]).toMatchObject({ account: "Hatfield Pharmacy", orders: 1, units: 2, incl: tillSale.totalCents });
    expect(mine.result.columns.some((c) => c.key === "stores")).toBe(false);
  });

  it("ages the trade ledger per account", async () => {
    const r = await run("trade-aged-balances", {}, hq);
    expect(r.rangeLabel.startsWith("As of ")).toBe(true);
    expect(r.result.rows).toHaveLength(1);
    expect(r.result.rows[0]).toMatchObject({ account: "Hatfield Pharmacy", number: "TA-000001", status: "Approved", terms: "30 days", current: dcSale.totalCents + tillSale.totalCents, d30: 0, d60: 0, d90plus: 0, overdue: 0, total: dcSale.totalCents + tillSale.totalCents, items: 2 });
    expect(r.result.summary?.find((s) => s.label === "Overdue")?.value).toBe(0);
    // A payment settles the oldest invoice first; the rest stays current.
    await db.tradeLedgerEntry.create({ data: { tradeAccountId: account.id, kind: "PAYMENT", cents: -dcSale.totalCents, reference: "EFT 1" } });
    const after = await run("trade-aged-balances", {}, hq);
    expect(after.result.rows[0]).toMatchObject({ current: tillSale.totalCents, total: tillSale.totalCents, items: 1 });
    // An area manager sees the accounts that buy in their region; a region with no trade sees none.
    const area = await staff((await db.user.create({ data: { name: "Andile Area", role: "AREA_MANAGER", regionId: w.region.id } })).id);
    expect((await run("trade-aged-balances", {}, area)).result.rows).toHaveLength(1);
  });
});

describe("invoice", () => {
  it("renders a trade sale as a tax invoice to the business on account terms, never with points", async () => {
    const s = (await invoiceData(dcSale.id))!;
    expect(s.channel).toBe("WHOLESALE");
    const r = saleInvoiceEmail(s, { url: "https://shop.herbalholland.com/invoice/x?t=y", trade: { accountNumber: account.number, dueAt, orderNumber: "TO-000002" } });
    expect(r.subject).toBe("Herbal Holland tax invoice DC-T-T00001 for Hatfield Pharmacy (Pty) Ltd");
    for (const x of ["Bill to", "Hatfield Pharmacy (Pty) Ltd", "VAT no. 4550001234", "Trade account TA-000001", "24 × R280.00", "Total excl. VAT", "Total incl. VAT", `On account, due`, "TO-000002"]) expect(r.html, x).toContain(x);
    for (const x of ["You earned", "You saved", "Rewards under Invoices"]) expect(r.html, x).not.toContain(x);
    expect(r.text).toContain(`Total excl. VAT: R6,720.00`);
    expect(r.text).toContain(`Total incl. VAT: R7,728.00`);
  });
});
