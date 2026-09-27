import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { validOptOut } from "@/server/messaging";
import { Confirm } from "./confirm";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

const WHAT: Record<string, string> = { EMAIL: "marketing emails", SMS: "marketing texts", WHATSAPP: "WhatsApp marketing", PUSH: "app notifications" };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ c?: string; ch?: string; t?: string }> }) {
  const { c = "", ch = "", t = "" } = await searchParams;
  const valid = validOptOut(c, ch, t);
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 px-4 py-16 text-ink-200">
      <div className="w-full max-w-md">
        <Link href="/" aria-label="Herbal Holland home" className="mb-10 inline-block text-oranje-500">
          <Logo />
        </Link>
        <h1 className="font-display text-3xl font-semibold text-white">{valid ? `Unsubscribe from ${WHAT[ch]}` : "This link has expired"}</h1>
        <p className="mb-8 mt-3 leading-relaxed text-ink-300">
          {valid
            ? "You'll still get receipts, tax invoices and order updates. Your Herbal Holland Rewards points stay yours."
            : "Sign in to Herbal Holland Rewards to choose which messages you get, or reply STOP to any text."}
        </p>
        {valid ? <Confirm c={c} ch={ch} t={t} what={WHAT[ch]} /> : null}
        <p className="mt-8 text-sm text-ink-400">
          Change any channel in <Link href="/club" className="font-medium text-oranje-400 hover:underline">Herbal Holland Rewards</Link>.
        </p>
      </div>
    </main>
  );
}
