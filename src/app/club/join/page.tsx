import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, Gift, MapPin, ShieldCheck, Smartphone } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { CONSENT_WORDING } from "@/server/customers";
import { launchState } from "@/server/launch";
import { getPreferredStore, getRetailStores, homeStoreOptions } from "@/server/shop/context";
import { PhoneAuth } from "@/components/shop/phone-auth";
import { Container, Panel } from "@/components/shop/ui";
import { ButtonLink } from "@/components/ui/button";
import { Mark } from "@/components/brand/logo";
import { fmtPoints, tierInfo } from "@/lib/loyalty-rules";
import { fmtDate, num } from "@/lib/format";

export const metadata: Metadata = {
  title: { absolute: "Join Herbal Holland Rewards" },
  description: "Join Herbal Holland Rewards with your mobile number — free, adults 18+. Earn points in every store and online.",
  robots: { index: true, follow: true },
};

type SP = { ref?: string; store?: string; next?: string; src?: string };

export default async function JoinPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/club";
  const [customer, settings, stores, preferred, launch] = await Promise.all([getCustomer(), getSettings(), getRetailStores(), getPreferredStore(), launchState()]);
  const trading = stores.filter((s) => s.status === "ACTIVE");
  const pre = launch.preLaunch && launch.at ? launch.at : null;

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

  const [referrer, qrStore] = await Promise.all([
    sp.ref ? db.customer.findUnique({ where: { referralCode: sp.ref.trim().toUpperCase() }, select: { firstName: true, referralCode: true } }) : null,
    sp.store ? stores.find((s) => s.code === sp.store?.toUpperCase()) ?? null : null,
  ]);
  const home = qrStore ?? preferred;

  return (
    <Container className="pt-10 sm:pt-16">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-16">
        <div className="lg:pt-6">
          <Mark className="h-14 w-14 text-brand-500" />
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1] tracking-tight text-white">
            {referrer ? `${referrer.firstName} invited you` : pre ? "Become a Founding Member." : "Join in a minute."}
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-300">
            {pre
              ? `The Founding Members list closes ${fmtDate(pre)}. The first ${num(launch.foundingCap)} members on it get a numbered card and start at ${tierInfo(launch.foundingTier).name} for ${launch.foundingMonths} months.${
                  referrer ? ` Joining with ${referrer.firstName}'s link moves them up ${num(launch.referralBoost)} places — and you'll both get ${fmtPoints(settings.loyalty.referralBonus)} after your first purchase.` : ""
                }`
              : referrer
                ? `Join Herbal Holland Rewards free. After your first purchase you'll both get ${fmtPoints(settings.loyalty.referralBonus)} — on top of your ${fmtPoints(settings.loyalty.signupBonus)} welcome bonus.`
                : `Free, no passwords and no plastic. Your card lives on your phone and works in ${trading.length > 1 ? `all ${trading.length} stores` : "every store"} and online.`}
          </p>
          {qrStore && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm text-brand-200">
              <MapPin className="h-4 w-4" /> Joining at Herbal Holland {qrStore.name}
            </p>
          )}
          <ul className="mt-10 space-y-4 text-sm">
            {[
              [<Smartphone key="s" className="h-5 w-5" />, "Confirm your mobile number with a one-time code"],
              [<ShieldCheck key="i" className="h-5 w-5" />, "Add your SA ID number (or passport date of birth) — we're adults-only by law"],
              [<Gift key="g" className="h-5 w-5" />, `Start earning — ${fmtPoints(settings.loyalty.signupBonus)} are yours the moment you join`],
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
          </p>
        </div>
        <Panel className="h-fit p-6 sm:p-8">
          <PhoneAuth
            next={next}
            stores={homeStoreOptions(stores)}
            defaultStoreId={home?.id}
            referral={referrer ? { code: referrer.referralCode, name: referrer.firstName } : null}
            src={sp.src}
            consentWording={CONSENT_WORDING}
            title="Your mobile number"
            intro="Already a member? We'll sign you straight in."
          />
        </Panel>
      </div>
    </Container>
  );
}
