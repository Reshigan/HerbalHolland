// Campaign Studio playbooks (HQ → Marketing → Studio): each campaign as items dated from day T, in the voice and lines of
// docs/MARKETING-PLAN.md (§5 the idea, §7 the content bank, §10 the new-store opening). Every item passes screenDraft once
// laid out (tests/studio.test.ts). {store} {town} {address} {hours} only in store playbooks; {date} is day T everywhere.
import type { Playbook } from "./studio";

/** An email body: short plain paragraphs with a blank line between them. */
const paras = (...p: string[]) => p.join("\n\n");

export const PLAYBOOKS: Playbook[] = [
  {
    key: "brand-launch",
    name: "Brand launch: Holland, meet the Hills",
    blurb: "Three weeks of brand posts from the day our accounts go live: the story, the windmill, the hills, Learn and the merch, with the WhatsApp Channel's welkom and the first Windmill newsletter.",
    store: false,
    anchor: "Our accounts go live",
    items: [
      {
        key: "welkom", day: 0, time: "09:00", channel: "SOCIAL",
        text: "Welkom. Sawubona. We're Herbal Holland: lab-tested, batch-traceable and pharmacist-led, members only, for adults 18+. Follow along for our story, from a Dutch windmill to the hills of KwaZulu-Natal. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "headline", eyebrow: "Welkom · Sawubona", headline: "Holland, meet the Hills.", sub: "Lab-tested, members only, for adults 18+." },
      },
      {
        key: "channel-welkom", day: 0, time: "09:30", channel: "WHATSAPP",
        text: paras(
          "Welkom, and sawubona! This is the Herbal Holland Channel.",
          "Follow it for our news first: new stores and opening days, members' evenings and events, new merch, and Learn, our plain-English reads on lab results, labels and the law.",
          "Herbal Holland is members only, for adults 18+, and joining Herbal Holland Rewards is free: herbalholland.com",
          "Holland, meet the Hills.",
        ),
      },
      {
        key: "windmill", day: 2, time: "12:30", channel: "SOCIAL",
        text: "Why a windmill? It's two things at once: a Dutch windmill and a four-petal flower. The ring is open at the bottom, where the tower stands. We drew it from our first store-window poster. #HerbalHolland",
        card: { template: "headline", headline: "Why a windmill?", sub: "A Dutch windmill and a four-petal flower, drawn from our first window poster." },
      },
      {
        key: "flat", day: 4, time: "08:30", channel: "SOCIAL",
        text: "Holland is famously flat. KwaZulu-Natal isn't. Our next two stores are in hill towns: Hillcrest looks over the Valley of a Thousand Hills, and Hilton sits in the Midlands hills. The windmill is coming to the hills. #HollandMeetsTheHills #KZN",
        card: { template: "reveal", headline: "Holland is flat. KwaZulu-Natal isn't." },
      },
      {
        key: "learn-rewards", day: 5, time: "09:00", channel: "SOCIAL",
        text: "Herbal Holland Rewards, simply: it's free for adults 18+, and it's how you shop with us. Members get instant savings on eligible items, earn points on every rand and climb from Seed to Harvest, in every store and online. The guide is in Learn: link in bio. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "Rewards, simply.", sub: "Free for adults 18+: instant savings, points on every rand, Seed to Harvest." },
      },
      {
        key: "channel-week-one", day: 7, time: "09:30", channel: "WHATSAPP",
        text: paras(
          "One week of Holland, meet the Hills. Siyabonga for following along.",
          "This week, The Windmill, our monthly newsletter, goes to Herbal Holland Rewards members for the first time: the story so far, how our merch is made, and three Learn reads to start with.",
          "Not a member yet? Joining is free, for adults 18+: herbalholland.com",
        ),
      },
      {
        key: "heritage", day: 7, time: "12:30", channel: "SOCIAL",
        text: "Dutch heritage: the coffee-shop tradition of a warm welcome and knowing exactly what you're offering. African soil: South African growers, makers and places, the bigger half of who we are. That's the whole idea. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "headline", headline: "Dutch heritage · African soil.", sub: "A warm welcome, rooted in South African growers, makers and places." },
      },
      {
        key: "windmill-no-1", day: 8, time: "10:00", channel: "EMAIL",
        title: "The Windmill, No. 1: Holland, meet the Hills",
        text: paras(
          "Hi {{firstName}},",
          "Welkom to the first edition of The Windmill, our newsletter for Herbal Holland Rewards members. Once a month, we'll share what's new, what's on and something worth reading.",
          "Holland, meet the Hills. Holland is famously flat. KwaZulu-Natal isn't. Our next two stores are in hill towns, Hillcrest and Hilton, and the windmill is on its way.",
          "Wear the windmill. Our merch, from the Windmill Tee to the Sunset Hoodie, is available online and in store.",
          "Learn picks. Three short reads to start with: how Rewards works, how to read a lab result, and what Schedule 0 on a label means. Plain English, no hype.",
          "Founding Members. The first 2,026 people on our list get a numbered card and Sprout-tier savings for 14 months. Every friend who joins with your link moves you up 250 places: your link is in the Rewards app.",
          "See you next month,\nThe Herbal Holland team",
        ),
      },
      {
        key: "tee", day: 9, time: "12:30", channel: "SOCIAL",
        text: "The Windmill Tee: the windmill in Sunset orange on the chest and our store-window poster across the back, on black. Available online and in store. #HerbalHolland",
        card: { template: "merch", image: "windmill-tee", headline: "The Windmill Tee", sub: "The windmill on the chest, our window poster on the back." },
      },
      {
        key: "learn-lab", day: 11, time: "09:00", channel: "SOCIAL",
        text: "How to read a lab result in a minute: potency, the terpene list, and the safety tests every batch should pass (microbes, pesticides, heavy metals, solvents). Every one of our batches has a public lab page: scan the QR on the pack. The full guide is in Learn. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "Read a lab result in a minute.", sub: "Potency, terpenes, and the safety tests every batch should pass." },
      },
      {
        key: "founding", day: 12, time: "12:30", channel: "SOCIAL",
        text: "Founding Members: the first 2,026 people on our list get a numbered card and Sprout-tier savings for 14 months. Joining Herbal Holland Rewards is free, and every friend who joins with your link moves you up 250 places. Adults 18+. Link in bio. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Be one of the first 2,026.", sub: "A numbered card and Sprout-tier savings for 14 months. Free to join." },
      },
      {
        key: "learn-schedule-0", day: 14, time: "09:00", channel: "SOCIAL",
        text: "Schedule 0, simply: it's the rule that lets low-dose CBD products be sold without a prescription, with limits on strength and on what a label may claim. Every product page shows you those limits. More in Learn. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "Schedule 0, simply.", sub: "What the rule allows, the limits it sets, and what a label may claim." },
      },
      {
        key: "hoodie", day: 16, time: "12:30", channel: "SOCIAL",
        text: "The Sunset Hoodie: Sunset orange, with our lock-up on the chest and a sunset over the hills across the back. Available online and in store. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "merch", image: "sunset-hoodie", headline: "The Sunset Hoodie", sub: "A sunset over the hills across the back. Online and in store." },
      },
      {
        key: "hills-we-love", day: 18, time: "17:30", channel: "SOCIAL",
        text: "Things we already love about the hills: the view over the Valley of a Thousand Hills, Midlands mist, and people who stop to say hello. See you soon. #HollandMeetsTheHills #KZNMidlands",
        card: { template: "headline", headline: "The view, the mist, the hello.", sub: "Things we already love about the hills." },
      },
      {
        key: "turning", day: 20, time: "08:30", channel: "SOCIAL",
        text: "Something's turning in the hills. #HollandMeetsTheHills",
        card: { template: "reveal", headline: "Something's turning in the hills." },
      },
    ],
  },
  {
    key: "shop-launch",
    name: "Online shop launch",
    blurb: "A week either side of the online shop opening: the teaser, opening day for adults 18+ anywhere in South Africa, how delivery and the ID check work, made-to-order merch and a thank-you. Social never sells: it's the shop, Learn, merch and Rewards.",
    store: false,
    anchor: "The shop opens",
    items: [
      {
        key: "teaser", day: -7, time: "12:30", channel: "SOCIAL",
        text: "One week to go. On {date}, our online shop opens for adults 18+ anywhere in South Africa: Herbal Holland Rewards, Learn, and merch made to order in Cape Town, delivered nationwide. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "countdown", headline: "7 days", sub: "until our online shop opens, for adults 18+ anywhere in South Africa." },
      },
      {
        key: "members-only", day: -3, time: "12:30", channel: "SOCIAL",
        text: "Why members only? Everyone who shops with us is a member of Herbal Holland Rewards. It's free, it's how we keep everything we do for adults 18+, and your Rewards work online and in every store. Join when the shop opens on {date}. #HerbalHolland",
        card: { template: "headline", headline: "Members only. Free to join.", sub: "Herbal Holland Rewards keeps everything we do for adults 18+." },
      },
      {
        key: "tomorrow", day: -1, time: "17:00", channel: "SOCIAL",
        text: "Tomorrow, we open online for adults 18+ anywhere in South Africa. Join Herbal Holland Rewards free, find your feet in Learn, and see our merch, made to order in Cape Town. Link in bio. #HerbalHolland",
        card: { template: "headline", eyebrow: "Herbal Holland online", headline: "Open tomorrow.", sub: "{date}, for adults 18+ anywhere in South Africa." },
      },
      {
        key: "open", day: 0, time: "09:00", channel: "SOCIAL",
        text: "Welkom! Herbal Holland is open online, for adults 18+ anywhere in South Africa. Dutch heritage, African soil, delivered nationwide. Join Herbal Holland Rewards free: link in bio. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "headline", eyebrow: "Now open online", headline: "Welkom. We're open.", sub: "For adults 18+ anywhere in South Africa." },
      },
      {
        key: "channel-open", day: 0, time: "09:30", channel: "WHATSAPP",
        text: paras(
          "Welkom! Herbal Holland is open online, for adults 18+ anywhere in South Africa.",
          "It's members only, and joining Herbal Holland Rewards is free. You'll also find Learn, our plain-English reads, and our merch, made for you in Cape Town.",
          "herbalholland.com",
        ),
      },
      {
        key: "email-open", day: 0, time: "10:00", channel: "EMAIL",
        title: "We're open online, for adults 18+ across South Africa",
        text: paras(
          "Hi {{firstName}},",
          "Herbal Holland is open online from today, for members aged 18 and over anywhere in South Africa.",
          "Your Rewards work online just as they do in store. We courier to a street address anywhere in the country, usually in 2–4 working days, and hand your parcel only to you: everything we sell is for adults 18+, so the courier may ask to see your ID.",
          "Made here. Our merch is made to order in Cape Town, embroidered or printed when you order it, and couriered on its own in 5–8 working days.",
          "New to Learn? Start with three short reads: how Rewards works, how to read a lab result, and what Schedule 0 on a label means.",
          "Welkom, and thank you for being here from day one.\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-open", day: 0, time: "10:00", channel: "PUSH",
        title: "We're open online.",
        text: "Herbal Holland now delivers anywhere in South Africa, for members 18+. Explore the shop, Learn and our merch.",
      },
      {
        key: "delivery", day: 2, time: "12:30", channel: "SOCIAL",
        text: "How delivery works: we courier to a street address anywhere in South Africa, usually in 2–4 working days. Everything we sell is for adults 18+, so we hand your parcel only to the member named on the order, and the courier may ask to see your ID. Please be there to receive it: it can't be left with a neighbour, at reception or at the door. We'll text you the tracking number when it's on its way. #HerbalHolland",
        short: "How delivery works: we courier anywhere in South Africa and hand your parcel only to the member named on the order. Everything we sell is for adults 18+, so the courier may ask to see your ID. Be there to receive it. #HerbalHolland",
        card: {
          template: "promise",
          headline: "How delivery works",
          lines: ["Couriered anywhere in South Africa", "Handed only to the member named on the order", "Adults 18+: the courier may ask to see your ID", "Be there: it can't be left at the door", "Tracking by SMS when it's on its way"],
        },
      },
      {
        key: "merch", day: 4, time: "12:30", channel: "SOCIAL",
        text: "Every Windmill Cap is embroidered when you order it: thousands of stitches, one cap, no warehouse of stock waiting. All our merch is made to order in Cape Town and couriered to you in 5–8 working days. #HerbalHolland #MadeInSA",
        card: { template: "merch", image: "windmill-cap", headline: "Made when you order it.", sub: "The Windmill Cap, embroidered in Cape Town, one at a time." },
      },
      {
        key: "thank-you", day: 7, time: "12:30", channel: "SOCIAL",
        text: "One week online. Siyabonga, South Africa, to everyone who joined Herbal Holland Rewards and found us in our first week. We're just getting started. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "headline", headline: "Siyabonga, South Africa.", sub: "Thank you for our first week online." },
      },
    ],
  },
  {
    key: "store-opening",
    name: "Store opening",
    blurb: "From the reveal five weeks out to the thank-you after Open Day: the Good Neighbour Promise, the team, invitations, the countdown, opening day on every channel, the Members' Evening and Open Day. Store news only, never an offer.",
    store: true,
    anchor: "Doors open, 09:00",
    items: [
      {
        key: "reveal", day: -36, time: "08:00", channel: "SOCIAL",
        text: "{town}, we're your new neighbours. {store} opens on {date} at {address}: free Rewards, a pharmacist on the team, and every batch lab-tested. Adults 18+. #HerbalHolland",
        card: { template: "reveal", headline: "Something's turning in {town}." },
      },
      {
        key: "sms-reveal", day: -35, time: "10:00", channel: "SMS",
        text: "Hi {{firstName}}, {store} opens on {date} at {address}. See you there! Adults 18+.",
      },
      {
        key: "promise", day: -34, time: "12:30", channel: "SOCIAL",
        text: "Our Good Neighbour Promise, {town}: adults 18+ only, ID checked at the door and the till, nothing consumed on or outside our premises, no queues on the pavement, good security and lighting, and a direct line to the manager, with a reply within one working day. #HerbalHolland",
        short: "Our Good Neighbour Promise, {town}: adults 18+ only, ID at the door and the till, nothing consumed on or outside our premises, no queues on the pavement, and a direct line to the manager. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Our Good Neighbour Promise to {town}",
          lines: ["Adults 18+ only, with ID at the door and the till", "Nothing consumed on or outside our premises", "No queues on the pavement", "Good security and lighting", "A direct line to the manager, a reply in a working day"],
        },
      },
      {
        key: "team", day: -27, time: "12:30", channel: "SOCIAL",
        text: "The people you'll meet at {store}: member advisors to welcome you, check your ID and answer your questions in plain English, a store manager you can phone directly, and a pharmacist on the team. We open on {date}. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Meet the team", headline: "Warm welcomes. Straight answers.", sub: "The {town} team opens the doors on {date}." },
      },
      {
        key: "invite", day: -20, time: "10:00", channel: "SOCIAL",
        text: "You're invited. We open on {date}, and in our opening week {store} hosts a Members' Evening, 18:00–20:30, with good coffee, stroopwafels and a first look around for Herbal Holland Rewards members, then an Open Day, 09:00–14:00, for everyone 18+. ID at the door. The dates and RSVPs are in the Rewards app. #HerbalHolland",
        short: "You're invited: a Members' Evening (18:00–20:30) and an Open Day (09:00–14:00) in the opening week of {store}. Adults 18+, ID at the door. Dates and RSVPs in the Rewards app. #HerbalHolland",
        card: { template: "event", eyebrow: "You're invited", headline: "Opening week at {store}", sub: "Members' Evening 18:00–20:30 · Open Day 09:00–14:00 · RSVP in the app" },
      },
      {
        key: "push-invite", day: -20, time: "10:00", channel: "PUSH",
        title: "You're invited.",
        text: "A Members' Evening and an Open Day in {store}'s opening week. RSVP in the Rewards app: spaces are limited.",
      },
      {
        key: "sms-invite", day: -20, time: "12:00", channel: "SMS",
        text: "{{firstName}}, you're invited! In its opening week, {store} hosts a Members' Evening (18:00 to 20:30) and an Open Day (09:00 to 14:00). Dates and RSVP in the Rewards app. Adults 18+, ID at the door.",
      },
      {
        key: "open-day", day: -15, time: "12:30", channel: "SOCIAL",
        text: "Open Day at {store}, in our opening week, 09:00–14:00: a coffee cart, local makers' tables, ask-the-pharmacist sessions on the hour, a photo wall in our orange frame and the embroidered collection. Everyone 18+ is welcome, ID at the door. #HerbalHolland",
        card: { template: "event", eyebrow: "Open Day", headline: "Opening week, 09:00–14:00", sub: "{store}. Coffee, local makers and the team. Adults 18+." },
      },
      {
        key: "google-opening", day: -14, time: "10:00", channel: "GOOGLE",
        text: "Herbal Holland is coming to {town}. {store} opens on {date} at {address}. Our stores are for members aged 18 and over, and joining Herbal Holland Rewards is free, online or at the till. In our opening week: a Members' Evening for members, and an Open Day, 09:00–14:00, for everyone 18+, with coffee, local makers and the team.",
      },
      {
        key: "neighbourhood", day: -11, time: "12:30", channel: "SOCIAL",
        text: "{town}, tell us about the neighbourhood: your favourite breakfast spot, walk or view. We'll visit every one before we open. #HerbalHolland",
        card: { template: "headline", headline: "{town}, show us around.", sub: "Your favourite breakfast spot, walk or view. Tell us below." },
      },
      {
        key: "countdown", day: -7, time: "08:00", channel: "SOCIAL",
        text: "Seven days to go. {store} opens on {date} at 09:00, at {address}. Opening hours: {hours}. Adults 18+, bring your ID. #HerbalHolland",
        short: "Seven days to go: {store} opens on {date} at 09:00. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "countdown", headline: "7 days", sub: "until {store} opens its doors." },
      },
      {
        key: "google-hours", day: -7, time: "10:00", channel: "GOOGLE",
        text: "{store} opens on {date} at 09:00. Opening hours: {hours}. Find us at {address}. Herbal Holland is for members aged 18 and over: bring your ID, and join Herbal Holland Rewards free at the till if you haven't yet.",
      },
      {
        key: "tomorrow", day: -1, time: "12:00", channel: "SOCIAL",
        text: "Tomorrow at 09:00, our doors open in {town}. Bring your ID and come and say hello. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "{store}", headline: "Open tomorrow, 09:00.", sub: "{date}. Bring your ID and come and say hello." },
      },
      {
        key: "sms-tomorrow", day: -1, time: "12:00", channel: "SMS",
        text: "Hi {{firstName}}, {store} opens on {date} at 09:00, at {address}. Bring your ID and your Rewards number, and come and say hello! Adults 18+.",
      },
      {
        key: "google-open", day: 0, time: "08:30", channel: "GOOGLE",
        text: "Sivulile. We're open! {store} opens its doors at 09:00 today, at {address}. Opening hours: {hours}. Herbal Holland is for members aged 18 and over: bring your ID, and join Herbal Holland Rewards free at the till.",
      },
      {
        key: "open", day: 0, time: "09:00", channel: "SOCIAL",
        text: "Sivulile. We're open! {store} is open from 09:00 today, at {address}. Come and say sawubona. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "headline", eyebrow: "{store}", headline: "Sivulile. We're open.", sub: "From 09:00 today. Adults 18+, bring your ID." },
      },
      {
        key: "push-open", day: 0, time: "09:00", channel: "PUSH",
        title: "Sivulile. We're open!",
        text: "{store} is open from 09:00 today. Bring your ID and come and say hello.",
      },
      {
        key: "email-open", day: 0, time: "09:05", channel: "EMAIL",
        title: "Sivulile. We're open in {town}.",
        text: paras(
          "Hi {{firstName}},",
          "Sivulile: {store} is open. Our doors opened at 09:00 today, at {address}.",
          "Opening hours: {hours}.",
          "Your first visit: bring your ID, because we check it at the door and the till, every time. A member advisor will show you around and answer your questions in plain English, and there's a pharmacist on the team. Give your Rewards number at the till.",
          "In our opening week: the Members' Evening, 18:00–20:30, for members who have RSVP'd in the Rewards app, and Open Day, 09:00–14:00, for everyone 18+, with coffee, local makers and the team. You'll find the dates in the app.",
          "See you soon,\nThe {store} team",
        ),
      },
      {
        key: "channel-open", day: 0, time: "09:30", channel: "WHATSAPP",
        text: paras(
          "Sivulile. We're open! {store} opened its doors at 09:00 today, at {address}.",
          "Opening hours: {hours}.",
          "In our opening week: a Members' Evening for Herbal Holland Rewards members, and an Open Day, 09:00–14:00, for everyone 18+. Bring your ID, and come and say sawubona.",
        ),
      },
      {
        key: "day-one", day: 0, time: "18:30", channel: "SOCIAL",
        text: "Day one, done. Siyabonga, {town}, for such a warm welcome. #HerbalHolland",
        card: { template: "headline", headline: "Day one, done.", sub: "Siyabonga, {town}." },
      },
      {
        key: "evening", day: 2, time: "12:30", channel: "SOCIAL",
        text: "Tonight: the Members' Evening at {store}, 18:00–20:30. Good coffee, stroopwafels and a first look around with the team. For members who have RSVP'd, adults 18+, ID at the door. #HerbalHolland",
        card: { template: "event", eyebrow: "Members' Evening", headline: "Tonight", sub: "18:00–20:30 at {store}. Members only, ID at the door." },
      },
      {
        key: "google-open-day", day: 4, time: "08:00", channel: "GOOGLE",
        text: "Open Day at {store} today, 09:00–14:00: coffee, local makers and the team, at {address}. Everyone 18+ is welcome: bring your ID.",
      },
      {
        key: "open-day-today", day: 4, time: "08:00", channel: "SOCIAL",
        text: "Open Day is on at {store} today, 09:00–14:00: coffee, local makers, ask-the-pharmacist sessions on the hour, and a photo wall in our orange frame. Everyone 18+ is welcome. Bring your ID. #HerbalHolland",
        card: { template: "event", eyebrow: "Open Day", headline: "Today", sub: "09:00–14:00 at {store}. Adults 18+, bring your ID." },
      },
      {
        key: "sms-open-day", day: 4, time: "09:00", channel: "SMS",
        text: "Hi {{firstName}}, it's Open Day at {store} today until 14:00: coffee, local makers and the team. Adults 18+, bring your ID.",
      },
      {
        key: "thank-you", day: 11, time: "12:30", channel: "SOCIAL",
        text: "Siyabonga, {town}. Thank you to everyone who came to say hello in our first week, and to the local makers who joined us on Open Day. See you soon. #HerbalHolland",
        card: { template: "headline", headline: "Siyabonga, {town}.", sub: "Thank you for a warm first week." },
      },
    ],
  },
  {
    key: "founding-members",
    name: "Founding Members",
    blurb: "The last four weeks of the Founding Members list: how it works, moving up with your link, one week to go, last call and the numbers. No live counts: members see their own place in the Rewards app.",
    store: false,
    anchor: "The list closes at midnight",
    items: [
      {
        key: "how-it-works", day: -28, time: "09:00", channel: "SOCIAL",
        text: "Founding Members: the first 2,026 people on our list get a numbered card and Sprout-tier savings for 14 months. Joining Herbal Holland Rewards is free, and every friend who joins with your link moves you up 250 places. The list closes on {date}. Adults 18+. Link in bio. #HerbalHolland",
        short: "Founding Members: the first 2,026 on our list get a numbered card and Sprout-tier savings for 14 months. Free to join, adults 18+. The list closes on {date}. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Be one of the first 2,026.", sub: "A numbered card and Sprout-tier savings for 14 months. Free to join." },
      },
      {
        key: "email-how", day: -27, time: "10:00", channel: "EMAIL",
        title: "Founding Members: be one of the first 2,026",
        text: paras(
          "Hi {{firstName}},",
          "The Founding Members list closes at 23:59 on {date}, and you're already on it: every member who joins before then has a place, in the order they joined.",
          "The first 2,026 places become Founding Members, with a numbered card in the Rewards app and at least our Sprout tier for 14 months: Sprout-tier savings on eligible items and early access to selected drops. Founding Members are invited to a Founding Members' Evening every December, too.",
          "Move up the list: every friend who joins with your link moves you up 250 places, and you both get 50 points on their first purchase. Your link and your place are in the Rewards app.",
          "See you on the list,\nThe Herbal Holland team",
        ),
      },
      {
        key: "move-up", day: -21, time: "12:30", channel: "SOCIAL",
        text: "Move up the Founding Members list: every friend who joins Herbal Holland Rewards with your link moves you up 250 places. The first 2,026 places get a numbered card when the list closes on {date}. Free, adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Bring a friend. Move up 250 places.", sub: "Share your link from the Rewards app." },
      },
      {
        key: "push-move-up", day: -20, time: "10:00", channel: "PUSH",
        title: "Move up the list",
        text: "Every friend who joins with your link moves you up 250 places. The Founding Members list closes on {date}.",
      },
      {
        key: "what-you-get", day: -14, time: "12:30", channel: "SOCIAL",
        text: "What Founding Members get: a numbered card in the Rewards app, Sprout-tier savings for 14 months, early access to selected drops, and an invitation to a Founding Members' Evening every December. Joining is free, for adults 18+. The list closes on {date}. #HerbalHolland",
        short: "What Founding Members get: a numbered card, Sprout-tier savings for 14 months, early access to selected drops and a Founding Members' Evening every December. Free, adults 18+. The list closes on {date}. #HerbalHolland",
        card: {
          template: "promise",
          headline: "What Founding Members get",
          lines: ["A numbered card in the Rewards app", "Sprout-tier savings for 14 months", "Early access to selected drops", "A Founding Members' Evening every December", "Free to join, for adults 18+"],
        },
      },
      {
        key: "bring-a-friend", day: -10, time: "17:30", channel: "SOCIAL",
        text: "Know someone who'd like Herbal Holland? Send them your link: when they join Herbal Holland Rewards, you move up 250 places on the Founding Members list. Joining is free, for adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Your link, your place.", sub: "Every friend who joins with it moves you up 250 places." },
      },
      {
        key: "one-week", day: -7, time: "09:00", channel: "SOCIAL",
        text: "One week to go. The Founding Members list closes at midnight on {date}, and the first 2,026 places get a numbered card and Sprout-tier savings for 14 months. Join Herbal Holland Rewards free: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", headline: "7 days", sub: "until the Founding Members list closes." },
      },
      {
        key: "channel-one-week", day: -7, time: "09:30", channel: "WHATSAPP",
        text: paras(
          "One week to go: the Founding Members list closes at midnight on {date}.",
          "The first 2,026 members of Herbal Holland Rewards become Founding Members, each with a numbered Founding Member card. Joining is free, for adults 18+, and every friend who joins with your link moves you up 250 places.",
          "Join at herbalholland.com",
        ),
      },
      {
        key: "email-one-week", day: -6, time: "10:00", channel: "EMAIL",
        title: "One week to go: the Founding Members list closes {date}",
        text: paras(
          "Hi {{firstName}},",
          "The Founding Members list closes at 23:59 on {date}. You're on it, and your place is in the Rewards app.",
          "The first 2,026 places become Founding Members, with a numbered card and at least our Sprout tier for 14 months.",
          "To move up, share your link: every friend who joins with it moves you up 250 places, and you both get 50 points on their first purchase.",
          "Siyabonga,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-last-call", day: -1, time: "11:00", channel: "PUSH",
        title: "Last call, Founding Members.",
        text: "The Founding Members list closes at 23:59 on {date}. Share your link to move up 250 places.",
      },
      {
        key: "last-call", day: 0, time: "08:00", channel: "SOCIAL",
        text: "Last call: the Founding Members list closes at midnight tonight. Join Herbal Holland Rewards free in the Rewards app. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Last call.", sub: "The list closes at midnight tonight." },
      },
      {
        key: "numbers-in", day: 1, time: "09:00", channel: "SOCIAL",
        text: "Founding Members, your numbers are in: open the Rewards app to see your card. Thank you for being first. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Your numbers are in.", sub: "Open the Rewards app to see your card. Thank you for being first." },
      },
      {
        key: "push-numbers", day: 1, time: "10:00", channel: "PUSH",
        title: "The numbers are in.",
        text: "Founding Members: open the app to see your numbered card. Thank you for being first.",
      },
      {
        key: "email-numbers", day: 1, time: "10:00", channel: "EMAIL",
        title: "The Founding Members numbers are in",
        text: paras(
          "Hi {{firstName}},",
          "The Founding Members list has closed, and the numbers are in.",
          "If your place was in the first 2,026, your numbered Founding Member card is in the Rewards app now. You hold at least our Sprout tier for the next 14 months, with early access to selected drops, and you're invited to a Founding Members' Evening every December.",
          "If you joined a little later, thank you for being here early. Your Rewards work in every store and online, and you can climb from Seed to Harvest as you go.",
          "Siyabonga,\nThe Herbal Holland team",
        ),
      },
    ],
  },
  {
    key: "hiring",
    name: "Hiring",
    blurb: "Member advisors and store managers: the call, the roles, a reminder and the last day, on social (LinkedIn included) and the WhatsApp Channel.",
    store: false,
    anchor: "Applications close",
    items: [
      {
        key: "hiring", day: -16, time: "08:30", channel: "SOCIAL",
        text: "We're hiring member advisors and store managers. We're looking for warm people who like explaining things simply, and we'll train you from day one. Applications close on {date}. Apply at herbalholland.com/careers and tell us which store you'd like to work in. #HerbalHolland",
        card: { template: "headline", eyebrow: "Careers", headline: "We're hiring.", sub: "Member advisors and store managers. Applications close {date}." },
      },
      {
        key: "channel-hiring", day: -16, time: "09:30", channel: "WHATSAPP",
        text: paras(
          "We're hiring! Herbal Holland is looking for member advisors and store managers: warm people who like explaining things simply. We'll train you from day one.",
          "Applications close on {date}. Send us your CV at herbalholland.com/careers, and tell us which store you'd like to work in.",
          "We never charge to apply. If anyone asks you for money for a job with Herbal Holland, it isn't us.",
        ),
      },
      {
        key: "advisors", day: -14, time: "12:30", channel: "SOCIAL",
        text: "What does a member advisor do? They're the first person a member meets: a warm welcome, an ID check, and clear, plain-English answers to their questions. If that sounds like you, apply by {date} at herbalholland.com/careers #HerbalHolland",
        card: { template: "headline", eyebrow: "We're hiring", headline: "Member advisors", sub: "A warm welcome, an ID check, and clear, plain-English answers." },
      },
      {
        key: "managers", day: -11, time: "12:30", channel: "SOCIAL",
        text: "Store managers run the store and the team: rosters, stock, cash-ups, the neighbours and the standards. Every Herbal Holland store is owned by a local franchisee, so the job is close to home, with the whole network behind you. Apply by {date} at herbalholland.com/careers #HerbalHolland",
        short: "Store managers run the store and the team: rosters, stock, cash-ups, the neighbours and the standards. A job close to home, with the whole network behind you. Apply by {date} at herbalholland.com/careers #HerbalHolland",
        card: { template: "headline", eyebrow: "We're hiring", headline: "Store managers", sub: "Run the store and the team, close to home, with the network behind you." },
      },
      {
        key: "reminder", day: -9, time: "12:30", channel: "SOCIAL",
        text: "A reminder: applications for member advisors and store managers close on {date}. We read every application, and we never charge to apply. herbalholland.com/careers #HerbalHolland",
        card: { template: "countdown", headline: "9 days", sub: "to apply: member advisors and store managers." },
      },
      {
        key: "why-us", day: -4, time: "12:30", channel: "SOCIAL",
        text: "Why work with us? Standards to be proud of: every batch lab-tested, members only, ID every time. Training from day one. Tills that keep going through load-shedding. And a job close to home, with the whole network behind you. Applications close on {date}: herbalholland.com/careers #HerbalHolland",
        short: "Why work with us? Standards to be proud of, training from day one, tools that work, and a job close to home with the whole network behind you. Applications close on {date}: herbalholland.com/careers #HerbalHolland",
        card: {
          template: "promise",
          headline: "Why work with Herbal Holland",
          lines: ["Standards to be proud of", "Training from day one", "Tills that keep going through load-shedding", "A job close to home", "The whole network behind you"],
        },
      },
      {
        key: "last-day", day: 0, time: "08:30", channel: "SOCIAL",
        text: "Last day to apply: applications for member advisors and store managers close today. Thank you to everyone who has applied so far. We're reading every application. herbalholland.com/careers #HerbalHolland",
        card: { template: "headline", eyebrow: "Careers", headline: "Last day to apply.", sub: "Thank you to everyone who has applied. We're reading every one." },
      },
    ],
  },
  {
    key: "merch-drop",
    name: "Merch drop",
    blurb: "A teaser three days out, drop day with members first from 10:00, and the last day. Made to order in Cape Town; no prices on social. Choose the picture for the piece.",
    store: false,
    anchor: "The drop opens, 10:00",
    items: [
      {
        key: "teaser", day: -3, time: "12:30", channel: "SOCIAL",
        text: "Something new from the windmill. Our next merch drop opens on {date} at 10:00, for Herbal Holland Rewards members first. Made to order in Cape Town. Adults 18+. #HerbalHolland #MadeInSA",
        card: { template: "headline", eyebrow: "Merch drop", headline: "Something new from the windmill.", sub: "The drop opens {date}, 10:00. Members first." },
      },
      {
        key: "eve", day: -1, time: "17:30", channel: "SOCIAL",
        text: "Tomorrow at 10:00, the drop opens to members first. Not a member yet? Joining Herbal Holland Rewards is free, for adults 18+. Link in bio. #HerbalHolland",
        card: { template: "headline", eyebrow: "Merch drop", headline: "Tomorrow, 10:00.", sub: "Members first. Joining Herbal Holland Rewards is free." },
      },
      {
        key: "open", day: 0, time: "10:00", channel: "SOCIAL",
        text: "Drop day. From 10:00, Herbal Holland Rewards members get first access: made to order in Cape Town, embroidered or printed when you order it, and couriered to you in 5–8 working days. Adults 18+. Link in bio. #HerbalHolland #MadeInSA",
        card: { template: "merch", image: "heritage-crewneck", headline: "Drop day.", sub: "Members first, from 10:00. Made to order in Cape Town." },
      },
      {
        key: "push-open", day: 0, time: "10:00", channel: "PUSH",
        title: "Drop day.",
        text: "Members get first access from 10:00 today. See the drop in the app: made to order in Cape Town.",
      },
      {
        key: "email-open", day: 0, time: "10:00", channel: "EMAIL",
        title: "Drop day: members first",
        text: paras(
          "Hi {{firstName}},",
          "Our new drop opens to Herbal Holland Rewards members first, from 10:00 today. The drops page shows when it opens for you.",
          "Every piece is made to order in Cape Town: embroidered or printed when you order it, and couriered to you on its own in 5–8 working days.",
          "The drop runs for three days, so don't leave it too late.",
          "Wear the windmill,\nThe Herbal Holland team",
        ),
      },
      {
        key: "made", day: 1, time: "12:30", channel: "SOCIAL",
        text: "Behind the drop: nothing waits in a warehouse. Each piece is made when a member orders it, embroidered or printed in Cape Town, one at a time. #HerbalHolland #MadeInSA",
        card: { template: "headline", headline: "Made when you order it.", sub: "Embroidered or printed in Cape Town, one piece at a time." },
      },
      {
        key: "last-day", day: 2, time: "09:00", channel: "SOCIAL",
        text: "Last day of the drop: it closes tonight. Made to order in Cape Town, for Herbal Holland Rewards members. Adults 18+. Link in bio. #HerbalHolland #MadeInSA",
        card: { template: "headline", eyebrow: "Merch drop", headline: "Last day.", sub: "The drop closes tonight." },
      },
      {
        key: "push-last-day", day: 2, time: "10:00", channel: "PUSH",
        title: "Last day of the drop",
        text: "The drop closes tonight. See it in the Rewards app: made to order in Cape Town, for members.",
      },
    ],
  },
];
