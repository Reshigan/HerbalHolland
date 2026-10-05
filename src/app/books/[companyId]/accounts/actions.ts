"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { booksAction, createAccount, done, renameAccount, setAccountActive, type ActionState } from "@/server/ledger/admin";
import { str } from "@/server/store/rules";

const refresh = (companyId: string) => revalidatePath(`/books/${companyId}`, "layout");

export async function addAccountAction(companyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return booksAction(companyId, "write", async ({ user }) => {
    const a = await createAccount(user, companyId, { code: str(fd, "code"), name: str(fd, "name"), type: str(fd, "type") });
    refresh(companyId);
    return done(`${a.code} ${a.name} is in the chart.`);
  });
}

export async function renameAccountAction(companyId: string, accountId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return booksAction(companyId, "write", async ({ user }) => {
    const a = await renameAccount(user, companyId, accountId, { name: str(fd, "name") });
    refresh(companyId);
    return done(`Renamed ${a.code}.`);
  });
}

export async function retypeAccountAction(companyId: string, accountId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return booksAction(companyId, "write", async ({ user }) => {
    const a = await renameAccount(user, companyId, accountId, { type: str(fd, "type") });
    refresh(companyId);
    return done(`${a.code} ${a.name} is now ${a.type.toLowerCase()}.`);
  });
}

export async function setAccountActiveAction(companyId: string, accountId: string, active: boolean, _: ActionState): Promise<ActionState> {
  return booksAction(companyId, "write", async ({ user }) => {
    const a = await setAccountActive(user, companyId, accountId, active);
    refresh(companyId);
    // The button changes with the account, so the confirmation comes back as a one-time message on the page.
    redirect(`/books/${companyId}/accounts?m=${encodeURIComponent(active ? `${a.code} ${a.name} is switched on.` : `${a.code} ${a.name} is switched off.`)}`);
  });
}
