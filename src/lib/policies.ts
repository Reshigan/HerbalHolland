// The shop's legal documents (/legal/[slug]) and the returns and delivery policies members read before they buy.
// Plain language (CPA s22); obligations on the member sit in Important boxes (CPA s49); a line counsel must confirm is
// marked as such. Figures HQ can change (delivery fees, the free-delivery threshold, the cut-off, the payment window)
// come from the live settings, never from the copy. Links are written [label](href). Every string passes screenCopy
// and says "members" (tests/policies.test.ts).
import { MADE_TO_ORDER_LEAD } from "./merch";
import { zarWhole } from "./money";

export const LEGAL_DOCS = {
  terms: { title: "Membership terms", dek: "The agreement you accept when you become a Herbal Holland member — online, in the Rewards app or at the till." },
  privacy: { title: "Privacy notice", dek: "How we collect, use and protect your personal information under POPIA." },
  returns: { title: "Returns & refunds", dek: "What you can send back, how to do it and how your refund works." },
  delivery: { title: "Delivery", dek: "Where we deliver, what it costs, when it arrives and who can receive it." },
} as const;
export type LegalSlug = keyof typeof LEGAL_DOCS;

/** A list line is plain text, or a line counsel must confirm before launch (shown marked, with the question). */
export type PolicyLine = string | { text: string; counsel: string };
export type PolicyBlock = { h: string } | { p: string } | { list: PolicyLine[] } | { important: string[] };

export type PolicyFacts = {
  entity: string; // the franchisor's legal name (getFranchisor)
  email: string;
  phone: string | null;
  minAge: number;
  ecommerce: { courierFeeCents: number; freeDeliveryOverCents: number; sameDayFeeCents: number; sameDayCutoffHour: number; merchCourierCents: number; merchNotice: string; unpaidHoldMinutes: number };
};

const mail = (email: string) => `[${email}](mailto:${email})`;

export function returnsPolicy(f: PolicyFacts): PolicyBlock[] {
  return [
    {
      p: `This policy covers orders from our online shop, run by ${f.entity} (“Herbal Holland”, “we”), and purchases in our stores once they open. It's part of our [membership terms](/legal/terms), and it doesn't take away any of your rights under the Consumer Protection Act 68 of 2008 (CPA) or the Electronic Communications and Transactions Act 25 of 2002 (ECTA).`,
    },
    { h: "Faulty goods: 6 months (CPA s56)" },
    {
      p: "If something you bought from us is defective, unsafe or not fit for the purpose it's generally meant for, you may return it within 6 months after you received it. You choose whether we repair it, replace it or refund you. The return is at our risk and our cost: we arrange and pay for the courier that collects it.",
    },
    {
      list: [
        "We may check the item first to confirm the fault.",
        "If we repair it and the fault comes back, or a new one appears, within 3 months, we replace it or refund you.",
        "This doesn't cover damage caused after delivery, for example by not following the label or the instructions, or a condition we told you about before you bought and you accepted.",
        "Recalled products are always taken back for a full refund. We'll contact you and tell you how.",
      ],
    },
    { h: "Changed your mind about an online order: 7 days (ECTA s44)" },
    {
      list: [
        "You may cancel an online order within 7 days after you receive the goods, without giving a reason and without penalty.",
        "Send the goods back with everything that came with them. You pay only the direct cost of returning them: we tell you what a courier collection costs before we book it, or you can send them back yourself.",
        "We refund what you paid, in full, within 30 days after the day you cancel.",
      ],
    },
    { h: "What can't be returned just because you changed your mind (ECTA s42)" },
    {
      list: [
        {
          text: "Merch made to order for you, and goods that by their nature can't be returned: for example food, drink, supplements or skin care once opened or unsealed.",
          counsel:
            "Counsel to confirm which ECTA s42(2) exclusions apply: whether made-to-order merch in our standard designs counts as made to the member's specifications (s42(2)(f)), and whether food, drink and supplements delivered to the home are excluded even when sealed, as goods for everyday consumption (s42(2)(c)).",
        },
        "This only limits returns for a change of mind. If anything is faulty, the 6-month rights above always apply.",
      ],
    },
    { h: "After we contacted you directly (CPA s16)" },
    { p: "If you bought because of our direct marketing (an SMS, an email or a call from us), you may also cancel in writing within 5 business days after the order or the delivery, whichever is later." },
    { h: "How to return something" },
    {
      list: [
        `Tell us first: email ${mail(f.email)}${f.phone ? ` or call ${f.phone}` : ""} with your order number (it's in your order confirmation and in Rewards → Orders), what you're returning and why. For something faulty, a photo helps.`,
        "We arrange a courier to collect it from your address. Once our stores open, you can also drop it off at a Herbal Holland store: bring your order number and your ID.",
        "Pack it securely. We'll let you know by SMS or email when it reaches us and what happens next.",
      ],
    },
    { h: "Refunds" },
    {
      list: [
        "Refunds go back to the payment method you used for the order.",
        "Cooling-off cancellations are refunded within 30 days after you cancel, and faulty goods as soon as we've confirmed the fault. Your bank may take a few more days to show it.",
        "Points you used come back to your Rewards balance, and points you earned on refunded items are taken back.",
      ],
    },
    { h: "In store" },
    { p: "Once our stores open, you may return unopened, non-consumable items within 7 days, with proof of purchase, if you change your mind. Opened consumables, and medicines once dispensed, can't be returned unless they're faulty or recalled." },
    { p: "Not happy with how we've handled a return? See “Complaints” in our [membership terms](/legal/terms)." },
  ];
}

export function deliveryPolicy(f: PolicyFacts): PolicyBlock[] {
  const e = f.ecommerce;
  const cutoff = `${String(e.sameDayCutoffHour).padStart(2, "0")}:00`;
  const notice = e.merchNotice.trim();
  return [
    { h: "Where we deliver" },
    {
      p: `${f.entity} (“Herbal Holland”, “we”) delivers online orders nationwide, by courier from our warehouse, to a street address in South Africa. As our stores open, some will add click & collect and same-day delivery nearby: the checkout shows what's available for your address. This policy is part of our [membership terms](/legal/terms).`,
    },
    { h: "What it costs" },
    {
      list: [
        `Courier delivery: ${zarWhole(e.courierFeeCents)} an order, free when your order comes to ${zarWhole(e.freeDeliveryOverCents)} or more.`,
        `Same-day delivery, where a store near you offers it: ${zarWhole(e.sameDayFeeCents)}, when you order by ${cutoff}.`,
        `Made-to-order merch is made for you by our merch partner and couriered on its own in ${MADE_TO_ORDER_LEAD}, with a ${zarWhole(e.merchCourierCents)} courier fee on top. It doesn't count towards free delivery.`,
        "You see the delivery charge at checkout, before you pay.",
      ],
    },
    ...(notice ? [{ p: notice }] : []),
    { h: "When it arrives" },
    {
      list: [
        `Pay within ${e.unpaidHoldMinutes} minutes of ordering: an unpaid order is cancelled and its stock released.`,
        "We pack paid orders on working days. Delivery usually takes 2–4 working days, a little longer to outlying areas.",
        "If we haven't delivered within 30 days, you may cancel and we'll refund you in full (ECTA s46).",
      ],
    },
    { h: "Who can receive it" },
    {
      important: [
        `We deliver only to the member named on the order, in person. Everything we sell is for adults ${f.minAge}+, so the courier may ask to see your ID, and won't hand the parcel to anyone else or to anyone who can't show they're ${f.minAge} or older.`,
        "Be there to receive it, or choose an address where you'll be: the courier can't leave it with a neighbour, at reception or at the door.",
      ],
    },
    { h: "Licensed medicines are never delivered" },
    { p: "Licensed cannabis medicines (products containing THC) are supplied only to registered patients with a valid SAHPRA authorisation, and handed over in store by an authorised dispenser. We never send them by courier." },
    { h: "Tracking" },
    { p: "We send you an SMS when we receive your order and again when it's on its way, with the courier's tracking number. You can follow it in Rewards → Orders too." },
    { h: "If we can't deliver" },
    {
      list: [
        "If no one's there to receive it, or the member named on the order can't show their ID, the courier leaves a note or sends you a message and tries again on the next working day.",
        `If the second attempt fails too, the parcel comes back to our warehouse and we'll contact you. We can send it again (a new courier fee of ${zarWhole(e.courierFeeCents)} applies) or cancel the order and refund what you paid for the goods.`,
      ],
    },
    { h: "Damaged or missing items" },
    {
      list: [
        "Check your parcel when it arrives. If the box is clearly damaged, you may refuse it, and the courier brings it back to us.",
        `If anything is damaged, missing or not what you ordered, tell us as soon as possible: email ${mail(f.email)} with your order number and photos of the parcel and what's inside. We'll send what's missing, replace what's damaged or refund you.`,
        "This doesn't limit your rights for faulty goods: see [Returns & refunds](/legal/returns).",
      ],
    },
    { h: "Your details" },
    { p: "We share your name, mobile number and delivery address with the courier only to deliver your order. See our [privacy notice](/legal/privacy)." },
  ];
}
