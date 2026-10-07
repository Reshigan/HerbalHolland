# Herbal Holland: South African Cannabis Market Study

> **Research date:** 27 September 2026
> **Purpose:** to inform the Herbal Holland commerce stack (POS, inventory, e-commerce with click & collect and delivery, loyalty app, marketing tools).
> **Confidence:** operator claims and market estimates are low-confidence. Store counts, prices and fees are as published by operators or directories on the dates shown. "n/f" means not found or not verifiable. This is market research, not legal advice.

## Contents

1. [Legal context](#1-legal-context)
2. [Competitors](#2-competitors)
3. [Market size and consumer behaviour](#3-market-size-and-consumer-behaviour)
4. [Heritage strains and craft growers](#4-heritage-strains-and-craft-growers)
5. [Marketing when paid ads are restricted](#5-marketing-when-paid-ads-are-restricted)
6. [Gaps and pain points](#6-gaps-and-pain-points)
7. [Ranked ideas to beat the competition](#7-ranked-ideas-to-beat-the-competition)
8. [Caveats](#8-caveats)
9. [Sources](#9-sources)

---

## 1. Legal context

The legal position shapes every feature decision.

- **Private use.** The Cannabis for Private Purposes Act (CfPPA, signed May 2024) decriminalised private adult use and cultivation. Draft rules (2 Feb 2026) propose limits of 750 g and 5 plants per adult in a private place [1][2].
- **Commercial sale.** Selling THC is still illegal outside SAHPRA medical channels. The Act's "deal in" offence covers "advertise for sale", with up to 10 years' imprisonment [1].
- **Clubs have no legal cover.** The Western Cape High Court held the Haze Club grow-club model to be "tantamount to dealing" (29 Aug 2022). The appeal was withdrawn [3].
- **Commercial rules are late.** They were targeted for March 2026 and had not appeared by late August 2026. A Cannabis Bill is expected mid-2027 [4].
- **Enforcement continues.** In March 2026 police raided four Durban shops and seized R1.3m of product [5].
- **Hemp has loosened.** The THC limit for hemp rose to 2% from 1 Dec 2025 [6].

**Implication for the stack.** Design it to run lawful flows now (CBD/hemp, café, accessories, the Section 21 medical route). Adult-use retail should be a mode that can be switched on once licensing lands.

---

## 2. Competitors

Footprints are the operators' own claims on the dates shown.

| Player | Model | Footprint (date) | Notable offerings | Review themes |
|---|---|---|---|---|
| **BudBox** | Members' club chain with BudDrop delivery | Claims 28+ sites; its site lists JHB 16, PTA 4, KZN 5, CPT 1 (Sep 2026) [7] | Rewards page; presenting partner of Cannabis Expo 2026; fees and prices not published | n/f |
| **Taste of Cannabis / Canna Collective** | Club with free membership, plus e-commerce | 11 stores: JHB 4, PTA 3, CPT 2, DBN 2 (Jun 2026) [8] | Delivery in 60 minutes within 10 km for a flat R75, tracked live by GPS link over SMS. Online prepayment only (PayFast); crypto in store. 5% back, R25 welcome and R50 birthday rewards. Flower R100–230/g; mg per serving on labels [8][9] | The most omnichannel SA player found |
| **Seknd Nature** | Members' collective with lounges | 7 branches: 6 CPT, 1 JHB [10] | Entry tier R49 per 30 days; premium tiers get rare strains early and event invites. Online card checkout, WhatsApp line, delivery in set zones, loyalty page, tastings and comedy nights | Knowledgeable budtenders and a curated range; food offer still being built [10] |
| **Nirvana group** (Nirvana Sea Point and Blouberg, The Alibi, HQ) | Lounge clubs | 4 venues: CPT 3, JHB 1 [11] | R150/month or R1,000/year; R60 guest pass; 21+ only; one membership works at all venues | n/f |
| **Cannibisters** (Sea Point) | Single large lounge | 1 venue; 27,000+ members (Apr 2024) [14] | R100/month or R20 day pass [15]. 90+ strains from about R100–135/g; open daily until 23:30. Higher tiers add free grams, delivery and airport transfers. Tablet ordering; returns accepted if quality disappoints [14] | Draws tourists; long hours; very large menu [14][63] |
| **PureGro** | Positions itself as a "Section 21 medical" brand | 8 stores: 7 Western Cape, 1 JHB [12] | Flower graded A to AAA+; "inner circle" sign-up; pitches affordability | n/f |
| **The 420 Doctor** (also Green & Purple, JOY Medical) | Medical collection points: doctor consult, then Section 21 permit | 6 sites: 5 CPT, 1 Stellenbosch [13] | Consultations; WhatsApp line per store; Green & Purple has a GP on site [63] | n/f |
| **DANK** | Grows and sells its own product ("seed-to-sale") | 3 stores: Rosebank Mall, Bryanston, Hatfield [16] | 30 mg THC sodas and in-house edibles; free shipping over R800 | A JHB guide reports a loyal following for its sodas [17] |
| **Weed Lovers Market** | Township-rooted lifestyle club | 3 sites: Soweto, Marshalltown, Fourways [17] | Kitchen serving infused food, monthly 4:20 market, painting nights, fashion collaborations | Strong culture; the Fourways online menu was offline [64] |
| **Tyson 2.0 SA** | Local licensee of Mike Tyson's cannabis brand | Cape Town "coffee shop", opened January 2025 [18] | R100 for 30 days or a 1-day plan; same-day delivery within 15 km in CPT; national delivery in 1–2 days | The coffee shop's domain did not resolve on 27 Sep 2026, so its status is unverified |
| **JHB café-clubs**: Greenery Café, 420 Café, Highgrounds BLVD, Spliff Café | Café and lounge clubs | 1–3 sites each [17] | Greenery: R30 membership, 5% cashback, R160/g. 420 Café: **10% card fee**. Highgrounds: co-working space and comedy nights. Spliff Café: free delivery over R500 | Events draw people in; paying is awkward |
| **Online and delivery**: Springbok Society, Happy420 Africa, Cannabuben, AmazolSA, Zootly, 420 Monkeys | Online "clubs" and smart shops | National courier; some same-day in CPT [19]–[23] | Springbok: free membership, 2–3 days by courier, PayFast or EFT. Happy420: 1–2 days, card payments, 15% off a first order. Cannabuben: paid tiers at R49, R99 and R199. AmazolSA: R30/g (AA) up to R150/g (AAA indoor). Zootly and 420 Monkeys: ordering by WhatsApp | Low trust: reports of swapped strains, dry buds, and money paid upfront for goods that may not arrive [46] |
| **CBD and wellness**: MedLeaf, The Green Side, CannAfrica, Hemporium, Modern Medicine Cartel | Legal CBD and hemp retail | MedLeaf 5 Gauteng; Green Side 4 Gauteng; Modern Medicine Cartel 3 in the Durban area; Hemporium in CPT since 1996 [24][26][27][28] | MedLeaf: THC-free, lab-tested, a dosage wizard, one-to-one advisors. CannAfrica: JSE-listed owner Labat sold it for R8m (effective June 2025); its website shows "under maintenance" [25] | CannAfrica's exit suggests CBD-only margins are thin |
| **Pharmacies**: Clicks, Dis-Chem; Highly Legal (with Manor Pharmacy) | CBD sold over the counter under a reported 20 mg/day cap (rule reported 2019); SAHPRA medical route | Clicks: 890 SA stores, ClubCard 12.6m members (Oct 2025) [29]. Highly Legal: 4 Gauteng pharmacies [17] | Rethink, Releaf, Elixinol and ADCO, plus Clicks' own brand. Oils cost about R300–1,000 [29][30] | Trusted names and loyalty schemes at scale; no THC |

**Scale.**
- The 420.camp directory lists 319 venues across 55 cities, including 88 in Cape Town, 36 in Durban, 32 in Gqeberha and 28 in Johannesburg (August 2026) [31].
- Industry insiders estimate 2,000–3,000 clubs nationwide [32].

---

## 3. Market size and consumer behaviour

### 3.1 Market size estimates

| Measure | Figure | Source |
|---|---|---|
| Total market, including illicit | About R28bn, roughly half of it illicit. Base estimate R14bn; formal industry about R5.5bn a year; growth target about 10% a year | DTIC officials, April 2026 [33][34] |
| Retail economy | R9–10bn a year, with about 550 t of flower moving through about 8,500 stores and 2,500 clubs | Analyst Charl Botha [33] |
| CBD and medical | R470m (2024) | Euromonitor, July 2025 [35] |
| Adult-use, if legalised | R11bn by 2028; illicit market R36bn (2025) | Euromonitor [35] |
| All cannabis | US$308m (2024) rising to US$327m (2029) | Statista [36] |
| Hemp | R7.3bn (2025) rising to R40.4bn (2040) | LSF study, via [33] |
| Jobs | 90,000+ | DTIC, September 2025 [38] |
| Past forecast (not met) | Medical R11bn plus recreational R20bn "by 2023" | Prohibition Partners, 2019 [37] |

These estimates differ by more than tenfold, so treat all of them as low-confidence. Dividing Botha's figures (my arithmetic) gives an average of about R16–18 per gram. That suggests most of the volume is cheap outdoor-grown flower.

### 3.2 Consumer behaviour

**Price tiers**

- Street outdoor flower costs R10–20/g; indoor flower costs R150–200/g [39]. One guide puts "premium" flower at R200–400/g [40].
- One online menu prices AA greenhouse at R30/g, AAA greenhouse at R60/g and AAA indoor at R150/g [21].
- Clubs charge R100–230/g [8][14][17]. A 2023 test purchase by GroundUp paid R100/g [41].

**Categories**

- Flower and pre-rolls are the core range.
- Menus also carry gummies, vape carts and disposables, rosin, THC sodas, and CBD and full-extract oils [8][9][16][20].
- Sales share by category: n/f.

**Payments**

- Nationally, cash is 56% of transactions by volume but only 21% by value. Debit cards are 34% by volume and 55% by value (SARB 2023 study) [42].
- PayShap passed 1bn transactions on 18 June 2026 and now handles more than 60m a month [43].
- Among online retailers, 40% offer PayShap and 38% are considering taking payments through WhatsApp [44].
- Cannabis sellers vary widely. Some prefer cash and charge card fees, some take prepayment only, and some accept crypto [8][9][17].
- Use of SnapScan or Zapper by cannabis retailers: n/f.

**WhatsApp**

- About 94–96% of SA internet users use WhatsApp [45].
- It is the default ordering channel for many clubs [10][13][22].
- Informal sellers send menus over WhatsApp and take payment by bank or ATM transfer [46].

**E-commerce baseline**

- SA online retail reached R96bn in 2024 (8% of all retail) and is heading for about R159bn in 2026.
- Checkers Sixty60 has taught shoppers to expect delivery in under an hour [44].

**Tourism**

- Tourists cannot legally buy cannabis [31]. Even so, clubs sell day passes: R20 at Cannibisters, a R60 guest pass at Nirvana, and a 1-day plan at Tyson [11][15][18].
- Taste of Cannabis accepts passports as ID and takes crypto [9].
- Cape Town has cannabis tours and cannabis-friendly hotels [47].

---

## 4. Heritage strains and craft growers

**Landrace strains** (traditional regional varieties):

- **Durban Poison** became known worldwide after the US grower and author Ed Rosenthal took its seeds to the US in the 1970s.
- **Swazi Gold** comes from Eswatini.
- **Malawi Gold** comes from the Salima district and takes up to about 120 days to flower.
- **Rooibaard ("Swazi Red")** comes from Transkei. It is now largely lost, and seeds sold online under the name are probably not genuine.
- **Mpondo/Transkei Gold** is described in an Eastern Cape policy paper as being as famous as Durban Poison. The same paper says Durban Poison may partly originate in Mpondoland [48].

**Craft growers**

- Pondoland growers have seen the price of a 20-litre bucket of flower fall from R1,500–2,000 to about R500. Some have burned crops they could not sell [49].
- On 25 Sep 2026 the government was reported to be looking for ways to bring indigenous growers into the formal market [50].

**How brands use this today**

South African brands use heritage only lightly: strain names on products (for example, a Durban Poison cartridge at R690 [9]), award mentions and tasting events. **No retailer found offers verified landrace provenance or partnerships with growers.** That is open ground for Herbal Holland's Dutch-meets-South-Africa story.

---

## 5. Marketing when paid ads are restricted

### 5.1 Constraints

- Meta allows CBD ads only in the US.
- Google allows only topical CBD ads, and only in California, Colorado and Puerto Rico [51].
- In South Africa, advertising cannabis for sale counts as dealing [1].

### 5.2 What South African players do instead

- **Events:** markets, comedy and amapiano nights, tastings.
- **Sponsorship:** BudBox was the presenting partner of Cannabis Expo 2026, which had 132 exhibitors [7][52].
- **Search content:** guides and directory listings that rank in search results.
- **Newsletter discounts** of 10–15%.
- **Loyalty and brand extras:** birthday points, merchandise and fashion collaborations [8][10][17][20].

### 5.3 Global retail-tech features not seen among SA players reviewed

| Platform | Features South African competitors lack |
|---|---|
| **Dutchie** (E-Commerce Pro, Aug 2025) | SEO tools, AI product recommendations, and payments plus loyalty built in. The till, kiosks, app and website all run on one catalogue. Used by 6,500+ dispensaries [53] |
| **Flowhub** | Self-service kiosks linked to the till (it claims up to 35% more sales), digital menu boards and QR menus, loyalty passes in the phone wallet, gift cards, ordering by text message with AI, and a dashboard for managing many stores [54] |
| **Treez** | Debit and bank payments (it claims about 40% higher average orders than cash-only), wallet-based loyalty (2025), and discounts triggered by harvest date [55] |
| **Cova** | Scan-to-shop on the customer's own phone, ID scanning, and 500+ integrations [56] |
| **Alpine IQ** | Loyalty tiers, point multipliers and expiry, and automated message sequences across SMS, email and app notifications [57] |
| **Springbig** | Marketing automation, a branded app and a referral programme. Bought VICE CRM, an AI-enabled marketing platform, in March 2025 [58] |
| **Jane** | Brands pay for placements on dispensary menus and kiosks [59] |

---

## 6. Gaps and pain points

Each point below is backed by evidence:

1. **Legal risk.** Raids continue, and no court has endorsed the club model [3][5].
2. **Quality.** Qure Laboratories identifies microbial contamination as the main problem and says faked test results go unpunished. A South African study found 37% of 279 samples failed limits for leftover solvents [60].
3. **Edibles safety.** Children have been hospitalised, including a reported 9-year-old who ate 2,000 mg of gummies (September 2026). Packs look like sweets and there is no labelling standard [61].
4. **Payment friction.** Card fees, prepay-only models and risky EFT transfers to unknown sellers [17][46].
5. **Weak loyalty.** A flat 5% back, or paid memberships of R30–250 a month that usually work at only one venue [8][11][17].
6. **Thin omnichannel.** Of the players reviewed, only one offers live delivery tracking. Most rely on WhatsApp and Instagram menus.
7. **Weak trust signals.** Ratings are uniformly near-perfect. For example, House of Tiger shows 5.0 from 223 Google reviews [62].
8. **Crowding.** There are about 8,500 stores and 2,500 clubs [33]. The "coffee shop" concept is already in use: Tyson's coffee shop, the café-clubs, and Little Amsterdam Headshop, open since 2003 [22].

No South African evidence was found for stock-outs, franchise channel conflict or banks refusing cannabis businesses.

---

## 7. Ranked ideas to beat the competition

Ideas are ranked by impact relative to effort. H = high, M = medium, L = low.

| # | Feature or strategy | Beats | Impact | Effort |
|---|---|---|---|---|
| 1 | One free membership valid across the network: a 2-minute ID or passport check, with the pass saved to the phone wallet and usable in every store and online | Paid memberships tied to a single venue | H | M |
| 2 | WhatsApp ordering: product catalogue, chatbot, PayShap or card payment links and "order ready" alerts, all linked to each store's live stock | Menus kept by hand on WhatsApp | H | M |
| 3 | One live catalogue feeding the website, app, WhatsApp and in-store TV and QR menus, showing THC, terpenes, harvest date and stock | Static menus | H | M |
| 4 | A QR code on every batch linking to an independent lab certificate (potency, microbes, pesticides, solvents), plus grower and dates | Fake or missing lab results | H | M |
| 5 | Tiered "Herbal Holland Rewards" loyalty with point multipliers, birthday rewards and expiry, honoured in every store, with central settlement between franchisees | A flat 5% back | H | M |
| 6 | Payments with no surcharges: tap to pay, QR (SnapScan/Zapper), PayShap payment requests, instant EFT and cash | Cash-first sellers and card fees | H | M |
| 7 | Click & collect ready in 15 minutes, with an ID check at handover | Walk-in-only venues | H | L |
| 8 | A compliance engine: member register, purchase allocation caps, age checks, audit trail, prices shown only after login, and rules that switch over when licensing arrives | Improvised grey-zone operation | H | M |
| 9 | Fair online-order routing for franchisees: send each order to the nearest store with stock, credit it to the pickup or delivery-zone store, and support stock transfers and franchisee dashboards | Channel conflict between franchisees | H | H |
| 10 | Automated WhatsApp, SMS and email messages: welcome, a restock reminder around day 21, win-back offers, and new-drop alerts for a favourite terpene | No customer relationship tools | H | M |
| 11 | A two-sided referral reward (for example R50 each), capped and limited to verified adults | None seen | M–H | L |
| 12 | An edibles safety standard: child-resistant packs, 5–10 mg per unit and bold labels | Packs that look like sweets | H | L–M |
| 13 | A "Mzansi Landrace × Dutch Classics" range with grower stories and Pondoland partnerships | Light use of heritage | H | M–H |
| 14 | An education hub built for search: strain library, dosing guide, plain-language law explainer and multilingual tourist guides, plus budtender certification | Thin content | M–H | L–M |
| 15 | Same-day metro delivery with GPS tracking and an ID check at the door, plus national courier in 1–3 days | Taste of Cannabis, Springbok Society | H | H |
| 16 | A tourist mode: day pass, passport check, foreign card payments, and menus in English, Dutch and German | Improvised day passes | M | L–M |
| 17 | Events with ticketing: tastings ("proeverij"), King's Day, Heritage Day, 4/20 | One-off events | M | L |
| 18 | Reviews per product and per batch, from verified buyers only | Directories full of perfect scores | M | L |
| 19 | Stock-out prevention: demand forecasts, automatic reordering, suggested transfers between stores, and markdowns based on harvest date | n/f | M–H | M |
| 20 | An AI budtender that recommends products by effect, terpene and tolerance | None seen | M | M–H |
| 21 | A "Stash Box" subscription | None seen | M | M |
| 22 | Paid brand placements on menus, screens and broadcasts | None seen | M | M |

**Suggested build order**

- Build ideas 1–8 first; they form the core platform.
- Add idea 9 before a second franchisee starts selling online.
- Ideas 13 and 15 are the longer-term advantages.

---

## 8. Caveats

- Reddit could not be reached with the research tools, and Hellopeter had no substantive reviews of cannabis retailers.
- Many figures are operators' own claims or come from directory sites built for search traffic. For example, cityofcapetown.info is not the City of Cape Town municipality.
- Check CIPC trademarks for any clash with "Holland" or windmill marks before launch.

---

## 9. Sources

### Legal and regulatory

1. CfPPA text: [lawlibrary.org.za](https://lawlibrary.org.za/akn/za/act/2024/7/eng@2024-06-03)
2. Draft CfPPA regulations (2 Feb 2026): [gov.za](https://www.gov.za/documents/notices/cannabis-private-purposes-act-regulations-comments-invited-02-feb-2026)
3. Haze Club judgment: [SAFLII](https://www.saflii.org/za/cases/ZAWCHC/2022/269.html). Mayet & Associates (Jun 2026): [mayet.law](https://mayet.law/south-africas-cannabis-and-hemp-laws-in-2026-a-compliance-guide-for-business/)
4. BusinessTech (25 Aug 2026): [businesstech.co.za](https://businesstech.co.za/news/business-opinion/871879/south-africa-has-missed-the-r30-billion-bus/)
5. IOL (20 Mar 2026): [iol.co.za](https://iol.co.za/mercury/news/2026-03-20-saps-raid-4-durban-shops-business-owner-arrested-r13m-worth-of-cannabis-seized/)
6. Business Report (1 Dec 2025): [iol.co.za](https://iol.co.za/business-report/companies/2025-12-01-sa-paves-way-for-legal-hemp-production-with-new-plant-improvement-act/)

### Competitors

7. BudBox: [budboxjhb.co.za](https://www.budboxjhb.co.za/). Sunday World: [sundayworld.co.za](https://sundayworld.co.za/lifestyle/the-cannabis-expo-2026-announces-budbox-as-presenting-partner/)
8. Taste of Cannabis, 60-minute delivery (8 Jun 2026): [tasteofcannabis.co.za](https://tasteofcannabis.co.za/60-minute-cannabis-delivery-south-africa/)
9. Taste of Cannabis: [home](https://tasteofcannabis.co.za/) · [visitors' guide](https://tasteofcannabis.co.za/cannabis-south-africa-visitors-guide/)
10. Seknd Nature: [sekndnature.com](https://sekndnature.com/). Zootly review: [zootly.co.za](https://zootly.co.za/seknd-nature-bree-street-more-than-a-dispensary-its-a-scene/)
11. Nirvana: [nirvanacapetown.com](https://www.nirvanacapetown.com/join-the-club)
12. PureGro: [puregro.co.za](https://www.puregro.co.za/)
13. The 420 Doctor: [the420.doctor](https://the420.doctor/locations/)
14. Cannibisters, Cape Town Magazine (2024): [cannabis club](https://www.capetownmagazine.com/cannabis-club) · [cannabis guide](https://www.capetownmagazine.com/cannabis)
15. Cannabuben directory (May 2026): [cannabuben.co.za](https://cannabuben.co.za/guides/alternatives-to-happy420-sa-cannabis-clubs)
16. DANK: [cannadank.co.za](https://cannadank.co.za/store-locator/)
17. High Five Johannesburg guide (2026): [highfivevibe.co.za](https://highfivevibe.co.za/pages/best-places-to-buy-cannabis-in-johannesburg)
18. Tyson 2.0 SA: [GlobeNewswire](https://www.globenewswire.com/news-release/2025/01/29/3017272/0/en/TYSON-2-0-and-Carma-HoldCo-Expand-Global-Presence-with-Launch-in-South-Africa.html) · [tysonsa.co.za](https://tysonsa.co.za/)
19. Springbok Society: [springboksociety.co.za](https://springboksociety.co.za/)
20. Happy420 Africa: [happy420africa.com](https://happy420africa.com/)
21. AmazolSA: [amazolsa.com](https://amazolsa.com/shop/)
22. Zootly: [home](https://zootly.co.za/) · [dispensaries](https://zootly.co.za/dispensaries/)
23. Cape Town directory (third-party site, Jul 2025): [cityofcapetown.info](https://www.cityofcapetown.info/cannabis)
24. MedLeaf: [medleaf.co.za](https://www.medleaf.co.za/)
25. CannAfrica sale: [Moneyweb SENS](https://www.moneyweb.co.za/mny_sens/labat-africa-limited-correction-announcement-to-the-disposal-of-cannafrica-released-on-4-december-2025/) · [TradingView](https://www.tradingview.com/news/reuters.com,2025:newsml_TUC3TQTRW:0-labat-africa-disposes-cannafrica-to-africa-ntsha-trading-solution/) · [cannafrica.co.za](https://cannafrica.co.za/)
26. The Green Side: [Rekord](https://www.citizen.co.za/rekord/news-headlines/local-news/2022/12/02/canna-trade-africa-wholesale-distribution/) · [Hello Lifestyle](https://hellolifestyle.co.za/your-local-farmacy-and-cannaporium-the-green-side/)
27. Modern Medicine Cartel: [modern-medicine.co.za](https://www.modern-medicine.co.za/)
28. Hemporium: [crushmag-online.com](https://crushmag-online.com/cbd-oils-edibles-in-cape-town/)
29. Clicks: [Wikipedia](https://en.wikipedia.org/wiki/Clicks_(South_Africa)) · [Clicks CBD oil](https://clicks.co.za/clicks_cbd-oil-100-mg-10ml/p/332680)
30. Dis-Chem and the CBD dose rule: [dischem.co.za](https://www.dischem.co.za/shop-by-department/brands/c/cbd) · [cannabuddy.co.za](https://cannabuddy.co.za/cbd-oil-dischem/) · [News24](https://www.news24.com/news24/bi-archive/you-can-now-buy-cbd-oil-derived-from-dagga-from-clicks-and-dischem-starting-at-r295-2019-10)
31. 420.camp (30 Aug 2026): [420.camp](https://420.camp/weed/south-africa)
32. Cannabis Law Report (Jan 2026): [cannabislaw.report](https://cannabislaw.report/cannabiz-africa-says-over-2000-cannabis-clubs-may-be-operating-under-the-radar-in-south-africa-jan-2026/)

### Market size and consumer behaviour

33. Business of Cannabis (21 Apr 2026): [businessofcannabis.com](https://businessofcannabis.com/eight-years-after-decriminalisation-south-africas-cannabis-industry-edges-towards-regulated-market/)
34. Sowetan / BusinessDay (8 Mar 2026): [sowetan.co.za](https://www.sowetan.co.za/news/2026-03-08-cannabis-industry-overhaul-under-way-to-unlock-multibillion-rand-sector/)
35. Euromonitor (21 Jul 2025): [euromonitor.com](https://www.euromonitor.com/article/south-africas-cannabis-market-building-momentum-despite-regulatory-inaction)
36. Statista: [statista.com](https://www.statista.com/outlook/hmo/cannabis/south-africa/)
37. Prohibition Partners (2019): [report](https://prohibitionpartners.com/reports/the-african-cannabis-report/) · [Farmer's Weekly](https://www.farmersweekly.co.za/agri-business/agribusinesses/sas-cannabis-industry-a-potential-powerhouse/)
38. Hypertext (9 Sep 2025): [htxt.co.za](https://htxt.co.za/2025/09/dtic-working-on-policies-to-make-sa-a-global-leader-in-cannabis-industry/)
39. Changes Rehab (undated): [changesrehab.co.za](https://changesrehab.co.za/weed-in-south-africa-5-interesting-facts/)
40. Happy420 guide (Aug 2025): [happy420africa.com](https://happy420africa.com/blogs/news/weed-dispensaries-in-south-africa-guide)
41. GroundUp (Aug 2023): [groundup.org.za](https://groundup.org.za/article/we-bought-dagga-but-it-was-probably-illegal---heres-why/)
42. SARB Payments Study 2023, via Moonstone: [moonstone.co.za](https://www.moonstone.co.za/are-south-africans-ready-for-the-digital-payment-revolution/)
43. PayShap milestone (Jun 2026): [mosaic.co.za](https://mosaic.co.za/adviser/2026/06/payshap-passes-one-billion-transactions-now-topping-60-million-a-month-019ef8f7/)
44. World Wide Worx: [Peach Payments summary](https://www.peachpayments.com/scale/world-wide-worx-2025-online-retail-report/) · [2026 forecast](https://www.worldwideworx.com/onlineretailsa2026/)
45. WhatsApp penetration (Yazi): [askyazi.com](https://www.askyazi.com/articles/whatsapp-penetration-across-africa-statistics-by-country)
46. Vape Store, "Cannabis fraud": [vapestore.co.za](https://vapestore.co.za/vape-store-blog/cannabis-fraud)
47. Tourism: [Daily Maverick](https://www.dailymaverick.co.za/article/2022-06-05-cashing-in-on-the-high-end-of-budding-cannabis-tourism/) · [Cheeba Africa](https://cheebaafrica.com/pages/cheeba-adventures-cape-town) · [Tripadvisor](https://www.tripadvisor.com/Attraction_Review-g1722390-d33366069-Reviews-Cape_Town_Cannabis_Journeys-Cape_Town_Western_Cape.html)

### Heritage and growers

48. Landrace strains: [Verilife](https://www.verilife.com/learn/african-landrace-strains) · [Goldleaf](https://shopgoldleaf.com/blogs/newsfeed/the-history-of-durban-poison-and-landrace-strains) · [CannaBuddy](https://cannabuddy.co.za/rooibaard/) · [ECSECC paper](https://www.ecsecc.org/documentrepository/informationcentre/cannabis-in-the-eastern-cape-paper-web_76550.pdf)
49. Pondoland growers: [IDPC / GroundUp](https://idpc.net/news/2024/08/south-africa-mpondoland-cannabis-growers-left-out-to-dry) · [GroundUp](https://groundup.org.za/article/small-scale-cannabis-growers-say-legalisation-killing-demand/)
50. TimesLive (25 Sep 2026): [timeslive.co.za](https://www.timeslive.co.za/news/business/2026-09-25-unlocking-the-r36bn-rural-cannabis-sector-state-seeks-to-formalise-growers/)

### Marketing and technology

51. Ad policies: [Meta](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/drugs-pharmaceuticals/) · [Google](https://support.google.com/adspolicy/answer/6014299?hl=en) · [Contentbase](https://contentbase.com/blog/cbd-advertising-meta-google/)
52. Daily Maverick (31 May 2026): [dailymaverick.co.za](https://www.dailymaverick.co.za/article/2026-05-31-sas-annual-cannabis-expo-reflects-a-budding-industry-in-a-somewhat-muddled-landscape/)
53. Dutchie: [dutchie.com](https://dutchie.com/business/post/dutchie-launches-e-commerce-pro-and-certified-partner-program)
54. Flowhub: [flowhub.com](https://www.flowhub.com/product)
55. Treez: [product updates](https://support.treez.io/en/articles/11327037-treez-product-updates-2025) · [treez.io](https://www.treez.io/sell-better)
56. Cova: [covasoftware.com](https://www.covasoftware.com/blog/top-5-dispensary-pos-systems-in-2026-pros-cons) · [Meadow](https://getmeadow.com/blog/cova-vs-flowhub)
57. Alpine IQ: [Heady](https://useheady.com/blog/alpine-iq-flows-explained) · [Alpine IQ support](https://support.alpineiq.com/loyalty-settings-and-reporting)
58. Springbig: [springbig.com](https://springbig.com/) · [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1801602/000101376225001015/ea023518201ex99-1_springbig.htm)
59. Jane: [iheartjane.com](https://www.iheartjane.com/media) · [CB Insights](https://www.cbinsights.com/company/jane-technologies)

### Quality, safety and reviews

60. Quality: [Unicorn Riot](https://unicornriot.ninja/2025/south-africas-new-marijuana-laws/) · [PMC study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9004195/)
61. Edibles: [SAMRC](https://www.samrc.ac.za/news/edible-cannabis-ban-south-africa-something-chew) · [TimesLive](https://www.timeslive.co.za/opinion/2026-09-25-lael-bethlehem-lack-of-clear-cannabis-rules-puts-children-at-risk/) · [Briefly](https://briefly.co.za/people/253652-doctor-weighs-child-psychosis-eating-gummy-sweets/)
62. House of Tiger reviews: [Wanderlog](https://wanderlog.com/place/details/17668929/house-of-tiger--private-members-club-premium-cannabis--tourist-friendly-cannabis--best-cannabis-shop-in-cape-town)
63. Psymedia (Dec 2025): [psymedia.co.za](https://psymedia.co.za/cape-town-cannabis-clubs/)
64. Weed Lovers Market: [weedloversmarket.shop](https://www.weedloversmarket.shop/fourways-menu)
