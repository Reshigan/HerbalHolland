# Growth engine: free, always on, run by Claude every hour

No paid social (Meta, TikTok and Google refuse cannabis and CBD ads), so growth comes from members sharing, the stores,
Google and content we own. Focus: KwaZulu-Natal (Bluff, Pietermaritzburg, Hillcrest, Hilton) until online shopping is
live, then national.

## What the hourly run does

1. **Pulse (read only):** members, joins in the last hour and from referrals, early-access sign-ups. It reports to the
   owner only when something moved or needs a decision.
2. **Babysit:** if a growth PR is open, it drives that PR to green, merged and deployed before starting anything new.
3. **Build:** otherwise it takes the next open item below, builds it on the working branch, runs typecheck, tests and the
   copy screen, opens a PR, and merges and deploys when CI is green. One item per PR.
4. **Never:** messages anyone, changes live data or settings, posts to social networks, spends money, offers incentives
   on medicines, makes health claims, or writes pages Google would treat as doorway spam.

## Backlog (top first; tick when live)

- [x] **Referral ladder:** 3 friends' first purchases, the next tier for 30 days; 10, Windmill Crew status; rules at
      /legal/referrals. No prize leaderboard (it would be a promotional competition under CPA s36), so no draw rules needed.
- [x] **WhatsApp Status cards:** a 9:16 card with the member's join QR and code ("Status card" next to every invite; Founding
      wording while the list is open), shared as an image straight to Status where the phone allows. Events, drops and
      specials cards follow with those pages.
- [x] **Staff referral codes:** each staff member's own join QR on the till's Shift view (`/club/join?src=staff-…`),
      with a count of members who joined with them this month (from the link, or signed up by them at the till).
      Paying for sign-ups waits on the owner (see below).
- [ ] **Area pages that earn their place:** one page per store's catchment (Bluff and the south coast, Pietermaritzburg
      and the Midlands, Hillcrest and the Upper Highway, Hilton and Howick) with the store, hours, directions, local
      events and how to join. Real content only. On hold: today they would only repeat the store pages (a doorway risk);
      they need the owner's local facts first (hours, parking, landmarks, events, the team).
- [ ] **Learn, one article a week, each with a quest:** KZN's landraces in depth; hemp and cannabis in South African
      law, plainly; reading a product label; caring for your accessories; private growing and the law since 2018;
      responsible use for adults. Copy screen and claims list apply. Published: caring for your accessories (24 Oct).
      Next: reading a product label.
- [ ] **IndexNow:** tell Bing and others the moment a page is published or changed (free, no account).
- [ ] **Monthly specials page:** shareable with the member's link (the earlier plan, no newsfeed).
- [ ] **Events: the plus-one joins to RSVP.**
- [ ] **Growth dashboard in HQ:** joins per store per week, share from referrals, invites per member, the referral ratio
      (target 0.4 in the first quarter).
- [ ] **Press kit page and pitches:** facts, photos, founder quote; pitches drafted for The Witness, Highway Mail,
      Southlands Sun and Durban news sites, for the owner to send.
- [ ] **Counter printables:** QR stand, receipt line, neighbour swap cards from the QR maker.
- [ ] **Claude in the Rewards app** (blocked: needs an Anthropic API key on the Worker): a guide that answers
      questions about membership, stores, events and lab results, recommends Learn and quests, never gives medical advice.
- [ ] **National** (after online shopping is live): province pages, courier-area messaging, national referral push,
      and the invite on the order-confirmation page (members who join at checkout land there, not on the card).

## Needs the owner

- Open the Founding Members list: HQ → Launch, list closes 1 December 2026 08:00.
- Connect the social accounts in HQ → Marketing → Social so the Studio's scheduled posts go out.
- Store phones and the Bluff and Pietermaritzburg hours; Google Business Profiles (see GOOGLE-BUSINESS-PROFILES.md).
- Publish the real product range.
- Decide whether staff earn anything per sign-up (an amount per member who joins with them, paid by the store owner).
  The count is on the till already; paying it needs the amount and is a staff incentive, never on medicines.
- For the area pages: each store's hours, parking, nearby landmarks, local events and who's on the team.
- Forward your own referral link to people you know; the first members come from people who trust you.
