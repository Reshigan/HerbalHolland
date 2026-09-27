// Scheduled housekeeping, run by /api/cron/[job]. Every job is idempotent and bounded,
// so a missed or doubled run is harmless. (frequent: every 15 min · daily: 02:00 SAST)
import { db, tx } from "./db";
import { SYSTEM } from "./audit";
import { advanceOrder } from "./orders";
import { runDueCampaigns } from "./marketing";
import { emailSaleInvoice } from "./invoices";
import { addPoints } from "./loyalty";
import { getSettings } from "./settings";
import { addDays, dayKey } from "@/lib/format";
import { assignFounding, expireTierFloors } from "./launch";
import { notifyDrops } from "./drops";
import { generateOffers } from "./offers";

const MIN = 60_000;

async function each<T>(items: T[], fn: (x: T) => Promise<unknown>) {
  let failed = 0;
  for (const x of items) await fn(x).catch((e) => (failed++, console.error("[job]", e)));
  return { done: items.length - failed, failed };
}

/** Unpaid online orders reserve stock: cancel them once the payment window lapses. */
export async function expireUnpaidOrders(now = new Date()) {
  const { ecommerce } = await getSettings();
  const due = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(now.getTime() - ecommerce.unpaidHoldMinutes * MIN) } },
    select: { id: true },
    take: 500,
  });
  return each(due, (o) => advanceOrder(o.id, "CANCELLED", SYSTEM, { note: "Payment not received in time" }));
}

/** Pay-in-store collections not picked up within the hold period release their stock. Paid orders stay with the store. */
export async function releaseUncollected(now = new Date()) {
  const { ecommerce } = await getSettings();
  const due = await db.order.findMany({
    where: { status: "READY", fulfilment: "COLLECT", paymentStatus: { not: "PAID" }, updatedAt: { lt: addDays(now, -ecommerce.collectHoldDays) } },
    select: { id: true },
    take: 500,
  });
  return each(due, (o) => advanceOrder(o.id, "CANCELLED", SYSTEM, { note: `Not collected within ${ecommerce.collectHoldDays} days` }));
}

/** Retries tax-invoice emails that failed (mail outage) for up to three days. */
export async function retryInvoices(now = new Date()) {
  const due = await db.sale.findMany({
    where: { invoiceSentAt: null, invoiceEmail: { not: null }, createdAt: { gte: addDays(now, -3), lt: new Date(now.getTime() - 10 * MIN) } },
    select: { id: true, invoiceEmail: true },
    take: 200,
  });
  return each(due, (s) => emailSaleInvoice(s.id, s.invoiceEmail!));
}

/** Birthday points once a year (HQ-funded); 29 February birthdays count on 28 February in other years. */
export async function birthdayPoints(now = new Date()) {
  const { loyalty } = await getSettings();
  if (!loyalty.birthdayBonus) return { done: 0, failed: 0 };
  const [y, m, d] = dayKey(now).split("-").map(Number);
  const leapDay = m === 2 && d === 28 && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1;
  const due = await db.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Customer" c
    WHERE EXTRACT(MONTH FROM c.dob) = ${m} AND (EXTRACT(DAY FROM c.dob) = ${d} OR (${leapDay} AND EXTRACT(DAY FROM c.dob) = 29))
      AND NOT EXISTS (SELECT 1 FROM "LoyaltyEntry" e WHERE e."customerId" = c.id AND e.kind = 'BIRTHDAY' AND e."createdAt" > ${addDays(now, -300)})`;
  return each(due, (c) =>
    tx((t) => addPoints(t, { customerId: c.id, points: loyalty.birthdayBonus, kind: "BIRTHDAY", note: "Happy birthday from Herbal Holland" })),
  );
}

export const JOBS: Record<string, () => Promise<Record<string, unknown>>> = {
  frequent: async () => ({
    campaigns: (await runDueCampaigns()).length,
    unpaidOrders: await expireUnpaidOrders(),
    invoices: await retryInvoices(),
    founding: await assignFounding(),
    drops: await notifyDrops(),
  }),
  daily: async () => ({
    birthdays: await birthdayPoints(),
    uncollected: await releaseUncollected(),
    tierFloors: await expireTierFloors(),
    // My Deals refresh weekly, on Mondays (SAST).
    offers: new Date(`${dayKey(new Date())}T12:00:00+02:00`).getUTCDay() === 1 ? await generateOffers() : { created: 0 },
  }),
};
