import Link from "next/link";
import type { Metadata } from "next";
import { Bell, Crown, Lock, ShoppingBag } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { listDrops } from "@/server/shop/launch";
import { DropCardView } from "@/components/shop/launch-cards";
import { Reveal } from "@/components/shop/motion";
import { Callout, Container, Pager } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { pageParam } from "@/components/ui/pagination";
import { fmtPoints, type TierKey } from "@/lib/loyalty-rules";

export const metadata: Metadata = {
  title: "Drops",
  description: "Limited runs of Herbal Holland apparel, accessories and CBD wellness: Rewards members first, early access for top tiers, a fair limit per member. Adults 18+.",
  alternates: { canonical: "/drops" },
};

const PAST = 12;

export default async function DropsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageParam((await searchParams).page);
  const [customer, settings] = await Promise.all([getCustomer(), getSettings()]);
  const { live, upcoming, past, pastTotal } = await listDrops((customer?.tier ?? null) as TierKey | null, page, PAST);
  const none = !live.length && !upcoming.length && !pastTotal;

  return (
    <Container className="pt-10 sm:pt-14">
      <div className="max-w-2xl">
        <div className="eyebrow text-brand-500">Drops</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Limited runs. Members first.</h1>
        <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-300">
          Small batches of windmill apparel, accessories and CBD wellness, released on a date. Rewards members get in, top tiers get in early, and a fair limit per member means more of you get one.
        </p>
      </div>
      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-300">
        <li className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-brand-400" /> Members only
        </li>
        <li className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-brand-400" /> Early access by tier
        </li>
        <li className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-brand-400" /> Limits checked online and at the till
        </li>
        <li className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-brand-400" /> “Notify me” by app or SMS
        </li>
      </ul>

      {!customer && !none && (
        <Callout tone="brand" className="mt-8" title="Drops are for Herbal Holland Rewards members">
          Join free in a minute and you&apos;ll get {fmtPoints(settings.loyalty.signupBonus)} to start, member prices from day one and first go at every drop.{" "}
          <Link href="/club/join?next=/drops" className="font-semibold text-white underline">
            Join free
          </Link>
        </Callout>
      )}

      {none && (
        <div className="mx-auto mt-12 max-w-lg rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
          <Bell className="mx-auto h-10 w-10 text-brand-500" strokeWidth={1.5} />
          <h2 className="mt-5 font-display text-2xl font-semibold text-white">No drops right now</h2>
          <p className="mx-auto mt-3 max-w-sm text-ink-400">The next one is in the works. Turn on app notifications in Rewards and you&apos;ll hear first.</p>
          <ButtonLink href={customer ? "/club/settings#notifications" : "/club/join?next=/drops"} size="lg" className="mt-8">
            {customer ? "Turn on notifications" : "Join Rewards free"}
          </ButtonLink>
        </div>
      )}

      {live.length > 0 && (
        <section className="mt-12" aria-labelledby="live">
          <h2 id="live" className="font-display text-2xl font-semibold text-white">
            Live now
          </h2>
          <Reveal stagger className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {live.map((d) => (
              <DropCardView key={d.id} d={d} />
            ))}
          </Reveal>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mt-14" aria-labelledby="soon">
          <h2 id="soon" className="font-display text-2xl font-semibold text-white">
            Coming up
          </h2>
          <p className="mt-1 text-sm text-ink-400">Countdowns show when each drop opens for you.</p>
          <Reveal stagger className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((d) => (
              <DropCardView key={d.id} d={d} />
            ))}
          </Reveal>
        </section>
      )}

      {pastTotal > 0 && (
        <section id="past" className="mt-14 scroll-mt-28" aria-labelledby="past-title">
          <h2 id="past-title" className="font-display text-2xl font-semibold text-white">
            Past drops
          </h2>
          <p className="mt-1 text-sm text-ink-400">Anything left from a past drop sells at the usual price, with no limit.</p>
          <Reveal stagger className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {past.map((d) => (
              <DropCardView key={d.id} d={d} />
            ))}
          </Reveal>
          <Pager page={page} pageSize={PAST} total={pastTotal} href={(p) => `/drops?page=${p}#past`} noun="past drops" />
        </section>
      )}
    </Container>
  );
}
