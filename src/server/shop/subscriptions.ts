// Club subscriptions. HQ sells plans (an allowance each period, e.g. 3 g or 3 pre-rolls a week, for a fixed price); a
// member subscribes at a store. Each period is billed as its own online order (one `SUB-` line on the DRAFT "Club
// subscription" product, paid through /checkout/pay like any order); when it's paid the period's allowance opens
// (markOrderPaid → onSubscriptionPaidTx). The member then claims it: a normal online order at their store, already paid
// (paymentRef `SUB:<periodId>`), picked and handed over (or couriered) as usual, so stock, compliance, ID checks and the
// sale all go through the existing order flow. HQ holds the period payment as prepaid; the store's sale clears it.
// No card is stored or charged automatically: the member pays each period from the link we send (see docs/COMPLIANCE.md).
import { randomUUID } from "node:crypto";
import { asList } from "@/lib/json-list";
import { db, tx, type Tx } from "@/server/db";
import { audit, SYSTEM, type Actor } from "@/server/audit";
import { pinCode, shortCode } from "@/server/counters";
import { notifyCustomer, smsLink } from "@/server/messaging";
import { sms } from "@/lib/sms";
import { vatOf, zarWhole } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { canBuyOnline, fulfilmentForPhase, PHASE_CLOSED } from "@/lib/launch-phase";
import { incentiveExcluded } from "@/lib/compliance";
import { allowanceLabel, claimProblem, isPastGrace, monthlyCents, periodEndOf, PERIOD_LABEL, splitCents, type BillingPeriod } from "@/lib/subscriptions";
import { evaluateBasket } from "@/server/compliance";
import { getSettings } from "@/server/settings";
import { lockCustomer, lockStock } from "@/server/locks";
import { advanceOrder, notifyPlaced, shortLine } from "@/server/orders";
import { SUB_REF, SUB_SKU } from "./subscription-orders";
import type { Fulfilment, OrderStatus, SubscriptionPlan } from "@/generated/prisma/client";

export class SubscriptionError extends Error {}
export const SUB_PRODUCT_SLUG = "club-subscription";
const SUB_CATEGORY_SLUG = "club-subscriptions";
type Event = { status: OrderStatus; at: string; note?: string };
const LIVE = ["ACTIVE", "PAUSED", "PAST_DUE"] as const;
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
        slug: SUB_PRODUCT_SLUG, name: "Club subscription", tagline: "A member's allowance, paid each period", categoryId: category.id, regClass: "ACCESSORY", status: "DRAFT",
        description: "A period of a Herbal Holland club plan: the member's allowance for the period, collected in store or delivered.",
        legalBasis: "Prepayment for goods supplied when the allowance is collected",
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

// ── Billing a period ────────────────────────────────────────────────────────────

/** Raises the period's payable order (once). Returns the order id. */
async function billPeriod(periodId: string) {
  const p = await db.subscriptionPeriod.findUniqueOrThrow({ where: { id: periodId }, include: { subscription: { include: { plan: true } } } });
  if (p.billingOrderId) return p.billingOrderId;
  const { subscription: s } = p;
  const now = new Date();
  return tx(async (t) => {
    const variantId = await ensurePlanVariant(t, s.plan);
    const id = randomUUID();
    // Claim the period first: a second run (or a stop halfway) never raises a second order for it.
    const { count } = await t.subscriptionPeriod.updateMany({ where: { id: p.id, billingOrderId: null }, data: { billingOrderId: id } });
    if (!count) return (await t.subscriptionPeriod.findUniqueOrThrow({ where: { id: p.id } })).billingOrderId!;
    await t.order.create({
      data: {
        id, code: shortCode(6), collectionCode: pinCode(), customerId: s.customerId, storeId: s.storeId, status: "PENDING_PAYMENT", fulfilment: "COLLECT",
        routingNote: `Club plan ${s.plan.name}: ${fmtDate(p.periodStart)} to ${fmtDate(p.periodEnd)}`,
        subtotalCents: p.priceCents, discountCents: 0, deliveryCents: 0, pointsRedeemed: 0, totalCents: p.priceCents, vatCents: vatOf(p.priceCents),
        payMethod: "ONLINE", paymentStatus: "UNPAID",
        events: [{ status: "PENDING_PAYMENT", at: now.toISOString(), note: `Club plan ${s.plan.name}` }] satisfies Event[],
        lines: { create: [{ variantId, qty: 1, unitPriceCents: p.priceCents, memberSavingsCents: 0, offerCents: 0, totalCents: p.priceCents }] },
      },
    });
    await audit(t, SYSTEM, "subscription.bill", { storeId: s.storeId, entity: "SubscriptionPeriod", entityId: p.id, data: { orderId: id, price: p.priceCents } });
    return id;
  });
}

// ── Joining ─────────────────────────────────────────────────────────────────────

export type SubscribeInput = { customerId: string; planId: string; storeId: string; fulfilment: Fulfilment; addressId?: string | null; acceptTerms: boolean };

/** Starts a subscription: the first period begins now and its order is raised. Returns the order to pay. */
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
  const end = periodEndOf(now, plan.period);
  const periodId = await tx(async (t) => {
    await lockCustomer(t, customer.id);
    if (await t.subscription.findFirst({ where: { customerId: customer.id, planId: plan.id, status: { in: [...LIVE] } }, select: { id: true } }))
      throw new SubscriptionError("You're already on this plan: manage it below");
    const s = await t.subscription.create({
      data: { planId: plan.id, customerId: customer.id, storeId: store.id, fulfilment: a.fulfilment, addressId: address?.id ?? null, priceCents: plan.priceCents, startedAt: now, periodStart: now, periodEnd: end },
    });
    const p = await t.subscriptionPeriod.create({ data: { subscriptionId: s.id, periodStart: now, periodEnd: end, priceCents: plan.priceCents, allowance: plan.allowance } });
    await audit(t, actorOf(customer), "subscription.join", {
      storeId: store.id, entity: "Subscription", entityId: s.id, data: { plan: plan.slug, price: plan.priceCents, period: plan.period, termsVersion: settings.subscriptions.termsVersion },
    });
    return p.id;
  });
  return { orderId: await billPeriod(periodId) };
}

// ── The daily job ───────────────────────────────────────────────────────────────

/** The start of the period that covers `now`, stepping from `from` (deterministic, so a rerun lands on the same day). */
function currentStart(from: Date, period: BillingPeriod, now: Date) {
  let s = from;
  while (periodEndOf(s, period) <= now) s = periodEndOf(s, period);
  return s;
}

/** Rolls one subscription whose period is over: cancels, waits (paused / past due) or opens and bills the next period. */
export async function rollSubscription(id: string, now = new Date()) {
  const s = await db.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true, periods: { orderBy: { periodStart: "desc" }, take: 1 } } });
  if (s.status === "CANCELLED" || s.periodEnd > now) return null;
  const last = s.periods[0];
  if (s.cancelAtPeriodEnd) {
    if (last?.status === "DUE" && last.billingOrderId) await cancelBilling(last.billingOrderId, "Club plan cancelled");
    await tx(async (t) => {
      if (last?.status === "DUE") await t.subscriptionPeriod.updateMany({ where: { id: last.id, status: "DUE" }, data: { status: "LAPSED" } });
      await t.subscription.updateMany({ where: { id: s.id, status: { not: "CANCELLED" } }, data: { status: "CANCELLED", cancelledAt: now } });
      await audit(t, SYSTEM, "subscription.cancelled", { storeId: s.storeId, entity: "Subscription", entityId: s.id, data: { atPeriodEnd: true } });
    });
    return null;
  }
  if (s.status !== "ACTIVE") return null; // paused, or past due: nothing new until the member resumes
  if (last?.status === "DUE") return lapse(last.id, now); // unpaid at the end: it lapses, no new period
  const start = currentStart(s.periodEnd, s.plan.period, now);
  const end = periodEndOf(start, s.plan.period);
  // An unclaimed paid period carries into this one if the plan allows (one level: a carried allowance never carries again).
  const carry = s.plan.rollover && last?.status === "PAID" && last.periodEnd.getTime() === start.getTime() ? { carryAllowance: last.allowance, carryCents: last.priceCents } : { carryAllowance: 0, carryCents: 0 };
  const storeId = s.nextStoreId ?? s.storeId;
  const p = await tx(async (t) => {
    const period = await t.subscriptionPeriod.upsert({
      where: { subscriptionId_periodStart: { subscriptionId: s.id, periodStart: start } },
      create: { subscriptionId: s.id, periodStart: start, periodEnd: end, priceCents: s.priceCents, allowance: s.plan.allowance, ...carry },
      update: {},
    });
    await t.subscription.update({ where: { id: s.id }, data: { periodStart: start, periodEnd: end, storeId, nextStoreId: null } });
    return period;
  });
  const orderId = await billPeriod(p.id);
  if (!p.remindedAt) await remind(p.id, orderId, s.customerId, s.plan.name, s.priceCents);
  return p.id;
}

async function remind(periodId: string, orderId: string, customerId: string, planName: string, price: number) {
  const { count } = await db.subscriptionPeriod.updateMany({ where: { id: periodId, remindedAt: null }, data: { remindedAt: new Date() } });
  const c = count ? await db.customer.findUnique({ where: { id: customerId }, select: { id: true, phone: true } }) : null;
  if (c?.phone) await notifyCustomer(c, sms(`Your Herbal Holland club plan ${planName} is ready for this period: ${zarWhole(price)}. Pay here to open your allowance: ${smsLink(`/checkout/pay/${orderId}`)}`));
}

async function cancelBilling(orderId: string, note: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (o?.status === "PENDING_PAYMENT") await advanceOrder(orderId, "CANCELLED", SYSTEM, { note }).catch(() => null); // paid at the same moment: leave it
}

/** An unpaid period past its grace days: the order is cancelled, the period lapses and the subscription is past due. */
async function lapse(periodId: string, now: Date) {
  const p = await db.subscriptionPeriod.findUniqueOrThrow({ where: { id: periodId }, include: { subscription: true } });
  if (p.billingOrderId) await cancelBilling(p.billingOrderId, "Club plan: payment not received in time");
  const paid = p.billingOrderId ? (await db.order.findUnique({ where: { id: p.billingOrderId }, select: { paymentStatus: true } }))?.paymentStatus === "PAID" : false;
  if (paid) return null;
  await tx(async (t) => {
    await t.subscriptionPeriod.updateMany({ where: { id: p.id, status: "DUE" }, data: { status: "LAPSED" } });
    await t.subscription.updateMany({ where: { id: p.subscriptionId, status: "ACTIVE" }, data: { status: "PAST_DUE" } });
    await audit(t, SYSTEM, "subscription.past_due", { storeId: p.subscription.storeId, entity: "Subscription", entityId: p.subscriptionId, data: { periodId: p.id, at: now.toISOString() } });
  });
  return null;
}

/** JOBS step (daily): bill periods without an order, lapse the unpaid past grace, roll every subscription whose period is over. */
export async function runSubscriptions(now = new Date()) {
  const { subscriptions } = await getSettings();
  const out = { billed: 0, lapsed: 0, rolled: 0, failed: 0 };
  const fail = () => void out.failed++;
  for (const p of await db.subscriptionPeriod.findMany({ where: { status: "DUE", billingOrderId: null }, select: { id: true }, take: 500 }))
    await billPeriod(p.id).then(() => out.billed++, fail);
  const due = await db.subscriptionPeriod.findMany({ where: { status: "DUE", billingOrderId: { not: null } }, select: { id: true, billingOrderId: true }, take: 2000 });
  const orders = new Map((await db.order.findMany({ where: { id: { in: due.map((p) => p.billingOrderId!) } }, select: { id: true, createdAt: true } })).map((o) => [o.id, o.createdAt]));
  for (const p of due) {
    const billed = orders.get(p.billingOrderId!);
    if (billed && isPastGrace(billed, subscriptions.graceDays, now)) await lapse(p.id, now).then(() => out.lapsed++, fail);
  }
  for (const s of await db.subscription.findMany({ where: { status: { in: [...LIVE] }, periodEnd: { lte: now } }, select: { id: true }, take: 500 }))
    await rollSubscription(s.id, now).then((r) => void (r && out.rolled++), fail);
  return out;
}

// ── Member actions ──────────────────────────────────────────────────────────────

async function ownSubscription(customerId: string, id: string) {
  const s = await db.subscription.findFirst({ where: { id, customerId }, include: { plan: true } });
  if (!s) throw new SubscriptionError("We couldn't find that plan");
  return s;
}

/** The member claims this period's allowance: an order at their store, already paid by the period. Returns its code. */
export async function claimAllowance(a: { customerId: string; subscriptionId: string; items: { variantId: string; qty: number }[] }) {
  const settings = await getSettings();
  if (!canBuyOnline(settings.launch.phase)) throw new SubscriptionError(PHASE_CLOSED);
  const s = await ownSubscription(a.customerId, a.subscriptionId);
  if (s.status === "CANCELLED") throw new SubscriptionError("This plan has ended");
  const now = new Date();
  const p = await db.subscriptionPeriod.findFirst({ where: { subscriptionId: s.id, periodStart: { lte: now }, periodEnd: { gt: now } } });
  if (!p || p.status === "DUE") throw new SubscriptionError("Pay for this period to open your allowance");
  if (p.status !== "PAID") throw new SubscriptionError(p.status === "COLLECTED" ? "You've claimed this period's allowance" : "This period has lapsed");
  const options = new Map((await eligibleVariants(s.plan)).map((v) => [v.id, v]));
  const items = a.items.filter((i) => i.qty > 0);
  if (items.some((i) => !options.has(i.variantId))) throw new SubscriptionError("That product isn't on your plan right now");
  const allowance = p.allowance + p.carryAllowance;
  const why = claimProblem(s.plan.unit, allowance, items.map((i) => ({ grams: options.get(i.variantId)!.grams, qty: i.qty })));
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
  // What the period paid (plus any carried period) spread over the lines by retail value, so the sale adds up exactly.
  const value = p.priceCents + p.carryCents;
  const shares = splitCents(value, lines.map((l) => l.qty * l.v.priceCents));
  const store = await db.store.findUniqueOrThrow({ where: { id: s.storeId }, select: { id: true, name: true } });
  const orderId = randomUUID();
  const code = shortCode(6);
  await tx(async (t) => {
    await lockCustomer(t, customer.id);
    const again = await evaluateBasket(basket);
    if (!again.ok) throw new SubscriptionError(again.blocks[0]);
    await lockStock(t, store.id, lines.map((l) => l.variantId));
    const short = await shortLine(t, store.id, lines.map((l) => ({ variantId: l.variantId, name: l.v.product.name, qty: l.qty })));
    if (short) throw new SubscriptionError(`${store.name} has run out of ${short.name}. Choose something else, or change your store for next time.`);
    // Claim the period first (compare-and-set): two taps can't both claim it.
    const { count } = await t.subscriptionPeriod.updateMany({ where: { id: p.id, status: "PAID" }, data: { status: "COLLECTED", claimOrderId: orderId } });
    if (!count) throw new SubscriptionError("You've claimed this period's allowance");
    // ponytail: D1 has no transactions; a stop between the claim above and this insert leaves the period COLLECTED with
    // no order. HQ can reopen it (set the period back to PAID); add a sweep if it is ever seen.
    await t.order.create({
      data: {
        id: orderId, code, collectionCode: pinCode(), customerId: customer.id, storeId: store.id, status: "PLACED", fulfilment: s.fulfilment,
        routingNote: `Club plan ${s.plan.name}: ${allowanceLabel(s.plan.unit, allowance, s.plan.itemWord)}`,
        ...(address && { addressLine: address.line, suburb: address.suburb, city: address.city, province: address.province, postalCode: address.postalCode, deliveryNotes: address.notes }),
        subtotalCents: value, discountCents: 0, deliveryCents: 0, pointsRedeemed: 0, totalCents: value, vatCents: vatOf(value),
        payMethod: "ONLINE", paymentStatus: "PAID", paymentRef: `${SUB_REF}${p.id}`,
        events: [{ status: "PLACED", at: now.toISOString(), note: `Club plan ${s.plan.name}` }] satisfies Event[],
        lines: {
          create: lines.map((l, i) => ({ variantId: l.variantId, qty: l.qty, unitPriceCents: Math.ceil(shares[i] / l.qty), memberSavingsCents: 0, offerCents: 0, totalCents: shares[i] })),
        },
      },
    });
    await audit(t, actorOf(customer), "subscription.claim", { storeId: store.id, entity: "SubscriptionPeriod", entityId: p.id, data: { orderId, items: items.length } });
  });
  await notifyPlaced(orderId);
  return { code };
}

type MemberChange = { customerId: string; firstName: string; subscriptionId: string };

export async function pauseSubscription(a: MemberChange, actor: Actor = actorOf({ id: a.customerId, firstName: a.firstName })) {
  const s = await ownSubscription(a.customerId, a.subscriptionId);
  if (s.status !== "ACTIVE") throw new SubscriptionError("Only an active plan can be paused");
  await tx(async (t) => {
    await t.subscription.updateMany({ where: { id: s.id, status: "ACTIVE" }, data: { status: "PAUSED", pausedAt: new Date() } });
    await audit(t, actor, "subscription.pause", { storeId: s.storeId, entity: "Subscription", entityId: s.id });
  });
}

/** Resumes a paused or past-due plan: if its period is over, a new one starts today and is billed. Returns the order to pay, if any. */
export async function resumeSubscription(a: MemberChange, actor: Actor = actorOf({ id: a.customerId, firstName: a.firstName })) {
  const s = await ownSubscription(a.customerId, a.subscriptionId);
  if (s.status !== "PAUSED" && s.status !== "PAST_DUE" && !(s.status === "ACTIVE" && s.cancelAtPeriodEnd)) throw new SubscriptionError("This plan is already running");
  if (s.plan.status !== "ACTIVE") throw new SubscriptionError("This plan is no longer offered");
  const now = new Date();
  await tx(async (t) => {
    // A period that ended while the plan was stopped isn't billed for: the next one starts today.
    await t.subscription.updateMany({ where: { id: s.id, status: { not: "CANCELLED" } }, data: { status: "ACTIVE", pausedAt: null, cancelAtPeriodEnd: false, ...(s.periodEnd <= now && { periodEnd: now }) } });
    await audit(t, actor, "subscription.resume", { storeId: s.storeId, entity: "Subscription", entityId: s.id });
  });
  const periodId = await rollSubscription(s.id, now);
  if (!periodId) return { orderId: null };
  const p = await db.subscriptionPeriod.findUnique({ where: { id: periodId }, select: { billingOrderId: true } });
  return { orderId: p?.billingOrderId ?? null };
}

/** Cancels at the end of the period already paid for (nothing more is billed); before anything was paid, at once. */
export async function cancelSubscription(a: MemberChange, actor: Actor = actorOf({ id: a.customerId, firstName: a.firstName })) {
  const s = await ownSubscription(a.customerId, a.subscriptionId);
  if (s.status === "CANCELLED") return;
  const current = await db.subscriptionPeriod.findFirst({ where: { subscriptionId: s.id }, orderBy: { periodStart: "desc" } });
  const now = current?.status === "PAID" || current?.status === "COLLECTED" ? false : true;
  if (now && current?.status === "DUE" && current.billingOrderId) await cancelBilling(current.billingOrderId, "Club plan cancelled");
  await tx(async (t) => {
    if (now) {
      if (current?.status === "DUE") await t.subscriptionPeriod.updateMany({ where: { id: current.id, status: "DUE" }, data: { status: "LAPSED" } });
      await t.subscription.updateMany({ where: { id: s.id, status: { not: "CANCELLED" } }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelAtPeriodEnd: false } });
    } else await t.subscription.updateMany({ where: { id: s.id, status: { not: "CANCELLED" } }, data: { cancelAtPeriodEnd: true } });
    await audit(t, actor, "subscription.cancel", { storeId: s.storeId, entity: "Subscription", entityId: s.id, data: { atPeriodEnd: !now } });
  });
}

/** Changes the store from the next period (this period's allowance stays where it was paid). */
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

/** A member's plans (live first), each with its current period. */
export async function memberSubscriptions(customerId: string) {
  const subs = await db.subscription.findMany({
    where: { customerId },
    include: { plan: true, periods: { orderBy: { periodStart: "desc" }, take: 1 } },
    orderBy: [{ cancelledAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 20,
  });
  const storeIds = [...new Set(subs.flatMap((s) => [s.storeId, s.nextStoreId].filter((x): x is string => !!x)))];
  const stores = new Map((await db.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  return subs.map((s) => ({ ...s, period: s.periods[0] ?? null, storeName: stores.get(s.storeId) ?? "", nextStoreName: s.nextStoreId ? (stores.get(s.nextStoreId) ?? "") : null }));
}

/** HQ totals: live subscribers, monthly recurring revenue (at each subscriber's own price) and allowances due this week. */
export async function hqTotals(storeIds: string[] | null, now = new Date()) {
  const where = storeIds ? { storeId: { in: storeIds } } : {};
  const live = await db.subscription.findMany({ where: { ...where, status: "ACTIVE" }, select: { priceCents: true, plan: { select: { period: true } } }, take: 50_000 });
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const [paused, pastDue, toCollect, unpaid] = await Promise.all([
    db.subscription.count({ where: { ...where, status: "PAUSED" } }),
    db.subscription.count({ where: { ...where, status: "PAST_DUE" } }),
    db.subscriptionPeriod.count({ where: { subscription: where, status: "PAID", periodStart: { lt: weekEnd }, periodEnd: { gt: now } } }),
    db.subscriptionPeriod.count({ where: { subscription: where, status: "DUE" } }),
  ]);
  return { active: live.length, paused, pastDue, mrrCents: live.reduce((s, x) => s + monthlyCents(x.priceCents, x.plan.period), 0), toCollect, unpaid };
}

export { PERIOD_LABEL };
