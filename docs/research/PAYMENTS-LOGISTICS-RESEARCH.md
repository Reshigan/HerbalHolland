# Payments, Logistics & Messaging Integration Research

**Herbal Holland commerce platform: South Africa**

| | |
|---|---|
| **Research date** | 27 September 2026. Sources from 2025–2026 were prioritised, and dates are noted inline. |
| **Scope** | The integration and adapter layer covers in-store POS (tap-on-glass on Android), e-commerce (click & collect and nationwide delivery), the loyalty app, marketing messaging, ID and age verification, accounting and offline operation. |
| **Operating model** | Stores are franchise-style and each is owned by a different owner. Each store needs its own merchant account and payouts. |
| **Status** | These are research notes, not legal advice. Items marked *(unverified)* or *(third-party)* need confirmation before you rely on them. |

> **Client regulatory status: SAHPRA registration**
>
> The client states that it is **SAHPRA-registered**. This research did not independently verify that. Frame all conversations with acquirers, gateways and couriers around **licensed medical dispensing**. Have the licence or registration type, number and scope ready for due diligence, along with the product schedule of each SKU.
>
> The verified policy text shows what this framing changes:
>
> - **Peach Payments** lists both *"Drug Stores and Pharmacies"* and *"Cannabidiol (CBD)"* as restricted categories that *"may require prior written approval"*. An approval route therefore exists. Peach still does not permit *"cannabis products and dispensaries"*.
> - **Yoco** also prohibits *"Drug stores and pharmacies (card not present transactions)"* and *"MOTO (Mail Order Telephone Order)/internet/prescription drugs"*, in addition to cannabis and CBD. There is no route through Yoco.
> - **PayFast's** prohibited list, as supplied to Insaka, includes *"Prescription or non-prescription (over-the-counter) medicines"*. Medicine sales therefore do not fit PayFast. Its EFT, Mobicred and Bitcoin allowance applies to *"Hemp and CBD products"*.
> - **WhatsApp** prohibits *"Drugs, whether prescription, recreational, or otherwise"* and *"Medical and healthcare products"*. A medical framing does not make WhatsApp usable for product messaging.
> - **Design implication:** keep licensed-medicine SKUs separable from general retail SKUs. Each acquirer can then underwrite exactly the scope it approves, including through separate merchant accounts if needed.

---

## Contents

1. [Tap-on-glass / SoftPOS](#1-tap-on-glass--softpos)
2. [Acceptable-use policies](#2-acceptable-use-policies)
3. [Online payments, PayShap and split payouts](#3-online-payments-payshap-and-split-payouts)
4. [Couriers and last mile](#4-couriers-and-last-mile)
5. [Messaging: WhatsApp, SMS and email](#5-messaging-whatsapp-sms-and-email)
6. [ID and age verification](#6-id-and-age-verification)
7. [Accounting and SARS e-invoicing](#7-accounting-and-sars-e-invoicing)
8. [Power, connectivity and hardware](#8-power-connectivity-and-hardware)
9. [Recommended adapter defaults](#9-recommended-adapter-defaults)
10. [Open questions](#10-open-questions)
11. [Method and verification notes](#11-method-and-verification-notes)

---

## Key findings

- **The binding constraint is whether a provider will accept the business, not the technology.** Retail cannabis sales remain illegal in South Africa, even though stores trade openly in malls (BusinessTech, 24 Jun 2026). Provider positions:
  - Yoco prohibits both cannabis and CBD.
  - Peach prohibits cannabis. It restricts CBD, pharmacies and drug stores, which need prior written approval.
  - PayFast will not process hemp or CBD on cards (EFT, Mobicred and Bitcoin only) and prohibits medicines.
  - Paystack bans *"Illegal drugs and drug paraphernalia"*.

  Scope card acceptance to compliant, licensed SKUs. Obtain written approval from the acquirer for each store.
- **The best tap-on-glass fit is Halo Dot's Halo.Link app-to-app integration.** It is PCI MPoC certified (announced January 2025). Its documented Android intents take the **merchant ID per transaction**, which suits stores with different owners. App links and cloud *Push to Terminal* cover the PWA. Halo's documentation names Nedbank as acquirer, so each store's acceptance depends on Nedbank's underwriting.
- **WhatsApp is a ban risk.** Its Business Messaging Policy prohibits drugs *"whether prescription, recreational, or otherwise"*. Build SMS, email and app push as the primary channels.
- **Offline-first still matters,** even though there has been no load-shedding since 16 May 2025. SoftPOS cannot authorise card payments offline, and local outages continue.
- **SARS e-invoicing is at consultation stage.** The consultation paper came out in August 2026, with phased implementation from 2030. The **VAT registration threshold rose to R2.3m on 1 April 2026**, so store VAT status must be configurable per store.

---

## 1. Tap-on-glass / SoftPOS

### Providers

| Provider | How a POS connects | Certification | Fees (excl. VAT) and payouts | Can a third-party POS trigger it and get the result? |
|---|---|---|---|---|
| **Halo Dot** (Halo.Link / Halo.Go / Halo.SDK / Halo.Swift) | Android intents, app links or deep links, cloud *Push to Terminal* (Firebase), an embedded SDK (Kotlin, Flutter, React Native) and an iOS SDK | PCI MPoC, announced 27–28 Jan 2025. If you embed the SDK, *"integrators must submit their own apps to a PCI lab for MPoC certification"*, plus L3 testing. | Pricing not public ("Request Pricing"). Settlement comes via the acquirer. | **Yes, documented.** See the integration detail below. |
| **Yoco** | Yoco app only. The SDK pairs Yoco card machines only. Tap to Pay on iPhone has been live since 12 May 2026. | n/a | Core R0/month: 2.30% debit/credit up to R50k and 1.35% debit from R50k to R200k. Plus R249/month per location, from 1.25%. Pro R499/month per location, from 1.20%, with free fast payouts. Online costs 0.5% more. | Card-machine SDK only. **Excluded anyway by its policy** (section 2). |
| **iKhokha** (bought by Nedbank; Tribunal approval Nov 2025) | iK Tap on Phone inside the iK app, on NFC Android and Huawei phones | n/a | From 2.75% plus a R2.50 payout fee. Payouts take 1–3 business days: next business day for FNB/Absa, and same day (twice daily) for Nedbank or iK Debit Card. | No integration documentation found. |
| **Nedbank PocketPOS** | Standalone app with tap on phone; Android 9+ | *"certified, secure app"* | *"No additional costs"*; the usual merchant service commission applies | Not found |
| **Absa Mobile Pay** | Standalone app; Android 7+ with NFC | n/a | 2.25% per transaction, no upfront costs. Payment is *"cleared as per the normal merchant facility"*. | Not found |
| **FNB SpeedeeApp** | Inside the FNB App: cloud SoftPOS built with the Visa Acceptance Cloud; Android only | n/a | *"Flat commission rate"* (not disclosed) and next-day settlement to an FNB account (per FNB page) | Not found |
| **Standard Bank SimplyBLU** | Android app that accepts card payments in store | n/a | Not found | Not found. Tap-on-phone not confirmed. |
| **Capitec** | Merchant app with Masterpass QR and a paired mobile card machine | n/a | Not found | Tap-on-phone not found |
| **Paystack** | Virtual Terminal is live in SA: the customer pays on their own phone. The Terminal API pushes payment requests to devices. | n/a | Cards, Scan to Pay and SnapScan: 2.9% + R1. International cards: 3.1% + R1. EFT: 2%. Settlement in about 2 working days *(third-party)*. | Physical terminals are for *"Registered Businesses in Nigeria"* only per Paystack support. However, 25 Sep 2026 press mentions *Paystack Terminal* with Shopify in SA. **Unresolved.** |
| **Peach Payments** | Digit Pro Android terminal, programmable with custom apps. POS is *"Available in South Africa and Mauritius"*. | n/a | Quote-based | Through an app on the terminal. SoftPOS not found. |
| **Stitch Express in-person** (Aug 2026) | API "terminal sessions" for custom POS, a *"secure payments SDK"*, Android, embedded and e-socket terminals | n/a | Not public | Yes, through the API. Works *"with any acquiring bank"*. SoftPOS not confirmed. |
| **Adumo** | *"70+ POS providers"* integrated (adumo Connect, adumo Infinite) | n/a | Quote-based | SoftPOS product not found |
| **Stripe** | South Africa is listed as *"Extended network"* (served through Paystack) | n/a | n/a | Stripe Terminal and Tap to Pay are not available |
| **Apple Tap to Pay on iPhone** | Live in SA since 12 May 2026 through iStore Pay and Yoco. Visa and Mastercard supported; *"American Express coming soon"*. iPhone XS or later. | Apple Secure Element | Provider-specific | Only inside partner-enabled iOS apps |

### Halo Dot integration detail (from Halo's public docs)

The **intent flow** uses Approach 1.1, which Halo recommends *"for customers that have multiple merchant accounts"*:

1. The platform backend calls `POST https://kernelserver.{env}.haloplus.io/consumer/intentTransaction`. The body carries `merchantId`, `paymentReference`, `amount`, `timestamp` and `currencyCode`.
2. Halo returns a transaction `id` and a signed JWT.
3. The POS app launches Halo.Link or Halo.Go with the intent action `za.co.synthesis.halo.transaction`:

   ```kotlin
   // Adapted from Halo Dot "Transaction App to App Integration Guide"
   val intent = Intent("za.co.synthesis.halo.transaction").apply {
       putExtra("is_tap", true)
       putExtra("transaction_id", transactionId) // from /consumer/intentTransaction
       putExtra("jwt", jwt)
   }
   startActivityForResult(intent, HALO_REQUEST_CODE)
   // Result extras: result_transaction_id, result_transaction_type, result_transaction_error_code
   ```

4. `result_transaction_type` takes one of these values: Approved, Declined, CardTapTimeOutExpired, NetworkError, ProcessingError, Cancelled, TryAnotherCard, NFCDisabledError, NotAuthenticated, Indeterminate, DuplicateMerchantTransactionReferenceSupplied or InvalidJWT.

For the PWA and web, a browser cannot read EMV cards (Web NFC is limited to NDEF), so you must hand off to a certified app. There are two routes:

- **App links:** `POST /consumer/applink` returns a link that opens Halo.Link or Halo.Go. It replaces the deprecated `/consumer/qrCode`.
- **Push to Terminal:**
  1. Register devices with `POST /devices`, which takes a Firebase token.
  2. Call `POST /consumer/push` with the device ID, amount, currency and reference.
  3. If the push fails, fall back to the app link or QR code.

Results come back three ways:

- The intent result.
- A transaction webhook at `POST https://appserver.{env}.haloplus.io/integrator/callbackUrl`. Registration is *"currently unavailable and the webhook url has to be added manually"* via Halo support.
- The transaction query, refund, reversal and void APIs.

**Acquirer.** Halo's FAQ on card-scheme reporting names *"Nedbank & Synthesis"* as acquirer and solution developer. Halo's homepage lists partners including Nedbank, Paycorp and Cybersource.

**Device.** PIN entry works on *"Android 11+, GMS"* (Google Mobile Services). See section 8 for the device-policy implications.

### What to build

- **Adapter:** `CardPresentProvider` with these steps:
  1. `createPayment(storeId, amount, reference)` returns a handoff: intent, app link or push.
  2. The result arrives as the intent result, the webhook, or a status poll.
  3. Payments are idempotent on `paymentReference`. Halo rejects duplicates with error 124, DuplicateMerchantReference.
- **Primary:** Halo.Link through an Android intent from a native or Trusted Web Activity shell.
  - Devices that only run the PWA use app links on the same device, or Push to Terminal to a paired phone.
  - Store each store's Halo `merchantId` and API key **server-side only**.
- **Fallback:** an "external card terminal" tender. The cashier keys the amount into whatever bank or fintech device that store owner has been approved on, and the POS records the reference and time. Reconcile against settlement reports.
- **Avoid initially:**
  - Embedding Halo.SDK, which brings your own MPoC lab submission and L3 certification.
  - Anything built on Yoco, whose policy prohibits this business.
- **iOS:** defer. Tap to Pay on iPhone is live in SA, and Halo.Swift exists but needs Apple's ProximityReader entitlement.

### Sources

- [Halo Dot documentation repo](https://github.com/halo-dot/halo-documentation): intents, app links, Push to Terminal, webhooks and FAQ
- [Halo.SDK product page](https://www.halodot.io/halo-sdk)
- [IT-Online: Halo Dot achieves PCI MPoC certification (28 Jan 2025)](https://it-online.co.za/2025/01/28/halo-dot-achieves-pci-mpoc-certification/)
- [Halo Dot blog: MPoC certified](https://www.halodot.io/blogs/halo-dot-becomes-first-african-founded-softpos-vendor-to-achieve-pci-mpoc-certification)
- [Apple Newsroom ZA: Tap to Pay on iPhone in South Africa (12 May 2026)](https://www.apple.com/za/newsroom/2026/05/apple-brings-tap-to-pay-on-iphone-to-south-africa/)
- [Yoco fees](https://www.yoco.com/za/fees/)
- [Yoco in-person SDK: getting started](https://developer.yoco.com/in-person/getting-started/)
- [iKhokha Tap on Phone](https://www.ikhokha.com/tap-on-phone)
- [iKhokha FAQ](https://www.ikhokha.com/faq)
- [Nedbank merchant FAQ: PocketPOS tap on phone](https://business.nedbank.co.za/small-business/payments/card-acceptance/merchant-faq.html)
- [Absa Mobile Pay](https://www.absa.co.za/business/bank-my-business/make-and-receive-payments/mobilepay/)
- [FNB SpeedeeApp](https://www.fnb.co.za/business-banking/merchant-services/speedeeapp.html)
- [Standard Bank SimplyBLU (Google Play)](https://play.google.com/store/apps/details?id=com.standardbank.simplyblu.android&hl=en_US)
- [Capitec Merchant app (Google Play)](https://play.google.com/store/apps/details?id=com.capitecbank.merchantapp&hl=en_ZA)
- [Paystack terminal pricing (support)](https://support.paystack.com/en/articles/2131842)
- [Paystack Virtual Terminal expansion to SA](https://paystack.com/blog/product/virtual-terminal-expansion)
- [Paystack Terminal API: push payment requests](https://paystack.com/docs/terminal/push-payment-requests/)
- [TechAfrica News: Paystack onsite Shopify checkout and Terminal in SA (25 Sep 2026)](https://techafricanews.com/2026/09/25/paystack-south-africa-onsite-card-checkout-shopify/)
- [Peach Payments developer hub](https://developer.peachpayments.com/)
- [Peach Payments: Digit Pro launch](https://www.peachpayments.com/scale/peach-payments-launches-enterprise-level-pos-terminal-with-alternative-payment-methods/)
- [Stitch in-person payments](https://stitch.money/in-person-payments)
- [Bizcommunity: Stitch Express adds in-store payments (Aug 2026)](https://www.bizcommunity.com/article/stitch-express-adds-in-store-payments-as-shopify-push-deepens-634781a)
- [Adumo integrated payments](https://www.adumo.com/payments/integrated-payments)
- [Stripe global availability](https://stripe.com/global)
- [Nedbank press release: acquisition of iKhokha (2025)](https://group.nedbank.co.za/news-and-insights/press/2025/nedbank-acquires-ikhokha.html)

---

## 2. Acceptable-use policies

### Provider positions

| Provider | Cannabis / THC | CBD | Paraphernalia | Pharmacies and medicines |
|---|---|---|---|---|
| **Yoco** | Prohibited: *"Cannabis/marijuana products and related good and services"*. *"Cannabis is also not legal to sell in South Africa."* | Prohibited: *"CBD products fall under medicinal and prescription drugs, which are not permitted under Yoco's Terms."* | Not explicitly listed | Prohibited: *"Drug stores and pharmacies (card not present transactions)"* and *"MOTO…/internet/prescription drugs"* |
| **Peach Payments** (policy page dated 6 Sep 2023) | *"Transactions related to cannabis products and dispensaries are not permitted."* | **Restricted.** *"Cannabidiol (CBD)"* is among categories that *"may require prior written approval"*. | Not named | **Restricted:** *"Drug Stores and Pharmacies"*. Tobacco and nicotine are also restricted. |
| **PayFast** (list PayFast gave Insaka; undated) | n/a | *"Hemp and CBD products"* are *"prohibited for card processing. Processing methods allowed are EFT, Mobicred and Bitcoin."* Vapes are treated the same way. | n/a | *"Prescription or non-prescription (over-the-counter) medicines"* are prohibited. Tobacco sales online are prohibited. |
| **Paystack** | *"Banned narcotics, steroids, certain controlled substances…"* | Not named | *"Illegal drugs and drug paraphernalia"* are ineligible | Not named in the SA section |
| **iKhokha, Ozow, Stitch, Adumo, Halo Dot, Nedbank, Absa, FNB, Standard Bank, Capitec** | No public cannabis or CBD policy found. Ask for a written position. | | | |

### Legal context (confirm with counsel)

- **Cannabis trade is still illegal.** Private use has been decriminalised since the 2018 Constitutional Court ruling. The Cannabis for Private Purposes Act, signed May 2024, has not opened commercial trade, so any cannabis trade remains illegal under the Drugs and Drug Trafficking Act (BusinessTech, 24 Jun 2026).
- **Hemp cultivation:** the Plant Improvement Act, in force from 1 Dec 2025, allows hemp *cultivation* up to 2% THC. This concerns cultivation, not the legality of retail products.
- **Low-dose CBD** is exempt from scheduling only within limits: 20 mg a day, 600 mg per pack, 0.001% THC and no medicinal claims *(secondary source; SAHPRA's own page was unavailable during research)*.

### What SA shops actually use

The evidence is thin and anecdotal:

- Stores run "membership" and private-club models, and some rely on Section 21 prescriptions.
- Happy420 Africa (Cape Town) requires identity verification and 18+ membership. It accepts *"credit/debit cards, EFT, and mobile payments"*, plus bank transfer, and delivers nationwide by courier.
- PayFast itself steers CBD to EFT, Mobicred or Bitcoin.
- No reporting was found on acquirers enforcing against SA dispensaries.

### What to build

- **Compliance class per SKU:** THC, licensed medicine, CBD within the exemption, hemp, paraphernalia, or general. Route payment rails, couriers and marketing eligibility by class.
- **Onboarding record per store:** for each provider, keep the approval letter, the approved scope, the merchant category code (MCC) and the review or expiry date. Block rails that have not been approved for that store.
- **Never mis-code the MCC.** Disguising the business ("transaction laundering") risks termination and card-scheme blacklisting such as Mastercard MATCH. This is general card-scheme practice, not SA-specific research.

### Sources

- [Yoco: prohibited businesses](https://support.yoco.help/en/articles/109569-prohibited-businesses-at-yoco)
- [Peach Payments: high-risk industries](https://www.peachpayments.com/scale/high-risk-industries/)
- [Insaka: PayFast prohibited goods list](https://www.insaka.co.za/blog/what-products-cant-you-sell-online-in-south-africa)
- [Paystack: ineligible businesses](https://support.paystack.com/en/articles/2127042)
- [BusinessTech: cannabis stores illegal (24 Jun 2026)](https://businesstech.co.za/news/business-opinion/864490/these-stores-are-illegal-in-south-africa-but-theres-one-in-almost-every-shopping-mall/)
- [Mayet & Associates: SA cannabis and hemp laws in 2026](https://mayet.law/south-africas-cannabis-and-hemp-laws-in-2026-a-compliance-guide-for-business/)
- [cannabisregulations.ai: SA CBD rules](https://www.cannabisregulations.ai/country-legality/south-africa-cbd)
- [SAHPRA: THC and CBD information page](https://www.sahpra.org.za/thc-and-cbd-information-page/) *(returned HTTP 503 during research)*
- [SAnews: Plant Improvement Act comes into effect](https://www.sanews.gov.za/south-africa/new-plant-improvement-act-comes-effect)
- [Happy420 Africa: terms of service](https://happy420africa.com/policies/terms-of-service)

---

## 3. Online payments, PayShap and split payouts

### Gateways

| Gateway | Cards | Bank rails | Splits and payouts | Notes |
|---|---|---|---|---|
| **PayFast by Network** | 3.2% + R2.00 | Instant EFT and Capitec Pay: 2.0% (min R2.00) | **Split Payments:** part of each payment goes to **one** receiving PayFast merchant per transaction, as a fixed amount, a percentage or both, with a min/max | Hemp and CBD allowed via EFT, Mobicred and Bitcoin only. Medicines prohibited. |
| **Paystack (SA)** | 2.9% + R1 local; 3.1% + R1 international | EFT 2% (no flat fee) | Multi-split through subaccounts and split groups (percentage or flat), with a `bearer` setting for who pays fees | SnapScan and Scan to Pay at the card rate on Virtual Terminal. Onsite Shopify checkout launched 25 Sep 2026. |
| **Peach Payments** | About 2.95% + R1.50 *(third-party)* | PayShap; instant (RTC) payouts | Payouts API | Checkout, Payments API, payment links, mobile SDKs |
| **Ozow** | n/a | Instant EFT, **PayShap Request** (launched Jul 2025) | n/a | Policy not found |
| **Stitch** | Cards, Apple Pay, Google Pay, Samsung Wallet | Pay by bank, Capitec Pay, **PayShap Request**, Pay Later: all through one API | n/a | Multi-acquirer. Policy not found. |
| **Zapper / SnapScan / Scan to Pay** | QR wallets | n/a | n/a | SnapScan and Scan to Pay are accepted through Paystack. Zapper runs an active merchant programme. Policies not found. |

### PayShap in 2026

- Live since March 2023. It has processed **more than R100bn across 136m+ transactions**, with **12 banks** and **over 5m ShapIDs**.
- By late 2025 it averaged **about 45m transactions a month**, 80% of them under R500.
- The per-transaction cap is **R50,000**.
- **PayShap Request** (request-to-pay for merchants) arrived in **December 2024**. Merchants access it through payment providers: Ozow, Stitch and Peach.
- Per-bank limits differ. Peach's guide lists Capitec at 2 × R500 a day, FNB at R3,000, Nedbank at R50,000 and Standard Bank at R5,000, with Absa "coming soon". That guide carries no year.

### What to build

- **Each store is the merchant of record,** with gateway credentials held per store. Checkout routes to the fulfilling store's account.
- **Adapter:** `OnlinePaymentProvider`, with capability flags for card, bank-pay, PayShap Request, split, refund and webhook.
- **Primary:**
  - Bank rails that the provider permits for the SKU class: PayFast EFT for hemp/CBD, and Stitch or Ozow for PayShap Request and pay-by-bank once their policies are confirmed in writing.
  - **Cards only after written approval,** through Peach's restricted-category route or Paystack.
- **Fallback:** manual EFT with proof of payment, auto-matched against bank statement feeds.
- **Royalties to HQ:** use a PayFast split, where the single receiver is HQ, or a Paystack subaccount. The store stays the merchant of record.
- **Regulatory check:** HQ collecting funds on behalf of franchisees may bring in SARB/PASA rules on payments to third persons *(unverified; ask counsel)*.

### Sources

- [PayFast fees](https://payfast.io/fees/)
- [PayFast Split Payments](https://payfast.io/features/split-payments/)
- [PayFast developer docs: split payments](https://developers.payfast.co.za/docs) *(the one-receiver rule was taken from the docs via a search snippet; the page is JavaScript-rendered and was not re-checked)*
- [Paystack: transaction splits](https://support.paystack.com/en/articles/2132802)
- [Stitch: the state of PayShap in 2026](https://stitch.money/blog/real-time-payments-in-south-africa-the-state-of-payshap-in-2026)
- [ITWeb: Stitch adds PayShap Request](https://www.itweb.co.za/article/fintech-start-up-stitch-adds-payshap-request/6GxRKMYQ155Mb3Wj)
- [Engineering News: Ozow launches PayShap Request (30 Jul 2025)](https://www.engineeringnews.co.za/article/ozow-unlocks-real-time-payments-for-merchants-with-payshap-request-2025-07-30)
- [Peach Payments: PayShap guide](https://support.peachpayments.com/support/solutions/articles/47001285345-payshap-guide)
- [Peach Payments: real-time clearance payouts](https://www.peachpayments.com/scale/peach-payments-announces-real-time-clearance-payouts/)
- [Zapper for business](https://www.zapper.com/business/)
- [JWD: gateway fee comparison (Sep 2026)](https://www.jwd.co.za/payment-gateways-south-africa-yoco-payfast-peach/) *(third-party)*

---

## 4. Couriers and last mile

### Options

| Provider | API | Pricing ballpark | Same-day / pickup | Restrictions relevant to cannabis and CBD |
|---|---|---|---|---|
| **Bob Go** (shipping aggregator) | Open API. Connects The Courier Guy, RAM, Fastway, SkyNet, Citi-Sprint, Internet Express, MTE, Pargo, WumDrop and Bob Box lockers. | Pay-as-you-go at R0/month plus courier rates, or paid plans at **R249–R1,999/month** excl. VAT | On-demand same-day collections; pickup points and lockers | Per its restrictions page:<br>• **SkyNet** bans *"Marijuana… and marijuana-derived cannabidiol (CBD)"*, products above 0.3% THC, raw hemp, tobacco and e-cigarettes.<br>• **The Courier Guy** bans *"Poison including drugs and medicines"* under *ICASA Notice 2764 of 2024*.<br>• **Fastway** bans drugs and medicines except prescription quantities.<br>• **RAM** bans *"Illegal goods"*.<br>• *"Medication or medical sample"* ships only at your own risk, with no courier liability. |
| **The Courier Guy** | Own REST API | Overnight from about R125; same-day metro from about R140 *(third-party, unverified)* | PUDO lockers; same-day metro (book early) | As above |
| **Pargo** (pickup points) | API | About R49–R95 for small parcels *(third-party)* | Collection needs *"your ID and the Pargo Code"*. Parcels held 8 days; 0–15 kg. | Bans *"Tobacco products of all descriptions"* and *"Alcohol products"*. No explicit cannabis or CBD clause. |
| **RAM** | API *(third-party listing)* | n/a | Same-day, next-day and economy | *"Illegal goods or goods prohibited by Law"* |
| **Aramex SA, DSV, Dawn Wing** | Not confirmed; listed as rate-card only by a third-party directory | n/a | n/a | Not retrieved |
| **Uber Direct, Picup** | SA availability and API not verified | n/a | n/a | Not retrieved |
| **Pick n Pay asap!, Checkers Sixty60** | Retailer-owned. No third-party delivery API found. | n/a | n/a | n/a |

**ID or age checks on delivery:** no SA courier was found that offers ID or age verification at the door. Pargo's ID check at collection is the closest thing.

### What to build

- **Adapter:** `ShippingProvider`, with quote, create shipment, label, track (webhooks) and cancel.
- **Primary:** Bob Go, for one API across many couriers, lockers and same-day.
- **Secondary:** The Courier Guy direct API. **Pickup points:** Pargo.
- **Restriction engine:**
  - A per-SKU `shippable` flag, plus a courier-by-restriction matrix.
  - THC is never shipped. Ship CBD or licensed medicines only with couriers that accept them in writing.
- **Age-restricted items:** default to **click & collect with an in-store ID check** at handover. For delivered orders, require a verified-account age check (section 6) plus an OTP at handover where the courier supports it *(courier OTP support unverified)*.

### Sources

- [Bob Go: shipping restrictions](https://www.bobgo.co.za/shipping-restrictions)
- [Bob Go: pricing](https://www.bobgo.co.za/pricing)
- [Bob Go: delivery partners](https://www.bobgo.co.za/delivery-partners)
- [Pargo FAQ](https://pargo.co.za/faq/)
- [DeliverAI: The Courier Guy profile](https://deliverai.co.za/couriers/the-courier-guy) *(third-party)*
- [DeliverAI: courier directory](https://deliverai.co.za/couriers) *(third-party)*
- [Uber Direct developer overview](https://developer.uber.com/docs/deliveries/overview) *(no SA-specific information found)*

---

## 5. Messaging: WhatsApp, SMS and email

### WhatsApp Business Platform policy

The Business Messaging Policy was last updated 23 Sep 2026.

- It prohibits *"buying, selling, promoting, or otherwise facilitating the exchange of"* the following:
  - *"Drugs, whether prescription, recreational, or otherwise"*
  - *"Medical and healthcare products"*
  - *"Alcohol and tobacco"*
- Over-the-counter drugs and alcohol are "Regulated Verticals" allowed only in listed countries. **South Africa is not listed.**
- Messaging about a Regulated Vertical *"may not be sent to people under 18 years of age"*.
- You need **opt-in**, and **business-initiated conversations must use approved templates**. Commerce features are also subject to the Meta Commerce Policy.

### WhatsApp pricing

- **Per-message pricing since 1 Jul 2025:** you are charged when a template is delivered.
- **Free windows:**
  - Utility templates are free inside the 24-hour customer-service window.
  - Free-entry-point windows, from click-to-WhatsApp ads, are free for 72 hours.
- **Volume tiers** apply to utility and authentication messages.

| Message category | SA rate per message (Meta's rate as shown in Twilio's calculator, Sep 2026) |
|---|---|
| Marketing | $0.0379 |
| Utility | $0.0076 |
| Authentication | $0.0076 |
| Service | $0 |

| WhatsApp provider | Pricing model |
|---|---|
| **Twilio** | Meta fees plus **$0.005 per message** |
| **360dialog** | Regular **€49 per number per month**; Premium €99; Scale €500. *"zero message markup"*. |
| **Turn.io** (Praekelt ecosystem) | Priced per inbound user; *"Meta and AI provided at cost"*, *"No per-message markups"* |
| **Clickatell, Infobip** | Quote-based |

### SMS and email

- **SA direct-marketing sending windows,** per Everlytic's policy (April 2024), which reflects the Consumer Protection Act (CPA), POPIA and the WASPA code:

| Day | Allowed sending hours |
|---|---|
| Sundays and public holidays | None |
| Saturdays | 9am–1pm only |
| Other days | 8am–8pm only |

  You must also honour opt-outs, and data must come from opt-in, permission, or customers who transacted within the last 2 years.
- **Provider content rules:**
  - **Everlytic** prohibits *"unlawful"* material. It has no cannabis-specific clause.
  - **Mailchimp** prohibits *"Pharmaceutical products"* and scrutinises *"Nutritional, herbal, and vitamin supplements"*.
  - **Klaviyo** restricts *"illegal or controlled substances"*. For US/Canada SMS it explicitly bans CBD, marijuana/cannabis, THC and paraphernalia.
- **SMSPortal** is pay-as-you-go with no subscription; its ZAR per-SMS rate was not captured. The policies of SMSPortal, Clickatell and BulkSMS were **not retrieved**.

### What to build

- **Adapter:** `MessagingProvider`, with fallback across channels (WhatsApp, then SMS, then email) and a central **consent register** and **quiet-hours enforcement** in the platform core.
- **Primary channels:** SMS for transactional messages and OTPs, plus **loyalty-app push notifications** (a channel you own).
- **Email:** Everlytic, which is SA-based and follows POPIA, after getting written approval of the content. Keep a second provider ready.
- **WhatsApp:** optional, **utility messages only** (order ready, delivery ETA), with neutral wording, no product promotion and no catalogues. It must never be a single point of failure; assume the account can be banned.

### Sources

- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
- [Meta: WhatsApp Business Platform pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- [Twilio: WhatsApp pricing (SA rates in calculator)](https://www.twilio.com/en-us/whatsapp/pricing)
- [360dialog pricing](https://www.360dialog.com/pricing)
- [Turn.io pricing](https://www.turn.io/pricing)
- [Infobip WhatsApp pricing](https://www.infobip.com/whatsapp-business/pricing)
- [Clickatell pricing and coverage](https://www.clickatell.com/pricing-and-coverage/)
- [Everlytic Acceptable Use Policy (PDF, April 2024)](https://www.everlytic.com/acceptable-use-policy/)
- [Mailchimp Acceptable Use Policy](https://mailchimp.com/legal/acceptable_use/)
- [Klaviyo Acceptable Use Policy](https://www.klaviyo.com/legal/acceptable-use-policy)
- [SMSPortal pricing](https://smsportal.com/pricing/)

---

## 6. ID and age verification

### Providers

| Provider | SA coverage | Pricing |
|---|---|---|
| **Smile ID** | `NATIONAL_ID` (13 digits): Enhanced and Biometric KYC. Returns date of birth, photo, `is_deceased` and `id_status`.<br>`NATIONAL_ID_NO_PHOTO`: Basic and Enhanced KYC.<br>Document checks cover `IDENTITY_CARD` (including the green book), `DRIVERS_LICENSE`, `PASSPORT` and `RESIDENT_ID`. | Not public |
| **VerifyNow** | Home Affairs–backed checks, face match, liveness and age estimation. Has an API. | Pay per check at R2.99 per credit (table below) |
| **ThisIsMe** | API and monitoring; *"45+ services"* | Not public |
| **XDS, TransUnion** | Credit-bureau identity products | Details not retrieved |
| **Home Affairs direct** | No retailer-facing access route found; use accredited intermediaries | n/a |

| VerifyNow check | Credits | Price |
|---|---|---|
| SA ID verification, no photo | 1 | R2.99 |
| ID + photo, standard (cached Home Affairs) | 8 | R23.92 |
| ID + photo, real-time Home Affairs | 10 | R29.90 |
| Age estimation | 1 | R2.99 |
| Passive liveness | 1 | R2.99 |
| Face match + ID verification (no Home Affairs photo) | 2 | R5.98 |

### SA ID number format: `YYMMDD SSSS C A Z`

| Part | Meaning |
|---|---|
| `YYMMDD` | Date of birth |
| `SSSS` | Sequence: 0000–4999 female, 5000–9999 male |
| `C` | Status: 0 = SA citizen, 1 = permanent resident, 2 = refugee |
| `A` | 8 or 9. It was formerly a racial identifier and is now random, so don't validate on it. |
| `Z` | Check digit calculated with the **Luhn algorithm** |

**How to validate locally:**

1. Check there are exactly 13 digits.
2. Check the date is a real date. Infer the century: if `YY` is greater than the current two-digit year, it is 19YY; otherwise 20YY, then sanity-check the age.
3. Run the Luhn check:
   1. Starting from the rightmost digit (the check digit), double every second digit.
   2. Subtract 9 from any result over 9.
   3. Add everything up. The total must be a multiple of 10.
4. Compute 18+ from the date of birth and today's date.

**Passing these checks doesn't prove the person holding the ID is the owner.** The Smart ID card's **PDF417 barcode** contains the surname, names, sex, nationality, ID number, date of birth and more, so the POS can scan it for a fast in-store date-of-birth capture.

### What to build

- **Adapter:** `IdentityProvider`. Validate locally first (format, Luhn, date, 18+) at no cost.
- **Primary:** VerifyNow for ID checks plus face match at onboarding, and for loyalty and delivery accounts.
- **Fallback:** Smile ID, which has pan-African coverage and mobile SDKs.
- **In store:** scan the PDF417 barcode and have staff check the physical ID. Store only minimal evidence (result, reference, timestamp) to comply with POPIA.

### Sources

- [Smile ID: South Africa ID coverage](https://docs.usesmileid.com/id-coverage/verify-with-id-number/south-africa)
- [VerifyNow pricing](https://www.verifynow.co.za/pricing)
- [ThisIsMe](https://www.thisisme.com/)
- [Wikipedia: South African identity card (ID number format, PDF417 contents)](https://en.wikipedia.org/wiki/South_African_identity_card)

---

## 7. Accounting and SARS e-invoicing

> **Superseded:** the platform now keeps the books itself, one ledger per company (HQ and every franchisee), so nothing
> is exported to Sage or Xero ([RUNBOOK → Accounting](../RUNBOOK.md#accounting-the-books)). The research below is kept
> for the record; the SARS e-invoicing notes still apply.

### Accounting platforms

- **Xero (ZA):** list prices are Starter R450, Standard R795 and Premium R1,095 per month, with a promotion of 80% off for the first 3 months. **Yoco has integrated with Xero since May 2025.**
- **QuickBooks Online:** still sold in SA according to its ZA site, with Simple Start, Essentials, Plus and Advanced plans. Prices did not render.
- **Sage** (Sage Business Cloud Accounting): Sage's site blocked automated fetches, so its details weren't verified in this research.

### SARS VAT Modernisation (e-invoicing)

- **17 Aug 2026:** the *VAT Modernisation Consultation Paper* was published. **Comments close 16 Oct 2026.**
- **Direction:** SARS aims to *"connect SARS across the VAT value chain to every point of sale"* using **e-Invoices, an Interoperability Framework and e-Reporting**, with near real-time data. This lays the ground for VAT auto-assessment.
- **Architecture:** a **five-corner decentralised model** with **accredited service providers**, where the provider checks each invoice before it goes onto the network.
- **Timeline:** consultation in **2026/27**, then **phased implementation from 2030**. It starts with a pilot and voluntary participation, and becomes mandatory later by segment. Small businesses may be onboarded later.
- **VAT threshold (Budget 2026):** compulsory registration rose from **R1m to R2.3m**, and voluntary registration from R50k to R120k, **effective 1 Apr 2026**.

### What to build

- **Adapter:** `AccountingExporter`, with one connection per store, since each owner has their own ledger.
- **Primary:** Sage and Xero. **Fallback:** CSV or journal export.
- **What to post:** **daily summary journals** covering sales by tender and VAT rate, cost of goods sold, gateway fees, payouts and royalties. Posting every transaction is unnecessary.
- **Keep structured invoice data** (supplier and buyer VAT numbers, line-level VAT, unique invoice IDs) so the platform is ready for e-invoicing.
- **Add a VAT-registered flag per store,** because of the new threshold.

### Sources

- [Xero ZA pricing plans](https://www.xero.com/za/pricing-plans/)
- [QuickBooks South Africa](https://quickbooks.intuit.com/za/)
- [Wikipedia: Yoco (Xero integration, May 2025)](https://en.wikipedia.org/wiki/Yoco)
- [SARS: VAT Modernisation](https://www.sars.gov.za/types-of-tax/value-added-tax/vat-modernisation/)
- [SARS: VAT Modernisation FAQs](https://www.sars.gov.za/types-of-tax/value-added-tax/vat-modernisation/frequently-asked-questions-on-vat-modernisation/)
- [SARS: Value-Added Tax page (threshold change, Budget 2026)](https://www.sars.gov.za/types-of-tax/value-added-tax/)

---

## 8. Power, connectivity and hardware

### Load-shedding status

- Load-shedding ended on **26 Mar 2024**. It came back in early 2025, including **Stage 6 on 22 Feb 2025**.
- The **last load-shedding was on 16 May 2025**, with none since. This is per Wikipedia, last edited 23 Aug 2026, which cites a 4 Jun 2026 article: *"Eskom finally defeated load shedding. But South Africa's power crisis is far from over."*
- Eskom's 2026 outlook was **not retrieved**.

### Why the POS still needs to be offline-first

- **Card payments need a connection.** SoftPOS cannot authorise contactless payments offline; Halo returns NetworkError or DeclinedOffline.
- **Local outages continue:** municipal faults, network or tower failures, and mall connectivity.
- **What the POS should do:**
  - Keep the catalogue, pricing, cart, cash sales, stock movements and loyalty points working locally in a queue.
  - **Disable or flag card tenders while offline.**
  - Make syncing safe to repeat, using store-scoped sequence numbers.
  - Print receipts locally.

### Hardware

| Device | Details |
|---|---|
| **Yoco Khumo 2** | R699; 5.5" screen; built-in 4G with unlimited data plus Wi-Fi; up to 18 hours of battery. Tied to Yoco. |
| **Yoco Khumo Print 2** | R1,999; built-in receipt printer. Tied to Yoco. |
| **iKhokha iK Flyer / iK Flyer Lite** | R1,499 / R699. These now appear on Nedbank's Android POS page. |
| **Peach Digit Pro** | Android terminal programmable with custom apps |
| **Sunmi, receipt printers, scanners** | Not verified in this research. The usual approach is ESC/POS receipt printers over Bluetooth or USB, and barcode scanners that act as keyboards. |

### Halo device rules (from Halo's error codes and FAQ)

| Requirement | Related error |
|---|---|
| Android 11+ with Google Mobile Services for PIN entry | 303 InvalidAndroidVersion; 311 GooglePlayUnavailable |
| NFC enabled | 300 NFCDisabled |
| **No screen overlays or accessibility services active** | 402 AccessibilityServiceBlocksPin |
| **Developer options off** | 403 DeveloperOptionsBlockPin |
| Network available | 305 NetworkError |

**What this means for device management and kiosk tools:** they must not use screen overlays or accessibility services on payment devices. Huawei phones without Google services are unsuitable for Halo, even though iKhokha supports Huawei.

### Sources

- [Wikipedia: South African energy crisis](https://en.wikipedia.org/wiki/South_African_energy_crisis)
- [Yoco card machines](https://www.yoco.com/za/card-machines/)
- [Nedbank Android POS](https://business.nedbank.co.za/small-business/payments/card-acceptance/android-pos.html)
- [Halo Dot documentation repo](https://github.com/halo-dot/halo-documentation) (error codes, FAQ)

---

## 9. Recommended adapter defaults

| Adapter | Primary | Fallback | Guardrails |
|---|---|---|---|
| `CardPresentProvider` (in store) | Halo.Link via Android intent; app link or Push to Terminal for the PWA; one merchant per store | External-terminal tender, where the cashier keys the amount into the store's own approved bank or fintech device and the POS records the reference | Written acquirer approval per store; idempotent references; card tenders disabled offline |
| `OnlinePaymentProvider` | Permitted bank rails: PayFast EFT for hemp/CBD; PayShap Request via Stitch or Ozow once policies are confirmed | Manual EFT with proof of payment and bank-feed reconciliation | Cards only with written approval (Peach restricted route or Paystack); routing by SKU compliance class |
| Royalty split | PayFast split with HQ as the single receiver | Paystack subaccount | Store stays merchant of record; counsel to check third-party payment rules |
| `ShippingProvider` | Bob Go | The Courier Guy direct API; Pargo for pickup | Per-SKU shippability; THC never shipped; age-restricted items default to click & collect |
| `MessagingProvider` | SMS (transactional and OTP) and app push | Email via Everlytic; WhatsApp for utility messages only (optional) | Consent register; SA quiet hours; no product promotion on WhatsApp |
| `IdentityProvider` | Local validation, then VerifyNow | Smile ID | In-store PDF417 scan plus a staff check of the ID; minimal data retained (POPIA) |
| `AccountingExporter` | Per-store Sage or Xero; daily journals | CSV or journal export | Data ready for e-invoicing; VAT flag per store |
| Offline sync | Local-first queue with safe-to-repeat sync | n/a | Store-scoped sequences; conflict resolution |

---

## 10. Open questions

1. **Written positions on CBD and licensed-medicine merchants** from Nedbank (Halo's acquirer), iKhokha, Ozow, Stitch, Adumo and the other banks. Frame these as licensed medical dispensing, per the client's stated SAHPRA registration.
2. **Scope of the client's SAHPRA registration:** licence type, which products and schedules it covers, and whether each franchise store is covered or needs its own authorisation.
3. **Halo Dot pricing** and its merchant onboarding terms for each store.
4. **Paystack physical terminals in SA:** the support page says Nigeria only, but the 25 Sep 2026 press release mentions Terminal in SA.
5. **SA availability and APIs** for Uber Direct and Picup. API confirmation for Aramex, DSV and Dawn Wing.
6. **Whether any courier will accept CBD or licensed medicines in writing,** and whether any offers an OTP, ID or age check at handover.
7. **Whether HQ can collect funds on behalf of franchisees** under the SARB/PASA rules on payments to third persons.
8. **Policies of SMSPortal, Clickatell and BulkSMS** on CBD and medicine-related content. ZAR per-SMS rates.
9. **Sage** product naming, pricing and API details for SA.

---

## 11. Method and verification notes

- **How sources were gathered:** vendor pages, developer docs, policy pages and SA tech and business press were fetched directly. The web-search budget ran out partway through the research, so some items remain marked *(unverified)*.
- **Every policy quote was checked against the page's raw text.** An automated page summary first attributed a cannabis/CBD restriction to Everlytic's policy. The PDF itself contains no such clause, and that claim was discarded.
- **Third-party data is labelled (third-party).** This covers the DeliverAI courier pricing and directory, the JWD fee comparison, and the Paystack settlement time. Treat these figures as indicative only.
- **The SA WhatsApp rates** were read from the Meta rate data that Twilio embeds in its calculator (September 2026). Check them against Meta's current rate card before budgeting.
