import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowDown, ChevronRight, Crown, Lock } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { getClasses } from "@/server/shop/access";
import { cardsWhere } from "@/server/shop/catalogue";
import { getPreferredStore } from "@/server/shop/context";
import { getDrop, isWatching } from "@/server/shop/launch";
import { watchDropAction } from "../actions";
import { Countdown } from "@/components/shop/countdown";
import { DropArt, DropFacts, DropStatus, fmtWhen } from "@/components/shop/launch-cards";
import { WatchDrop } from "@/components/shop/launch-forms";
import { ProductGrid } from "@/components/shop/product-card";
import { Callout, Container } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { fmtPoints, tierInfo, type TierKey } from "@/lib/loyalty-rules";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await db.drop.findUnique({ where: { slug: (await params).slug }, select: { name: true, blurb: true, slug: true } });
  if (!d) return { title: "Drop not found" };
  return { title: d.name, description: d.blurb.slice(0, 158), alternates: { canonical: `/drops/${d.slug}` }, openGraph: { title: `${d.name} · Herbal Holland drop`, description: d.blurb.slice(0, 158) } };
}

export default async function DropPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const customer = await getCustomer();
  const tier = (customer?.tier ?? null) as TierKey | null;
  const d = await getDrop(slug, tier);
  if (!d) notFound();
  const [classes, store, settings, watching, devices] = await Promise.all([
    getClasses(),
    getPreferredStore(),
    getSettings(),
    customer ? isWatching(d.id, customer.id) : false,
    customer ? db.pushSubscription.count({ where: { customerId: customer.id } }) : 0,
  ]);
  const cards = d.products.length ? await cardsWhere({ id: { in: d.products.map((p) => p.id) } }, classes.public, { tier, storeId: store?.id, storeName: store?.name }) : [];
  const gated = d.membersOnly && !customer;
  const open = d.phase === "live" || d.phase === "early";
  const next = `/drops/${d.slug}`;

  return (
    <Container className="pt-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-400">
        <Link href="/drops" className="hover:text-white">
          Drops
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate text-ink-200" aria-current="page">
          {d.name}
        </span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="relative overflow-hidden rounded-[2rem] border border-ink-800">
          <DropArt d={d} className="aspect-[4/3] w-full lg:aspect-square" />
          <div className="absolute left-4 top-4">
            <DropStatus d={d} overlay />
          </div>
        </div>

        <div className="lg:pt-4">
          <div className="eyebrow text-brand-500">Limited drop</div>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">{d.name}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-300">{d.blurb}</p>

          <div className="mt-8 rounded-2xl border border-ink-800 bg-ink-900/70 p-5">
            {d.phase === "upcoming" ? (
              <>
                <p className="text-sm text-ink-300">
                  Opens {tier && d.opensAt < d.startsAt ? "early for you" : ""} <strong className="text-white">{fmtWhen(d.opensAt)}</strong>
                </p>
                <Countdown to={d.opensAt} variant="blocks" label={`Opens ${fmtWhen(d.opensAt)}`} className="mt-4" />
              </>
            ) : d.phase === "early" ? (
              <p className="flex items-start gap-2 text-sm text-brand-100">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <span>
                  You&apos;re in early as a {tierInfo(tier!).name} member. It opens to everyone {fmtWhen(d.startsAt)}.
                </span>
              </p>
            ) : d.phase === "live" ? (
              <p className="text-sm text-ink-200">
                {d.left > 0 ? (
                  <>
                    <strong className="text-white">Live now</strong>
                    {d.endsAt ? ` until ${fmtWhen(d.endsAt)}` : ""}, while stock lasts.
                  </>
                ) : (
                  <>
                    <strong className="text-white">Sold out</strong>. Thank you. Turn on notifications to hear about the next one.
                  </>
                )}
              </p>
            ) : (
              <p className="text-sm text-ink-300">
                This drop ended on {fmtDate(d.endsAt!)}. Anything left sells at the usual price, with no limit.
              </p>
            )}
            <DropFacts d={d} earlyTime={d.phase === "upcoming" || d.phase === "early"} className="mt-4 border-t border-ink-800 pt-4" />
          </div>

          <div className="mt-6 space-y-3">
            {gated ? (
              <>
                <ButtonLink href={`/club/join?next=${encodeURIComponent(next)}`} size="xl" className="w-full">
                  <Lock className="h-5 w-5" /> Join free to shop the drop
                </ButtonLink>
                <p className="text-center text-sm text-ink-400">
                  Members only. Joining takes a minute and comes with {fmtPoints(settings.loyalty.signupBonus)}. Already a member?{" "}
                  <Link href={`/club/join?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-400 hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
            ) : d.phase === "upcoming" ? (
              <WatchDrop action={watchDropAction.bind(null, d.id)} signedIn={!!customer} next={next} already={watching} reach={devices ? "push" : customer?.consentSms ? "sms" : "none"} />
            ) : open && d.left > 0 ? (
              <>
                <ButtonLink href="#shop" size="xl" className="w-full">
                  Shop the drop <ArrowDown className="h-5 w-5" />
                </ButtonLink>
                <p className="text-center text-xs text-ink-450">Limit {d.perMemberLimit} per member, counting what you&apos;ve already bought from this drop.</p>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {cards.length > 0 && (
        <section id="shop" className="mt-16 scroll-mt-28" aria-labelledby="in-drop">
          <div className="eyebrow text-brand-500">{d.phase === "ended" ? "From this drop" : "In this drop"}</div>
          <h2 id="in-drop" className="mb-6 mt-2 font-display text-2xl font-semibold text-white">
            {cards.length} piece{cards.length === 1 ? "" : "s"}
          </h2>
          {gated && open && (
            <Callout tone="brand" icon={<Lock className="h-5 w-5" />} className="mb-6" title="Sign in to add these to your bag">
              Drops are for Herbal Holland Rewards members, and it&apos;s free to join.
            </Callout>
          )}
          <ProductGrid items={cards} buyable={(open && !gated) || d.phase === "ended"} />
        </section>
      )}
    </Container>
  );
}
