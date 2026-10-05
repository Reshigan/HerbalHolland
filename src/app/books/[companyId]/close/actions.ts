"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { booksAction, closeMonth, reopenMonth, retryPosting, type ActionState } from "@/server/ledger/admin";
import { fmtMonth } from "@/lib/format";

const name = (m: string) => fmtMonth(`${m}-15T12:00:00Z`);
function back(companyId: string, month: string, message: string): never {
  redirect(`/books/${companyId}/close?month=${month}&m=${encodeURIComponent(message)}`);
}

export async function closeMonthAction(companyId: string, month: string, _: ActionState): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    await closeMonth(user, companyId, month);
    revalidatePath(`/books/${companyId}`, "layout");
    back(companyId, month, `The books are closed through ${name(month)}. Anything that changes for those months now posts in the first open month.`);
  });
}

export async function reopenMonthAction(companyId: string, _: ActionState): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    const month = await reopenMonth(user, companyId);
    revalidatePath(`/books/${companyId}`, "layout");
    back(companyId, month, `${name(month)} is open again.`);
  });
}

/** HQ's books: a failed posting queued again (it posts within 15 minutes). */
export async function retryPostingAction(companyId: string, source: string, sourceId: string, _: ActionState): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    await retryPosting(user, companyId, source, sourceId);
    revalidatePath(`/books/${companyId}/close`);
    redirect(`/books/${companyId}/close?m=${encodeURIComponent("Queued again — it posts within 15 minutes.")}`);
  });
}
