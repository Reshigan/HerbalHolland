"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { approveDraft, booksAction, deleteDraftJournal, failed, reverseManual, saveJournal, type ActionState } from "@/server/ledger/admin";
import { parseRand, str } from "@/server/store/rules";

const MAX_LINES = 200;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A manual journal from the form: its lines arrive as JSON (account, store, party, debit, credit, note). */
export async function createJournal(companyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return booksAction(companyId, "write", async ({ user }) => {
    let raw: unknown;
    try {
      raw = JSON.parse(String(fd.get("lines") ?? "[]"));
    } catch {
      raw = null;
    }
    if (!Array.isArray(raw)) return failed("The lines didn't come through. Reload the page and try again.");
    if (raw.length > MAX_LINES) return failed(`A journal holds at most ${MAX_LINES} lines. Split it into two journals.`);
    const lines = [];
    for (const [i, l] of (raw as Record<string, unknown>[]).entries()) {
      const amount = (side: "debit" | "credit") => {
        const s = text(l?.[side]);
        if (!s) return 0;
        const cents = parseRand(s);
        if (cents == null) throw new Error(`Line ${i + 1}: the ${side} “${s.slice(0, 20)}” isn't an amount`);
        if (cents < 0) throw new Error(`Line ${i + 1}: enter a negative ${side} in the other column`);
        return cents;
      };
      try {
        lines.push({ account: text(l?.account), store: text(l?.store) || null, party: text(l?.party) || null, memo: text(l?.memo) || null, debitCents: amount("debit"), creditCents: amount("credit") });
      } catch (e) {
        return failed(`${(e as Error).message}.`);
      }
    }
    const post = str(fd, "intent") === "post";
    const j = await saveJournal(user, companyId, { date: str(fd, "date"), memo: str(fd, "memo"), post, lines });
    revalidatePath(`/books/${companyId}`, "layout");
    redirect(`/books/${companyId}/journals/${j.id}?m=${encodeURIComponent(post ? `Journal ${j.number} is posted.` : `Journal ${j.number} is saved as a draft. It posts once it's approved.`)}`);
  });
}

export async function approveJournalAction(companyId: string, journalId: string, _: ActionState): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    const j = await approveDraft(user, companyId, journalId);
    revalidatePath(`/books/${companyId}`, "layout");
    redirect(`/books/${companyId}/journals/${journalId}?m=${encodeURIComponent(`Journal ${j.number} is approved and posted.`)}`);
  });
}

export async function deleteDraftAction(companyId: string, journalId: string, _: ActionState): Promise<ActionState> {
  return booksAction(companyId, "write", async ({ user }) => {
    await deleteDraftJournal(user, companyId, journalId);
    revalidatePath(`/books/${companyId}`, "layout");
    redirect(`/books/${companyId}/journals?status=DRAFT&m=${encodeURIComponent("The draft journal is deleted.")}`);
  });
}

export async function reverseJournalAction(companyId: string, journalId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    const r = await reverseManual(user, companyId, journalId, str(fd, "date") || undefined);
    revalidatePath(`/books/${companyId}`, "layout");
    redirect(`/books/${companyId}/journals/${r.id}?m=${encodeURIComponent(`Journal ${r.number} reverses it.`)}`);
  });
}
