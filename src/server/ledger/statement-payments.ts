// Payments settling a store's monthly franchise statement, recorded by an HQ admin (owners and the rest of HQ see them,
// read-only): positive when the store paid HQ, negative when HQ paid the store. Each one posts in both companies'
// books (sources/hq.ts "statement-payment"); deleting one recorded by mistake reverses it.
import { db, tx } from "../db";
import { audit } from "../audit";
import type { Staff } from "../auth";
import { queuePosting } from "./core";
import { periodOf } from "@/lib/ledger";
import { dayKey, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";

export class StatementPaymentError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export type StatementPaymentInput = {
  storeId: string;
  month: string; // YYYY-MM statement it settles
  direction: "STORE_PAID" | "HQ_PAID";
  amountCents: number | null; // what was paid, positive
  paidOn: string; // YYYY-MM-DD (SAST)
  reference: string;
  note?: string | null;
};
type Recorder = Pick<Staff, "id" | "name" | "role">;

function onlyAdmin(u: Recorder) {
  if (u.role !== "HQ_ADMIN") throw new StatementPaymentError("Only an HQ admin can record or delete statement payments");
  return { type: "USER" as const, id: u.id, name: u.name };
}

/** Records a payment against a franchise store's statement for a month; it posts in both books on the day it was paid. */
export async function recordStatementPayment(a: StatementPaymentInput, user: Recorder, now = new Date()) {
  const actor = onlyAdmin(user);
  const today = dayKey(now);
  const month = a.month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > periodOf(today)) throw new StatementPaymentError("Choose the statement's month", "month");
  if (a.direction !== "STORE_PAID" && a.direction !== "HQ_PAID") throw new StatementPaymentError("Say who paid whom", "direction");
  const cents = a.amountCents;
  if (cents == null || !Number.isInteger(cents) || cents <= 0) throw new StatementPaymentError("Enter the amount paid, like 1734.00", "amount");
  if (cents > 1_000_000_000) throw new StatementPaymentError("That's more than a statement settles — check the amount", "amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.paidOn) || Number.isNaN(Date.parse(`${a.paidOn}T00:00:00Z`))) throw new StatementPaymentError("Choose the day it was paid", "paidOn");
  if (a.paidOn > today) throw new StatementPaymentError("A payment can't be dated in the future", "paidOn");
  if (a.paidOn < `${month}-01`) throw new StatementPaymentError(`A payment for the ${fmtMonth(`${month}-15T12:00:00Z`)} statement can't be dated before that month`, "paidOn");
  const reference = a.reference.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!reference) throw new StatementPaymentError("Enter the bank reference", "reference");
  const note = a.note?.trim().slice(0, 300) || null;
  const amountCents = a.direction === "STORE_PAID" ? cents : -cents;

  return tx(async (t) => {
    const store = await t.store.findUnique({ where: { id: a.storeId }, select: { id: true, kind: true, companyId: true, company: { select: { kind: true } } } });
    if (!store || store.kind !== "RETAIL" || store.company.kind !== "FRANCHISEE") throw new StatementPaymentError("Statement payments are for franchise stores");
    // One at a time per store: the same payment submitted twice is recorded once.
    await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`statement-payment:${store.id}`}))`;
    if (await t.statementPayment.count({ where: { storeId: store.id, month, amountCents, reference } }))
      throw new StatementPaymentError(`A payment of ${zar(cents)} with reference ${reference} is already recorded against this statement`, "reference");
    const p = await t.statementPayment.create({ data: { storeId: store.id, companyId: store.companyId, month, amountCents, paidOn: new Date(`${a.paidOn}T00:00:00Z`), reference, note, createdById: user.id } });
    await audit(t, actor, "statement.payment", { storeId: store.id, entity: "StatementPayment", entityId: p.id, data: { month, amountCents, paidOn: a.paidOn, reference } });
    await queuePosting(t, "statement-payment", p.id);
    return p;
  });
}

/** Deletes a payment recorded by mistake; its postings are reversed. */
export async function deleteStatementPayment(id: string, user: Recorder) {
  const actor = onlyAdmin(user);
  return tx(async (t) => {
    const p = await t.statementPayment.findUnique({ where: { id } });
    if (!p) throw new StatementPaymentError("That payment has already been deleted");
    await t.statementPayment.delete({ where: { id } });
    await audit(t, actor, "statement.payment_delete", {
      storeId: p.storeId, entity: "StatementPayment", entityId: id, data: { month: p.month, amountCents: p.amountCents, paidOn: p.paidOn.toISOString().slice(0, 10), reference: p.reference },
    });
    await queuePosting(t, "statement-payment", id);
    return p;
  });
}

/** A store's payments against one month's statement, latest first, a page at a time, with their count and total. */
export async function statementPayments(storeId: string, month: string, page = 1, pageSize = 10) {
  const where = { storeId, month };
  const [rows, sum] = await Promise.all([
    db.statementPayment.findMany({ where, orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    db.statementPayment.aggregate({ where, _sum: { amountCents: true }, _count: true }),
  ]);
  const names = rows.length ? await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } }) : [];
  const by = new Map(names.map((u) => [u.id, u.name]));
  return { rows: rows.map((r) => ({ ...r, createdBy: by.get(r.createdById) ?? null })), total: sum._count, paidCents: sum._sum.amountCents ?? 0 };
}

/** What's been paid against each store's statement for a month (positive: the store paid HQ). */
export async function paidByStore(storeIds: string[], month: string) {
  const rows = await db.statementPayment.groupBy({ by: ["storeId"], where: { storeId: { in: storeIds }, month }, _sum: { amountCents: true } });
  return new Map(rows.map((r) => [r.storeId, r._sum.amountCents ?? 0]));
}
