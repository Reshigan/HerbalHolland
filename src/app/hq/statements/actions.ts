"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { emailStatement } from "@/server/invoices";
import { guard, inScope, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { opt, parseRand, str } from "@/server/hq/form";
import { scopedStoreIds } from "@/server/scope";
import { deleteStatementPayment, recordStatementPayment, StatementPaymentError } from "@/server/ledger/statement-payments";
import { fmtDate, fmtMonth } from "@/lib/format";
import { zar } from "@/lib/money";

const validMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export async function emailOneStatement(storeId: string, month: string, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g || !(await inScope(g.scope, storeId))) return DENIED;
  if (!validMonth(month)) return fail("Choose a month.");
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, company: { select: { email: true } } } });
  if (!store?.company.email) return fail("The owner company has no email address — add one on the store page.");
  await emailStatement(storeId, month);
  await audit(db, g.actor, "statement.email", { storeId, entity: "Store", entityId: storeId, data: { month } });
  return done(`${fmtMonth(`${month}-01`)} statement emailed to ${store.company.email}.`);
}

/** Emails every trading store's statement for the month (5 at a time). */
export async function emailAllStatements(month: string, _: ActionState): Promise<ActionState> {
  const g = await guard("network");
  if (!g) return DENIED;
  if (!validMonth(month)) return fail("Choose a month.");
  const ids = await scopedStoreIds(g.scope, { kind: "RETAIL", status: { not: "OPENING_SOON" } });
  const stores = await db.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, company: { select: { email: true } } } });
  const withEmail = stores.filter((s) => s.company.email);
  const failed: string[] = [];
  for (let i = 0; i < withEmail.length; i += 5) {
    const batch = withEmail.slice(i, i + 5);
    const results = await Promise.allSettled(batch.map((s) => emailStatement(s.id, month)));
    results.forEach((r, j) => r.status === "rejected" && failed.push(batch[j].name));
  }
  const sent = withEmail.length - failed.length;
  await audit(db, g.actor, "statement.email_all", { data: { month, sent, failed, noEmail: stores.length - withEmail.length } });
  const missing = stores.length - withEmail.length;
  if (failed.length) return fail(`Sent ${sent}; ${failed.length} failed (${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}). Try those again individually.`);
  return done(`${sent} ${fmtMonth(`${month}-01`)} statement${sent === 1 ? "" : "s"} emailed to owners.${missing ? ` ${missing} store${missing === 1 ? " has" : "s have"} no owner email on file.` : ""}`);
}

const refresh = (storeCode?: string) => {
  revalidatePath("/hq/statements");
  if (storeCode) revalidatePath(`/store/${storeCode}/statement`);
};
const paymentFailure = (e: unknown): ActionState => {
  if (e instanceof StatementPaymentError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
  throw e;
};

/** HQ admin: a payment against a store's statement — the store paying HQ, or HQ paying the store. Posts to both books. */
export async function recordPayment(storeId: string, month: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g || !(await inScope(g.scope, storeId))) return DENIED;
  const direction = str(fd, "direction") === "HQ_PAID" ? "HQ_PAID" : "STORE_PAID";
  try {
    const p = await recordStatementPayment({ storeId, month, direction, amountCents: parseRand(str(fd, "amount")), paidOn: str(fd, "paidOn"), reference: str(fd, "reference"), note: opt(fd, "note") }, g.user);
    refresh((await db.store.findUnique({ where: { id: storeId }, select: { code: true } }))?.code);
    return done(`${zar(Math.abs(p.amountCents))} ${p.amountCents > 0 ? "paid to HQ" : "paid to the store"} on ${fmtDate(`${p.paidOn.toISOString().slice(0, 10)}T12:00:00Z`)} recorded — it posts to both companies' books within 15 minutes.`);
  } catch (e) {
    return paymentFailure(e);
  }
}

/** HQ admin: deletes a payment recorded by mistake; its postings are reversed. */
export async function deletePayment(id: string, _: ActionState): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const p = await db.statementPayment.findUnique({ where: { id }, select: { storeId: true } });
  if (!p) return fail("That payment has already been deleted.");
  if (!(await inScope(g.scope, p.storeId))) return DENIED;
  try {
    const gone = await deleteStatementPayment(id, g.user);
    refresh((await db.store.findUnique({ where: { id: gone.storeId }, select: { code: true } }))?.code);
    return done(`Payment ${gone.reference} deleted — its postings are reversed within 15 minutes.`);
  } catch (e) {
    return paymentFailure(e);
  }
}
