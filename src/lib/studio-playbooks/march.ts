// March 2027, 100 days in the hills (to The Windmill No. 6 on 6 April): fixed dates. Day T is Monday 1 March; the
// pack runs to Tuesday 6 April (days 0–36). The stores opened on 1 December, so Wednesday 10 March is day 100, and the
// thank-you week (8–13 March) carries this month's Gezellig evenings: Hillcrest on Thursday 11 and Hilton on Friday 12
// March, a week earlier than the usual third Thursday and Friday. The same weekly rhythm as February. Nothing at all on
// Human Rights Day (Sunday 21, observed Monday 22 March), Good Friday (26 March) or Family Day (29 March), and no feed
// post on Wednesday 24 March: it's the Learn carousel day of the product launched on Tuesday 23 March.
import type { Playbook } from "../studio";
import { paras } from "./shared";

export const MARCH: Playbook[] = [
  {
    key: "march-2027",
    name: "March 2027: 100 days in the hills",
    blurb:
      "March to The Windmill No. 6 on Tuesday 6 April: 100 days in the hills on Wednesday 10 March, a thank-you week (8–13 March) with this month's Gezellig evenings in Hillcrest (11 March) and Hilton (12 March), the law in 2027, Easter hours, and slow autumn with the Winter Drop coming in May. Nothing on Human Rights Day, Good Friday or Family Day.",
    store: false,
    anchor: "Monday 1 March",
    date: "2027-03-01",
    items: [
      // ── Week 1: the law in 2027, The Windmill No. 5, the thank-you evenings announced ─────────────────────────────
      {
        key: "learn-law", day: 1, time: "07:00", channel: "SOCIAL",
        text: "The law in 2027: where things stand. A plain-English overview, not legal advice.\n\n1. Adults may use, possess and grow cannabis in private. The Constitutional Court decriminalised it in 2018, and Parliament has since passed the Cannabis for Private Purposes Act.\n2. Using cannabis in public, and supplying it to others, are not decriminalised.\n3. CBD has its own rules: within Schedule 0's limits (at most 600 mg a pack, 20 mg a day, and modest claims), it needs no prescription.\n4. Everything we do is for adults 18+, with ID at the door and the till.\n5. The law keeps moving. When it does, we update Learn, with the date.\n\nRead it in Learn: link in bio. Adults 18+.\n#HerbalHolland",
        short: "The law in 2027, in plain English (not legal advice): private use by adults is decriminalised; public use and supplying others are not; CBD within Schedule 0's limits needs no prescription. Read it in Learn: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "The law in 2027: where things stand.", sub: "A plain-English overview of what's allowed, and what isn't. Not legal advice." },
        brief: "A 5-slide carousel in plain type on the brand dark, one point a slide, with 'General information, not legal advice' on the last. No plants, leaves or products in shot.",
      },
      {
        key: "windmill-no-5", day: 1, time: "16:00", channel: "EMAIL",
        title: "The Windmill, No. 5: 100 days in the hills",
        text: paras(
          "Hi {{firstName}},",
          "On Wednesday 10 March, our stores in Hillcrest and Hilton are 100 days old. We opened the doors on 1 December, and we'd like to say thank you properly.",
          "The thank-you week. From Monday 8 to Saturday 13 March we're saying siyabonga, and this month's Gezellig evenings come a week early to be part of it: Herbal Holland Hillcrest on Thursday 11 March and Herbal Holland Hilton on Friday 12 March, 18:00–20:00. RSVP in the Rewards app, and bring your ID.",
          "What you ask us. A few questions come up at the counter again and again: why we check ID every time, whether you need to be a member, and what the QR on the pack shows. We've answered them, and more, in a new Learn read, 100 days of your questions, from Tuesday 9 March.",
          "Learn picks. The law in 2027: where things stand. A plain-English overview of what's allowed and what isn't, dated so you know when it was written. It's general information, not legal advice.",
          "Siyabonga for the first 100 days,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-windmill-5", day: 1, time: "18:30", channel: "PUSH",
        title: "The Windmill, No. 5 is out",
        text: "100 days in the hills on 10 March, and thank-you evenings in Hillcrest (11 March) and Hilton (12 March). RSVP in the app.",
      },
      {
        key: "li-members-only", day: 2, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "Members only, ID every time. Everyone who shops with Herbal Holland is a member of Herbal Holland Rewards, joining is free for adults 18+, and we check ID at the door and the till on every visit.\n\nIt costs each visit a minute. What it gives back is worth more: we know who we're serving, our neighbours know we mean it, and every member gets the same straight answers.\n\nWhat we're learning, nearly 100 days in: rules kept every time are what make a new category feel ordinary.\n\nAdults 18+.\n#HerbalHolland",
        short: "Members only, ID every time: it costs each visit a minute, and it's how we know who we're serving and how our neighbours know we mean it. Rules kept every time make a new category feel ordinary. #HerbalHolland",
        card: { template: "headline", eyebrow: "What we're learning", headline: "Members only, ID every time.", sub: "A minute at the door on every visit, and why it's worth it." },
      },
      {
        key: "advisor", day: 2, time: "19:00", channel: "SOCIAL",
        text: "Meet a member advisor: the first person you'll see at our door. They welcome you, check your ID, and answer your questions in plain English, from how points work to what's on a lab page.\n\nNext time you're in, say sawubona. Adults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Meet a member advisor: the first person you'll see at our door, with a welcome, an ID check and plain-English answers, from how points work to what's on a lab page. Next time you're in, say sawubona. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Meet the team", headline: "The first hello at our door.", sub: "Member advisors: a warm welcome, an ID check and straight answers." },
        brief: "A portrait of a member advisor (adult over 25, signed release) at the store door in a Windmill Tee, morning light; add their first name and store to the caption if they'd like. No products in shot.",
      },
      {
        key: "channel-100-days", day: 3, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Next week is a thank-you week. Herbal Holland Hillcrest and Hilton opened on 1 December, and on Wednesday 10 March they're 100 days old.",
          "This month's Gezellig evenings are our thank-you: Hillcrest on Thursday 11 March and Hilton on Friday 12 March, 18:00–20:00, for Herbal Holland Rewards members who RSVP in the Rewards app.",
          "Adults 18+, bring your ID.",
        ),
      },
      {
        key: "reel-setting-up", day: 3, time: "19:00", channel: "SOCIAL",
        text: "Setting up for a Gezellig evening: chairs out, cups ready, the lights down a little, and the team at the door. Next week's are our thank-you for 100 days: Hillcrest on Thursday 11 March and Hilton on Friday 12 March, 18:00–20:00.\n\nRSVP in the Rewards app. Adults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Setting up for a Gezellig evening. Next week's are our thank-you for 100 days: Hillcrest on Thursday 11 March, Hilton on Friday 12 March, 18:00–20:00. RSVP in the Rewards app. Adults 18+. #HerbalHolland",
        card: { template: "event", eyebrow: "Gezellig evenings: 100 days", headline: "11 and 12 March", sub: "Hillcrest Thursday, Hilton Friday, 18:00–20:00. RSVP in the app." },
        brief: "A 30-second Reel, sped up, of a team (adults over 25, signed releases) setting up the store for a Gezellig evening: chairs, cups, lights, the windmill in the window. No products in shot.",
      },
      {
        key: "crewneck", day: 5, time: "09:00", channel: "SOCIAL",
        text: "Made for the first cool evenings of autumn: the Heritage Crewneck. Black fleece, with the windmill and our line, Dutch heritage · African soil, embroidered on the chest.\n\nIn stock, delivered anywhere in South Africa or collected in store: link in bio. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        short: "The Heritage Crewneck: black fleece, with the windmill and Dutch heritage · African soil embroidered on the chest. In stock, delivered anywhere in South Africa or collected in store: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "merch", image: "heritage-crewneck", headline: "The Heritage Crewneck", sub: "Black fleece, the windmill and Dutch heritage · African soil, embroidered." },
        brief: "A photo of the crewneck on a team member (adult over 25, signed release) on a Midlands stoep at dusk.",
      },

      // ── Week 2: the thank-you week, day 100 (Wednesday 10 March) ───────────────────────────────────────────────────
      {
        key: "sms-100-days", day: 7, time: "10:00", channel: "SMS",
        text: "Hi {{firstName}}, siyabonga from Herbal Holland: on Wednesday our stores are 100 days old. This week's Gezellig evenings are our thank-you: Hillcrest Thursday, Hilton Friday, 18:00 to 20:00. RSVP in the Rewards app. Adults 18+.",
      },
      {
        key: "learn-questions", day: 8, time: "07:00", channel: "SOCIAL",
        text: "100 days of your questions, answered.\n\nWhy do you check my ID every time? Everything we do is for adults 18+, so we check at the door and the till, on every visit.\nDo I need to be a member? Yes: everyone who shops with us is a member of Herbal Holland Rewards, and joining is free for adults 18+.\nWhat does the QR on the pack show? The lab page for that exact batch: the potency, the terpene list and the safety tests.\nHow do points work? You earn points on every rand, and climb from Seed to Harvest.\nCan I bring a friend? Yes, if they're 18 or over and bring their ID.\n\nMore answers in Learn: link in bio. Adults 18+.\n#HerbalHolland",
        short: "100 days of your questions, answered: why we check ID every time, whether you need to be a member, what the QR on the pack shows, how points work, and whether you can bring a friend. Learn: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "100 days of your questions.", sub: "ID, membership, lab pages, points and friends, answered in plain English." },
        brief: "A 5-slide carousel, one question and its answer a slide, in plain type on the brand dark. No products in shot.",
      },
      {
        key: "day-100", day: 9, time: "07:00", channel: "SOCIAL", pinned: true, linkedin: "also",
        text: "Today is day 100. We opened our doors in Hillcrest and Hilton on 1 December, and this is what 100 days in the hills have taught us.\n\nWhat we learnt: a good question deserves a plain answer, and you ask good questions. The ones we hear most now have their own Learn read.\nWhat you read: Learn, from lab results to the law.\nWhat you wore: the windmill, from the Tee to the Tote.\n\nSiyabonga for 100 days. Our thank-you evenings are on Thursday in Hillcrest and Friday in Hilton, for members who RSVP in the Rewards app. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Today is day 100. We opened in Hillcrest and Hilton on 1 December, and the lesson is simple: a good question deserves a plain answer. Siyabonga for 100 days. Thank-you evenings Thursday and Friday: RSVP in the Rewards app. Adults 18+. #HerbalHolland",
        card: { template: "countdown", headline: "100 days", sub: "in the hills, since 1 December. Siyabonga, Hillcrest and Hilton." },
        brief: "A 5-slide carousel: 1 day 100 over the hills; 2 what we learnt; 3 what you read (the most-read Learn read, from Reports); 4 what you wore (the merch members chose most, from Reports); 5 siyabonga and the thank-you evenings. HQ adds the true figures to the slides and the caption before approving, and leaves out any it can't check.",
      },
      {
        key: "channel-evenings", day: 10, time: "12:30", channel: "WHATSAPP", pinned: true,
        text: paras(
          "Gezellig tonight at Herbal Holland Hillcrest, and tomorrow at Herbal Holland Hilton: our thank-you evenings for 100 days, 18:00–20:00, for Herbal Holland Rewards members who RSVP in the Rewards app.",
          "Siyabonga for 100 days. Adults 18+, bring your ID.",
        ),
      },
      {
        key: "team-day-100", day: 10, time: "19:00", channel: "SOCIAL",
        text: "The team at day 100. These are the people who've opened our doors in Hillcrest and Hilton since 1 December, with a welcome, an ID check and a straight answer for everyone who came in.\n\nSiyabonga to them, and to you. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        card: { template: "headline", eyebrow: "Day 100", headline: "The team at day 100.", sub: "Hillcrest and Hilton, since 1 December. Siyabonga." },
        brief: "A team photo at each store on day 100 (adults over 25, signed releases), everyone in Windmill merch outside the door, the windmill in the window; post both stores as two pictures. No products in shot.",
      },
      {
        key: "tee", day: 12, time: "09:00", channel: "SOCIAL",
        text: "The Windmill Tee: the windmill embroidered on the chest, and the poster from our store windows printed across the back, on black combed cotton.\n\nIn stock, delivered anywhere in South Africa or collected in store: link in bio. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        card: { template: "merch", image: "windmill-tee", headline: "The Windmill Tee", sub: "The windmill on the chest, our window poster across the back." },
        brief: "A photo of the tee's back on a team member (adult over 25, signed release) beside the store window, the poster in the window next to them.",
      },

      // ── Week 3: tiers, the evenings in pictures, how the merch is made ─────────────────────────────────────────────
      {
        key: "learn-tiers", day: 15, time: "07:00", channel: "SOCIAL",
        text: "How Rewards tiers work, simply.\n\nThere are four: Seed, Sprout, Bloom and Harvest. You start at Seed when you join, free, for adults 18+ (Founding Members hold at least Sprout for their first 14 months). Your tier follows what you've spent over the last 12 months, and it moves up the moment you qualify. Each tier keeps everything from the tiers below it, with bigger instant member savings on eligible items as you climb. And at every tier, you earn points on every rand.\n\nThe full guide is in Learn: link in bio. Adults 18+.\n#HerbalHolland",
        short: "How Rewards tiers work: Seed, Sprout, Bloom, Harvest. Your tier follows your last 12 months, moves up the moment you qualify, and keeps everything below it. Points on every rand at every tier. Learn: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "How Rewards tiers work",
          lines: ["Four tiers: Seed, Sprout, Bloom and Harvest", "Your tier follows your last 12 months", "It moves up the moment you qualify", "Each tier keeps everything below it", "Points on every rand, at every tier"],
        },
        brief: "A 5-slide carousel: a title slide, then one tier a slide with its badge from the Rewards app. No products in shot.",
      },
      {
        key: "li-questions", day: 16, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "100 days in, our best source of ideas is the counter. Members ask good questions, so we write the answers down: in plain English, dated and sourced, and published in Learn for anyone to read.\n\nThis month's two: 100 days of your questions, and The law in 2027: where things stand.\n\nWhat we're learning: if a question comes up twice, it deserves a page.\n\nAdults 18+.\n#HerbalHolland",
        short: "100 days in, our best source of ideas is the counter. Members ask good questions, so we write the answers down in Learn: plain English, dated and sourced. If a question comes up twice, it deserves a page. #HerbalHolland",
        card: { template: "headline", eyebrow: "What we're learning", headline: "If a question comes up twice, it gets a page.", sub: "Members' questions, answered in Learn: plain English, dated and sourced." },
      },
      {
        key: "evenings-thank-you", day: 16, time: "19:00", channel: "SOCIAL",
        text: "Siyabonga for the thank-you evenings. Thank you to everyone who came to Hillcrest and Hilton last week to mark 100 days, and to the teams who hosted.\n\nApril's Gezellig evenings: Hillcrest on Thursday 15 April and Hilton on Friday 16 April, 18:00–20:00. RSVP in the Rewards app. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Siyabonga to everyone who came to our thank-you evenings for 100 days. April's Gezellig evenings: Hillcrest on Thursday 15 April and Hilton on Friday 16 April, 18:00–20:00. RSVP in the Rewards app. Adults 18+. #HerbalHolland",
        card: { template: "headline", headline: "Siyabonga for 100 days.", sub: "Thank you for the evenings in Hillcrest and Hilton." },
        brief: "Up to five photos from the thank-you evenings (adults over 25 only, signed releases): members and the team talking, the windmill in the window. No products in shot.",
      },
      {
        key: "reel-questions", day: 17, time: "19:00", channel: "SOCIAL",
        text: "Three questions we hear at the counter, answered by the team in 30 seconds: why ID every time, do I need to be a member, and what does the QR on the pack show?\n\nMore answers in Learn: link in bio. Adults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills",
        card: { template: "headline", eyebrow: "Store life", headline: "Three questions, answered at the counter.", sub: "ID every time, membership, and the QR on the pack." },
        brief: "A 30-second Reel: three team members (adults over 25, signed releases) each answer one question to camera, in their own words, in front of the windmill. No products in shot.",
      },
      {
        key: "how-its-made", day: 19, time: "09:00", channel: "SOCIAL",
        text: "Embroidered or printed? Our logos are embroidered: the windmill on the tee, the cap, the bucket hat and the beanie's cuff, the lock-up on the hoodie, and the windmill with our line on the crewneck. The big back prints and the tote are printed: the artwork goes onto a film that's heat-pressed onto the fabric.\n\nAll of it in stock, delivered anywhere in South Africa or collected in store: link in bio. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Embroidered or printed? Our logos are embroidered, from the windmill on the cap to the beanie's cuff. The big back prints and the tote are printed on film and heat-pressed on. In stock: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "merch", image: "windmill-cap", headline: "Embroidered or printed?", sub: "Logos stitched; the back prints and the tote heat-pressed." },
        brief: "A 5-slide carousel of close-ups: the stitched windmill on the cap, the beanie's cuff and the hoodie's chest, then the tee's back print and the tote. Merch only.",
      },

      // ── Week 4: Human Rights Day (Sunday 21, observed Monday 22) and Good Friday (26) stay quiet; Easter hours. No feed
      // post on Wednesday 24: the product launched on Tuesday 23 has its Learn carousel then (LinkedIn-only is fine) ──
      {
        key: "learn-safety", day: 22, time: "07:00", channel: "SOCIAL",
        text: "The safety tests on a lab page, one by one.\n\nMicrobes: moulds, yeasts and bacteria such as E. coli and Salmonella, picked up while growing, drying or in storage.\nPesticides: residues of what's sprayed on a crop, which can stay on it.\nHeavy metals: lead, cadmium, arsenic and mercury, taken up from soil and water.\nMycotoxins: toxins from moulds, which grow when material is stored damp.\nSolvents: what's left over from extraction, so only extracts are tested for them.\n\nPASS means the lab measured it below its limit. Every one of our batches has a public lab page. Learn: link in bio. Adults 18+.\n#HerbalHolland",
        short: "The safety tests on a lab page: microbes, pesticides, heavy metals, mycotoxins, and solvents for extracts. PASS means the lab measured it below its limit. Every one of our batches has a public lab page. Learn: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "The safety tests, one by one",
          lines: ["Microbes: moulds, yeasts and bacteria", "Pesticides: what's sprayed can stay", "Heavy metals: taken up from soil and water", "Mycotoxins: from moulds, in damp storage", "Solvents: tested in extracts only"],
        },
        brief: "A 5-slide carousel, one test a slide, each with the PASS mark from a demo lab page. No products in shot.",
      },
      {
        key: "sms-easter", day: 22, time: "10:00", channel: "SMS",
        text: "Hi {{firstName}}, visiting us over the Easter long weekend? Please check your store's hours on its page first: shop.herbalholland.com/stores. Adults 18+, bring your ID.",
      },
      {
        key: "li-tills", day: 23, time: "12:00", channel: "SOCIAL", linkedin: "only",
        text: "Our tills keep going when the power or the network doesn't. The point of sale is built to work offline: sales carry on, and everything syncs as soon as the connection is back.\n\nWhat we're learning: in South Africa, a store that stops when the lights go out isn't one members can rely on. Building for that from the first day was one of our better decisions.\n\nAdults 18+.\n#HerbalHolland",
        short: "Our tills keep going when the power or the network doesn't: the point of sale works offline, and everything syncs when the connection is back. In South Africa, a store has to keep going when the lights go out. #HerbalHolland",
        card: { template: "headline", eyebrow: "What we're learning", headline: "Tills that keep going when the lights go out.", sub: "Our point of sale works offline, and syncs when the connection is back." },
      },
      {
        key: "channel-easter", day: 24, time: "12:30", channel: "WHATSAPP",
        text: paras(
          "Easter is almost here. If you're visiting over the long weekend, please check your store's hours on its page first: herbalholland.com/stores",
          "However you spend it, we hope it's a slow one.",
          "Adults 18+, bring your ID.",
        ),
      },
      {
        key: "reel-card", day: 24, time: "19:00", channel: "SOCIAL",
        text: "Your Rewards card lives in the Rewards app: show it at the till, and your points and member savings on eligible items come with you. It's the same membership in every store and online.\n\nNot a member yet? Join free: link in bio. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        card: { template: "headline", eyebrow: "Store life", headline: "Your Rewards card, on your phone.", sub: "Open the Rewards app at the till: points and member savings, every visit." },
        brief: "A 20-second Reel at the till: a member (adult over 25, signed release) opens the Rewards app and the advisor scans the card on their phone. Screens and hands only, no products in shot.",
      },
      {
        key: "easter", day: 26, time: "09:00", channel: "SOCIAL",
        text: "A slow Easter weekend in the hills. However you spend it, we hope there's time for a long walk, a long lunch and good company.\n\nVisiting us? Each store's page has its hours: link in bio. Adults 18+.\n#HerbalHolland #HollandMeetsTheHills",
        card: { template: "reveal", headline: "A slow Easter in the hills." },
        brief: "A quiet landscape: the Midlands or the Valley of a Thousand Hills in soft morning light. No people or products needed.",
      },

      // ── Week 5 (Family Day, Monday 29 March, stays quiet) and The Windmill No. 6 ───────────────────────────────────
      {
        key: "learn-status", day: 29, time: "07:00", channel: "SOCIAL",
        text: "Released, on hold, recalled: what a batch's status means.\n\nEvery lab page shows its batch's status at the top. Released means it passed its tests and can go out to members. On hold means it's paused, for example while a result is re-tested. Recalled means it's been called back, and the page says so in plain language.\n\nOur tills block anything on hold or recalled, automatically. Learn: link in bio. Adults 18+.\n#HerbalHolland",
        short: "Every lab page shows its batch's status: Released (passed its tests), On hold (paused, say while a result is re-tested) or Recalled (called back). Our tills block anything on hold or recalled, automatically. Learn: link in bio. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Released, on hold, recalled",
          lines: ["Released: it passed its tests", "On hold: paused, say for a re-test", "Recalled: called back, and the page says so", "Our tills block on hold and recalled batches"],
        },
        brief: "A 5-slide carousel: the status at the top of a demo lab page, then one status a slide, then a slide on the tills. No products in shot.",
      },
      {
        key: "autumn", day: 30, time: "19:00", channel: "SOCIAL",
        text: "Autumn in the Midlands: cool mornings, mist in the valleys, and the light going gold over the hills by late afternoon. It's the season for slowing down.\n\nWhat's your autumn ritual? Adults 18+.\n#HerbalHolland #HollandMeetsTheHills #KZNMidlands",
        card: { template: "reveal", headline: "Autumn in the Midlands." },
        brief: "A photo of a Hilton team member (adult over 25, signed release) on a Midlands road or hill at golden hour, in the Heritage Crewneck, mist below.",
      },
      {
        key: "reel-opening-up", day: 31, time: "19:00", channel: "SOCIAL",
        text: "Opening up in Hillcrest: lights on, the windmill in the window, the team's first coffee, and the door open for the first hello of the day.\n\nCome and say sawubona. Adults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills #Hillcrest",
        card: { template: "headline", eyebrow: "Store life", headline: "Opening up in Hillcrest.", sub: "Lights on, the windmill in the window, the first hello of the day." },
        brief: "A 30-second Reel of the Hillcrest team (adults over 25, signed releases) opening up: lights, the windmill in the window, the door unlocked at opening time. No products in shot.",
      },
      {
        key: "promise", day: 33, time: "09:00", channel: "SOCIAL",
        text: "What to expect at our stores this weekend, and every weekend: our Good Neighbour Promise. Adults 18+ only, with ID at the door and the till. No smoking, vaping or using our products on or outside our premises. No queues on the pavement. Good security and lighting. And a direct line to the manager, with a reply within one working day.\n\nAdults 18+, bring your ID.\n#HerbalHolland #HollandMeetsTheHills",
        short: "Our Good Neighbour Promise, this weekend and every weekend: adults 18+ only, ID at the door and the till, nothing used on or outside our premises, no queues on the pavement, and a direct line to the manager. Adults 18+. #HerbalHolland",
        card: {
          template: "promise",
          headline: "Our Good Neighbour Promise",
          lines: ["Adults 18+ only, with ID at the door and the till", "Nothing used on or outside our premises", "No queues on the pavement", "Good security and lighting", "A direct line to the manager, a reply in a working day"],
        },
        brief: "A photo of a store manager (adult over 25, signed release) at the door of the Hilton or Hillcrest store in daylight: the windmill in the window, a clear pavement. No products in shot.",
      },
      {
        key: "learn-terpenes", day: 36, time: "07:00", channel: "SOCIAL",
        text: "Terpenes, without the hype.\n\nTerpenes are aroma compounds made by many plants: they're why citrus peel, pine needles, lavender and black pepper smell the way they do. On a lab page, the terpene list shows the main ones measured in that batch, as a percentage by weight: limonene (citrusy), pinene (piney), myrcene (earthy), caryophyllene (peppery) and others.\n\nTwo batches of the same product can differ a little: it's a natural product, measured honestly. And the hype? Claims that a terpene will make you feel a particular way go further than the evidence. We stick to what's measured.\n\nLearn: link in bio. Adults 18+.\n#HerbalHolland",
        short: "Terpenes, without the hype: aroma compounds made by many plants, from citrus peel to pine. A lab page lists the main ones in each batch, as a percentage. Claims about how they make you feel go further than the evidence. Learn: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "Terpenes, without the hype.", sub: "What they are, what a lab page shows, and what the evidence doesn't say." },
        brief: "A 5-slide carousel: what terpenes are; where else you smell them (citrus peel, pine, lavender and black pepper on a dark surface); the terpene list on a demo lab page; why batches differ; what the evidence doesn't say. No products in shot.",
      },
      {
        key: "windmill-no-6", day: 36, time: "16:00", channel: "EMAIL",
        title: "The Windmill, No. 6: slow autumn in the Midlands",
        text: paras(
          "Hi {{firstName}},",
          "Autumn has come to the hills. The mornings are cooler, the mist sits longer in the Midlands valleys, and the light goes gold early. It's a season for slowing down, and we're taking it slowly too.",
          "The Winter Drop is coming in May. We'll share more before it opens. To hear when it opens for you, tap Notify me on the drops page in the Rewards app.",
          "Gezellig evenings. April's are at Herbal Holland Hillcrest on Thursday 15 April and Herbal Holland Hilton on Friday 16 April, 18:00–20:00. RSVP in the Rewards app, and bring your ID.",
          "Learn picks. Terpenes, without the hype: what they are, what the terpene list on a lab page shows, and what the evidence doesn't say.",
          "See you in the hills,\nThe Herbal Holland team",
        ),
      },
      {
        key: "push-windmill-6", day: 36, time: "18:30", channel: "PUSH",
        title: "The Windmill, No. 6 is out",
        text: "Slow autumn, terpenes without the hype, and the Winter Drop, coming in May. Tap Notify me on the drops page to hear when it opens.",
      },
    ],
  },
];
