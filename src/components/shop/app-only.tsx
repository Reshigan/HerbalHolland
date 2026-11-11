// Herbal Holland is app only: the proxy sends a browser to /app, which shows this screen with the way to install.
// Android and desktop installs share cookies with the browser, so once the app is installed the `hh_app` cookie lets
// that browser past the proxy too; the wall stays in the layouts for that case. Switched on by APP_ONLY=true
// (wrangler.jsonc); the pages a browser may still open are in appOnlyOpen.
import Link from "next/link";
import { Mark } from "@/components/brand/logo";
import { InstallPrompt } from "@/components/ui/install-prompt";
import { ServiceWorker } from "@/components/ui/service-worker";
import { APP_URL } from "@/server/email-templates";
import { AppOnlyGate } from "./app-only-gate";
import { QrCode } from "./qr";

export function AppOnlyWall() {
  return (
    <AppOnlyGate>
      <AppOnlyScreen />
    </AppOnlyGate>
  );
}

export function AppOnlyScreen() {
  return (
    <main data-testid="app-only" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10">
      <Mark className="h-12 w-12 text-brand-500" />
      <div>
        <h1 className="font-display text-2xl font-semibold text-white">Herbal Holland lives in the app</h1>
        <p className="mt-2 text-ink-300">The shop, your Rewards card, drops and orders are all in the app. Install it to carry on. Adults 18+.</p>
      </div>
      {/* /app renders without the shop chrome, so the worker (an install criterion in older Chrome) is registered here too. */}
      <ServiceWorker src="/rewards-sw.js" scope="/" />
      <InstallPrompt app="rewards" variant="card" required />
      <div className="hidden items-center gap-4 rounded-2xl border border-ink-800 bg-ink-900/70 p-4 lg:flex">
        <QrCode value={`${APP_URL()}/club`} label="QR code to open Herbal Holland on your phone" className="h-28 w-28 shrink-0" />
        <p className="text-sm text-ink-300">On a computer? Scan this with your phone to install the app there.</p>
      </div>
      <p className="text-sm text-ink-400">
        New here?{" "}
        <Link href="/club/join" className="font-semibold text-brand-400 underline underline-offset-2">
          Join Rewards
        </Link>{" "}
        first: it takes a minute, and we&apos;ll walk you through adding the app at the end.
      </p>
    </main>
  );
}
