// February 2027, Gezellig and Bring a friend: fixed dates. Day T is Monday 1 February; the pack runs to Sunday 28
// February (days 0–27). The weekly rhythm: Tuesday 07:00 Learn carousel, Wednesday 19:00 community and people, Thursday
// 19:00 store life or events, Saturday 09:00 made here or this weekend in store; LinkedIn on Wednesdays at 12:00; the
// WhatsApp Channel on Thursdays at 12:30. The Gezellig evenings are Hillcrest on Thursday 18 and Hilton on Friday 19
// February (the third Thursday and Friday); Thursday 18 has its pinned 12:00 "tonight" post in place of the Reel.
import type { Playbook } from "../studio";
import { paras } from "./shared";

export const FEBRUARY: Playbook[] = [
  {
    key: "february-2027",
    name: "February 2027: Gezellig, and Bring a friend",
    blurb:
      "February's posts: gezellig, the Dutch art of feeling at home, and Bring a friend month (you and a friend both get 50 points on their first purchase). The Windmill No. 4, Gezellig evenings in Hillcrest (18 February) and Hilton (19 February), CBD and Schedule 0 in five facts, the team's favourite views, and the tote and the cap, made for two. Four feed posts a week, LinkedIn on Wednesdays, the WhatsApp Channel on Thursdays.",
    store: false,
    anchor: "Monday 1 February",
    date: "2027-02-01",
    items: [
      // ── Week 1: what gezellig means, and Bring a friend month begins ─────────────────────────────────────────────
      {
        key: "learn-gezellig", day: 1, time: "07:00", channel: "SOCIAL",
        text: "Gezellig: the Dutch art of feeling at home. Say it khuh-ZEL-ukh, with the throaty Dutch g.\n\nIt means warm, sociable and at home, all at once, and English has no single word for it. Gezelligheid is the feeling: a long table, good coffee, people you like, and nobody checking the time.\n\nIt's why each of our stores hosts a Gezellig evening every month: Hillcrest on the third Thursday, Hilton the evening after, 18:00–20:00, for members.\n\nRead it in Learn: link in bio. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Gezellig: the Dutch art of feeling at home. Warm, sociable and at home, all at once: a long table, good coffee, people you like, and nobody checking the time. Read it in Learn: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "Gezellig: the art of feeling at home.", sub: "The Dutch word for warm, sociable and at home, all at once." },
        brief: "A 5-slide carousel in the brand type: 1 the word and how to say it (khuh-ZEL-ukh); 2 warm, sociable, at home; 3 gezelligheid, the feeling (a long table, good coffee, people you like); 4 why English has no single word for it; 5 our Gezellig evenings, Hillcrest on the third Thursday and Hilton the evening after.",
      },
      {
        key: "windmill-no-4", day: 1, time: "16:00", channel: "EMAIL",
        title: "The Windmill, No. 4: a gezellig February",
        text: paras(
          "Hi {{firstName}},",
          "Welkom to February's Windmill. This month is gezellig: the Dutch word for warm, sociable and at home, all at once. English has no single word for it, so we've written a short Learn read instead: Gezellig, the Dutch art of feeling at home.",
          "Bring a friend. February is Bring a friend month. Send a friend your link from the Rewards app: when they join Herbal Holland Rewards and make their first purchase, you both get 50 points. Joining is free for adults 18+.",
          "Gezellig evenings. This month's are at Herbal Holland Hillcrest on Thursday 18 February and Herbal Holland Hilton on Friday 19 February, 18:00–20:00: an easy evening with the team and other members. RSVP in the Rewards app, and bring your ID.",
          "Learn picks. CBD and Schedule 0: five facts, from the limits per pack and per day to what a label may say, in plain English. And Gezellig, if you'd like the long version of this letter.",
          "See you soon,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-windmill", day: 1, time: "18:30", channel: "PUSH",
        title: "The Windmill, No. 4 is out",
        text: "What gezellig means, Bring a friend month, and Gezellig evenings on 18 and 19 February. RSVP in the Rewards app.",
      },
      {
        key: "li-gezellig", day: 2, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "Gezellig is a Dutch word for warm, sociable and at home, all at once. At Herbal Holland, it's also a working standard.\n\nSince January, each of our stores hosts a Gezellig evening every month: Hillcrest on the third Thursday, Hilton the evening after. Members RSVP in our app, the store team hosts, and the evening is about conversation, not a pitch.\n\nWhat we're learning: in a new category, trust is built face to face, in a room where people can ask anything.\n\nAdults 18+.\n#HerbalHolland",
        short: "Gezellig: Dutch for warm, sociable and at home. Since January, each of our stores hosts a Gezellig evening every month, for conversation, not a pitch. What we're learning: in a new category, trust is built face to face. #HerbalHolland",
        card: { template: "headline", eyebrow: "What we're learning", headline: "Gezellig, as a working standard.", sub: "A Gezellig evening every month at each store, hosted by the team." },
      },
      {
        key: "bring-a-friend", day: 2, time: "19:00", channel: "SOCIAL",
        text: "February is Bring a friend month. Send a friend your link from the Rewards app: when they join Herbal Holland Rewards and make their first purchase, you both get 50 points.\n\nJoining is free, and everything we do is for adults 18+, so your friend will need their ID in store, like everyone.\n\nYour link is in the Rewards app. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        short: "February is Bring a friend month: when a friend joins Herbal Holland Rewards with your link and makes their first purchase, you both get 50 points. Your link is in the Rewards app. Joining is free. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Bring a friend", headline: "You both get 50 points.", sub: "When a friend joins with your link and makes their first purchase." },
        brief: "A photo of two friends (adults over 25, signed releases) in Windmill merch at the Hillcrest store's door, mid-laugh, the windmill in the window behind them. No products in shot.",
      },
      {
        key: "channel-february", day: 3, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "February at Herbal Holland is gezellig: the Dutch word for warm, sociable and at home.",
          "This month's Gezellig evenings are at Hillcrest on Thursday 18 February and Hilton on Friday 19 February, 18:00–20:00, for Herbal Holland Rewards members who RSVP in the Rewards app.",
          "Adults 18+, ID at the door.",
        ),
      },
      {
        key: "reel-evening", day: 3, time: "19:00", channel: "SOCIAL",
        text: "What a Gezellig evening looks like: the team, good conversation, and an evening that takes its time. Each of our stores hosts one every month, for members.\n\nFebruary's are at Hillcrest on Thursday 18 February and Hilton on Friday 19 February, 18:00–20:00. RSVP in the Rewards app. Adults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills",
        short: "What a Gezellig evening looks like: the team, good conversation, and an evening that takes its time. February's: Hillcrest on Thursday 18 and Hilton on Friday 19 February, 18:00–20:00. RSVP in the Rewards app. Adults 18+. #HerbalHolland",
        card: { template: "event", eyebrow: "Gezellig evenings", headline: "18 and 19 February", sub: "Hillcrest Thursday, Hilton Friday, 18:00–20:00. RSVP in the app." },
        brief: "A 30-second Reel from January's Gezellig evenings (adults over 25 only, with signed releases): the room filling up, coffee poured, people talking with the team. No products in shot.",
      },
      {
        key: "bucket-hat", day: 5, time: "09:00", channel: "SOCIAL",
        text: "Made for the February sun in the hills: the Sunset Bucket Hat. Black cotton twill, soft and unstructured, with the windmill embroidered in Sunset orange on the front.\n\nIn stock, delivered anywhere in South Africa or collected in store: link in bio. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        short: "The Sunset Bucket Hat: black cotton twill, unstructured, with the windmill embroidered in Sunset orange. In stock, delivered anywhere in South Africa or collected in store: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "merch", image: "sunset-bucket-hat", headline: "The Sunset Bucket Hat", sub: "Black cotton twill, the windmill embroidered in Sunset orange." },
        brief: "A photo of the hat on a team member (adult over 25, signed release) outdoors in bright summer light, the Midlands hills behind.",
      },

      // ── Week 2: Schedule 0, Bring a friend on members' channels, the team's favourite views ──────────────────────
      {
        key: "learn-schedule-0", day: 8, time: "07:00", channel: "SOCIAL",
        text: "CBD and Schedule 0: five facts.\n\n1. Schedule 0 is the rule that lets everyday CBD products be available without a prescription in South Africa (GN 586 of 22 May 2020).\n2. A pack may hold at most 600 mg of CBD.\n3. The daily serving may be at most 20 mg of CBD: you'll find it on every product page.\n4. Claims stay modest: a short, approved list, and nothing about medical conditions.\n5. Schedule 0 sets no minimum age. We do: adults 18+ only.\n\nThe full guide is in Learn: link in bio. Adults 18+.\n#HerbalHolland",
        short: "CBD and Schedule 0, in five facts: no prescription needed within its limits, at most 600 mg of CBD a pack and 20 mg a day, modest approved claims only, and no minimum age, though we keep to adults 18+. Learn: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "CBD and Schedule 0: five facts",
          lines: ["No prescription needed, within its limits", "At most 600 mg of CBD in a pack", "At most 20 mg of CBD a day", "Modest, approved claims only", "Adults 18+ only, at Herbal Holland"],
        },
        brief: "A 5-slide carousel in plain type on the brand dark, one fact a slide: the rule and its notice (GN 586 of 2020), 600 mg a pack, 20 mg a day, approved claims only, adults 18+. No products in shot.",
      },
      {
        key: "sms-bring-a-friend", day: 8, time: "10:00", channel: "SMS",
        text: "Hi {{firstName}}, it's Bring a friend month at Herbal Holland. Send a friend your link from the Rewards app: when they join and make their first purchase, you both get 50 points. Adults 18+.",
      },
      {
        key: "push-bring-a-friend", day: 8, time: "18:30", channel: "PUSH",
        title: "Bring a friend",
        text: "A friend joins with your link and makes their first purchase: you both get 50 points. Your link is in the app.",
      },
      {
        key: "li-promise", day: 9, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "Every Herbal Holland store makes the same Good Neighbour Promise to its street: adults 18+ only, with ID at the door and the till; no smoking, vaping or using our products on or outside our premises; no queues on the pavement; good security and lighting; and a direct line to the manager, with a reply within one working day.\n\nWhat we're learning: the last line matters most. A promise is only as good as the reply, so ours has a deadline.\n\nAdults 18+.\n#HerbalHolland",
        short: "Our Good Neighbour Promise: adults 18+ only, ID at the door and the till, nothing used on or outside our premises, no queues on the pavement, and a direct line to the manager. A promise is only as good as the reply, so ours has a deadline. #HerbalHolland",
        card: { template: "headline", eyebrow: "What we're learning", headline: "A promise is only as good as the reply.", sub: "Our Good Neighbour Promise: a direct line to the manager, a reply in one working day." },
      },
      {
        key: "views-hillcrest", day: 9, time: "19:00", channel: "SOCIAL",
        text: "The team's favourite walks and views, part one: Hillcrest. Ask the Hillcrest team where to watch the evening come in, and they'll send you to the edge of the Valley of a Thousand Hills, where the ridges turn blue one behind the other.\n\nWhere's yours? Adults 18+.\n#HerbalHolland #HollandMeetsTheHills #Hillcrest",
        short: "The team's favourite walks and views, part one: Hillcrest, at the edge of the Valley of a Thousand Hills, where the ridges turn blue one behind the other. Where's yours? Adults 18+. #HerbalHolland #Hillcrest",
        card: { template: "reveal", headline: "Where the ridges turn blue." },
        brief: "A photo of a Hillcrest team member (adult over 25, signed release) at their favourite view over the Valley of a Thousand Hills at golden hour. If their favourite is somewhere else, change the caption to match.",
      },
      {
        key: "reel-welcome", day: 10, time: "19:00", channel: "SOCIAL",
        text: "What happens when you visit, every time: a hello and an ID check at the door, your Rewards card from the app at the till, and plain-English answers to whatever you'd like to ask.\n\nIt's part of our Good Neighbour Promise: adults 18+ only, with ID at the door and the till. Adults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills",
        short: "What happens when you visit, every time: a hello and an ID check at the door, your Rewards card from the app at the till, and plain-English answers to whatever you'd like to ask. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "headline", eyebrow: "Store life", headline: "A hello, an ID check, a straight answer.", sub: "What happens when you visit us, every time. Adults 18+." },
        brief: "A 20-second Reel at the Hilton store: a member advisor greets a member at the door and checks their ID, then the Rewards card is scanned from a phone at the till (adults over 25, signed releases). No products in shot.",
      },
      {
        key: "made-for-two", day: 12, time: "09:00", channel: "SOCIAL",
        text: "Made for two: the Windmill Tote and the Windmill Cap. The tote is heavy black cotton canvas, printed in Sunset orange with the windmill, our name and Dutch heritage · African soil. The cap is black washed cotton, with the windmill embroidered on the front.\n\nOne for you, one for someone you like. Both in stock, delivered anywhere in South Africa or collected in store: link in bio. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Made for two: the Windmill Tote, heavy cotton canvas printed with the windmill, and the Windmill Cap, washed cotton with the windmill embroidered. One for you, one for someone you like. Link in bio. Adults 18+. #HerbalHolland",
        card: { template: "merch", image: "windmill-tote", headline: "Made for two.", sub: "The Windmill Tote and the Windmill Cap: one for you, one for someone you like." },
        brief: "A photo of two people (adults over 25, signed releases) at a Midlands farm stall or picnic, one carrying the tote, one in the cap. Merch and the place only.",
      },

      // ── Week 3: Bring a friend, step by step; the Gezellig evenings ───────────────────────────────────────────────
      {
        key: "learn-bring-a-friend", day: 15, time: "07:00", channel: "SOCIAL",
        text: "Bring a friend, step by step.\n\n1. Open the Rewards app and find your link.\n2. Send it to a friend who's 18 or over.\n3. They join Herbal Holland Rewards free, with your link.\n4. On their first purchase, you both get 50 points.\n5. From then on, you each earn points on every rand.\n\nYour link is in the Rewards app. Adults 18+.\n#HerbalHolland",
        short: "Bring a friend, step by step: find your link in the Rewards app, send it to a friend who's 18 or over, they join free with it, and on their first purchase you both get 50 points. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Bring a friend, step by step",
          lines: ["Find your link in the Rewards app", "Send it to a friend who's 18 or over", "They join Herbal Holland Rewards free", "Their first purchase: 50 points each", "Points on every rand, from then on"],
        },
        brief: "A 5-slide carousel, one step a slide, with the Rewards app's link screen on the first (a demo account, no real member's details).",
      },
      {
        key: "li-lab-pages", day: 16, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "Everyone who shops with Herbal Holland is a member of Herbal Holland Rewards, free to join for adults 18+. We check age when someone joins, and ID at the door and the till, on every visit.\n\nWhat we're learning: the basics are a system, not a sign on the door. Doing them every time, in every store, comes down to training from day one.\n\nAdults 18+.\n#HerbalHolland",
        short: "Everyone who shops with us is a member, free to join for adults 18+. We check age when you join, and ID at the door and the till, every visit. The basics are a system, not a sign on the door. #HerbalHolland",
        card: { template: "headline", eyebrow: "What we're learning", headline: "The basics are a system, not a sign.", sub: "Members only, adults 18+, and ID at the door and the till, every visit." },
      },
      {
        key: "views-hilton", day: 16, time: "19:00", channel: "SOCIAL",
        text: "The team's favourite walks and views, part two: Hilton. The Hilton team's pick is an early one, while the Midlands mist is still lifting off the hills and the roads are quiet.\n\nWhere do you walk? Adults 18+.\n#HerbalHolland #HollandMeetsTheHills #Hilton",
        card: { template: "reveal", headline: "Early, while the mist lifts." },
        brief: "A photo of a Hilton team member (adult over 25, signed release) on their favourite early-morning walk near Hilton, mist on the hills. If their favourite is somewhere else, change the caption to match.",
      },
      {
        key: "tonight", day: 17, time: "12:00", channel: "SOCIAL", pinned: true,
        text: "Gezellig tonight at Herbal Holland Hillcrest, 18:00–20:00, and tomorrow at Herbal Holland Hilton, same time. An easy evening with the team, for members who RSVP in the Rewards app.\n\nAdults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills #KZN",
        card: { template: "event", eyebrow: "Gezellig evening", headline: "Tonight in Hillcrest", sub: "18:00–20:00, and tomorrow in Hilton. Members who RSVP. Adults 18+." },
        brief: "A photo of the Hillcrest team setting up that afternoon (adults over 25, signed releases): chairs out, cups ready, the windmill in the window. No products in shot.",
      },
      {
        key: "channel-tonight", day: 17, time: "12:30", channel: "WHATSAPP", pinned: true,
        text: paras(
          "Gezellig tonight at Herbal Holland Hillcrest, 18:00–20:00, and tomorrow at Herbal Holland Hilton, same time.",
          "An easy evening with the team, for Herbal Holland Rewards members who RSVP in the Rewards app.",
          "Adults 18+, bring your ID.",
        ),
      },
      {
        key: "first-visit", day: 19, time: "09:00", channel: "SOCIAL",
        text: "Bringing a friend in this weekend? Here's how a first visit works.\n\nBring your ID: we check it at the door and the till, every time. Join Herbal Holland Rewards free at the till. And ask the team anything: you'll get a plain-English answer.\n\nAdults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Bringing a friend in this weekend? A first visit: bring your ID (we check it at the door and the till), join Herbal Holland Rewards free at the till, and ask the team anything, in plain English. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Your first visit",
          lines: ["Bring your ID: we check it at the door and the till", "Join Herbal Holland Rewards free at the till", "Ask the team anything, in plain English"],
        },
        brief: "A photo at the Hillcrest door: a member advisor welcoming two friends (adults over 25, signed releases), the windmill in the window. No products in shot.",
      },

      // ── Week 4: the basics, the evenings in pictures, thank you ──────────────────────────────────────────────────
      {
        key: "learn-lab", day: 22, time: "07:00", channel: "SOCIAL",
        text: "The basics, in a minute.\n\nAdults 18+ only. Keep products in their original packaging, locked away and out of reach. Never drive or operate machinery while impaired. Don't mix with alcohol. And private use stays in private places.\n\nThe full guide is in Learn: link in bio. Adults 18+.\n#HerbalHolland",
        short: "The basics, in a minute: adults 18+ only; locked away and out of reach; never drive or operate machinery while impaired; don't mix with alcohol; private use in private places. Learn: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "The basics, in a minute.", sub: "Five things we ask every member to live by." },
        brief: "A 5-slide carousel, one basic a slide: adults 18+ only; locked away and out of reach; never drive while impaired; don't mix with alcohol; private use in private places. Brand artwork, no products in shot.",
      },
      {
        key: "evening-photos", day: 23, time: "19:00", channel: "SOCIAL",
        text: "That's gezellig. Siyabonga to everyone who came to February's evenings in Hillcrest and Hilton, and to the teams who hosted them.\n\nMarch's evenings are coming: watch the Rewards app for the dates. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        card: { template: "headline", headline: "That's gezellig.", sub: "Siyabonga, Hillcrest and Hilton, for February's evenings." },
        brief: "Up to five photos from the Hillcrest and Hilton evenings (adults over 25 only, signed releases): people talking, the team among them. No products in shot.",
      },
      {
        key: "channel-thank-you", day: 24, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Siyabonga to everyone who came to February's Gezellig evenings in Hillcrest and Hilton.",
          "Next: on Wednesday 10 March, our stores are 100 days old, and we'll say thank you all week. The details are in The Windmill, our members' newsletter, on Tuesday 2 March.",
          "Not a member yet? Joining Herbal Holland Rewards is free for adults 18+.",
        ),
      },
      {
        key: "reel-opening-up", day: 24, time: "19:00", channel: "SOCIAL",
        text: "Opening up in Hilton: lights on, the windmill in the window, the team's first coffee, and the door open for the first hello of the day.\n\nCome and say sawubona. Adults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills #Hilton",
        card: { template: "headline", eyebrow: "Store life", headline: "Opening up in Hilton.", sub: "Lights on, the windmill in the window, the first hello of the day." },
        brief: "A 30-second Reel of the Hilton team (adults over 25, signed releases) opening up: lights, the windmill in the window, the door unlocked at opening time. No products in shot.",
      },
      {
        key: "lab-weekend", day: 26, time: "09:00", channel: "SOCIAL",
        text: "This weekend in store: bring your questions, and a friend. Ask us to read any label with you, line by line, or to explain how points work, and you'll get a plain-English answer.\n\nNot a member yet? Joining Herbal Holland Rewards is free at the till. Adults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills",
        short: "This weekend in store: bring your questions, and a friend. We'll read any label with you, line by line, or explain how points work, in plain English. Joining is free at the till. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "headline", eyebrow: "This weekend in store", headline: "Bring your questions, and a friend.", sub: "Any label, line by line, or how points work. In plain English." },
        brief: "A photo at the counter (adults over 25, signed releases): a member advisor reading a plain mock label with a member. No products in shot.",
      },
    ],
  },
];
