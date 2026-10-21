// Runs a banking action: what the person can fix (a refusal, a file that can't be read, a posting the books won't take)
// comes back as an inline message; anything else is logged and emailed to ops. Redirects and not-founds pass through.
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { reportFailure } from "@/server/alerts";
import { background } from "@/server/background";
import { fail, type ActionState } from "@/server/store/context";
import { BankError } from "@/server/ledger/bank";
import { LedgerError } from "@/server/ledger/core";
import { StatementError } from "@/lib/bank-import";

export async function act(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof BankError) return fail(e.message, e.field);
    if (e instanceof StatementError) return fail(e.message, "file");
    if (e instanceof LedgerError) return fail(e.message);
    background("books bank report", reportFailure(e, "books bank action"));
    return fail("Something went wrong. Please try again.");
  }
}

/** The pages a change to a company's banking shows on. */
export function refresh(companyId: string, bankAccountId?: string) {
  revalidatePath(`/books/${companyId}/bank`);
  revalidatePath(`/books/${companyId}`);
  if (bankAccountId) {
    revalidatePath(`/books/${companyId}/bank/${bankAccountId}`);
    revalidatePath(`/books/${companyId}/bank/${bankAccountId}/reconcile`);
  }
}
