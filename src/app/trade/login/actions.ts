"use server";
// Sign-in by email code: send (requestTradeCode; in DEMO_MODE the code comes back for the form to show), verify
// (signInWithTradeCode starts the hh_trade session), restart. Problems land on the field they concern.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestTradeCode, signInWithTradeCode, TradeAuthError } from "@/server/trade/auth";
import { clientIpFrom } from "@/lib/client-ip";
import { safeTradeNext } from "../_lib/context";

export type LoginState = {
  step: "email" | "code";
  email?: string;
  demoCode?: string;
  error?: string;
  fields?: { email?: string; code?: string };
};

export async function loginFlow(prev: LoginState, form: FormData): Promise<LoginState> {
  const intent = String(form.get("intent") ?? "");
  const next = safeTradeNext(form.get("next")) ?? "/trade/range";

  if (intent === "restart") return { step: "email" };

  if (intent === "send") {
    const raw = String(form.get("email") ?? prev.email ?? "");
    try {
      const r = await requestTradeCode(raw, { ip: clientIpFrom(await headers()) });
      return { step: "code", email: r.email, demoCode: r.demoCode };
    } catch (e) {
      if (e instanceof TradeAuthError) return prev.step === "code" ? { ...prev, error: e.message, fields: undefined } : { step: "email", fields: { email: e.message } };
      throw e;
    }
  }

  if (intent === "verify") {
    const email = prev.email ?? String(form.get("email") ?? "");
    const code = String(form.get("code") ?? "").replace(/\D/g, "");
    if (code.length !== 6) return { ...prev, step: "code", email, error: undefined, fields: { code: "Enter the 6-digit code from your email" } };
    try {
      await signInWithTradeCode(email, code);
    } catch (e) {
      if (e instanceof TradeAuthError) return { ...prev, step: "code", email, error: undefined, fields: { code: e.message } };
      throw e;
    }
    redirect(next);
  }

  return prev;
}
