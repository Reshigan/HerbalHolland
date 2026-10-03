import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/server/settings";
import { ApplyForm } from "@/components/trade/apply-form";
import { Container } from "@/components/shop/ui";
import { APPLY } from "@/components/trade/copy";
import { LOCALE, SITE_NAME } from "@/lib/seo";
import { zarWhole } from "@/lib/money";

const DESCRIPTION = "Apply for a Herbal Holland trade account: trade prices ex VAT, case packs and lab-tested batches for pharmacies, retailers, cafés and wellness practices. We reply within one business day.";

export const metadata: Metadata = {
  title: "Apply for a trade account",
  description: DESCRIPTION,
  alternates: { canonical: "/trade/apply" },
  robots: { index: true, follow: true },
  openGraph: { title: `Apply for a trade account · ${SITE_NAME} Trade`, description: DESCRIPTION, url: "/trade/apply", type: "website", siteName: SITE_NAME, locale: LOCALE },
};

export default async function ApplyPage() {
  const { trade } = await getSettings();
  return (
    <Container className="max-w-3xl pt-10 sm:pt-14">
      <div className="eyebrow text-brand-500">Herbal Holland Trade</div>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">{APPLY.title}</h1>
      <p className="mt-3 text-lg text-ink-300">{APPLY.lead}</p>
      <p className="mt-2 text-sm text-ink-400">
        Minimum order {zarWhole(trade.minOrderCents)} ex VAT. New accounts start prepaid (EFT against a pro forma); account terms follow once we know each other. Already have an account?{" "}
        <Link href="/trade/login" className="font-semibold text-brand-400 underline hover:text-brand-300">
          Sign in
        </Link>
        .
      </p>
      <div className="mt-10 pb-8">
        <ApplyForm termsVersion={trade.termsVersion} />
      </div>
    </Container>
  );
}
