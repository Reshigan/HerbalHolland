import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { getTradeBuyer } from "@/server/trade/auth";
import { TradeLogin } from "@/components/trade/login-form";
import { Container, Panel } from "@/components/shop/ui";
import { LOGIN } from "@/components/trade/copy";
import { safeTradeNext } from "../_lib/context";
import { isEmail } from "@/lib/email";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function TradeLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const [sp, buyer] = await Promise.all([searchParams, getTradeBuyer()]);
  const next = safeTradeNext(sp.next);
  if (buyer) redirect(next ?? "/trade/range");
  const email = sp.email && isEmail(sp.email) ? sp.email : null;
  return (
    <Container className="grid grid-cols-1 gap-10 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      <div>
        <div className="eyebrow text-brand-500">Herbal Holland Trade</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Trade sign-in</h1>
        <Panel className="mt-8 p-6 sm:p-8">
          <TradeLogin next={next} email={email} />
        </Panel>
        <p className="mt-4 text-sm text-ink-400">
          No account yet?{" "}
          <Link href="/trade/apply" className="font-semibold text-brand-400 underline hover:text-brand-300">
            Apply for a trade account
          </Link>
          .
        </p>
      </div>
      <aside className="lg:pt-24" aria-labelledby="states">
        <h2 id="states" className="flex items-center gap-2 font-display text-lg font-semibold text-white">
          <CircleHelp className="h-5 w-5 text-brand-500" aria-hidden /> What you&apos;ll see after signing in
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-300">
          {LOGIN.states.map((s) => (
            <li key={s} className="rounded-xl border border-ink-800 bg-ink-900/60 px-4 py-3">
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-400">Sessions last 12 hours. Adults 18+ only.</p>
      </aside>
    </Container>
  );
}
