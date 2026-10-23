"use server";
import { redirect } from "next/navigation";
import { completeReset, readReset } from "@/server/password-reset";
import { passwordProblem } from "@/lib/password";

export type ResetState = { error?: string; field?: "next" | "confirm" };

export async function reset(_: ResetState, form: FormData): Promise<ResetState> {
  const user = await readReset(String(form.get("t") ?? ""));
  if (!user) redirect("/login/forgot?expired=1");
  const [next, confirm] = ["next", "confirm"].map((k) => String(form.get(k) ?? ""));
  const problem = passwordProblem(next, { email: user.email, name: user.name });
  if (problem) return { error: problem, field: "next" };
  if (next !== confirm) return { error: "The two passwords don't match.", field: "confirm" };
  if (!(await completeReset(user, next))) redirect("/login/forgot?expired=1");
  redirect("/login?reset=1");
}
