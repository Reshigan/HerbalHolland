# Compliance by design

How the platform encodes South African rules. Background, dates and sources:
[research/COMPLIANCE-RESEARCH.md](research/COMPLIANCE-RESEARCH.md). **This is not legal advice** — have counsel sign off
the settings below before launch and whenever the law moves.

## Legal position (as researched on 27 Sep 2026)

- Private adult use, possession and cultivation are decriminalised (*Prince*, 2018). The Cannabis for Private Purposes
  Act (2024) is **not yet in force**; draft regulations were published in February 2026; a Cannabis Bill for commercial
  trade is expected from mid-2027. On 18 Sep 2026 the Justice Minister confirmed the regulations still need Parliament.
- Commercial THC trade is therefore lawful only within **SAHPRA licensing**. Herbal Holland states it is
  SAHPRA-registered; the platform's default mode matches that: **MEDICAL**.
- Lawfully sellable today: Schedule 0 CBD within limits, hemp products (≤ 2% THC hemp; non-consumables), accessories,
  apparel, grow equipment (seeds: unclear — review).

## The compliance engine

Pure rules in `src/lib/compliance.ts`, evaluated server-side for every POS sale and online order
(`src/server/compliance.ts → evaluateBasket`). The rules are **data** (`HQ → Compliance`, stored in `Setting`), so they
change without a deploy.

| Setting | Default | Effect |
|---|---|---|
| `thcMode` | `MEDICAL` | Licensed products need an active patient authorisation with monthly headroom and an authorised dispenser. `ADULT_USE` switches to verified adults with a daily limit. |
| `licensedOnly` | `THC` | Classes sellable only at stores whose `licences` include them (per-store, with `licenceRef` printed on invoices). |
| `minAge` / `ageRestricted` | 18 / THC, CBD, HEMP, ACCESSORY, GROW | ID check required (member verified, ID sighted, or SA ID number checked); under-18s blocked even if an ID was sighted. |
| `channels` | THC: POS + click & collect only | Class × channel matrix (POS, COLLECT, SAME_DAY, COURIER). |
| `dailyLimitGrams` | 30 | ADULT_USE daily cap per customer (posted sales + open orders). |
| `tobaccoBillMode` | off | When Bill B33-2022 commences: related products (pipes, papers, vapes) become in-store only and earn no points. |

## Rule-by-rule

| Obligation | Where it's enforced |
|---|---|
| SAHPRA medical pathway: authorisation on file, monthly quantity, authorised dispenser | `PatientAuth` register (no clinical condition stored), `User.canDispense`, `checkCompliance` (`needsPrescription`), dispensing register report |
| Schedule 6 register | Reports → Compliance → dispensing register (patient, authorisation, prescriber, batch, dispenser) |
| No advertising of medicines to the public | Storefront hides licensed products unless a signed-in patient has an active authorisation (MEDICAL mode); menu boards show a "ask our pharmacist" panel instead |
| Medicines Act s18A — no bonus/rebate/incentive schemes on medicines | `incentiveExcluded()` removes licensed lines from promotions, member/volume prices, markdowns and points earn (`quote`, `postSaleTx`) |
| Members only | `membersOnly` (HQ → Compliance, on by default): every sale needs a registered member, online and at the till (walk-ins join at the till in about 20 seconds). Offline, the till takes the member number from the member's card and the server resolves it on sync; an unknown number is audited as `compliance.offline_exception`. Membership is a control (verified adults, records, recall traceability) — it doesn't make selling THC lawful; licensed products still need the SAHPRA pathway below |
| Membership terms (CPA s22 plain language, s49 notice of key terms; ECTA s43 supplier information, s44 cooling-off; POPIA) | `/legal/terms`, versioned (`TERMS_VERSION` in `src/lib/terms.ts`). The key terms are shown before acceptance on every sign-up — online join, the till's new-member sheet and the back-office enrolment — and joining is refused without acceptance. The accepted version and time are stored on the member (`Customer.termsVersion`, `termsAcceptedAt`) and in the audit log. Counsel signs off, and fills in the directors' names (ECTA s43(1)(f)), before launch |
| 18+ | Age gate online; ID checks at the till and at every handover/delivery (`Order.idChecked`); `AgeCheck` recorded per sale |
| Schedule 0 CBD (GN 586 of 2020): ≤ 600 mg per pack, ≤ 20 mg/day, low-risk claims, ≤ 0.001% THC in consumables | `validateCbdProduct()` on the product master; approved claims only on product pages |
| Advertising (ARB Code, Medicines Act s20) | `screenCopy()` lints campaign copy and product claims (medical claims, conditions, intoxication, minors, absolute claims) and blocks sends |
| POPIA s69 — consent / soft opt-in, opt-out in every message | Per-channel consent flags + `ConsentEvent` ledger; campaigns send only to consenting members; sender footer on every message — "Reply STOP" on texts, a signed one-click unsubscribe link on emails (`/unsubscribe`) |
| POPIA s69 — consent when joining in store | Till and back office can't create a member until staff ask the scripted deals question (`DEALS_QUESTION`) and record yes or no; the ledger stores the exact question asked, and email is only opted in when an email address was given. Interests (CBD, accessories, merch, grow, events — never licensed medicines) are optional, self-declared and power the "Into …" campaign audiences |
| CPA Reg 4 contact windows (no Sundays/public holidays; Sat 09–13; weekdays 08–20) | `marketingWindow()` with the SA public-holiday calendar; out-of-window sends are auto-scheduled (`nextMarketingSlot`); drop alerts wait for the next allowed slot |
| Social media (Meta, TikTok and X rules on drugs; Medicines Act s20) | HQ → Campaigns → Social: `screenSocial()` blocks THC, cannabis or CBD alongside buying, price, delivery or discount wording, and every `screenCopy` rule; pictures are brand artwork only; organic posts only (Meta rejects cannabis and CBD ads); no TikTok |
| Merch (made to order by the merch partner) | Sold as a standalone product — never given away with, or earned by, medicine purchases (s18A); designs carry the brand and heritage motifs only (no cannabis leaves, slogans or claims); returns follow the CPA/ECTA cooling-off like any online order |
| Launch programme (drops, welcome gifts, My Deals, events, quests) | Drops refuse licensed-medicine variants; gifts and My Deals run through the pricing engine, which excludes medicines from every incentive; events are 18+ with ID at the door; quest points are earned for learning, never for buying medicines |
| POPIA — objection to profiling (s11(3)) | My Deals use purchase history only for members with `personalisedOffers` on; the Rewards app lets members turn it off, and push only reaches members who subscribed (consentPush) |
| CPA 2026 opt-out registry (monthly cleansing) | `Suppression` table (NCC registry imports + refusals) checked on every send |
| POPIA minimisation, special personal information | SA ID stored as HMAC + last 4; no diagnoses; exports/anonymisation tools; access scoped by role |
| Medicines Act s18A — staff commission | Commission (`src/lib/commission.ts`) never applies to the classes `incentiveExcluded()` returns (licensed medicines in medical mode), whatever rate HQ sets; CBD follows the same rule as promotions until counsel decides otherwise |
| BCEA — commission is remuneration | The franchisee (employer) switches commission on per store and agrees it with staff in writing; the platform calculates and freezes each month for payroll (CSV) and never deducts: refunds reduce a month's commission, never below zero |
| POPIA — monitoring staff (loss prevention) | Transparent rules only (`src/lib/loss.ts`), each alert showing its evidence; an alert is never shown to or emailed to the person it's about; owners, area managers and HQ see their scope. Franchisees must tell staff in their employee privacy notice that till, cash and stock activity is monitored for loss prevention |
| POPIA s72 — banking slips stored abroad | Slips (the business's bank details, a staff name or signature) go to Cloudflare R2 in the EU jurisdiction (no South African location) — record the transfer in the POPIA register; or keep them on our own server (`UPLOAD_DIR`). Served only through the app to the store's managers, owner and HQ, every view audited |
| SARS tax invoices | Every sale emailed as an abridged tax invoice (≤ R5,000) or full tax invoice (buyer name/address/VAT captured above R5,000); serials per device; non-VAT-vendor franchisees issue plain invoices with no VAT |
| Competition Act s5(2) — no minimum resale price maintenance | RRP is a recommendation; franchisees set shelf prices; margin guardrails warn but never block |
| CPA franchise rules — marketing fund in a separate account | Levy tracked separately on statements and in HQ finance (levy collected vs campaign spend) |
| Product safety & recalls | Batch status (quarantine/recall) blocks sale instantly network-wide; trace to stores and customers; announcement with acknowledgement; customer notification |
| Cannabis waste destruction | Adjustment reason `DESTROYED` with witness, in the movement ledger |
| Audit | `AuditLog` for sales exceptions, price overrides, stock takes, recalls, settings, campaigns, logins |

## Operating procedures the software assumes

1. Legal review of MEDICAL-mode flows, the claims library and the class × channel matrix.
2. Each store's licences/permits captured in HQ before it sells licensed products.
3. Dispensers designated per store (`canDispense`) and trained.
4. Patient authorisation documents stored in document storage (`documentRef`), verified by a dispenser.
5. Direct-marketing registration with the NCC; monthly registry import into Suppression.
6. Information Officer registered; privacy notice and PAIA manual published (links in the storefront footer).
7. Before switching to `ADULT_USE`: confirm the commencement notice, limits and channel rules, then update settings per
   region/store.
