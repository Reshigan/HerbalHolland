"use server";
// "Email me this statement": the account's billing address gets the month's statement again (force), logged in
// HQ → Messages like every other email.
import { getTradeBuyer } from "@/server/trade/auth";
import { emailTradeStatement } from "@/server/trade/ledger";

export type EmailStatementState = { ok?: boolean; error?: string; to?: string };

export async function emailStatementAction(_: EmailStatementState, form: FormData): Promise<EmailStatementState> {
  const buyer = await getTradeBuyer();
  if (!buyer) return { error: "Your session has ended. Sign in again." };
  const month = String(form.get("month") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Unknown month" };
  const r = await emailTradeStatement(buyer.tradeAccountId, month, { force: true });
  return r.sent ? { ok: true, to: buyer.account.email } : { error: r.reason === "not approved" ? "Statements are sent once the account is approved" : `We couldn't send it just now${r.reason ? ` (${r.reason})` : ""}` };
}
