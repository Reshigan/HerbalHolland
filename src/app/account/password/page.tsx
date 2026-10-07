import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getStaffChangingPassword, homeFor } from "@/server/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Your password", robots: { index: false, follow: false } };

export default async function PasswordPage() {
  const user = await getStaffChangingPassword();
  if (!user) redirect("/login");
  const forced = user.mustChangePassword;
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 text-brand-600" />
        <h1 className="font-display text-3xl font-semibold text-ink-950">{forced ? "Choose your own password" : "Change your password"}</h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">
          {forced
            ? `Welcome, ${user.name.split(" ")[0]}. You signed in with a temporary password. Replace it before you continue.`
            : "You'll stay signed in here; other devices are signed out."}
        </p>
        <PasswordForm />
        <div className="mt-6 flex justify-between text-sm">
          {!forced && <Link href={await homeFor(user)} className="text-ink-500 hover:text-ink-800">← Back</Link>}
          <form action="/logout" method="post" className="ml-auto">
            <button className="text-ink-500 hover:text-ink-800">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
