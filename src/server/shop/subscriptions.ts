// Club subscriptions. HQ sells plans (a weekly allowance, e.g. 3 g or 3 pre-rolls a week, for a fixed monthly price); a
// member joins at a store and pays each month upfront. Each month is billed as its own online order (one `SUB-` line on
// the DRAFT "Club subscription" product, paid through /checkout/pay like any order); the first month starts the day it's
// paid, and each month runs to the same day next month (markOrderPaid → onSubscriptionPaidTx). A paid month opens four
// weekly allowances. The member claims each week's: a normal online order at their store, already paid (paymentRef
// `SUB:<claimId>`), picked and handed over (or couriered) as usual, so stock, compliance, ID checks and the sale all go
// through the existing order flow. HQ holds the month's payment as prepaid; the store's sales clear it.
// No card is stored or charged automatically: the member pays each month from the link we send (see docs/COMPLIANCE.md).
// Cancelling stops the next month; the month already paid for runs to its end, with no refund for the rest of it.
import { randomUUID } from "node:crypto";
import { asList } from "@/lib/json-list";
import { db, prismaCode, tx, type Tx } from "@/server/db";
import { audit, SYSTEM, type Actor } from "@/server/audit";
import { pinCode, shortCode } from "@/server/counters";
import { notifyCustomer, smsLink } from "@/server/messaging";
import { sms } from "@/lib/sms";
import { vatOf, zarWhole } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { canBuyOnline, fulfilmentForPhase, PHASE_CLOSED } from "@/lib/launch-phase";
import { incentiveExcluded } from "@/lib/compliance";
import { allowanceLabel, anchorDayOf, claimProblem, cycleEndOf, isPastGrace, openWeek, splitCents, type Cycle } from "@/lib/subscriptions";
import { evaluateBasket } from "@/server/compliance";
import { getSettings } from "@/server/settings";
import { lockCustomer, lockStock } from "@/server/locks";
import { advanceOrder, notifyPlaced, shortLine } from "@/server/orders";
import { SUB_REF, SUB_SKU } from "./subscription-orders";
import type { Fulfilment, OrderStatus, SubscriptionClaim, SubscriptionPeriod, SubscriptionPlan } from "@/generated/prisma/client";

export class SubscriptionError extends Error {}
export const SUB_PRODUCT_SLUG = "club-subscription";
const SUB_CATEGORY_SLUG = "club-subscriptions";
const DAY = 86_400_000;
type Event = { status: OrderStatus; at: string; note?: string };
const LIVE = ["PENDING", "ACTIVE", "PAST_DUE"] as const;
const actorOf = (c: { id: string; firstName: string }): Actor => ({ type: "CUSTOMER", id: c.id, name: c.firstName });

// ── The virtual product: one variant per plan, priced at the plan's price ────────

/** The plan's `SUB-<slug>` variant on the DRAFT "Club subscription" product (never listed, no stock). */
export async function ensurePlanVariant(t: Tx, plan: Pick<SubscriptionPlan, "slug" | "name" | "priceCents" | "sortOrder">) {
  const sku = `${SUB_SKU}${plan.slug}`;
  const found = await t.variant.findUnique({ where: { sku } });
  if (found) {
    if (found.priceCents !== plan.priceCents || found.name !== plan.name)
      await t.variant.update({ where: { id: found.id }, data: { name: plan.name, priceCents: plan.priceCents, wholesaleCents: plan.priceCents, costCents: plan.priceCents } });
    return found.id;
  }
  const category =
    (await t.category.findUnique({ where: { slug: SUB_CATEGORY_SLUG } })) ??
    (await t.category.create({ data: { slug: SUB_CATEGORY_SLUG, name: "Club subscriptions", icon: "Repeat", sortOrder: 99, blurb: "Herbal Holland club plans for members, adults 18+." } }));
  const product =
    (await t.product.findUnique({ where: { slug: SUB_PRODUCT_SLUG } })) ??
    (await t.product.create({
      data: {
        slug: SUB_PRODUCT_SLUG, name: "Club subscription", tagline: "A member's weekly allowance, paid monthly upfront", categoryId: category.id, regClass: "ACCESSORY", status: "DRAFT",
        description: "A month of a Herbal Holland club plan: the member's weekly allowances for the month, collected in store or delivered.",
        legalBasis: "Prepayment for goods supplied when each week's allowance is collected",
      },
    }));
  const v = await t.variant.create({ data: { productId: product.id, sku, name: plan.name, priceCents: plan.priceCents, wholesaleCents: plan.priceCents, costCents: plan.priceCents, sortOrder: plan.sortOrder } });
  return v.id;
}

/** The variants a plan lets members choose from that are on sale right now (licensed and no-incentive classes never). */
export async function eligibleVariants(plan: { eligible: unknown }) {
  const { compliance } = await getSettings();
  const barred = [...new Set([...incentiveExcluded(compliance), ...compliance.licensedOnly])];
  const ids = asList<string>(plan.eligible);
  if (!ids.length) return [];
  return db.variant.findMany({
    where: { id: { in: ids }, active: true, product: { status: "ACTIVE", regClass: { notIn: barred } } },
    include: { product: { select: { name: true, regClass: true, tobaccoRelated: true, slug: true } } },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
  });
}

/** Variants HQ may put on a plan: active, on sale, and not a class that's licensed or barred from incentives. */
export async function planCandidates() {
  const { compliance } = await getSettings();
  const barred = [...new Set([...incentiveExcluded(compliance), ...compliance.licensedOnly])];
  return db.variant.findMany({
    where: { active: true, sku: { not: { startsWith: SUB_SKU } }, product: { status: "ACTIVE", regClass: { notIn: barred } } },
    select: { id: true, sku: true, name: true, grams: true, priceCents: true, product: { select: { name: true, regClass: true } } },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    take: 300,
  });
}

// ── Billing a month ─────────────────────────────────────────────────────────────

/** Raises the month's payable order (once). Returns the order id. */
async function billPeriod(periodId: string) {
  const p = await db.subscriptionPeriod.findUniqueOrThrow({ where: { id: periodId }, include: { subscription: { include: { plan: true } } } });
  if (p.billingOrderId) return p.billingOrderId;
  const { subscription: s } = p;
  // Next month's order goes to the store the member moved to for next month.
  const storeId = p.periodStart >= s.periodEnd ? (s.nextStoreId ?? s.storeId) : s.storeId;
  const now = new Date();
  return tx(async (t) => {
    const variantId = await ensurePlanVariant(t, s.plan);
    const id = randomUUID();
    // Claim the month first: a second run (or a stop halfway) never raises a second order for it.
    const { count } = await t.subscriptionPeriod.updateMany({ where: { id: p.id, billingOrderId: null }, data: { billingOrderId: id } });
    if (!count) return (await t.subscriptionPeriod.findUniqueOrThrow({ where: { id: p.id } })).billingOrderId!;
    await t.order.create({
      data: {
        id, code: shortCode(6), collectionCode: pinCode(), customerId: s.customerId, storeId, status: "PENDING_PAYMENT", fulfilment: "COLLECT",
        routingNote: `Club plan ${s.plan.name}: the month ${fmtDate(p.periodStart)} to ${fmtDate(p.periodEnd)}`,
        subtotalCents: p.priceCents, discountCents: 0, deliveryCents: 0, pointsRedeemed: 0, totalCents: p.priceCents, vatCents: vatOf(p.priceCents),
        payMethod: "ONLINE", paymentStatus: "UNPAID",
        events: [{ status: "PENDING_PAYMENT", at: now.toISOString(), note: `Club plan ${s.plan.name}` }] satisfies Event[],
        lines: { create: [{ variantId, qty: 1, unitPriceCents: p.priceCents, memberSavingsCents: 0, offerCents: 0, totalCents: p.priceCents }] },
      },
    });
    await audit(t, SYSTEM, "subscription.bill", { storeId, entity: "SubscriptionPeriod", entityId: p.id, data: { orderId: id, price: p.priceCents } });
    return id;
  });
}

async function cancelBilling(orderId: string | null, note: string) {
  if (!orderId) return;
  const o = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (o?.status === "PENDING_PAYMENT") await advanceOrder(orderId, "CANCELLED", SYSTEM, { note }).catch(() => null); // paid at the same moment: leave it
}

const isPaid = async (orderId: string | null) => !!orderId && (await db.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } }))?.paymentStatus === "PAID";

// ── Joining ─────────────────────────────────────────────────────────────────────

export type SubscribeInput = { customerId: string; planId: string; storeId: string; fulfilment: Fulfilment; addressId?: string | null; acceptTerms: boolean };

/** Starts a subscription awaiting its first month's payment: the month starts when it's paid. Returns the order to pay. */
export async function subscribe(a: SubscribeInput) {
  const settings = await getSettings();
  if (!canBuyOnline(settings.launch.phase)) throw new SubscriptionError(PHASE_CLOSED);
  if (!a.acceptTerms) throw new SubscriptionError("Please read and accept the club terms");
  if (a.fulfilment === "SAME_DAY" || !fulfilmentForPhase(settings.launch.phase).includes(a.fulfilment)) throw new SubscriptionError("Choose collect in store or courier delivery");
  const plan = await db.subscriptionPlan.findUnique({ where: { id: a.planId } });
  if (!plan || plan.status !== "ACTIVE") throw new SubscriptionError("That plan isn't available");
  const stores = asList<string>(plan.storeIds);
  const store = await db.store.findUnique({ where: { id: a.storeId }, select: { id: true, status: true } });
  if (!store || store.status !== "ACTIVE" || (stores.length && !stores.includes(store.id))) throw new SubscriptionError("Choose a store that offers this plan");
  const address = a.fulfilment === "COURIER" ? await db.address.findFirst({ where: { id: a.addressId ?? "", customerId: a.customerId } }) : null;
  if (a.fulfilment === "COURIER" && !address) throw new SubscriptionError("Add a delivery address");
  const options = await eligibleVariants(plan);
  if (!options.length) throw new SubscriptionError("That plan isn't available");
  // Age and class rules as for buying one of the plan's products (one of each class), so nobody joins who couldn't buy.
  const sample = [...new Map(options.map((v) => [v.product.regClass, v])).values()];
  const comp = await evaluateBasket({
    items: sample.map((v) => ({ name: v.product.name, regClass: v.product.regClass, grams: v.grams, qty: 1, tobaccoRelated: v.product.tobaccoRelated })),
    channel: a.fulfilment, customerId: a.customerId, storeLicences: settings.compliance.licensedOnly,
  });
  if (!comp.ok) throw new SubscriptionError(comp.blocks[0]);
  const customer = comp.ctx.record;
  if (!customer) throw new SubscriptionError("Sign in to join");
  const now = new Date();
  const end = cycleEndOf(now); // provisional: the month is set again from the day it's paid
  const periodId = await tx(async (t) => {
    await lockCustomer(t, customer.id);
    if (await t.subscription.findFirst({ where: { customerId: customer.id, planId: plan.id, status: { in: [...LIVE] } }, select: { id: true } }))
      throw new SubscriptionError("You're already on this plan: manage it below");
    const s = await t.subscription.create({
      data: {
        planId: plan.id, customerId: customer.id, storeId: store.id, fulfilment: a.fulfilment, addressId: address?.id ?? null, priceCents: plan.priceCents,
        status: "PENDING", startedAt: now, periodStart: now, periodEnd: end, anchorDay: anchorDayOf(now),
      },
    });
    const p = await t.subscriptionPeriod.create({ data: { subscriptionId: s.id, periodStart: now, periodEnd: end, priceCents: plan.priceCents, allowance: plan.allowance } });
    await audit(t, actorOf(customer), "subscription.join", {
      storeId: store.id, entity: "Subscription", entityId: s.id, data: { plan: plan.slug, pricePerMonth: plan.priceCents, termsVersion: settings.subscriptions.termsVersion },
    });
    return p.id;
  });
  return { orderId: await billPeriod(periodId) };
}

// ── The daily job ───────────────────────────────────────────────────────────────

/** Raises next month (once) for an active plan that isn't cancelling, bills it and texts the pay link. Returns the order. */
export async function renewSubscription(id: string) {
  const s = await db.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } });
  if (s.status !== "ACTIVE" || s.cancelAtPeriodEnd) return null;
  const start = s.periodEnd;
  const p = await db.subscriptionPeriod.upsert({
    where: { subscriptionId_periodStart: { subscriptionId: s.id, periodStart: start } },
    create: { subscriptionId: s.id, periodStart: start, periodEnd: cycleEndOf(start, s.anchorDay), priceCents: s.priceCents, allowance: s.plan.allowance },
    update: {},
  });
  if (p.status !== "DUE") return p.billingOrderId;
  const orderId = await billPeriod(p.id);
  if (!p.remindedAt) await remind(p.id, orderId, s.customerId, s.plan.name, p.priceCents);
  return orderId;
}

async function remind(periodId: string, orderId: string, customerId: string, planName: string, price: number) {
  const { count } = await db.subscriptionPeriod.updateMany({ where: { id: periodId, remindedAt: null }, data: { remindedAt: new Date() } });
  const c = count ? await db.customer.findUnique({ where: { id: customerId }, select: { id: true, phone: true } }) : null;
  if (c?.phone) await notifyCustomer(c, sms(`Your Herbal Holland club plan ${planName} for next month: ${zarWhole(price)}, paid upfront. Pay here to keep your weekly allowance: ${smsLink(`/checkout/pay/${orderId}`)}`));
}

/** A month whose end has come: a cancelling plan ends; otherwise the plan moves on to next month (raised if it wasn't). */
export async function rollSubscription(id: string, now = new Date()) {
  const s = await db.subscription.findUniqueOrThrow({ where: { id } });
  if (s.periodEnd > now) return null;
  if (s.status === "ACTIVE" && s.cancelAtPeriodEnd) {
    const later = await db.subscriptionPeriod.findMany({ where: { subscriptionId: s.id, status: "DUE", periodStart: { gte: s.periodEnd } } });
    for (const p of later) await cancelBilling(p.billingOrderId, "Club plan cancelled");
    await tx(async (t) => {
      for (const p of later) if (!(await isPaid(p.billingOrderId))) await t.subscriptionPeriod.deleteMany({ where: { id: p.id, status: "DUE" } });
      await t.subscription.updateMany({ where: { id: s.id, status: "ACTIVE" }, data: { status: "CANCELLED", cancelledAt: now } });
      await audit(t, SYSTEM, "subscription.cancelled", { storeId: s.storeId, entity: "Subscription", entityId: s.id, data: { atPeriodEnd: true } });
    });
    return null;
  }
  if (s.status !== "ACTIVE") return null; // awaiting a first payment, or past due: nothing moves until the member pays
  let next = await db.subscriptionPeriod.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: s.id, periodStart: s.periodEnd } } });
  if (!next) {
    await renewSubscription(s.id);
    next = await db.subscriptionPeriod.findUniqueOrThrow({ where: { subscriptionId_periodStart: { subscriptionId: s.id, periodStart: s.periodEnd } } });
  }
  // Compare-and-set on the old end, so a rerun never moves the plan twice.
  await db.subscription.updateMany({
    where: { id: s.id, periodEnd: s.periodEnd },
    data: { periodStart: next.periodStart, periodEnd: next.periodEnd, storeId: s.nextStoreId ?? s.storeId, nextStoreId: null },
  });
  return next.id;
}

/** An unpaid month past its grace days: the order is cancelled and the month lapses. A plan whose first month was never
 *  paid ends; an active plan goes past due (no allowance until the member pays a new month). */
async function lapse(periodId: string, now: Date) {
  const p = await db.subscriptionPeriod.findUniqueOrThrow({ where: { id: periodId }, include: { subscription: true } });
  await cancelBilling(p.billingOrderId, "Club plan: payment not received in time");
  if (await isPaid(p.billingOrderId)) return null;
  const s = p.subscription;
  await tx(async (t) => {
    await t.subscriptionPeriod.updateMany({ where: { id: p.id, status: "DUE" }, data: { status: "LAPSED" } });
    if (s.status === "PENDING") {
      await t.subscription.updateMany({ where: { id: s.id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: now } });
      await audit(t, SYSTEM, "subscription.cancelled", { storeId: s.storeId, entity: "Subscription", entityId: s.id, data: { reason: "first month unpaid" } });
    } else {
      await t.subscription.updateMany({ where: { id: s.id, status: "ACTIVE" }, data: { status: "PAST_DUE" } });
      await audit(t, SYSTEM, "subscription.past_due", { storeId: s.storeId, entity: "Subscription", entityId: s.id, data: { periodId: p.id, at: now.toISOString() } });
    }
  });
  return null;
}

/** JOBS step (daily): bill months without an order, lapse the unpaid past grace, raise next month a few days before a
 *  month ends, and move on (or end) every plan whose month is over. Every step is a compare-and-set, so reruns are safe. */
export async function runSubscriptions(now = new Date()) {
  const { subscriptions } = await getSettings();
  const out = { billed: 0, lapsed: 0, renewed: 0, rolled: 0, failed: 0 };
  const fail = () => void out.failed++;
  for (const p of await db.subscriptionPeriod.findMany({ where: { status: "DUE", billingOrderId: null }, select: { id: true }, take: 500 }))
    await billPeriod(p.id).then(() => out.billed++, fail);
  const due = await db.subscriptionPeriod.findMany({ where: { status: "DUE", billingOrderId: { not: null } }, select: { id: true, billingOrderId: true, periodStart: true }, take: 2000 });
  const orders = new Map((await db.order.findMany({ where: { id: { in: due.map((p) => p.billingOrderId!) } }, select: { id: true, createdAt: true } })).map((o) => [o.id, o.createdAt]));
  for (const p of due) {
    const billed = orders.get(p.billingOrderId!);
    // Grace runs from the later of billing and the month's start: next month is billed early, and its grace starts with it.
    if (billed && isPastGrace(billed > p.periodStart ? billed : p.periodStart, subscriptions.graceDays, now)) await lapse(p.id, now).then(() => out.lapsed++, fail);
  }
  const renewBy = new Date(now.getTime() + subscriptions.renewDays * DAY);
  for (const s of await db.subscription.findMany({ where: { status: "ACTIVE", cancelAtPeriodEnd: false, periodEnd: { lte: renewBy } }, select: { id: true }, take: 500 }))
    await renewSubscription(s.id).then((r) => void (r && out.renewed++), fail);
  for (const s of await db.subscription.findMany({ where: { status: "ACTIVE", periodEnd: { lte: now } }, select: { id: true }, take: 500 }))
    await rollSubscription(s.id, now).then((r) => void out.rolled++, fail);
  return out;
}

// ── Member actions ──────────────────────────────────────────────────────────────

async function ownSubscription(customerId: string, id: string) {
  const s = await db.subscription.findFirst({ where: { id, customerId }, include: { plan: true } });
  if (!s) throw new SubscriptionError("We couldn't find that plan");
  return s;
}

const cycleOf = (p: SubscriptionPeriod & { claims: Pick<SubscriptionClaim, "weekStart">[] }): Cycle => ({ ...p, claimed: p.claims.map((c) => c.weekStart) });

/** The paid month covering `now`, the one before it (for rollover) and this week's allowance; null fields when unpaid. */
async function currentWeek(s: { id: string; plan: { rollover: boolean } }, now: Date) {
  const [p, prev] = await db.subscriptionPeriod.findMany({
    where: { subscriptionId: s.id, periodStart: { lte: now } },
    include: { claims: { select: { weekStart: true } } },
    orderBy: { periodStart: "desc" },
    take: 2,
  });
  const period = p && p.periodEnd > now ? p : null;
  const week = period?.status === "PAID" ? openWeek(cycleOf(period), now, s.plan.rollover, prev?.status === "PAID" ? cycleOf(prev) : null) : null;
  return { period, week };
}

/** The member claims this week's allowance: an order at their store, already paid by the month. Returns its code. */
export async function claimAllowance(a: { customerId: string; subscriptionId: string; items: { variantId: string; qty: number }[] }) {
  const settings = await getSettings();
  if (!canBuyOnline(settings.launch.phase)) throw new SubscriptionError(PHASE_CLOSED);
  const s = await ownSubscription(a.customerId, a.subscriptionId);
  if (s.status === "CANCELLED") throw new SubscriptionError("This plan has ended");
  const now = new Date();
  const { period: p, week } = await currentWeek(s, now);
  if (!p || p.status === "DUE") throw new SubscriptionError("Pay for this month to open your allowance");
  if (p.status !== "PAID" || !week) throw new SubscriptionError("This month has lapsed");
  if (week.claimed) throw new SubscriptionError("You've claimed this week's allowance");
  const options = new Map((await eligibleVariants(s.plan)).map((v) => [v.id, v]));
  const items = a.items.filter((i) => i.qty > 0);
  if (items.some((i) => !options.has(i.variantId))) throw new SubscriptionError("That product isn't on your plan right now");
  const why = claimProblem(s.plan.unit, week.allowance, items.map((i) => ({ grams: options.get(i.variantId)!.grams, qty: i.qty })));
  if (why) throw new SubscriptionError(why);
  if (!fulfilmentForPhase(settings.launch.phase).includes(s.fulfilment)) throw new SubscriptionError("That way of getting your order isn't open yet");
  const address = s.fulfilment === "COURIER" ? await db.address.findFirst({ where: { id: s.addressId ?? "", customerId: s.customerId } }) : null;
  if (s.fulfilment === "COURIER" && !address) throw new SubscriptionError("Add a delivery address to your plan");
  const lines = items.map((i) => ({ ...i, v: options.get(i.variantId)! }));
  const basket = {
    items: lines.map((l) => ({ name: l.v.product.name, regClass: l.v.product.regClass, grams: l.v.grams, qty: l.qty, tobaccoRelated: l.v.product.tobaccoRelated })),
    channel: s.fulfilment, customerId: s.customerId, storeLicences: settings.compliance.licensedOnly,
  };
  const comp = await evaluateBasket(basket);
  if (!comp.ok) throw new SubscriptionError(comp.blocks[0]);
  const customer = comp.ctx.record!;
  // What the week was paid for (plus any carried week) spread over the lines by retail value, so the sale adds up exactly.
  const value = week.cents;
  const shares = splitCents(value, lines.map((l) => l.qty * l.v.priceCents));
  const store = await db.store.findUniqueOrThrow({ where: { id: s.storeId }, select: { id: true, name: true } });
  const orderId = randomUUID();
  const claimId = randomUUID();
  const code = shortCode(6);
  await tx(async (t) => {
    await lockCustomer(t, customer.id);
    const again = await evaluateBasket(basket);
    if (!again.ok) throw new SubscriptionError(again.blocks[0]);
    await lockStock(t, store.id, lines.map((l) => l.variantId));
    const short = await shortLine(t, store.id, lines.map((l) => ({ variantId: l.variantId, name: l.v.product.name, qty: l.qty })));
    if (short) throw new SubscriptionError(`${store.name} has run out of ${short.name}. Choose something else, or change your store for next time.`);
    // Claim the week first (one row per week, unique): two taps can't both claim it.
    try {
      await t.subscriptionClaim.create({ data: { id: claimId, periodId: p.id, weekStart: week.start, weekEnd: week.end, allowance: week.allowance, cents: value, orderId } });
    } catch (e) {
      if (prismaCode(e) === "P2002") throw new SubscriptionError("You've claimed this week's allowance");
      throw e;
    }
    // ponytail: D1 has no transactions; a stop between the claim above and this insert leaves the week claimed with no
    // order. HQ can reopen it (delete the claim row); add a sweep if it is ever seen.
    await t.order.create({
      data: {
        id: orderId, code, collectionCode: pinCode(), customerId: customer.id, storeId: store.id, status: "PLACED", fulfilment: s.fulfilment,
        routingNote: `Club plan ${s.plan.name}: ${allowanceLabel(s.plan.unit, week.allowance, s.plan.itemWord)} for the week of ${fmtDate(week.start)}`,
        ...(address && { addressLine: address.line, suburb: address.suburb, city: address.city, province: address.province, postalCode: address.postalCode, deliveryNotes: address.notes }),
        subtotalCents: value, discountCents: 0, deliveryCents: 0, pointsRedeemed: 0, totalCents: value, vatCents: vatOf(value),
        payMethod: "ONLINE", paymentStatus: "PAID", paymentRef: `${SUB_REF}${claimId}`,
        events: [{ status: "PLACED", at: now.toISOString(), note: `Club plan ${s.plan.name}` }] satisfies Event[],
        lines: {
          create: lines.map((l, i) => ({ variantId: l.variantId, qty: l.qty, unitPriceCents: Math.ceil(shares[i] / l.qty), memberSavingsCents: 0, offerCents: 0, totalCents: shares[i] })),
        },
      },
    });
    await audit(t, actorOf(customer), "subscription.claim", { storeId: store.id, entity: "SubscriptionPeriod", entityId: p.id, data: { orderId, claimId, week: week.index + 1, items: items.length } });
  });
  await notifyPlaced(orderId);
  return { code };
}

type MemberChange = { customerId: string; firstName: string; subscriptionId: string };

/** Keeps a plan going: undoes a cancellation before the paid month ends, or restarts a past-due plan with a new month
 *  that begins when it's paid. Returns the order to pay, if one is due now. */
export async function resumeSubscription(a: MemberChange, actor: Actor = actorOf({ id: a.customerId, firstName: a.firstName })) {
  const s = await ownSubscription(a.customerId, a.subscriptionId);
  const now = new Date();
  if (s.status === "ACTIVE" && s.cancelAtPeriodEnd) {
    await tx(async (t) => {
      await t.subscription.updateMany({ where: { id: s.id, status: "ACTIVE" }, data: { cancelAtPeriodEnd: false } });
      await audit(t, actor, "subscription.resume", { storeId: s.storeId, entity: "Subscription", entityId: s.id });
    });
    const { subscriptions } = await getSettings();
    // Inside the renewal window the job has already passed this plan by: raise next month now.
    const soon = s.plan.status === "ACTIVE" && s.periodEnd.getTime() - subscriptions.renewDays * DAY <= now.getTime();
    return { orderId: soon ? await renewSubscription(s.id) : null };
  }
  if (s.status !== "PAST_DUE") throw new SubscriptionError("This plan is already running");
  if (s.plan.status !== "ACTIVE") throw new SubscriptionError("This plan is no longer offered");
  const waiting = await db.subscriptionPeriod.findFirst({ where: { subscriptionId: s.id, status: "DUE" }, orderBy: { periodStart: "desc" } });
  if (waiting) return { orderId: await billPeriod(waiting.id) };
  // A month that lapsed isn't billed for: a new one starts today (and again from the day it's paid).
  const end = cycleEndOf(now);
  const p = await tx(async (t) => {
    const period = await t.subscriptionPeriod.upsert({
      where: { subscriptionId_periodStart: { subscriptionId: s.id, periodStart: now } },
      create: { subscriptionId: s.id, periodStart: now, periodEnd: end, priceCents: s.priceCents, allowance: s.plan.allowance },
      update: {},
    });
    await t.subscription.updateMany({
      where: { id: s.id, status: "PAST_DUE" },
      data: { periodStart: now, periodEnd: end, anchorDay: anchorDayOf(now), storeId: s.nextStoreId ?? s.storeId, nextStoreId: null },
    });
    await audit(t, actor, "subscription.resume", { storeId: s.storeId, entity: "Subscription", entityId: s.id, data: { periodId: period.id } });
    return period;
  });
  return { orderId: await billPeriod(p.id) };
}

/** Cancels from the end of the month already paid for: weekly claims carry on until then, nothing more is billed and
 *  nothing is refunded. A plan with no paid month running (first month unpaid, or past due) ends at once. */
export async function cancelSubscription(a: MemberChange, actor: Actor = actorOf({ id: a.customerId, firstName: a.firstName })) {
  const s = await ownSubscription(a.customerId, a.subscriptionId);
  if (s.status === "CANCELLED") return;
  const current = await db.subscriptionPeriod.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: s.id, periodStart: s.periodStart } } });
  const atEnd = s.status === "ACTIVE" && current?.status === "PAID";
  const unpaid = await db.subscriptionPeriod.findMany({ where: { subscriptionId: s.id, status: "DUE", ...(atEnd && { periodStart: { gte: s.periodEnd } }) } });
  for (const p of unpaid) await cancelBilling(p.billingOrderId, "Club plan cancelled");
  await tx(async (t) => {
    for (const p of unpaid) {
      if (await isPaid(p.billingOrderId)) continue; // paid at the same moment: the month stands
      // A month not yet started goes; the one the member stopped waiting on is kept as lapsed for the history.
      if (p.periodStart >= s.periodEnd) await t.subscriptionPeriod.deleteMany({ where: { id: p.id, status: "DUE" } });
      else await t.subscriptionPeriod.updateMany({ where: { id: p.id, status: "DUE" }, data: { status: "LAPSED" } });
    }
    if (atEnd) await t.subscription.updateMany({ where: { id: s.id, status: "ACTIVE" }, data: { cancelAtPeriodEnd: true } });
    else await t.subscription.updateMany({ where: { id: s.id, status: { not: "CANCELLED" } }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelAtPeriodEnd: false } });
    await audit(t, actor, "subscription.cancel", { storeId: s.storeId, entity: "Subscription", entityId: s.id, data: { atPeriodEnd: atEnd, endsAt: atEnd ? s.periodEnd.toISOString() : null } });
  });
}

/** Changes the store from next month (this month's allowance stays where it was paid). */
export async function changeStore(a: MemberChange & { storeId: string }) {
  const s = await ownSubscription(a.customerId, a.subscriptionId);
  if (s.status === "CANCELLED") throw new SubscriptionError("This plan has ended");
  const stores = asList<string>(s.plan.storeIds);
  const store = await db.store.findUnique({ where: { id: a.storeId }, select: { id: true, status: true } });
  if (!store || store.status !== "ACTIVE" || (stores.length && !stores.includes(store.id))) throw new SubscriptionError("Choose a store that offers this plan");
  await tx(async (t) => {
    await t.subscription.update({ where: { id: s.id }, data: { nextStoreId: store.id === s.storeId ? null : store.id } });
    await audit(t, actorOf({ id: a.customerId, firstName: a.firstName }), "subscription.store", { storeId: s.storeId, entity: "Subscription", entityId: s.id, data: { to: store.id } });
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────────

/** A member's plans (live first), each with its current month, this week's allowance and the month's unpaid order. */
export async function memberSubscriptions(customerId: string, now = new Date()) {
  const subs = await db.subscription.findMany({
    where: { customerId },
    include: { plan: true },
    orderBy: [{ cancelledAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 20,
  });
  const storeIds = [...new Set(subs.flatMap((s) => [s.storeId, s.nextStoreId].filter((x): x is string => !!x)))];
  const stores = new Map((await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  return Promise.all(
    subs.map(async (s) => {
      const { period, week } = s.status === "CANCELLED" ? { period: null, week: null } : await currentWeek(s, now);
      // The order waiting to be paid: a first month, a restart, or next month raised ahead of time.
      const due = s.status === "CANCELLED" ? null : await db.subscriptionPeriod.findFirst({ where: { subscriptionId: s.id, status: "DUE", billingOrderId: { not: null } }, orderBy: { periodStart: "desc" } });
      return { ...s, period, week, due, storeName: stores.get(s.storeId) ?? "", nextStoreName: s.nextStoreId ? (stores.get(s.nextStoreId) ?? "") : null };
    }),
  );
}

/** HQ totals: subscribers by state, monthly recurring revenue (each active subscriber's own monthly price), members with a
 *  paid month running (their weekly allowance to collect) and months billed but not yet paid. */
export async function hqTotals(storeIds: string[] | null, now = new Date()) {
  const where = storeIds ? { storeId: { in: storeIds } } : {};
  const live = await db.subscription.findMany({ where: { ...where, status: "ACTIVE" }, select: { priceCents: true }, take: 50_000 });
  const [pending, pastDue, toCollect, unpaid] = await Promise.all([
    db.subscription.count({ where: { ...where, status: "PENDING" } }),
    db.subscription.count({ where: { ...where, status: "PAST_DUE" } }),
    db.subscriptionPeriod.count({ where: { subscription: where, status: "PAID", periodStart: { lte: now }, periodEnd: { gt: now } } }),
    db.subscriptionPeriod.count({ where: { subscription: where, status: "DUE" } }),
  ]);
  return { active: live.length, pending, pastDue, mrrCents: live.reduce((s, x) => s + x.priceCents, 0), toCollect, unpaid };
}
