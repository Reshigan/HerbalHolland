"use server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { homeFor, startSession, upgradeHash, verifySecret } from "@/server/auth";
import { NO_HASH } from "@/server/crypto";
import { audit } from "@/server/audit";
import { safePath } from "@/lib/safe-path";
import { DEMO_PASSWORD } from "@/lib/password";
import { clearFailures, IP_LOCKED, ipLocked, isLocked, recordFailure, recordIpFailure, signInKey } from "@/server/lockout";

// `email` comes back with an error: React resets the form after the action, and only the password should need retyping.
export type LoginState = { error?: string; email?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  // The demo buttons sign in with the seeded accounts' password — which no account the app sets up can have.
  const demo = process.env.DEMO_MODE === "true" && form.get("demo") === "1";
  const password = demo ? DEMO_PASSWORD : String(form.get("password") ?? "");
  const again = { email: String(form.get("email") ?? "").slice(0, 254) };

  const from = await signInKey();
  if (await ipLocked(from)) return { error: IP_LOCKED, ...again };
  const user = await db.user.findUnique({ where: { email } });
  if (user && isLocked(user, "password")) return { error: "Too many attempts. Try again in 15 minutes.", ...again };
  // An unknown email is checked against a stand-in hash, so it takes as long as a wrong password.
  const right = await verifySecret(password, user?.passwordHash ?? NO_HASH);
  if (!user?.active || !right) {
    await recordIpFailure(from);
    if (user) {
      const who = { type: "USER" as const, id: user.id, name: user.name };
      await audit(db, who, "auth.failed", { storeId: user.storeId, entity: "User", entityId: user.id, data: { reason: right ? "account switched off" : "wrong password" } });
      if (!right && (await recordFailure(user.id, "password"))) await audit(db, who, "auth.lockout", { storeId: user.storeId, entity: "User", entityId: user.id });
    }
    return { error: "That email and password don't match.", ...again };
  }
  if (user.passwordFails) await clearFailures(user.id, "password");
  if (user.mustChangePassword && user.tempPasswordUntil && user.tempPasswordUntil < new Date()) {
    await audit(db, { type: "USER", id: user.id, name: user.name }, "auth.failed", { storeId: user.storeId, entity: "User", entityId: user.id, data: { reason: "temporary password expired" } });
    return { error: "Your temporary password has expired. Ask HQ or your store owner for a new one.", ...again };
  }
  await upgradeHash(user.id, "passwordHash", user.passwordHash, password);
  await startSession("staff", { userId: user.id }, 24 * 7);
  await audit(db, { type: "USER", id: user.id, name: user.name }, demo ? "auth.demo_login" : "auth.login", { storeId: user.storeId });
  redirect(safePath(form.get("next")) ?? (await homeFor(user)));
}
