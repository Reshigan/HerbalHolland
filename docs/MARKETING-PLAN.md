# Herbal Holland — marketing plan, October 2026 to November 2028

> **Status: approved** (27 September 2026); the platform changes in §15 are built. The launch of our next two stores, **Hillcrest** (Upper
> Highway, eThekwini) and **Hilton** (KZN Midlands), on **Tuesday 1 December 2026**, with the online shop selling
> nationwide once it opens (Pietermaritzburg and Umhlanga already trade); then two years of marketing across South Africa. Builds on [STRATEGY.md](STRATEGY.md)
> (positioning, Rewards, pricing) and runs inside the platform's rules ([COMPLIANCE.md](COMPLIANCE.md)).
> Not legal advice: counsel signs off the copy bank (§7) and the event formats (§6.3) before launch.

## 0. The plan on one page

**The idea: _Holland, meet the Hills._** Holland is famously flat. Both our new towns are hill towns: Hillcrest
looks over the Valley of a Thousand Hills, Hilton sits in the Midlands hills. The windmill comes to the hills. The
endline stays: _Dutch heritage · African soil._

| Phase | Dates | The job |
|---|---|---|
| 0 · Online is open | Thu 1 Oct – Sat 31 Oct 2026 | Sell online nationwide; open the Founding Members list; start Learn and the merch engine |
| 1 · Pre-opening | Sun 1 Nov – Mon 30 Nov 2026 | Reveal both stores; win the neighbours; fill the Founding Members list and the RSVPs |
| 2 · Opening & festive | Tue 1 Dec – Thu 31 Dec 2026 | Open the doors; Founding Members' Evenings and Open Day; festive gifting; holiday traffic off the N3 |
| Year 1 · Settle in | Jan – Nov 2027 | Turn two stores into habits: Learn, members' evenings, quarterly drops, Heritage Month, the franchise pack |
| Year 2 · Grow out | Dec 2027 – Nov 2028 | First birthday; new stores with the opening playbook; franchise recruitment; adult-use plan in the drawer |

**The rule that shapes everything: social is for the brand; offers live on our own channels.** Meta and TikTok
remove posts that sell cannabis or CBD, Google won't take the ads, and licensed (THC) medicines can't be advertised
to the public at all. So we grow the one asset nobody can switch off: a consented Herbal Holland Rewards membership.

**Decisions** (approved as proposed, except the budget amount, which is still to come):

1. Founding Members [first **2,026** places · Sprout floor (5% instant savings) for **14 months** · list closes
   **Sun 6 Dec 23:59**, after opening weekend, so opening-weekend visitors can still join].
2. Opening events [Founding Members' Evening Thu 3 Dec Hillcrest and Fri 4 Dec Hilton; Open Day Sat 5 Dec at both].
3. The launch budget (§12 gives the split).
4. Paid local media: community newspapers and a few boards near the stores, brand-only [yes, modest].
5. The platform changes in §15 [A–C now, A being a launch blocker; D by 30 November; E only if counsel says so].

## 1. Ground rules: what we say, where

| Content | Social | Own channels (SMS, email, push) to consented members | Website & Learn | In store | Print, boards, press |
|---|---|---|---|---|---|
| Brand, people, community, events, Learn | ✅ | ✅ | ✅ | ✅ | ✅ |
| Merch (apparel), including prices and deals | ✅ | ✅ | ✅ | ✅ | ✅ |
| CBD and wellness range (Schedule 0), approved claims only | Education only: no prices, no "buy", "order" or "delivery" | ✅ offers, once counsel clears Section 18A (§2, #15) | ✅ | ✅ | ❌ keep brand-only |
| Licensed (THC) medicines | ❌ | ❌ service messages to registered patients only | Patient dispensary, signed in | Dispensary counter | ❌ |
| Health claims, conditions, intoxication, anything that appeals to under-18s | ❌ | ❌ | ❌ | ❌ | ❌ |

Always:

- **Members, always.** We sell to members only, and everyone who joins accepts the membership terms (the key terms are
  shown at every sign-up). Never say customer, shopper or client. The first 2,026 are _Founding Members_. People who
  haven't joined yet are _walk-ins_ in store and _visitors_ online.
- **Adults 18+** on every piece. Everyone in our pictures is over 25 and looks it.
- **No consumption, no smoke, no "high" language, no stoner clichés** (no 4/20, no leaf icons), no cannabis or CBD
  hashtags on social.
- **No sport, no driving** (except "never drive impaired"), **nothing linked to schools**: no events at or with
  schools, no placements within 500 m of one (our own standard, stricter than the law).
- **No religious or political tie-ins.** Public holidays get respect, never promotions (the platform won't send on
  them anyway).
- **Creators and influencers:** brand, merch and events only; `#ad` disclosure (ARB Social Media Code); adult
  audiences; a written brief with these rules. No gifting of CBD for review.
- **CPA contact windows:** weekdays 08:00–20:00, Saturdays 09:00–13:00, never Sundays or public holidays. Every send
  in this plan is scheduled inside them; the platform holds anything that isn't.
- **POPIA:** message only people who opted in; the consent ledger records it; STOP is honoured; monthly NCC registry
  cleanse; signed photo releases for staff and guests.
- **Screened copy:** every caption and message in §7 passes the platform's own checks (`screenSocial` for social,
  `screenCopy` for our own channels). The Social composer blocks anything that doesn't.

## 2. Where we start: assumptions and hidden dependencies

| # | Finding | Why it matters | Fix |
|---|---|---|---|
| 1 | The storefront won't take orders before `launch.launchAt` — it runs as a waitlist until then. | "Online now" and "Founding Members close at opening" can't both be true today. | Platform change **A**: separate "orders open" from "Founding Members list closes". Launch blocker. |
| 1b | Joining Rewards requires a home store that is already trading (the join page lists "opening soon" stores, but the sign-up rejects them), and checkout requires joining. With only Hillcrest and Hilton, both opening soon, **nobody new can join or buy online before 1 December**. | Blocks both the online launch and the Founding Members list. | Part of change **A**: accept opening-soon stores as a home store. Launch blocker. |
| 2 | The Founding Members' Sprout floor runs `foundingMonths` from numbering. At 12 months it lapses in the first-birthday week. | Founding Members lose their savings at the anniversary party. | Set 14 months: the floor ends Mon 7 Feb 2028, after the festive season and January payday. |
| 3 | Sign-ups record the channel (web, POS) but not the campaign or placement. | We can't tell which flyer, board, event or partner filled the Founding Members list. | Platform change **B**: `?src=` tags on join links and QR codes, and sign-ups by source in Reports. |
| 4 | Public holidays are computed from the Public Holidays Act; one-off proclaimed days (like an election day) aren't in the calendar. | A campaign could go out on a proclaimed holiday. | Platform change **C**: extra holidays in HQ settings. |
| 5 | Welcome, second-visit, win-back and review journeys aren't automated; RFM segments and campaigns are. | Nothing sends itself. | Run them as weekly segment campaigns (§8.7). Automated journeys come later. |
| 6 | There are no gift cards or vouchers. | Festive gifting is merch (and products in store). | Out of scope for this launch. |
| 7 | Merch is made to order (5–8 working days). Makers and couriers close over the festive season. | A Christmas promise we can't keep. | Confirm the partner's closing dates. Last merch order for Christmas: **Thu 10 Dec** (to confirm). Platform change **D**: a festive lead-time notice on merch pages. |
| 8 | Online orders before 1 December ship from a distribution centre. | "Online now" only works if someone packs parcels. | Confirm the DC (or a store stockroom) and the courier allow-list before Thu 1 Oct. |
| 9 | Each store needs its licences captured before it sells licensed products. | A late licence means no dispensary on 1 December. | Plan B: open with CBD, merch and Learn; "dispensary opening soon" at the counter. |
| 10 | Postiz must be running with the brand accounts connected; new cannabis-adjacent accounts get extra scrutiny. | No social launch without accounts. | Create accounts and connect them by Wed 30 Sep; post brand-only from day one. |
| 11 | A Google Business Profile needs a verified address and visible signage. | "Near me" search is our best free local channel. | Create both profiles when signage goes up (about mid-November). |
| 12 | STRATEGY.md §8 still describes a Gauteng pilot. | Two plans disagree. | Update §8 once this plan is approved. |
| 13 | Addresses, hours, phone numbers and team names aren't known yet. | Store pages, profiles, posts and press need them. | You supply them; the copy uses `{address}`, `{hours}`, `{name}` placeholders. |
| 14 | Local government elections: **Wed 4 Nov 2026** was declared a public holiday on 15 Sep 2026. It isn't in the platform's calendar, and campaigning runs through our pre-launch. | A send could go out on election day; councillors change after it. | Change **C** before 4 Nov. No posts or sends on 4 Nov; meet ward councillors after the election; stay politically neutral. |
| 15 | Section 18A of the Medicines Act bars incentive schemes on _medicines_. Schedule 0 CBD is a scheduled substance, but our engine only excludes licensed (THC) lines from deals, points and member prices. | If s18A covers Schedule 0, CBD deals, points and tier savings are unlawful, and Rewards leans on merch and accessories. | **Counsel's opinion by Fri 16 Oct.** Until then, every offer in this plan is on merch and accessories. If yes: change **E** (exclude chosen classes from incentives). |
| 16 | The Tobacco Products and Electronic Delivery Systems Control Bill is in committee. As tabled it bans advertising and display, and it likely covers non-nicotine vapes. | Accessories could lose advertising, display and points. | Build no campaign on accessories; the `tobaccoBillMode` switch is ready. |
| 17 | WhatsApp's Business Policy (updated September 2026) bars messaging about drugs, prescription or otherwise. | Order updates about CBD on WhatsApp risk the number. | Keep `TRANSACTIONAL_CHANNEL=SMS`; no WhatsApp marketing. |
| 18 | Hilton is a school town (Hilton College, St Anne's, Cowan House, Grace College, Laddsworth), and Kearsney College is on the Botha's Hill road. | The 500 m rule may rule out most poster and board sites in Hilton. | Map schools before booking any placement. |

## 3. Objectives and targets

The goal: **the largest consented, active membership in KZN cannabis retail**, two stores that trade well from week
one, and an online shop that sells across South Africa. Targets are starting points; re-base them in January 2027 on
eight weeks of real data. Sales targets come from finance's store P&Ls, not from this plan.

| KPI | By Sun 6 Dec 2026 | By Nov 2027 | By Nov 2028 |
|---|---|---|---|
| Rewards members (network) | 5,000 | 20,000 | 50,000 (with new stores) |
| Founding Members list full (2,026) | by Fri 20 Nov | — | — |
| SMS / email consent at sign-up | 70% / 60% | 70% / 60% | 70% / 60% |
| Push opt-in among app installs | 40% | 40% | 45% |
| Member attach at the till | 50% in opening week | 60% | 65% |
| New members buying again within 30 days | — | 35% | 40% |
| Google rating (reviews) per store | 4.7 (50) | 4.7 (300) | 4.7 (600) |
| Local and trade press pieces | 8 | 24 | 40 |
| Learn visits from search, per month | 2,000 | 15,000 | 40,000 |
| New members per member through referrals | 0.3 | 0.3 | 0.3 |
| Qualified franchise enquiries | — | 60 | 200 |

## 4. Who we're talking to

| Audience | What they need from us | Where they are | What we lead with |
|---|---|---|---|
| **The curious** — adults 25–60 in the Upper Highway and Midlands who've never walked into a cannabis store | To feel safe, welcome and not judged | Community pages, local papers, word of mouth, Google | The Good Neighbour Promise, the pharmacist, Learn, calm stores |
| **Wellness regulars** — already buy CBD at pharmacies or online | Quality they can check, fair prices | Google, email, pharmacies | Lab pages for every batch, instant member savings, My Deals |
| **Patients and patients-to-be** — adults whose doctor may prescribe a registered cannabis medicine | A clear, legal route | Their doctor, our pharmacist | Section 21 explained plainly; the healthcare-professional programme (§6.8). Never advertised |
| **Culture and merch fans** — adults 18–40 | Something to belong to and wear | Instagram, friends | Drops, embroidered merch, members' evenings |
| **Holidaymakers on the N3** — December, Easter, July | A reason to stop | Road trip, Google Maps | Merch and gifts, Rewards that work nationwide. Never anything about using and driving |
| **Online, the rest of South Africa** | Trust and delivery | Search, referrals, email | Learn, merch, the Founding Members story |
| **Future franchisees and investors** | Proof the model works | LinkedIn, business press, franchise events | Results from the stores (§11) |

## 5. The idea: _Holland, meet the Hills_

**Lines.** _Holland, meet the Hills._ · _Holland is flat. KwaZulu-Natal isn't._ · Hillcrest: _From the flatlands to
the Valley of a Thousand Hills._ · Hilton: _From the polders to the Midlands._ · Teaser: _Something's turning in the
hills._ (the windmill mark spins, as it already does on the site) · Opening: _Sivulile — we're open._ · Endline:
_Dutch heritage · African soil._

**Look.** The orange window frame on warm black; the windmill mark; KZN hill silhouettes in Sunset orange; the
sunset-over-the-hills back print from the Sunset Hoodie. Photography is real: our stores, our people, the views.
No product close-ups on social. The eight square pictures for the Social composer are already in `public/social`.

**Heritage, carefully.** _Dutch heritage_ means the Amsterdam coffee-shop tradition of hospitality and knowing your
product. It never means colonial history: no ships, flags, settlers or "discovery" imagery, and nothing heritage-themed
on 16 December (in KwaZulu-Natal, of all places). _African soil_ is the bigger half: South African growers, makers and
places. No borrowed Rastafari imagery either.

**Voice.** Warm, plain, confident, local. Dutch warmth used lightly (_welkom_, _gezellig_ — the cosy, together
feeling our members' evenings are named after). isiZulu where it matters: _Sawubona_, _Sivulile_, _Siyabonga_ —
written and checked by first-language speakers on the team, never machine-translated.

**Hashtags.** #HerbalHolland #HollandMeetsTheHills, plus place tags (#Hillcrest #UpperHighway #Hilton #KZNMidlands
#Durban #Pietermaritzburg #KZN #MadeInSA). Never cannabis or CBD tags.

## 6. The launch: October to December 2026

### 6.1 Key dates

| When (2026, SAST) | What | Notes |
|---|---|---|
| Wed 30 Sep | Postiz live and accounts connected; change A deployed; launch settings saved; both stores created as **opening soon** | Store pages, events and home-store choice work from here |
| Thu 1 Oct | **Online is open**; the Founding Members list opens | Email, push, social; note to trade and business media |
| Mon 26 Oct | **Hillcrest revealed** | Window wrap: _Something's turning in Hillcrest_ |
| Mon 2 Nov | **Hilton revealed** | Window wrap: _Something's turning in Hilton_ |
| Wed 4 Nov | Local government elections: public holiday | No posts, no sends |
| Wed 11 Nov | RSVPs open: Founding Members' Evenings and Open Day | Members only, capacity-limited |
| Tue 17 Nov | Press release; media walk-throughs Thu 19 (Hillcrest) and Fri 20 Nov (Hilton) | Fit-out must be finished |
| Fri 27 – Mon 30 Nov | **Black Friday** online: merch and accessories | Merch on social; accessories on our own channels only |
| Mon 30 Nov 17:00 | Neighbours' preview at both stores | 30 guests each |
| Tue 1 Dec 07:00 | HQ switches both stores to **trading** | HQ → Stores |
| **Tue 1 Dec 09:00** | **Doors open** | _Sivulile — we're open_ |
| Thu 3 Dec 18:00–20:30 | Founding Members' Evening, Hillcrest | |
| Fri 4 Dec 18:00–20:30 | Founding Members' Evening, Hilton | |
| Sat 5 Dec 09:00–14:00 | **Open Day** at both stores | |
| Sun 6 Dec 23:59 | Founding Members list closes | Numbering runs automatically overnight |
| Mon 7 Dec | Founding Member numbers in the app | |
| Tue 8 Dec 10:00 / 12:00 | **Founding Members' Drop**: Heritage Crewneck — Sprout and up at 10:00, all members at 12:00, until Thu 10 Dec | Founding Members hold Sprout, so they're in first |
| Thu 10 Dec | Last merch order date for Christmas | Confirm with the partner and courier |
| Wed 16 Dec | Day of Reconciliation | No sends; no heritage-themed content |
| 24 Dec – 1 Jan | Festive hours | No sends on 25 and 26 Dec, Sun 27 Dec or 1 Jan |

### 6.2 Founding Members

HQ → Founding Members: list closes **Sun 6 Dec 2026, 23:59** · **2,026** places · founding tier **Sprout** ·
**14 months** · **250** places up per referral. After change A, the date closes the list without blocking orders.

- **What Founding Members get:** a numbered card (#0001–#2026) in the Rewards app; at least Sprout (5% instant savings on
  eligible items — never on medicines) until February 2028; first access to drops through their tier; an invitation
  to a Founding Members' Evening every December.
- **How the list fills:** `/club/join` (tagged QR codes on window wraps, flyers and print once change B is in), the
  referral link (a friend who joins moves you up 250 places; you both get 50 points on their first purchase), and
  POS quick-join at the tills from 1 December — opening-week visitors can still join and make the list.
- **Why 2,026:** scarcity people can feel, a number that means something, and a bounded cost for the two
  franchisees who carry the extra 2% instant savings.

### 6.3 Opening events (HQ → Events)

| Event | Store | When | Capacity | Format |
|---|---|---|---|---|
| Founding Members' Evening | Hillcrest | Thu 3 Dec, 18:00–20:30 | As the fire certificate allows (about 60–80) | Welcome from the team, store tour, good coffee and stroopwafels, the embroidered collection, an ask-the-pharmacist corner |
| Founding Members' Evening | Hilton | Fri 4 Dec, 18:00–20:30 | As above | Same |
| Open Day | Both | Sat 5 Dec, 09:00–14:00 | Walk-in; pharmacist sessions bookable (40) | Coffee cart, three or four local makers' tables, ask-the-pharmacist on the hour, a Learn quiz for points, a photo wall in the orange frame |
| Neighbours' preview | Both | Mon 30 Nov, 17:00–18:30 | 30 | For the people and businesses next door, before anyone else |

At every event: adults 18+, ID at the door (tickets are QR codes checked in at the till), **nothing consumed on
site**, no alcohol, a guard on the door, photo-consent notices and a no-photo wristband option, backup power, and an
indoor plan for December afternoon storms. HQ splits across the two stores (they're about an hour apart), so the
evenings are staggered and Open Day runs on each store's own team.

### 6.4 Store set-up in the platform

- Create both stores now as **opening soon**: their pages go live for search, members can choose them as home
  store (after change A) and events can take RSVPs.
- Load hours, phone, WhatsApp (service only), licences and `licenceRef`, menu-board screens and the receipt footer.
- Switch both to **trading** at 07:00 on Tue 1 Dec.

### 6.5 Neighbours and community

- **The Good Neighbour Promise** (one page, signed by each store manager): adults 18+ only; ID at the door and the
  till; nothing consumed on or outside our premises; no queues on the pavement; security and lighting; a direct line
  to the manager and a reply within one working day.
- **Letters and visits** to businesses and homes within about 300 m: Hillcrest in the week of 19 Oct, Hilton in the
  week of 26 Oct, each with an invitation to the neighbours' preview.
- **Meetings:** before the reveal, centre management, the station commander at the local SAPS station and the
  Community Policing Forum (our licences, ID checks, security plan); after the 4 November election, the new ward
  councillors. Business bodies: the Pietermaritzburg & Midlands Chamber of Business and the Hilton Ratepayers
  Association for Hilton; 1000 Hills Tourism for the Upper Highway.
- **Family markets** (the Shongweni and Karkloof Saturday markets, the We ♥ Hilton Market at the Quarry Centre): no
  stalls — children are there. Invite their makers to our Open Days instead.
- **Schools:** we don't market near them. Check every poster, flyer and board against the 500 m rule.

### 6.6 Press and PR

- **Angles:** a pharmacist-led, lab-tested store with a free rewards club opens in the hills; local jobs; merch made
  in South Africa; Dutch coffee-shop hospitality meets KZN (the founder story); a South African-built retail
  platform designed for 1,000 stores (business and tech media).
- **Timeline:** media list and Q&A pack by Fri 30 Oct; spokesperson training (a pharmacist and a founder); release
  under embargo Tue 17 Nov; walk-throughs Thu 19 and Fri 20 Nov; photo call at 09:00 on Tue 1 Dec; then the
  "first 100 days" story on Wed 10 Mar 2027.
- **The Q&A pack answers the hard questions honestly:** what's legal today (SAHPRA, Schedule 0, the Cannabis for
  Private Purposes Act not yet in force); how medical access works (only through a doctor's authorisation); age
  checks; no consumption on site; security; schools; where products come from; lab testing; ownership, local jobs
  and transformation.
- No politicians at our events or in our photos, and no political content.

### 6.7 Local media and boards (brand-only)

- **Community newspapers:** _Highway Mail_ (Upper Highway), _Village Talk_ (Howick and Hilton), _Midlands Herald_;
  regionally _The Witness_ (Pietermaritzburg) and the Durban dailies. Opening notices (brand, address, hours,
  adults 18+, a tagged QR code) in the weeks of 16 and 30 Nov, subject to the publisher accepting them.
- **Boards and posters:** two or three near each store on the way to the N3, none within 500 m of a school. Roadside
  boards carry no QR code (nobody should scan while driving): _Holland, meet the Hills. Hillcrest. Opening 1 December._
- **Flyers:** A5, handed out with neighbours' letters and left at partner businesses with permission. Never on cars.
- **Radio:** interviews, not ads, in 2026.
- **Window wraps:** _Something's turning in Hillcrest_ / _Hilton_ from reveal day; _Sivulile — we're open_ from
  1 December.

### 6.8 Healthcare professionals (the medical route)

This is professional information, not advertising, and follows the Marketing Code Authority's code for dealing with
healthcare professionals (factual material, modest refreshments, no inducements).

- One evening per area before opening — Hillcrest Thu 12 Nov, Hilton Thu 19 Nov — and one per quarter after:
  _How Section 21 works in practice_, led by our pharmacist.
- Aim: 20 practices per area engaged in year 1, and plain-language patient information on the process that doctors
  can hand out.

### 6.9 Week by week

| Week | Focus | Social | Own channels | Off-line |
|---|---|---|---|---|
| 1 · 1–4 Oct | Online is open; Founding Members list | Online-open; Founding Members explained; _Holland is flat_ | Email and push to existing members; weekly welcome to new members starts | Note to trade and business media |
| 2 · 5–11 Oct | The brand story | Why a windmill; the tee; teaser | — | Hiring (job boards, LinkedIn) |
| 3 · 12–18 Oct | Learn before you visit | Lab results; hiring; the idea | — | Stakeholder map; meetings booked |
| 4 · 19–25 Oct | Made here | Hoodie; cap video; hills we love; Schedule 0 | Newsletter #1 (Tue 20 Oct) | Neighbours' letters, Hillcrest |
| 5 · 26 Oct–1 Nov | Hillcrest revealed | Reveal; Good Neighbour Promise | SMS to Hillcrest members (Tue 27 Oct) | Window wrap; neighbours' letters, Hilton; SAPS and CPF meetings |
| 6 · 2–8 Nov | Hilton revealed (election day Wed 4 Nov) | Reveal; promise; referral; Midlands | SMS to Hilton members (Tue 3 Nov) | Window wrap; nothing on 4 Nov |
| 7 · 9–15 Nov | Team and invitations | Pharmacist; invitation; manager; Section 21 | Invitations by push and SMS (Wed 11 Nov) | HCP evening, Hillcrest (Thu 12 Nov); meet the new ward councillors |
| 8 · 16–22 Nov | Press and Open Day | Open Day; neighbourhood; bucket hat; countdown | Newsletter #2 (Tue 17 Nov) | Release; walk-throughs; HCP evening, Hilton; print notices |
| 9 · 23–29 Nov | Black Friday; countdown | Windows going up; Black Friday merch | Black Friday SMS and email (Fri 27 Nov) | Google profiles verified; staff training |
| 10 · 30 Nov–6 Dec | **Opening** | Doors open; evenings; Open Day; last call | Opening SMS, push and email; Founding Members' last call (Sat 5 Dec) | Neighbours' preview; photo call |
| 11 · 7–13 Dec | Founding Members; the drop; gifts | Numbers in; Founding Members' Drop; last Christmas order; N3 stop; makers | Founding Members email and push (Mon 7 Dec) | Review cards at the tills |
| 12 · 14–20 Dec | Holiday traffic (the N3 peaks from about 11 Dec) | Festive hours | Festive hours SMS (Tue 15 Dec) | Festive rosters |
| 13 · 21–31 Dec | Thank you | Happy holidays; plan your ride | Thank-you email (Mon 21 Dec) | — |

## 7. Launch content bank

Ready to load into HQ → Campaigns (own channels) and HQ → Campaigns → Social (drafts in Postiz, four weeks ahead).
`{…}` fields are filled in on the day. Every line passes the platform's screening; keep it that way when editing.

### 7.1 Social (Instagram, Facebook, LinkedIn, X, Threads)

Pictures: _brand_ and the merch names are the squares in `public/social`; _photo_ and _video_ go up in Postiz as a
draft.

| Date | Pillar | Picture | Caption |
|---|---|---|---|
| Thu 1 Oct | Brand | brand | Herbal Holland is open online, for adults 18+ anywhere in South Africa. Dutch heritage, African soil. Our next two stores open on 1 December in Hillcrest and Hilton. #HerbalHolland #HollandMeetsTheHills |
| Fri 2 Oct | Rewards | brand | Founding Members: the first 2,026 people on our list get a numbered card and Sprout-tier savings for 14 months. Joining Herbal Holland Rewards is free, and every friend who joins with your link moves you up 250 places. Adults 18+. Link in bio. |
| Sat 3 Oct | Brand | brand | Holland is famously flat. KwaZulu-Natal isn't. This December, the windmill comes to the hills. #HollandMeetsTheHills #KZN |
| Mon 5 Oct | Learn | photo | New here? Start with three short reads: how our free Rewards club works, how to read a lab result, and what Schedule 0 on a label means. Plain English, no hype. Link in bio. |
| Wed 7 Oct | Brand | brand | Why a windmill? It's two things at once: a Dutch windmill and a four-petal flower. The ring is open at the bottom, where the tower stands. We drew it from our first store-window poster. |
| Fri 9 Oct | Made here | windmill-tee | The Windmill Tee: the mark embroidered in Sunset thread on the chest, the store-window poster printed on the back. Made for you in Cape Town, one at a time. #MadeInSA |
| Sat 10 Oct | Teaser | video | Something's turning in the hills. |
| Mon 12 Oct | Learn | photo | How to read a lab result in a minute: potency, the terpene list, and the safety tests every batch should pass — microbes, pesticides, heavy metals, solvents. Every one of our batches has a public lab page. Scan the QR on the pack. |
| Wed 14 Oct | People | photo | We're hiring in Hillcrest and Hilton: store managers, member advisors and a pharmacist for each store. Warm people who like explaining things simply. Applications close Friday 30 October. Link in bio. |
| Fri 16 Oct | Brand | brand | Dutch heritage: the coffee-shop tradition of a warm welcome and knowing exactly what you're offering. African soil: South African growers, makers and landraces. That's the whole idea. |
| Sat 17 Oct | Rewards | brand | {count} people have joined the Founding Members list. The first 2,026 get a numbered card on opening weekend. Free to join, adults 18+. |
| Mon 19 Oct | Made here | sunset-hoodie | The Sunset Hoodie: our lock-up embroidered on the chest, a sunset over the hills across the back. Orange fleece, made to order in Cape Town. |
| Wed 21 Oct | Made here | video | Every Windmill Cap is embroidered when you order it: thousands of stitches, one cap, no warehouse of stock waiting. Here's how it's made. |
| Fri 23 Oct | Community | photo | Things we already love about the hills: the view over the Valley of a Thousand Hills, Midlands mist, and people who stop to say hello. See you in December. |
| Sat 24 Oct | Learn | photo | Schedule 0, simply: it's the rule that lets low-dose CBD products be sold without a prescription, with limits on strength and on what a label may claim. Every product page shows you those limits. |
| Mon 26 Oct | Reveal | photo | Hillcrest, we're your new neighbours. Herbal Holland opens at {address} on Tuesday 1 December: free Rewards, a pharmacist on the team, every batch lab-tested. Adults 18+. #Hillcrest #UpperHighway #HollandMeetsTheHills |
| Wed 28 Oct | Community | photo | Our Good Neighbour Promise, Hillcrest: adults 18+ only, ID checked at the door and the till, nothing consumed on or outside our premises, a manager you can phone directly, and a tidy pavement. |
| Fri 30 Oct | People | photo | Last day to apply for our Hillcrest and Hilton teams. Thank you to everyone who has applied so far — we're reading every application. |
| Mon 2 Nov | Reveal | photo | From the polders to the Midlands. Hilton, Herbal Holland opens at {address} on Tuesday 1 December. Adults 18+. #Hilton #KZNMidlands #HollandMeetsTheHills |
| Thu 5 Nov | Community | photo | Our Good Neighbour Promise, Hilton: adults 18+ only, ID checked at the door and the till, nothing consumed on or outside our premises, a manager you can phone directly, and a tidy pavement. |
| Fri 6 Nov | Rewards | brand | Move up the Founding Members list: every friend who joins with your link moves you up 250 places. The first 2,026 get a numbered card on opening weekend. Free, adults 18+. |
| Sat 7 Nov | Community | photo | Things we love about the Midlands: misty mornings, makers on every farm road, and Howick Falls after the rain. Hilton, see you soon. |
| Mon 9 Nov | People | photo | Meet {name}, pharmacist at Herbal Holland Hillcrest. Ask {name} how Schedule 0 works, how to read a label, or what the law says today. You'll get a straight answer. |
| Wed 11 Nov | Events | brand | You're invited: Founding Members' Evenings. Hillcrest, Thursday 3 December. Hilton, Friday 4 December. 18:00–20:30. Good coffee, stroopwafels and a first look around. Members only, adults 18+, ID at the door. RSVP in the Rewards app. |
| Fri 13 Nov | People | photo | Meet {name}, who runs Herbal Holland Hilton: {one line in their own words}. |
| Sat 14 Nov | Learn | photo | Section 21, simply: if your doctor believes a registered medicine is right for you, they apply to SAHPRA on your behalf. Our pharmacists can walk you through the steps. We never give medical advice on social media. |
| Mon 16 Nov | Events | photo | Open Day, Saturday 5 December, 09:00–14:00 at both stores: a coffee cart, local makers, ask-the-pharmacist sessions every hour and the embroidered collection. Adults 18+, ID at the door. |
| Wed 18 Nov | Community | photo | Hillcrest, tell us about the neighbourhood: your favourite breakfast spot, walk or view. We'll visit every one before we open. |
| Fri 20 Nov | Made here | sunset-bucket-hat | The Sunset Bucket Hat: the windmill embroidered in Sunset thread on black cotton twill. Summer in the hills, sorted. Made to order in South Africa. |
| Sat 21 Nov | Rewards | brand | Ten days until our doors open, and {count} people are on the Founding Members list. Are you? |
| Mon 23 Nov | Brand | photo | Behind the orange frame: our windows go up this week. Hillcrest and Hilton, eight days to go. |
| Fri 27 Nov | Made here | windmill-tee | Black Friday: 20% off the whole embroidered collection online, today to Monday. Made to order in Cape Town, so order by 10 December for Christmas. |
| Sun 29 Nov | Teaser | video | Tuesday, 09:00. Hillcrest and Hilton. The windmill is nearly turning. |
| Mon 30 Nov | Teaser | brand | Tomorrow at 09:00 our doors open in Hillcrest and Hilton. Bring your ID and come say hello. Adults 18+. |
| Tue 1 Dec | Opening | photo | Sivulile — we're open! Herbal Holland Hillcrest and Hilton are open from 09:00 today. Come and say sawubona. Adults 18+, bring your ID. #HollandMeetsTheHills |
| Wed 2 Dec | Opening | photo | Day one, done. Siyabonga, Hillcrest and Hilton, for the warmest welcome to KwaZulu-Natal. |
| Thu 3 Dec | Events | photo | Tonight: Founding Members' Evening in Hillcrest. Tomorrow: Hilton. Saturday: Open Day at both stores, 09:00–14:00. Adults 18+, ID at the door. |
| Sat 5 Dec | Events | photo | Open Day is on until 14:00 at both stores: coffee, local makers, and our pharmacists answering questions on the hour. Adults 18+. |
| Sun 6 Dec | Rewards | brand | Last call: the Founding Members list closes at midnight tonight. Join free in the Rewards app. Adults 18+. |
| Mon 7 Dec | Rewards | brand | Founding Members, your numbers are in: open the Rewards app to see your card. Thank you for being first. |
| Tue 8 Dec | Drop | heritage-crewneck | Founding Members' Drop: the Heritage Crewneck, members-only until Thursday night. Sprout members and up got in two hours early. Made to order in Cape Town — order by 10 December for Christmas. |
| Thu 10 Dec | Made here | windmill-tote | Last day to order merch for Christmas: tees, hoodies, crewnecks, caps, bucket hats, beanies and totes, embroidered and printed in South Africa. |
| Fri 11 Dec | Holiday | brand | Heading down the N3 for the holidays? Hilton is just off the highway, and Hillcrest is on the M13 into Durban. Stretch your legs, say hello, and never drive impaired. Adults 18+. |
| Sat 12 Dec | Community | photo | Thank you to the makers who joined us on Open Day: {makers}. Go and visit them. |
| Fri 18 Dec | Store | brand | Festive hours for Hillcrest and Hilton: {hours}. Closed on Christmas Day. Your Rewards work in both stores and online. |
| Thu 24 Dec | Brand | photo | From all of us at Herbal Holland: happy holidays, and thank you for such a warm welcome to the hills. |
| Thu 31 Dec | Responsible | brand | Celebrating tonight? Plan your ride home, look after your friends, and start 2027 well. See you next year. |

### 7.2 Own channels (SMS, email, push)

Consented members only; the platform adds the sender footer and opt-out, and holds anything outside the legal
windows. SMS stays short enough to fit two parts with the footer. Push titles fit 40 characters.

| When (SAST) | Channel | Audience | Message |
|---|---|---|---|
| Thu 1 Oct 10:00 | Email | All members | **We're open online — and coming to the hills.** The shop is open nationwide; Founding Members explained (the first 2,026, a numbered card, Sprout savings for 14 months, how to move up); stores open 1 Dec in Hillcrest and Hilton; three Learn reads to start with. |
| Thu 1 Oct 10:00 | Push | All members | **We're open online** — Our first stores open on 1 Dec in Hillcrest and Hilton. Explore the shop and Learn. |
| Tuesdays 10:00 from 6 Oct | Email | New members (last 7 days) | **Welcome to Herbal Holland Rewards, {{firstName}}.** How instant savings and points work; your place on the Founding Members list and your referral link; three Learn reads; your home store's opening day. |
| Tue 20 Oct 10:00 | Email | All members | **The Windmill, No. 1.** How our merch is made; Learn picks; we're hiring; the Founding Members count. |
| Tue 27 Oct 10:00 | SMS | Home store Hillcrest | Hi {{firstName}}, Herbal Holland Hillcrest opens Tue 1 Dec at {address}. See you there! |
| Tue 3 Nov 10:00 | SMS | Home store Hilton | Hi {{firstName}}, Herbal Holland Hilton opens Tue 1 Dec at {address}. See you there! |
| Wed 11 Nov 10:00 | Push | All members | **You're invited** — Founding Members' Evenings on 3 and 4 Dec, Open Day on 5 Dec. RSVP in the app — spaces are limited. |
| Wed 11 Nov 12:00 | SMS | Home store Hillcrest or Hilton | {{firstName}}, you're invited: Founding Members' Evening, Hillcrest Thu 3 Dec or Hilton Fri 4 Dec, 18:00. RSVP in the Rewards app. |
| Tue 17 Nov 10:00 | Email | All members | **The Windmill, No. 2: doors open 1 December.** What to expect on a first visit (ID, a pharmacist to talk to, Rewards at the till); the Open Day programme; merch dates for Christmas. |
| Fri 27 Nov 08:30 | SMS | All members | Black Friday online until Monday: 20% off merch for members with code {{code}}. herbalholland.co.za |
| Fri 27 Nov 08:30 | Email | All members | **Black Friday, members first.** The embroidered collection and accessories at members' prices; last order dates for Christmas. (Wellness-range offers only once counsel has answered the s18A question.) |
| Mon 30 Nov 12:00 | SMS | Home store Hillcrest or Hilton | Tomorrow at 09:00 our doors open in Hillcrest and Hilton. Bring your ID and your Rewards number. See you there! |
| Tue 1 Dec 09:00 | Push | All members | **Sivulile — we're open!** — Hillcrest and Hilton are open from 09:00 today. Bring your ID and say hello. |
| Tue 1 Dec 09:05 | Email | All members | **Sivulile — we're open.** Addresses and hours; what to expect; this week's events; how Rewards works at the till. |
| Sat 5 Dec 09:00 | SMS | Home store Hillcrest or Hilton | Open Day today until 14:00 at Hillcrest and Hilton: coffee, local makers, ask-the-pharmacist sessions. Adults 18+. |
| Sat 5 Dec 11:00 | Push | All members | **Last call, Founding Members** — The Founding Members list closes on Sunday at midnight. Share your link to move up 250 places. |
| Mon 7 Dec 10:00 | Email | Founding Members | **Your Founding Member card is here.** Your number; Sprout savings until February 2028; the Founding Members' Drop opens for you at 10:00 tomorrow; the Founding Members' Evening every December. |
| Mon 7 Dec 10:00 | Push | Founding Members | **Your Founding card is ready** — Open the app to see your number. The Founding Members' Drop opens for you at 10:00 tomorrow. |
| Tue 15 Dec 10:00 | SMS | Home store Hillcrest or Hilton | Festive hours: Hillcrest {hours}, Hilton {hours}. Closed Christmas Day. Your Rewards savings work in store and online. |
| Mon 21 Dec 10:00 | Email | All members | **Thank you for December.** Photos from opening week; the Founding Members count; what's on in January (members' evenings, Learn); festive hours. |

## 8. The always-on engine (from January 2027)

### 8.1 Weekly posting rhythm

Loaded into Postiz four weeks ahead (the last Friday of each month), approved by HQ marketing, screened by the
composer. Stories are done live in the apps.

| Day | Instagram & Facebook | LinkedIn | X & Threads |
|---|---|---|---|
| Mon | **Learn** (carousel or photo) | — | Learn link |
| Tue | — | Team, jobs or community | — |
| Wed | **Community & people** | — | Community |
| Thu | **Store life or events** (a Reel from the monthly content day) | Founder notes, franchise, what we're learning | Event reminder |
| Fri | **Made here** (merch, makers) | — | — |
| Sat | Stories: this weekend in store | — | — |

That's four feed posts (one a Reel) a week on Instagram and Facebook, two on LinkedIn and three on X and Threads.
Mix over a month: Learn 30%, community and people 25%, made here 20%, brand and heritage 15%, events and store life
10%.

### 8.2 Own channels

| Channel | Cadence | Use |
|---|---|---|
| Email: _The Windmill_ newsletter | First Tuesday of the month, 10:00 | Learn picks, what's on, drops, the members' story of the month |
| SMS | At most two marketing messages per member per month (four in December 2026) | Events, drops, store news, member offers |
| Push (Rewards app) | Drops and events; My Deals every Monday (automatic); at most three a week | Anything time-sensitive |
| WhatsApp | Never for marketing | — |
| Weekly segment campaigns (Tuesdays) | See §8.7 | Welcome, second visit, win-back, tier-up, review ask, referral |

### 8.3 Content production

- **Content day** once a month, alternating stores: photos and short video for the next month — team, events, merch
  on people (adults over 25), store details, the views. Releases signed on the day.
- **Brand shoot** each quarter for the drop and the season.
- **Members' pictures:** reposted only with written permission, and only merch, places and people — never products.
- **Learn:** two articles a month (one evergreen, one seasonal or news). Each becomes a carousel, a newsletter item and
  an X/Threads post. One new Learn quest (10 points) every quarter.
- **Menu boards:** a Learn slide and an events slide refreshed monthly.

### 8.4 Events rhythm

- **Gezellig evenings** every month at each store (Hillcrest on the third Thursday, Hilton on the third Friday,
  18:00–20:00, 40–60 members): a pharmacist's talk, makers' night, Dutch night (stroopwafels, Delft blue), winter
  warmers, Heritage evening in September.
- **Open Day** each quarter, on the Saturday after a drop.
- **Healthcare-professional evening** each quarter per area (§6.8).
- **Founding Members' Evening** every December.
- The rules in §6.3 apply to all of them.

### 8.5 Reviews, referrals and members' pictures

- Google review cards at the tills with each store's review link. **No points or gifts for Google reviews** (Google
  forbids incentivised reviews). Product reviews on our own site are asked for by email, verified buyers only.
- Referral: you and a friend get 50 points each on their first purchase. A _Bring a friend_ push each February and
  August.

### 8.6 Search and local listings

- Store pages kept current (hours, events, services); Google Business Profiles with weekly posts (events, hours) and
  every review answered within two working days.
- Learn articles written for the questions people actually search, dated and sourced, updated when the law moves.

### 8.7 Journeys, run as weekly segment campaigns

The platform has the segments and the campaigns but doesn't run journeys on its own yet, so HQ runs these every
Tuesday from HQ → Campaigns. Offers stay on merch and accessories until counsel answers the s18A question.

| Journey | Audience | Message |
|---|---|---|
| Welcome | Joined in the last 7 days | How savings and points work; three Learn reads; your home store |
| Second visit | New members who bought once, 7–14 days ago | Double points on merch and accessories on your next visit |
| Win-back | _At risk_ (60–120 days quiet) | What's new since you last came in; a members' evening invitation |
| Tier-up | Members who moved up a tier this month | Congratulations and what the new tier gives you |
| Review ask | Bought 5 days ago | Rate what you bought (verified reviews) |
| Referral | _Champions_ and _Loyal_ | Your link: 50 points each |

## 9. The 24-month calendar

Every month also has: _The Windmill_ (first Tuesday), Gezellig evenings, My Deals on Mondays, the weekly journeys,
two Learn articles and a content day. Below is what's specific to each month. Dates to confirm are marked (TBC).

### Year 1 — settle in (December 2026 to November 2027)

**December 2026 — the launch.** See §6 and §7.

**January 2027 — Know your Holland.**
- Dates: Fri 1 Jan public holiday · N3 return traffic around 2–10 Jan · schools reopen Wed 13 Jan · payday Mon 25 Jan.
- Hero: _Read the label_, a four-Monday Learn series on social; member savings for the long month on our own channels.
- Social ideas: a safe-trip-home post (Sat 2 Jan); _Read the label_ ×4; the makers behind our merch; Founding Members'
  Evening photos; questions from Open Day, answered.
- Learn: _Reading a label, line by line_ · _How instant savings and points work_.
- Community: a one-month letter to the neighbours: how are we doing?

**February 2027 — Gezellig.**
- Dates: Midmar Mile 13–14 Feb (swimmers of all ages — not for us) · Sun 14 Feb.
- Hero: _Bring a friend_ month — you both get 50 points (social and own channels).
- Social ideas: what _gezellig_ means; a Gezellig evening; merch made for two (the tote and the cap); the referral
  explainer; the team's favourite walks and views.
- Own channels: referral SMS (Tue 9 Feb); merch gifts email (Mon 8 Feb).
- Learn: _Gezellig: the Dutch art of feeling at home_ · _CBD and Schedule 0: five facts_.
- Franchise: attend the FASA Conference & Expo (February, TBC) to learn the market.

**March 2027 — 100 days in the hills.**
- Dates: day 100 is Wed 10 Mar · Human Rights Day observed Mon 22 Mar · Good Friday 26 Mar, Family Day Mon 29 Mar.
- Hero: _100 days_ — a thank-you week (8–13 Mar) with double points on merch and accessories, members' evenings, and a
  data story for the press: what the hills asked us, our most-read Learn article, the favourite merch.
- Social ideas: 100 days in numbers; the team at day 100; Easter hours; the law in 2027.
- Own channels: 100-days SMS (Mon 8 Mar); Easter hours SMS (Tue 23 Mar).
- PR: the 100-days release (Wed 10 Mar) to _Highway Mail_, _Village Talk_, _The Witness_ and business media.
- Learn: _100 days of your questions_ · _The law in 2027: where things stand_.

**April 2027 — Slow autumn.**
- Dates: schools reopen Tue 6 Apr · Freedom Day Tue 27 Apr (respect only; it's also the Dutch King's Day — we don't
  mark that) · nothing on 20 April.
- Hero: the _Winter Drop_ announced; the notify-me list builds.
- Social ideas: autumn in the Midlands; terpenes without the hype; Winter Drop teaser; makers' night.
- Own channels: Winter Drop notify-me push (Wed 21 Apr).
- Learn: _Terpenes, without the hype_ · _Adults only, and always on your terms_ (refreshed).
- Franchise: the franchise interest list opens (LinkedIn, and an enquiry address until a page exists).

**May 2027 — Winter in the hills.**
- Dates: Workers' Day Sat 1 May (also the Global Cannabis March — an activist event, not ours) · Sun 9 May · The
  Cannabis Expo, Sandton, 28–30 May (visit for franchise learning; don't exhibit in 2027).
- Hero: **Winter Drop** (Tue 4 May, 12:00): the Windmill Beanie and Sunset Hoodie, members only for 72 hours, Bloom and
  up two hours early.
- Social ideas: the drop; Mother's Day gifts (merch); how we choose our blanks; Midlands mist.
- Own channels: gifts email (Mon 3 May); drop alerts are automatic.
- Learn: _How we make merch without a warehouse_ · _Keeping wellness products at their best in winter_.

**June 2027 — Hills and heart.**
- Dates: **Sun 13 Jun, the 100th Comrades Marathon**, a down run from Pietermaritzburg through Botha's Hill and
  Hillcrest on Old Main Road · World Franchise Day Fri 11 Jun · Youth Day Wed 16 Jun (no campaign) · Sun 20 Jun ·
  schools close Fri 25 Jun.
- Comrades: no sponsorship, no marketing to runners, and no view on the race's governance dispute. If the Hillcrest
  store is on the route: plan for the road closures, open early for spectators, a "well run" message in the window,
  the team in Windmill Tees. That's all.
- Hero: _Half-time_ — each member's savings and points so far (email, Tue 29 Jun).
- Social ideas: the centenary, for the spectators; Father's Day gifts (the cap and the bucket hat); half-time in
  numbers; a team spotlight.
- Own channels: gifts email (Mon 14 Jun).
- Learn: _How to talk to your doctor about medical access_ · _Your Rewards at half-time_.
- Franchise: a World Franchise Day post; the prospectus drafted from six months of trading.

**July 2027 — 67 minutes.**
- Dates: Durban July Sat 3 Jul (not for us) · Mandela Day Sun 18 Jul · schools reopen Tue 20 Jul · the Amashova cycle
  race uses Botha's Hill and Old Main Road (TBC).
- Hero: **Mandela Day** — each store team gives 67 minutes (Fri 16 or Sat 17 Jul) to a local project, chosen with the
  community, not for the photographs.
- Social ideas: Mandela Day with the partner's consent; a winter members' evening; what a lab page shows; staff
  stories.
- Learn: _What microbial testing actually checks_ · _67 minutes: what our teams did_.
- PR: the community story to the local papers.

**August 2027 — Women of African soil.**
- Dates: National Women's Day Mon 9 Aug · the Hilton Arts Festival (August, on the Hilton College campus — no stalls,
  sponsorship or sampling).
- Hero: _Women of African soil_ — four Wednesdays: women growers, pharmacists and makers in our supply chain and teams,
  in their own words and with their consent.
- Social ideas: the series; the Women's Month evening; what a pharmacist does.
- Learn: _Women of African soil_ · _What a pharmacist does at Herbal Holland_.
- Franchise: the prospectus and disclosure document to counsel.

**September 2027 — Heritage Month: Dutch heritage · African soil.** Our signature month.
- Dates: Spring Day Wed 1 Sep · nine years since the _Prince_ judgment Sat 18 Sep (Learn, not activism) · Heritage Day
  Fri 24 Sep.
- Hero: **Heritage Drop** (Tue 7 Sep, 72 hours) — the Heritage Crewneck; Heritage evenings with the growers' story
  (Hillcrest Wed 22 Sep, Hilton Thu 23 Sep; an alcohol-free braai).
- Social ideas: the growers; our endline explained; the drop; the Heritage evenings; the law nine years after
  _Prince_.
- Own channels: Heritage evening invitations (SMS, Tue 14 Sep).
- Learn: _KwaZulu-Natal's most famous landrace_ (on the site; the social teaser doesn't name it) · _Nine years after
  Prince_.
- PR: a heritage feature pitch (growers, fair trade).
- Franchise: **the franchise launch** — the information pack and the first information evening (Durban, Thu 30 Sep).

**October 2027 — Summer and the franchise.**
- Dates: schools reopen (TBC) · matric exams October–November (no "exam" angles, ever).
- Hero: **Summer Drop** (Tue 12 Oct): the Sunset Bucket Hat and the Windmill Cap; franchise information evenings
  (Pietermaritzburg Thu 14 Oct, Johannesburg Thu 28 Oct).
- Social ideas: the drop; spring in the Midlands; the team's first year; a what-the-label-may-say carousel.
- Own channels: Founding Members email (Tue 19 Oct): the Sprout floor runs to 7 February 2028, and what their spend earns.
- Learn: _What a CBD label may and may not say_ · _Franchising with Herbal Holland: the basics_.

**November 2027 — Black Friday and the first birthday.**
- Dates: Revolution Day Sun 7 Nov (an activist day, not ours) · **Black Friday Fri 26 Nov** · Cyber Monday 29 Nov.
- Hero: _Black Friday, members first_ (Fri 26 – Mon 29 Nov): merch and accessories; birthday invitations.
- Social ideas: Black Friday merch; a one-year teaser; the gift guide; last merch order date for Christmas (TBC).
- Own channels: Black Friday SMS and email (Fri 26 Nov); Founding Members' Evening invitations (Tue 16 Nov).
- Learn: _A year of Learn: the ten most-read answers_ · _Gifting guide: made in South Africa_.
- Franchise: an information evening (Durban, Thu 18 Nov).

### Year 2 — grow out (December 2027 to November 2028)

**December 2027 — One year in the hills.**
- Dates: **first birthday Wed 1 Dec** · schools close about Wed 8 Dec · the N3 peaks from about 10 Dec · Day of
  Reconciliation Thu 16 Dec (no sends, no heritage themes) · Christmas Sat 25 Dec · Day of Goodwill observed Mon 27 Dec.
- Hero: **Birthday week**: Founding Members' Evenings (Hillcrest Thu 2 Dec, Hilton Fri 3 Dec), a birthday Open Day (Sat 4 Dec)
  and the **Anniversary Drop** (Tue 7 Dec) — a new _Est. 2026_ design, briefed in September.
- Social ideas: one year in numbers; birthday week; the drop; the N3 post (Fri 10 Dec); festive hours; plan your ride
  on New Year's Eve.
- Own channels: birthday email (Wed 1 Dec); festive hours SMS (Tue 14 Dec); thank-you email (Mon 20 Dec).
- PR: the year-one story.
- Learn: _One year in the hills_ · _Travelling this summer? What to know about carrying CBD_.

**January 2028 — Year two, same promise.**
- Dates: N3 return traffic around 2–9 Jan · payday Tue 25 Jan.
- Hero: _Read the label_, refreshed; the Founding Members' floor reminder (email, Tue 18 Jan: it ends Mon 7 Feb).
- Learn: _Label reading, refreshed for 2028_ · _Rewards in year two_.
- Franchise: book a stand at the FASA Conference & Expo (February).

**February 2028 — Thank you, Founding Members.**
- Dates: the Founding Members' floor ends Mon 7 Feb · Mon 14 Feb · FASA Conference & Expo (TBC).
- Hero: _Thank you, Founding Members_ — numbered cards and the December Founding Members' Evening are theirs for good; a
  Founding Members-only merch window (Tue 8 Feb); _Bring a friend_ month again.
- Learn: _What the first 2,026 built_ · _A year of Gezellig evenings_.
- Franchise: exhibit at FASA with a year of results.

**March 2028 — The law in 2028.**
- Dates: Human Rights Day Tue 21 Mar.
- Hero: where the Cannabis Bill stands (Learn and PR, factual); the adult-use drawer plan reviewed with counsel.
- Learn: _The law in 2028_ · _How our lab partners test a batch_.
- Growth: new stores open with the playbook (§10).

**April 2028 — Growers.**
- Dates: Good Friday 14 Apr to Family Day Mon 17 Apr · Freedom Day Thu 27 Apr (respect only) · nothing on 20 April.
- Hero: _Visit the growers_ — a short video series from the co-operative, with the growers' consent and paid for their
  time.
- Learn: _Heritage growers: a visit to the co-op_ · _Responsible use, revisited_.

**May 2028 — Winter Drop, year two.**
- Dates: Workers' Day Mon 1 May · Global Cannabis March Sat 6 May (not ours) · Sun 14 May · The Cannabis Expo,
  Sandton (late May, TBC) — consider a franchise stand.
- Hero: **Winter Drop** (Tue 2 May) — a new colourway or design (a brand decision in Q1).
- Learn: _Behind the stitches_ · _Keeping wellness products at their best in winter_.

**June 2028 — Hills and heart.**
- Dates: Comrades, probably Sun 11 Jun (the 101st; date and direction TBC) · World Franchise Day Sun 11 Jun ·
  Youth Day Fri 16 Jun (no campaign) · Sun 18 Jun.
- Hero: _Half-time 2028_ for members; Father's Day gifts.
- Learn: _Section 21, two years on_ · _Your Rewards at half-time_.

**July 2028 — 67 minutes.**
- Dates: Durban July Sat 1 Jul (not for us) · Mandela Day Tue 18 Jul.
- Hero: Mandela Day at every store, new ones included.
- Learn: _Mandela Day 2028_ · _Order online, collect in store: how it works_.

**August 2028 — Women of African soil, part two.**
- Dates: National Women's Day Wed 9 Aug · the Hilton Arts Festival (not ours).
- Learn: _Women of African soil, part two_ · _Meet the makers behind our merch_.

**September 2028 — Heritage Month: ten years since _Prince_.**
- Dates: **Mon 18 Sep, ten years since the _Prince_ judgment** · Heritage Day Sun 24 Sep, observed Mon 25 Sep.
- Hero: _Ten years on_ — the Learn and PR centrepiece: what changed, what didn't, what's next (factual, never
  activist); the **Heritage Drop** (Tue 5 Sep); Heritage evenings.
- Learn: _Ten years since Prince_ · _Dutch heritage, African soil: our story so far_.
- Franchise: information evenings in the new regions.

**October 2028 — Ready for what's next.**
- Dates: matric exams (no angles).
- Hero: **Summer Drop** (Tue 10 Oct); the adult-use readiness review — the drawer plan goes live only when a law
  commences and counsel signs off.
- Learn: _Adult use: what might change, and what won't_ (if the Bill has passed; otherwise _The law in late 2028_) ·
  _How franchising works at Herbal Holland_.

**November 2028 — Black Friday and birthday number two.**
- Dates: Revolution Day Tue 7 Nov (not ours) · **Black Friday Fri 24 Nov** · Cyber Monday 27 Nov · second birthday
  Fri 1 Dec.
- Hero: _Black Friday, members first_; birthday invitations; the year-three plan written.
- Learn: _Two years of Learn_ · _Gifting guide 2028_.

## 10. The new-store opening playbook

Every store after the first two opens the same way. Founding Members is a one-time network programme; new stores open
with events, the drop calendar and opening-week double points on merch and accessories.

| When | Marketing | Community | Platform |
|---|---|---|---|
| 10 weeks before | Confirm name, address and date; photograph the site | Map neighbours, centre, SAPS and CPF, ward councillor, business bodies and every school within 500 m | Create the store as **opening soon**; its page goes live |
| 8 weeks | Hiring posts | Meet the centre, SAPS and CPF, and the councillor | Draft the events |
| 6 weeks | Reveal post; window wrap _Something's turning in {town}_ | Good Neighbour letters | SMS to members near the new store |
| 4 weeks | Invitations to the opening evening and Open Day; local press notice | Neighbours' preview invitation | RSVPs open; tagged QR codes |
| 2 weeks | Media walk-through; team portraits | Healthcare-professional evening | Google Business Profile created, verified at signage |
| Opening week | Doors open; opening evening; Open Day | Neighbours' preview the evening before | Switch to **trading**; POS quick-join at the tills |
| Weeks 1–4 | Reviews, a recap, the first Gezellig evening | One-month letter | Welcome and second-visit campaigns for the new members |
| Week 8 | 60-day review against the targets | — | Reports |

## 11. Franchise recruitment

The consumer plan earns the proof; this track turns it into owners.

- **Year 1:** LinkedIn twice a week (founder notes, the team, what we're learning); attend the FASA Conference & Expo
  (February 2027); World Franchise Day posts (11 June); the prospectus drafted from six months of trading; the
  franchise disclosure document reviewed by counsel (the CPA's franchise regulations: disclosure at least 14 days
  before signing). Launch in September 2027 with information evenings in Durban, Pietermaritzburg and Johannesburg.
- **Year 2:** exhibit at FASA (February 2028); information evenings every quarter; case studies from the first
  owners (with their consent, and only numbers that can be substantiated — no earnings projections without a basis);
  consider a franchise stand at The Cannabis Expo (May 2028).
- **Who we're looking for:** owner-operators with retail experience, capital, standing in their community and access
  to a pharmacist partner.
- **Needs later (not in this plan):** a franchise enquiry page and a place to track leads.

## 12. Budget

You set the amount; this is how to split it. The launch (October 2026 to January 2027) is funded by HQ. From then
on, the marketing fund (the 2% levy on net sales, held separately as the CPA requires) pays, with an HQ top-up in
year 1 while there are only two stores.

| Launch (Oct 2026 – Jan 2027) | Share | Always-on (2027–2028) | Share |
|---|---|---|---|
| Events and community | 25% | Content production | 25% |
| Content production (photo, video) | 20% | Events and community | 25% |
| Local print and boards | 15% | Own-channel messaging (SMS, email) | 15% |
| Window wraps and in-store | 10% | Local media | 10% |
| PR (freelance or agency) | 10% | PR | 10% |
| Messaging (SMS, email) | 5% | Drops (design, samples) | 5% |
| Merch for the team and seeding | 5% | Franchise marketing | 5% |
| Contingency | 10% | Contingency | 5% |

Known running costs: Postiz is free software on a small server; SMS is charged per message at the provider's bulk
rate; email goes through the SMTP provider; team merch is bought at the partner's price. **Every campaign records its
cost in HQ → Campaigns**, so return on spend shows up in the reports.

## 13. Measurement and governance

- **Weekly launch dashboard** (Mondays 09:00, October 2026 to January 2027): members and the Founding Members list (by source
  once change B is in), consent rates, RSVPs and check-ins, online orders, social (Postiz analytics), press, Google
  profile views, calls and direction requests, reviews. From 1 December: transactions, member attach at the till,
  average basket, repeat visits.
- **Monthly marketing review** (first Monday): the KPIs against targets; next month's calendar approved and loaded into
  Postiz.
- **Quarterly:** plan refresh; a legal review of the rules (the Cannabis for Private Purposes Act regulations, the
  Cannabis Bill, the Tobacco Bill, platform policies); budget.
- **Who approves what:** HQ marketing approves every post and send. Counsel approves the copy bank (once), any new
  claim, the event formats and all franchise material. Store managers approve posts about their store. No photo goes
  out without a release.
- **Where the numbers live:** HQ → Campaigns (return on spend), Reports (sales, members), HQ → Founding Members (the
  list), HQ → Campaigns → Social (post history), Postiz analytics, Google Business Profile insights, Search Console.

## 14. Risks

| Risk | Likelihood / impact | What we do |
|---|---|---|
| Instagram or Facebook restricts or removes an account | Medium / high | Brand-only content, screened; no cannabis hashtags; no orders taken in DMs; the member base is the real audience. Never open duplicate accounts to get around a ban (that breaks Meta's rules). |
| Section 18A turns out to cover Schedule 0 CBD | Medium / high | Counsel's opinion by 16 Oct; change E; offers stay on merch and accessories until then. |
| A store licence is late | Medium / high | Open with CBD, merch and Learn; the dispensary opens when the licence does. |
| A neighbour objection or a negative story | Medium / medium | The Good Neighbour Promise, early meetings, the Q&A pack, the manager's direct line, same-day response. |
| Election campaigning to 4 November | High / low | Neutral; no politicians at our events; no sends on 4 Nov (change C). |
| The Tobacco Bill passes | Medium / medium | No campaign built on accessories; `tobaccoBillMode` is ready. |
| The merch partner or couriers close for the holidays | High / medium | Last order dates in every message; the festive lead-time notice (change D). |
| Storms or load-shedding during an event | Medium / medium | Indoor plans; backup power; the tills work offline. |
| Security at busy December events | Medium / medium | A guard on the door; card and PayShap preferred; ID at the door. |
| Road closures for the Comrades and Amashova | Certain on the day / low | Plan hours and staff access; tell members in advance. |
| Founding Members feel short-changed (the cap, the floor ending) | Medium / medium | Clear rules from day one; the floor ends after the festive season; numbered cards and the December evening are for good. |
| The adult-use law arrives with its own advertising rules | Low in 2027, medium in 2028 | The drawer plan; switch nothing until counsel signs off. |
| WhatsApp policy on drug-related messaging | High / low | Order updates by SMS; no WhatsApp marketing. |

## 15. The Mega Plan: in scope, out of scope, sequence

### In scope

1. **This plan:** the launch (§6), the copy bank (§7), the always-on engine (§8), the 24-month calendar (§9), the
   opening playbook (§10), the franchise track (§11), the budget split (§12), measurement (§13) and risks (§14).
2. **Platform changes — built 27 September 2026:**
   - **A · Founding Members list mode (was the launch blocker).** The shop takes orders while the list runs to its
     closing date (HQ → Founding Members); members can choose an opening-soon store as their home store; the shop,
     the Rewards card and HQ speak of "the Founding Members list" and its closing date.
   - **B · Sign-up sources.** Every join link and QR code carries `?src=` (`/club/join?src=qr-window-hillcrest`); the tag
     is stored on the member and **Reports → Members → Where members joined** counts them. Tags: lowercase letters,
     digits and dashes — `qr-window-hillcrest`, `qr-window-hilton`, `flyer-hillcrest`, `flyer-hilton`, `highway-mail`,
     `village-talk`, `witness`, `open-day-hillcrest`, `open-day-hilton`, `hcp-hillcrest`, `hcp-hilton`.
   - **C · Proclaimed public holidays** (4 November 2026 first) are in the send-window calendar. They're a list in the
     code (`src/lib/sa.ts`) rather than an HQ setting: they're rare and gazetted weeks ahead.
   - **D · Merch notice.** HQ → Online orders → Settings → _Merch notice_ shows next to made-to-order merch on product
     pages, in the bag and at checkout. Set it in late November; clear it in January.
   - **E · Classes without incentives (s18A):** built. HQ → Compliance lists the classes kept out of deals, points and
     member prices; CBD supplements (Schedule 0 complementary medicines) are on the list by default until counsel
     clears them.
   - **Members, always:** the platform's own wording now says _member_ wherever it said customer; walk-ins stay
     _walk-ins_.
3. **Loading the launch into the platform** (waiting for your store details and production access): launch settings; both stores as opening soon;
   the events; the Founding Members' Drop; campaign drafts for §7.2; the October social posts as Postiz drafts; new Learn
   articles (_Your first visit_, _The Good Neighbour Promise_, _Holland, meet the Hills_); STRATEGY.md §8 updated.

### Out of scope

- Paid social and search ads (not open to us), TikTok and YouTube, paid influencers, paid radio in 2026.
- 4/20, health awareness days, sponsorship of sport (Comrades, Amashova, Midmar Mile), anything at or with schools
  (including the Hilton Arts Festival), stalls at family markets, religious and political moments, activist events.
- Advertising licensed (THC) medicines in any form; selling on social; consumption or alcohol at our events.
- Automated journeys (a later build). Gift vouchers, the franchise enquiry form and lead tracking were built since.
- Store P&L targets, media contracts, the creative production itself (this plan is the brief), new merch designs
  (the anniversary design is briefed in September 2027).
- Running the adult-use campaign (it stays in the drawer).

### Sequence

1. **Done (27 Sep):** plan approved; A–D built and tested.
2. **Next, from you:** the store details (addresses, hours, phone numbers, managers, pharmacists), who packs online
   orders until 1 December, and the launch budget.
3. **By Wed 30 Sep:** deploy; set up Postiz and connect the brand accounts; in HQ, set the list to close Sun 6 Dec
   23:59 (2,026 places, Sprout, 14 months, 250 places per referral); create both stores as opening soon; load the
   events, the Founding Members' Drop, the campaign drafts (§7.2) and October's social drafts (§7.1).
4. **Thu 1 Oct:** online launch. If the deploy slips, the launch moves to **Thu 8 Oct**.
5. **By Fri 16 Oct:** counsel's answers (the copy bank, s18A for Schedule 0 CBD, the event formats); build E if needed.
6. **Late November:** set the merch notice (D) once the partner confirms its festive closing dates.
7. **Weekly to January:** the launch dashboard; social drafts loaded four weeks ahead.
8. **January 2027:** re-base the targets on eight weeks of data; approve the Q1 calendar.
