import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, ChevronDown, Download, Gift, MapPin, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { CONSENT_WORDING } from "@/server/customers";
import { foundingTaken, launchState } from "@/server/launch";
import { foundingPlaces } from "@/server/shop/launch-rules";
import { getPreferredStore, getRetailStores, homeStoreOptions } from "@/server/shop/context";
import { PhoneAuth } from "@/components/shop/phone-auth";
import { Container, Panel, Tag } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { Mark } from "@/components/brand/logo";
import { fmtPoints, tierInfo } from "@/lib/loyalty-rules";
import { fmtDate, num } from "@/lib/format";
import { safePath } from "@/lib/safe-path";
import { displayPhone } from "@/lib/sa";
import { partnerArrival, partnerOffers } from "@/server/partners";
import { appOnly } from "@/lib/install";
import { turnstileSiteKey } from "@/server/turnstile";

export const metadata: Metadata = {
  title: { absolute: "Join Herbal Holland Rewards" },
  description: "Join Herbal Holland Rewards free with your mobile number (adults 18+). Earn points in every store and in the app.",
  robots: { index: true, follow: true },
};

type SP = { ref?: string; store?: string; next?: string; src?: string; partner?: string; t?: string };

export default async function JoinPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const next = safePath(sp.next) ?? "/club";
  const [customer, settings, stores, preferred, launch, taken] = await Promise.all([getCustomer(), getSettings(), getRetailStores(), getPreferredStore(), launchState(), foundingTaken()]);
  const trading = stores.filter((s) => s.status === "ACTIVE");
  const pre = launch.preLaunch && launch.at ? launch.at : null;
  const places = pre ? foundingPlaces({ cap: launch.foundingCap, taken, firstYearMonths: launch.firstYearMonths, tierName: tierInfo(launch.foundingTier).name, closes: fmtDate(pre) }) : null;

  if (customer)
    return (
      <Container className="max-w-xl pt-16 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-leaf-500" />
        <h1 className="mt-4 font-display text-3xl font-semibold text-white">You&apos;re signed in, {customer.firstName}</h1>
        <p className="mt-2 text-ink-400">Member {customer.memberNo}</p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href={next} size="lg">
            Continue
          </ButtonLink>
          <ButtonLink href="/club" variant="outline-dark" size="lg">
            Your card
          </ButtonLink>
        </div>
      </Container>
    );

  const arrival = await partnerArrival(sp.partner, sp.t);
  const [referrer, qrStore, shareOffers] = await Promise.all([
    sp.ref ? db.customer.findUnique({ where: { referralCode: sp.ref.trim().toUpperCase() }, select: { firstName: true, referralCode: true } }) : null,
    sp.store ? stores.find((s) => s.code === sp.store?.toUpperCase()) ?? null : null,
    partnerOffers(arrival?.partner.id),
  ]);
  const home = qrStore ?? preferred;

  const invited = arrival ? `Welcome from ${arrival.partner.name}` : referrer ? `${referrer.firstName} invited you` : null;
  const lead =
    pre && places
      ? `${places.lead} ${places.full ? "" : `Founding Members get a numbered card and start at ${tierInfo(launch.foundingTier).name} for ${launch.foundingMonths} months.`}${
          referrer ? ` Joining with ${referrer.firstName}'s link moves them up ${num(launch.referralBoost)} places, and you'll both get ${fmtPoints(settings.loyalty.referralBonus)} after your first purchase.` : ""
        }`
      : referrer
        ? `Join Herbal Holland Rewards free. After your first purchase you'll both get ${fmtPoints(settings.loyalty.referralBonus)}, on top of your ${fmtPoints(settings.loyalty.signupBonus)} welcome bonus.`
        : `Free, no passwords and no plastic. Your card lives on your phone and works in ${trading.length > 1 ? `all ${trading.length} stores` : "every store"} and in the app.`;

  const detail = (
    <>
      <ul className="mt-10 space-y-4 text-sm">
        {[
          [<Smartphone key="s" className="h-5 w-5" />, "Confirm your mobile number with a one-time code"],
          [<ShieldCheck key="i" className="h-5 w-5" />, "Add your date of birth: we're adults-only by law"],
          [<Gift key="g" className="h-5 w-5" />, `Start earning: ${fmtPoints(settings.loyalty.signupBonus)} are yours the moment you join`],
          ...(appOnly() ? [[<Download key="a" className="h-5 w-5" />, "Add the app to your home screen: we show you how, it takes seconds"]] : []),
        ].map(([icon, t], i) => (
          <li key={i} className="flex items-center gap-4 text-ink-200">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500/10 text-brand-400">{icon}</span>
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-10 max-w-lg text-xs leading-relaxed text-ink-450">
        We ask only what we need: your number to sign you in, your age to keep things legal, and an email address if you&apos;d like invoices by email. Marketing is opt-in, per channel, and you can change it any time.{" "}
        <Link href="/legal/privacy" className="underline hover:text-ink-300">
          Privacy notice
        </Link>
        {" · "}
        <Link href="/trade/login" className="underline hover:text-ink-300">
          Trade sign-in
        </Link>
      </p>
    </>
  );

  return (
    <Container className="pt-5 max-sm:pb-40 sm:pt-16">
      {/* Phones get an app screen: a one-line title, the form with its button pinned to the bottom, the detail folded away. Desktop keeps the two columns. */}
      <div className="grid grid-cols-1 gap-5 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_30rem] lg:grid-rows-[auto_1fr] lg:gap-x-16 lg:gap-y-0">
        <div className="lg:col-start-1 lg:pt-6">
          <Mark className="hidden h-14 w-14 text-brand-500 sm:block" />
          <h1 className="font-display text-3xl sm:mt-6 sm:text-5xl font-semibold leading-[1] tracking-tight text-white">
            {invited ?? (
              <>
                <span className="sm:hidden">Join free in a minute</span>
                <span className="max-sm:hidden">{places?.full ? "Become a First Year Member." : pre ? "Become a Founding Member." : "Join in a minute."}</span>
              </>
            )}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 empty:hidden sm:hidden">
            {places && (
              <Tag tone="orange" icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />} className="gap-1.5 px-3 py-1 text-xs">
                {places.chip}
              </Tag>
            )}
            {qrStore && (
              <Tag tone="orange" icon={<MapPin className="h-3.5 w-3.5" aria-hidden />} className="gap-1.5 px-3 py-1 text-xs">
                Joining at Herbal Holland {qrStore.name}
              </Tag>
            )}
          </div>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-300 max-sm:hidden">{lead}</p>
        </div>
        <div className="max-lg:order-3 max-sm:hidden lg:col-start-1 lg:row-start-2">
          {qrStore && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm text-brand-200">
              <MapPin className="h-4 w-4" /> Joining at Herbal Holland {qrStore.name}
            </p>
          )}
          {detail}
        </div>
        <details className="group order-3 sm:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-brand-300 [&::-webkit-details-marker]:hidden">
            What you get <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">{lead}</p>
          <div className="[&>ul]:mt-6 [&>p:last-child]:mt-6">{detail}</div>
        </details>
        <Panel className="h-fit max-lg:order-2 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <PhoneAuth turnstileSiteKey={turnstileSiteKey()}
            next={next}
            stores={homeStoreOptions(stores)}
            defaultStoreId={home?.id}
            referral={referrer ? { code: referrer.referralCode, name: referrer.firstName } : null}
            src={sp.src}
            consentWording={CONSENT_WORDING}
            partner={arrival ? { slug: arrival.partner.slug, name: arrival.partner.name, token: arrival.member ? sp.t : undefined } : null}
            defaultPhone={arrival?.member ? displayPhone(arrival.member.phone) : undefined}
            shareOffers={shareOffers}
            installStep={appOnly()}
            appScreen
            title="Your mobile number"
            intro="New or already a member? Enter your number: new members join, members sign straight in."
          />
        </Panel>
      </div>
    </Container>
  );
}
