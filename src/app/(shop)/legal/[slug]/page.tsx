import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { getFranchisor } from "@/server/shop/context";
import { getSettings } from "@/server/settings";
import { MembershipTerms } from "@/components/shop/legal/membership-terms";
import { Callout, Container } from "@/components/shop/ui";
import { H2, P } from "@/components/shop/learn/bodies";

const DOCS = {
  terms: { title: "Membership terms", dek: "The agreement you accept when you become a Herbal Holland member — online, in the Rewards app or at the till." },
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
  const [c, settings] = await Promise.all([getFranchisor(), getSettings()]);
  const entity = c?.legalName ?? "Herbal Holland (Pty) Ltd";
  const address = c?.address ?? "";

  return (
    <Container className="max-w-3xl pt-10 sm:pt-14">
      <div className="eyebrow text-brand-500">Legal</div>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{doc.title}</h1>
      <p className="mt-3 text-lg text-ink-300">{doc.dek}</p>
      <Callout tone="info" icon={<FileText className="h-5 w-5" />} className="mt-8">
        For review by our Information Officer and legal counsel before launch.
      </Callout>
      <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Legal documents">
        {(Object.keys(DOCS) as Slug[]).map((k) => (
          <Link key={k} href={`/legal/${k}`} aria-current={k === slug ? "page" : undefined} className={k === slug ? "rounded-full bg-brand-500 px-3.5 py-1.5 font-semibold text-ink-950" : "rounded-full border border-ink-700 px-3.5 py-1.5 text-ink-200 hover:border-ink-500"}>
            {DOCS[k].title}
          </Link>
        ))}
      </nav>

      <div className="pb-8">
        {slug === "terms" && <MembershipTerms c={c} s={settings} />}
        {slug === "privacy" && (
          <>
            <H2>Responsible party</H2>
            <P>
              {entity}, {address}, is the responsible party for Herbal Holland Rewards and this website. Franchisee stores process your information when they serve you and are bound by agreements with us. Our Information Officer can be reached at <a className="text-brand-400 underline" href="mailto:privacy@herbalholland.co.za">privacy@herbalholland.co.za</a>.
            </P>
            <H2>What we collect and why</H2>
            <P>
              We sell to members only, so we need enough to know who you are and that you&apos;re an adult: your mobile number (to sign you in and send order updates), first name, optional email (for invoices), date of birth or a secure fingerprint of your SA ID number (to confirm you&apos;re 18+ — we keep only the last four digits in readable form), your purchases and points, your home store, and the version of the membership terms you accepted and when. For registered patients, we keep the SAHPRA authorisation number, prescriber, scope, validity and monthly quantity — never your diagnosis. We process this to provide your membership (our agreement with you), to meet legal obligations such as tax, medicine and recall records, and — only with your consent — for marketing.
            </P>
            <H2>Marketing</H2>
            <P>We only send marketing on the channels you opt into, only in permitted hours, with an opt-out in every message. Every consent change is recorded. You can change your choices any time in Rewards settings or by replying STOP.</P>
            <H2>Franchise enquiries</H2>
            <P>If you enquire about owning a Herbal Holland store on herbalholland.com, we use your name, contact details, where you&apos;d like to open, your experience, the capital band you chose and your message only to reply and take your enquiry forward, with your consent. Only our head-office team sees it. We keep your connection&apos;s address only as a scrambled code, to stop repeated submissions. If we don&apos;t go ahead, we delete the enquiry a year after we last worked on it — or sooner if you ask.</P>
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
            <P>Company and statutory records; franchise agreements; product, batch and laboratory records; sales, stock and financial records; member and Rewards records; marketing consent records; and employee records.</P>
            <H2>How to request access</H2>
            <P>Complete the prescribed request form (Form 2) and send it to the Information Officer. Prescribed fees may apply. We&apos;ll respond within 30 days, as required by PAIA. Some records may be refused on the grounds set out in the Act, including to protect the privacy of others.</P>
          </>
        )}
      </div>
    </Container>
  );
}
