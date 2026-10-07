"use server";
// Closing a VAT period: only the books' approvers (the owner; HQ's administrator for HQ's own books). The company is
// checked here again, never trusted from the page.
import { revalidatePath } from "next/cache";
import { booksAccess } from "@/server/ledger/access";
import { LedgerError } from "@/server/ledger/core";
import { closeVatPeriod } from "@/server/ledger/reports";
import { actorOf, done, fail, type ActionState } from "@/server/store/context";
import { rangeLabel } from "@/lib/ledger-reports";

export async function closeVatPeriodAction(companyId: string, period: string, _: ActionState, fd?: FormData): Promise<ActionState> {
  void fd;
  const access = await booksAccess(companyId, "approve");
  if (!access) return fail("You don't have permission to close VAT periods in these books.");
  try {
    const r = await closeVatPeriod(companyId, period, actorOf(access.user));
    revalidatePath(`/books/${companyId}/vat`);
    return done(r.journal ? `${rangeLabel(r.period)} is closed: journal ${r.journal.number} moved its VAT to “VAT due to / from SARS”.` : `${rangeLabel(r.period)} was already closed and there's nothing new to move.`);
  } catch (e) {
    if (e instanceof LedgerError) return fail(e.message);
    throw e;
  }
}
