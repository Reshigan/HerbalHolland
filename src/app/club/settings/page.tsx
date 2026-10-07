import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, BadgePercent, Bell, LogOut, ShieldCheck } from "lucide-react";
import { db } from "@/server/db";
import { getCustomer } from "@/server/auth";
import { vapidPublicKey } from "@/server/push";
import { signOut } from "@/server/shop/actions";
import { consentTrail } from "@/server/shop/club";
import { getFranchisor, getRetailStores, homeStoreOptions } from "@/server/shop/context";
import { disablePush, enablePush, setChannelConsent, setPersonalisedOffers } from "../actions";
import { ConsentToggles } from "@/components/shop/club-client";
import { PrefSwitch } from "@/components/shop/launch-forms";
import { PushToggle } from "@/components/shop/push-toggle";
import { ProfileForm } from "@/components/shop/profile-form";
import { VerifyAge } from "@/components/shop/verify-age";
import { Container, Panel } from "@/components/shop/ui";
import { buttonClass } from "@/components/ui/button";
import { displayPhone } from "@/lib/sa";
import { fmtDate } from "@/lib/format";
import { contactEmailOf, legalNameOf } from "@/lib/contact";

export const metadata = { title: "Settings" };

const SOURCE: Record<string, string> = { SIGNUP_WEB: "when you joined online", WEB: "when you joined online", REFERRAL: "when you joined", POS: "in store", CLUB_APP: "in Rewards settings", STOP_REPLY: "by replying STOP", ADMIN: "by our team" };
const AGE: Record<string, string> = { ID_NUMBER: "SA ID number checked", ID_SIGHTED: "ID sighted in store", VERIFIED: "Verified with Home Affairs", NONE: "Not verified" };

export default async function ClubSettings() {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/settings");
  const [trail, stores, company, devices] = await Promise.all([consentTrail(customer.id), getRetailStores(), getFranchisor(), db.pushSubscription.count({ where: { customerId: customer.id } })]);
  const privacyEmail = contactEmailOf(company);
  const note = (ch: string, on: boolean) => {
    const e = trail.get(ch);
    return e ? `${on ? "On" : "Off"} since ${fmtDate(e.createdAt)}, ${SOURCE[e.source] ?? e.source.toLowerCase()}` : on ? "On" : "Off";
  };
  const channels = [
    { key: "SMS" as const, label: "SMS", on: customer.consentSms, note: note("SMS", customer.consentSms) },
    { key: "WHATSAPP" as const, label: "WhatsApp", on: customer.consentWhatsapp, note: note("WHATSAPP", customer.consentWhatsapp) },
    { key: "EMAIL" as const, label: "Email", on: customer.consentEmail, note: note("EMAIL", customer.consentEmail), disabled: customer.email ? undefined : "Add an email address above first" },
    { key: "PUSH" as const, label: "App notifications", on: customer.consentPush, note: `${note("PUSH", customer.consentPush)} · only to devices you switch on below` },
  ];

  return (
    <Container className="pt-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-white">Settings</h1>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel className="p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-white">Your details</h2>
            <p className="mb-5 mt-1 text-sm text-ink-400">
              Signed in with {displayPhone(customer.phone)} · member {customer.memberNo}
            </p>
            <ProfileForm
              values={{ firstName: customer.firstName, lastName: customer.lastName ?? "", email: customer.email ?? "", homeStoreId: customer.homeStoreId ?? "" }}
              stores={homeStoreOptions(stores)}
            />
          </Panel>

          <Panel className="p-5 sm:p-6" id="marketing">
            <h2 className="font-display text-lg font-semibold text-white">News, drops &amp; offers</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-400">
              Choose how we may contact you with marketing. Order updates and invoices are always sent. Messages only go out in legal hours, and every message tells you how to opt out.
            </p>
            <div className="mt-3">
              <ConsentToggles channels={channels} action={setChannelConsent} />
            </div>
          </Panel>

          <Panel className="scroll-mt-28 p-5 sm:p-6" id="notifications">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Bell className="h-5 w-5 text-brand-500" /> Notifications
            </h2>
            <p className="mb-3 mt-1 text-sm leading-relaxed text-ink-400">
              A nudge on this phone when a drop you&apos;re watching opens for you, plus member news. Sent only in legal hours. Switch off any time.
            </p>
            <PushToggle vapidKey={vapidPublicKey()} devices={devices} enable={enablePush} disable={disablePush} />
          </Panel>

          <Panel className="scroll-mt-28 p-5 sm:p-6" id="deals">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <BadgePercent className="h-5 w-5 text-brand-500" /> My Deals
            </h2>
            <p className="mb-2 mt-1 text-sm leading-relaxed text-ink-400">My Deals are personal offers loaded to your card each week, on something you buy often. They apply automatically at the till and online.</p>
            <PrefSwitch
              label="Personalised deals"
              on={customer.personalisedOffers}
              action={setPersonalisedOffers}
              note="We use your purchase history (what you buy, where and when) to pick your deals."
            />
            <p className="mt-3 text-xs leading-relaxed text-ink-450">
              Turning this off stops new deals; any deal already on your card stays until it ends. It doesn&apos;t change your tier price or points. Medicines are never part of a deal.
            </p>
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <ShieldCheck className="h-5 w-5 text-brand-500" /> Age verification
            </h2>
            {customer.ageVerifiedAt ? (
              <p className="mt-2 flex items-start gap-2 text-sm text-ink-300">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-leaf-500" />
                {AGE[customer.ageCheck] ?? "Verified"}
                {customer.idLast4 ? ` (••••${customer.idLast4})` : ""} on {fmtDate(customer.ageVerifiedAt)}.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-ink-400">Needed to order age-restricted items online. Or show your ID or passport at any store.</p>
                <VerifyAge className="mt-4" />
              </>
            )}
          </Panel>

          <Panel className="p-5 text-sm leading-relaxed text-ink-400">
            <h2 className="font-display text-lg font-semibold text-white">Your data</h2>
            <p className="mt-2">
              You can ask for a copy of the personal information we hold about you, have it corrected, or close your account. Email our Information Officer at{" "}
              <a href={`mailto:${privacyEmail}?subject=${encodeURIComponent(`Data request: member ${customer.memberNo}`)}`} className="font-semibold text-brand-400 underline">
                {privacyEmail}
              </a>
              .
            </p>
            <p className="mt-2">
              <Link href="/legal/privacy" className="font-semibold text-brand-400 hover:underline">
                Privacy notice
              </Link>{" "}
              · <a href="https://herbalholland.com/paia" className="font-semibold text-brand-400 hover:underline">PAIA manual</a>
            </p>
            <p className="mt-2 text-xs text-ink-450">{legalNameOf(company)} is the responsible party for Rewards.</p>
          </Panel>

          <form action={signOut}>
            <button className={buttonClass("outline-dark", "lg", "w-full")}>
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </aside>
      </div>
    </Container>
  );
}
