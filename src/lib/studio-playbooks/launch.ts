// The launch, in its order: the brand, then the online shop, then the stores' doors; with them the Founding Members
// list, hiring and merch drops. Each says only what's true by its day (see ./index.ts for the house rules).
// Laid out for 2026 (brand Tue 13 Oct, applications close Fri 30 Oct, shop Tue 27 Oct, doors Tue 1 Dec with Hillcrest
// first and Hilton a week behind, the list closes Sun 6 Dec, the Founding Members' Drop opens Thu 10 Dec), their feed
// posts take turns: one a day across all six (opening day's pinned pair aside) and five a week at most, the WhatsApp
// Channel one a week (tests/studio-calendar.test.ts).
import type { Playbook } from "../studio";
import { paras } from "./shared";

export const LAUNCH: Playbook[] = [
  {
    key: "brand-launch",
    name: "Brand launch: Holland, meet the Hills",
    blurb: "Our first two weeks on social, before the shop opens: who we are, the windmill, the hills, Learn, Rewards and the Windmill Tee, each post pointing to first access at herbalholland.com.",
    store: false,
    anchor: "Our accounts go live",
    weekday: 2,
    why: "so its two weeks lead into the online shop opening on a Tuesday",
    items: [
      {
        key: "welkom", day: 0, time: "07:00", channel: "SOCIAL",
        text: paras(
          "Welkom, and sawubona. We're Herbal Holland.",
          "We're a members-only wellness retailer for adults 18+, with Dutch heritage and our feet in African soil. We like a warm welcome, plain answers and knowing exactly what's on the shelf, so every batch we sell is lab-tested, with a public lab page you can check for yourself. Our online shop opens soon, and our stores in Hillcrest and Hilton follow.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Welkom, and sawubona. We're Herbal Holland: a members-only wellness retailer for adults 18+. Every batch is lab-tested, with a public lab page. Our online shop opens soon, and our stores in Hillcrest and Hilton follow. Get first access: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "reveal", eyebrow: "Welkom · Sawubona", headline: "Holland, meet the Hills.", sub: "Dutch heritage · African soil." },
      },
      {
        key: "channel-welkom", day: 0, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Welkom, and sawubona: this is the Herbal Holland Channel.",
          "We're a members-only wellness retailer for adults 18+, with Dutch heritage and our feet in African soil. Our online shop opens soon, and our stores in Hillcrest and Hilton follow.",
          "Follow the Channel for our news: opening days, events, new merch, and Learn, our plain-English reads on lab results, labels and the law.",
          "Want to hear the day the shop opens? Get first access at herbalholland.com. Adults 18+.",
        ),
      },
      {
        key: "how-we-work", day: 1, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: paras(
          "Why we're building Herbal Holland the way we are.",
          "Standards you can check. Every batch we sell is lab-tested, and every batch has a public lab page: scan the QR on the pack to see what the lab measured and what it screened for.",
          "Members only. Everyone who shops with us is a member of Herbal Holland Rewards, free to join for adults 18+. It's how we keep what we do for adults only: we check your age when you join, and your ID at the door and the till.",
          "Plain English. No medical claims and no hype. Learn, our library of short reads on lab results, labels and the law as it stands, says what we know and how we know it.",
          "Our online shop opens soon, and our stores in Hillcrest and Hilton, in KwaZulu-Natal, follow. Get first access at herbalholland.com. Adults 18+. #HerbalHolland",
        ),
        short: "Why we're building Herbal Holland this way: every batch lab-tested, with a public lab page; members only, free to join for adults 18+; plain English, with no medical claims and no hype. Get first access at herbalholland.com. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "How we work", headline: "Standards you can check.", sub: "Lab-tested batches with public lab pages. Members only. Plain English." },
      },
      {
        key: "windmill", day: 1, time: "19:00", channel: "SOCIAL",
        text: paras(
          "Why a windmill? It's two things at once: a Dutch windmill and a four-petal flower. The ring is open at the bottom, where the tower stands. We drew it from our first store-window poster.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland",
        ),
        card: { template: "headline", eyebrow: "The mark", headline: "Why a windmill?", sub: "A Dutch windmill and a four-petal flower, drawn from our first window poster." },
        brief: "Reel, 15–25 seconds: the windmill mark drawn stroke by stroke in Sunset orange on warm black: the four petals, then the tower, then the ring, left open at the bottom. No people, no products; end on 'Holland, meet the Hills.'",
      },
      {
        key: "flat", day: 3, time: "19:00", channel: "SOCIAL",
        text: paras(
          "Holland is famously flat. KwaZulu-Natal isn't.",
          "Our stores are coming to two hill towns: Hillcrest, in the Upper Highway near the Valley of a Thousand Hills, and Hilton, in the KZN Midlands. The windmill is heading for the hills.",
          "Get first access: link in bio. Adults 18+. #HollandMeetsTheHills #HerbalHolland #KZN",
        ),
        short: "Holland is famously flat. KwaZulu-Natal isn't. Our stores are coming to two hill towns: Hillcrest, near the Valley of a Thousand Hills, and Hilton, in the KZN Midlands. Get first access: link in bio. Adults 18+. #HollandMeetsTheHills",
        card: { template: "reveal", eyebrow: "Holland, meet the Hills", headline: "Holland is flat. KwaZulu-Natal isn't." },
        brief: "Reel, 20–30 seconds: a flat polder with a windmill on the horizon, then a cut to the Valley of a Thousand Hills at golden hour and Midlands mist in the morning, the windmill mark turning over the ridges. End on 'Holland, meet the Hills.'",
      },
      {
        key: "learn-lab", day: 4, time: "09:00", channel: "SOCIAL",
        text: paras(
          "Read a lab result in a minute.",
          "Every batch we sell has a public lab page: scan the QR on the pack for the certificate behind that exact batch. Look for three things. The potency. The terpene list, which is the aroma profile. And the safety panels every batch should pass: microbes, pesticides, heavy metals and mycotoxins. PASS means the lab measured each one below its limit.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Read a lab result in a minute: the potency, the terpene list (the aroma profile) and the safety panels every batch should pass. Every batch we sell has a public lab page: scan the QR on the pack. Get first access: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "Read a lab result in a minute.", sub: "Potency, terpenes and the safety panels every batch should pass." },
        brief: "Carousel, 5 slides: 1 'Read a lab result in a minute'; 2 find the batch code and the QR on the label; 3 potency, as a percentage by weight; 4 the safety panels (microbes, pesticides, heavy metals, mycotoxins) and what PASS means; 5 terpenes, the aroma profile, and 'Scan the QR on the pack for its lab page'. Brand artwork, no product close-ups.",
      },
      {
        key: "rewards", day: 7, time: "07:00", channel: "SOCIAL",
        text: paras(
          "Herbal Holland Rewards, simply.",
          "Everyone who shops with us is a member, and joining is free for adults 18+: online, in the Rewards app or at the till. Members get instant savings on eligible items, points on every rand, and My Deals, a personal offer every Monday. Your card lives in the Rewards app on your phone, and there are four tiers to climb: Seed, Sprout, Bloom and Harvest.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Herbal Holland Rewards, simply: free to join for adults 18+, instant savings on eligible items, points on every rand, My Deals every Monday, and four tiers from Seed to Harvest. Get first access: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Rewards, simply.",
          lines: ["Free to join, for adults 18+", "Instant savings on eligible items", "Points on every rand", "My Deals: a personal offer every Monday", "Four tiers, from Seed to Harvest"],
        },
        brief: "Carousel, 5 slides: 1 'Rewards, simply'; 2 free to join for adults 18+, online, in the app or at the till; 3 instant savings on eligible items and points on every rand; 4 My Deals, a personal offer every Monday; 5 the four tiers, Seed, Sprout, Bloom and Harvest, on the card in the Rewards app.",
      },
      {
        key: "heritage", day: 8, time: "19:00", channel: "SOCIAL",
        text: paras(
          "Dutch heritage · African soil. That's the whole idea.",
          "Dutch heritage is a way of doing things: a warm welcome, and knowing exactly what's on the shelf. African soil is the bigger half: South African growers, makers and places, starting with the hills of KwaZulu-Natal.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Dutch heritage · African soil: a warm welcome and knowing exactly what's on the shelf, rooted in South African growers, makers and places, starting with the hills of KwaZulu-Natal. Get first access: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", headline: "Dutch heritage · African soil.", sub: "A warm welcome, rooted in South African growers, makers and places." },
        brief: "Photo or 5-slide carousel: South African makers at work (adults over 25, signed releases), the KZN hills and our orange window frame. No flags, ships or colonial imagery.",
      },
      {
        // No Channel post in week two: the Channel's one that week is hiring's (applications close as the shop opens).
        key: "tee", day: 9, time: "19:00", channel: "SOCIAL",
        text: paras(
          "The Windmill Tee.",
          "Black combed cotton, our windmill embroidered in Sunset orange on the chest, and our store-window poster printed across the back. It's made and in stock: online from the day our shop opens (coming soon), and in our stores when they open their doors.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "The Windmill Tee: black combed cotton, the windmill embroidered in Sunset orange on the chest, our store-window poster printed on the back. In stock: online from the day our shop opens, and in our stores. Get first access: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "merch", image: "windmill-tee", headline: "The Windmill Tee", sub: "Embroidered on the chest, our window poster on the back. In stock." },
        brief: "Photo or 20-second Reel: two or three adults over 25 (signed releases) wearing the Windmill Tee outdoors in the hills, front and back; natural light, no products in shot.",
      },
      {
        key: "hills", day: 12, time: "18:30", channel: "SOCIAL",
        text: paras(
          "Things we already love about the hills: the view over the Valley of a Thousand Hills, Midlands mist in the morning, and people who stop to say hello.",
          "See you soon.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills #KZN",
        ),
        card: { template: "reveal", headline: "The view, the mist, the hello.", sub: "Things we already love about the hills." },
        brief: "Reel, 20–40 seconds, or a 5-slide carousel: a lookout over the Valley of a Thousand Hills, mist on Midlands farmland, a farm stall and a local café, adults over 25 (signed releases) saying hello. Places and people, never products.",
      },
    ],
  },
  {
    key: "shop-launch",
    name: "Online shop launch",
    blurb: "The online shop opens for adults 18+ anywhere in South Africa: a Saturday teaser, opening day with the one promised message to the first-access list, how joining and delivery work, Founding Members, The Windmill No. 1 and the merch.",
    store: false,
    anchor: "The shop opens",
    weekday: 2,
    why: "after the payday weekend, with the working week ahead",
    items: [
      {
        key: "teaser", day: -3, time: "09:00", channel: "SOCIAL", pinned: true,
        text: paras(
          "Our online shop opens on {date}.",
          "From then, adults 18+ anywhere in South Africa can join Herbal Holland Rewards free, shop online and take a place on the Founding Members list. The first 2,026 places get a numbered Founding Member card.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Our online shop opens on {date}, for adults 18+ anywhere in South Africa: join Herbal Holland Rewards free and take a place on the Founding Members list. Get first access: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Coming on Tuesday", headline: "Our online shop opens.", sub: "{date}. For adults 18+ anywhere in South Africa." },
      },
      {
        key: "tomorrow", day: -1, time: "19:00", channel: "SOCIAL", pinned: true,
        text: paras(
          "Tomorrow, our online shop opens for adults 18+ anywhere in South Africa.",
          "Join Herbal Holland Rewards free and you'll have a place on the Founding Members list: the first 2,026 places get a numbered Founding Member card and at least Sprout tier for 14 months.",
          "Get first access: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Tomorrow, our online shop opens for adults 18+ anywhere in South Africa. Join Herbal Holland Rewards free and take a place on the Founding Members list. Get first access: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Herbal Holland online", headline: "Open tomorrow.", sub: "{date}. For adults 18+ anywhere in South Africa." },
      },
      {
        key: "open", day: 0, time: "07:00", channel: "SOCIAL", pinned: true, linkedin: "also",
        text: paras(
          "We're open online, for adults 18+ anywhere in South Africa.",
          "Herbal Holland is members only, and joining Herbal Holland Rewards is free. Join today and you'll have a place on the Founding Members list: the first 2,026 places get a numbered Founding Member card and at least Sprout tier for 14 months, and every friend who joins with your link moves you up 250 places.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "We're open online, for adults 18+ anywhere in South Africa. Join Herbal Holland Rewards free today and take a place on the Founding Members list: the first 2,026 get a numbered card. Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Welkom", headline: "We're open online.", sub: "For adults 18+ anywhere in South Africa. Join free and claim your Founding place." },
      },
      {
        key: "first-access-sms", day: 0, time: "09:00", channel: "SMS", pinned: true, audience: "early-access",
        text: "Hi {{firstName}}, Herbal Holland's online shop is open: herbalholland.co.za. Join free and claim your Founding place. We courier SA-wide, to you only (ID may be asked). This is the one message we promised; we're deleting your sign-up now. Adults 18+.",
      },
      {
        key: "first-access-email", day: 0, time: "09:05", channel: "EMAIL", pinned: true, audience: "early-access",
        title: "You asked us to tell you: our online shop is open",
        text: paras(
          "Hi {{firstName}},",
          "You asked herbalholland.com to tell you the day our online shop opened. It's open, at herbalholland.co.za, for adults 18+ anywhere in South Africa.",
          "Herbal Holland is members only, and joining Herbal Holland Rewards is free. It takes about a minute: confirm your mobile number with a one-time code, then add your SA ID number or your passport date of birth, because we're for adults 18+.",
          "Joining gives you a place on the Founding Members list. The first 2,026 places get a numbered Founding Member card in the Rewards app and at least Sprout tier for 14 months, with Sprout-tier savings on eligible items and early access to selected drops. Every friend who joins with your link moves you up 250 places.",
          "Delivery, in one line: we courier to a street address anywhere in South Africa and hand the parcel only to the member named on the order, who may be asked for ID.",
          "This is the one message we promised you, and we're deleting your sign-up details now. From here, you'll only hear from us if you join and say you'd like to.",
          "Welkom,\nThe Herbal Holland team",
        ),
      },
      {
        key: "members-email", day: 0, time: "09:05", channel: "EMAIL", pinned: true,
        title: "Our online shop is open",
        text: paras(
          "Hi {{firstName}},",
          "Our online shop opens today at herbalholland.co.za, for adults 18+ anywhere in South Africa.",
          "Your Herbal Holland Rewards membership comes with you: sign in with your mobile number, and your member savings and points work online as they do in store.",
          "We deliver to a street address anywhere in South Africa, with tracking by SMS, and hand every parcel only to the member named on the order, who may be asked for ID. Or collect it at your store.",
          "And because you joined us before today, you're already on the Founding Members list. The first 2,026 places get a numbered Founding Member card in the Rewards app and at least Sprout tier for 14 months, and every friend who joins with your link moves you up 250 places. Your place is in the Rewards app.",
          "See you online,\nThe Herbal Holland team",
        ),
      },
      {
        key: "members-push", day: 0, time: "18:30", channel: "PUSH", pinned: true,
        title: "Our online shop is open",
        text: "Delivered anywhere in South Africa, or collect in store. Your Founding place is waiting in the app.",
      },
      {
        key: "channel-open", day: 0, time: "09:30", channel: "WHATSAPP", pinned: true,
        text: paras(
          "We're open online, from today, for adults 18+ anywhere in South Africa.",
          "Herbal Holland is members only, and joining Herbal Holland Rewards is free. Everyone who joins has a place on our Founding Members list: the first 2,026 places get a numbered Founding Member card.",
          "Join at herbalholland.co.za. Adults 18+.",
        ),
      },
      {
        key: "joining", day: 1, time: "19:00", channel: "SOCIAL",
        text: paras(
          "How joining works, in 30 seconds.",
          "Confirm your mobile number with a one-time code. Add your SA ID number, or your passport date of birth: we're for adults 18+, so we check. That's it. You're a member of Herbal Holland Rewards, your card is in the Rewards app, and so is your place on the Founding Members list.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "How joining works: confirm your mobile number with a one-time code, add your SA ID number or passport date of birth, and you're a member, with your card and your Founding place in the Rewards app. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Join in 30 seconds",
          lines: ["Your mobile number and a one-time code", "Your SA ID number, or passport date of birth", "Your Rewards card, in the app", "Your place on the Founding Members list"],
        },
        brief: "Reel, 20–30 seconds, a phone screen recording: the join page, the one-time code, the ID step, then the Rewards card and the Founding place in the app. Hands only (an adult over 25, signed release); demo details, never a real ID number.",
      },
      {
        key: "delivery", day: 4, time: "09:00", channel: "SOCIAL",
        text: paras(
          "How delivery works.",
          "We courier to a street address anywhere in South Africa, with tracking by SMS. Everything we sell is for adults 18+, so the courier hands the parcel only to the member named on the order, who may be asked for ID. Please be there to receive it.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "How delivery works: we courier to a street address anywhere in South Africa, with tracking by SMS, and hand the parcel only to the member named on the order, who may be asked for ID. Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "How delivery works",
          lines: ["Couriered anywhere in South Africa", "To a street address, with tracking by SMS", "Handed only to the member named on the order", "Adults 18+: the courier may ask for ID", "Please be there to receive it"],
        },
      },
      {
        key: "founding", day: 6, time: "07:00", channel: "SOCIAL",
        text: paras(
          "Founding Members, explained.",
          "Everyone who joins Herbal Holland Rewards has a place on the Founding Members list, in the order they joined. When the list closes in December, the first 2,026 places get a numbered Founding Member card and at least Sprout tier for 14 months: Sprout-tier savings on eligible items and early access to selected drops. Founding Members are invited to a Founding Members' Evening every December, too.",
          "Your place and your link are in the Rewards app. Every friend who joins with your link moves you up 250 places, and you both get 50 points on their first purchase.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Founding Members, explained: when the list closes, the first 2,026 places get a numbered card and at least Sprout tier for 14 months. Every friend who joins with your link moves you up 250 places. Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Founding Members, explained",
          lines: ["A numbered Founding Member card", "At least Sprout tier for 14 months", "Early access to selected drops", "A Founding Members' Evening every December", "250 places up for every friend who joins"],
        },
        brief: "Carousel, 5 slides: 1 'Founding Members, explained'; 2 everyone who joins has a place, in the order they joined; 3 the first 2,026 get a numbered card and at least Sprout tier for 14 months; 4 early access to selected drops and a Founding Members' Evening every December; 5 your place and your link are in the Rewards app, and each friend who joins moves you up 250 places.",
      },
      {
        key: "windmill-no-1", day: 7, time: "16:00", channel: "EMAIL",
        title: "The Windmill, No. 1: the story so far",
        text: paras(
          "Hi {{firstName}},",
          "Welkom to The Windmill, our newsletter for members of Herbal Holland Rewards. This is the first one.",
          "The story so far. Our online shop opened a week ago, for adults 18+ anywhere in South Africa, and everyone who has joined since has a place on the Founding Members list. Siyabonga for being here early.",
          "Your Founding place. The first 2,026 places get a numbered Founding Member card in the Rewards app and at least Sprout tier for 14 months: Sprout-tier savings on eligible items and early access to selected drops, and an invitation to a Founding Members' Evening every December. Your place is in the app. To move up, share your link: every friend who joins with it moves you up 250 places, and you both get 50 points on their first purchase.",
          "Three Learn reads. How to read a lab result: potency, terpenes and the safety panels every batch should pass. What Schedule 0 means on a label. And how Rewards works, from Seed to Harvest. Each takes a few minutes, in plain English, at herbalholland.co.za/learn.",
          "Wear the windmill. The Windmill Tee, the Sunset Hoodie, the Heritage Crewneck, the Windmill Cap, the Sunset Bucket Hat, the Windmill Beanie and the Windmill Tote are all in stock: delivered anywhere in South Africa, or collected in store once our stores open.",
          "Two new stores in the hills. Hillcrest, in the Upper Highway, and Hilton, in the KZN Midlands, open their doors in December. Invitations to the opening week follow soon.",
          "See you soon,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-windmill", day: 7, time: "18:30", channel: "PUSH",
        title: "The Windmill, No. 1",
        text: "Our first newsletter is out. Your Founding place is in the app: share your link to move up 250 places.",
      },
      {
        // Day 10, not 9: in 2026 day 9 (Thu 5 Nov) is Hilton's reveal, a week after Hillcrest's.
        key: "merch", day: 10, time: "19:00", channel: "SOCIAL",
        text: paras(
          "Wear the windmill.",
          "Seven pieces, all in stock: the Windmill Tee, the Sunset Hoodie, the Heritage Crewneck, the Windmill Cap, the Sunset Bucket Hat, the Windmill Beanie and the Windmill Tote. The logos are embroidered; the big back prints and the tote are printed. Delivered anywhere in South Africa, or collected in store when our stores open.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Wear the windmill: seven pieces, all in stock, from the Windmill Tee to the Sunset Hoodie. Logos embroidered, back prints printed. Delivered anywhere in South Africa, or collected in store. Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "merch", image: "sunset-hoodie", headline: "Wear the windmill.", sub: "Seven pieces, embroidered and printed. In stock: delivered or collected." },
        brief: "Photo or 5-slide carousel: adults over 25 (signed releases) wearing the Sunset Hoodie, the Heritage Crewneck and the caps outdoors in the hills; one flat lay of the full range on warm black.",
      },
    ],
  },
  {
    key: "store-opening",
    name: "Store opening (the 2026 launch)",
    blurb: "One store's opening, from the reveal five weeks out to the thank-you: the Good Neighbour Promise, the neighbourhood, the team, the invitations, the countdown, opening day on every channel, the Members' Evening and Open Day, with stores that open on the same day sharing the big moments and taking turns, a week apart, with their own. Written for the December 2026 openings: it carries The Windmill, No. 2 and points people to the Founding Members list, so a later opening needs those lines changed.",
    store: true,
    anchor: "Doors open, 09:00",
    weekday: 2,
    why: "so the Members' Evening falls on the Thursday and Open Day on the Saturday",
    // Each store's own posts sit on days never 7 apart and never on a shared post's day, so a second store opening
    // the same day takes them a week later without a clash (src/server/studio.ts createLaunch).
    items: [
      {
        key: "reveal", day: -33, time: "07:00", channel: "SOCIAL",
        text: paras(
          "{town}, we're your new neighbours. {store} opens on {date} at 09:00, at {address}.",
          "We're members only, for adults 18+. Every batch is lab-tested, with a public lab page, and joining Herbal Holland Rewards is free.",
          "Until then, we're online: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "{town}, we're your new neighbours: {store} opens on {date} at 09:00. Members only, for adults 18+, and every batch lab-tested. Until then, we're online: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "reveal", headline: "Something's turning in {town}.", sub: "{store} opens {date}." },
        brief: "Photo: the street outside the store on a clear morning, with the window wrap ('Something's turning') up and the orange frame in view. No people needed.",
      },
      {
        key: "sms-reveal", day: -33, time: "10:00", channel: "SMS",
        text: "Hi {{firstName}}, {store} opens on {date} at 09:00, at {address}. Bring your ID, and come and say hello. Adults 18+.",
      },
      {
        // Sunday, three days after the reveal: in 2026 the Saturday is the online shop's delivery post.
        key: "promise", day: -30, time: "18:30", channel: "SOCIAL",
        text: paras(
          "Our Good Neighbour Promise to {town}.",
          "Adults 18+ only, with ID checked at the door and at the till. No smoking, vaping or using our products on or outside our premises. No queues on the pavement. Good security and good lighting. And a direct line to the manager, with a reply within one working day.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Our Good Neighbour Promise to {town}: adults 18+ only, ID at the door and the till; no smoking, vaping or using our products on or outside our premises; no queues on the pavement; a direct line to the manager. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          eyebrow: "To our neighbours in {town}",
          headline: "Our Good Neighbour Promise",
          lines: ["Adults 18+ only: ID at the door and the till", "No smoking, vaping or use on or outside our premises", "No queues on the pavement", "Good security and good lighting", "A direct line to the manager: a reply in one working day"],
        },
        brief: "Photo: the signed Good Neighbour Promise in the store window, or the manager (adult over 25, signed release) holding it at the door.",
      },
      {
        key: "google-coming", day: -29, time: "09:00", channel: "GOOGLE",
        text: "Herbal Holland is coming to {town}. {store} opens on {date} at 09:00, at {address}. We're a members-only store for adults 18+, and joining Herbal Holland Rewards is free, online or at the till. Every batch is lab-tested, with a public lab page you can check by scanning the QR on the pack.",
      },
      {
        key: "invitations", day: -20, time: "19:00", channel: "SOCIAL", shared: true,
        text: paras(
          "You're invited: opening week in {towns}.",
          "Our doors open on {date} at 09:00. That Thursday, 18:00–20:30, is the Members' Evening: good coffee and rooibos and a first look around with the team, for members who RSVP in the Rewards app. That Saturday, 09:00–14:00, is Open Day, for everyone 18+: a coffee cart, local makers' tables, Learn sessions with the team on the hour, a photo wall in our orange frame, and the merch.",
          "Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "You're invited: opening week in {towns}. Doors open {date}, 09:00. The Members' Evening is that Thursday, 18:00–20:30 (RSVP in the Rewards app); Open Day that Saturday, 09:00–14:00, for everyone 18+. Adults 18+, bring your ID. #HerbalHolland",
        card: {
          template: "event",
          eyebrow: "You're invited",
          headline: "Opening week",
          sub: "{towns}. Doors open {date}, 09:00.",
          lines: ["Members' Evening · Thursday 18:00–20:30", "Open Day · Saturday 09:00–14:00"],
        },
        brief: "Photo: the store nearly ready behind the orange window frame, with the invitation card propped in the window. No people needed.",
      },
      {
        key: "push-invite", day: -20, time: "18:30", channel: "PUSH",
        title: "You're invited",
        text: "{store} opens {date}. RSVP in the app for the Members' Evening that Thursday, 18:00–20:30.",
      },
      {
        key: "sms-invite", day: -19, time: "10:00", channel: "SMS",
        text: "Hi {{firstName}}, {store} opens {date}. You're invited to the Members' Evening that Thursday, 18:00-20:30 (RSVP in the Rewards app), and Open Day that Saturday, 09:00-14:00. Adults 18+, bring your ID.",
      },
      {
        key: "neighbourhood", day: -17, time: "09:00", channel: "SOCIAL",
        text: paras(
          "{town}, what should we know about the neighbourhood?",
          "We'd like to be good neighbours from day one. Tell us the walk, the breakfast spot or the view we shouldn't miss, and what you'd like from a new store on your street. We read every reply.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "{town}, what should we know about the neighbourhood? Tell us the walk, the breakfast spot or the view we shouldn't miss, and what you'd like from a new store on your street. We read every reply. Adults 18+. #HerbalHolland",
        card: { template: "headline", headline: "{town}, show us around.", sub: "The walk, the breakfast spot, the view we shouldn't miss." },
        brief: "Photo or 20-second Reel: the team (adults over 25, signed releases) out in the neighbourhood: the main road, a local café, a view.",
      },
      {
        key: "google-open-day-event", day: -15, time: "09:00", channel: "GOOGLE",
        text: "{store} opens on {date}, and that Saturday is Open Day, 09:00 to 14:00, at {address}: a coffee cart, local makers' tables, Learn sessions with the team on the hour, and a photo wall in our orange frame. Everyone 18+ is welcome: please bring your ID.",
      },
      {
        key: "windmill-no-2", day: -14, time: "16:00", channel: "EMAIL", shared: true, audience: "ALL",
        title: "The Windmill, No. 2: our doors open on {date}",
        text: paras(
          "Hi {{firstName}},",
          "Our doors open in {towns} on {date} at 09:00. Here's what to expect.",
          "Your first visit. Bring your ID: we check it at the door and at the till, every time, because we're for adults 18+. A member advisor will welcome you, show you around and answer your questions in plain English. Give your mobile number at the till and your savings and points work in store just as they do online. Not a member yet? You can join free at the till.",
          "Opening week. The Members' Evening is that Thursday, 18:00–20:30: good coffee and rooibos and a first look around with the team, for members who RSVP in the Rewards app. Open Day is that Saturday, 09:00–14:00, for everyone 18+: a coffee cart, local makers' tables, Learn sessions with the team on the hour, a photo wall in our orange frame, and the merch.",
          "Founding Members. The list closes at midnight on the Sunday after opening week. Your place is in the Rewards app, and every friend who joins with your link moves you up 250 places.",
          "Addresses and opening hours are at herbalholland.co.za/stores.",
          "See you there,\nThe Herbal Holland team",
        ),
      },
      {
        key: "team", day: -12, time: "19:00", channel: "SOCIAL",
        text: paras(
          "Meet the {town} team.",
          "Member advisors who'll welcome you, check your ID and answer your questions in plain English, and a store manager you can reach directly. They open the doors on {date} at 09:00, and they'd like to meet you.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Meet the {town} team: member advisors who'll welcome you, check your ID and answer your questions in plain English, and a store manager you can reach directly. They open the doors on {date} at 09:00. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Meet the team", headline: "Warm welcomes. Straight answers.", sub: "The {town} team opens the doors on {date}." },
        brief: "Photo: the store team (adults over 25, signed releases) in the doorway or at the counter; first names in the caption if they agree.",
      },
      {
        key: "windows", day: -8, time: "07:00", channel: "SOCIAL", shared: true,
        text: paras(
          "Our windows go up this week in {towns}: the orange frame, the windmill, and a first look inside.",
          "The doors open on {date} at 09:00.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        card: { template: "headline", eyebrow: "Behind the orange frame", headline: "Our windows go up this week.", sub: "{towns}. Doors open {date}, 09:00." },
        brief: "Reel, 20–40 seconds: the window frame and the windmill going up, as a time-lapse from the pavement, the team (adults over 25, signed releases) stepping back to look. No products in shot.",
      },
      {
        key: "google-hours", day: -8, time: "09:00", channel: "GOOGLE",
        text: "{store} opens on {date} at 09:00, at {address}. Our opening hours: {hours}. We're for adults 18+, so please bring your ID. Not a member of Herbal Holland Rewards yet? Join free at the till.",
      },
      {
        key: "seven-days", day: -7, time: "07:00", channel: "SOCIAL", shared: true, pinned: true,
        text: paras(
          "7 days to go: our doors open in {towns} on {date} at 09:00.",
          "The windows are up, and the team is getting ready to say hello.",
          "Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "7 days to go: our doors open in {towns} on {date} at 09:00. Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "countdown", headline: "7 days", sub: "until our doors open in {towns}." },
      },
      {
        key: "sunday", day: -2, time: "18:30", channel: "SOCIAL", shared: true, pinned: true,
        text: paras(
          "Tuesday, 09:00. {towns}.",
          "The windmill is nearly turning. Come and say sawubona.",
          "Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland #HollandMeetsTheHills",
        ),
        card: { template: "reveal", headline: "Tuesday, 09:00.", sub: "{towns}. The windmill is nearly turning." },
        brief: "Reel, 10–15 seconds: the windmill mark turning over the hills at dusk, ending on 'Tuesday, 09:00'.",
      },
      {
        key: "tomorrow", day: -1, time: "19:00", channel: "SOCIAL", shared: true, pinned: true,
        text: paras(
          "Tomorrow at 09:00, our doors open in {towns}.",
          "Come and say hello: a member advisor will show you around, and your Rewards card works at the till just as it does online.",
          "Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Tomorrow at 09:00, our doors open in {towns}. Come and say hello. Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "headline", eyebrow: "{towns}", headline: "Open tomorrow, 09:00.", sub: "{date}. Bring your ID and come and say hello." },
      },
      {
        key: "open", day: 0, time: "07:00", channel: "SOCIAL", shared: true, pinned: true, linkedin: "also",
        text: paras(
          "Sivulile: we're open in {towns}, from 09:00 today.",
          "Come and say sawubona: a member advisor will show you around, and if you're not a member yet, you can join free at the till. The Members' Evening is on Thursday, Open Day on Saturday, and the Founding Members list closes on Sunday at midnight.",
          "Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Sivulile: we're open in {towns}, from 09:00 today. Come and say sawubona. The Members' Evening is on Thursday, Open Day on Saturday. Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "headline", eyebrow: "{towns}", headline: "Sivulile. We're open.", sub: "From 09:00 today. Adults 18+, bring your ID." },
        brief: "Photo at 09:00: the doors opening, the team (adults over 25, signed releases) in the doorway, the first members walking in (with their consent).",
      },
      {
        key: "google-open", day: 0, time: "08:30", channel: "GOOGLE", pinned: true,
        text: "Sivulile: we're open. {store} opens its doors at 09:00 today, at {address}. Opening hours: {hours}. We're for adults 18+, so please bring your ID. Not a member of Herbal Holland Rewards yet? Join free at the till. This week: the Members' Evening on Thursday, and Open Day on Saturday, 09:00 to 14:00.",
      },
      {
        key: "push-open", day: 0, time: "09:00", channel: "PUSH", pinned: true,
        title: "Sivulile. We're open.",
        text: "{store} is open from 09:00 today. Bring your ID and come and say hello.",
      },
      {
        key: "email-open", day: 0, time: "09:05", channel: "EMAIL", shared: true, pinned: true, audience: "ALL",
        title: "Sivulile: we're open in {towns}",
        text: paras(
          "Hi {{firstName}},",
          "Sivulile: we're open. Our doors in {towns} opened at 09:00 today.",
          "Addresses and opening hours are at herbalholland.co.za/stores.",
          "Your first visit: bring your ID, because we check it at the door and at the till, every time. A member advisor will show you around, and your savings and points work in store just as they do online: give your mobile number at the till.",
          "This week: the Members' Evening on Thursday, 18:00–20:30, for members who have RSVP'd in the Rewards app, and Open Day on Saturday, 09:00–14:00, for everyone 18+, with a coffee cart, local makers' tables, Learn sessions on the hour and the merch.",
          "The Founding Members list closes on Sunday at midnight: your place is in the Rewards app.",
          "See you soon,\nThe Herbal Holland team",
        ),
      },
      {
        key: "channel-open", day: 0, time: "09:30", channel: "WHATSAPP", shared: true, pinned: true,
        text: paras(
          "Sivulile: we're open in {towns}, from 09:00 today.",
          "Bring your ID: we're for adults 18+, and we check it at the door and the till. Not a member of Herbal Holland Rewards yet? Join free at the till.",
          "This week: the Members' Evening on Thursday, for members who have RSVP'd in the Rewards app, and Open Day on Saturday, 09:00–14:00, for everyone 18+. Addresses and hours: herbalholland.co.za/stores",
        ),
      },
      {
        key: "day-one", day: 0, time: "19:00", channel: "SOCIAL", shared: true, pinned: true,
        text: paras(
          "Day one, done. Siyabonga, {towns}, for the warmest welcome.",
          "Thank you to everyone who came in today, and to everyone on the team. Next: the Members' Evening on Thursday and Open Day on Saturday.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Day one, done. Siyabonga, {towns}, for the warmest welcome. Next: the Members' Evening on Thursday and Open Day on Saturday. Adults 18+. #HerbalHolland",
        card: { template: "headline", headline: "Day one, done.", sub: "Siyabonga, {towns}." },
        brief: "Photo from the day: the team (adults over 25, signed releases) at closing time, or the window lit up at dusk.",
      },
      {
        key: "tonight", day: 2, time: "12:00", channel: "SOCIAL", shared: true, pinned: true,
        text: paras(
          "Tonight in {towns}: the Members' Evening, 18:00–20:30.",
          "Good coffee and rooibos and a first look around with the team, for members who have RSVP'd in the Rewards app. We check ID at the door.",
          "Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Tonight in {towns}: the Members' Evening, 18:00–20:30, for members who have RSVP'd in the Rewards app. Good coffee and rooibos, and a first look around. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "event", eyebrow: "Members' Evening", headline: "Tonight", sub: "18:00–20:30 in {towns}. For members who RSVP'd, ID at the door." },
        brief: "Photo: the store set for the evening at midday, coffee and rooibos ready and the orange frame lit. No people needed.",
      },
      {
        key: "open-day", day: 4, time: "07:30", channel: "SOCIAL", shared: true, pinned: true,
        text: paras(
          "Open Day today in {towns}, 09:00–14:00.",
          "Everyone 18+ is welcome: a coffee cart, local makers' tables, Learn sessions with the team on the hour, a photo wall in our orange frame, and the merch. We check ID at the door. And the Founding Members list closes tomorrow at midnight.",
          "Join free and claim your Founding place: link in bio. Adults 18+, bring your ID. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "Open Day today in {towns}, 09:00–14:00: a coffee cart, local makers' tables, Learn sessions on the hour and a photo wall in our orange frame. Everyone 18+ is welcome. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "event", eyebrow: "Open Day", headline: "Today", sub: "09:00–14:00 in {towns}. Coffee, local makers and Learn sessions." },
        brief: "Reel, 20–40 seconds through the morning: the coffee cart, the makers' tables, a Learn session and the photo wall (adults over 25, signed releases).",
      },
      {
        key: "google-open-day", day: 4, time: "08:00", channel: "GOOGLE", pinned: true,
        text: "Open Day at {store} today, 09:00 to 14:00, at {address}: a coffee cart, local makers' tables, Learn sessions with the team on the hour, and a photo wall in our orange frame. Everyone 18+ is welcome: please bring your ID.",
      },
      {
        key: "sms-open-day", day: 4, time: "09:00", channel: "SMS", pinned: true,
        text: "Hi {{firstName}}, it's Open Day at {store} today until 14:00: a coffee cart, local makers and Learn sessions on the hour. Adults 18+, bring your ID.",
      },
      {
        key: "thank-you", day: 10, time: "19:00", channel: "SOCIAL",
        text: paras(
          "Siyabonga, {town}.",
          "Thank you to everyone who came to say hello in our first days, to the members at our Members' Evening, and to the local makers who came to Open Day.",
          "Join free: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        card: { template: "headline", headline: "Siyabonga, {town}.", sub: "Thank you for a warm first week." },
        brief: "Photo or 5-slide carousel from opening week: the doors opening, the Members' Evening, the makers' tables and the photo wall (adults over 25, signed releases).",
      },
    ],
  },
  {
    key: "founding-members",
    name: "Founding Members",
    blurb: "The last four weeks of the Founding Members list: how it works, moving up with your link, what Founding Members get, bringing a friend, the last call and the numbers, with no live counts (members see their own place in the Rewards app).",
    store: false,
    anchor: "The list closes at midnight",
    weekday: 0,
    why: "the list closes at midnight on the Sunday after the stores' opening week, and its last call goes out by push on the Saturday",
    // No feed post on the Saturday before the close (Open Day in the stores), nor in the stores' last week before their
    // doors open; their opening-week posts and email carry the close, with the pushes. One email, the numbers: The
    // Windmill covers the rest.
    items: [
      {
        key: "how-it-works", day: -27, time: "07:00", channel: "SOCIAL",
        text: paras(
          "How the Founding Members list works.",
          "Join Herbal Holland Rewards free and you have a place on the list, in the order you joined. When it closes at midnight on {date}, the first 2,026 places become Founding Members: a numbered Founding Member card in the Rewards app, and at least Sprout tier for 14 months. Your place is in the app, and your link moves you up.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "How the Founding Members list works: join free and you have a place, in the order you joined. When it closes on {date}, the first 2,026 get a numbered card and at least Sprout tier for 14 months. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Be one of the first 2,026.", sub: "The list closes at midnight on {date}. Free to join, for adults 18+." },
        brief: "Carousel, 5 slides: 1 'How the Founding Members list works'; 2 join free and you have a place, in the order you joined; 3 when the list closes, the first 2,026 places become Founding Members; 4 a numbered card and at least Sprout tier for 14 months; 5 your place and your link are in the Rewards app.",
      },
      {
        key: "move-up", day: -23, time: "19:00", channel: "SOCIAL",
        text: paras(
          "Move up the Founding Members list with your link.",
          "Every friend who joins Herbal Holland Rewards with your link moves you up 250 places, and you both get 50 points on their first purchase. Your link and your place are in the Rewards app. The list closes at midnight on {date}.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Move up the Founding Members list: every friend who joins with your link moves you up 250 places, and you both get 50 points on their first purchase. The list closes at midnight on {date}. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Your link moves you up 250 places.", sub: "For every friend who joins with it. Find it in the Rewards app." },
        brief: "Reel, about 20 seconds, a phone screen recording: the Founding place in the Rewards app, sharing the link, and the place moving up 250 when a friend joins (demo details). Hands only, an adult over 25 with a signed release.",
      },
      {
        key: "what-you-get", day: -19, time: "07:00", channel: "SOCIAL",
        text: paras(
          "What Founding Members get.",
          "A numbered Founding Member card in the Rewards app. At least Sprout tier for 14 months, with Sprout-tier savings on eligible items. Early access to selected drops. And an invitation to a Founding Members' Evening every December.",
          "The list closes at midnight on {date}. Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "What Founding Members get: a numbered card, at least Sprout tier for 14 months, early access to selected drops and a Founding Members' Evening every December. The list closes at midnight on {date}. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "What Founding Members get",
          lines: ["A numbered Founding Member card", "At least Sprout tier for 14 months", "Sprout-tier savings on eligible items", "Early access to selected drops", "A Founding Members' Evening every December"],
        },
      },
      {
        key: "push-place", day: -17, time: "18:30", channel: "PUSH",
        title: "Your Founding place",
        text: "See your place on the Founding Members list in the app. Every friend who joins with your link moves you up 250 places.",
      },
      {
        key: "bring-a-friend", day: -14, time: "18:30", channel: "SOCIAL",
        text: paras(
          "Know someone who'd like Herbal Holland?",
          "Send them your link from the Rewards app. When they join, free, you move up 250 places on the Founding Members list, and after their first purchase you both get 50 points. Joining is for adults 18+.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Know someone who'd like Herbal Holland? Send them your link from the Rewards app: when they join, you move up 250 places on the Founding Members list. Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Bring a friend", headline: "Your link, your place.", sub: "Every friend who joins with it moves you up 250 places." },
        brief: "Photo: two friends (adults over 25, signed releases) outdoors in the hills, one showing the other the Rewards app on a phone.",
      },
      {
        key: "push-last-call", day: -1, time: "11:00", channel: "PUSH", pinned: true,
        title: "Last call, Founding Members",
        text: "The Founding Members list closes at midnight tomorrow. Share your link from the app to move up 250 places.",
      },
      {
        key: "last-call", day: 0, time: "08:00", channel: "SOCIAL", pinned: true,
        text: paras(
          "Last call: the Founding Members list closes at midnight tonight.",
          "Join Herbal Holland Rewards free before then and you'll have a place on it. The first 2,026 places get a numbered Founding Member card and at least Sprout tier for 14 months.",
          "Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Last call: the Founding Members list closes at midnight tonight. The first 2,026 places get a numbered card and at least Sprout tier for 14 months. Join free and claim your Founding place: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Last call.", sub: "The list closes at midnight tonight." },
      },
      {
        key: "numbers", day: 1, time: "07:00", channel: "SOCIAL",
        text: paras(
          "Founding Members, your numbers are in.",
          "Open the Rewards app to see your numbered Founding Member card. Siyabonga for being first. If your place came after the first 2,026, thank you for being here early: your Rewards work in every store and online, and you climb from Seed to Harvest as you go.",
          "Join free: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Founding Members, your numbers are in: open the Rewards app to see your numbered card. Siyabonga for being first, and thank you to everyone who joined early. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Your numbers are in.", sub: "Open the Rewards app to see your card. Siyabonga for being first." },
      },
      {
        key: "email-numbers", day: 1, time: "16:00", channel: "EMAIL",
        title: "The Founding Members numbers are in",
        text: paras(
          "Hi {{firstName}},",
          "The Founding Members list closed at midnight on {date}, and the numbers are in.",
          "If your place was in the first 2,026, your numbered Founding Member card is in the Rewards app now. You hold at least Sprout tier for the next 14 months, with Sprout-tier savings on eligible items and early access to selected drops, and you're invited to a Founding Members' Evening every December.",
          "If your place came after that, thank you for being here early. Your Rewards work in every store and online: points on every rand, My Deals every Monday, and a climb from Seed to Harvest.",
          "Siyabonga,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-numbers", day: 1, time: "18:30", channel: "PUSH",
        title: "Your numbers are in",
        text: "Founding Members: open the app to see your numbered card. Siyabonga for being first.",
      },
    ],
  },
  {
    key: "hiring",
    name: "Hiring",
    blurb: "Member advisors and store managers: the call and the last day to apply on social and LinkedIn, the two roles on LinkedIn, one post for the WhatsApp Channel, and always that we never charge to apply.",
    store: false,
    anchor: "Applications close",
    weekday: 5,
    why: "applications close at the end of a working week",
    items: [
      {
        key: "call", day: -15, time: "07:00", channel: "SOCIAL", linkedin: "also",
        text: paras(
          "We're hiring member advisors and store managers.",
          "We're looking for warm people who like explaining things simply. Member advisors are the first person a member meets: a warm welcome, an ID check, and clear, plain-English answers. Store managers run the store and the team. We train you from day one, and we never charge to apply.",
          "Apply by {date} at herbalholland.com/careers. Adults 18+. #HerbalHolland",
        ),
        short: "We're hiring member advisors and store managers: warm people who like explaining things simply. We train you from day one, and we never charge to apply. Apply by {date} at herbalholland.com/careers. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Careers", headline: "We're hiring.", sub: "Member advisors and store managers. Apply by {date}." },
        brief: "Photo: two adults over 25 (signed releases) at a store counter, one welcoming the other; warm light, no products in shot.",
      },
      {
        key: "managers", day: -9, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: paras(
          "We're hiring store managers.",
          "A Herbal Holland store manager runs the store and the team: rosters, stock, cash-ups, the neighbours and the standards. The standards are the job: every batch lab-tested, members only, and ID checked at the door and the till, every time. Training starts on day one.",
          "If you've run a store, a café or a front-of-house team and you like doing things properly, apply by {date} at herbalholland.com/careers. We never charge to apply. Adults 18+. #HerbalHolland",
        ),
        short: "We're hiring store managers: run the store and the team, from rosters and stock to cash-ups, the neighbours and the standards. Apply by {date} at herbalholland.com/careers. We never charge to apply. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Careers", headline: "Store managers", sub: "Run the store and the team, and keep the standards. Apply by {date}." },
      },
      {
        // The second week: in 2026 the Channel's first week is the brand's welkom, and the third the shop's opening.
        key: "channel", day: -8, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "We're hiring member advisors and store managers for our stores.",
          "We're looking for warm people who like explaining things simply, and we'll train you from day one. Send your CV through herbalholland.com/careers by {date}, and tell us the store or the role you're interested in.",
          "We never charge to apply: if anyone asks you for money for a job with Herbal Holland, it isn't us. Adults 18+.",
        ),
      },
      {
        // LinkedIn only: in 2026 this week's feed already has the brand's four posts and the shop's teaser.
        key: "advisors", day: -7, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: paras(
          "What does a member advisor do?",
          "They're the first person a member meets: a warm welcome at the door, an ID check, and clear, plain-English answers to questions about lab results, labels and Rewards. If that sounds like you, we'd like to hear from you. We train you from day one.",
          "Apply by {date} at herbalholland.com/careers. We never charge to apply. Adults 18+. #HerbalHolland",
        ),
        short: "What does a member advisor do? A warm welcome at the door, an ID check, and plain-English answers about lab results, labels and Rewards. We train you from day one. Apply by {date} at herbalholland.com/careers. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "We're hiring", headline: "Member advisors", sub: "A warm welcome, an ID check and plain-English answers. Apply by {date}." },
        brief: "Photo or 20-second Reel: a member advisor (adult over 25, signed release) welcoming someone at the door, checking ID, then talking them through a lab page on a phone.",
      },
      {
        key: "last-day", day: 0, time: "07:00", channel: "SOCIAL", pinned: true, linkedin: "also",
        text: paras(
          "Last day to apply: applications for member advisors and store managers close today.",
          "Thank you to everyone who has applied. We read every application, and if there's a fit, we'll be in touch to arrange an interview. We never charge to apply.",
          "herbalholland.com/careers. Adults 18+. #HerbalHolland",
        ),
        short: "Last day to apply: applications for member advisors and store managers close today. We read every application, and we never charge to apply. herbalholland.com/careers. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Careers", headline: "Last day to apply.", sub: "Applications close today. We read every one." },
      },
    ],
  },
  {
    key: "merch-drop",
    name: "Merch drop",
    blurb: "A merch drop from Thursday 10:00 to Saturday night, online and in store: a teaser, drop day with an email to members who chose merch and a push, and the last day; members in our higher tiers get in early.",
    store: false,
    anchor: "The drop opens, 10:00",
    weekday: 4,
    why: "drops open on a Thursday and close on the Saturday night, so the weekend is in it",
    // Nothing on the Wednesday: a pinned "tomorrow" there would refuse every drop after a Wednesday holiday.
    items: [
      {
        key: "teaser", day: -2, time: "07:00", channel: "SOCIAL",
        text: paras(
          "Something new from the windmill: our next merch drop opens on {date} at 10:00.",
          "It's online and in store, for Herbal Holland Rewards members. Members in our higher tiers get in early; the drops page shows your time. The drop closes on Saturday night.",
          "Join free: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Something new from the windmill: our next merch drop opens on {date} at 10:00, online and in store. Members in our higher tiers get in early. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Merch drop", headline: "Something new from the windmill.", sub: "The drop opens {date}, 10:00. Online and in store." },
        brief: "Photo: the new piece on warm black in the orange frame, or worn by an adult over 25 (signed release); close-ups of the embroidery.",
      },
      {
        key: "drop-day", day: 0, time: "07:00", channel: "SOCIAL", pinned: true,
        text: paras(
          "Drop day: our new merch drop opens today at 10:00, online and in store.",
          "Members in our higher tiers get in early; the drops page shows your time. It's for Herbal Holland Rewards members, and joining is free for adults 18+. The drop closes on Saturday night.",
          "Join free: link in bio. Adults 18+. #HerbalHolland",
        ),
        short: "Drop day: our new merch drop opens today at 10:00, online and in store, until Saturday night. Members in our higher tiers get in early. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "merch", image: "heritage-crewneck", eyebrow: "Merch drop", headline: "Drop day.", sub: "Opens 10:00 today, online and in store." },
        brief: "Photo or 20-second Reel: the piece worn by adults over 25 (signed releases) in the hills, with close-ups of the embroidery. Choose the card picture for the piece.",
      },
      {
        key: "email", day: 0, time: "16:00", channel: "EMAIL", audience: "interest:APPAREL",
        title: "Something new from the windmill: the drop is open",
        text: paras(
          "Hi {{firstName}},",
          "Our new merch drop is open, online and in store, until Saturday night.",
          "Members in our higher tiers got in early, and it's open to every member now. Everything in the drop is on the drops page at herbalholland.co.za.",
          "Every piece is held in stock: delivered anywhere in South Africa, or collected in store.",
          "Wear the windmill,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-drop", day: 0, time: "18:30", channel: "PUSH", pinned: true,
        title: "The drop is open",
        text: "Our new merch drop is open today, online and in store, until Saturday night. The drops page has it all.",
      },
      {
        key: "last-day", day: 2, time: "09:00", channel: "SOCIAL", pinned: true,
        text: paras(
          "Last day of the drop: it closes tonight.",
          "It's online and in store, for Herbal Holland Rewards members. Every piece is in stock: delivered anywhere in South Africa, or collected in store.",
          "Join free: link in bio. Adults 18+. #HerbalHolland",
        ),
        card: { template: "headline", eyebrow: "Merch drop", headline: "Last day.", sub: "The drop closes tonight. Online and in store." },
      },
    ],
  },
];
