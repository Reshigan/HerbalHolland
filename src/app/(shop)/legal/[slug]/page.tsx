import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { getFranchisor } from "@/server/shop/context";
import { Callout, Container } from "@/components/shop/ui";
import { H2, P } from "@/components/shop/learn/bodies";

const DOCS = {
  terms: { title: "Terms of use", dek: "The rules for using Herbal Holland online, in store and through Rewards." },
  privacy: { title: "Privacy notice", dek: "How we collect, use and protect your personal information under POPIA." },
  paia: { title: "PAIA manual", dek: "How to request access to records held by Herbal Holland under the Promotion of Access to Information Act." },
} as const;
type Slug = keyof typeof DOCS;

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = DOCS[(await params).slug as Slug];
  return d ? { title: d.title, description: d.dek } : { title: "Not found" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug as Slug];
  if (!doc) notFound();
  const c = await getFranchisor();
  const entity = c?.legalName ?? "Herbal Holland (Pty) Ltd";
  const address = c?.address ?? "";

  return (
    <Container className="max-w-3xl pt-10 sm:pt-14">
      <div className="eyebrow text-brand-500">Legal</div>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{doc.title}</h1>
      <p className="mt-3 text-lg text-ink-300">{doc.dek}</p>
      <Callout tone="info" icon={<FileText className="h-5 w-5" />} className="mt-8">
        Draft for review by our Information Officer and legal counsel before launch. The summary below reflects how the platform works today.
      </Callout>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Legal documents">
        {(Object.keys(DOCS) as Slug[]).map((k) => (
          <Link key={k} href={`/legal/${k}`} aria-current={k === slug ? "page" : undefined} className={k === slug ? "rounded-full bg-brand-500 px-3.5 py-1.5 font-semibold text-ink-950" : "rounded-full border border-ink-700 px-3.5 py-1.5 text-ink-200 hover:border-ink-500"}>
            {DOCS[k].title}
          </Link>
        ))}
      </nav>

      <div className="pb-8">
        {slug === "terms" && (
          <>
            <H2>Who we are</H2>
            <P>
              This website and Herbal Holland Rewards are operated by {entity}{c?.regNumber ? ` (registration ${c.regNumber})` : ""}, {address}. Herbal Holland stores are independently owned and operated by franchisees; the store that fulfils your order is the seller and issues your tax invoice.
            </P>
            <H2>Adults only</H2>
            <P>You must be 18 or older to use this site, join Rewards or buy from us. We verify age when you register or order, and check ID at every collection and delivery. We may cancel any order where we can&apos;t confirm age.</P>
            <H2>Orders, prices and payment</H2>
            <P>
              Prices include VAT and are confirmed at checkout. Stores set their own in-store prices; online prices are the same across the country. An order is accepted when it&apos;s confirmed by SMS. Unpaid online orders are released after the payment window shown at checkout, and pay-in-store collections not collected within the holding period are cancelled.
            </P>
            <H2>Licensed medicines</H2>
            <P>Licensed cannabis medicines are supplied only to registered patients with a valid SAHPRA authorisation, within the authorised quantity, collected in store from an authorised dispenser. They carry no promotions, discounts or points.</P>
            <H2>Returns</H2>
            <P>Unopened, non-consumable items can be returned to the selling store within 7 days with proof of purchase. For health and safety reasons, opened consumables can&apos;t be returned unless faulty or recalled. Your rights under the Consumer Protection Act are not affected.</P>
            <H2>Rewards</H2>
            <P>Points are earned on what you pay and are worth R1 each when redeemed, within the limits shown at checkout. Points have no cash value, can&apos;t be transferred, and are reversed on returns. We may change the programme with reasonable notice.</P>
          </>
        )}
        {slug === "privacy" && (
          <>
            <H2>Responsible party</H2>
            <P>
              {entity}, {address}, is the responsible party for Herbal Holland Rewards and this website. Franchisee stores process your information when they serve you and are bound by agreements with us. Our Information Officer can be reached at <a className="text-brand-400 underline" href="mailto:privacy@herbalholland.co.za">privacy@herbalholland.co.za</a>.
            </P>
            <H2>What we collect and why</H2>
            <P>
              Your mobile number (to sign you in and send order updates), first name, optional email (for invoices), date of birth or a secure fingerprint of your SA ID number (to confirm you&apos;re 18+ — we keep only the last four digits in readable form), your purchases and points, and your home store. For registered patients, we keep the SAHPRA authorisation number, prescriber, scope, validity and monthly quantity — never your diagnosis.
            </P>
            <H2>Marketing</H2>
            <P>We only send marketing on the channels you opt into, only in permitted hours, with an opt-out in every message. Every consent change is recorded. You can change your choices any time in Rewards settings or by replying STOP.</P>
            <H2>Sharing and storage</H2>
            <P>We share information with the store that fulfils your order, our payment and messaging providers, and couriers for delivery — only what each needs. We don&apos;t sell personal information. Information is stored securely and kept only as long as needed for the purposes above and our legal obligations (for example, tax records).</P>
            <H2>Your rights</H2>
            <P>You may ask to see, correct or delete your information, object to processing, and complain to the Information Regulator (inforegulator.org.za). Email our Information Officer to make a request.</P>
          </>
        )}
        {slug === "paia" && (
          <>
            <H2>About this manual</H2>
            <P>This manual is published under section 51 of the Promotion of Access to Information Act, 2000 (PAIA), and describes the records held by {entity} and how to request access to them.</P>
            <H2>Contact details</H2>
            <P>
              Information Officer: {c?.contactName ?? "Information Officer"}, {entity}, {address}. Email <a className="text-brand-400 underline" href="mailto:privacy@herbalholland.co.za">privacy@herbalholland.co.za</a>
              {c?.phone ? `, telephone ${c.phone}` : ""}.
            </P>
            <H2>Records we hold</H2>
            <P>Company and statutory records; franchise agreements; product, batch and laboratory records; sales, stock and financial records; customer and Rewards records; marketing consent records; and employee records.</P>
            <H2>How to request access</H2>
            <P>Complete the prescribed request form (Form 2) and send it to the Information Officer. Prescribed fees may apply. We&apos;ll respond within 30 days, as required by PAIA. Some records may be refused on the grounds set out in the Act, including to protect the privacy of others.</P>
          </>
        )}
      </div>
    </Container>
  );
}
