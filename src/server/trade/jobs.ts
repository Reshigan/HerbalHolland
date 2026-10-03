// The trade channel's scheduled work (registered in src/server/jobs.ts under `daily`): lapsed EFT orders, overdue
// holds, and the monthly statements on the statement day. Each is idempotent and bounded.
import { db } from "../db";
import { SYSTEM } from "../audit";
import { getSettings } from "../settings";
import { addDays } from "@/lib/format";
import { dayOfMonthSA, overdueBeyondGrace, previousMonth } from "@/lib/trade";
import { advanceTradeOrder } from "./orders";
import { holdTradeAccount } from "./accounts";
import { emailTradeStatement, ledgerEntries, statementLogId } from "./ledger";

async function each<T>(items: T[], fn: (x: T) => Promise<unknown>) {
  let failed = 0;
  for (const x of items) await fn(x).catch((e) => (failed++, console.error("[trade job]", e)));
  return { done: items.length - failed, failed };
}

/** EFT orders whose payment hasn't been confirmed within `trade.eftHoldDays` are cancelled (nothing was reserved) and the buyer told. */
export async function tradeEftExpiry(now = new Date()) {
  const { trade } = await getSettings();
  const due = await db.tradeOrder.findMany({ where: { status: "PENDING_PAYMENT", createdAt: { lt: addDays(now, -trade.eftHoldDays) } }, select: { id: true }, take: 500 });
  return each(due, (o) => advanceTradeOrder(o.id, "cancel", SYSTEM, { note: `Payment not received within ${trade.eftHoldDays} days` }));
}

/**
 * Accounts on credit terms with an invoice still open more than `trade.overdueGraceDays` past its due date (after
 * payments are applied FIFO) go ON_HOLD with the reason "overdue" — emailed, and lifted by itself when settled.
 */
export async function tradeOverdueHolds(now = new Date()) {
  const { trade } = await getSettings();
  const cutoff = addDays(now, -trade.overdueGraceDays);
  const candidates = await db.tradeLedgerEntry.findMany({
    where: { kind: "INVOICE", dueAt: { lt: cutoff }, account: { status: "APPROVED", terms: "ACCOUNT" } },
    select: { tradeAccountId: true }, distinct: ["tradeAccountId"], take: 500,
  });
  let held = 0;
  const r = await each(candidates, async (c) => {
    const entries = await ledgerEntries(c.tradeAccountId);
    if (overdueBeyondGrace(entries, now, trade.overdueGraceDays) <= 0) return;
    await holdTradeAccount(c.tradeAccountId, "overdue", SYSTEM);
    held++;
  });
  return { ...r, held };
}

/**
 * On the statement day (SAST), last month's statement to every approved or held account that had a balance or any
 * movement in the month — once per account and month (message log `trade-statement-<account>-<month>`).
 */
export async function tradeStatements(now = new Date()) {
  const { trade } = await getSettings();
  if (dayOfMonthSA(now) !== trade.statementDay) return { done: 0, failed: 0, skipped: "not the statement day" };
  const month = previousMonth(now);
  const accounts = await db.tradeAccount.findMany({ where: { status: { in: ["APPROVED", "ON_HOLD"] } }, select: { id: true }, orderBy: { number: "asc" }, take: 2_000 });
  const already = new Set((await db.messageLog.findMany({ where: { id: { in: accounts.map((a) => statementLogId(a.id, month)) } }, select: { id: true } })).map((m) => m.id));
  const active = new Set((await db.tradeLedgerEntry.findMany({ where: { tradeAccountId: { in: accounts.map((a) => a.id) } }, select: { tradeAccountId: true }, distinct: ["tradeAccountId"] })).map((e) => e.tradeAccountId));
  const due = accounts.filter((a) => active.has(a.id) && !already.has(statementLogId(a.id, month)));
  return { ...(await each(due, (a) => emailTradeStatement(a.id, month))), month };
}
