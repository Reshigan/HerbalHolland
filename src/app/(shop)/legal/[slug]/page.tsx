import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FileText } from "lucide-react";
import { getFranchisor } from "@/server/shop/context";
import { getSettings } from "@/server/settings";
import { MembershipTerms } from "@/components/shop/legal/membership-terms";
import { PolicyBody } from "@/components/shop/legal/policy";
import { Callout, Container } from "@/components/shop/ui";
import { H2, P } from "@/components/shop/learn/bodies";
import { LEGAL_DOCS as DOCS, deliveryPolicy, returnsPolicy, type LegalSlug as Slug } from "@/lib/policies";
import { metaDescription, pageTitle } from "@/lib/seo";

const docOf = (slug: string) => (Object.hasOwn(DOCS, slug) ? DOCS[slug as Slug] : null);

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = docOf(slug);
  if (!d) return { title: "Not found" };
  const description = metaDescription(d.dek, `${d.title} for Herbal Holland Rewards members and the online shop, in plain English.`);
  return { title: pageTitle(d.title), description, alternates: { canonical: `/legal/${slug}` }, openGraph: { title: d.title, description, type: "website", url: `/legal/${slug}` } };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // The PAIA manual is published once, on herbalholland.com, for the company that owns the online business.
  if (slug === "paia") permanentRedirect("https://herbalholland.com/paia");
  const doc = docOf(slug);
  if (!doc) notFound();
  const [c, settings] = await Promise.all([getFranchisor(), getSettings()]);
  const entity = c?.legalName ?? "Herbal Holland (Pty) Ltd";
  const address = c?.address ?? "";
  const facts = { entity, email: c?.email ?? "hello@herbalholland.co.za", phone: c?.phone ?? null, minAge: settings.compliance.minAge, ecommerce: settings.ecommerce };

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

      {/* The long document hydrates later, in small slices, after the shell (see ProductGrid). */}
      <Suspense>
      <div className="pb-8">
        {slug === "terms" && <MembershipTerms c={c} s={settings} />}
        {slug === "returns" && <PolicyBody blocks={returnsPolicy(facts)} />}
        {slug === "delivery" && <PolicyBody blocks={deliveryPolicy(facts)} />}
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
      </div>
      </Suspense>
    </Container>
  );
}
