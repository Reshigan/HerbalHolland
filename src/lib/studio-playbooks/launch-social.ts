// The Founding Members social drive: six weeks on social, from the day the list opens (with the online shop) to the
// night it closes, built to fill the list. One feed post a day, five a week; three short videos a week (Reels and
// TikToks, each with its script in the brief: the hook line, three beats and the end card); a Story every day, by
// hand (the rota below, LAUNCH_SOCIAL_STORIES, since Stories can't be posted by API). The sequence: the hook (the
// number 2,026), then proof (lab-tested every batch, licensed, the people), the mechanism (join in 20 seconds; a friend
// moves you up 250 places), urgency (the closing date) and social proof (the milestones). Laid out for a store: the
// shared posts go out once, naming every town, and each town's own posts (Fridays, 19:00) follow a week later for the
// second town, so Hillcrest and Hilton each get their moment and the feed still keeps to five a week.
//
// The four milestone posts (500, 1,000, 1,500 and 2,026 members) are placeholders on the calendar: they carry
// `milestone`, and they start as "post by hand" and HQ posts each the day HQ → Founding Members shows that count.
//
// The platforms' rules, not ours, shape the words: Meta and TikTok remove posts that promote cannabis or CBD, so no
// product names, prices, consumption or health claims anywhere, only the club, the places, the people and the hills
// (tests/studio-launch-social.test.ts screens every line, briefs and Stories included). Hashtags in the caption keep to
// the house rule (three at most); the per-network sets below are for the team posting Reels and TikToks by hand.
import type { Playbook, PlaybookItem } from "../studio";
import { paras } from "./shared";

/** The feed's slots for South Africa: the morning scroll, the lunch break, the evening, and a slower weekend morning. */
export const LAUNCH_SOCIAL_TIMES = { morning: "07:00", midday: "12:00", evening: "19:00", saturday: "09:00", sunday: "08:00", sundayEvening: "18:30" } as const;

/** Hashtag sets for the team posting by hand: Instagram takes five at most (screenSocial), TikTok fewer, Facebook none. */
export const LAUNCH_SOCIAL_HASHTAGS = {
  instagram: ["#HerbalHolland", "#HollandMeetsTheHills", "#Hillcrest", "#Hilton", "#KZN"],
  tiktok: ["#HerbalHolland", "#HollandMeetsTheHills", "#KZN", "#MadeInSA"],
  facebook: [] as string[],
} as const;

/** A Story a day, by hand, Monday to Sunday, for the six weeks: short, vertical, gone in a day. */
export const LAUNCH_SOCIAL_STORIES = [
  "Monday: the places taken so far, as a number on the orange frame (from HQ → Founding Members), and the link sticker to join.",
  "Tuesday: a member advisor answers one question in 15 seconds (what a Founding Member gets, how the numbered card works, how to move up).",
  "Wednesday: the view from the hills this morning (Hillcrest one week, Hilton the next), the windmill mark in the corner, no words needed.",
  "Thursday: a poll. Which hill town is yours, Hillcrest or Hilton? Then the link sticker.",
  "Friday: the week's Reel, reshared, with the link sticker and 'Your friend moves you up 250 places'.",
  "Saturday: a thank-you to this week's new members by first name only, with their consent, and the count of places left.",
  "Sunday: the closing date on the countdown sticker, and one line: 'Join free in 20 seconds. Adults 18+.'",
] as const;

const T = LAUNCH_SOCIAL_TIMES;
const JOIN = "Join free in 20 seconds: link in bio. Adults 18+.";
const video = (key: string, day: number, time: string, title: string, it: Omit<PlaybookItem, "key" | "day" | "time" | "channel" | "title">): PlaybookItem => ({ key, day, time, channel: "SOCIAL", title: `[Reel/TikTok] ${title}`, ...it });
const post = (key: string, day: number, time: string, it: Omit<PlaybookItem, "key" | "day" | "time" | "channel">): PlaybookItem => ({ key, day, time, channel: "SOCIAL", ...it });

export const LAUNCH_SOCIAL: Playbook[] = [
  {
    key: "founding-social",
    name: "Founding Members: the social drive",
    blurb: "Six weeks on social to fill the Founding Members list, from the day it opens to the night it closes: one post a day, three Reels a week with their scripts, a Story a day by hand, and the milestones (500, 1,000, 1,500 and 2,026) posted by hand as the list reaches them. Shared posts once for every town; each town's own Fridays a week apart.",
    store: true,
    anchor: "The list closes at midnight",
    weekday: 0,
    why: "the list closes at midnight on a Sunday, six weeks after it opens with the online shop on a Tuesday",
    items: [
      // ── Week 1: the hook. The number. ──
      post("hook", -40, T.morning, {
        shared: true,
        text: paras(
          "Sawubona. 2,026 places. That's the whole list.",
          "Herbal Holland Rewards is open to join, free, for adults 18+ anywhere in South Africa. The first 2,026 people on the list become Founding Members: a numbered card in the Rewards app, and at least Sprout tier for 14 months. The list closes at midnight on {date}, and our stores in {towns} open their doors before then.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "Sawubona. 2,026 places. That's the whole list. The first 2,026 to join become Founding Members: a numbered card and at least Sprout tier for 14 months. Closes at midnight on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "2,026", sub: "places on the list. Free to join, for adults 18+. Closes at midnight on {date}." },
        brief: "Card as it is, posted at 07:00. Story the same day: the number 2,026 on the orange frame, then the link sticker to join.",
      }),
      video("why-2026", -38, T.midday, "Why 2,026?", {
        shared: true,
        text: paras(
          "Why 2,026? Because it's the year we open, and because a number you can count is a number you can feel. The first 2,026 members get a numbered card, 0001 to 2026, and once those places are taken, there are no more.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "Why 2,026? It's the year we open, and a number you can count. The first 2,026 members get a numbered card, 0001 to 2026, and then there are no more. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "Cards 0001 to 2026", sub: "Numbered cards for the first 2,026 members. Then there are no more." },
        brief: "Reel/TikTok, 20 seconds, vertical. Hook (0–3 s): '2,026. Why that number?' over the windmill mark turning. Beat 1: 'It's the year we open' as the year appears on the orange frame. Beat 2: 'The first 2,026 members get a numbered card' as a card counts up from 0001. Beat 3: 'Once the places are taken, there are no more' as the counter stops at 2026. End card: 'Join free in 20 seconds. Link in bio. Adults 18+.' Brand artwork only, no people, no products. Story the same day: the counter clip with the link sticker.",
      }),
      video("town-hello", -37, T.evening, "{town}, howzit.", {
        text: paras(
          "{town}, howzit. The windmill is coming to your hills, and the first 2,026 places on the Founding Members list are open now, wherever in South Africa you are.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills #KZN`,
        ),
        card: { template: "reveal", eyebrow: "Holland, meet the Hills", headline: "{town}, howzit.", sub: "The windmill is coming to your hills. 2,026 Founding places are open." },
        brief: "Reel/TikTok, 20–30 seconds, vertical, shot in {town}. Hook (0–3 s): '{town}, howzit' over the drive in at golden hour. Beat 1: the view (Hillcrest: Botha's Hill and the Valley of a Thousand Hills; Hilton: the Midlands mist lifting off the village green). Beat 2: the shopfront under its wrap, the orange frame just showing. Beat 3: the windmill mark turning over the ridge line. End card: '2,026 Founding places. Join free in 20 seconds. Adults 18+.' No people in shot, or adults over 25 with signed releases. Story the same day: a still from the view with the link sticker.",
      }),
      post("numbered-card", -36, T.saturday, {
        shared: true,
        text: paras(
          "Your number, your card.",
          "Join Herbal Holland Rewards and you have a place on the Founding Members list, in the order you joined. When the list closes at midnight on {date}, the first 2,026 places become Founding Members, each with a numbered card in the Rewards app. Your place is in the app from the moment you join.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "Your number, your card. Join Herbal Holland Rewards and you have a place on the Founding Members list, in the order you joined. The first 2,026 places get a numbered card when the list closes on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Your number, your card.", sub: "A place on the list the moment you join, in the order you joined." },
        brief: "Card as it is, Saturday 09:00. Story the same day: the Founding place in the Rewards app, a screen recording with demo details.",
      }),
      video("turning", -35, T.sundayEvening, "Something's turning in the hills.", {
        shared: true,
        text: paras(
          "Something's turning in the hills. A Dutch windmill, drawn from our first window poster, and the hills of KwaZulu-Natal: that's where we come from and where we're going. Our stores in {towns} open their doors soon, and the Founding Members list is open now.",
          `${JOIN} #HollandMeetsTheHills #HerbalHolland`,
        ),
        short: "Something's turning in the hills. A Dutch windmill, drawn from our first window poster, and the hills of KwaZulu-Natal. Our stores in {towns} open soon, and the Founding Members list is open now. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "reveal", eyebrow: "Holland, meet the Hills", headline: "Something's turning in the hills.", sub: "Dutch heritage · African soil. {towns}." },
        brief: "Reel/TikTok, 25 seconds, vertical. Hook (0–3 s): a summer storm clearing over the hills, the words 'Something's turning in the hills'. Beat 1: the windmill mark drawn stroke by stroke in Sunset orange. Beat 2: it turns over the ridges, Hillcrest then Hilton. Beat 3: 'Dutch heritage · African soil' over South African hands at work (adults over 25, signed releases). End card: 'The Founding Members list is open. Join free in 20 seconds. Adults 18+.' No flags, ships or colonial imagery. Story the same day: the drawing clip with the link sticker.",
      }),

      // ── Week 2: proof. Lab-tested, licensed, the people. ──
      post("lab-tested", -34, T.morning, {
        shared: true,
        text: paras(
          "What you're joining.",
          "A members-only club for adults 18+ that checks your ID at the door and the till. Every batch we sell is lab-tested, with a public lab page you can read for yourself. Licensed stores, in {towns}. Plain English, no hype. That's the whole promise, and the first 2,026 members hold a numbered card to it.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "What you're joining: a members-only club for adults 18+, every batch lab-tested with a public lab page, licensed stores, plain English and no hype. The first 2,026 members hold a numbered card. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "promise", eyebrow: "What you're joining", headline: "Standards you can check.", lines: ["Every batch lab-tested", "A public lab page for every batch", "Licensed stores, ID at the door and the till", "Adults 18+ only", "Plain English, no hype"] },
        brief: "Card as it is, Monday 07:00. Story the same day: a member advisor reads a lab page on a phone, 15 seconds, and the link sticker.",
      }),
      video("the-people", -33, T.evening, "The people behind the windmill.", {
        shared: true,
        text: paras(
          "The people behind the windmill. Member advisors from the Upper Highway and the Midlands, who'll check your ID, show you around and answer your questions in plain English. They're the reason we say welkom and mean it.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "The people behind the windmill: member advisors from the Upper Highway and the Midlands, who'll show you around and answer your questions in plain English. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "The team", headline: "The people behind the windmill.", sub: "From the Upper Highway and the Midlands. Welkom, and we mean it." },
        brief: "Reel/TikTok, 30 seconds, vertical. Hook (0–3 s): three faces, one after another, each saying 'Sawubona' or 'Howzit' to camera. Beat 1: each names their town (Kloof, Howick, Pinetown, wherever they live). Beat 2: each says one thing they'll do for a member: check your ID, show you a lab page, answer a plain question. Beat 3: the team together in the orange frame. End card: 'Join free in 20 seconds. Adults 18+.' Adults over 25 only, signed releases, no products in shot. Story the same day: one advisor's 'Sawubona' clip with the link sticker.",
      }),
      video("licensed", -31, T.midday, "What licensed means.", {
        shared: true,
        text: paras(
          "What licensed means. Our stores hold their licences and show them on the wall. We check your ID when you join and at the door and the till, every time, because we're for adults 18+. Every batch is lab-tested, with a public lab page. The first 2,026 members hold a numbered card to that promise.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "What licensed means: licences on the wall, your ID checked when you join and at the door and the till, every batch lab-tested with a public lab page. The first 2,026 members hold a numbered card to that. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Learn", headline: "What licensed means.", sub: "Licences on the wall. ID at the door and the till. Lab pages for every batch." },
        brief: "Reel/TikTok, 25 seconds, vertical, talking head with cutaways. Hook (0–3 s): 'What does licensed actually mean?' Beat 1: the licence frame going up on the wall. Beat 2: an ID being checked at the door and at the till (hands only, demo card). Beat 3: a lab page on a phone, the PASS lines. End card: '2,026 Founding places. Join free in 20 seconds. Adults 18+.' No products in shot. Story the same day: the ID-check clip, 10 seconds, and the link sticker.",
      }),
      post("milestone-500", -29, T.saturday, {
        shared: true, milestone: 500,
        text: paras(
          "The first 500 are in. Siyabonga.",
          "Five hundred places on the Founding Members list are taken, from the Upper Highway to the Midlands and across South Africa. There are 1,526 left, and the list closes at midnight on {date}.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "The first 500 are in. Siyabonga. 1,526 places are left on the Founding Members list, and it closes at midnight on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "500", sub: "of 2,026 places are taken. Siyabonga. 1,526 left." },
        brief: "Milestone: mark it 'by hand' and post it the day HQ → Founding Members shows 500 members, whatever day the calendar gave it. Card as it is. Story the same day: the number on the orange frame and the link sticker.",
      }),

      // ── Week 3: the mechanism. 20 seconds to join; a friend moves you up 250 places. ──
      post("twenty-seconds", -27, T.morning, {
        shared: true,
        text: paras(
          "Join in 20 seconds.",
          "Open the link in bio. Your name, your mobile number and your date of birth. Accept the membership terms. That's it: your place on the Founding Members list is yours, and your card is in the Rewards app. Free, for adults 18+, anywhere in South Africa.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "Join in 20 seconds: open the link in bio, your name, mobile number and SA ID number (or date of birth with a passport), accept the membership terms, and your place on the Founding Members list is yours. Free, for adults 18+. Link in bio. #HerbalHolland",
        card: { template: "promise", eyebrow: "Founding Members", headline: "Join in 20 seconds.", lines: ["Open the link in bio", "Your name, mobile and date of birth", "Accept the membership terms", "Your place on the list is yours", "Free, for adults 18+"] },
        brief: "Card as it is, Monday 07:00. Story the same day: a stopwatch over a screen recording of the join, demo details, 20 seconds flat, and the link sticker.",
      }),
      video("move-up-250", -26, T.evening, "Your friend moves you up 250 places.", {
        shared: true,
        text: paras(
          "Your friend moves you up 250 places. Share your link from the Rewards app, and every friend who joins with it moves you up 250 places on the Founding Members list. Three friends, 750 places. You both get 50 points on their first purchase, and joining is free for adults 18+.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "Your friend moves you up 250 places: share your link from the Rewards app, and every friend who joins with it moves you up 250 places on the Founding Members list. Three friends, 750 places. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Your friend moves you up 250 places.", sub: "Share your link from the Rewards app. Three friends, 750 places." },
        brief: "Reel/TikTok, 20 seconds, vertical, a phone screen recording with hands only. Hook (0–3 s): 'Your friend moves you up 250 places.' Beat 1: the Founding place in the Rewards app (demo details, place 1,340). Beat 2: tap Share, send the link on WhatsApp. Beat 3: the place jumps to 1,090 as the friend joins. End card: 'Join free in 20 seconds. Adults 18+.' Adult over 25, signed release. Story the same day: the jump clip and the link sticker.",
      }),
      video("the-list", -24, T.midday, "The list, in 30 seconds.", {
        shared: true,
        text: paras(
          "The list, in 30 seconds. Join free and you have a place, in the order you joined. Your link moves you up 250 places for every friend who joins. At midnight on {date} the list closes, and the first 2,026 places become Founding Members: a numbered card, and at least Sprout tier for 14 months.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "The list, in 30 seconds: join free and you have a place, in the order you joined; your link moves you up 250 places a friend; at midnight on {date} the first 2,026 become Founding Members. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "promise", eyebrow: "Founding Members", headline: "The list, simply.", lines: ["Join free: a place, in the order you joined", "Your link: 250 places up per friend", "Closes at midnight on {date}", "The first 2,026: a numbered card", "At least Sprout tier for 14 months"] },
        brief: "Reel/TikTok, 30 seconds, vertical, a member advisor to camera with on-screen text. Hook (0–3 s): 'The Founding Members list, in 30 seconds.' Beat 1: 'Join free, you have a place.' Beat 2: 'Your link moves you up 250 a friend.' Beat 3: 'At midnight on {date} the first 2,026 become Founding Members.' End card: 'Join free in 20 seconds. Adults 18+.' Adult over 25, signed release. Story the same day: the three lines as text stickers with the link sticker.",
      }),
      video("town-advisors", -23, T.evening, "{town}, meet your member advisors.", {
        text: paras(
          "{town}, meet your member advisors: the people who'll say sawubona at the door, check your ID and show you around when we open. Ask them anything about the Founding Members list in the comments.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "{town}, meet your member advisors: the people who'll say sawubona at the door, check your ID and show you around when we open. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "The team", headline: "{town}, meet your member advisors.", sub: "The people who'll say sawubona at the door." },
        brief: "Reel/TikTok, 30 seconds, vertical, shot in {town}. Hook (0–3 s): '{town}, meet your member advisors' as they walk into frame outside the store. Beat 1: each says their name and where they're from. Beat 2: each says the first thing they'll say to a member at the door. Beat 3: one shows the Founding place in the Rewards app and says 'Your link moves you up 250 places.' End card: 'Join free in 20 seconds. Adults 18+.' Adults over 25, signed releases, no products in shot. Story the same day: one advisor's 15-second hello with the link sticker.",
      }),
      post("family-group", -22, T.saturday, {
        shared: true,
        text: paras(
          "Drop your link in the family group.",
          "Your Founding Members link is in the Rewards app. Send it on WhatsApp to the people who'd like a club that says welkom, checks ID and shows its lab pages: every one who joins moves you up 250 places. Adults 18+ only, so the family group's grown-ups.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "Drop your link in the family group. It's in the Rewards app: every friend who joins with it moves you up 250 places on the Founding Members list. Adults 18+ only. Join free in 20 seconds: link in bio. #HerbalHolland",
        card: { template: "headline", eyebrow: "Bring a friend", headline: "Drop your link in the family group.", sub: "Every friend who joins with it moves you up 250 places. Adults 18+." },
        brief: "Photo: two friends (adults over 25, signed releases) on a stoep in the hills, one showing the other the Rewards app. Story the same day: a WhatsApp share, screen recording with demo details, and the link sticker.",
      }),

      // ── Week 4: urgency. The closing date, and what you'd miss. ──
      post("closing-date", -20, T.morning, {
        shared: true,
        text: paras(
          "The Founding Members list closes at midnight on {date}.",
          "Join before then and you're on it. The first 2,026 places get a numbered card in the Rewards app and at least Sprout tier for 14 months, with Sprout-tier savings on eligible items, early access to selected drops and a Founding Members' Evening every December. Your link moves you up 250 places a friend.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "The Founding Members list closes at midnight on {date}. The first 2,026 places get a numbered card and at least Sprout tier for 14 months. Your link moves you up 250 places a friend. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "Closes at midnight, {date}.", sub: "The first 2,026 places. Free to join, for adults 18+." },
        brief: "Card as it is, Monday 07:00. Story the same day: the countdown sticker to {date} and the link sticker.",
      }),
      video("what-you-get", -19, T.evening, "What a Founding Member gets.", {
        shared: true,
        text: paras(
          "What a Founding Member gets. A numbered card in the Rewards app. At least Sprout tier for 14 months, with Sprout-tier savings on eligible items. Early access to selected drops. And an invitation to a Founding Members' Evening every December, in {towns}. The list closes at midnight on {date}.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "What a Founding Member gets: a numbered card, at least Sprout tier for 14 months, early access to selected drops and a Founding Members' Evening every December. The list closes at midnight on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "promise", eyebrow: "Founding Members", headline: "What a Founding Member gets.", lines: ["A numbered card in the Rewards app", "At least Sprout tier for 14 months", "Sprout-tier savings on eligible items", "Early access to selected drops", "A Founding Members' Evening every December"] },
        brief: "Reel/TikTok, 20 seconds, vertical. Hook (0–3 s): 'Four things a Founding Member gets.' Beat 1: the numbered card flips over in the Rewards app. Beat 2: 'Sprout tier for 14 months' on the orange frame. Beat 3: the Founding Members' Evening: the store at dusk, coffee and rooibos on the counter, people over 25 (signed releases). End card: 'Closes at midnight on {date}. Join free in 20 seconds. Adults 18+.' No products in shot. Story the same day: the card flip and the link sticker.",
      }),
      video("summer", -17, T.midday, "Summer in the hills.", {
        shared: true,
        text: paras(
          "Summer in the hills. Jacarandas over Pietermaritzburg, the mist burning off the Midlands by nine, the afternoon storm rolling up the Valley of a Thousand Hills and the smell of rain on the Upper Highway. The windmill opens its doors in {towns} this summer, and the Founding Members list closes at midnight on {date}.",
          `${JOIN} #HollandMeetsTheHills #HerbalHolland #KZN`,
        ),
        short: "Summer in the hills: jacarandas, Midlands mist, the afternoon storm up the Valley of a Thousand Hills. The windmill opens this summer, and the Founding Members list closes on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "reveal", eyebrow: "Summer in KZN", headline: "Summer in the hills.", sub: "The windmill opens in {towns} this summer. The list closes on {date}." },
        brief: "Reel/TikTok, 25 seconds, vertical, no people. Hook (0–3 s): a storm front over the Valley of a Thousand Hills, 'Summer in the hills'. Beat 1: jacarandas in Pietermaritzburg, mist lifting off Hilton. Beat 2: rain on the Upper Highway, then sun. Beat 3: the windmill mark turning over both towns. End card: 'The list closes at midnight on {date}. Join free in 20 seconds. Adults 18+.' Story the same day: the storm clip with the countdown sticker.",
      }),
      post("milestone-1000", -15, T.saturday, {
        shared: true, milestone: 1000,
        text: paras(
          "1,000 in. Half the list is taken.",
          "A thousand places on the Founding Members list are gone, and 1,026 are left. Share your link from the Rewards app: every friend who joins with it moves you up 250 places. The list closes at midnight on {date}.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "1,000 in. Half the Founding Members list is taken, and 1,026 places are left. Share your link: every friend who joins moves you up 250 places. The list closes at midnight on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "1,000", sub: "of 2,026 places are taken. Half the list. 1,026 left." },
        brief: "Milestone: mark it 'by hand' and post it the day HQ → Founding Members shows 1,000 members, whatever day the calendar gave it. Card as it is. Story the same day: the number on the orange frame and the link sticker.",
      }),

      // ── Week 5: urgency, with the mechanism. ──
      post("two-weeks", -13, T.morning, {
        shared: true, pinned: true,
        text: paras(
          "Two weeks to go: the Founding Members list closes at midnight on {date}.",
          "Join free and you're on it. The first 2,026 places get a numbered card and at least Sprout tier for 14 months. Your link moves you up 250 places for every friend who joins.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "Two weeks to go: the Founding Members list closes at midnight on {date}. The first 2,026 places get a numbered card and at least Sprout tier for 14 months. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "Two weeks.", sub: "The list closes at midnight on {date}. Free to join, for adults 18+." },
        brief: "Card as it is, Monday 07:00. Story the same day: the countdown sticker and the link sticker.",
      }),
      video("card-0001", -12, T.evening, "Card 0001.", {
        shared: true,
        text: paras(
          "Card 0001. Somebody holds it, and the Rewards app shows them so. Every Founding Member's card is numbered, 0001 to 2026, in the order they joined, and your link moves you up 250 places a friend. The list closes at midnight on {date}.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "Card 0001. Somebody holds it. Every Founding Member's card is numbered, 0001 to 2026, in the order they joined. Your link moves you up 250 places a friend. The list closes at midnight on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Card 0001.", sub: "Somebody holds it. Every Founding card is numbered, in the order they joined." },
        brief: "Reel/TikTok, 15 seconds, vertical, macro. Hook (0–3 s): the numbered card in the Rewards app, 0001 filling the screen. Beat 1: the card tilts, the windmill catches the light. Beat 2: the number ticks up through the list, 0417, 1208. Beat 3: it stops at 2026, then the screen goes to warm black. End card: 'Where will your number be? Join free in 20 seconds. Adults 18+.' No people. Story the same day: the tick-up clip and the link sticker.",
      }),
      video("ask-three", -10, T.midday, "Ask three people.", {
        shared: true,
        text: paras(
          "Ask three people. Your link is in the Rewards app, and every friend who joins with it moves you up 250 places. Three friends is 750 places: the difference between the back of the list and a Founding card. The list closes at midnight on {date}.",
          `${JOIN} #HerbalHolland`,
        ),
        short: "Ask three people. Every friend who joins with your link moves you up 250 places: three friends is 750, the difference between the back of the list and a Founding card. Closes at midnight on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Bring a friend", headline: "Ask three people.", sub: "Three friends who join with your link is 750 places up." },
        brief: "Reel/TikTok, 20 seconds, vertical. Hook (0–3 s): 'Ask three people' over a phone held up outside, in the hills. Beat 1: the link shared to three names on WhatsApp (demo details). Beat 2: three ticks come back. Beat 3: the Founding place jumps 750. End card: 'Closes at midnight on {date}. Join free in 20 seconds. Adults 18+.' Hands only, an adult over 25 with a signed release. Story the same day: the 750 jump and the link sticker.",
      }),
      video("town-windows", -9, T.evening, "{town}, the windows go up.", {
        text: paras(
          "{town}, the windows go up. The orange frame, the windmill, and a first look inside. The Founding Members list closes at midnight on {date}: join before then and your numbered card is waiting at the door.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "{town}, the windows go up: the orange frame, the windmill, a first look inside. The Founding Members list closes at midnight on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "reveal", eyebrow: "Behind the orange frame", headline: "{town}, the windows go up.", sub: "The list closes at midnight on {date}." },
        brief: "Reel/TikTok, 25 seconds, vertical, a timelapse in {town}. Hook (0–3 s): the wrap coming off the window. Beat 1: the orange frame going up, hands only. Beat 2: the windmill mark on the glass, the hills reflected in it. Beat 3: the first look inside, the counter and the licence frame on the wall, no products. End card: 'The list closes at midnight on {date}. Join free in 20 seconds. Adults 18+.' Story the same day: the window reveal and the countdown sticker.",
      }),
      post("milestone-1500", -8, T.saturday, {
        shared: true, milestone: 1500,
        text: paras(
          "1,500 in. 526 places left.",
          "Fifteen hundred places on the Founding Members list are taken. Join free and you're on it; share your link and every friend who joins moves you up 250 places. The list closes at midnight on {date}.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "1,500 in. 526 places are left on the Founding Members list. Join free and share your link: every friend who joins moves you up 250 places. The list closes at midnight on {date}. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "1,500", sub: "of 2,026 places are taken. 526 left." },
        brief: "Milestone: mark it 'by hand' and post it the day HQ → Founding Members shows 1,500 members, whatever day the calendar gave it. Card as it is. Story the same day: the number on the orange frame and the link sticker.",
      }),

      // ── Week 6: social proof, and the close. ──
      post("milestone-2026", -6, T.morning, {
        shared: true, milestone: 2026,
        text: paras(
          "2,026. Every place is taken. Siyabonga.",
          "The Founding Members list is full, from the Upper Highway to the Midlands and across South Africa. Founding Members, your numbered card is in the Rewards app. Joined after the list filled? Thank you for being early: your Rewards work in every store and online, and you climb from Seed to Harvest as you go.",
          "Join free: link in bio. Adults 18+. #HerbalHolland #HollandMeetsTheHills",
        ),
        short: "2,026. Every place on the Founding Members list is taken. Siyabonga. Founding Members, your numbered card is in the Rewards app. Joined after? Thank you for being early: your Rewards work in every store and online. Join free: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "2,026", sub: "Every place is taken. Siyabonga." },
        brief: "Milestone: mark it 'by hand' and post it the day HQ → Founding Members shows 2,026 members, if the list fills before it closes; skip it if it doesn't. Card as it is. Story the same day: the team saying siyabonga, 10 seconds, adults over 25 with signed releases.",
      }),
      video("who-is-on-it", -5, T.evening, "Who's on the list.", {
        shared: true,
        text: paras(
          "Who's on the list. Members from Kloof to Howick and Durban to Pietermaritzburg, and from across South Africa, each with a number in the Rewards app. The list closes at midnight on {date}, and the first 2,026 become Founding Members.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "Who's on the list: members from Kloof to Howick and across South Africa, each with a number in the Rewards app. The list closes at midnight on {date}, and the first 2,026 become Founding Members. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "headline", eyebrow: "Founding Members", headline: "Who's on the list.", sub: "From Kloof to Howick and across South Africa. Closes at midnight on {date}." },
        brief: "Reel/TikTok, 30 seconds, vertical. Hook (0–3 s): 'Who's on the Founding Members list?' Beat 1: three real members who've agreed to appear (adults over 25, signed releases), each says their first name, their town and their number. Beat 2: a map of KZN filling with windmill marks, Hillcrest and Hilton last. Beat 3: the Rewards app showing a place moving up 250. End card: 'Closes at midnight on {date}. Join free in 20 seconds. Adults 18+.' Story the same day: one member's line with the link sticker.",
      }),
      video("closes-sunday", -3, T.midday, "The list closes on Sunday.", {
        shared: true, pinned: true,
        text: paras(
          "The list closes on Sunday at midnight. Three days to go. Join Herbal Holland Rewards free before then and you're on the Founding Members list; share your link from the app and every friend who joins moves you up 250 places.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "The list closes on Sunday at midnight. Three days to go. Join free before then and you're on the Founding Members list; your link moves you up 250 places a friend. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "Sunday, midnight.", sub: "The list closes on {date}. Three days to go." },
        brief: "Reel/TikTok, 15 seconds, vertical. Hook (0–3 s): 'Three days' on the orange frame. Beat 1: the join, 20 seconds sped up to five (demo details). Beat 2: the link shared on WhatsApp. Beat 3: the place jumps 250. End card: 'Closes Sunday at midnight. Join free in 20 seconds. Adults 18+.' Hands only, an adult over 25 with a signed release. Story the same day: the countdown sticker to Sunday and the link sticker.",
      }),
      post("closes-tonight", 0, T.sunday, {
        shared: true, pinned: true,
        text: paras(
          "Last call: the Founding Members list closes at midnight tonight.",
          "Join Herbal Holland Rewards free before then and you're on it. The first 2,026 places get a numbered card and at least Sprout tier for 14 months. Share your link from the app before midnight and every friend who joins moves you up 250 places.",
          `${JOIN} #HerbalHolland #HollandMeetsTheHills`,
        ),
        short: "Last call: the Founding Members list closes at midnight tonight. The first 2,026 places get a numbered card and at least Sprout tier for 14 months. Join free in 20 seconds: link in bio. Adults 18+. #HerbalHolland",
        card: { template: "countdown", eyebrow: "Founding Members", headline: "Midnight tonight.", sub: "Last call for the Founding Members list. Free to join, for adults 18+." },
        brief: "Card as it is, Sunday 08:00. Stories through the day: the countdown sticker at 08:00, 12:00, 18:00 and 21:00, each with the link sticker.",
      }),
    ],
  },
];
