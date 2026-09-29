import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { Calendar, Gift, Mail, Search, Store } from "lucide-react";
import { getCustomer } from "@/server/auth";
import { CONSENT_WORDING } from "@/server/customers";
import { getPreferredStore, getRetailStores, homeStoreOptions } from "@/server/shop/context";
import { voucherBalance } from "@/server/shop/vouchers";
import { GiftForm } from "@/components/shop/gift-form";
import { PhoneAuth } from "@/components/shop/phone-auth";
import { Sky } from "@/components/shop/sky";
import { Container, Panel, inputClass } from "@/components/shop/ui";
import { JsonLd } from "@/components/shop/json-ld";
import { buttonClass } from "@/components/ui/button";
import { breadcrumbJsonLd, LOCALE, SITE_NAME, siteUrl } from "@/lib/seo";
import { VOUCHER_AMOUNTS_CENTS, VOUCHER_MESSAGE_MAX, VOUCHER_VALID_YEARS } from "@/lib/vouchers";
import { fmtDate } from "@/lib/format";
import { zar, zarWhole } from "@/lib/money";
import { cn } from "@/lib/cn";

const DESCRIPTION = "Herbal Holland gift vouchers: R200, R500 or R1,000, emailed with your message and redeemable on anything in store or online. Valid for three years. Adults 18+.";
export const metadata: Metadata = {
  title: "Gift vouchers",
  description: DESCRIPTION,
  alternates: { canonical: "/gift" },
  openGraph: { title: `Gift vouchers · ${SITE_NAME}`, description: DESCRIPTION, type: "website", url: "/gift", siteName: SITE_NAME, locale: LOCALE },
};

export default async function GiftPage({ searchParams }: { searchParams: Promise<{ check?: string }> }) {
  const [{ check }, customer, stores, store] = await Promise.all([searchParams, getCustomer(), getRetailStores(), getPreferredStore()]);
  const checked = check ? await voucherBalance(check) : null;
  const amounts = VOUCHER_AMOUNTS_CENTS.map(zarWhole).join(", ").replace(/, ([^,]*)$/, " or $1");
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(siteUrl(), [{ name: "Shop", path: "/shop" }, { name: "Gift vouchers", path: "/gift" }])} />
      <Sky time="gold" className="border-b border-ink-850">
        <Container className="pb-16 pt-10 sm:pb-20 sm:pt-14">
          <div className="max-w-2xl">
            <div className="eyebrow text-brand-500">Gift vouchers</div>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">Give the gift of choice.</h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-100">
              {amounts} — emailed with your message, redeemable on anything in the range, online or in any store. Valid for {VOUCHER_VALID_YEARS} years. Adults 18+.
            </p>
          </div>
        </Container>
      </Sky>
      <Container className="pt-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div>
            {customer ? (
              <Panel className="p-6 sm:p-8">
                <p className="mb-6 text-sm text-ink-400">
                  Buying as <strong className="text-ink-100">{customer.firstName}</strong> · {customer.memberNo}
                </p>
                <GiftForm amounts={VOUCHER_AMOUNTS_CENTS} messageMax={VOUCHER_MESSAGE_MAX} defaultEmail={customer.email} />
              </Panel>
            ) : (
              <Panel className="p-6 sm:p-8">
                <PhoneAuth next="/gift" stores={homeStoreOptions(stores)} defaultStoreId={store?.id} consentWording={CONSENT_WORDING} title="Sign in to buy a voucher" intro="Vouchers are bought by members (joining is free and takes a minute) so the receipt and the code are always in your account." />
              </Panel>
            )}
          </div>
          <aside className="space-y-4">
            <Panel className="p-5">
              <h2 className="font-display text-lg font-semibold text-white">How it works</h2>
              <ul className="mt-3 space-y-3 text-sm text-ink-300">
                {[
                  [<Gift key="g" className="h-4 w-4" />, `Choose ${amounts}, add a message and, if you like, their email.`],
                  [<Mail key="m" className="h-4 w-4" />, "Pay online. The voucher is emailed to you — and to them — the moment the payment goes through."],
                  [<Store key="s" className="h-4 w-4" />, "They redeem it at checkout (under Gift voucher) or at the counter in any store, on anything, as many times as it takes."],
                  [<Calendar key="c" className="h-4 w-4" />, `Valid for ${VOUCHER_VALID_YEARS} years from the day it's issued (Consumer Protection Act s63). No fees, and it's not a promotion — nothing on top, nothing taken off.`],
                ].map(([i, t]) => (
                  <li key={String(t)} className="flex gap-3">
                    <span className="mt-0.5 shrink-0 text-brand-500">{i}</span>
                    {t}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="p-5">
              <h2 className="font-display text-lg font-semibold text-white">Check a balance</h2>
              <Form action="/gift" className="mt-3 flex gap-2">
                <label htmlFor="check" className="sr-only">
                  Voucher code
                </label>
                <input id="check" name="check" defaultValue={check ?? ""} placeholder="HH-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" className={cn(inputClass, "h-11 uppercase placeholder:normal-case")} />
                <button className={buttonClass("outline-dark", "md", "h-11 shrink-0")} aria-label="Check balance">
                  <Search className="h-4 w-4" />
                </button>
              </Form>
              {check && (
                <p className="mt-3 text-sm" role="status">
                  {checked ? (
                    <span className="text-ink-100">
                      <strong className="tnum text-white">{checked.code}</strong>: {zar(checked.balanceCents)} of {zar(checked.amountCents)} left{checked.status === "ACTIVE" ? ` · valid until ${fmtDate(checked.expiresAt)}` : checked.status === "EXPIRED" ? " · expired" : " · used up"}
                    </span>
                  ) : (
                    <span className="text-rose-100">We don&apos;t recognise that code — check it against the email or card.</span>
                  )}
                </p>
              )}
              {customer && (
                <Link href="/club/vouchers" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-400 hover:underline">
                  Vouchers you&apos;ve bought →
                </Link>
              )}
            </Panel>
          </aside>
        </div>
      </Container>
    </>
  );
}
