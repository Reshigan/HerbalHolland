// Festive season 2026 (14 December to 3 January): fixed dates. Quieter and warm: three feed posts a week (festive
// hours, a stop on the N3, gifting the windmill, a thank-you, happy holidays, a safe ride and a safe trip home, two
// Learn carousels), one WhatsApp post a week, and nothing on 16, 25 or 26 December or 1 January.
import type { Playbook } from "../studio";
import { paras } from "./shared";

export const FESTIVE: Playbook[] = [
  {
    key: "festive-2026",
    name: "Festive season 2026",
    blurb: "Three quiet weeks from 14 December to 3 January: festive hours (on each store's page, never in the copy), a stop in Hilton and Hillcrest on the N3, gifting the windmill, a thank-you for our first weeks, happy holidays, plan your ride home and a safe trip home, with two Learn carousels. Nothing on public holidays.",
    store: false,
    anchor: "Monday 14 December",
    date: "2026-12-14",
    items: [
      {
        key: "hours", day: 1, time: "07:00", channel: "SOCIAL",
        text: "Our festive hours are set. Each store's hours over the holidays are on its page at herbalholland.co.za: have a look before you visit. Your Rewards work in every store and online. Adults 18+, bring your ID. #HerbalHolland #KZN",
        card: { template: "headline", eyebrow: "Festive hours", headline: "Visiting over the holidays?", sub: "Each store's festive hours are on its page at herbalholland.co.za." },
      },
      {
        key: "sms-hours", day: 1, time: "10:00", channel: "SMS",
        text: "Hi {{firstName}}, festive hours for every Herbal Holland store are on its page at herbalholland.co.za. Your Rewards work in every store and online. Adults 18+.",
      },
      {
        key: "channel-festive", day: 3, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Festive hours: each Herbal Holland store's hours over the holidays are on its page at herbalholland.co.za.",
          "Heading down the N3 to the coast? Our Hilton store is just off the highway, and Hillcrest is on the way down. Stop, stretch your legs and come and say sawubona. And never drive impaired.",
          "Adults 18+, bring your ID.",
        ),
      },
      {
        key: "push-gifts", day: 3, time: "18:30", channel: "PUSH", audience: "interest:APPAREL",
        title: "Gift the windmill",
        text: "Tees, hoodies, caps, beanies and totes, in stock: delivered anywhere in South Africa, or collected at your store.",
      },
      {
        key: "n3", day: 3, time: "19:00", channel: "SOCIAL",
        text: "Heading down the N3 to the coast? Hilton is just off the highway, and Hillcrest is on the way down. Stop in, stretch your legs and come and say sawubona. Never drive impaired. Adults 18+, bring your ID. #HerbalHolland #HollandMeetsTheHills #KZN",
        card: { template: "reveal", headline: "Stop in on your way to the coast." },
        brief: "A photo of each store's front door in late-afternoon light, a team member (over 25, signed release) holding it open with a wave. No cars, no road shots.",
      },
      {
        key: "gifts", day: 5, time: "09:00", channel: "SOCIAL",
        text: "Gift the windmill. Tees, hoodies, crewnecks, caps, bucket hats, beanies and totes, the windmill embroidered or printed on each, all in stock: delivered anywhere in South Africa, or collected at your store. Link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "merch", image: "windmill-tote", headline: "Gift the windmill.", sub: "Delivered anywhere in South Africa, or collected at your store." },
        brief: "A flat-lay photo in daylight: the Windmill Tote, Cap and Beanie wrapped in brown paper and string on a wooden table, one piece unwrapped.",
      },
      {
        key: "email-thanks", day: 7, time: "16:00", channel: "EMAIL",
        title: "Thank you for December, and what's on in January",
        text: paras(
          "Hi {{firstName}},",
          "Three weeks ago, on Tuesday 1 December, our doors opened in Hillcrest and Hilton. Siyabonga for coming to say hello, for joining Herbal Holland Rewards, and for such a warm welcome to the hills.",
          "Opening week, in pictures. Our photos from the Members' Evening and Open Day are on our Instagram and Facebook pages: the coffee cart, the local makers' tables, the Learn sessions with the team, and a good few of you in our orange frame. Thank you to everyone who said yes to a photo.",
          "Founding Members. The list closed on Sunday 6 December, and every Founding Member's numbered card is in the Rewards app. If you're one of them, you hold at least Sprout tier for 14 months, and you're invited to a Founding Members' Evening every December.",
          "What's on in January. The Windmill, No. 3 lands on Tuesday 5 January. Every Tuesday, Read the label, a four-part Learn series on reading a label, line by line. And our first Gezellig evenings (gezellig is Dutch for warm, sociable, at home): Hillcrest on Thursday 21 January and Hilton on Friday 22 January, 18:00–20:00, for members who RSVP in the Rewards app.",
          "Over the holidays, each store's festive hours are on its page at herbalholland.co.za.",
          "Happy holidays, and see you in the new year,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-thanks", day: 7, time: "18:30", channel: "PUSH",
        title: "Thank you for December",
        text: "What's on in January: Read the label in Learn, and our first Gezellig evenings, Hillcrest 21 Jan and Hilton 22 Jan.",
      },
      {
        key: "learn-lab", day: 8, time: "07:00", channel: "SOCIAL",
        text: "Read a lab result in a minute: potency, the terpene list, and the four safety tests every batch should pass (microbes, pesticides, heavy metals and residual solvents). Every one of our batches has a public lab page: scan the QR on the pack. More in Learn: link in bio. Adults 18+. #HerbalHolland",
        short: "Read a lab result in a minute: potency, terpenes, and the four safety tests every batch should pass. Every one of our batches has a public lab page: scan the QR on the pack. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "Read a lab result in a minute.", sub: "Potency, terpenes, and the four safety tests every batch should pass." },
        brief: "A 5-slide carousel: 1) Read a lab result in a minute; 2) potency, and what the numbers mean; 3) the terpene list; 4) the four safety tests: microbes, pesticides, heavy metals, residual solvents; 5) scan the QR on the pack for the batch's lab page.",
      },
      {
        key: "thank-you", day: 9, time: "19:00", channel: "SOCIAL", linkedin: "also",
        text: "Three weeks in the hills. Siyabonga, Hillcrest and Hilton: to everyone who came to say hello, joined Herbal Holland Rewards or spent a morning with us at Open Day, and to the local makers who set up their tables beside us. See you in the new year. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        short: "Three weeks in the hills. Siyabonga, Hillcrest and Hilton, for coming to say hello, for joining Herbal Holland Rewards, and for such a warm welcome. See you in the new year. Adults 18+. #HerbalHolland",
        card: { template: "headline", headline: "Three weeks in the hills.", sub: "Siyabonga, Hillcrest and Hilton, for such a warm welcome." },
        brief: "A photo of each store's team (adults over 25, signed releases) in Windmill Tees at the front door at closing time, the window lit behind them.",
      },
      {
        key: "holidays", day: 10, time: "07:00", channel: "SOCIAL", linkedin: "also",
        text: "Happy holidays from all of us at Herbal Holland. Thank you for our first December in the hills: for every hello, every question and every visit. Rest well, travel safely, and see you in the new year. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "reveal", headline: "Happy holidays from the hills." },
        brief: "A photo of the windmill in a store window at dusk, the hills behind it. No people needed.",
      },
      {
        key: "channel-holidays", day: 10, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Happy holidays from all of us at Herbal Holland.",
          "Thank you for such a warm welcome to the hills this December: to everyone who came to say hello in Hillcrest and Hilton, joined Herbal Holland Rewards, or spent an evening or a morning with us in opening week.",
          "Each store's festive hours are on its page at herbalholland.co.za. Rest well, travel safely, and see you in the new year.",
          "Adults 18+.",
        ),
      },
      {
        key: "learn-rewards", day: 15, time: "07:00", channel: "SOCIAL",
        text: "Herbal Holland Rewards, simply. Everyone who shops with us is a member, and joining is free for adults 18+: online, in the Rewards app or at the till. Your card lives in the app, you earn points on every rand, and your tier climbs from Seed to Sprout, Bloom and Harvest. It all works in every store and online. Join free: link in bio. Adults 18+. #HerbalHolland",
        short: "Herbal Holland Rewards, simply: free to join, your card in the app, points on every rand, and four tiers from Seed to Harvest, in every store and online. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "promise", headline: "Rewards, simply.", lines: ["Free to join, for adults 18+", "Your card lives in the Rewards app", "Points on every rand", "Four tiers: Seed, Sprout, Bloom, Harvest", "In every store and online"] },
        brief: "A 5-slide carousel: 1) Rewards, simply; 2) free to join for adults 18+: online, in the app or at the till; 3) your card in the Rewards app, on your home screen; 4) points on every rand; 5) four tiers, Seed to Harvest.",
      },
      {
        key: "channel-new-year", day: 17, time: "12:30", channel: "WHATSAPP", pinned: true,
        text: paras(
          "Celebrating tonight? Plan your ride home before you go out, look after your friends, and never drive impaired.",
          "Thank you for a warm first December in the hills. In January: Read the label, our four-part Learn series, and our first Gezellig evenings, Hillcrest on Thursday 21 January and Hilton on Friday 22 January, 18:00–20:00, for members who RSVP in the Rewards app.",
          "See you in 2027. Adults 18+.",
        ),
      },
      {
        key: "ride-home", day: 17, time: "19:00", channel: "SOCIAL", pinned: true,
        text: "Celebrating tonight? Plan your ride home before you go out, look after your friends, and never drive impaired. Thank you for our first December in the hills. See you in 2027. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "New Year's Eve", headline: "Plan your ride home.", sub: "Look after your friends, and start 2027 well." },
      },
      {
        key: "safe-trip", day: 19, time: "09:00", channel: "SOCIAL",
        text: "Heading home after the holidays? Take breaks, share the driving, and never drive impaired. Hilton is just off the N3 and Hillcrest is on the way, if you'd like to stretch your legs: festive hours are on each store's page. Safe trip home. Adults 18+. #HerbalHolland #KZN",
        card: { template: "reveal", headline: "Safe trip home." },
      },
    ],
  },
];
