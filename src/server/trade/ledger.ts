// The trade account's ledger: invoices raise what it owes (shipped or collected orders, till sales on account),
// payments and credit notes lower it, HQ adjusts it with a note. Balance = sum(cents). Ageing is FIFO on due dates
// (src/lib/trade.ts). Every write is audited; statements go out monthly (trade/jobs.ts) and on request.
import { db, tx, type Tx } from "../db";
import { audit, type Actor } from "../audit";
import { nextNumber } from "../counters";
import { getSettings } from "../settings";
import { deliverEmail, finalizeEmail, sendEmail } from "../email";
import { pdfAttachment } from "../pdf";
import { queuePosting } from "../ledger/core";
import { ageing, creditDecision, overdueBeyondGrace, statementMonth, tradeCreditNumber, tradeStatement, type CreditDecision } from "@/lib/trade";
import { dayKey } from "@/lib/format";
import { OPEN_TRADE_ORDER_STATUSES } from "../inventory";
import { tradeHoldLiftedEmail, tradePortalUrl, tradeStatementEmail } from "./emails";
import type { TradeAccount, TradeLedgerKind } from "@/generated/prisma/client";

export class TradeLedgerError extends Error {}

type Client = Tx | typeof db;

export const ledgerEntries = (accountId: string, client: Client = db) => client.tradeLedgerEntry.findMany({ where: { tradeAccountId: accountId }, orderBy: { createdAt: "asc" } });

/** What the account owes (positive) or is owed (negative), in cents. */
export async function tradeBalance(accountId: string, client: Client = db) {
  const r = await client.tradeLedgerEntry.aggregate({ where: { tradeAccountId: accountId }, _sum: { cents: true } });
  return r._sum.cents ?? 0;
}

/** On-account orders confirmed but not yet invoiced (PLACED, PICKING, READY): they count against the credit limit. */
export async function openOnAccountCents(accountId: string, client: Client = db) {
  const r = await client.tradeOrder.aggregate({ where: { tradeAccountId: accountId, payMethod: "ACCOUNT", status: { in: [...OPEN_TRADE_ORDER_STATUSES] } }, _sum: { totalCents: true } });
  return r._sum.totalCents ?? 0;
}

export const tradeAgeing = async (accountId: string, now = new Date(), client: Client = db) => ageing(await ledgerEntries(accountId, client), now);

/** The credit decision for putting `orderInclCents` on this account now (balance and open on-account orders counted). */
export async function creditCheckFor(account: Pick<TradeAccount, "id" | "terms" | "status" | "creditLimitCents">, orderInclCents: number, client: Client = db): Promise<CreditDecision> {
  const [balanceCents, openOrdersCents] = await Promise.all([tradeBalance(account.id, client), openOnAccountCents(account.id, client)]);
  return creditDecision({ terms: account.terms, status: account.status, creditLimitCents: account.creditLimitCents, balanceCents, openOrdersCents, orderInclCents });
}

/**
 * The credit decision inside the caller's transaction: two orders or till sales on account at once can't both spend the
 * same headroom, because D1 runs writes one at a time, so the second counts the first.
 */
export async function lockedCreditCheck(t: Tx, accountId: string, orderInclCents: number): Promise<CreditDecision> {
  const account = await t.tradeAccount.findUniqueOrThrow({ where: { id: accountId }, select: { id: true, terms: true, status: true, creditLimitCents: true } });
  return creditCheckFor(account, orderInclCents, t);
}

/** An order or sale named on a ledger entry must be this account's own. */
async function checkLinks(t: Tx, accountId: string, a: { tradeOrderId?: string | null; saleId?: string | null }) {
  if (a.tradeOrderId && !(await t.tradeOrder.findFirst({ where: { id: a.tradeOrderId, tradeAccountId: accountId }, select: { id: true } }))) throw new TradeLedgerError("That order isn't on this account");
  if (a.saleId && !(await t.sale.findFirst({ where: { id: a.saleId, tradeAccountId: accountId }, select: { id: true } }))) throw new TradeLedgerError("That sale isn't on this account");
}

/** Writes one ledger entry inside the caller's transaction (orders and sales raise invoices and credit notes this way). */
export function postLedgerEntry(
  t: Tx,
  a: { accountId: string; kind: TradeLedgerKind; cents: number; reference?: string | null; tradeOrderId?: string | null; saleId?: string | null; dueAt?: Date | null; note?: string | null; createdAt?: Date; actor: Actor },
) {
  if (!Number.isInteger(a.cents) || a.cents === 0) throw new TradeLedgerError("A ledger entry needs a whole number of cents");
  return t.tradeLedgerEntry.create({
    data: {
      tradeAccountId: a.accountId, kind: a.kind, cents: a.cents, reference: a.reference ?? null, tradeOrderId: a.tradeOrderId ?? null, saleId: a.saleId ?? null, dueAt: a.dueAt ?? null, note: a.note ?? null,
      createdById: a.actor.id ?? null, ...(a.createdAt ? { createdAt: a.createdAt } : {}),
    },
  });
}

/**
 * Lifts an "overdue" hold once nothing is past due any more (a settled balance always qualifies). Returns true when the
 * account went back to APPROVED; HQ's own holds (any other reason) are never lifted here.
 */
export async function releaseHoldIfClear(t: Tx, accountId: string, actor: Actor, now = new Date()) {
  const account = await t.tradeAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.status !== "ON_HOLD" || account.holdReason !== "overdue") return false;
  const entries = await ledgerEntries(accountId, t);
  if (overdueBeyondGrace(entries, now, 0) > 0) return false;
  await t.tradeAccount.update({ where: { id: accountId }, data: { status: "APPROVED", holdReason: null } });
  await audit(t, actor, "trade.account.release", { entity: "TradeAccount", entityId: accountId, data: { number: account.number, reason: "settled" } });
  return true;
}

const mail = async (r: { subject: string; html: string; text: string }, to: string) => sendEmail({ ...r, to }).catch((e) => console.error("[trade] email failed", r.subject, e));

/** A payment received (EFT, with the bank reference). Negative on the ledger; lifts an overdue hold once nothing is past due. */
export async function recordTradePayment(accountId: string, a: { cents: number; reference: string; receivedAt?: Date; note?: string | null; tradeOrderId?: string | null }, actor: Actor) {
  const cents = Math.floor(a.cents);
  if (!(cents > 0)) throw new TradeLedgerError("Enter the amount received");
  const reference = a.reference.trim().slice(0, 80);
  if (!reference) throw new TradeLedgerError("Enter the bank reference");
  const result = await tx(async (t) => {
    // Under the account's row lock: the same payment submitted twice is recorded once.
    await t.$queryRaw`SELECT 1 FROM "TradeAccount" WHERE id = ${accountId} FOR UPDATE`;
    const account = await t.tradeAccount.findUniqueOrThrow({ where: { id: accountId } });
    await checkLinks(t, accountId, a);
    const same = await t.tradeLedgerEntry.findFirst({ where: { tradeAccountId: accountId, kind: "PAYMENT", reference, cents: -cents, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, select: { createdAt: true } });
    if (same) throw new TradeLedgerError(`A payment of that amount with reference ${reference} is already on the account (recorded ${dayKey(same.createdAt)})`);
    const entry = await t.tradeLedgerEntry.create({
      data: { tradeAccountId: accountId, kind: "PAYMENT", cents: -cents, reference, note: a.note ?? null, tradeOrderId: a.tradeOrderId ?? null, createdById: actor.id ?? null, ...(a.receivedAt ? { createdAt: a.receivedAt } : {}) },
    });
    await queuePosting(t, "trade-entry", entry.id); // HQ's books
    await audit(t, actor, "trade.payment", { entity: "TradeAccount", entityId: accountId, data: { number: account.number, cents, reference } });
    const released = await releaseHoldIfClear(t, accountId, actor);
    return { entry, released, account, balanceCents: await tradeBalance(accountId, t) };
  });
  if (result.released) await mail(tradeHoldLiftedEmail({ account: result.account, url: tradePortalUrl("/range") }), result.account.email);
  return result;
}

/** A credit note by hand (a return HQ agreed, a price correction). Negative on the ledger, numbered TC-… unless a reference is given. */
export async function issueCreditNote(accountId: string, a: { cents: number; reference?: string | null; note: string; saleId?: string | null; tradeOrderId?: string | null }, actor: Actor) {
  const cents = Math.floor(a.cents);
  if (!(cents > 0)) throw new TradeLedgerError("Enter the amount to credit");
  const note = a.note.trim().slice(0, 300);
  if (!note) throw new TradeLedgerError("Say why the account is being credited");
  const result = await tx(async (t) => {
    await checkLinks(t, accountId, a);
    const account = await t.tradeAccount.findUniqueOrThrow({ where: { id: accountId } });
    const reference = a.reference?.trim().slice(0, 80) || tradeCreditNumber(await nextNumber(t, "trade-credit"));
    const entry = await t.tradeLedgerEntry.create({
      data: { tradeAccountId: accountId, kind: "CREDIT_NOTE", cents: -cents, reference, note, saleId: a.saleId ?? null, tradeOrderId: a.tradeOrderId ?? null, createdById: actor.id ?? null },
    });
    await queuePosting(t, "trade-entry", entry.id); // HQ's books
    await audit(t, actor, "trade.credit_note", { entity: "TradeAccount", entityId: accountId, data: { number: account.number, cents, reference, note } });
    const released = await releaseHoldIfClear(t, accountId, actor);
    return { entry, released, account };
  });
  if (result.released) await mail(tradeHoldLiftedEmail({ account: result.account, url: tradePortalUrl("/range") }), result.account.email);
  return result.entry;
}

/** An HQ correction, either way, always with a note. Name the order or sale it concerns so it settles against that item first. */
export async function adjustTradeLedger(accountId: string, a: { cents: number; note: string; reference?: string | null; tradeOrderId?: string | null; saleId?: string | null }, actor: Actor) {
  const cents = Math.trunc(a.cents);
  if (!cents) throw new TradeLedgerError("Enter the amount to adjust by (negative to reduce what the account owes)");
  const note = a.note.trim().slice(0, 300);
  if (!note) throw new TradeLedgerError("An adjustment needs a note");
  return tx(async (t) => {
    await checkLinks(t, accountId, a);
    const account = await t.tradeAccount.findUniqueOrThrow({ where: { id: accountId } });
    const entry = await t.tradeLedgerEntry.create({ data: { tradeAccountId: accountId, kind: "ADJUSTMENT", cents, note, reference: a.reference?.trim().slice(0, 80) || null, tradeOrderId: a.tradeOrderId ?? null, saleId: a.saleId ?? null, createdById: actor.id ?? null } });
    await queuePosting(t, "trade-entry", entry.id); // HQ's books
    await audit(t, actor, "trade.ledger.adjust", { entity: "TradeAccount", entityId: accountId, data: { number: account.number, cents, note } });
    if (cents < 0) await releaseHoldIfClear(t, accountId, actor);
    return entry;
  });
}

/** The statement for a month (YYYY-MM, SAST): opening balance, every entry with a running balance, closing balance and ageing. */
export async function tradeStatementFor(accountId: string, month: string) {
  const { from, to } = statementMonth(month);
  const [account, entries] = await Promise.all([db.tradeAccount.findUniqueOrThrow({ where: { id: accountId } }), ledgerEntries(accountId)]);
  return { account, month, ...tradeStatement(entries, { from, to }) };
}

export const statementLogId = (accountId: string, month: string) => `trade-statement-${accountId}-${month}`;

/**
 * Emails the month's statement to the account's billing address, once per account and month (the message log row
 * `trade-statement-<account>-<month>` is the receipt; `force` sends it again). Attaches the statement as a PDF and
 * links to the portal's statement page. Returns what happened.
 */
export async function emailTradeStatement(accountId: string, month: string, opts: { force?: boolean } = {}) {
  const id = statementLogId(accountId, month);
  if (!opts.force && (await db.messageLog.findUnique({ where: { id }, select: { id: true } }))) return { sent: false, reason: "already sent" };
  const st = await tradeStatementFor(accountId, month);
  if (st.account.status === "PENDING") return { sent: false, reason: "not approved" };
  const r = await finalizeEmail({ to: st.account.email, ...tradeStatementEmail({ account: st.account, month, opening: st.opening, lines: st.lines, closing: st.closing, ageing: st.ageing, url: tradePortalUrl(`/statements/${month}`) }) });
  let reason: string | null = null;
  let delivered = false;
  try {
    delivered = await deliverEmail({ ...r, kind: "TRANSACTIONAL", attachments: await pdfAttachment(`Herbal Holland statement ${st.account.number} ${month}`, { html: r.html }) });
  } catch (err) {
    reason = String((err as Error)?.message ?? err).slice(0, 300);
    console.error("[trade] statement email failed", id, reason);
  }
  await db.messageLog.upsert({
    where: { id },
    create: { id, channel: "EMAIL", to: st.account.email, kind: "trade-statement", status: reason ? "FAILED" : "SENT", reason: reason ?? (delivered ? null : "logged (MS_* not set)"), body: `${r.subject}\n\n${r.text}` },
    update: { status: reason ? "FAILED" : "SENT", reason: reason ?? (delivered ? null : "logged (MS_* not set)"), body: `${r.subject}\n\n${r.text}`, createdAt: new Date() },
  });
  if (!reason) await audit(db, { type: "SYSTEM", name: "Trade statements" }, "trade.statement", { entity: "TradeAccount", entityId: accountId, data: { month, closing: st.closing } });
  return { sent: !reason, reason };
}

/** The trade settings, for callers that need the bank details and terms (pro formas, approval emails). */
export const tradeSettings = async () => (await getSettings()).trade;
