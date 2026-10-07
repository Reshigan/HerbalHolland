"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { COOKIE, getStaffChangingPassword, homeFor, verifySecret } from "@/server/auth";
import { hashSecret, sha256 } from "@/server/crypto";
import { audit } from "@/server/audit";
import { isLocked, recordFailure } from "@/server/lockout";
import { passwordProblem } from "@/lib/password";

export type PasswordState = { error?: string; field?: "current" | "next" | "confirm" };

export async function changePassword(_: PasswordState, form: FormData): Promise<PasswordState> {
  const user = await getStaffChangingPassword();
  if (!user) redirect("/login");
  const [current, next, confirm] = ["current", "next", "confirm"].map((k) => String(form.get(k) ?? ""));
  // Wrong current passwords count towards the same lockout as signing in.
  if (isLocked(user, "password")) return { error: "Too many wrong passwords. Try again in 15 minutes.", field: "current" };
  if (!(await verifySecret(current, user.passwordHash))) {
    if (await recordFailure(user.id, "password"))
      await audit(db, { type: "USER", id: user.id, name: user.name }, "auth.lockout", { storeId: user.storeId, entity: "User", entityId: user.id, data: { via: "password change" } });
    return { error: "Your current password isn't right.", field: "current" };
  }
  const problem = passwordProblem(next, { email: user.email, name: user.name });
  if (problem) return { error: problem, field: "next" };
  if (next === current) return { error: "Choose a new password, not the one you were given.", field: "next" };
  if (next !== confirm) return { error: "The two new passwords don't match.", field: "confirm" };
  const token = (await cookies()).get(COOKIE.staff)?.value ?? "";
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashSecret(next), mustChangePassword: false, tempPasswordUntil: null, passwordFails: 0, passwordLockedAt: null },
    }),
    db.session.deleteMany({ where: { userId: user.id, id: { not: sha256(token) } } }), // sign out everywhere else
  ]);
  await audit(db, { type: "USER", id: user.id, name: user.name }, "auth.password_change", { storeId: user.storeId });
  redirect(await homeFor(user));
}
