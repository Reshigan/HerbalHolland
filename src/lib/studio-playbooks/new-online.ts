// A product's online launch, filled from its record, to the members who chose its interest: an email built only from
// its fields (what it is, what's in it, how we know, how to get it), a push that evening, and next morning a Learn
// carousel on its category that names no product and sells nothing. Never effects or benefits: {facts} is the only
// product detail.
import type { Playbook } from "../studio";
import { paras } from "./shared";

/**
 * The Tuesdays the content plan keeps for product launches (docs/MARKETING-PLAN.md §9): the second and fourth of the
 * month, except where the launch, the openings and the festive weeks already fill members' inboxes. A product that goes
 * live takes the first free one a week or more away (announceProducts), one product a Tuesday;
 * tests/studio-calendar.test.ts holds the limits on every one. The next content plan adds its own.
 */
export const NEW_ONLINE_DAYS = ["2026-11-10", "2027-01-12", "2027-01-26", "2027-02-09", "2027-02-23", "2027-03-09", "2027-03-23"];

export const NEW_ONLINE: Playbook[] = [
  {
    key: "new-online",
    name: "New online: a product launch",
    blurb: "A new product in the online shop, for the members who chose its interest: an email at 16:00 built only from its facts (what it is, what's in it, its lab page, delivery or collection), a push at 18:30, and next morning a Learn carousel on its category that names no product and sells nothing.",
    store: false,
    product: true,
    weekday: 2,
    why: "product launches go out on the second and fourth Tuesdays",
    anchor: "The product goes online",
    items: [
      {
        key: "email", day: 0, time: "16:00", channel: "EMAIL",
        title: "New in the shop: {product}",
        text: paras(
          "Hi {{firstName}},",
          "New in the shop: {product}, in {category}. You told us this is what you're interested in, so you're hearing about it here.",
          "What's in it. {facts} Its page has the details, line by line.",
          "How we know. Every batch is lab-tested, with a public lab page: scan the QR on the pack to see the results for yours.",
          "How to get it. We deliver anywhere in South Africa and hand the parcel only to the member named on the order, who may be asked for ID, with tracking by SMS. Or collect it at your store.",
          "Read more. Learn has plain-English reads on how to read a label and a lab result, so you know exactly what you're looking at.",
          "See it here: {link}",
          "See you soon,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push", day: 0, time: "18:30", channel: "PUSH",
        title: "New in the shop",
        text: "{product} is new in the shop: see what's in it and its lab page.",
      },
      {
        key: "learn", day: 1, time: "07:00", channel: "SOCIAL",
        text: "{category}, explained. Three things to look for on the label: what it is and how much is in the pack, what's in it, and the batch. Then scan the QR on the pack: every batch has a public lab page with its results. More in Learn: link in bio. Adults 18+. #HerbalHolland",
        short: "{category}, explained: what to look for on the label, and the public lab page behind every batch. Scan the QR on the pack. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "{category}, explained.", sub: "What to look for on the label, and the lab page behind every batch." },
        brief: "A 5-slide carousel on the category, on a plain mock label with no product or brand name: 1) the category, explained; 2) what it is and the pack size; 3) what's in it; 4) the batch; 5) scan the QR for the batch's public lab page.",
      },
    ],
  },
];
