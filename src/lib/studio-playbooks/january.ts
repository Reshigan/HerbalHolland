// January 2027, Know your Holland: fixed dates. The weekly rhythm: Tuesday 07:00 Read the label (a four-part Learn
// series), Wednesday 19:00 community and people, Thursday 19:00 store life or events, Saturday 09:00 made here or this
// weekend in store; LinkedIn on most Wednesdays at 12:00, the WhatsApp Channel on most Thursdays at 12:30. The first
// Gezellig evenings: Hillcrest on Thursday 21 January, Hilton on Friday 22 January.
import type { Playbook } from "../studio";
import { paras } from "./shared";

export const JANUARY: Playbook[] = [
  {
    key: "january-2027",
    name: "January 2027: Know your Holland",
    blurb: "Know your Holland: Read the label every Tuesday, our neighbours, team and Open Day questions on Wednesdays, store life and the first Gezellig evenings (Hillcrest Thursday 21, Hilton Friday 22 January) on Thursdays, the makers and the merch on Saturdays; The Windmill, No. 3, and a plain guide to instant savings and My Deals for the long month.",
    store: false,
    anchor: "Monday 4 January",
    date: "2027-01-04",
    items: [
      // ── Week 1: welkom to 2027 ────────────────────────────────────────────────────────────────────────────────
      {
        key: "label-1", day: 1, time: "07:00", channel: "SOCIAL",
        text: "Read the label, part 1 of 4: what it is. Start with three things: the name, the kind of product (a CBD supplement, a CBD food or drink, or CBD skin care), and how much is in the pack, in grams or millilitres. Skin care is applied, not taken, so it has no daily amount. A new part every Tuesday this month. Adults 18+. #HerbalHolland",
        short: "Read the label, part 1 of 4: what it is. The name, the kind of product (supplement, food or drink, or skin care) and how much is in the pack. A new part every Tuesday this month. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Read the label · 1 of 4", headline: "What it is.", sub: "The name, the kind of product, and how much is in the pack." },
        brief: "A 5-slide carousel on a plain mock label (no real product): 1) Read the label, part 1: what it is; 2) the name; 3) the kind: supplement, food or drink, or skin care; 4) the pack size, in g or ml; 5) next Tuesday: the numbers.",
      },
      {
        key: "windmill-no-3", day: 1, time: "16:00", channel: "EMAIL",
        title: "The Windmill, No. 3: Know your Holland",
        text: paras(
          "Hi {{firstName}},",
          "Welkom to 2027, and to The Windmill, our newsletter for Herbal Holland Rewards members. This month's theme is Know your Holland: our labels, our people and our evenings.",
          "December, in short. On Tuesday 1 December our doors opened in Hillcrest and Hilton. Opening week brought our Members' Evening and Open Day, with a coffee cart, local makers' tables and Learn sessions with the team on the hour. The Founding Members list closed on Sunday 6 December, and every Founding Member's numbered card is in the Rewards app. Siyabonga for such a warm welcome.",
          "Read the label. Every Tuesday this month, a four-part Learn series on reading a label, line by line: what it is, the numbers, what's in it, and what a label may say. Each part is on our social pages, and the whole read is in Learn at shop.herbalholland.com.",
          "Gezellig evenings. Gezellig is Dutch for warm, sociable, at home, and from this month each store hosts a Gezellig evening every month: Hillcrest on the third Thursday and Hilton the evening after, 18:00–20:00. The first are on Thursday 21 January in Hillcrest and Friday 22 January in Hilton. They're for members: RSVP in the Rewards app, and bring your ID.",
          "Your Rewards in the long month. January is a long month, so here's how your membership works for you. Instant member savings come off eligible items automatically, in store and online. You earn points on every rand. And every Monday, My Deals brings you a personal offer, automatically, with nothing to clip or remember.",
          "See you this month,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-windmill", day: 1, time: "18:30", channel: "PUSH",
        title: "The Windmill, No. 3",
        text: "Know your Holland: the December story, Read the label, and January's Gezellig evenings in Hillcrest and Hilton.",
      },
      {
        key: "linkedin-month", day: 2, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "A month in the hills: three things we're keeping. On 1 December we opened two new stores, in Hillcrest and Hilton. First, plain English: this month our Learn series teaches how to read a label, line by line. Second, the basics, every time: members only, adults 18+, ID at the door and the till, and a Good Neighbour Promise at each store. Third, time together: from this month, each store hosts a Gezellig evening every month. Thank you to our teams, our neighbours and our members for a warm first month. #HerbalHolland #HollandMeetsTheHills",
        short: "A month in the hills, and three things we're keeping: plain English, starting with how to read a label; the basics every time, members only, adults 18+, ID at the door and the till; and time together, with a Gezellig evening at each store every month. #HerbalHolland",
        card: { template: "headline", eyebrow: "A month in the hills", headline: "Three things we're keeping.", sub: "Plain English. The basics, every time. Time together." },
      },
      {
        key: "neighbours", day: 2, time: "19:00", channel: "SOCIAL",
        text: "A letter to our neighbours in Hillcrest and Hilton, a month in: how are we doing? When we opened, we made you a Good Neighbour Promise: adults 18+ only, ID at the door and the till, nothing used on or outside our premises, no queues on the pavement, good security and lighting, and a direct line to the manager, with a reply within one working day. If we've fallen short anywhere, tell us below or ask for the manager in store. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        short: "A letter to our neighbours, a month in: how are we doing? We promised adults 18+ only, ID at the door and the till, nothing used on or outside our premises, and no queues on the pavement. Tell us below, or ask for the manager in store. #HerbalHolland",
        card: {
          template: "promise",
          headline: "A month in: how are we doing?",
          lines: ["Adults 18+ only, ID at the door and the till", "Nothing used on or outside our premises", "No queues on the pavement", "Good security and lighting", "The manager's direct line: a reply in a working day"],
        },
        brief: "A photo of each store manager (over 25, signed release) on the pavement outside their store in daylight, holding the printed Good Neighbour Promise.",
      },
      {
        key: "channel-january", day: 3, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Welkom to 2027. Here's January at Herbal Holland.",
          "Read the label: every Tuesday this month, a four-part Learn series on reading a label, line by line, on our pages and in Learn.",
          "Gezellig evenings: from this month, an evening at each store every month, for members. The first are at Hillcrest on Thursday 21 January and at Hilton on Friday 22 January, 18:00–20:00. Members RSVP in the Rewards app, and joining is free.",
          "Adults 18+.",
        ),
      },
      {
        key: "gezellig", day: 3, time: "19:00", channel: "SOCIAL",
        text: "Gezellig is Dutch for warm, sociable, at home, and from this month it's an evening at each of our stores, every month: Hillcrest on the third Thursday, Hilton the evening after, 18:00–20:00. The first: Thursday 21 January in Hillcrest and Friday 22 January in Hilton. For members: RSVP in the Rewards app. Adults 18+, ID at the door. #HerbalHolland #HollandMeetsTheHills",
        short: "Gezellig: Dutch for warm, sociable, at home. From this month, an evening at each store, every month. The first: Hillcrest on Thursday 21 January, Hilton on Friday 22 January, 18:00–20:00. RSVP in the Rewards app. Adults 18+. #HerbalHolland",
        card: { template: "event", eyebrow: "Gezellig evenings", headline: "Thursday 21 and Friday 22 January", sub: "18:00–20:00. Hillcrest on the Thursday, Hilton on the Friday. RSVP in the app." },
        brief: "A 20–40 second Reel from opening week's Members' Evening: coffee and rooibos poured, the team showing members around, warm light and conversation (adults over 25, signed releases; no products in shot).",
      },
      {
        key: "makers", day: 5, time: "09:00", channel: "SOCIAL",
        text: "The makers behind our merch. Every windmill on our tees, caps, beanies and bucket hats is embroidered in Sunset orange, stitch by stitch, and the big back prints and the tote are printed on film and heat-pressed. Meet the people who make them. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        short: "The makers behind our merch: every windmill embroidered in Sunset orange, stitch by stitch, and the big back prints and the tote printed and heat-pressed. Meet the people who make them. Adults 18+. #HerbalHolland",
        card: { template: "merch", image: "windmill-cap", headline: "The makers behind our merch.", sub: "Every windmill embroidered, stitch by stitch." },
        brief: "A 20–40 second Reel with our embroidery and print partner: the windmill being stitched onto a cap, a back print being heat-pressed onto a tee, and the people who make them (adults over 25, signed releases).",
      },
      // ── Week 2: the numbers and the team ─────────────────────────────────────────────────────────────────────
      {
        key: "label-2", day: 8, time: "07:00", channel: "SOCIAL",
        text: "Read the label, part 2 of 4: the numbers. A CBD supplement's label shows the CBD in the whole pack and the most to take in a day, both in milligrams. Schedule 0 sets the ceilings: at most 600 mg of CBD in a pack and 20 mg a day. CBD food and drink may hold only the CBD that's naturally in its ingredients, at most 0.0075%. Adults 18+. #HerbalHolland",
        short: "Read the label, part 2 of 4: the numbers. The CBD in the pack and the most a day, in milligrams. Schedule 0 sets the ceilings for supplements: 600 mg a pack and 20 mg a day. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Read the label · 2 of 4", headline: "The numbers.", sub: "The CBD in the pack, the most a day, and the ceilings Schedule 0 sets." },
        brief: "A 5-slide carousel on a plain mock label (no real product): 1) Read the label, part 2: the numbers; 2) mg of CBD in the pack; 3) the most a day, in mg; 4) Schedule 0's ceilings: 600 mg a pack, 20 mg a day; 5) food and drink: only what's naturally in the ingredients, at most 0.0075%.",
      },
      {
        key: "advisors", day: 9, time: "19:00", channel: "SOCIAL",
        text: "Team spotlight: our member advisors. They're the first people you meet at Herbal Holland: a warm welcome at the door, an ID check, and plain-English answers about labels, products and Rewards. Ask them anything about Read the label, this month's Learn series. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        short: "Team spotlight: our member advisors. A warm welcome at the door, an ID check, and plain-English answers about labels, products and Rewards. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Team spotlight", headline: "Our member advisors.", sub: "A warm welcome, an ID check, and plain-English answers." },
        brief: "A photo of one member advisor from each store (over 25, signed release) at the door, smiling, in a Windmill Tee. When you post it by hand, add their first name and a line in their own words.",
      },
      {
        key: "channel-gezellig", day: 10, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Our first Gezellig evenings are next week: Hillcrest on Thursday 21 January and Hilton on Friday 22 January, 18:00–20:00.",
          "Gezellig is Dutch for warm, sociable, at home: an evening at the store with the team and fellow members. They're for members of Herbal Holland Rewards: RSVP in the Rewards app. Joining is free for adults 18+.",
          "Adults 18+, ID at the door.",
        ),
      },
      {
        key: "first-visit", day: 10, time: "19:00", channel: "SOCIAL",
        text: "Your first visit, in 30 seconds: ID at the door, a warm welcome from a member advisor, plain-English answers about any label, and your Rewards at the till. Not a member yet? Joining is free, at the till. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "headline", eyebrow: "Your first visit", headline: "ID, a welcome, straight answers.", sub: "And your Rewards at the till. Joining is free if you haven't yet." },
        brief: "A 20–40 second Reel following a member (over 25, signed release) from the door to the till: the ID check, a member advisor showing a label, the Rewards card on a phone at the till. No products in use.",
      },
      {
        key: "weekend-labels", day: 12, time: "09:00", channel: "SOCIAL",
        text: "This weekend in store: bring your questions about any label. Our teams in Hillcrest and Hilton will read it with you, line by line, in plain English. It's this month's Learn series, Read the label, in person. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "headline", eyebrow: "This weekend in store", headline: "Read a label with the team.", sub: "Line by line, in plain English. Hillcrest and Hilton." },
        brief: "A photo at the counter: a member advisor (over 25, signed release) pointing out a line on a plain mock label for a member. No products in use.",
      },
      // ── Week 3: the first Gezellig evenings ──────────────────────────────────────────────────────────────────
      {
        key: "sms-gezellig", day: 14, time: "10:00", channel: "SMS",
        text: "Hi {{firstName}}, our first Gezellig evenings are this week: Hillcrest on Thu 21 Jan and Hilton on Fri 22 Jan, 18:00 to 20:00. For members: RSVP in the Rewards app. Adults 18+.",
      },
      {
        key: "push-gezellig", day: 14, time: "18:30", channel: "PUSH",
        title: "Gezellig evenings, this week",
        text: "Hillcrest on Thursday, Hilton on Friday, 18:00 to 20:00: an evening with the team and fellow members. RSVP in the app.",
      },
      {
        key: "label-3", day: 15, time: "07:00", channel: "SOCIAL",
        text: "Read the label, part 3 of 4: what's in it. Food, drink and supplements list their ingredients and declare the major allergens: gluten, crustaceans, molluscs, eggs, fish, milk, peanuts, soybeans and tree nuts, or say there are none. Skin care lists its ingredients too. Unsure about anything? Ask the team in store. Adults 18+. #HerbalHolland",
        short: "Read the label, part 3 of 4: what's in it. The ingredients, and the major allergens declared, from gluten and milk to peanuts and tree nuts, or none. Unsure? Ask the team. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Read the label · 3 of 4", headline: "What's in it.", sub: "The ingredients, and every major allergen declared, or none." },
        brief: "A 5-slide carousel on a plain mock label (no real product): 1) Read the label, part 3: what's in it; 2) the ingredients list; 3) the major allergens, named on the label; 4) or \"no major allergens\"; 5) skin care lists its ingredients too.",
      },
      {
        key: "linkedin-team", day: 16, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "The people behind our stores in the hills. Our member advisors are the first people members meet: a warm welcome, an ID check, and plain-English answers about labels, products and Rewards. Our store managers run the store and the team: rosters, stock, the neighbours and the standards. Every one of them was trained from day one. Siyabonga, Hillcrest and Hilton teams, for a warm start. #HerbalHolland",
        short: "The people behind our stores in the hills: member advisors, with a warm welcome, an ID check and plain-English answers, and store managers who run the store, the team and the standards. Siyabonga, Hillcrest and Hilton teams. #HerbalHolland",
        card: { template: "headline", eyebrow: "Our teams", headline: "Warm welcomes. Straight answers.", sub: "The member advisors and store managers of Hillcrest and Hilton." },
      },
      {
        key: "open-day-questions", day: 16, time: "19:00", channel: "SOCIAL",
        text: "Questions from Open Day, answered. Do I need to be a member? Yes, and joining Herbal Holland Rewards is free for adults 18+, online, in the app or at the till. Why ID every time? Everything we do is for adults 18+, so we check at the door and the till. Can I bring a friend? Yes, if they're 18 or over and bring their ID. Ask us more below. Adults 18+. #HerbalHolland",
        short: "Questions from Open Day, answered: yes, it's members only, and joining is free for adults 18+. We check ID at the door and the till, every time. And yes, bring a friend, if they're 18+ with ID. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Questions from Open Day",
          lines: ["Members only? Yes, and joining is free", "Why ID every time? Everything we do is 18+", "Bring a friend? Yes, if they're 18+ with ID", "Your Rewards? In every store and online"],
        },
        brief: "A 5-slide carousel over photos from Open Day (adults over 25, signed releases): one question per slide in the team's words: members only, ID every time, bringing a friend, Rewards in store and online, and \"ask us more below\".",
      },
      {
        key: "tonight", day: 17, time: "12:00", channel: "SOCIAL", pinned: true,
        text: "Tonight: our first Gezellig evening, at Herbal Holland Hillcrest, 18:00–20:00. Tomorrow: Hilton, same time. For members who've RSVP'd in the Rewards app. Adults 18+, ID at the door. #HerbalHolland #Hillcrest",
        card: { template: "event", eyebrow: "Gezellig evening", headline: "Tonight, Hillcrest", sub: "18:00–20:00. Tomorrow: Hilton. Members who RSVP. ID at the door." },
      },
      {
        key: "summer-hats", day: 19, time: "09:00", channel: "SOCIAL",
        text: "For long summer days: the Windmill Cap and the Sunset Bucket Hat, in black cotton with the windmill embroidered in Sunset orange. In stock: delivered anywhere in South Africa, or collected at your store. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        card: { template: "merch", image: "sunset-bucket-hat", headline: "Summer in the hills.", sub: "The Windmill Cap and the Sunset Bucket Hat, the windmill embroidered on each." },
        brief: "A photo outdoors in the hills on a bright morning: an adult over 25 (signed release) in the Sunset Bucket Hat, another in the Windmill Cap, the view behind them.",
      },
      // ── Week 4: the claims, and the long month ───────────────────────────────────────────────────────────────
      {
        key: "label-4", day: 22, time: "07:00", channel: "SOCIAL",
        text: "Read the label, part 4 of 4: what a label may say. A label may make only a handful of modest, approved claims, and never a medical one. If a product anywhere promises to fix a medical condition, take that as a warning sign. That's the series: read it again in Learn. Adults 18+. #HerbalHolland",
        short: "Read the label, part 4 of 4: what a label may say. Only modest, approved claims, never a medical one. A product promising to fix a medical condition is a warning sign. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Read the label · 4 of 4", headline: "What a label may say.", sub: "Only modest, approved claims, and never a medical one." },
        brief: "A 5-slide carousel on a plain mock label (no real product): 1) Read the label, part 4: what a label may say; 2) the approved claims on a label; 3) only modest claims; 4) never a medical claim; 5) the whole series in Learn.",
      },
      {
        key: "email-savings", day: 15, time: "16:00", channel: "EMAIL",
        title: "How instant savings and My Deals work",
        text: paras(
          "Hi {{firstName}},",
          "January is a long month, so here's a plain-English guide to what your Herbal Holland Rewards membership does each time you shop with us, in store or online.",
          "Instant member savings. Eligible items carry member savings that come off automatically: give your Rewards number at the till, or sign in when you check out online. There's nothing to clip or remember.",
          "My Deals. Every Monday, My Deals brings you one personal offer, chosen for you, automatically.",
          "Points and tiers. You earn points on every rand. As you shop, you climb from Seed to Sprout, Bloom and Harvest, and each tier has its own member savings.",
          "Your card lives in the Rewards app: add it to your home screen and it's with you at the till. For the full picture, How instant savings and points work is in Learn.",
          "See you soon,\nThe Herbal Holland team",
        ),
      },
      {
        key: "linkedin-lab", day: 23, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "Why we spent four Tuesdays on a label. Trust shouldn't rest on adjectives. A label says what a product is, how much is in the pack, what's in it and what it may claim, so this month we went through one, line by line. Plain information, given plainly, is the most useful thing we can offer. #HerbalHolland",
        short: "Why we spent four Tuesdays on a label: trust shouldn't rest on adjectives. What it is, how much is in the pack, what's in it and what it may claim, line by line. #HerbalHolland",
        card: { template: "headline", eyebrow: "Read the label", headline: "Trust shouldn't rest on adjectives.", sub: "Four Tuesdays on how to read a label, line by line." },
      },
      {
        key: "gezellig-thanks", day: 23, time: "19:00", channel: "SOCIAL",
        text: "Siyabonga to everyone who came to our first Gezellig evenings in Hillcrest and Hilton. Gezellig means warm, sociable, at home, and you made it so. The next are in February, on the third Thursday in Hillcrest and the evening after in Hilton, 18:00–20:00: RSVP in the Rewards app. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        short: "Siyabonga to everyone who came to our first Gezellig evenings in Hillcrest and Hilton: you made them warm. The next are in February: RSVP in the Rewards app. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Gezellig evenings", headline: "Warm, sociable, at home.", sub: "Siyabonga to everyone who came. The next are in February." },
        brief: "A photo from the evening at each store: members and the team in conversation, warm light (adults over 25, signed releases; no products in shot).",
      },
      {
        key: "channel-month", day: 24, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Siyabonga for a warm January, and for coming to our first Gezellig evenings.",
          "How are we doing? Our Good Neighbour Promise stands: adults 18+ only, ID at the door and the till, nothing used on or outside our premises, no queues on the pavement, and a direct line to the manager, with a reply within one working day. If we've fallen short, ask for the manager in store.",
          "Next month's Gezellig evenings: Hillcrest on Thursday 18 February and Hilton on Friday 19 February, 18:00–20:00. Members RSVP in the Rewards app.",
          "Adults 18+.",
        ),
      },
      {
        key: "manager", day: 24, time: "19:00", channel: "SOCIAL",
        text: "Store life: a day with the manager. Opening up, the team's morning huddle, the ID check at the door, a word with the neighbours, and the cash-up at close. Every store manager keeps a direct line open, with a reply within one working day. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        short: "Store life: a day with the manager. Opening up, the morning huddle, the ID check at the door, a word with the neighbours, and the cash-up at close. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Store life", headline: "A day with the manager.", sub: "Opening up, the door, the neighbours and the cash-up, in Hillcrest and Hilton." },
        brief: "A 20–40 second Reel of a store manager's day (over 25, signed release): unlocking the door, the team huddle, the ID check at the door, a chat on the pavement with a neighbour, the lights going off at close. No products in use.",
      },
      {
        key: "weekend-app", day: 26, time: "09:00", channel: "SOCIAL",
        text: "This weekend in store: ask the team to put the Rewards app on your home screen. Your Rewards card, ready at the till, My Deals every Monday, and a note from us when there's a Gezellig evening or a new drop. Adults 18+, bring your ID. #HerbalHolland",
        card: { template: "headline", eyebrow: "This weekend in store", headline: "Rewards on your home screen.", sub: "Your card at the till, My Deals every Monday, and a note when something's on." },
        brief: "A photo at the till: a member advisor (over 25, signed release) helping a member add the Rewards app to their home screen, the Rewards card on the phone.",
      },
    ],
  },
];
