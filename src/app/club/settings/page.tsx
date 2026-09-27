import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, LogOut, ShieldCheck } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { signOut } from "@/server/shop/actions";
import { consentTrail } from "@/server/shop/club";
import { getFranchisor, getRetailStores } from "@/server/shop/context";
import { setChannelConsent } from "../actions";
import { ConsentToggles } from "@/components/shop/club-client";
import { ProfileForm } from "@/components/shop/profile-form";
import { VerifyAge } from "@/components/shop/verify-age";
import { Container, Panel } from "@/components/shop/ui";
import { buttonClass } from "@/components/ui/button";
import { displayPhone } from "@/lib/sa";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Settings" };

const SOURCE: Record<string, string> = { SIGNUP_WEB: "when you joined online", WEB: "when you joined online", REFERRAL: "when you joined", POS: "in store", CLUB_APP: "in Rewards settings", STOP_REPLY: "by replying STOP", ADMIN: "by our team" };
const AGE: Record<string, string> = { ID_NUMBER: "SA ID number checked", ID_SIGHTED: "ID sighted in store", VERIFIED: "Verified with Home Affairs", NONE: "Not verified" };

export default async function ClubSettings() {
  const customer = await getCustomer();
  if (!customer) redirect("/club/join?next=/club/settings");
  const [trail, stores, company] = await Promise.all([consentTrail(customer.id), getRetailStores(), getFranchisor()]);
  const note = (ch: string, on: boolean) => {
    const e = trail.get(ch);
    return e ? `${on ? "On" : "Off"} since ${fmtDate(e.createdAt)}, ${SOURCE[e.source] ?? e.source.toLowerCase()}` : on ? "On" : "Off";
  };
  const channels = [
    { key: "SMS" as const, label: "SMS", on: customer.consentSms, note: note("SMS", customer.consentSms) },
    { key: "WHATSAPP" as const, label: "WhatsApp", on: customer.consentWhatsapp, note: note("WHATSAPP", customer.consentWhatsapp) },
    { key: "EMAIL" as const, label: "Email", on: customer.consentEmail, note: note("EMAIL", customer.consentEmail), disabled: customer.email ? undefined : "Add an email address above first" },
    { key: "PUSH" as const, label: "App notifications", on: customer.consentPush, note: note("PUSH", customer.consentPush) },
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
              stores={stores.filter((s) => s.status === "ACTIVE").map((s) => ({ id: s.id, name: s.name, city: s.city }))}
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
        </div>

        <aside className="space-y-6">
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <ShieldCheck className="h-5 w-5 text-oranje-500" /> Age verification
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
              <a href={`mailto:privacy@herbalholland.co.za?subject=${encodeURIComponent(`Data request — member ${customer.memberNo}`)}`} className="font-semibold text-oranje-400 underline">
                privacy@herbalholland.co.za
              </a>
              .
            </p>
            <p className="mt-2">
              <Link href="/legal/privacy" className="font-semibold text-oranje-400 hover:underline">
                Privacy notice
              </Link>{" "}
              · <Link href="/legal/paia" className="font-semibold text-oranje-400 hover:underline">PAIA manual</Link>
            </p>
            <p className="mt-2 text-xs text-ink-500">{company?.legalName ?? "Herbal Holland (Pty) Ltd"} is the responsible party for Rewards.</p>
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
