"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { homeFor, startSession, verifySecret } from "@/server/auth";
import { audit } from "@/server/audit";
import { safePath } from "@/lib/safe-path";
import { clearFailures, isLocked, recordFailure } from "@/server/lockout";

// `email` comes back with an error: React resets the form after the action, and only the password should need retyping.
export type LoginState = { error?: string; email?: string };

// Compared against when the email isn't ours, so a wrong email takes as long as a wrong password.
const NOBODY = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "");
  const demo = process.env.DEMO_MODE === "true" && form.get("demo") === "1";
  const again = { email: String(form.get("email") ?? "").slice(0, 254) };

  const user = await db.user.findUnique({ where: { email } });
  if (user && isLocked(user, "password")) return { error: "Too many attempts. Try again in 15 minutes.", ...again };
  const right = demo || verifySecret(password, user?.passwordHash ?? NOBODY);
  if (!user?.active || !right) {
    if (user && !right && (await recordFailure(user.id, "password")))
      await audit(db, { type: "USER", id: user.id, name: user.name }, "auth.lockout", { storeId: user.storeId, entity: "User", entityId: user.id });
    return { error: "That email and password don't match.", ...again };
  }
  if (user.passwordFails) await clearFailures(user.id, "password");
  await startSession("staff", { userId: user.id }, 24 * 7);
  await audit(db, { type: "USER", id: user.id, name: user.name }, demo ? "auth.demo_login" : "auth.login", { storeId: user.storeId });
  redirect(safePath(form.get("next")) ?? (await homeFor(user)));
}
