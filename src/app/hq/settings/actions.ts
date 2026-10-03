"use server";
// HQ → Settings: the trade (wholesale) channel's terms — minimum order, courier and handling fees, EFT hold, overdue
// grace, statement day, the terms version applicants accept, and the bank details printed on every pro forma.
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSettings, saveSetting } from "@/server/settings";
import { guard, DENIED, fail, done, type ActionState } from "@/server/hq/guard";
import { str, parseRand, parseInt10 } from "@/server/hq/form";

export async function saveTradeSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("admin");
  if (!g) return DENIED;
  const fields: Record<string, string> = {};
  const money = (k: string, max: number) => {
    const v = parseRand(str(fd, k));
    if (v == null || v < 0 || v > max) fields[k] = `R0 – R${(max / 100).toLocaleString("en-US")}`;
    return v ?? 0;
  };
  const whole = (k: string, min: number, max: number, msg: string) => {
    const v = parseInt10(str(fd, k));
    if (v == null || v < min || v > max) fields[k] = msg;
    return v ?? min;
  };
  const text = (k: string, max: number, pattern?: RegExp, msg?: string) => {
    const v = str(fd, k).slice(0, 200);
    if (v.length > max) fields[k] = `At most ${max} characters`;
    else if (v && pattern && !pattern.test(v)) fields[k] = msg ?? "Check this";
    return v;
  };
  const termsVersion = text("termsVersion", 40, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Letters, digits, dots and dashes, e.g. trade-2");
  if (!termsVersion) fields.termsVersion = "Required — applicants accept this version";
  const next = {
    minOrderCents: money("minOrder", 100_000_00),
    deliveryCents: money("courierFee", 10_000_00),
    freeDeliveryOverCents: money("freeCourierOver", 1_000_000_00),
    collectHandlingCents: money("collectHandling", 10_000_00),
    eftHoldDays: whole("eftHoldDays", 1, 30, "1 to 30 days"),
    overdueGraceDays: whole("overdueGraceDays", 0, 90, "0 to 90 days"),
    statementDay: whole("statementDay", 1, 28, "1 to 28 (every month has these days)"),
    termsVersion,
    bank: {
      bank: text("bank", 80),
      accountName: text("bankAccountName", 120),
      accountNumber: text("bankAccountNumber", 20, /^\d{6,20}$/, "6 to 20 digits").replace(/\s/g, ""),
      branchCode: text("bankBranchCode", 10, /^\d{6}$/, "A six-digit branch code"),
    },
  };
  const bankGiven = [next.bank.bank, next.bank.accountName, next.bank.accountNumber, next.bank.branchCode].filter(Boolean).length;
  if (bankGiven && bankGiven < 4) for (const k of ["bank", "bankAccountName", "bankAccountNumber", "bankBranchCode"] as const) if (!str(fd, k)) fields[k] = "Fill in all four bank details, or none";
  if (Object.keys(fields).length) return fail("Check the highlighted fields.", fields);
  const before = (await getSettings()).trade;
  if (JSON.stringify(before) === JSON.stringify(next)) return done("No changes to save.");
  await saveSetting("trade", next);
  await audit(db, g.actor, "settings.trade", { entity: "Setting", entityId: "trade", data: { before, after: next } });
  revalidatePath("/hq/settings");
  revalidatePath("/hq/trade");
  return done(`Trade settings saved — the portal, pro formas and the daily jobs use them from now on.${next.bank.accountNumber ? "" : " Fill in the bank details before the first EFT order."}`);
}
