# South Africa Compliance Research: Herbal Holland Platform

> **Research date:** 27 September 2026
> **Status:** Research, not legal advice. Items marked **[verify]** need confirmation by South African counsel before go-live.
> **Scope:** Retail POS, national e-commerce (click & collect and delivery), and consumer loyalty app for a franchise-style cannabis brand. Each store has a separate owner.

## Contents

- [How this was researched](#how-this-was-researched)
- [Bottom line](#bottom-line)
- [1. Legal status of cannabis](#1-legal-status-of-cannabis)
- [2. What can be sold commercially today](#2-what-can-be-sold-commercially-today)
- [3. Age limits and ID verification](#3-age-limits-and-id-verification)
- [4. Advertising and marketing](#4-advertising-and-marketing)
- [5. Direct marketing](#5-direct-marketing)
- [6. Tax](#6-tax)
- [7. Delivery and couriers](#7-delivery-and-couriers)
- [8. Franchise law](#8-franchise-law)
- [9. Data (POPIA)](#9-data-popia)
- [Top 12 compliance rules to encode](#top-12-compliance-rules-to-encode-in-priority-order)
- [Update: client statement on legality (27 Sep 2026)](#update-client-statement-on-legality-27-sep-2026)

---

## How this was researched

Where they could be reached, the primary texts were read directly:

- the Cannabis for Private Purposes Act (CfPPA) and the Tobacco Bill B33-2022
- the Information Regulator's Direct Marketing Guidance Note and its 21 Apr 2026 statement
- the SARS tax invoice checklist
- ARB Code Sections II and III, version 2026-04-07

SAHPRA's website returned HTTP 503 for the whole session, so the CBD scheduling detail comes from law-firm analyses. The web-search quota also ran out near the end of the research, so the final checks were made by fetching specific official and news pages.

## Bottom line

**Selling THC cannabis commercially is still unlawful.** The CfPPA has not commenced, its quantity regulations are still in draft, and a Cannabis Bill is not expected before mid-2027.

**What can be sold legally today is narrow:**

- Schedule 0 CBD within strict limits
- hemp products that are not consumed
- accessories and apparel

Each of these has caveats, covered in section 2.

**The heaviest software obligations right now are:**

- consent-based electronic marketing (POPIA s69)
- the new NCC opt-out registry (CPA regulations of 15 Apr 2026)
- 18+ gating on every channel
- VAT and invoicing per franchisee entity
- no enforcement of minimum retail prices

---

## 1. Legal status of cannabis

### The Act itself

- The Cannabis for Private Purposes Act (CfPPA, Act 7 of 2024) was assented to on 28 May 2024 and gazetted on 3 Jun 2024 (GG 50744).
- **Commencement:** s8 says it starts on a date the President proclaims. gov.za still lists commencement as "to be proclaimed".
- **Key definitions:**
  - "Adult person" means 18 or older.
  - "Cannabis" means flowering or fruiting tops and products made from them. It excludes seeds, seedlings, stalks, leaves and branches without flower, and roots.
  - "Deal in" covers selling, offering for sale, **"advertise for sale"**, and "any other conduct to facilitate selling cannabis". Activity authorised by a permit or licence under other national legislation is excluded.
- **Offences:**
  - Dealing carries up to 10 years (s4(1)).
  - Adults may share cannabis in private only "without the exchange of consideration" (s2(1)(b)).
  - Supplying a child with cannabis or a cannabis product is an offence (s3(2), s4(7)).

### Draft regulations (GN 7067, 2 Feb 2026)

- Proposed limits: 750 g per adult per day, in private or in public, and a maximum of 5 plants.
- They also set concealment rules for transport and an expungement process.
- Comments closed on 5 Mar 2026. Quantity regulations must be approved by Parliament before publication (s6(2)(b)).
- The Minister had targeted finalisation by 31 Mar 2026. They were still in draft on 6 Sep 2026.

### Current position until commencement

- Cannabis stays listed under the Drugs and Drug Trafficking Act, subject to the 2018 *Prince* judgment's carve-out for private use.
- A SAPS directive of 23 Aug 2023 stopped arrests for private use, possession and cultivation. It does not cover dealing.

### Commercial framework

- The Minister's written parliamentary reply NW2421 (6 Jun 2025) said "the trade in cannabis is still outlawed".
- The dtic Hemp & Cannabis Commercialisation Policy was due at Cabinet by Apr 2026. No Cabinet approval had been reported by 26 Aug 2026.
- The Cannabis Bill is expected in Parliament "by mid-2027". This was stated by the Portfolio Committee on 6 Mar 2026 and repeated in reporting on 25 Sep 2026.

### Clubs and dispensaries

- In *Haze Club* (Western Cape High Court, 29 Aug 2022), the court held the grow-club model amounts to dealing.
- The appeal to the Supreme Court of Appeal was withdrawn after a confidential settlement, so the High Court ruling stands. The source for the settlement is an advocacy group **[verify]**.
- On 11 Jun 2025 SAHPRA said that cultivation and export licences displayed in mall "dispensaries" "do not authorise the operation of retail cannabis dispensaries".
- SAPS continued raiding illicit grow operations in Aug–Sep 2026.
- An analyst estimates about 8,500 stores and 2,500 clubs trade regardless. This is an estimate, not an official figure.

**Implication:** Hard-block THC-cannabis SKUs and any "membership", "donation" or "grow-on-behalf" billing tied to cannabis. Model each product's legal basis so that a future licensing regime can be switched on per store later.

**Sources:**

- [Act PDF](https://www.parliament.gov.za/storage/app/media/Acts/2024/Act_7_of_2024_Cannabis_for_Private_Purposes_Act.pdf)
- [gov.za Act page](https://www.gov.za/documents/acts/cannabis-private-purposes-act-7-2024-english-sepedi-03-jun-2024)
- [Draft regulations notice](https://www.gov.za/documents/notices/cannabis-private-purposes-act-regulations-comments-invited-02-feb-2026)
- [IOL, 6 Feb 2026](https://iol.co.za/mercury/news/2026-02-06-sa-draft-cannabis-rules-750g-possession-and-5-plant-limits-explained/)
- [BusinessTech, 6 Sep 2026](https://businesstech.co.za/news/government/872389/new-cannabis-laws-in-south-africa-youre-allowed-to-have-up-to-1500-joints/)
- [BusinessTech, Jul 2025](https://businesstech.co.za/news/government/831021/new-laws-for-cannabis-in-south-africa-are-coming/)
- [Parliament, 6 Mar 2026](https://www.parliament.gov.za/press-releases/media-statement-committee-trade-calls-regulation-while-noting-progress-towards-cannabis-bill)
- [PMG NW2421](https://pmg.org.za/committee-question/30264/)
- [BusinessDay, 26 Aug 2026](https://www.businessday.co.za/opinion/2026-08-26-charl-botha-r14bn-10-growth-and-still-no-way-in/)
- [TimesLive, 25 Sep 2026](https://www.timeslive.co.za/news/business/2026-09-25-unlocking-the-r36bn-rural-cannabis-sector-state-seeks-to-formalise-growers/)
- [SAHRC on the SAPS moratorium](https://www.sahrc.org.za/index.php/sahrc-media/news-2/item/4221-media-statement-south-african-human-rights-commission-reminds-law-enforcement-to-adhere-to-the-moratorium-on-cannabis-related-arrests)
- [Haze Club judgment](https://www.saflii.org/za/cases/ZAWCHC/2022/269.html)
- [Haze Club settlement](https://fieldsofgreenforall.org.za/the-haze-club-settled/)
- [SAHPRA warning, Health-e](https://health-e.org.za/2025/06/13/sahpra-warns-of-fake-licences-and-hidden-health-dangers-in-cannabis-infused-products/)
- [Business of Cannabis, Apr 2026](https://businessofcannabis.com/eight-years-after-decriminalisation-south-africas-cannabis-industry-edges-towards-regulated-market/)
- [SAPS raids, Aug–Sep 2026](https://cannabislaw.report/south-africa-jamaicans-and-malawians-arrested-in-southern-gauteng-as-saps-bust-two-illicit-hydroponic-cannabis-grow-ops/)

---

## 2. What can be sold commercially today

### CBD

Under the Medicines Act schedules (GN 586 of 22 May 2020), CBD is Schedule 4. It becomes **Schedule 0** in two cases:

- (a) A complementary medicine with **≤600 mg CBD per sales pack** and a **maximum daily dose of 20 mg**, making only "general health enhancement, health maintenance or relief of minor symptoms" (low-risk) claims.
- (b) A processed ingestible product made from cannabis raw plant material with **≤0.0075% CBD**, containing only naturally occurring cannabinoids.

THC is Schedule 6, with these exceptions:

- industrial raw material or products not for human or animal consumption with ≤0.2% THC
- processed products with ≤0.001% THC

The 2019 time-limited exemption was replaced by these schedule entries. A Jan 2026 law-firm guide treats these rules as current. Because SAHPRA's site was down, a 2025–26 amendment could not be ruled out **[verify]**.

### Hemp

- The Plant Improvement Act 2018 commenced on 1 Dec 2025.
- "Hemp" now means leaves and flowering heads with **≤2% THC** (previously 0.2%).
- Hemp needs Department of Agriculture permits (about 2,031 issued).
- **Caution:** no alignment of the Medicines Act THC thresholds above was found. Hemp or "CBD flower" sold for smoking, and hemp consumables above 0.001% THC, remain high-risk.

### Medical cannabis

- Available only through SAHPRA s22C(1)(b) licensees, mostly for export, and through Section 21 patient-specific authorisations that doctors apply for.
- A retail franchise cannot dispense it.

### Edibles and food

- The Department of Health's 7 Mar 2025 foodstuffs notice (GG 52227) banned cannabis and hemp in food, including hemp seed oil and flour. It was withdrawn around 26 Mar 2025 for consultation.
- No replacement was found as of this research.
- THC edibles are illegal. CBD foods must still meet the Schedule 0 thresholds.

### Vapes

- CBD e-liquid is subject to excise duty under the tariff line "vaping liquid, whether or not containing nicotine". The rate is R3.29/ml (up from R3.18), announced 30 Apr 2026.
- The Tobacco Products and Electronic Delivery Systems Control Bill (B33-2022) has been in clause-by-clause deliberation since 12 Aug 2026. As introduced, it covers **non-nicotine** devices.
- It also defines "related product" to include **pipes, water-pipes and rolling papers**. For those products it would impose:
  - a display ban
  - a ban on advertising and promotion, including **loyalty rewards** and targeted SMS/email
  - no sales to under-18s
  - **no sales by internet, courier or post** (clauses 3 and 9)

### Seeds

The CfPPA excludes seeds from its definition of "cannabis", but the Act is not in force. The current position is unclear **[verify]**.

### Accessories and apparel

- No South African offence that specifically targets selling grinders, papers or pipes was found. That is an absence of evidence **[verify]**.
- The main risks are the Tobacco Bill and platform advertising policies.
- Apparel is unrestricted, subject to the ARB's rule against content that condones illegal activity.

**Implication:** Each SKU in the product master should record:

- legal basis
- CBD mg per pack and mg per dose
- CBD %, THC %
- claim class
- a lab certificate (COA) per batch
- excise status
- a "Tobacco-Bill related product" flag

Block anything outside the thresholds.

**Sources:**

- [Werksmans](https://werksmans.com/relaxing-cannabis/)
- [Bizcommunity](https://www.bizcommunity.com/Article/196/717/204780.html)
- [Mayet, Jan 2026](https://mayet.law/legal-compliance-framework-for-reselling-cannabis-products-in-south-africa/)
- [Mayet, Jun 2026](https://mayet.law/south-africas-cannabis-and-hemp-laws-in-2026-a-compliance-guide-for-business/)
- [SAnews on the Plant Improvement Act](https://www.sanews.gov.za/south-africa/new-plant-improvement-act-comes-effect)
- [Daily Maverick, 26 Mar 2025](https://www.dailymaverick.co.za/article/2025-03-26-government-u-turn-on-cannabis-products-ban-seller-and-user-fears-allayed/)
- [SAMRC](https://www.samrc.ac.za/news/edible-cannabis-ban-south-africa-something-chew)
- [Freight News, 5 May 2026](https://www.freightnews.co.za/article/vaping-liquid-whether-or-not-containing-nicotine-excise-duty-increase)
- [Tobacco Bill text](https://www.parliament.gov.za/storage/app/media/Bills/2022/B33_2022_Tobacco_Products_and_Electronic_Delivery_Systems_Control_Bill/B33_2022_Tobacco_Products_and_Electronic_Delivery_Systems_Control_Bill.pdf)
- [Parliament, 12 Aug 2026](https://www.parliament.gov.za/press-releases/media-statement-health-committee-welcomes-broad-consensus-tobacco-products-and-electronic-delivery-systems-control-bill)

---

## 3. Age limits and ID verification

### The age line is 18

- The CfPPA defines an adult as 18 or older.
- Supplying a child with cannabis or "a product containing cannabis" is an offence.
- Tobacco Bill clause 9(1) bans sales to under-18s.
- Schedule 0 CBD has no statutory age minimum. Set 18+ as company policy.

### SA ID number: 13 digits, YYMMDD SSSS C A Z

| Part | Meaning |
|---|---|
| YYMMDD | Date of birth. The century has to be inferred. |
| SSSS | 0000–4999 for females, 5000–9999 for males |
| C | 0 = citizen, 1 = permanent resident, 2 = refugee |
| A | 8 or 9. Formerly a racial identifier, now random. |
| Z | Luhn check digit |

Documents in use: the Smart ID card (since 2013) and the green ID book, which is being phased out. Foreign nationals use passports or permits.

### Home Affairs verification

- Home Affairs' upgraded population-register verification service opened to private companies on 1 Jul 2025.
- Cost: R10 per real-time check, or R1 per field for off-peak batch checks.

**Implication:** Checking the checksum and date format proves nothing about the person. For restricted categories:

- verify identity live when the account is created
- store the result and date of birth, not document images
- re-check ID at the POS and at every delivery handover
- support a passport route for foreign nationals

**Sources:**

- [Wikipedia: South African identity card](https://en.wikipedia.org/wiki/South_African_identity_card)
- [SAnews on Home Affairs verification](https://www.sanews.gov.za/south-africa/home-affairs-rolls-out-upgraded-national-population-register-1-july)

---

## 4. Advertising and marketing

### Statutory limits

- Because the CfPPA's "deal in" includes "advertise for sale", advertising THC products counts as dealing. Under the Drugs Act, dealing is already an offence today.
- Medicines Act s20 bars false or misleading medicine advertising. Schedule 0 CBD is limited to low-risk claims. *[s20 detail not re-verified in this pass]*

### ARB Code (Sections II and III, version 2026-04-07)

- Clause 3.3: no content that "lend[s] support to criminal or illegal activities" or condones them.
- Clause 4.1: hold independent documentary evidence for claims *before* publication.
- Clause 4.2.1: no misleading claims.
- Clause 10: testimonials must be genuine, with signed and dated copies kept.
- Clause 12.4: social media is governed by Appendix K.
- Clause 5.3.2: a single price reduction may be advertised for at most 3 months.
- Clause 19.4: VAT Act ss64–65 apply to pricing.
- Section III clause 7.2: franchise-recruitment ads must name a senior executive and give the full company name and street address.
- There is no cannabis appendix. There is a Vapour Products appendix (Feb 2026).

### Platform policies

| Platform | THC / cannabis | CBD | Hemp | Paraphernalia |
|---|---|---|---|---|
| Meta | Banned | US only, with LegitScript certification and written authorisation | Canada, Mexico and US only | Banned (bongs, papers, vaporisers) |
| Google | Banned (recreational drugs) | Certified advertisers only, targeting California, Colorado and Puerto Rico | No separate hemp allowance found | Banned (pipes, bongs) |
| TikTok | Banned | Topical CBD cosmetics "may be allowed in some markets", via a sales rep only | Ingestible hemp not allowed | Not addressed on the ads policy page reviewed |

**Implication:** Build an approved-claims library, automated screening of ad and landing-page copy, and an approval workflow that stores substantiation documents. Assume no paid product ads on Meta, Google or TikTok in SA. Owned channels are therefore key, and those fall under the direct-marketing rules in section 5.

**Sources:**

- [ARB Section II](https://www.arb.org.za/code-file-downloads/Section_II_General_Principles-v2026-04-07.pdf)
- [ARB Section III](https://www.arb.org.za/code-file-downloads/Section_III_Specific_Categories_of_advertising-v2026-04-07.pdf)
- [ARB Codes index](https://www.arb.org.za/The_Codes/)
- [Meta policy](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/drugs-pharmaceuticals/)
- [Google recreational drugs policy](https://support.google.com/adspolicy/answer/16489299)
- [Google CBD policy](https://support.google.com/adspolicy/answer/15595718)
- [TikTok policy](https://ads.tiktok.com/help/article/tiktok-ads-policy-healthcare-pharmaceuticals)

---

## 5. Direct marketing

### POPIA s69: electronic marketing is prohibited unless one of two conditions is met

- **Consent.** A non-customer who has not previously refused may be approached **once only**, to request consent.
- **Existing customer ("soft opt-in").** All of these must hold:
  - the contact details were obtained in the context of a *sale*
  - you are marketing your *own similar* products
  - the person had a free opportunity to object when the details were collected, and has one in every message

Every message must identify the sender and give an address for opting out (s69(4)).

### Information Regulator Guidance Note (3 Dec 2024)

- It treats **push notifications, Instagram/LinkedIn direct messages, cookies and phone calls** as electronic communications.
- The first message to a non-customer must be the consent request. Silence is not consent.
- You must keep a database of people who refused or objected.
- Its own loyalty-scheme example: passing loyalty data to other group companies for their marketing requires **written consent**.

### POPIA regulations amended, in force 17 Apr 2025

- Consent can use Form 4 or a "substantially similar" form.
- It can be collected through any reasonably accessible channel. Phone consent must be recorded.
- Pre-ticked boxes do not count (per law-firm summaries).

### CPA contact windows (Regulation 4)

- No direct marketing to consumers at home on Sundays or public holidays.
- Saturdays: only between 09:00 and 13:00.
- Other days: only between 08:00 and 20:00.
- The exception is where the consumer agreed otherwise.

### CPA Amendment Regulations 2026 (GN R.7380, GG 54521, 15 Apr 2026, effective immediately)

- Every direct marketer must **register with the NCC opt-out registry** (Annexure P) and renew annually.
- Databases must be **cleansed monthly** against consumers' pre-emptive blocks.
- Every message must show the marketer's name, email address, physical address and phone number.
- Reported fees: R2,574 to register, R1,930.50 to renew, 12c per record cleansed.
- Penalty: up to R1m or 10% of turnover, whichever is greater.
- Registration started in July 2026. On 15 Sep 2026 the launch date was "expected in the coming weeks".

### Information Regulator statement, 21 Apr 2026

- POPIA consent is still required for people who are *not* on the registry.
- In the Regulator's words, "by merely opting-out, a data subject cannot be regarded as having given consent."

**Implication:** Build:

- a consent ledger by channel and by responsible party (franchisor vs each franchisee)
- suppression across the registry and internal lists
- send-time windows
- a mandatory sender footer

**Sources:**

- [Guidance Note (PDF)](https://inforegulator.org.za/wp-content/uploads/2020/07/GUIDANCE-NOTE-ON-DIRECT-MARKETING-IN-TERMS-OF-THE-PROTECTION-OF-PERSONAL-INFORMATION-ACT-4-OF-2013-POPIA.pdf)
- [Information Regulator statement, 21 Apr 2026](https://inforegulator.org.za/wp-content/uploads/2026/04/MEDIA-STATEMENT-REGULATOR-NOTES-PUBLISHED-GAZETTE-OF-THE-CONSUMER-PROTECT-ACT-AMENDMENT-REGULATIONS-2026.pdf)
- [NCC](https://thencc.org.za/ncc-welcomes-regulations-to-curb-spam-calls/)
- [Werksmans on the 2026 CPA regulations](https://werksmans.com/do-not-call-me-ill-call-you-south-africas-2026-cpa-amendment-regulations-operationalising-the-national-opt%E2%80%91out-regime-for-direct-marketing-and-shifting-day/)
- [Deneys Reitz](https://www.deneys.co.za/thinking/new-cpa-direct-marketing-rules-your-business-ready-opt-out-registry)
- [IOL, 15 Sep 2026](https://iol.co.za/business/2026-09-15-spam-callers-face-r1-million-penalty-as-south-africa-launches-new-registry/)
- [Baker McKenzie on the POPIA regulations](https://connectontech.bakermckenzie.com/south-africa-amendments-to-the-popia-regulations-key-changes-you-need-to-know/)
- [De Rebus on CPA contact times](https://www.derebus.org.za/consumer-protection-act-direct-marketing/)

---

## 6. Tax

### VAT rate is 15%

- The 12 Mar 2025 Budget proposed +0.5 percentage points from 1 May 2025.
- A Western Cape High Court order by agreement on 27 Apr 2025 suspended it, and it was abandoned.
- The 25 Feb 2026 Budget left VAT at 15%.
- On 5 Mar 2026 the Western Cape High Court declared **VAT Act s7(4)** invalid. That is the Minister's power to change the rate by Budget announcement. The declaration is suspended for 24 months.
- The Constitutional Court heard the confirmation case in late Aug 2026. Judgment is pending.

### Registration threshold

- Compulsory registration: **R2.3m** from 1 Apr 2026 (previously R1m).
- Voluntary registration: R120,000.
- Some small franchisee stores may therefore not be VAT-registered.

### Tax invoices (SARS checklist)

**Full tax invoice (over R5,000).** Seven items:

- the words "Tax Invoice", "VAT Invoice" or "Invoice"
- supplier name, address and VAT number
- recipient name and address, plus VAT number if the recipient is a vendor
- serial number and date
- accurate description, flagging second-hand goods
- quantity or volume
- value, VAT and total consideration

**Abridged tax invoice (over R50 and up to R5,000).** Five items:

- the words "Tax Invoice", "VAT Invoice" or "Invoice"
- supplier name, address and VAT number
- serial number and date
- description
- value, VAT and total consideration

**R50 or less:** a till slip is enough.

Invoices must be issued within 21 days. Advertised prices must include VAT (ss64–65, referenced by ARB clause 19.4).

### Excise

- No cannabis-specific excise proposal was found.
- Vaping excise is described in section 2.
- From the 2027 Budget onwards, excise changes take effect on 1 April.

**Implication:**

- VAT rates configured with effective dates
- a VAT status per store entity
- invoice templates per franchisee VAT number
- serial numbering per entity
- full buyer details captured above R5,000

**Sources:**

- [SARS tax invoices](https://www.sars.gov.za/businesses-and-employers/government/tax-invoices/)
- [SARS checklist (PDF)](https://www.sars.gov.za/wp-content/uploads/Docs/Government/Tax-Invoice-Checklist-Version-2-29032016.pdf)
- [SARS threshold FAQ](https://www.sars.gov.za/faq/what-is-the-new-threshold-for-vat-registration/)
- [SARS Budget 2026 FAQ](https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/)
- [SAnews: SARS welcomes suspension of VAT increase (Apr 2025)](https://www.sanews.gov.za/south-africa/sars-welcomes-agreement-suspend-vat-increase)
- [The Citizen, 5 Mar 2026](https://www.citizen.co.za/news/south-africa/courts/vat-act-section-declared-invalid-unconstitutional/)
- [BusinessDay, 15 Aug 2026](https://www.businessday.co.za/business-times/business/2026-08-15-court-battle-looms-over-treasurys-power-to-adjust-vat-rate/)

---

## 7. Delivery and couriers

### What is known

- THC cannabis cannot lawfully be shipped: shipping it for sale is dealing.
- According to search summaries, The Courier Guy's terms prohibit drugs and medicines (except prescription quantities) and lithium batteries. Its terms page blocked direct fetching **[verify]**.
- Aramex and PostNet restrictions come from secondary sources only.

### What could not be confirmed

- No national courier product for "age-verified adult signature" was found.
- Checking ID on delivery exists in on-demand liquor and vape delivery, where drivers check ID.
- If the Tobacco Bill is enacted as introduced, it would ban courier and online sales of vapes and "related products".

**Implication:** Build:

- a carrier allow-list by product category, with written carrier consent for CBD
- click & collect with an ID check at the store
- your own fleet or an on-demand partner that checks ID at handover, recorded in the proof of delivery

**Sources:**

- [The Courier Guy terms](https://thecourierguy.co.za/terms-conditions/)
- [Tobacco Bill clause 9(5)](https://www.parliament.gov.za/storage/app/media/Bills/2022/B33_2022_Tobacco_Products_and_Electronic_Delivery_Systems_Control_Bill/B33_2022_Tobacco_Products_and_Electronic_Delivery_Systems_Control_Bill.pdf)

---

## 8. Franchise law

### Pricing (Competition Act)

- s5(2) prohibits **minimum resale price maintenance** outright.
- A supplier may *recommend* a price if it is clearly non-binding and, where printed on the product, labelled "recommended price".
- Penalising discounters counts as resale price maintenance, including indirectly through rebates (the *Federal Mogul* case).
- Penalty: up to 10% of turnover.

### CPA franchise rules (s7 and Regulations 2–3)

- The agreement must be in writing and signed.
- It must state the franchisee's **10-business-day** right to cancel, in the prescribed wording.
- A disclosure document must be given **at least 14 days** before signing.
- Marketing-fund contributions must be kept in a **separate account** with audited or certified statements.
- Benefits the franchisor receives from suppliers must be disclosed.

**Implication:** Prices published centrally should be RRPs that each store can override. No penalties or alerts for discounting. Keep the marketing-fund ledger segregated and auditable. As a general competition-law caution **[verify]**, avoid exposing one franchisee's live prices to other franchisees.

**Sources:**

- [DML Law](https://www.dmllaw.co.za/pitfalls-recommended-retail-pricing/)
- [Polity, 2025](https://www.polity.org.za/article/legal-framework-for-franchise-agreements-2025-04-03)
- [CPA Regulations (NCC)](https://thencc.org.za/wp-content/uploads/2020/11/CPA-REGS.pdf)

---

## 9. Data (POPIA)

### Special personal information (s26)

- s26 covers health, sex life, **biometric** information and **criminal behaviour** (alleged offences). Processing it generally needs a s27 exception, usually consent.
- CBD symptom quizzes, notes on intended use, or data about THC activity could fall into these categories.

### Prior authorisation from the Regulator (s57)

- s57(1)(d): needed before sending special personal information or children's information to a foreign third party whose country lacks adequate protection.
- s57(1)(a): needed before linking **unique identifiers** (such as ID numbers) with other responsible parties' data for new purposes. This matters because each franchisee is a separate responsible party **[verify]**.

### Cross-border transfers (s72)

- Allowed only where the recipient is bound by a law, binding corporate rules or an agreement giving "substantially similar" protection, or the person consents, or another s72 ground applies.
- There is no adequacy list, and the Regulator's POPIA page lists no transfer guidance note.

### Other Regulator guidance

Information Officers (2025) and security-compromise notification (May 2025).

**Implication:**

- host in a South African cloud region, or use s72-compliant data processing agreements
- minimise and encrypt special personal information
- data-sharing agreements between franchisor and franchisees
- access control per franchisee
- a breach-notification workflow

**Sources:**

- [POPIA s26](https://popia.co.za/section-26-prohibition-on-processing-of-special-personal-information/)
- [POPIA s57](https://popia.co.za/section-57-processing-subject-to-prior-authorisation/)
- [POPIA s72](https://popia.co.za/section-72-transfers-of-personal-information-outside-republic/)
- [Information Regulator POPIA page](https://inforegulator.org.za/popia/)

---

## Top 12 compliance rules to encode (in priority order)

1. **Product legality gate.** Every SKU carries a legal-basis class. Block THC products (flower, edibles, vapes, extracts), hemp flower for consumption, and any cannabis-for-consideration model such as clubs, "donations" or grow-on-behalf.
2. **Schedule 0 CBD validator.**
   - Complementary medicine: ≤600 mg CBD per pack and ≤20 mg per day.
   - Or an ingestible processed product: ≤0.0075% CBD, naturally occurring only.
   - THC ≤0.001% in consumables.
   - A lab certificate (COA) per batch, or the item cannot be listed.
3. **Claims control.** Low-risk claims only, drawn from an approved library. Substantiation stored per ARB clause 4.1. No disease claims and no THC imagery (ARB clause 3.3, and the CfPPA's "advertise for sale").
4. **18+ gating on every channel.** Verified date of birth through live Home Affairs or vendor verification. ID re-checked at the POS and at delivery. Loyalty enrolment 18+.
5. **POPIA s69 consent engine.** Consent or soft opt-in tracked per channel and per responsible party. Consent requested once only. An opt-out in every message. Push notifications, direct messages and cookies are treated as electronic marketing.
6. **NCC registry compliance.** Register and renew annually, cleanse monthly, suppress across all channels, and show full sender identification.
7. **Send windows.** No marketing on Sundays or public holidays. Saturdays 09:00–13:00. Other days 08:00–20:00. Needs an SA public-holiday calendar.
8. **VAT and invoicing.** Effective-dated rates (15% now). VAT status per store, since non-vendors under R2.3m must be supported. Full invoices above R5,000, abridged above R50. Serial numbers per entity. VAT-inclusive prices.
9. **No minimum-price enforcement.** RRPs only, clearly labelled. Stores may override. Marketing-fund ledger segregated and auditable.
10. **Delivery rules.** Carrier allow-list by category. ID-verified handover. A switch to turn off online or courier sales and loyalty rewards for vapes and paraphernalia if the Tobacco Bill passes.
11. **Special personal information and hosting.** Classify fields and require explicit consent. Host in SA or use s72 agreements, and check s57 before any offshore transfer. Franchise data-sharing agreements. Breach workflow.
12. **Regulatory watch-list with feature flags.**
    - CfPPA commencement and final regulations
    - the Commercialisation Policy and Cannabis Bill (2027)
    - Tobacco Bill amendments
    - Department of Health cannabis-food regulations
    - the Constitutional Court judgment on VAT s7(4)
    - SAHPRA CBD scheduling, which must be re-confirmed directly with SAHPRA

Also relevant for the e-commerce site: ECTA s44 gives consumers a 7-day cooling-off right for online purchases, with exclusions (e.g. consumables). *[Not re-verified in this pass]*

---

## Update: client statement on legality (27 Sep 2026)

**Client statement:** "CBD and THC are now legal in South Africa."

**Finding:** Nothing found supports this as a statement about *commercial sale*. No commencement proclamation, final regulations, retail licensing framework, or court ruling permitting THC trade was found. As of 18 Sep 2026 the government's own position is that the CfPPA has not yet been put into operation.

**What was checked on 27 Sep 2026.** The web-search quota was exhausted, so these were targeted page fetches, not an exhaustive sweep.

- **Commencement:** the gov.za page for the Act still lists commencement as **"To be proclaimed"**.
- **Regulations:** the Justice Minister's written reply NW4480 (18 Sep 2026) says:
  - the s6(1) regulations were "published on 2 February 2026 for submission of comments" (closing 5 Mar 2026)
  - they "require approval by Parliament before publication in the Gazette"
  - "Once the Regulations have been approved by Parliament, the President will be advised to put the Act into operation…"
- **Government notices:** a gov.za site search for "cannabis" showed no proclamation, final regulations, commercialisation policy or licensing framework in Aug–Sep 2026. The latest regulatory item is the Feb 2026 draft regulations notice.
- **Commercial trade:**
  - TimesLive (25 Sep 2026) reports that commercial trade "remains largely prohibited", with the Cannabis Bill planned for Parliament by mid-2027.
  - BusinessTech's cannabis coverage includes a 24 Jun 2026 piece describing mall cannabis stores as illegal and a 25 Aug 2026 opinion piece on the stalled industry.
  - A PMG listing shows a 6 Aug 2026 Trade & Industry committee item noting "little progress" on the Cannabis Master Plan. The full minutes are paywalled.
- **Court rulings:** none found that authorise commercial THC trade. This was a limited check.

**What is true, and is the likely source of the confusion:**

- Private adult use, possession and cultivation have been decriminalised since the 2018 *Prince* judgment, and SAPS has not arrested people for these since 2023.
- Low-dose CBD has been sellable since 2020, but only within the Schedule 0 limits.
- The hemp THC limit for cultivation rose to 2% on 1 Dec 2025.

None of these makes the commercial sale of THC products legal.

**Implication:** No change to the rules above. THC sales stay blocked. Keep the feature flags for a future licensing regime.

**Sources:**

- [PMG NW4480 (18 Sep 2026)](https://pmg.org.za/committee-question/40863/)
- [gov.za Act page](https://www.gov.za/documents/acts/cannabis-private-purposes-act-7-2024-english-sepedi-03-jun-2024)
- [gov.za search](https://www.gov.za/search?search_query=cannabis)
- [TimesLive, 25 Sep 2026](https://www.timeslive.co.za/news/business/2026-09-25-unlocking-the-r36bn-rural-cannabis-sector-state-seeks-to-formalise-growers/)
- [BusinessTech cannabis tag](https://businesstech.co.za/news/tag/cannabis/)
- [PMG search](https://pmg.org.za/search/?q=cannabis)
