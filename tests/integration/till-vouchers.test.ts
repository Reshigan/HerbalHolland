// Gift vouchers at the till against the real services: a sale paid part voucher part cash (balance down, a redemption
// row on the sale, both tenders recorded), the refusals (short, expired, used up, a queued offline sale), refunds that
// go back onto the voucher before any money moves, a counter voucher on a pay-in-store order, and an online return.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { postPosSale, refundSale, SaleError } from "@/server/sales";
import { advanceOrder, placeOrder } from "@/server/orders";
import { receipt } from "@/server/pos/receipts";
import { zReport } from "@/server/pos/shift";
import { SaleBody } from "@/server/pos/schemas";
import { makeVoucherCode, voucherExpiry } from "@/lib/vouchers";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
const COFFEE = 22_900; // CBD food & drink: any tender
const pos = () => ({ storeId: w.store.id, deviceId: w.device.id, staffId: w.manager.id, staffName: "Mia" });
let seq = 0;
const number = () => `TST01-A${String(++seq).padStart(5, "0")}`;
const who = () => ({ type: "USER" as const, id: w.manager.id, name: w.manager.name });

/** A voucher as a paid purchase issues it: active, three years, `cents` on it. */
async function issue(cents: number, over: Partial<{ status: "ACTIVE" | "EXPIRED" | "REDEEMED"; expiresAt: Date; balanceCents: number }> = {}) {
  const now = new Date();
  return db.giftVoucher.create({ data: { code: makeVoucherCode(), amountCents: cents, balanceCents: over.balanceCents ?? cents, status: over.status ?? "ACTIVE", issuedAt: now, expiresAt: over.expiresAt ?? voucherExpiry(now), purchasedByCustomerId: w.walkIn.id } });
}
const balance = async (id: string) => db.giftVoucher.findUniqueOrThrow({ where: { id }, select: { balanceCents: true, status: true } });
const sale = (over: Partial<Parameters<typeof postPosSale>[0]>) => ({ id: randomUUID(), number: number(), customerId: w.walkIn.id, lines: [{ variantId: w.coffeeV.id, qty: 1 }], payments: [], ...over });

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db.shift.create({ data: { id: "shift-v", storeId: w.store.id, deviceId: w.device.id, openedById: w.manager.id, openingFloatCents: 100_000 } });
});
afterAll(async () => db.$disconnect());

describe("a gift voucher as a tender", () => {
  it("pays part of a sale with cash for the rest: balance down, a redemption row on the sale, both tenders recorded", async () => {
    const v = await issue(50_000);
    const q = await db.customer.findUniqueOrThrow({ where: { id: w.walkIn.id }, select: { tier: true } });
    void q;
    const total = (await postPosSale(sale({ shiftId: "shift-v", lines: [{ variantId: w.coffeeV.id, qty: 3 }], payments: [] }), pos()).catch((e: Error) => e)) as Error;
    expect(total).toBeInstanceOf(SaleError); // payments don't match: tells us the member total
    const due = Number(/total \(R([\d,]+\.\d\d)\)/.exec(total.message)![1].replace(",", "")) * 100;
    expect(due).toBeGreaterThan(50_000);
    const r = await postPosSale(
      sale({ shiftId: "shift-v", lines: [{ variantId: w.coffeeV.id, qty: 3 }], payments: [{ method: "VOUCHER", amountCents: 50_000, reference: v.code.toLowerCase() }, { method: "CASH", amountCents: due - 50_000, tenderedCents: due - 50_000, changeCents: 0 }] }),
      pos(),
    );
    expect(r.duplicate).toBe(false);
    expect(await balance(v.id)).toEqual({ balanceCents: 0, status: "REDEEMED" });
    const reds = await db.voucherRedemption.findMany({ where: { voucherId: v.id } });
    expect(reds).toEqual([expect.objectContaining({ saleId: r.sale.id, orderId: null, cents: 50_000, reversed: false })]);
    const pays = await db.payment.findMany({ where: { saleId: r.sale.id }, orderBy: { amountCents: "desc" } });
    expect(pays.map((p) => [p.method, p.amountCents, p.reference])).toEqual([["VOUCHER", 50_000, v.code], ["CASH", due - 50_000, null]]); // the code as typed, stored canonically
    expect(await db.auditLog.count({ where: { action: "voucher.redeem", entityId: v.id } })).toBe(1);
    // The receipt names the voucher and what's left on it; the Z-report carries a "Gift vouchers" line.
    const dto = await receipt(r.sale.id, w.store.id);
    expect(dto.payments.find((p) => p.method === "VOUCHER")).toMatchObject({ reference: v.code, balanceCents: 0 });
    expect(dto.vouchers).toEqual([{ code: v.code, paidCents: 50_000, refundedCents: 0 }]);
    const z = await zReport("shift-v");
    expect(z.tenders.find((t) => t.method === "VOUCHER")).toMatchObject({ label: "Gift vouchers", amountCents: 50_000, count: 1 });
    // The rollup keeps voucher money with what HQ collects; cash stays cash.
    const stat = await db.dailyStoreStat.findFirst({ where: { storeId: w.store.id, channel: "POS" } });
    expect(stat?.onlineCents).toBe(50_000);
    expect(stat?.cashCents).toBe(due - 50_000);
  });

  it("refuses a voucher that is short, expired or used up — by name, with the shortfall — and posts nothing", async () => {
    const short = await issue(20_000, { balanceCents: 5_000 });
    const before = await db.sale.count();
    await expect(postPosSale(sale({ shiftId: "shift-v", payments: [{ method: "VOUCHER", amountCents: 20_000, reference: short.code }, { method: "CASH", amountCents: COFFEE - 20_000 }] }), pos())).rejects.toThrow(
      new RegExp(`Gift voucher ${short.code} has R50\\.00 left, R150\\.00 short`),
    );
    const expired = await issue(20_000, { expiresAt: new Date(Date.now() - 86_400_000) });
    await expect(postPosSale(sale({ shiftId: "shift-v", payments: [{ method: "VOUCHER", amountCents: 20_000, reference: expired.code }, { method: "CASH", amountCents: COFFEE - 20_000 }] }), pos())).rejects.toThrow(/expired on/);
    const used = await issue(20_000, { status: "REDEEMED", balanceCents: 0 });
    await expect(postPosSale(sale({ shiftId: "shift-v", payments: [{ method: "VOUCHER", amountCents: 20_000, reference: used.code }, { method: "CASH", amountCents: COFFEE - 20_000 }] }), pos())).rejects.toThrow(/used up/);
    await expect(postPosSale(sale({ shiftId: "shift-v", payments: [{ method: "VOUCHER", amountCents: 20_000, reference: "HH-AAAA-AAAA-AAAA" }, { method: "CASH", amountCents: COFFEE - 20_000 }] }), pos())).rejects.toThrow(/don't recognise/);
    expect(await db.sale.count()).toBe(before);
    expect(await balance(short.id)).toEqual({ balanceCents: 5_000, status: "ACTIVE" });
    expect(await db.voucherRedemption.count({ where: { voucherId: { in: [short.id, expired.id, used.id] } } })).toBe(0);
  });

  it("never takes a voucher on a queued (offline) sale: the request schema and the sync path both refuse it", async () => {
    const v = await issue(20_000);
    const body = { id: randomUUID(), number: number(), offline: true, createdAt: new Date().toISOString(), lines: [{ variantId: w.coffeeV.id, qty: 1, unitPriceCents: COFFEE }], payments: [{ method: "VOUCHER" as const, amountCents: 20_000, reference: v.code }, { method: "CASH" as const, amountCents: COFFEE - 20_000 }] };
    const parsed = SaleBody.safeParse(body);
    expect(parsed.success).toBe(false);
    expect(parsed.success ? "" : parsed.error.issues[0].message).toMatch(/can't be taken on an offline sale/);
    expect(SaleBody.safeParse({ ...body, offline: false }).success).toBe(true);
    expect(SaleBody.safeParse({ ...body, payments: [{ method: "VOUCHER", amountCents: 20_000, reference: "SUMMER20" }] }).success).toBe(false); // not a voucher code
    await expect(postPosSale(sale({ ...body, memberNo: w.walkIn.memberNo, customerId: null, shiftId: "shift-v", ageCheck: "ID_SIGHTED" }), pos())).rejects.toThrow(/can't be taken on an offline sale/);
    expect(await balance(v.id)).toEqual({ balanceCents: 20_000, status: "ACTIVE" });
    expect(await db.sale.findUnique({ where: { id: body.id } })).toBeNull();
  });

  it("refunds onto the voucher first — a used-up voucher is active again — and the sums stay right", async () => {
    const v = await issue(50_000);
    const r = await postPosSale(sale({ shiftId: "shift-v", lines: [{ variantId: w.coffeeV.id, qty: 2 }], payments: [] }), pos()).catch((e: Error) => e);
    const total = Number(/total \(R([\d,]+\.\d\d)\)/.exec((r as Error).message)![1].replace(",", "")) * 100;
    const PART = 30_000; // the voucher pays R300 of two coffees (about R450); the card pays the rest
    const s = await postPosSale(sale({ shiftId: "shift-v", lines: [{ variantId: w.coffeeV.id, qty: 2 }], payments: [{ method: "VOUCHER", amountCents: PART, reference: v.code }, { method: "CARD", amountCents: total - PART, reference: "AUTH1" }] }), pos());
    expect(await balance(v.id)).toEqual({ balanceCents: 50_000 - PART, status: "ACTIVE" });
    await db.giftVoucher.update({ where: { id: v.id }, data: { balanceCents: 0, status: "REDEEMED" } }); // as if the rest was spent elsewhere
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: s.sale.id } });
    const each = Math.round(line.totalCents / 2);
    expect(each).toBeLessThan(PART);
    // One of two coffees back: the whole refund fits on the voucher, so nothing goes to the card — and it's active again.
    const first = await refundSale({ id: randomUUID(), number: number(), saleId: s.sale.id, lines: [{ saleLineId: line.id, qty: 1, restock: true }], method: "CARD", reason: "Changed mind", staffId: w.manager.id, staffName: "Mia", shiftId: "shift-v" });
    expect((await db.payment.findMany({ where: { saleId: first.id } })).map((p) => [p.method, p.amountCents, p.reference])).toEqual([["VOUCHER", -each, v.code]]);
    expect(await balance(v.id)).toEqual({ balanceCents: each, status: "ACTIVE" });
    expect(await db.voucherRedemption.findMany({ where: { voucherId: v.id }, orderBy: { createdAt: "asc" } })).toEqual([
      expect.objectContaining({ saleId: s.sale.id, orderId: null, cents: PART }),
      expect.objectContaining({ saleId: first.id, orderId: null, cents: -each }),
    ]);
    expect(await db.auditLog.count({ where: { action: "voucher.refund", entityId: v.id } })).toBe(1);
    expect((await receipt(s.sale.id, w.store.id)).vouchers).toEqual([{ code: v.code, paidCents: PART, refundedCents: each }]);
    // The second coffee: the voucher takes what it has left to get back (PART − each); the rest goes to the card.
    const second = await refundSale({ id: randomUUID(), number: number(), saleId: s.sale.id, lines: [{ saleLineId: line.id, qty: 1, restock: true }], method: "CARD", reason: "Changed mind", staffId: w.manager.id, staffName: "Mia", shiftId: "shift-v" });
    const pays = (await db.payment.findMany({ where: { saleId: second.id }, orderBy: { amountCents: "asc" } })).map((p) => [p.method, p.amountCents]);
    const rest = line.totalCents - each;
    expect(pays).toEqual([["CARD", -(rest - (PART - each))], ["VOUCHER", -(PART - each)]].sort((a, b) => (a[1] as number) - (b[1] as number)));
    expect(await balance(v.id)).toEqual({ balanceCents: PART, status: "ACTIVE" });
    // The voucher's own rows net to its balance movement (everything back), and the sale's payments net to zero.
    const net = (await db.voucherRedemption.aggregate({ where: { voucherId: v.id }, _sum: { cents: true } }))._sum.cents;
    expect(net).toBe(0);
    const all = await db.payment.aggregate({ where: { saleId: { in: [s.sale.id, first.id, second.id] } }, _sum: { amountCents: true } });
    expect(all._sum.amountCents).toBe(0);
    // Refunds show as negative on the tender they went back to; the Z-report nets them.
    const z = await zReport("shift-v");
    expect(z.tenders.find((t) => t.method === "VOUCHER")).toMatchObject({ amountCents: 50_000 }); // the first test's voucher; this one came back in full
  });

  it("takes a counter voucher on a pay-in-store order at handover (the row carries the order and the sale)", async () => {
    const v = await issue(50_000);
    const o = await placeOrder({ customerId: w.walkIn.id, fulfilment: "COLLECT", storeId: w.store.id, items: [{ variantId: w.coffeeV.id, qty: 1 }], payMethod: "IN_STORE" });
    expect(o.paymentStatus).toBe("UNPAID");
    const due = o.totalCents - o.pointsRedeemed * 100;
    await advanceOrder(o.id, "PICKING", who());
    await advanceOrder(o.id, "READY", who());
    await expect(advanceOrder(o.id, "COMPLETED", who(), { idChecked: true, staffId: w.manager.id, staffCanDispense: true, payments: [{ method: "VOUCHER", amountCents: due + 100, reference: v.code }] })).rejects.toThrow(/Take payment of/);
    await expect(advanceOrder(o.id, "COMPLETED", who(), { idChecked: true, staffId: w.manager.id, staffCanDispense: true, payments: [{ method: "VOUCHER", amountCents: due, reference: "HH-AAAA-AAAA-AAAA" }] })).rejects.toThrow(/don't recognise/);
    const done = await advanceOrder(o.id, "COMPLETED", who(), { idChecked: true, staffId: w.manager.id, staffCanDispense: true, payments: [{ method: "VOUCHER", amountCents: due - 1_000, reference: v.code }, { method: "CASH", amountCents: 1_000 }] });
    expect(done.paymentStatus).toBe("PAID");
    const posted = await db.sale.findFirstOrThrow({ where: { orderId: o.id }, include: { payments: true } });
    expect(posted.payments.map((p) => [p.method, p.amountCents])).toEqual(expect.arrayContaining([["VOUCHER", due - 1_000], ["CASH", 1_000]]));
    expect(await db.voucherRedemption.findMany({ where: { voucherId: v.id } })).toEqual([expect.objectContaining({ orderId: o.id, saleId: posted.id, cents: due - 1_000 })]);
    expect(await balance(v.id)).toEqual({ balanceCents: 50_000 - (due - 1_000), status: "ACTIVE" });
  });
});
