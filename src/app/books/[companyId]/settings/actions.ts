"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addAccountant, booksAction, done, failed, importOpeningBalances, resetAccountantPassword, saveBooksSettings, setAccountantActive, type ActionState } from "@/server/ledger/admin";
import { TEMP_PASSWORD_HOURS } from "@/server/passwords";
import { OPENING_MAX_BYTES } from "@/lib/ledger-admin";
import { bool, str } from "@/server/store/rules";

const settingsPath = (companyId: string) => `/books/${companyId}/settings`;

export async function saveSettingsAction(companyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    const changed = await saveBooksSettings(user, companyId, { vatCategory: str(fd, "vatCategory") || null, yearEndMonth: Number(str(fd, "yearEndMonth")) });
    revalidatePath(`/books/${companyId}`, "layout");
    return done(changed ? "Saved." : "Nothing changed.");
  });
}

export async function addAccountantAction(companyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    const { accountant, password } = await addAccountant(user, companyId, { name: str(fd, "name"), email: str(fd, "email") });
    revalidatePath(settingsPath(companyId));
    return done(`${accountant.name} can now sign in as ${accountant.email} with the temporary password  ${password}  — share it privately (it isn't shown again). They choose their own password when they first sign in, within ${TEMP_PASSWORD_HOURS} hours, and see these books only.`);
  });
}

export async function setAccountantActiveAction(companyId: string, accountantId: string, active: boolean, _: ActionState): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    const u = await setAccountantActive(user, companyId, accountantId, active);
    revalidatePath(settingsPath(companyId));
    redirect(`${settingsPath(companyId)}?m=${encodeURIComponent(active ? `${u.name} can sign in again.` : `${u.name} is signed out everywhere and can no longer sign in.`)}`);
  });
}

export async function resetAccountantPasswordAction(companyId: string, accountantId: string, _: ActionState): Promise<ActionState> {
  return booksAction(companyId, "approve", async ({ user }) => {
    const { accountant, password } = await resetAccountantPassword(user, companyId, accountantId);
    return done(`New temporary password for ${accountant.name}:  ${password}  — share it privately. They choose their own when they sign in, within ${TEMP_PASSWORD_HOURS} hours.`);
  });
}

/** An opening trial balance as CSV: posted for those who approve, a draft for the owner otherwise. */
export async function importOpeningAction(companyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return booksAction(companyId, "write", async ({ user }) => {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return failed("Choose the CSV file with the opening balances", "file");
    if (file.size > OPENING_MAX_BYTES) return failed("That file is over 1 MB — is it the trial balance, saved as CSV?", "file");
    if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) return failed("Save the trial balance as CSV (comma separated) and choose that file", "file");
    const r = await importOpeningBalances(user, companyId, { text: await file.text(), date: str(fd, "date"), addToExisting: bool(fd, "add") });
    revalidatePath(`/books/${companyId}`, "layout");
    const what = `${r.rows} ${r.rows === 1 ? "balance" : "balances"}${r.skipped ? ` (${r.skipped} empty ${r.skipped === 1 ? "row" : "rows"} skipped)` : ""}`;
    redirect(`/books/${companyId}/journals/${r.journal.id}?m=${encodeURIComponent(r.posted ? `Opening balances posted: ${what}.` : `Opening balances saved as a draft: ${what}. They post once approved.`)}`);
  });
}
