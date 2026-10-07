// The trade terms applicants accept (settings.trade.termsVersion is stored on the account). Plain-language text, marked
// as under review until HQ records counsel's sign-off (HQ → Compliance, settings.legal.reviewed); the figures (minimum
// order, fees, hold days) are read from the live settings.
import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { getSettings } from "@/server/settings";
import { getFranchisor } from "@/server/shop/context";
import { tradeEmail } from "@/server/trade/accounts";
import { H2, P } from "@/components/shop/learn/bodies";
import { Important, List } from "@/components/shop/legal/membership-terms";
import { Callout, Container } from "@/components/shop/ui";
import { LOCALE, SITE_NAME } from "@/lib/seo";
import { zar } from "@/lib/money";
import { legalNameOf } from "@/lib/contact";

const DESCRIPTION = "The terms a business accepts when it applies for a Herbal Holland trade account: who may hold one, prices ex VAT, case packs and the minimum order, EFT and account terms, courier and collection, invoices and statements.";

export const metadata: Metadata = {
  title: "Trade terms",
  description: DESCRIPTION,
  alternates: { canonical: "/trade/terms" },
  robots: { index: true, follow: true },
  openGraph: { title: `Trade terms · ${SITE_NAME} Trade`, description: DESCRIPTION, url: "/trade/terms", type: "website", siteName: SITE_NAME, locale: LOCALE },
};

export default async function TradeTermsPage() {
  const [settings, c] = await Promise.all([getSettings(), getFranchisor()]);
  const t = settings.trade;
  const entity = legalNameOf(c);
  const email = tradeEmail();
  return (
    <Container className="max-w-3xl pt-10 sm:pt-14">
      <div className="eyebrow text-brand-500">Herbal Holland Trade</div>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">Trade terms</h1>
      <p className="mt-3 text-lg text-ink-300">
        Version <span className="tnum font-semibold text-white">{t.termsVersion}</span>. The agreement between a trade customer and {entity} for buying at trade prices.
      </p>
      {!settings.legal.reviewed && (
        <Callout tone="warn" icon={<Scale className="h-5 w-5" aria-hidden />} className="mt-8" title="Draft — to be reviewed by counsel">
          This is placeholder wording for the trade channel. Counsel reviews it before the first trade account is approved; the version applicants accept is recorded on their account.
        </Callout>
      )}

      <div className="pb-8">
        <H2>1. About these terms</H2>
        <P>
          These terms apply when a business (&ldquo;you&rdquo;) applies for and uses a Herbal Holland trade account with {entity} (&ldquo;Herbal Holland&rdquo;, &ldquo;we&rdquo;). You accept them when you send the application, and we record the version and the time. They sit alongside our{" "}
          <Link href="/legal/privacy" className="text-brand-400 underline">
            privacy notice
          </Link>
          . Where the Consumer Protection Act applies to a transaction, nothing here limits the rights it gives.
        </P>

        <H2>2. Who may hold a trade account</H2>
        <List
          items={[
            "A business trading in South Africa: a pharmacy, retailer, café or restaurant, wellness or health practice, online shop or other business we approve.",
            "Every person who orders for the account, and every person who collects an order, is 18 or older. You confirm this when you apply and keep it true.",
            "Licensed (THC) medicines are never supplied on a trade account, whatever licences either of us hold.",
            "We may approve, decline, hold or close an account; we tell you why where we reasonably can. A closed account's balance stays due.",
          ]}
        />

        <H2>3. Prices and VAT</H2>
        <P>
          Trade prices are quoted ex VAT; VAT at the standard rate is added per line and shown on every quote, pro forma and tax invoice. Prices are those shown in the portal when you place the order. Quantity breaks apply by themselves. No points, member prices, vouchers or consumer promotions apply to trade orders.
        </P>

        <H2>4. Orders, case packs and the minimum order</H2>
        <List
          items={[
            `Orders are placed in whole cases. The minimum order is ${zar(t.minOrderCents)} ex VAT after any promotion.`,
            "An order is confirmed when we accept it in the portal (on account) or when we confirm your EFT. Until then no stock is held.",
            "A line we can't fill in full ships short and is invoiced for what was supplied. The portal shows the shortfall on the order.",
            "We may cancel an order where stock, a recall or a compliance rule prevents supply; anything you paid for a cancelled order is refunded.",
          ]}
        />

        <H2>5. Paying</H2>
        <Important>
          <p>
            <b>EFT (pro forma):</b> pay the pro forma amount with the reference shown within {t.eftHoldDays} {t.eftHoldDays === 1 ? "day" : "days"}; unpaid orders lapse. Stock is reserved when we confirm the payment.
          </p>
          <p>
            <b>On account:</b> once approved for credit, orders are invoiced when they ship or are collected and fall due after the account&apos;s payment days, within its credit limit. An overdue invoice puts the account on hold until it is settled; the hold lifts when it is.
          </p>
          <p>We may charge interest on overdue amounts at the rate the law allows, and recover reasonable costs of collection.</p>
        </Important>

        <H2>6. Courier and click &amp; collect</H2>
        <List
          items={[
            `Courier from our distribution centre: ${zar(t.deliveryCents)} ex VAT per order${t.freeDeliveryOverCents > 0 ? `, free from ${zar(t.freeDeliveryOverCents)} ex VAT` : ""}. Risk passes on delivery to the address on the order; check the parcel count when you sign.`,
            `Click & collect at a participating store: ${zar(t.collectHandlingCents)} ex VAT handling per order. The person collecting shows ID (18+) and the order's collection code.`,
            "Tell us about a damaged or missing item within 2 business days of delivery or collection, quoting the invoice number.",
          ]}
        />

        <H2>7. Invoices, statements and records</H2>
        <P>
          Every shipped or collected order carries a tax invoice from the supplying store or distribution centre, with the batch codes supplied. Accounts receive a monthly statement. Keep the certificates of analysis we provide with the stock you hold, and tell us at once about any recall notice we send.
        </P>

        <H2>8. Reselling responsibly</H2>
        <List
          items={[
            "Sell only to adults (18+), in the packaging and with the labelling we supply.",
            "Don't make claims about our products that we don't make ourselves; CBD products carry only the approved low-risk wellness wording.",
            "Store products as the pack says, away from minors and pets, and don't sell past the expiry date.",
          ]}
        />

        <H2>9. Personal information</H2>
        <P>
          We process the business and buyer details you give us to assess the application and run the account (POPIA). Only the trade team sees them. See the{" "}
          <Link href="/legal/privacy" className="text-brand-400 underline">
            privacy notice
          </Link>{" "}
          for your rights.
        </P>

        <H2>10. Changes, ending and the law</H2>
        <P>
          We may update these terms; the portal shows the current version and we email account owners before a change takes effect. Either of us may end the account on written notice; orders already placed and amounts already due are unaffected. South African law applies. Questions go to{" "}
          <a href={`mailto:${email}`} className="text-brand-400 underline">
            {email}
          </a>
          .
        </P>
      </div>
    </Container>
  );
}
