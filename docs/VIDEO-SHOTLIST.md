# Video: shot lists and the phone shooting guide

Social is for the brand; offers live on our own channels ([MARKETING-PLAN § 7](MARKETING-PLAN.md)). Every video,
rendered or shot, follows the same lines:

- **Brand-led.** Places, people, merch, the mark, the standards. No product prices, no deals, no "shop now".
- **No consumption.** Nobody smokes, vapes, eats or drinks a product on camera, and nothing implies it. No leaves,
  no smoke, no 4/20, no stoner clichés.
- **No product close-ups for social.** Packs may appear only as "the range" artwork (the category renders in
  `public/catalogue`, as in `range`), never as a hero shot, never in hand, never with a price.
- **No medical claims**, no conditions, no "relief", no "helps with". CBD copy comes only from the approved list and
  is screened by `screenCopy`. Licensed (THC) medicines are never shown or named on social.
- **Adults 18+** on every end card and in every caption block, last. Anyone on camera is over 25 and has signed a
  release; no one who looks under 25, no children in frame, no school uniforms.
- **One call to action**: "Join free: herbalholland.com/join". The first 2,026 members get a numbered
  Founding card; every friend who joins with your link moves you up 250 places. Nothing else is promised.
- **Silent-safe.** Captions burned in; music optional. No voice-over that says what captions don't.
- Tone: warm, plain English, confident. No exclamation marks, no emoji, three hashtags at most, one of them local.

## 1. The rendered videos (`scripts/video`)

`npx tsx scripts/video/render.tsx` makes each in 9:16 (Reels, TikTok, Stories) and 16:9 (YouTube, the menu board,
the website) at 30 fps, H.264, under 4 MB each. Every one ends on the end card: the mark draws in, "Join free",
`herbalholland.com/join`, "Adults 18+". Times are seconds.

### welcome · 18 s · "Welcome to the Windmill"
| t | Picture | Caption |
|---|---|---|
| 0–4 | Black. The ring draws itself, then the tower; the four petals pop in and keep turning slowly. A soft orange glow grows behind. | Welcome to the Windmill. |
| 5–9 | The mark lifts; HERBAL / HOLLAND rises under it (light, then extra-bold). | Herbal Holland, a Dutch-born brand, made at home in KwaZulu-Natal. |
| 10–14 | Eyebrow OPENING SOON, headline "Holland, meet **the Hills.**", Hillcrest · Hilton · KwaZulu-Natal. | Hillcrest and Hilton, opening soon. |
| 14–18 | End card. | |

### founding · 20 s · "2,026 numbered cards"
| t | Picture | Caption |
|---|---|---|
| 0–7 | FOUNDING MEMBERS; a hero number counts 0 → 2,026 (slow expo ease); "numbered cards". | The first 2,026 members get a numbered Founding card. |
| 8–11 | A Founding Member card slides in from the right and settles at a slight tilt: mark, FOUNDING MEMBER, #0292, Herbal Holland Rewards, Hillcrest · 2026. A sheen crosses it. | Your card. Your number. Yours from day one. |
| 12–16 | A pill pops above the card, "↑ 1 friend = 250 places up"; the number counts down 0292 → 0043. | Every friend who joins with your link moves you up 250 places. |
| 16–20 | End card. | |

### rewards · 22 s · "How Rewards works"
| t | Picture | Caption |
|---|---|---|
| 0–6 | A phone outline with the mark; "Join free" button; a tick pops. The rail Join → Points → Tiers lights its first node. | Join free with your mobile number. Adults 18+. |
| 6–12 | A ring fills while a counter climbs to 1,246 points (points, never rand). Second node lights. | Earn points every time you shop, in store or online. |
| 12–18 | Seed → Sprout → Bloom → Harvest light up in turn. Third node lights. | Climb from Seed to Harvest: early access, members' evenings and more. |
| 18–22 | End card. | |

### hillcrest · 16 s and hilton · 16 s · the town reveal
| t | Picture | Caption |
|---|---|---|
| 0–5 | Faint contour rings drift. A pin drops with a bounce, ripples spread. | Herbal Holland is coming to the Hills. |
| 2–12 | The town name rises letter by letter; "Upper Highway · KwaZulu-Natal" (Hillcrest) or "The Midlands · KwaZulu-Natal" (Hilton); OPENING SOON. | Opening soon in Hillcrest / Hilton. Join free and be first through the door. |
| 12–16 | End card. | |

### launch · 44 s (and launch-30, the 30 s WhatsApp cut) · "Holland, meet the Hills"
The brand's first hello, with its own soundtrack (synthesised, 120 bpm, cuts on the beat). The 30 s cut keeps every
beat, shorter. Store pictures are concept renders, tagged "Store concept" on screen.
| t (44 s) | Picture | Words |
|---|---|---|
| 0–4 | Wind. The mark draws in; HERBAL HOLLAND sharpens letter by letter. | |
| 4–9 | Dawn over line-art hills; a spark drifts north. | THE 1970S · "Some stories **travel.**" · "A seed left the hills behind Durban…" |
| 9–14 | Amsterdam canal houses and a windmill draw in. | AMSTERDAM · "…and found a home in **Holland,**" · "where cannabis culture grew up." |
| 14–18 | The hills return; a soft beat starts; a riser. | FIFTY YEARS ON · "It's coming **home.**" · "Dutch heritage. African soil." |
| 18–22 | Impact, flash. | "Holland, meet **the Hills.**" · HILLCREST · HILTON |
| 22–34 | The store: three concept renders pan past on a full beat. | "A members' club for **cannabis culture.**" / "CBD wellness **and coffee.**" / "Our own apparel, **accessories and grow.**" |
| 34–39 | A numbered Founding card spins in. | "Be a **founding member.**" · "The first 2,026 get a numbered card. Free for adults 18+." |
| 39–44 | End card. | OPENING 1 DECEMBER · Hillcrest · Hilton · Join free · herbalholland.com/join · Members only · Adults 18+ |

### join · 24 s · "Join in 20 seconds"
| t | Picture | Caption |
|---|---|---|
| 0–2 | "Join in **20 seconds.**" with the three steps listed; a phone mock shows the mark. A 20 s ring starts. | |
| 2–8 | Step 1 lights. On the phone: "Your mobile number", +27 82 441 7390 types in, "Send my code" presses. | Step 1: your mobile number. No forms, no passwords. |
| 8–14 | Step 2 lights. A text drops in ("Your Rewards code is 482 913"); six boxes fill; "Confirm" presses. | Step 2: type the one-time code we text you. |
| 14–19 | Step 3 lights. "You're in." A small Founding Member card (#0042) rises; a little orange confetti falls. The ring reaches 20. | Step 3: your card is ready. That's it. |
| 20–24 | End card. | |

### range · 20 s · "The range"
| t | Picture | Caption |
|---|---|---|
| 0–16 | The eight non-THC category renders (CBD wellness, skin care, coffee and tea, nutrition, collagen, accessories, apparel, grow) drift past as a tilted grid of cream tiles (columns moving in opposite directions) under a dark veil; "The **range.**"; a ticker of range names. No prices, no close-ups. | Eight ranges under one roof, for members 18+. / From the Windmill to the Hills. In store and online, soon. |
| 16–20 | End card. | |

## 2. Shot lists for real footage (phase 1 and 2, Oct–Dec 2026)

Shoot these as the stores take shape; they replace the rendered cards' pictures in the Reels slots (Thursday 19:00,
[MARKETING-PLAN § 8](MARKETING-PLAN.md)) and feed the countdown. Each Reel: 15–30 s, 9:16, captions burned in,
end card from the renders (the mark, Join free, URL, Adults 18+; export it from `welcome-9x16.mp4`, the last 4 s).

### A. The store build (one Reel per store, plus clips for the countdown)
| # | Shot | How | Notes |
|---|---|---|---|
| A1 | The empty unit, wide, from the door | Static, 6 s, phone on a small tripod at chest height | The "before" frame; repeat the exact position every visit for the time-lapse |
| A2 | The same frame, every visit | Static, 4 s each visit (shelving, counter, paint, lights, stock day) | Same spot, same height, same time of day if possible; mark the floor with tape |
| A3 | Hands at work: cutting, painting, fixing the counter | Hand-held, slow push in, 5 s | Workers' faces only with a release; otherwise hands and backs |
| A4 | The orange going on | Hand-held, close on the roller, 5 s | The brand colour arriving is the story |
| A5 | The counter lit for the first time | Static, lights off → on, 6 s | Shoot at dusk |
| A6 | Walk-through, door to counter | Gimbal or steady walk, 12 s | Shelves empty or dressed with merch only; no product on shelves in the frame (or blur it later) |
| A7 | The street outside: Hillcrest's Old Main Road, Hilton's village | Static wide, 6 s each, morning | Places first; local pride, no traffic plates or faces |

### B. The sign going up
| # | Shot | How | Notes |
|---|---|---|---|
| B1 | The fascia blank, from across the road | Static wide, 6 s | Ask permission to stand where you stand; keep the road safe |
| B2 | The sign crew lifting the mark | Hand-held, 10 s, then the same from below | The best moment of the build; shoot two angles if two phones are available |
| B3 | Close on the mark as the last fixing goes in | Hand-held, 5 s | |
| B4 | Lights on, first evening | Static wide from the same spot as B1, dusk, 8 s | The reveal frame for the town post |
| B5 | Reaction: a staff member looking up (over the shoulder) | Hand-held, 5 s | Release signed; no reaction shots of passers-by |
| B6 | Time-lapse, blank → lit | Phone time-lapse mode on a tripod, 30–60 min real time | Lock exposure and focus |

### C. Staff intros (one 20 s Reel each; the team's own voices)
| # | Shot | How | Notes |
|---|---|---|---|
| C1 | Name card: "Hi, I'm Thandi. I'll be at the Hillcrest counter." | Medium, eye level, 6 s, a window to the side | First names only, their own words, no scripts beyond the prompt |
| C2 | What I'll do here: "I'll help you read a lab certificate" / "I'll have your click & collect ready" | Medium, 8 s | The standards, the service, the welcome. Never what a product does, never a recommendation, never dosage |
| C3 | A detail: hands folding a tee, straightening the counter, writing a name tag | Close, 4 s | |
| C4 | "See you in December. Adults 18+." | Medium, 4 s | Always the last line |

Prompts the team can answer in their own words: why I joined; what I'm looking forward to; my favourite spot in
the town; what "gezellig" means to me. Prompts they must not answer on camera: anything about effects, strength,
dosage, their own use, what a product is "good for", or prices.

### D. Opening week (for the archive and the first-week Reels)
| # | Shot | How | Notes |
|---|---|---|---|
| D1 | The queue at the door, from inside, wide | Static, 6 s | Backs and silhouettes; no faces without a release |
| D2 | The door opening, first customer welcomed (staff side) | Hand-held, 6 s | Staff face only |
| D3 | The Members' Evening (Thu 3 Dec) and the Open Day (Sat 5 Dec): the room, the merch wall, the Founding card being handed over (hands only) | Hand-held, 5 s each | A card, not a product, in the hand |
| D4 | The team at close, day one | Static group, 5 s | Everyone with a release; "Adults 18+" in the caption |

## 3. The phone shooting guide

**Set up the phone once.** 4K if the phone offers it, otherwise 1080p; 30 fps (no 60 fps, no cinematic mode);
vertical for Reels, horizontal only for B6 and A7 when a landscape version is wanted. Lock exposure and focus
(tap and hold) before every clip. Grid on; clean the lens. Turn off the flash, HDR video and any "beauty" or
auto-enhance filter. Phone on a small tripod for every static shot (A1, A2, A5, B1, B4, D1); hold with both elbows
in for the rest.

**Light.** Shoot in the morning or at dusk outside; inside, use the shop lights and a window, never the phone
light. Keep the orange orange: if the walls look yellow or pink, set white balance to "daylight" or "tungsten" and
leave it.

**Movement.** Slow. One move per clip: a push in, a pan, a walk. Hold each shot for 5 seconds longer than you
think. Start recording, count two, then move; stop two seconds after the move ends. Nothing hand-held longer than
12 s.

**Sound.** Record the room; no music on set (rights). Voices: 40 cm from the phone, the window to the side, the
street door shut. Say the clip number at the start of each take.

**Frames.** Leave the top 15% and the bottom 25% of a vertical frame clear (platform UI and our captions sit
there). Subject in the middle third. No phone, screen or document in frame that could show a price, a name or a
stock list.

**People.** Only adults over 25 with a signed release (the form is in the Studio under Releases); first names in
captions; no customers' faces without the same release. Staff wear the merch, not the uniform with a licence number.

**What never gets shot.** Anyone consuming anything; a product pack as the subject; a shelf of product close enough
to read a label; price tags, the till screen, the back office, deliveries, stock rooms, the dispensary counter for
licensed medicines, lab reports in hand (the QR on the pack is the story, not the document); anyone who could be
under 25; minors anywhere in frame; alcohol.

**Hand-over.** Original files, not WhatsApp copies (they recompress): AirDrop, a cable or a Drive upload. Name them
`YYYY-MM-DD_store_shotnumber_take` (`2026-11-05_hilton_B2_2.mov`). Add one line per clip: who is in it (release
on file yes/no) and what it shows. The Studio pairs each clip with its post brief; the Social composer won't send a
post that fails `screenSocial`.

**Edit.** Trim to 15–30 s; captions in Outfit on a dark pill (the same style as the renders); the end card from
the renders as the last 4 s; "Adults 18+" in the caption block, last. Export H.264, 1080×1920, under 4 MB per 20 s
where possible (`scripts/video/README.md` has the ffmpeg settings).
