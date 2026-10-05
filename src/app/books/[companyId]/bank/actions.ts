"use server";
import { createBankAccount, importStatement } from "@/server/ledger/bank";
import { done, fail, type ActionState } from "@/server/store/context";
import { str } from "@/server/store/rules";
import { FORMATS, STATEMENT_MAX_BYTES, type StatementFormat } from "@/lib/bank-import";
import { plural } from "@/lib/plural";
import { fmtDate, fmtDay } from "@/lib/format";
import { act, refresh } from "./act";

export async function addBankAccount(companyId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return act(async () => {
    const a = await createBankAccount(companyId, { bank: str(fd, "bank"), name: str(fd, "name"), number: str(fd, "number"), storeId: str(fd, "storeId") || null });
    refresh(companyId, a.id);
    return done(`Added ${a.name} (ending ${a.number}). Import its statement next.`);
  });
}

/** Imports a statement into the bank account chosen on the form, or the one the page is for. */
export async function importBankStatement(companyId: string, bankAccountId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return act(async () => {
    const accountId = bankAccountId ?? str(fd, "bankAccountId");
    if (!accountId) return fail("Choose the bank account the statement is for", "bankAccountId");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return fail("Choose the statement file", "file");
    if (file.size > STATEMENT_MAX_BYTES) return fail("The file is over 5 MB — download a shorter period", "file");
    const format = (Object.keys(FORMATS) as StatementFormat[]).find((f) => f === str(fd, "format")) ?? "AUTO";
    const map = { date: str(fd, "mapDate"), description: str(fd, "mapDescription"), amount: str(fd, "mapAmount"), debit: str(fd, "mapDebit"), credit: str(fd, "mapCredit"), balance: str(fd, "mapBalance"), reference: str(fd, "mapReference") };
    const r = await importStatement(companyId, accountId, { file, format, map: format === "CSV" ? map : undefined });
    refresh(companyId, accountId);
    const parts = [
      r.added ? `${plural(r.added, "new line")} added` : "nothing new",
      r.duplicates && `${plural(r.duplicates, "line")} already imported`,
      r.matched && `${plural(r.matched, "line")} matched automatically`,
      r.skipped && `${plural(r.skipped, "balance or pending line")} left out`,
    ].filter(Boolean);
    const failed = r.failed.length ? ` ${plural(r.failed.length, "line")} couldn't be read: ${r.failed.slice(0, 3).map((f) => `row ${f.row}, ${f.error}`).join("; ")}${r.failed.length > 3 ? "; …" : ""}.` : "";
    const [from, to] = [`${r.from}T12:00:00Z`, `${r.to}T12:00:00Z`];
    return done(`Read ${plural(r.lines, "line")} (${r.from === r.to ? fmtDate(from) : `${fmtDay(from)} – ${fmtDate(to)}`}): ${parts.join(", ")}.${failed}`);
  });
}
