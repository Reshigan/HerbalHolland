import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { readReset } from "@/server/password-reset";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password", robots: { index: false, follow: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const user = await readReset(t);
  if (!user) redirect("/login/forgot?expired=1");
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 text-brand-600" />
        <h1 className="font-display text-3xl font-semibold text-ink-950">Choose a new password</h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">Hi {user.name.split(" ")[0]}. Pick a new password for {user.email}. Every other device is signed out once it&apos;s saved.</p>
        <ResetForm token={t!} />
        <div className="mt-6 text-sm">
          <Link href="/login" className="text-ink-500 hover:text-ink-800">← Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
