"use server";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { emailStatement } from "@/server/invoices";
import { guard, inScope, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { scopedStoreIds } from "@/server/scope";
import { fmtMonth } from "@/lib/format";

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
