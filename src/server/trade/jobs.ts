// The trade channel's scheduled work (registered in src/server/jobs.ts under `daily`): lapsed EFT orders, overdue
// holds, and the monthly statements from the statement day. Each is idempotent and bounded.
import { db } from "../db";
import { SYSTEM } from "../audit";
import { reportFailure } from "../alerts";
import { getSettings } from "../settings";
import { addDays } from "@/lib/format";
import { dayOfMonthSA, overdueBeyondGrace, previousMonth } from "@/lib/trade";
import { advanceTradeOrder } from "./orders";
import { holdTradeAccount } from "./accounts";
import { emailTradeStatement, ledgerEntries, statementLogId } from "./ledger";
import { inBatches } from "@/lib/json-list";

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

/** EFT orders whose payment hasn't been confirmed within `trade.eftHoldDays` are cancelled (nothing was reserved) and the buyer told. */
export async function tradeEftExpiry(now = new Date()) {
  const { trade } = await getSettings();
  const due = await db.tradeOrder.findMany({ where: { status: "PENDING_PAYMENT", createdAt: { lt: addDays(now, -trade.eftHoldDays) } }, select: { id: true }, take: 500 });
  return each("tradeEftExpiry", due, (o) => advanceTradeOrder(o.id, "cancel", SYSTEM, { note: `Payment not received within ${trade.eftHoldDays} days` }));
}

/**
 * Accounts on credit terms with an invoice still open more than `trade.overdueGraceDays` past its due date (after
 * payments are applied FIFO) go ON_HOLD with the reason "overdue". The hold is emailed, and lifted by itself when settled.
 */
export async function tradeOverdueHolds(now = new Date()) {
  const { trade } = await getSettings();
  const cutoff = addDays(now, -trade.overdueGraceDays);
  const candidates = await db.tradeLedgerEntry.findMany({
    where: { kind: "INVOICE", dueAt: { lt: cutoff }, account: { status: "APPROVED", terms: "ACCOUNT" } },
    select: { tradeAccountId: true }, distinct: ["tradeAccountId"], take: 500,
  });
  let held = 0;
  const r = await each("tradeOverdueHolds", candidates, async (c) => {
    const entries = await ledgerEntries(c.tradeAccountId);
    if (overdueBeyondGrace(entries, now, trade.overdueGraceDays) <= 0) return;
    await holdTradeAccount(c.tradeAccountId, "overdue", SYSTEM);
    held++;
  });
  return { ...r, held };
}

/** The statement day and the six after it: a night the job missed, or a mail outage, is made up within the week. */
const STATEMENT_DAYS = 7;

/**
 * From the statement day (SAST), last month's statement to every approved or held account that had a balance or any
 * movement in the month, once per account and month (message log `trade-statement-<account>-<month>`). Until the
 * week is out, an account whose statement hasn't gone yet, or whose email failed, gets it on the next run; one that
 * went is never sent again.
 */
export async function tradeStatements(now = new Date()) {
  const { trade } = await getSettings();
  const late = dayOfMonthSA(now) - trade.statementDay;
  if (late < 0 || late >= STATEMENT_DAYS) return { done: 0, failed: 0, skipped: "not the statement day" };
  const month = previousMonth(now);
  const accounts = await db.tradeAccount.findMany({ where: { status: { in: ["APPROVED", "ON_HOLD"] } }, select: { id: true }, orderBy: { number: "asc" }, take: 2_000 });
  const sent = new Set((await inBatches(accounts.map((a) => statementLogId(a.id, month)), (part) => db.messageLog.findMany({ where: { id: { in: part }, status: "SENT" }, select: { id: true } }))).map((m) => m.id));
  const active = new Set((await inBatches(accounts.map((a) => a.id), (part) => db.tradeLedgerEntry.findMany({ where: { tradeAccountId: { in: part } }, select: { tradeAccountId: true }, distinct: ["tradeAccountId"] }))).map((e) => e.tradeAccountId));
  const due = accounts.filter((a) => active.has(a.id) && !sent.has(statementLogId(a.id, month)));
  // force: so a failed send's receipt doesn't stop it going again (nothing in `due` has gone out).
  return { ...(await each("tradeStatements", due, (a) => emailTradeStatement(a.id, month, { force: true }))), month };
}
