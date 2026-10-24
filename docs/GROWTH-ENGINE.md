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
- [x] **IndexNow:** every production deploy sends the sitemap's URLs to IndexNow (Bing, Yandex, Seznam and others share
      it; free, no account). The key is public/<key>.txt. Google doesn't use IndexNow: it reads the sitemap.
- [x] **Monthly specials page:** /specials (in the main nav and the sitemap) lists the network's live automatic
      specials, online and in store; members share it through their join link, with the Status card.
- [x] **Events: the plus-one joins to RSVP.** Under a member's ticket, "Bring a friend" shares their join link back to
      the event: the friend joins free with the referral and RSVPs for their own ticket (still one per member).
- [ ] **Growth dashboard in HQ:** joins per store per week, share from referrals, invites per member, the referral ratio
      (target 0.4 in the first quarter).
- [x] **Press kit and pitches:** the press room was already live (herbalholland.com/press: fact sheet, logos, notes on
      how to write about us). Added the first release, "Herbal Holland opens in KwaZulu-Natal", as a draft, and
      docs/press/PITCHES.md: angles, outlets, three pitch emails and a send log. The owner approves the release (sets its
      date), adds a founder quote and sends the pitches from press@.
- [x] **Media plan (owner approved 24 Oct): the newsletter.** The Windmill already runs from the Studio (No. 1 on the
      shop's opening day, No. 2 with the December openings, then monthly packs), sent only to members who said yes to
      email, inside the CPA send windows, through the copy screen. Added "The Windmill: a first look" (email + push) for
      now, while the stores trade and the shop is still closed: HQ lays it out in Studio on a Tuesday and approves it.
- [ ] **Media plan: Telegram channel** page and join button (the owner creates the channel), then its posts.
- [ ] **Media plan: lifestyle content pack:** 30 platform-safe posts (no product, no prices) and backup-handle notes.
- [ ] **Media plan: op-ed draft** "the law, plainly", for the owner to send to a national opinion editor.
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
- Press: approve the KZN release (set its date), send a two-sentence founder quote, shopfront pictures, then send the
  pitches in docs/press/PITCHES.md from press@herbalholland.com.
- For the area pages: each store's hours, parking, nearby landmarks, local events and who's on the team.
- Forward your own referral link to people you know; the first members come from people who trust you.
