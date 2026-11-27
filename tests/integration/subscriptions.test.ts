// Club subscriptions end to end: joining raises the first month's order; paying it starts the month (anchored on the
// day it's paid) and opens the weekly allowance; the member claims each week once as an already-paid order at their
// store; the daily job raises next month a few days early (safely twice), moves the plan on, lapses the unpaid past the
// grace days, and ends a cancelled plan with its paid month.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }), headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, refresh: () => undefined }));

import { db } from "@/server/db";
import { advanceOrder, markOrderPaid } from "@/server/orders";
import { cancelSubscription, claimAllowance, hqTotals, resumeSubscription, runSubscriptions, subscribe } from "@/server/shop/subscriptions";
import { cycleEndOf } from "@/lib/subscriptions";
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
const subOf = (id: string) => db.subscription.findUniqueOrThrow({ where: { id } });
const periodsOf = (subscriptionId: string) => db.subscriptionPeriod.findMany({ where: { subscriptionId }, orderBy: { periodStart: "asc" } });
/** Moves a plan's latest month to run from `from` to `to` days from now, as if time had passed. */
const shiftMonth = async (subscriptionId: string, from: number, to: number) => {
  const [p] = await db.subscriptionPeriod.findMany({ where: { subscriptionId }, orderBy: { periodStart: "desc" }, take: 1 });
  // Same instants on both rows: separate days() calls can land a millisecond apart.
  const data = { periodStart: days(from), periodEnd: days(to) };
  await db.subscriptionPeriod.update({ where: { id: p.id }, data });
  await db.subscription.update({ where: { id: subscriptionId }, data });
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

  it("bills the first month upfront, starts it on payment, and lets the member claim each week once", async () => {
    const id = await member();
    const { orderId, s } = await join(id);
    expect(s.status).toBe("PENDING");
    expect(s.periods).toMatchObject([{ status: "DUE", allowance: 2, priceCents: 39_900, billingOrderId: orderId }]);
    const bill = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { include: { variant: true } } } });
    expect(bill).toMatchObject({ status: "PENDING_PAYMENT", totalCents: 39_900, payMethod: "ONLINE" });
    expect(bill.lines.map((l) => l.variant.sku)).toEqual(["SUB-coffee-club"]);
    await expect(join(id)).rejects.toThrow("already on this plan");

    const claim = { customerId: id, subscriptionId: s.id, items: [{ variantId: w.coffeeV.id, qty: 2 }] };
    await expect(claimAllowance(claim)).rejects.toThrow("Pay for this month");

    expect((await markOrderPaid(orderId, "test-pay")).status).toBe("COMPLETED");
    const paid = await subOf(s.id);
    expect(paid.status).toBe("ACTIVE");
    expect(paid.periodStart.getTime()).toBeGreaterThanOrEqual(s.periodStart.getTime());
    expect(paid.periodEnd.toISOString()).toBe(cycleEndOf(paid.periodStart, paid.anchorDay).toISOString());
    const [p] = await periodsOf(s.id);
    expect(p).toMatchObject({ status: "PAID", periodStart: paid.periodStart, periodEnd: paid.periodEnd });

    await expect(claimAllowance({ ...claim, items: [{ variantId: w.coffeeV.id, qty: 3 }] })).rejects.toThrow();
    await expect(claimAllowance({ ...claim, items: [{ variantId: w.oilV.id, qty: 1 }] })).rejects.toThrow("isn't on your plan");
    const { code } = await claimAllowance(claim);
    const order = await db.order.findUniqueOrThrow({ where: { code }, include: { lines: true } });
    const [c] = await db.subscriptionClaim.findMany({ where: { periodId: p.id } });
    // One week's share of the month: a quarter of the price.
    expect(c).toMatchObject({ orderId: order.id, allowance: 2, cents: 9_975 });
    expect(order).toMatchObject({ status: "PLACED", paymentStatus: "PAID", paymentRef: `SUB:${c.id}`, totalCents: 9_975, storeId: w.store.id });
    expect(order.lines.reduce((a, l) => a + l.totalCents, 0)).toBe(9_975);
    await expect(claimAllowance(claim)).rejects.toThrow("claimed this week's");

    // The store cancels the claim: the week is the member's again.
    await advanceOrder(order.id, "CANCELLED", { type: "SYSTEM" });
    expect(await db.subscriptionClaim.count({ where: { periodId: p.id } })).toBe(0);
    expect(await hqTotals(null)).toMatchObject({ active: 1, pending: 0, mrrCents: 39_900, toCollect: 1 });
    await claimAllowance(claim);
    expect(await db.subscriptionClaim.count({ where: { periodId: p.id } })).toBe(1);
  });

  it("raises next month once a few days early, however often the job runs, then moves the plan on", async () => {
    const id = await member();
    const { orderId, s } = await join(id);
    await markOrderPaid(orderId, "test-renew");
    await runSubscriptions(); // a month away: nothing to raise
    expect(await periodsOf(s.id)).toHaveLength(1);

    await shiftMonth(s.id, -29, 2);
    const before = await db.order.count();
    await runSubscriptions();
    await runSubscriptions();
    const periods = await periodsOf(s.id);
    expect(periods.map((p) => p.status)).toEqual(["PAID", "DUE"]);
    expect(periods[1].periodStart.toISOString()).toBe(periods[0].periodEnd.toISOString());
    expect(periods[1].billingOrderId).toBeTruthy();
    expect(periods[1].remindedAt).toBeTruthy();
    expect(await db.order.count()).toBe(before + 1);

    // The month ends: the plan moves on to the raised month, still inside its grace days.
    await runSubscriptions(days(3));
    await runSubscriptions(days(3));
    expect(await subOf(s.id)).toMatchObject({ status: "ACTIVE", periodStart: periods[1].periodStart, periodEnd: periods[1].periodEnd });
    expect((await periodsOf(s.id))[1].status).toBe("DUE");
  });

  it("an unpaid renewal past the grace days leaves the plan past due with no allowance, until the member keeps it", async () => {
    const id = await member();
    const { orderId, s } = await join(id);
    await markOrderPaid(orderId, "test-lapse");
    await shiftMonth(s.id, -35, -5);
    await runSubscriptions(); // raises the next month (started 5 days ago) and moves the plan on
    const [, next] = await periodsOf(s.id);
    expect(next.status).toBe("DUE");
    await db.order.update({ where: { id: next.billingOrderId! }, data: { createdAt: days(-4) } });
    await runSubscriptions();
    expect((await periodsOf(s.id)).map((p) => p.status)).toEqual(["PAID", "LAPSED"]);
    expect((await subOf(s.id)).status).toBe("PAST_DUE");
    expect((await db.order.findUniqueOrThrow({ where: { id: next.billingOrderId! } })).status).toBe("CANCELLED");
    await expect(claimAllowance({ customerId: id, subscriptionId: s.id, items: [{ variantId: w.coffeeV.id, qty: 1 }] })).rejects.toThrow("lapsed");
    expect(await hqTotals(null)).toMatchObject({ pastDue: 1 });

    // Kept: a new month starts from the day it's paid.
    const { orderId: again } = await resumeSubscription({ customerId: id, firstName: "Club", subscriptionId: s.id });
    expect(again).toBeTruthy();
    expect((await periodsOf(s.id)).map((p) => p.status)).toEqual(["PAID", "LAPSED", "DUE"]);
    await markOrderPaid(again!, "test-keep");
    expect((await subOf(s.id)).status).toBe("ACTIVE");
    await claimAllowance({ customerId: id, subscriptionId: s.id, items: [{ variantId: w.coffeeV.id, qty: 1 }] });
  });

  it("a cancel keeps the paid month and ends with it; the member can change their mind before then", async () => {
    const id = await member();
    const { orderId, s } = await join(id);
    await markOrderPaid(orderId, "test-cancel");
    await cancelSubscription({ customerId: id, firstName: "Club", subscriptionId: s.id });
    expect(await subOf(s.id)).toMatchObject({ status: "ACTIVE", cancelAtPeriodEnd: true });
    // Still inside the paid month: the weekly allowance is there.
    await claimAllowance({ customerId: id, subscriptionId: s.id, items: [{ variantId: w.coffeeV.id, qty: 1 }] });

    await resumeSubscription({ customerId: id, firstName: "Club", subscriptionId: s.id });
    expect(await subOf(s.id)).toMatchObject({ status: "ACTIVE", cancelAtPeriodEnd: false });
    await cancelSubscription({ customerId: id, firstName: "Club", subscriptionId: s.id });

    // Nothing is raised for next month, and the plan ends when the paid month does.
    await shiftMonth(s.id, -29, 2);
    await runSubscriptions();
    expect(await periodsOf(s.id)).toHaveLength(1);
    await runSubscriptions(days(3));
    expect((await subOf(s.id)).status).toBe("CANCELLED");
    expect(await periodsOf(s.id)).toHaveLength(1);
  });

  it("cancels an unpaid first month at once, and ends a plan whose first month is never paid", async () => {
    const a = await member();
    const one = await join(a);
    await cancelSubscription({ customerId: a, firstName: "Club", subscriptionId: one.s.id });
    expect((await subOf(one.s.id)).status).toBe("CANCELLED");
    expect((await periodsOf(one.s.id))[0].status).toBe("LAPSED");
    expect((await db.order.findUniqueOrThrow({ where: { id: one.orderId } })).status).toBe("CANCELLED");

    const b = await member();
    const two = await join(b);
    await runSubscriptions(); // inside the grace days: nothing happens
    expect((await subOf(two.s.id)).status).toBe("PENDING");
    await db.order.update({ where: { id: two.orderId }, data: { createdAt: days(-4) } });
    await db.subscriptionPeriod.updateMany({ where: { subscriptionId: two.s.id }, data: { periodStart: days(-4) } });
    await runSubscriptions();
    expect((await subOf(two.s.id)).status).toBe("CANCELLED");
    expect((await periodsOf(two.s.id))[0].status).toBe("LAPSED");
    expect((await db.order.findUniqueOrThrow({ where: { id: two.orderId } })).status).toBe("CANCELLED");
  });
});
