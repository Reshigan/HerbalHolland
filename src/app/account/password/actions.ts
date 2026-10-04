"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { COOKIE, getStaffChangingPassword, homeFor, verifySecret } from "@/server/auth";
import { hashSecret, sha256 } from "@/server/crypto";
import { audit } from "@/server/audit";

export type PasswordState = { error?: string; field?: "current" | "next" | "confirm" };

export async function changePassword(_: PasswordState, form: FormData): Promise<PasswordState> {
  const user = await getStaffChangingPassword();
  if (!user) redirect("/login");
  const [current, next, confirm] = ["current", "next", "confirm"].map((k) => String(form.get(k) ?? ""));
  if (!verifySecret(current, user.passwordHash)) return { error: "Your current password isn't right.", field: "current" };
  if (next.length < 10) return { error: "Use at least 10 characters.", field: "next" };
  if (next === current) return { error: "Choose a new password — not the one you were given.", field: "next" };
  if (next !== confirm) return { error: "The two new passwords don't match.", field: "confirm" };
  const token = (await cookies()).get(COOKIE.staff)?.value ?? "";
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: hashSecret(next), mustChangePassword: false } }),
    db.session.deleteMany({ where: { userId: user.id, id: { not: sha256(token) } } }), // sign out everywhere else
  ]);
  await audit(db, { type: "USER", id: user.id, name: user.name }, "auth.password_change", { storeId: user.storeId });
  redirect(await homeFor(user));
}
