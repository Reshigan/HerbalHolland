"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { homeFor, startSession, verifySecret } from "@/server/auth";
import { audit } from "@/server/audit";

export type LoginState = { error?: string };

const attempts = new Map<string, { n: number; at: number }>();

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const demo = process.env.DEMO_MODE === "true" && form.get("demo") === "1";
  const a = attempts.get(email);
  if (a && a.n >= 8 && Date.now() - a.at < 15 * 60_000) return { error: "Too many attempts. Try again in 15 minutes." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active || (!demo && !verifySecret(password, user.passwordHash))) {
    attempts.set(email, { n: (a?.n ?? 0) + 1, at: Date.now() });
    return { error: "That email and password don't match." };
  }
  attempts.delete(email);
  await startSession("staff", { userId: user.id }, 24 * 7);
  await audit(db, { type: "USER", id: user.id, name: user.name }, demo ? "auth.demo_login" : "auth.login", { storeId: user.storeId });
  redirect(String(form.get("next") || "") || (await homeFor(user)));
}
