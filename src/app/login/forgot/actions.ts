"use server";
import { IP_LOCKED, ipLocked, recordIpFailure, signInKey } from "@/server/lockout";
import { requestReset, RESET_SENT } from "@/server/password-reset";

export type ForgotState = { error?: string; sent?: string };

export async function forgot(_: ForgotState, form: FormData): Promise<ForgotState> {
  const from = (await signInKey()).replace("signin-ip:", "reset-ip:");
  if (await ipLocked(from)) return { error: IP_LOCKED };
  await recordIpFailure(from); // every request counts, so one address can't flood a colleague's inbox
  await requestReset(String(form.get("email") ?? ""));
  return { sent: RESET_SENT };
}
