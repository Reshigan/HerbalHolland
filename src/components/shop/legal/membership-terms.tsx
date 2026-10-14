// The membership terms members accept when they join (TERMS_VERSION). Plain language (CPA s22); terms that limit a
// member's rights or put obligations on them sit in "Important" boxes (CPA s49); the supplier details ECTA s43 needs.
// Figures that HQ can change (points, fees, holding periods) are read from the live settings.
import Link from "next/link";
import { H2, P } from "@/components/shop/learn/bodies";
import { KEY_TERMS, TERMS_LABEL } from "@/lib/terms";
import { TIERS, tierInfo } from "@/lib/loyalty-rules";
import { MADE_TO_ORDER_LEAD } from "@/lib/merch";
import { zar } from "@/lib/money";
import { fmtDateTime, num } from "@/lib/format";
import { siteUrl } from "@/lib/seo";
import { contactEmailOf, legalNameOf } from "@/lib/contact";
import type { Settings } from "@/server/settings";

type Company = { legalName: string; regNumber: string | null; vatNumber: string | null; address: string | null; phone: string | null; email: string | null; directors: string | null } | null;

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-4 list-disc space-y-2 pl-6 text-[1.02rem] leading-[1.75] text-ink-300">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function Important({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" aria-label="Important" className="mt-5 rounded-2xl border border-amber-500/40 bg-amber-500/[0.08] p-5 text-[1.02rem] leading-[1.75] text-amber-50">
      <div className="eyebrow text-amber-200">Important</div>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

export function MembershipTerms({ c, s }: { c: Company; s: Settings }) {
  const entity = legalNameOf(c);
  const email = contactEmailOf(c);
  // ECTA s43 details from the franchisor's company record: a line whose details aren't on record yet is left out.
  const address = c?.address?.trim();
  const phone = c?.phone?.trim();
  const directors = c?.directors?.trim();
  const { loyalty: l, ecommerce: e, launch: f, compliance } = s;
  return (
    <>
      <p className="mt-8 text-sm text-ink-400">
        {TERMS_LABEL}. Written in plain language, as the Consumer Protection Act requires. Terms that limit your rights or put an obligation on you are in an{" "}
        <b className="text-amber-100">Important</b> box. Please read them before you accept.
      </p>

      <H2>The key terms</H2>
      <Important>
        <ul className="list-disc space-y-2 pl-5">
          {KEY_TERMS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Important>

      <H2>1. About these terms</H2>
      <P>
        These terms are the agreement between you and {entity} (&ldquo;Herbal Holland&rdquo;, &ldquo;we&rdquo;) when you become a member, including Herbal Holland Rewards. You accept them when you join (online, in the Rewards app or at a till), and we keep a record of the version you accepted and when. Our{" "}
        <Link href="/legal/privacy" className="text-brand-400 underline">privacy notice</Link> explains how we handle your personal information, and the checkout shows anything that applies to a particular order.
      </P>
      <P>
        Nothing in these terms takes away your rights under the Consumer Protection Act 68 of 2008 (CPA), the Electronic Communications and Transactions Act 25 of 2002 (ECTA), the Protection of Personal Information Act 4 of 2013 (POPIA) or any other law. If a term conflicts with the law, the law applies and the rest of these terms still stand.
      </P>

      <H2>2. Who we are</H2>
      <List
        items={[
          `${entity}, a private company registered in South Africa${c?.regNumber ? `, registration number ${c.regNumber}` : ""}${c?.vatNumber ? `, VAT number ${c.vatNumber}` : ""}.`,
          ...(address ? [`Physical address, which is also our address for legal notices: ${address}.`] : []),
          `${phone ? `Telephone ${phone} · email` : "Email"} ${email} · website ${new URL(siteUrl()).host}.`,
          ...(directors ? [`Directors: ${directors}.`] : []),
        ]}
      />
      <P>
        Herbal Holland stores are independently owned and operated by franchisees. When you buy, in store or online, the store that sells to you is the supplier and issues your tax invoice; its name, address and VAT number are on the invoice. We run membership, Rewards and this website, and collect online payments on the store&apos;s behalf.
      </P>

      <H2>3. Membership</H2>
      <P>
        <b className="text-white">We sell to members only.</b> Membership lets us confirm that everyone who buys from us is an adult, keep the records the law requires (for licensed medicines and product recalls, for example), and give you member prices and Rewards. It&apos;s free.
      </P>
      <Important>
        <p>
          <b>Adults only.</b> You must be {compliance.minAge} or older to join and to buy. You join with your own South African mobile number and either your SA ID number or, if you&apos;re not a South African citizen, a passport we&apos;ve seen. One membership per person.
        </p>
        <p>
          <b>True, current details.</b> Keep your details up to date in Rewards → Settings. We may ask to see your ID at any time (at the till, on collection or on delivery), and we won&apos;t sell or hand over age-restricted products if we can&apos;t confirm your age.
        </p>
        <p>
          <b>Your card is personal.</b> Your membership and the QR code in the Rewards app are for you only. Don&apos;t let anyone else use them, and tell us straight away if you think someone has.
        </p>
      </Important>
      <P>
        <b className="text-white">Ending your membership.</b> You can end it at any time in Rewards → Settings or at any store. Use your points first: they can&apos;t be paid out in cash. We keep the records the law requires after your membership ends, as the privacy notice explains.
      </P>

      <H2>4. Buying from us</H2>
      <Important>
        <p>
          <b>For your own use.</b> Everything you buy from us is for your own personal use. You may not resell it, give or supply it to anyone else, or buy it on someone else&apos;s behalf, and never for anyone under 18. Supplying cannabis to others can be a criminal offence under the Drugs and Drug Trafficking Act 140 of 1992 (and, once it commences, the Cannabis for Private Purposes Act 7 of 2024). We end the membership of anyone who does it.
        </p>
      </Important>
      <P>
        <b className="text-white">What we sell.</b> Schedule 0 CBD products within their legal limits (no more than 600 mg of CBD per pack and 20 mg a day, with low-risk claims only), hemp products, accessories, apparel and grow equipment. We don&apos;t make medical claims, and nothing we say (in store, online or in Learn) is medical advice.
      </P>
      <Important>
        <p>
          <b>Licensed cannabis medicines.</b> Products containing THC are medicines under the Medicines and Related Substances Act 101 of 1965. We supply them only to members who are registered patients (with a valid authorisation issued by SAHPRA under section 21 of that Act on file, within its monthly quantity), and they&apos;re handed over in store by an authorised dispenser. Membership alone never entitles you to them, and a dispenser may refuse to dispense. They carry no promotions, discounts, member prices or points (section 18A of that Act).
        </p>
      </Important>
      <P>
        <b className="text-white">Prices and payment.</b> Prices are in rand and include VAT. Each store sets its own shelf prices; online prices are shown before you pay. If a price is obviously wrong, we&apos;ll tell you before we process the order and you may cancel. We accept the payment methods shown at the till and at checkout.
      </P>
      <P>
        <b className="text-white">Ordering online.</b> Before you place an order you can review it, correct mistakes and cancel (ECTA s43). Your order is accepted when we confirm it by SMS or email. An order not paid within {e.unpaidHoldMinutes} minutes is cancelled and its stock released. Collect click &amp; collect orders within {e.collectHoldDays} days; after that we cancel them and refund anything you paid. We deliver within 30 days unless we agree otherwise; if we can&apos;t, you may cancel and we&apos;ll refund you (ECTA s46).
      </P>
      <P>
        <b className="text-white">Collection and delivery.</b> Age-restricted products are handed over only to an adult who shows ID, at the counter or at your door. Licensed medicines are collected in store only. Delivery costs are shown at checkout. Anything made to order for you (its product page says so) is couriered separately, in {MADE_TO_ORDER_LEAD}, with a {zar(e.merchCourierCents)} courier fee on top.
      </P>
      <P>
        <b className="text-white">Limited drops.</b> Some releases are for members only, with a limit per member. We may cancel orders that go over it.
      </P>

      <H2>5. Cooling-off, returns and refunds</H2>
      <List
        items={[
          "Online orders (ECTA s44): you may cancel within 7 days after you receive the goods, without a reason and without penalty. You pay only the direct cost of returning them, and we refund you within 30 days. This doesn't apply where ECTA s42 excludes it, for example goods that by their nature can't be returned or will deteriorate quickly, such as opened consumables.",
          "After direct marketing (CPA s16): if you bought because we approached you directly, you may cancel in writing within 5 business days.",
          "Faulty goods (CPA s56): within 6 months after delivery you may return goods that are defective, unsafe or not fit for their purpose, and choose a repair, a replacement or a refund.",
          "Change of mind in store: unopened, non-consumable items within 7 days, with proof of purchase.",
          "Health and safety: opened consumables, and medicines once dispensed, can't be returned unless they're faulty or recalled.",
          "Refunds go back to the payment method you used. Points you used are returned, and points you earned on the refunded items are taken back.",
        ]}
      />

      <H2>6. Herbal Holland Rewards</H2>
      <P>Rewards is our loyalty programme (CPA s35). It&apos;s free and comes with your membership.</P>
      <List
        items={[
          `Instant member savings: your tier takes a percentage off eligible items at the till and online (${TIERS.map((t) => `${t.name} ${l.tierSavingsPct[t.key]}%`).join(", ")}). Your tier follows what you've spent over the last 12 months.`,
          `Points: ${l.earnPer100} points for every R100 you pay on eligible items. Each point is worth R1 when you use it, from ${l.minRedeem} points and for up to ${l.maxRedeemPct}% of an eligible basket.`,
          "Never on medicines: licensed medicines earn no points, get no member savings and can't be paid for with points (Medicines Act s18A).",
          `Bonuses: ${l.signupBonus} points when you join, ${l.birthdayBonus} in your birthday month, and ${l.referralBonus} each for you and a friend you refer, after their first purchase.`,
          "Points and savings have no cash value, can't be transferred or sold, and are taken back if a purchase is refunded.",
          "My Deals: personal offers based on what you buy, only while you allow it. Switch them off any time in Rewards → Settings.",
          "Changes: we'll give you at least 20 business days' notice before any change that reduces the value of your points or savings. If we end Rewards, you'll have at least 3 months to use your points.",
        ]}
      />
      <P>
        <b className="text-white">Founding Members.</b>{" "}
        {f.launchAt
          ? `Members who join before ${fmtDateTime(new Date(f.launchAt))} are on the Founding Members list. When it closes, the first ${num(f.foundingCap)} places get a numbered Founding Member card and at least the ${tierInfo(f.foundingTier).name} tier for ${f.foundingMonths} months. Your place is your joining order, and each friend who joins with your link before the list closes moves you up ${f.referralBoost} places.`
          : "When we run a Founding Members list, its closing date, number of places and benefits are shown in the Rewards app."}{" "}
        No purchase is needed. Fake or duplicate accounts and referrals don&apos;t count, and we may remove them.
      </P>

      <H2>7. Events</H2>
      <P>Members&apos; events are for adults 18+, with ID checked at the door. Nothing may be consumed on our premises. Places are limited, and we may refuse entry to anyone who is impaired or disruptive.</P>

      <H2>8. Using products responsibly and within the law</H2>
      <Important>
        <p>Never drive or operate machinery while impaired. Driving under the influence of a drug with a narcotic effect is an offence under section 65 of the National Road Traffic Act 93 of 1996.</p>
        <p>Read the label and follow your doctor&apos;s or pharmacist&apos;s advice. Keep products away from children and pets. Don&apos;t consume where it isn&apos;t allowed, and don&apos;t take products across borders: they may be illegal elsewhere.</p>
      </Important>

      <H2>9. Recalls and safety messages</H2>
      <P>
        Every batch is traceable to the members who bought it, so we&apos;ll contact you by SMS or email about a recall, a safety notice or your orders, even if you haven&apos;t opted in to marketing. These messages are never marketing.
      </P>

      <H2>10. Your personal information and our messages</H2>
      <P>
        We handle your personal information as our <Link href="/legal/privacy" className="text-brand-400 underline">privacy notice</Link> explains. In short: we confirm your age with a secure fingerprint of your ID number (only the last four digits stay readable), keep a record of what you buy as the law requires, and keep the version of these terms you accepted. We send marketing only on the channels you opt into (POPIA s69), only at the times the CPA allows (weekdays 08:00–20:00, Saturdays 09:00–13:00, never on Sundays or public holidays), and every message tells you how to opt out: reply STOP or change your choices in Rewards → Settings.
      </P>

      <H2>11. Suspending or ending a membership</H2>
      <Important>
        <p>
          We may suspend or end a membership if a member gives false information or is under 18; resells or supplies what they buy, or buys for someone else; uses fake or duplicate accounts, or abuses referrals, drops or offers; threatens or abuses our staff or other members; or acts unlawfully on our premises or with our products.
        </p>
        <p>Unless the law prevents it, we&apos;ll tell you why and give you a chance to respond first. If we end a membership for one of these reasons, its unused points lapse.</p>
      </Important>

      <H2>12. Our responsibility to you</H2>
      <Important>
        <p>
          We&apos;re responsible for loss or damage caused by our breach of these terms or by our negligence, as the law provides. We&apos;re not responsible for indirect or consequential loss, such as lost income or profit, unless it was caused by our gross negligence or wilful misconduct.
        </p>
        <p>Nothing in these terms limits your rights under the CPA, including the implied warranty of quality (s56) and liability for harm caused by unsafe or defective goods (s61).</p>
      </Important>
      <P>If something beyond our reasonable control (power or network outages, strikes, disasters or a change in the law) stops us supplying an order, we&apos;ll tell you as soon as we can and you may cancel for a full refund.</P>

      <H2>13. Complaints</H2>
      <List
        items={[
          "Speak to the store manager first. Every store's contact details are on its store page.",
          `If that doesn't resolve it, email ${email}. We acknowledge complaints within 2 business days and aim to resolve them within 15.`,
          "Still unhappy? Contact the Consumer Goods and Services Ombud (cgso.org.za) or the National Consumer Commission (thencc.org.za).",
          "About your personal information: the Information Regulator (inforegulator.org.za). About a medicine or a side effect: SAHPRA (sahpra.org.za). About advertising: the Advertising Regulatory Board (arb.org.za).",
        ]}
      />

      <H2>14. Changes to these terms</H2>
      <P>
        We&apos;ll tell you about any change by SMS, email or in the Rewards app at least 20 business days before it takes effect. If a change is material, we&apos;ll ask you to accept it before your next purchase; if you don&apos;t, you may end your membership without penalty. The version you accepted, and when, stays on record.
      </P>

      <H2>15. General</H2>
      <List
        items={[
          "South African law applies. You may take a dispute to any court with jurisdiction, including the magistrate's court where you live.",
          `Messages we send by SMS, email or in the app count as written notice (ECTA). Send notices to us at the ${address ? "email or physical address" : "email address"} in section 2.`,
          "Your orders, tax invoices and points history are in the Rewards app for as long as you're a member. Ask us for a copy at any time.",
          "If a court finds part of these terms invalid, the rest still applies. If we don't enforce a term straight away, we haven't given it up.",
        ]}
      />
    </>
  );
}
