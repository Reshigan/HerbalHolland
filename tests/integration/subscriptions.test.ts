// Club subscriptions end to end: joining raises the period's order; paying it opens the allowance; the member claims it
// as an already-paid order at their store; the daily job rolls and bills periods (safely twice), lapses the unpaid past
// the grace days, and ends plans cancelled at period end.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }), headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));

import { db } from "@/server/db";
import { advanceOrder, markOrderPaid } from "@/server/orders";
import { cancelSubscription, claimAllowance, hqTotals, resumeSubscription, runSubscriptions, subscribe } from "@/server/shop/subscriptions";
import { buildWorld, resetDb, type World } from "./world";

let w: World;
let n = 0;
const DAY = 86_400_000;
const days = (d: number) => new Date(Date.now() + d * DAY);
let planId = "";
const member = async () => {
  const c = await db.customer.create({
    data: { memberNo: `HH66${String(++n).padStart(5, "0")}`, phone: `+2782600${String(n).padStart(4, "0")}`, firstName: `Club ${n}`, referralCode: `CLB${n}X`, ageCheck: "ID_NUMBER", ageVerifiedAt: new Date() },
  });
  return c.id;
};
const join = async (customerId: string) => {
  const { orderId } = await subscribe({ customerId, planId, storeId: w.store.id, fulfilment: "COLLECT", acceptTerms: true });
  const s = await db.subscription.findFirstOrThrow({ where: { customerId }, include: { periods: true } });
  return { orderId, s };
};
const periodsOf = (subscriptionId: string) => db.subscriptionPeriod.findMany({ where: { subscriptionId }, orderBy: { periodStart: "asc" } });
/** Moves a subscription's current period into the past, as if a week had gone by. */
const endPeriod = async (subscriptionId: string) => {
  const [p] = await db.subscriptionPeriod.findMany({ where: { subscriptionId }, orderBy: { periodStart: "desc" }, take: 1 });
  await db.subscriptionPeriod.update({ where: { id: p.id }, data: { periodStart: days(-8), periodEnd: days(-1) } });
  await db.subscription.update({ where: { id: subscriptionId }, data: { periodStart: days(-8), periodEnd: days(-1) } });
};

beforeAll(async () => {
  await resetDb();
  w = await buildWorld();
  planId = (
    await db.subscriptionPlan.create({ data: { slug: "coffee-club", name: "Coffee club", unit: "UNITS", allowance: 2, itemWord: "bags", eligible: [w.coffeeV.id, w.flowerV.id], priceCents: 39_900, status: "ACTIVE" } })
  ).id;
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 500));
  await db.$disconnect();
});

describe("Club subscriptions", () => {
  it("only lets members join an active plan, with the terms accepted", async () => {
    const id = await member();
    const draft = await db.subscriptionPlan.create({ data: { slug: "draft-club", name: "Draft", unit: "UNITS", allowance: 1, eligible: [w.coffeeV.id], priceCents: 10_000 } });
    await expect(subscribe({ customerId: id, planId: draft.id, storeId: w.store.id, fulfilment: "COLLECT", acceptTerms: true })).rejects.toThrow("isn't available");
    await expect(subscribe({ customerId: id, planId, storeId: w.store.id, fulfilment: "COLLECT", acceptTerms: false })).rejects.toThrow("terms");
  });

  it("bills the period, opens the allowance once paid, and lets the member claim it once", async () => {
    const id = await member();
    const { orderId, s } = await join(id);
    expect(s.status).toBe("ACTIVE");
    expect(s.periods).toMatchObject([{ status: "DUE", allowance: 2, priceCents: 39_900, billingOrderId: orderId }]);
    const bill = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { include: { variant: true } } } });
    expect(bill).toMatchObject({ status: "PENDING_PAYMENT", totalCents: 39_900, payMethod: "ONLINE" });
    expect(bill.lines.map((l) => l.variant.sku)).toEqual(["SUB-coffee-club"]);
    await expect(join(id)).rejects.toThrow("already on this plan");

    const claim = { customerId: id, subscriptionId: s.id, items: [{ variantId: w.coffeeV.id, qty: 2 }] };
    await expect(claimAllowance(claim)).rejects.toThrow("Pay for this period");

    expect((await markOrderPaid(orderId, "test-pay")).status).toBe("COMPLETED");
    expect((await periodsOf(s.id))[0].status).toBe("PAID");

    await expect(claimAllowance({ ...claim, items: [{ variantId: w.coffeeV.id, qty: 3 }] })).rejects.toThrow();
    await expect(claimAllowance({ ...claim, items: [{ variantId: w.oilV.id, qty: 1 }] })).rejects.toThrow("isn't on your plan");
    const { code } = await claimAllowance(claim);
    const order = await db.order.findUniqueOrThrow({ where: { code }, include: { lines: true } });
    const [p] = await periodsOf(s.id);
    expect(order).toMatchObject({ status: "PLACED", paymentStatus: "PAID", paymentRef: `SUB:${p.id}`, totalCents: 39_900, storeId: w.store.id });
    expect(order.lines.reduce((a, l) => a + l.totalCents, 0)).toBe(39_900);
    expect(p).toMatchObject({ status: "COLLECTED", claimOrderId: order.id });
    await expect(claimAllowance(claim)).rejects.toThrow("claimed this period");

    // The store cancels the claim: the allowance is the member's again.
    await advanceOrder(order.id, "CANCELLED", { type: "SYSTEM" });
    expect((await periodsOf(s.id))[0]).toMatchObject({ status: "PAID", claimOrderId: null });
    expect(await hqTotals(null)).toMatchObject({ active: 1, toCollect: 1 });
  });

  it("rolls into the next period and bills it once, however often the job runs", async () => {
    const id = await member();
    const { orderId, s } = await join(id);
    await markOrderPaid(orderId, "test-roll");
    await endPeriod(s.id);
    const before = await db.order.count();
    await runSubscriptions();
    await runSubscriptions();
    const periods = await periodsOf(s.id);
    expect(periods.map((p) => p.status)).toEqual(["PAID", "DUE"]);
    expect(periods[1].billingOrderId).toBeTruthy();
    expect(periods[1].remindedAt).toBeTruthy();
    expect(await db.order.count()).toBe(before + 1);
    const after = await db.subscription.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.periodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  it("lapses an unpaid period after the grace days and the plan goes past due", async () => {
    const id = await member();
    const { orderId, s } = await join(id);
    await runSubscriptions(); // inside the grace days: nothing happens
    expect((await periodsOf(s.id))[0].status).toBe("DUE");
    await db.order.update({ where: { id: orderId }, data: { createdAt: days(-4) } });
    await runSubscriptions();
    expect((await periodsOf(s.id))[0].status).toBe("LAPSED");
    expect((await db.subscription.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("PAST_DUE");
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CANCELLED");
    await expect(claimAllowance({ customerId: id, subscriptionId: s.id, items: [{ variantId: w.coffeeV.id, qty: 1 }] })).rejects.toThrow("lapsed");

    // Resumed after the period ended: a new period starts today and is billed.
    await endPeriod(s.id);
    const { orderId: next } = await resumeSubscription({ customerId: id, firstName: "Club", subscriptionId: s.id });
    expect(next).toBeTruthy();
    expect((await periodsOf(s.id)).map((p) => p.status)).toEqual(["LAPSED", "DUE"]);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("ACTIVE");
  });

  it("cancels a paid plan at the end of its period, and an unpaid one at once", async () => {
    const paid = await member();
    const a = await join(paid);
    await markOrderPaid(a.orderId, "test-cancel");
    await cancelSubscription({ customerId: paid, firstName: "Club", subscriptionId: a.s.id });
    expect(await db.subscription.findUniqueOrThrow({ where: { id: a.s.id } })).toMatchObject({ status: "ACTIVE", cancelAtPeriodEnd: true });
    await endPeriod(a.s.id);
    await runSubscriptions();
    expect((await db.subscription.findUniqueOrThrow({ where: { id: a.s.id } })).status).toBe("CANCELLED");
    expect(await periodsOf(a.s.id)).toHaveLength(1);

    const unpaid = await member();
    const b = await join(unpaid);
    await cancelSubscription({ customerId: unpaid, firstName: "Club", subscriptionId: b.s.id });
    expect((await db.subscription.findUniqueOrThrow({ where: { id: b.s.id } })).status).toBe("CANCELLED");
    expect((await periodsOf(b.s.id))[0].status).toBe("LAPSED");
    expect((await db.order.findUniqueOrThrow({ where: { id: b.orderId } })).status).toBe("CANCELLED");
  });
});
