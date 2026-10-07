// A member's shared Rewards card: "I saved R742 with Herbal Holland Rewards" + their referral link.
import type { Metadata } from "next";
import { ArrowRight, BadgePercent, Gift, ShoppingBag, Users } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { ShopChrome } from "@/components/shop/chrome";
import { Container } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { Mark } from "@/components/brand/logo";
import { TIER_STYLE } from "@/components/shop/member-card";
import { fmtPoints } from "@/lib/loyalty-rules";
import { cn } from "@/lib/cn";
import { shareCard, type ShareQuery } from "./share-card";

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<ShareQuery> };

const DESCRIPTION = "Instant member prices in every Herbal Holland store and online, points on every rand and first go at drops. Free to join, adults 18+.";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ ref }, sp] = await Promise.all([params, searchParams]);
  const card = shareCard(ref, sp);
  const title = card ? card.about : "Join Herbal Holland Rewards";
  const image = `/s/${encodeURIComponent(ref)}/card${card ? `?${card.query}` : ""}`;
  return {
    title: { absolute: title },
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: { title, description: DESCRIPTION, type: "website", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION, images: [image] },
  };
}

export default async function SharePage({ params, searchParams }: Props) {
  const [{ ref }, sp] = await Promise.all([params, searchParams]);
  const card = shareCard(ref, sp);
  const [settings, customer] = await Promise.all([getSettings(), getCustomer()]);
  const l = settings.loyalty;
  const join = `/club/join?ref=${encodeURIComponent(ref)}`;
  const style = TIER_STYLE[card?.tierIndex ?? 3];

  return (
    <ShopChrome>
      <Container className="pt-10 sm:pt-16">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
          {/* The card, as it appears when shared */}
          <div className="hh-frame relative flex aspect-[1200/630] w-full items-center overflow-hidden px-5 sm:px-10">
            <Mark aria-hidden className="absolute -right-4 top-1/2 h-[78%] w-auto -translate-y-1/2 text-brand-500 sm:right-6" />
            <div className="relative max-w-[70%]">
              <div className="eyebrow text-[0.6rem] text-brand-500 sm:text-xs">Herbal Holland Rewards</div>
              {card ? (
                <>
                  <p className="mt-2 font-display text-[1.7rem] font-semibold leading-[1.02] tracking-tight text-white sm:mt-4 sm:text-5xl">{card.headline}</p>
                  <p className="mt-1 text-xs text-ink-300 sm:mt-2 sm:text-lg">{card.saved ? "with Herbal Holland Rewards" : "of Herbal Holland Rewards"}</p>
                  <span className={cn("mt-3 inline-block rounded-full px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider sm:mt-5 sm:text-xs", style.chip)}>{card.tierName}</span>
                </>
              ) : (
                <p className="mt-2 font-display text-[1.7rem] font-semibold leading-[1.02] tracking-tight text-white sm:mt-4 sm:text-5xl">
                  Pay less.
                  <br />
                  <span className="text-brand-500">Earn more.</span>
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="eyebrow text-brand-500">{card ? `An invite from ${card.firstName}` : "Herbal Holland Rewards"}</div>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">{card ? card.about : "Pay less. Earn more."}</h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-300">
              Members pay less instantly ({l.tierSavingsPct.SEED}% off from day one, up to {l.tierSavingsPct.HARVEST}% at Harvest) and earn {l.earnPer100} points for every R100, each worth R1. Free to join, adults 18+.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-ink-200">
              {[
                [<Gift key="g" className="h-4 w-4" />, `${fmtPoints(l.signupBonus)} when you join`],
                [<Users key="u" className="h-4 w-4" />, `${fmtPoints(l.referralBonus)} each for you${card ? ` and ${card.firstName}` : ""} after your first purchase`],
                [<BadgePercent key="b" className="h-4 w-4" />, "Member prices in every store and online"],
                [<ShoppingBag key="s" className="h-4 w-4" />, "First go at limited drops"],
              ].map(([icon, text]) => (
                <li key={String(text)} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400">{icon}</span>
                  {text}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={customer ? "/club" : join} size="xl">
                {customer ? "Open your Rewards card" : card ? `Join with ${card.firstName}'s link` : "Join free"} <ArrowRight className="h-5 w-5" />
              </ButtonLink>
              <ButtonLink href="/shop" variant="outline-dark" size="xl">
                Browse the shop
              </ButtonLink>
            </div>
            {customer && <p className="mt-3 text-sm text-ink-400">You&apos;re already a member, {customer.firstName}. Invite links are for new members.</p>}
          </div>
        </div>
      </Container>
    </ShopChrome>
  );
}
