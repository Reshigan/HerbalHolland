import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot your password", robots: { index: false, follow: false } };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 text-brand-600" />
        <h1 className="font-display text-3xl font-semibold text-ink-950">Forgot your password?</h1>
        <p className="mb-6 mt-1 text-sm text-ink-500">Enter your work email and we&apos;ll send a link to choose a new one. Member advisors who sign in at the till ask a manager for a new PIN.</p>
        {sp.expired && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">That link has expired or was already used. Ask for a new one.</p>}
        <ForgotForm />
        <div className="mt-6 text-sm">
          <Link href="/login" className="text-ink-500 hover:text-ink-800">← Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
