// The till against the real services when things happen at once, and where refund money goes: two tills selling to one
// patient (the second is refused under the member's lock), a capped promotion's last use and a My Deal each wanted by
// several tills (an unpaid sale is refused; one already paid offline or by card still posts, flagged), refunds back to
// how they paid (split over cash and card, never more on a tender than it paid), the cash override capped at the cash
// paid, and commission for the person who built the basket when a dispenser completes it.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, tx, type Tx } from "@/server/db";
import { postPosSale, refundSale, SaleError } from "@/server/sales";
import { lockCustomer, lockPromotion } from "@/server/locks";
import { quote } from "@/server/pricing";
import { receipt, salesHistory } from "@/server/pos/receipts";
import { zReport } from "@/server/pos/shift";
import { monthCommission, thisMonth } from "@/server/commission";
import { moneyPartsOf, refundSplit } from "@/lib/pos-refund";
import { buildWorld, onHand, resetDb, type World } from "./world";

let w: World;
let seq = 0;
let n = 0;
const number = () => `TST01-A${String(++seq).padStart(5, "0")}`;
const pos = (staffId = w.manager.id) => ({ storeId: w.store.id, deviceId: w.device.id, staffId, staffName: "Staff" });
const SHIFT = "shift-till";
const member = () => {
  n++;
  return db.customer.create({
    data: { memberNo: `HH77${String(n).padStart(5, "0")}`, phone: `+2782770${String(n).padStart(4, "0")}`, firstName: `Till ${n}`, referralCode: `TIL${n}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date() },
  });
};
const total = async (customerId: string, items: { variantId: string; qty: number; unitPriceCents?: number }[], trustClientPrices = false) =>
  (await quote({ storeId: w.store.id, channel: "POS", items, customerId, trustClientPrices })).totalCents;
const payments = async (saleId: string) => (await db.payment.findMany({ where: { saleId }, orderBy: { method: "asc" } })).map((p) => ({ method: p.method, amountCents: p.amountCents, cardLast4: p.cardLast4 }));
const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Waits until `count` transactions on this database are queued behind a row lock. */
async function lockWaiters(count: number) {
  for (let i = 0; i < 400; i++) {
    const [r] = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (r.n >= count) return;
    await new Promise((res) => setTimeout(res, 25));
  }
  throw new Error(`Never saw ${count} transactions waiting on a lock`);
}

/** Holds a row lock in a transaction of its own until `release()`. */
function hold(lock: (t: Tx) => Promise<unknown>) {
  let release!: () => void;
  let held!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const ready = new Promise<void>((r) => (held = r));
  const done = tx(async (t) => {
    await lock(t);
    held();
    await gate;
  });
  return { ready, release: async () => (release(), await done) };
}

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  await db.shift.create({ data: { id: SHIFT, storeId: w.store.id, deviceId: w.device.id, openedById: w.manager.id, openingFloatCents: 100_000 } });
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500)); // let fire-and-forget invoice emails settle
  await db.$disconnect();
});

describe("member limits at the till, decided under the member's lock", () => {
  it("two tills selling to one patient at once: together over the 30-day grams, so the second is refused", async () => {
    const lines = [{ variantId: w.flowerV.id, qty: 5 }]; // 17.5 g each: 35 g together, over the 30 g a month
    const due = await total(w.patient.id, lines);
    const sale = () => postPosSale({ id: randomUUID(), number: number(), shiftId: SHIFT, customerId: w.patient.id, lines, payments: [{ method: "CARD", amountCents: due, reference: "AUTH-G" }] }, pos());
    const stock = (await onHand(w.store.id, w.flowerOld.id)) + (await onHand(w.store.id, w.flowerNew.id));
    // The patient's row is held while both sales start: each passes its first checks (nothing posted yet) and queues.
    const blocker = hold((t) => lockCustomer(t, w.patient.id));
    await blocker.ready;
    const both = [sale(), sale()];
    await lockWaiters(2);
    await blocker.release();
    const [a, b] = await Promise.allSettled(both);
    const ok = [a, b].filter((r) => r.status === "fulfilled");
    const refused = [a, b].filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].reason).toBeInstanceOf(SaleError);
    expect(errorOf(refused[0].reason)).toMatch(/Exceeds the authorised quantity: 12\.5g left this month, 17\.5g in cart/);
    expect(await db.sale.count({ where: { customerId: w.patient.id, kind: "SALE" } })).toBe(1);
    expect((await onHand(w.store.id, w.flowerOld.id)) + (await onHand(w.store.id, w.flowerNew.id))).toBe(stock - 5); // one sale's stock only
  });

  it("a capped promotion's last use goes to one till; a sale already paid (offline, or by card) still posts, flagged for HQ", async () => {
    const promo = await db.promotion.create({ data: { name: "First shopper: 10% off coffee", kind: "PERCENT", value: 10, maxUses: 1, productIds: [w.coffeeV.productId], channels: ["POS"], startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000) } });
    const [a, b, c, d] = [w.walkIn, await member(), await member(), await member()];
    const lines = [{ variantId: w.coffeeV.id, qty: 1 }];
    const sale = async (customerId: string, how: "cash" | "offline" | "card") => {
      const offline = how === "offline";
      const items = offline ? [{ ...lines[0], unitPriceCents: (await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId })).lines[0].unitPriceCents }] : lines;
      const due = await total(customerId, items, offline);
      return postPosSale(
        {
          id: randomUUID(), number: number(), shiftId: SHIFT, customerId, lines: items,
          payments: [how === "card" ? { method: "CARD" as const, amountCents: due, reference: "AUTH-P", cardLast4: "4242" } : { method: "CASH" as const, amountCents: due }],
          ...(offline && { offline: true, createdAt: new Date().toISOString() }),
        },
        pos(),
      );
    };
    expect((await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId: a.id })).promotionId).toBe(promo.id); // every till sees it free
    // The promotion's row is held. Four sales all priced with it queue in this order: two paying cash at the till, one
    // queued offline (paid already) and one whose card was charged before it posts.
    const blocker = hold((t) => lockPromotion(t, promo.id));
    await blocker.ready;
    const first = sale(a.id, "cash");
    await lockWaiters(1);
    const second = sale(b.id, "cash");
    await lockWaiters(2);
    const queued = sale(c.id, "offline");
    await lockWaiters(3);
    const carded = sale(d.id, "card");
    await lockWaiters(4);
    await blocker.release();
    const [one, two, three, four] = await Promise.allSettled([first, second, queued, carded]);
    expect(one.status).toBe("fulfilled");
    expect(two.status).toBe("rejected"); // not paid yet: refused, with why
    expect(errorOf((two as PromiseRejectedResult).reason)).toMatch(/First shopper: 10% off coffee has been fully claimed/);
    for (const r of [three, four]) {
      expect(r.status).toBe("fulfilled"); // already paid: it posts…
      const posted = (r as PromiseFulfilledResult<Awaited<ReturnType<typeof postPosSale>>>).value.sale;
      expect(await db.auditLog.findFirst({ where: { action: "promotion.after_payment", entityId: posted.id } })).toMatchObject({ data: { problem: expect.stringMatching(/fully claimed/), promotionId: promo.id } }); // …flagged
    }
    expect(await db.sale.count({ where: { promotionId: promo.id } })).toBe(3);
    await db.promotion.update({ where: { id: promo.id }, data: { active: false } });
  });

  it("a My Deal wanted by two tills at once is given once: an unpaid sale is refused, one already charged posts, flagged", async () => {
    const customer = await member();
    const deal = await db.memberOffer.create({ data: { customerId: customer.id, title: "15% off Test CBD Coffee", kind: "PERCENT", value: 15, productIds: [w.coffeeV.productId], startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000) } });
    const lines = [{ variantId: w.coffeeV.id, qty: 1 }];
    const q = await quote({ storeId: w.store.id, channel: "POS", items: lines, customerId: customer.id });
    expect(q.offerIds).toHaveLength(1);
    const sale = (card: boolean) =>
      postPosSale({ id: randomUUID(), number: number(), shiftId: SHIFT, customerId: customer.id, lines, payments: [card ? { method: "CARD", amountCents: q.totalCents, reference: "AUTH-D" } : { method: "CASH", amountCents: q.totalCents }] }, pos());
    const blocker = hold((t) => lockCustomer(t, customer.id));
    await blocker.ready;
    const first = sale(false);
    await lockWaiters(1);
    const second = sale(false);
    await lockWaiters(2);
    const charged = sale(true);
    await lockWaiters(3);
    await blocker.release();
    const [one, two, three] = await Promise.allSettled([first, second, charged]);
    expect(one.status).toBe("fulfilled");
    expect(two.status).toBe("rejected");
    expect(errorOf((two as PromiseRejectedResult).reason)).toMatch(/My Deals offer in this basket was just used on another purchase/);
    expect(three.status).toBe("fulfilled");
    const firstSale = (one as PromiseFulfilledResult<Awaited<ReturnType<typeof postPosSale>>>).value.sale;
    const paid = (three as PromiseFulfilledResult<Awaited<ReturnType<typeof postPosSale>>>).value.sale;
    expect(await db.memberOffer.findUniqueOrThrow({ where: { id: deal.id } })).toMatchObject({ saleId: firstSale.id }); // redeemed once, by the first
    expect(await db.auditLog.findFirst({ where: { action: "offer.used_after_payment", entityId: paid.id } })).toMatchObject({ data: { offers: [expect.stringMatching(/^15% off Test CBD Coffee \(R\d+\.\d\d\)$/)] } });
  });
});

describe("refunds back to how they paid", () => {
  /** Coffees for a member (two by default): R100 cash, the rest on the card ending 0005. */
  async function cashAndCard(cashCents = 10_000, qty = 2) {
    const customer = await member();
    const lines = [{ variantId: w.coffeeV.id, qty }];
    const due = await total(customer.id, lines);
    const { sale } = await postPosSale(
      { id: randomUUID(), number: number(), shiftId: SHIFT, customerId: customer.id, lines, payments: [{ method: "CASH", amountCents: cashCents, tenderedCents: cashCents, changeCents: 0 }, { method: "CARD", amountCents: due - cashCents, reference: "AUTH-5", cardLast4: "0005" }] },
      pos(),
    );
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: sale.id } });
    return { sale, line, due };
  }
  const refund = (saleId: string, lineId: string, qty: number, method: Parameters<typeof refundSale>[0]["method"]) =>
    refundSale({ id: randomUUID(), number: number(), saleId, lines: [{ saleLineId: lineId, qty, restock: true }], method, reason: "Changed their mind", staffId: w.manager.id, staffName: "Mia", deviceId: w.device.id, shiftId: SHIFT, capCash: true });

  it("splits each refund over the cash and the card in proportion, exactly what each paid once it's all back", async () => {
    const { sale, line, due } = await cashAndCard();
    const card = due - 10_000;
    const half = Math.round(line.totalCents / 2);
    const parts = moneyPartsOf({ payments: [{ method: "CASH", amountCents: 10_000 }, { method: "CARD", amountCents: card, cardLast4: "0005" }] });
    const expected = refundSplit(parts, half).parts;
    const first = await refund(sale.id, line.id, 1, "ORIGINAL");
    expect(await payments(first.id)).toEqual(expected.map((p) => ({ method: p.method, amountCents: -p.cents, cardLast4: p.cardLast4 })).sort((x, y) => x.method.localeCompare(y.method)));
    expect(expected.find((p) => p.method === "CARD")).toMatchObject({ cardLast4: "0005" });
    // The last coffee: what's left on each tender, so cash and card come back to exactly what they paid.
    const second = await refund(sale.id, line.id, 1, "ORIGINAL");
    const back = [...(await payments(first.id)), ...(await payments(second.id))];
    expect(back.filter((p) => p.method === "CASH").reduce((s, p) => s - p.amountCents, 0)).toBe(10_000);
    expect(back.filter((p) => p.method === "CARD").reduce((s, p) => s - p.amountCents, 0)).toBe(card);
    expect(first.totalCents + second.totalCents).toBe(-line.totalCents); // the line's two halves add up to what was paid
    // The credit note shows a line per tender; the sale shows where each refund went; the Z-report lists each tender.
    expect((await receipt(second.id, w.store.id)).payments.map((p) => [p.method, p.cardLast4])).toEqual(expect.arrayContaining([["CASH", null], ["CARD", "0005"]]));
    const dto = await receipt(sale.id, w.store.id);
    expect(dto.money).toHaveLength(2);
    expect(dto.money).toEqual(expect.arrayContaining([
      { method: "CASH", paidCents: 10_000, refundedCents: 10_000, cardLast4: null },
      { method: "CARD", paidCents: card, refundedCents: card, cardLast4: "0005" },
    ]));
    expect(dto.refunds.map((r) => r.payments?.length)).toEqual([2, 2]);
    expect(dto.lines[0]).toMatchObject({ refundedQty: 2, refundedCents: line.totalCents });
    const z = await zReport(SHIFT);
    expect(z.refundTenders).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "CASH", label: "Cash", count: 2 }),
      expect.objectContaining({ method: "CARD", label: "Card", count: 2 }),
    ]));
    expect(await db.auditLog.findFirst({ where: { action: "sale.refund", entityId: second.id } })).toMatchObject({ data: expect.objectContaining({ to: "ORIGINAL" }) });
  });

  it("puts the odd cent on the largest tender", async () => {
    // One of three coffees back from R200 cash + the rest by card: the cash share is ….67c and the card's ….33c, yet the
    // odd cent goes to the card, the larger tender.
    const { sale, line } = await cashAndCard(20_000, 3);
    const r = await refund(sale.id, line.id, 1, "ORIGINAL");
    const rows = await payments(r.id);
    const [cash, card] = [rows.find((p) => p.method === "CASH")!, rows.find((p) => p.method === "CARD")!];
    const exact = (-r.totalCents * 20_000) / sale.totalCents;
    expect(exact % 1).toBeGreaterThan(0.5);
    expect(-cash.amountCents).toBe(Math.floor(exact)); // the smaller tender rounds down…
    expect(cash.amountCents + card.amountCents).toBe(r.totalCents); // …and the card takes the rest
  });

  it("never pays out more cash than the sale took: a cash refund over the cash paid is refused", async () => {
    const { sale, line, due } = await cashAndCard(30_000);
    const each = Math.round(line.totalCents / 2);
    expect(each).toBeLessThan(30_000);
    // The whole sale in cash: more than the R300 cash it took.
    const whole = await refund(sale.id, line.id, 2, "CASH").catch((e: unknown) => e);
    expect(whole).toBeInstanceOf(SaleError);
    expect(whole).toMatchObject({ code: "NO_CASH_PAID", message: expect.stringMatching(/Only R300\.00 of the cash paid on .* is left to give back/) });
    expect(await db.sale.count({ where: { refundOfId: sale.id } })).toBe(0);
    // One coffee in cash fits; the second doesn't (only what's left of the R300), so it goes back how they paid.
    const first = await refund(sale.id, line.id, 1, "CASH");
    expect(await payments(first.id)).toEqual([{ method: "CASH", amountCents: -each, cardLast4: null }]);
    await expect(refund(sale.id, line.id, 1, "CASH")).rejects.toMatchObject({ code: "NO_CASH_PAID", message: expect.stringMatching(/Only R\d+\.\d\d of the cash paid/) });
    const second = await refund(sale.id, line.id, 1, "ORIGINAL");
    expect(await payments(second.id)).toEqual([
      { method: "CARD", amountCents: -(due - 30_000), cardLast4: "0005" },
      { method: "CASH", amountCents: -(30_000 - each), cardLast4: null },
    ]);
    // A card-only sale has no cash to give back at the till; a card refund (a manager's override) still works.
    const customer = await member();
    const lines = [{ variantId: w.coffeeV.id, qty: 1 }];
    const card = await postPosSale({ id: randomUUID(), number: number(), shiftId: SHIFT, customerId: customer.id, lines, payments: [{ method: "CARD", amountCents: await total(customer.id, lines), reference: "AUTH-C" }] }, pos());
    const cl = await db.saleLine.findFirstOrThrow({ where: { saleId: card.sale.id } });
    await expect(refund(card.sale.id, cl.id, 1, "CASH")).rejects.toMatchObject({ code: "NO_CASH_PAID", message: expect.stringMatching(/No cash was paid on/) });
    const ok = await refund(card.sale.id, cl.id, 1, "CARD");
    expect(await payments(ok.id)).toEqual([{ method: "CARD", amountCents: ok.totalCents, cardLast4: null }]);
  });

  it("points paid come back in proportion, every point by the last refund", async () => {
    const customer = await db.customer.create({ data: { memberNo: "HH7799999", phone: "+27827799999", firstName: "Points", referralCode: "PTS999X", ageCheck: "ID_NUMBER", ageVerifiedAt: new Date(), points: 500 } });
    const lines = [{ variantId: w.coffeeV.id, qty: 3 }];
    const due = await total(customer.id, lines);
    const { sale } = await postPosSale({ id: randomUUID(), number: number(), shiftId: SHIFT, customerId: customer.id, lines, pointsRedeemed: 100, payments: [{ method: "CASH", amountCents: due - 10_000 }] }, pos());
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: sale.id } });
    const refunds = [];
    for (let i = 0; i < 3; i++) refunds.push(await refund(sale.id, line.id, 1, "ORIGINAL"));
    const rows = (await db.payment.findMany({ where: { saleId: { in: refunds.map((r) => r.id) } } })).map((p) => [p.method, p.amountCents] as const);
    expect(rows.filter(([m]) => m === "LOYALTY").reduce((s, [, c]) => s - c, 0)).toBe(10_000); // all 100 points back
    expect(rows.filter(([m]) => m === "CASH").reduce((s, [, c]) => s - c, 0)).toBe(due - 10_000); // and exactly the cash paid
  });
});

describe("credit for the seller when a dispenser completes the sale", () => {
  it("credits commission to the person who built the basket; an unknown or ineligible seller is ignored", async () => {
    await db.store.update({ where: { id: w.store.id }, data: { commissionOn: true } });
    const customer = await member();
    const lines = [{ variantId: w.coffeeV.id, qty: 1 }];
    const due = await total(customer.id, lines);
    const sell = (soldById: string | null) =>
      postPosSale({ id: randomUUID(), number: number(), shiftId: SHIFT, customerId: customer.id, soldById, lines, payments: [{ method: "CARD", amountCents: due, reference: "AUTH-S" }] }, pos(w.manager.id));
    const month = thisMonth();
    const before = (await monthCommission(w.store.id, month, w.budtender.id))[0]?.salesCents ?? 0;

    // Ben built the basket; Mia (a dispenser) completed it: the sale is Ben's, Mia stays on it as staff.
    const { sale } = await sell(w.budtender.id);
    expect(sale).toMatchObject({ staffId: w.manager.id, soldById: w.budtender.id });
    const line = await db.saleLine.findFirstOrThrow({ where: { saleId: sale.id } });
    const net = line.totalCents - line.vatCents;
    const [ben] = await monthCommission(w.store.id, month, w.budtender.id);
    expect(ben).toMatchObject({ salesCents: before + net, commissionCents: Math.round((before + net) * 0.02) });
    // The receipt and the till's sales history say who sold it and who dispensed it.
    expect(await receipt(sale.id, w.store.id)).toMatchObject({ staff: "Mia Manager", soldBy: "Ben Budtender" });
    expect((await salesHistory(w.store.id, { q: sale.number })).sales[0]).toMatchObject({ staff: "Mia Manager", soldBy: "Ben Budtender" });
    // A refund of it (whoever processes it) comes off Ben's.
    await refundSale({ id: randomUUID(), number: number(), saleId: sale.id, lines: [{ saleLineId: line.id, qty: 1, restock: true }], method: "ORIGINAL", reason: "Changed their mind", staffId: w.manager.id, staffName: "Mia", shiftId: SHIFT, capCash: true });
    expect((await monthCommission(w.store.id, month, w.budtender.id))[0]).toMatchObject({ salesCents: before + net, refundsCents: -net });

    // Not someone active at this store: ignored, so the sale stays the dispenser's.
    const elsewhere = await db.store.create({ data: { code: "TST02", slug: "tst02", name: "Other Store", companyId: w.owner.id, dcId: w.dc.id, addressLine: "2 Burnett St", suburb: "Hatfield", city: "Pretoria", province: "GP", postalCode: "0083", regionId: w.region.id } });
    const other = await db.user.create({ data: { name: "Olga Other", role: "BUDTENDER", storeId: elsewhere.id } });
    const gone = await db.user.create({ data: { name: "Gina Gone", role: "BUDTENDER", storeId: w.store.id, active: false } });
    for (const id of [randomUUID(), other.id, gone.id, w.manager.id]) {
      const r = await sell(id);
      expect(r.sale.soldById).toBeNull();
      expect((await receipt(r.sale.id, w.store.id)).soldBy).toBeUndefined();
    }
    expect((await monthCommission(w.store.id, month, w.budtender.id))[0].salesCents).toBe(before + net);
    expect(await monthCommission(w.store.id, month, other.id)).toEqual([]);
  });
});
