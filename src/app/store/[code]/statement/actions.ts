"use server";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { emailStatement } from "@/server/invoices";
import { attempt, done, fail, manage, type ActionState } from "@/server/store/context";
import { fmtMonth } from "@/lib/format";

export async function emailToOwner(code: string, month: string, _: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return attempt(async () => {
    const { store, actor } = await manage(code);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Choose a month");
    if (!store.company.email) return fail(`${store.company.legalName} has no email address on file — ask HQ to add one.`);
    await emailStatement(store.id, month);
    await audit(db, actor, "statement.email", { storeId: store.id, data: { month, to: store.company.email } });
    return done(`The ${fmtMonth(`${month}-15T12:00:00Z`)} statement is on its way to ${store.company.email}.`);
  });
}
