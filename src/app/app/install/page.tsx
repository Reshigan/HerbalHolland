import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Mark } from "@/components/brand/logo";
import { Steps } from "@/components/shop/phone-auth";
import { QrCode } from "@/components/shop/qr";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { ServiceWorker } from "@/components/ui/service-worker";
import { appOnly, appOnlyOpen } from "@/lib/install";
import { safePath } from "@/lib/safe-path";
import { getCustomer } from "@/server/auth";
import { APP_URL } from "@/server/email-templates";
import { AppHandshake } from "../handshake";

// The last step of joining in a browser when the shop is app only (authFlow sends new members here): install the app.
// Opened in the installed app instead, it collects the app cookie and carries on, like /app.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Install the app", robots: { index: false, follow: false } };

export default async function InstallStepPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safePath((await searchParams).next) ?? "/club";
  if (!appOnly()) redirect(next);
  const customer = await getCustomer();
  // Most pages are closed to a browser; only offer to carry on in it when the next page is one it may open.
  const onward = appOnlyOpen(new URL(next, "http://local").pathname) ? next : null;

  return (
    <div className="min-h-dvh bg-ink-950 text-ink-100">
      <main data-testid="join-install" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10 app:hidden">
        <Mark className="h-12 w-12 text-brand-500" />
        <Steps at={3} app slim />
        <div>
          {customer && (
            <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-leaf-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> You&apos;re in, {customer.firstName}. Member {customer.memberNo}
            </p>
          )}
          <h1 className="font-display text-2xl font-semibold text-white">Last step: add the app</h1>
          <p className="mt-2 text-ink-300">Your card, points, the shop and drops all live in the Herbal Holland app. It&apos;s free, takes seconds and needs no app store.</p>
        </div>
        {/* This page has no shop chrome, so it registers the worker itself: a visitor can land here straight from joining. */}
        <ServiceWorker src="/rewards-sw.js" scope="/" />
        <InstallPrompt app="rewards" variant="card" required />
        <p className="text-sm text-ink-400">Then open HH Rewards from your home screen (that is the app's icon label). If it asks, sign in with the same mobile number.</p>
        <div className="hidden items-center gap-4 rounded-2xl border border-ink-800 bg-ink-900/70 p-4 lg:flex">
          <QrCode value={`${APP_URL()}/app/install`} label="QR code to install Herbal Holland on your phone" className="h-28 w-28 shrink-0" />
          <p className="text-sm text-ink-300">On a computer? Scan this with your phone to install the app there.</p>
        </div>
        {onward && (
          <Link href={onward} className="text-sm font-semibold text-brand-400 underline underline-offset-2">
            Continue in the browser
          </Link>
        )}
      </main>
      <div className="hidden min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center app:flex">
        <Mark className="h-14 w-14 text-brand-500" />
        <AppHandshake next={next} />
      </div>
    </div>
  );
}
