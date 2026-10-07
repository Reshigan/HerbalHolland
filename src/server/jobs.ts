// Scheduled housekeeping, run by /api/cron/[job]. Every job is idempotent and bounded, so a missed or doubled run is
// harmless, and every step runs whatever happens to the others: one that throws is reported (the log and ALERT_EMAIL),
// shows as { error } in the job's result, and the run is recorded as failed (JobRun, which /api/health/jobs reads).
// (frequent: every 15 min · daily: 02:00 SAST · staff-push: every 5 min · operations: 03:00 SAST; a new job needs its
// window in JOB_WINDOWS, @/lib/jobs)
import { db, tx } from "./db";
import { SYSTEM } from "./audit";
import { reportFailure } from "./alerts";
import { advanceOrder } from "./orders";
import { releaseStudio, syncStudio } from "./studio";
import { runDueCampaigns } from "./marketing";
import { emailSaleInvoice } from "./invoices";
import { addPoints } from "./loyalty";
import { getSettings } from "./settings";
import { addDays, dayKey, weekdaySA } from "@/lib/format";
import { runSteps, type Steps } from "@/lib/jobs";
import { assignFounding, expireTierFloors } from "./launch";
import { notifyDrops } from "./drops";
import { generateOffers } from "./offers";
import { submitMerchOrders } from "./merch";
import { runLossRules } from "./loss";
import { purgeLeads } from "./leads";
import { purgeMessageBodies } from "./messaging";
import { lowStockDigest, notifyAlerts, notifyAnnouncements, notifyDepositsDue, notifyExpiringBatches, notifyNewOrders, pruneStaffPushEvents } from "./staff-push";
import { pruneExports, runDueExports } from "./exports";
import { purgeResolvedTickets } from "./support";
import { sendDueReminders } from "./shop/reminders";
import { expireVouchers } from "./shop/vouchers";
import { refreshWishlistStock } from "./shop/wishlist";
import { tradeEftExpiry, tradeOverdueHolds, tradeStatements } from "./trade/jobs";
import { tradeLicenceExpiry } from "./trade/licences";
import { purgeAuthRecords } from "./auth";
import { settleStatementInvoices } from "./supplier-invoices";
import { autoMatchAll } from "./ledger/bank";
import { ledgerNightly, processLedgerQueue } from "./ledger/core";

export { tradeEftExpiry, tradeOverdueHolds, tradeStatements, tradeLicenceExpiry };

const MIN = 60_000;

/** One item at a time; one that fails is reported (`what`: the job function) and the rest carry on. */
async function each<T>(what: string, items: T[], fn: (x: T) => Promise<unknown>) {
  let failed = 0;
  for (const x of items)
    await fn(x).catch((e) => {
      failed++;
      return reportFailure(e, `cron ${what}`);
    });
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
  return each("expireUnpaidOrders", due, (o) => advanceOrder(o.id, "CANCELLED", SYSTEM, { note: "Payment not received in time" }));
}

/** Pay-in-store collections not picked up within the hold period release their stock. Paid orders stay with the store. */
export async function releaseUncollected(now = new Date()) {
  const { ecommerce } = await getSettings();
  const due = await db.order.findMany({
    where: { status: "READY", fulfilment: "COLLECT", paymentStatus: { not: "PAID" }, updatedAt: { lt: addDays(now, -ecommerce.collectHoldDays) } },
    select: { id: true },
    take: 500,
  });
  return each("releaseUncollected", due, (o) => advanceOrder(o.id, "CANCELLED", SYSTEM, { note: `Not collected within ${ecommerce.collectHoldDays} days` }));
}

/** Retries tax-invoice emails that failed (mail outage) for up to three days. */
export async function retryInvoices(now = new Date()) {
  const due = await db.sale.findMany({
    where: { invoiceSentAt: null, invoiceEmail: { not: null }, createdAt: { gte: addDays(now, -3), lt: new Date(now.getTime() - 10 * MIN) } },
    select: { id: true, invoiceEmail: true },
    take: 200,
  });
  return each("retryInvoices", due, (s) => emailSaleInvoice(s.id, s.invoiceEmail!));
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
  return each("birthdayPoints", due, (c) =>
    tx((t) => addPoints(t, { customerId: c.id, points: loyalty.birthdayBonus, kind: "BIRTHDAY", note: "Happy birthday from Herbal Holland" })),
  );
}

/** Each job's steps, in order. A group of steps (trade, pruned) is isolated step by step too, and nests its results. */
export const JOBS: Record<string, Steps> = {
  frequent: {
    campaigns: async () => (await runDueCampaigns()).length,
    // The Studio: release the queued posts whose time has come (unless their campaign is paused), then read back
    // which campaigns and Postiz posts went out.
    studioRelease: () => releaseStudio(),
    studio: () => syncStudio(),
    unpaidOrders: expireUnpaidOrders,
    invoices: retryInvoices,
    founding: assignFounding,
    drops: notifyDrops,
    merchSent: submitMerchOrders,
    // Wishlists: note what the network ran out of and what came back ("Back in stock" on /club/wishlist).
    wishlists: refreshWishlistStock,
    // The books: whatever changed since the last run (invoices, deposits, stock orders, late till sales…), posted.
    ledger: () => processLedgerQueue({ deadline: Date.now() + 5 * MIN }),
  },
  daily: {
    birthdays: birthdayPoints,
    uncollected: releaseUncollected,
    tierFloors: expireTierFloors,
    lossPrevention: runLossRules,
    // POPIA: not-a-fit franchise enquiries are deleted a year after their last change (audited as lead.purge).
    franchiseLeads: purgeLeads,
    // POPIA: resolved support tickets (and their messages) are deleted a year after they close (audited as support.purge).
    supportTickets: purgeResolvedTickets,
    // POPIA: message texts are blanked 12 months after they're sent (the log row stays).
    messageBodies: purgeMessageBodies,
    // My Deals refresh weekly, on Mondays (SAST).
    offers: async () => (weekdaySA(new Date()) === 1 ? generateOffers() : { created: 0 }),
    // Reorder reminders the member set (one message with a one-tap reorder link; nothing is charged).
    reminders: sendDueReminders,
    // Gift vouchers past their three years (CPA s63) expire; purchases never paid for are cancelled.
    vouchers: expireVouchers,
    // Trade: EFT orders unpaid past the hold lapse; accounts with an invoice past due + grace go on hold; last
    // month's statements go out from the statement day (once per account and month).
    trade: { eftExpiry: tradeEftExpiry, overdueHolds: tradeOverdueHolds, licences: tradeLicenceExpiry, statements: tradeStatements },
    // Expired sessions, day-old sign-in codes, rate-limit rows and 90-day-old payment webhook ids.
    purged: purgeAuthRecords,
    statementInvoices: settleStatementInvoices, // stock orders from a month that's over: settled on its statement
    // The books: the day that ended and month-end work (and whatever a missed night in the week before left), queued
    // and posted after everything above; then bank lines still open matched again.
    ledger: ledgerNightly,
    bank: autoMatchAll,
  },
  // Staff phones: new online orders (polled, since nothing hooks the checkout), loss alerts, HQ updates to acknowledge.
  "staff-push": { orders: notifyNewOrders, alerts: notifyAlerts, announcements: notifyAnnouncements },
  // Daily operations (after `daily`): expiring lots, cash due at the bank, the low-stock digest, scheduled report
  // exports, and pruning of old push-event keys and export files.
  operations: {
    batches: notifyExpiringBatches,
    deposits: notifyDepositsDue,
    lowStock: lowStockDigest,
    exports: runDueExports,
    pruned: { pushEvents: async () => (await pruneStaffPushEvents()).count, exports: pruneExports },
  },
};

/**
 * Runs a job (the cron route holds its lock, so one run at a time) and keeps its heartbeat in JobRun: when it started,
 * then when it last finished cleanly or last failed, with the failed steps' names (their errors went to the log and
 * the alerts). Returns every step's result and the steps that failed.
 */
export async function runJob(job: string) {
  const steps = Object.hasOwn(JOBS, job) ? JOBS[job] : null;
  if (!steps) throw new Error(`There's no scheduled job "${job}"`);
  const startedAt = new Date();
  await db.jobRun.upsert({ where: { job }, create: { job, startedAt }, update: { startedAt } });
  const run = await runSteps(steps, (e, step) => reportFailure(e, `cron ${job}: ${step}`));
  await db.jobRun.update({ where: { job }, data: run.failed.length ? { failedAt: new Date(), error: `Failed: ${run.failed.join(", ")}`.slice(0, 500) } : { okAt: new Date() } });
  return run;
}
