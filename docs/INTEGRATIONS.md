# Integrations

Adapters are thin and swappable; the demo runs on simulators. Research, fees and acceptable-use quotes:
[research/PAYMENTS-LOGISTICS-RESEARCH.md](research/PAYMENTS-LOGISTICS-RESEARCH.md).

## Card present — the till's card tender (`src/server/payments.ts`, `NEXT_PUBLIC_TAP_PROVIDER`)

| Option | Status | Notes |
|---|---|---|
| **Yoco card machine, stand-alone** (chosen) | **Built** — `YOCO` | The store's own Yoco machine next to the till. The payment sheet's **Card · Yoco** tells the cashier to charge the amount on the machine, then takes the machine's reference (required) and the card's last 4 (optional), and records `Payment { method: CARD, provider: "YOCO", reference, cardLast4 }` (`cardMachineTender` in `src/components/pos/lib/rules.ts`). The machine has its own connection, so it works while the till is **offline**: the sale queues and syncs like a cash sale. Each store is merchant of record on its own Yoco account. |
| **Yoco Payment SDK till app** (next) | Planned | An Android till app that drives the Yoco machine itself (`YocoSDK.charge(amountInCents, …)` → `PaymentResult` with `transactionId` / `clientTransactionId`), so nobody keys references and the amount can't be mistyped. Yoco gives SDK integration keys to a limited number of partners: apply through Yoco's SDK integration form; needs a Yoco merchant account and a paired machine. |
| Halo Dot Halo.Link | Adapter slot `HALO_APPLINK` (kept) | PCI MPoC-certified SoftPOS. Backend creates a session per transaction with **that store's merchant ID** (`/consumer/applink` or `/consumer/intentTransaction`), the POS hands off to Halo.Go and receives the result. Android 11+ with Google services; no developer options. Tap on glass needs a connection. |
| External terminal | Built — `EXTERNAL` | Any bank/fintech device the owner already has; the POS records the approval code. |
| Simulated | Default | `NEXT_PUBLIC_TAP_PROVIDER=SIMULATED` — full tap-on-glass UI flow for training and demos. |

Set `NEXT_PUBLIC_TAP_PROVIDER` in the app's runtime environment (the server reads it and sends it to the tills). Don't
set it where the image is built: Next freezes `NEXT_PUBLIC_` values that exist at build time.

**Acceptable use — clear it with the payment provider in writing before go-live.** In store the owner has chosen Yoco
card machines. Online the owner has chosen **Peach Payments**, because Yoco's policy bans CBD (see Online payments
below). Our research ([research/PAYMENTS-LOGISTICS-RESEARCH.md](research/PAYMENTS-LOGISTICS-RESEARCH.md)) found that
Yoco's published prohibited-business list names cannabis and CBD products, and card-not-present sales by drug stores
and pharmacies. Peach lists CBD, drug stores and pharmacies as restricted, needing its prior written approval, and
doesn't permit cannabis products and dispensaries. Describe the business honestly (**SAHPRA-licensed medical dispensary
+ CBD/wellness retail; licensed THC is collect-only, never couriered**) and get written approval for each account
before taking live payments: Peach for Vantax (Pty) Ltd online, and Yoco for every store's account in store. Never
mis-code the MCC. For reference: PayFast allows CBD only via EFT; Paystack bans drugs and paraphernalia.

Env: `NEXT_PUBLIC_TAP_PROVIDER`; for Halo also `HALO_API_URL`, `HALO_API_KEY` and per-store merchant IDs (roadmap field).

## Online payments — Peach Payments (chosen) and Yoco

`ONLINE_GATEWAY` picks the gateway: `PEACH` (Peach Payments, the owner's choice), `YOCO` (built and kept working, but
Yoco's policy bans CBD) or `SIMULATED` (the default: the demo pay page for demos and tests). Either way there's one
account for the online shop: **Vantax (Pty) Ltd is the merchant**, and the pay page names the HQ company record (the
`FRANCHISOR` company's legal name) as the payee. The sale posts at the fulfilling location on dispatch (the
distribution centre at launch) with an `ONLINE` payment: provider `PEACH` or `YOCO`, reference = the gateway's checkout
id (`Order.paymentRef`).

Shared by both gateways (`src/lib/online-payments.ts`; `applyOnlineEvent` and `refundOnline` in `src/server/orders.ts`):
an order is marked paid only when the checkout and the amount match it; a repeat is a no-op; anything else is logged as
`payment.review` for a person; the order page's received / waiting / cancelled states; and a full refund before a paid
order is cancelled. A paid order is refunded where it was paid (Peach payment ids start `pay_`, Yoco checkouts `ch_`),
so switching `ONLINE_GATEWAY` doesn't strand paid orders; switch when no member is part-way through paying.

### Peach Payments — Peach Orchestration, Hosted Checkout (chosen; waiting for Peach's written approval)

**Status:** built and tested against Peach's documented API with its calls mocked; no Peach keys yet. **Peach lists CBD
as a restricted category that needs its prior written approval, which the owner is applying for. Don't take live
payments until that approval is in writing.** Peach also doesn't permit "cannabis products and dispensaries". So baskets
with licensed products (THC) are paid in store, at collection: checkout offers only **Pay when you collect** for them
and `placeOrder` refuses online payment (the same holds for Yoco, which prohibits cannabis too).

**Which Peach product.** Peach's docs steer new integrations to **Peach Orchestration**, not classic Checkout (V1/V2):
"If you're performing a new integration, use Peach Orchestration's Hosted Checkout and not classic Hosted Checkout".
Their product chooser maps "eCommerce store, redirect" to Orchestration's Hosted Checkout, released 8 September 2026.
So there's no OAuth token, entity ID or nonce: one secret API key authenticates every call, and our own `payment_id`
makes creating a payment idempotent.

1. **Checkout** places the order (`PENDING_PAYMENT`, stock reserved for `unpaidHoldMinutes`) and sends the member to
   `/checkout/pay/[orderId]`.
2. **Pay page** (`payOnline` in `src/app/(shop)/checkout/pay/[orderId]/actions.ts` → `peachCheckoutFor` in
   `src/server/orders.ts`). If the order already has a Peach payment (`paymentRef` `pay_…`), its status comes first:
   `GET {API}/payments/{payment_id}?force_sync=true` (Peach allows 2 a minute per payment).
   - Succeeded: applied at once, exactly like its webhook (the member came back before the webhook landed).
   - Still processing (PayShap, for example): no second payment; the member waits on the order page.
   - Nothing tried yet and the page open for at least another minute: **the same page again**.
   - Failed, abandoned during 3-D Secure, cancelled or expired: a new payment.

   A new payment is `POST {API}/payments` with the header `api-key: $PEACH_API_KEY` and this body:
   `{ payment_id, amount: <amount due in cents, after points>, currency: "ZAR", confirm: false, capture_method:
   "automatic", payment_link: true, session_expiry: <seconds until the order's payment window closes, at least 300>,
   return_url: "${APP_URL}/orders/<code>?pay=peach", merchant_order_reference_id: <order code>, description,
   metadata: { orderId, orderCode }, payment_link_config: { seller_name: "Herbal Holland", theme: "#F5913C" },
   profile_id: $PEACH_PROFILE_ID (if set) }`.

   The `payment_id` is ours: `pay_`, then 25 hex characters derived from the order id, then the attempt (`0`–`9`,
   `a`–`z`), which makes the 30 characters Peach takes. Peach never creates the same `payment_id` twice, so two clicks at
   once give one payment: when Peach refuses the second, we fetch the payment it already has. The next attempt gets the
   next id. The `payment_id` becomes `Order.paymentRef`.
3. The browser then leaves **our** page for `payment_link.link`, Peach's hosted page. It offers every payment method
   enabled on the business profile. The navigation replaces the pay page in the history.
4. **Back on the order page:** Peach sends the member to `return_url` with `status`, `payment_id`, `amount` and more
   added. It's a GET, as long as the profile's `redirect_to_merchant_with_http_post` stays off (the default). That
   `status` is only a hint (`peachReturn` in `src/lib/peach.ts`):
   - succeeded or processing: "Waiting for payment confirmation…", refreshing itself, then "we'll SMS you";
   - failed: "The payment didn't go through";
   - anything else: "Payment cancelled", with **Try again** (the same payment, if nothing was tried on it).

   Once the webhook lands, the page says "Payment received". The return is never taken as proof of payment.
5. **Webhook** `POST /api/payments/peach` (`src/app/api/payments/peach/route.ts`) reads the raw body as bytes and
   verifies it exactly as Peach documents: `x-webhook-signature-512` = hex HMAC-SHA512 of the raw body, keyed with the
   business profile's `payment_response_hash_key` (`PEACH_PAYMENT_RESPONSE_HASH_KEY`), compared in constant time.
   - No valid signature → 401 (Peach's instruction); unreadable → 400.
   - No key configured → 503. Peach retries for 24 hours (1 min, 5 min, 10 min, 1 h, 6 h, 24 h).
   - `applyPeachEvent` handles `payment_succeeded`: the order comes from `metadata.orderId`, its `paymentRef` must
     equal the `payment_id`, and the amount received must equal the amount due, in ZAR. Then `markOrderPaid`
     (compare-and-set, so a redelivery is a no-op) and `order.pay_online` by "Peach Payments".
   - Anything that doesn't fit is never marked paid; it's logged as `payment.review`.
   - `payment_failed`, `refund_succeeded` and `refund_failed` about our orders are logged.
   - Everything else, and other payments on the account (a Dashboard payment link, say), gets 200 and is ignored.

   Peach's scheme has no timestamp header or tolerance window (its retries run for 24 hours), so there's no replay
   check: applying an event twice changes nothing.
   Audit entries carry ids, amounts, mode, card scheme and last 4, and reasons only: no keys, signatures or raw bodies.
6. **Refunds.** Cancelling a paid Peach order (store back office, POS, HQ) first refunds it in full:
   `POST {API}/refunds/list { payment_id }`, then `POST {API}/refunds { payment_id, amount, reason, metadata }` for
   whatever isn't refunded yet (`refundPeachPayment` in `src/server/payments.ts`). So a retried cancel never refunds
   twice, and a part refund already made in the Dashboard is topped up to the full amount.
   - `succeeded`, `pending` or `review` → the order is cancelled as `REFUNDED`, with the refund ids in its events and
     in the audit entry.
   - Any error → the order isn't cancelled, and staff see Peach's message.
   - A later `refund_failed` webhook puts the cancelled order back to `PAID`, with a note to refund by hand
     (`payment.refund_failed`). Card refunds take up to 14 business days to reach the member.
7. **Refunds by payment method** (Orchestration → Payment methods):
   - Refundable: cards, Apple Pay, Google Pay, Samsung Pay, PayShap (one refund), Payflex, Float, Happy Pay, Mobicred,
     RCS, 1Voucher and MoneyBadger. Scan to Pay refunds in full only, and not for debit cards.
   - **Not refundable: Peach EFT, Capitec Pay, ZeroPay** and PayJustNow online. An order paid that way can't be
     refunded by the app, so it can't be cancelled there either. Leave those methods off the profile, or refund by EFT
     with Peach support's help.

**Webhook URL to register:** `https://<APP_URL host>/api/payments/peach` (for example
`https://herbalholland.co.za/api/payments/peach`). In the Peach Dashboard: **Peach Orchestration** → Webhooks → **+ Add
webhook URL**. Or use the business profile API's `webhook_details`, with payment succeeded / failed and refund
succeeded / failed switched on.

The signing key is the profile's `payment_response_hash_key`, which also signs the return redirect. Read it with
`GET {API}/account/{merchant_id}/business_profile/{profile_id}` and the API key (`GET {API}/payments/list?limit=1`
shows both ids), or ask Peach support. Don't replace it through the profile API unless you mean to: the profile is
shared by everything on the account.

**Test vs live:**

| | `PEACH_ENV=test` (the default) | `PEACH_ENV=live` |
|---|---|---|
| API | `https://app.sandbox-next.peachpayments.com/api` | `https://app.next.peachpayments.com/api` |
| Dashboard | The sandbox Dashboard | The live Dashboard |
| Secret API key | `snd_…` | `prd_…` |

Each environment has its own keys, profile, webhook and hash key, so change `PEACH_ENV`, `PEACH_API_KEY`,
`PEACH_PROFILE_ID` and `PEACH_PAYMENT_RESPONSE_HASH_KEY` together. Sandbox test cards are behind the playground's
**Test credentials** button. Amount-based decline tests (the last two digits of the amount, so R10.51 declines with 51,
insufficient funds) need Peach support to switch them on. Unlike Yoco's test keys, sandbox payments can be refunded.

**Peach docs relied on** (read 28 September 2026):

- Which product to use:
  [Checkout overview](https://developer.peachpayments.com/docs/checkout-overview),
  [Hosted Checkout V2](https://developer.peachpayments.com/docs/v2-checkout-hosted) and
  [Payment methods → Choose the right product](https://developer.peachpayments.com/docs/pp-payment-methods).
- The flow:
  [Hosted Checkout](https://playground.peachpayments.com/integrate/hosted-checkout),
  [Webhooks (signature, events, retries)](https://playground.peachpayments.com/flows/webhooks),
  [Operate: webhooks](https://playground.peachpayments.com/operate/webhooks),
  [Operate: profile](https://playground.peachpayments.com/operate/profile),
  [3DS and the return leg](https://playground.peachpayments.com/concepts/three-ds-next-action) and
  [Payment states](https://playground.peachpayments.com/payment-states).
- The API and its schemas:
  [API reference](https://playground.peachpayments.com/playground) and
  [OpenAPI spec](https://playground.peachpayments.com/openapi.json) (`payment_id`, the payment, refund and webhook
  objects, statuses and event types).
- Refunds, testing and environments:
  [Manage transactions](https://playground.peachpayments.com/docs/manage-transactions),
  [Payment methods and refunds](https://playground.peachpayments.com/operate/payment-methods),
  [Testing](https://playground.peachpayments.com/docs/testing),
  [Release notes](https://playground.peachpayments.com/docs/release-notes) and
  [Web SDK (API hosts and key prefixes)](https://playground.peachpayments.com/sdk-web).
- Indexes: [developer.peachpayments.com/llms.txt](https://developer.peachpayments.com/llms.txt) and
  [playground.peachpayments.com/llms.txt](https://playground.peachpayments.com/llms.txt).

### Yoco Checkout API (built; kept, but Yoco's policy bans CBD)

`ONLINE_GATEWAY=YOCO`: one Yoco account for the online shop; payments post with provider `YOCO`, reference = the Yoco
checkout id.

1. **Checkout** places the order (`PENDING_PAYMENT`, stock reserved for `unpaidHoldMinutes`) and sends the member to
   `/checkout/pay/[orderId]`.
2. **Pay page** (`payOnline` in `src/app/(shop)/checkout/pay/[orderId]/actions.ts` → `yocoCheckoutFor` in
   `src/server/orders.ts`): `POST https://payments.yoco.com/api/checkouts`, `Authorization: Bearer $YOCO_SECRET_KEY`,
   `Idempotency-Key: <order id>`, body `{ amount: <amount due in cents, after points>, currency: "ZAR", successUrl,
   cancelUrl, failureUrl, metadata: { orderId, orderCode }, externalId: <order code> }`. The three URLs are
   `${APP_URL}/orders/<code>?pay=success|cancelled|failed`. The checkout id is saved as `Order.paymentRef`. Asking again
   (a retry, or **Try again** after cancelling) sends the same key, and Yoco replays the same checkout (keys live 24 hours;
   unpaid orders are released long before). Yoco doesn't take payments under R2.00.
3. The browser then leaves **our** page for the checkout's `redirectUrl` (a script navigation that replaces the pay page
   in the history). Live payments must come from a verified domain: Yoco checks where the member came from, so keep
   `Referrer-Policy: strict-origin-when-cross-origin` (next.config.ts) and never send members a raw Yoco link.
4. **Webhook** `POST /api/payments/yoco` (`src/app/api/payments/yoco/route.ts`): reads the raw body and verifies it the way
   Yoco documents (Standard Webhooks): `webhook-signature` holds `v1,<base64 HMAC-SHA256>` entries over
   `${webhook-id}.${webhook-timestamp}.${raw body}`, keyed with the base64-decoded part of `whsec_…` after the prefix;
   constant-time compare; timestamps more than 5 minutes off are refused (`src/lib/yoco.ts`). Then `applyYocoEvent`:
   `payment.succeeded` → the order from `metadata.orderId`, whose `paymentRef` must equal `metadata.checkoutId`, and the
   amount must equal the amount due → `markOrderPaid` (compare-and-set, so a redelivery is a no-op). A mismatch is never
   marked paid: it's logged as `payment.review` for a person. `payment.failed`, `refund.succeeded`, `refund.failed` about
   our orders are logged; anything else, or another business's payment on the account, gets 200 and is ignored. Bad
   signature → 400; no `YOCO_WEBHOOK_SECRET` → 503 (Yoco retries each event for about a day, so nothing is lost while
   it's set up). Audit entries carry ids, amounts, mode, card scheme + last 4 and reasons only — no keys, signatures or
   raw bodies.
5. **Back on the order page:** "Payment received" once the webhook has landed; before that "Waiting for payment
   confirmation…", refreshing itself every 3 seconds (10 times, then it says we'll SMS); after cancel or failure
   "Payment cancelled" with **Try again** (same checkout). `successUrl` is never taken as proof of payment.
6. **Refunds:** cancelling a paid Yoco order (store back office, POS, HQ) first calls
   `POST https://payments.yoco.com/api/checkouts/{checkoutId}/refund` with the full amount due and
   `Idempotency-Key: <order id>:refund`. `succeeded` or `pending` → the order is cancelled as `REFUNDED`, with the refund
   id in its events and the audit entry. Any error → the order isn't cancelled and staff see Yoco's message. If a
   pending refund later fails (`refund.failed`), the cancelled order goes back to `PAID`, with a note to refund by hand
   (`payment.refund_failed` in the audit log). Partial refunds: in the Yoco portal. Test keys: Yoco can't refund test
   payments, so the refund call is skipped (noted on the order).

**Webhook URL to register:** `https://<APP_URL host>/api/payments/yoco` (e.g. `https://herbalholland.co.za/api/payments/yoco`).
Register it once per mode with that mode's secret key: `POST https://payments.yoco.com/api/webhooks` with
`{ "name": "herbal-holland", "url": "…/api/payments/yoco" }`. The response's `secret` (`whsec_…`) is shown **once**:
it's `YOCO_WEBHOOK_SECRET`. Yoco allows 5 webhooks per account; `GET /api/webhooks` lists them.

**Test vs live keys:** `sk_test_…` keys are available at once (Yoco app → Checkout API integration → How to connect →
Test keys; test card details are on the same page). Test payments don't reach the sales history and can't be refunded.
`sk_live_…` keys unlock once a domain is verified there (**Verified Domains**), and live payments must start on a
verified domain. A test and a live webhook have different secrets: switch `YOCO_SECRET_KEY` and `YOCO_WEBHOOK_SECRET`
together.

## Couriers

Recommended: **Bob Go** (aggregator API: The Courier Guy, RAM, Fastway, SkyNet, Pargo, lockers) with The Courier Guy
direct as backup and **Pargo** for pickup points (ID + code on collection). Couriers ban drugs/medicines and several ban
CBD, so the class × channel matrix keeps licensed products on click & collect and own-fleet same-day delivery with an ID
check at the door (recorded as `Order.idChecked`). Order dispatch stores `courier` + `trackingNo`.

## Messaging (`src/server/messaging.ts`, `email.ts`)

| Channel | Use | Provider slot |
|---|---|---|
| SMS | OTP, order updates, marketing (consented) | `MESSAGING_PROVIDER=smsportal` — **built** (REST v3 `BulkMessages`, Basic auth, ≤ 500 per call). Other gateways (Clickatell, BulkSMS) slot into `deliver()` in `messaging.ts` |
| Email | Tax invoices, statements, campaigns | `SMTP_URL` (Amazon SES af-south-1, Everlytic, Postmark; pooled connections), `EMAIL_FROM`. Campaign emails carry a signed unsubscribe link and `List-Unsubscribe` one-click headers (RFC 8058) → `/api/unsubscribe` |
| App push | Rewards PWA: drop alerts, campaigns (consented) | Web Push — **built** (`web-push`, VAPID: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`; generate keys with `npx web-push generate-vapid-keys`). Without keys pushes are only logged. iPhones need the app on the Home Screen (iOS 16.4+). When a browser rotates a subscription, the Rewards service worker re-subscribes and saves it (`/api/push/renew`); dead subscriptions are pruned on send |
| WhatsApp | Utility only, neutral wording | Meta's policy bans drug/medical products — `TRANSACTIONAL_CHANNEL=WHATSAPP` only after review |

Without providers configured, messages and emails are written to `MessageLog` so every notification is visible in the
demo. With a live provider every message is still logged with its status (`SENT` / `FAILED` + reason); sign-in codes are
masked in the log, and a failed code send tells the customer to retry. SMS codes end with `@<host> #<code>` so phones
can autofill them. SMSPortal keeps its own STOP-reply opt-out list; import it into `Suppression` monthly with the NCC
registry until an inbound webhook syncs it.

## ID verification

Local checks first (Luhn, real date, 18+). For live verification at sign-up: **VerifyNow** (SA ID check R2.99,
real-time Home Affairs + photo R29.90) with **Smile ID** as fallback. Record the result as `AgeCheck = VERIFIED`. The POS
can read the Smart ID card's PDF417 barcode (DOB + ID number) with a camera scanner.

## Accounting

Per-store ledgers in **Sage Business Cloud** or **Xero**: post a daily summary journal per store (net sales, VAT,
tenders, COGS, points) from `DailyStoreStat`. Invoices already carry structured data for SARS e-invoicing (VAT
modernisation, phased from 2030).

## Merch partner — made-to-order merch (`src/server/pod.ts`, `merch.ts`)

Merch is made to order in South Africa and couriered, white-label, straight to the customer: no stock, no minimums.
Upmarket by design — every logo is embroidered; only the big back graphics and the tote are printed.

**Partner: Lucani, Cape Town** (Digihuis (Pty) Ltd; trade account: lucani.co.za/trade-account-application). The only
South African partner found that does all of it from one piece: embroidery on tees, hoodies and caps, DTF prints on
the same garment, white-label trade fulfilment (advertised), a digital proof before every job, and terms that only
refuse unlawful/obscene artwork (nothing on cannabis or CBD). Digitising is once-off per design (R200–R500 in their
guides; our three stitched designs are digitised once each). Production 3–5 business days, then 1–3 days to metros
(3–5 regional). Not VAT-registered: their invoices carry no VAT. Blanks are mid-weight (185 g tee, 240–280 g
fleece) — ask for heavier.

- **Runner-up: OneOff, Johannesburg** — better 100% cotton blanks (260 g hoodie, 220 g tee), DTF++ with an orange ink
  channel, embroidery up to 27 × 27 cm, flat R150 drop-ship; but its terms bar products that "encourage the use of
  drugs" and it doesn't proof by default.
- **Beanies and bucket hats:** Lucani embroiders trade blanks it buys per order (its quote form already lists both):
  Captivity's Glacier Ribbed cuffed beanie and Phoenix 100% cotton-twill bucket hat (Cape Town wholesaler, no minimum,
  ready in 24–48 h), or TwentyFour's Rib Knit Cuffed and Max Wash for a more premium feel. The beanie cuff takes the
  40 mm cut of the Mark, stitched through the outer layer only. Fallback: GetCapped (Johannesburg) — beanie R99.95,
  Phoenix bucket hat R129.95, embroidery included, R180 digitising once, 5–7 days + 2–3 courier — only if it confirms
  blind shipping in writing.
- No global print-on-demand network embroiders in South Africa (Printful, Gelato, Printify, Teelaunch).

No South African partner has an API, so the platform works by email:

1. A paid order with merch → the frequent job emails the partner a **production order** (`POD_EMAIL`): recipient,
   items (our product code, blank, size, quantity) and, per placement, embroidery or DTF, where it goes, its size and
   links to our files — the vector PDF (for digitising and DTF) and a 300 dpi PNG. Also kept in HQ → Messages.
2. The partner makes it, packs white-label and couriers to the customer, then emails back the courier and tracking.
3. The distribution centre enters it on the order (**Merch shipped**): the customer is texted their tracking, and a
   merch-only order goes out for delivery (the sale posts at the partner's price, booked to the DC).
4. On delivery the DC marks the order delivered, as for any courier order.

Before the first sale, get in writing: that they'll make merch for a CBD/hemp wellness brand (send the logo and a back
print); that they'll add the beanie and bucket hat as trade products (blanks bought per order or a few kept in stock,
and the extra lead time); embroidery at quantity 1 with no per-order setup or reseller minimum; digitising cost per design and who owns
the stitch file; per-piece prices at 1, 5 and 10 units for the tee, hoodie, crewneck, cap and tote; their thread
chart (a sew-out of the closest match to Sunset 500 #F5913C); which blanks (black and orange in stock, heavier
options, a crewneck and a tote); white-label details (plain packaging, no partner invoice inside, our insert, return
address); email ordering and tracking replies; courier rates; payment terms; misprint/reprint policy; and an opt-out
from promotional photography. Then approve a paid sample set, set each variant's partner code and cost (HQ →
Catalogue), and set `POD_EMAIL` / `POD_PARTNER_NAME` and the merch courier fee (HQ → Online orders).

## Social posting — Postiz (`src/server/social.ts`)

HQ → Campaigns → **Social** writes a post once and publishes or schedules it on the brand's Instagram, Facebook,
LinkedIn, X and Threads through [Postiz](https://postiz.com): open source, free when self-hosted, no limit on
channels or posts. Captions are screened as you type (`screenSocial`: every `screenCopy` rule, plus no THC and no
selling cannabis or CBD) and the pictures on offer are brand artwork only (`public/social`, rendered by
`npx tsx scripts/merch-export.tsx --social`). Without Postiz, posts are only recorded on the page.

1. Run Postiz with its Docker Compose file (it brings its own PostgreSQL and Redis) on a small VPS behind HTTPS,
   e.g. `https://social.herbalholland.co.za`. Postiz cloud (paid) has the same API.
2. Connect the accounts in Postiz: Instagram (business account linked to the Facebook Page), Facebook Page, LinkedIn
   Page, X and Threads. A self-hosted Postiz needs each network's developer-app keys in its environment (Postiz docs →
   Providers).
3. Postiz → Settings → Public API: copy the key. Set `POSTIZ_URL` (`https://social.herbalholland.co.za/api/public/v1`;
   Postiz cloud: `https://api.postiz.com/public/v1`) and `POSTIZ_API_KEY`.
4. `APP_URL` must be public HTTPS: Postiz fetches the picture from `${APP_URL}/social/<picture>.jpg`.

A post goes out **now**, **scheduled** (Postiz publishes it at that time, SAST in the composer) or as a **draft** in
Postiz (to add a video or edit per network). Edit or delete scheduled posts in Postiz. Postiz accepts 90 posts an hour
through its API; the composer holds captions to X's 280 and Threads' 500 characters when those are ticked, and
Instagram needs a picture. TikTok and YouTube aren't offered (video only, and TikTok bans cannabis content). Meta
rejects cannabis and CBD ads, so this is organic posting only — no boosting.

Free alternatives if Postiz doesn't suit: Buffer's free plan (3 channels, 10 queued posts each), Meta Business Suite
(Facebook and Instagram only) or Mixpost Lite (self-hosted, fewer networks). None of them gives us a free API for all
five networks, so they're used by hand, outside this platform.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `DATABASE_POOL_MAX` | Connections per app instance (default 10); keep instances × pool under the database's limit (or use PgBouncer) |
| `SESSION_SECRET` | 32+ random bytes; signs invoice links, hashes ID numbers |
| `APP_URL` | Public base URL (links in emails) |
| `SITE_ENQUIRY_SECRET` | Shared with the herbalholland.com Worker (its `APP_ENQUIRY_SECRET`): lets it hand franchise enquiries to `POST /api/site/enquiries`, which files them as HQ → Franchise leads. Unset, the endpoint refuses everything |
| `FRANCHISE_EMAIL` | Where new franchise enquiries are emailed (default `franchise@herbalholland.com`) |
| `SUPPORT_EMAIL` | The address members are told to write to when a support request can't go through the form (default `hello@herbalholland.co.za`; the franchisor company's email is shown on `/support`) |
| `DEMO_MODE` | `true` enables demo logins and OTP codes on screen — **must be false in production** |
| `CONTENT_REVIEWER` | `Name\|Job title\|Registration` (e.g. `Jane Doe\|Pharmacist\|SAPC P12345`): shown as "Reviewed by" on Learn guides and as `Article.reviewedBy`. Unset = no reviewer shown ([SEO.md](SEO.md)) |
| `ORG_SAME_AS` | Comma-separated official profile URLs for the `Organization.sameAs` schema on the home page; empty until the profiles exist |
| `SMTP_URL`, `EMAIL_FROM` | Email |
| `MESSAGING_PROVIDER`, `SMSPORTAL_CLIENT_ID`, `SMSPORTAL_API_SECRET`, `SMS_SENDER_ID`, `TRANSACTIONAL_CHANNEL` | SMS/WhatsApp adapters |
| `NEXT_PUBLIC_TAP_PROVIDER` | The till's card tender: `SIMULATED` (default) \| `YOCO` (stand-alone Yoco machine) \| `HALO_APPLINK` \| `EXTERNAL`. Runtime environment only (see Card present) |
| `HALO_API_URL`, `HALO_API_KEY` | Halo Dot tap on glass (`HALO_APPLINK`) |
| `ONLINE_GATEWAY` | Online payments: `SIMULATED` (default: demo pay page) \| `PEACH` (Peach Payments, chosen) \| `YOCO` |
| `PEACH_ENV` | Peach Payments environment: `test` (default: the sandbox, `https://app.sandbox-next.peachpayments.com/api`) \| `live` (`https://app.next.peachpayments.com/api`) |
| `PEACH_API_KEY` | Peach Orchestration secret API key (`snd_…` sandbox, `prd_…` live; Dashboard → Peach Orchestration), sent in the `api-key` header. Server only |
| `PEACH_PROFILE_ID` | Peach business profile (`pro_…`) for payments. Optional: needed only if the account has more than one profile |
| `PEACH_PAYMENT_RESPONSE_HASH_KEY` | The business profile's `payment_response_hash_key`, which signs the webhook (`/api/payments/peach`, `x-webhook-signature-512`). Unset: the webhook answers 503 |
| `YOCO_SECRET_KEY` | Yoco Checkout API secret key: `sk_test_…` while testing, `sk_live_…` once a domain is verified. Server only |
| `YOCO_WEBHOOK_SECRET` | The `whsec_…` secret Yoco returned when the webhook (`/api/payments/yoco`) was registered with that same mode's key. Unset: the webhook answers 503 |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | Rewards app push (VAPID) |
| `POD_EMAIL`, `POD_PARTNER_NAME` | Merch partner's order inbox and name (made-to-order merch); unset = production orders only logged |
| `POSTIZ_URL`, `POSTIZ_API_KEY` | Postiz public API for social posts; unset = posts only recorded |
| `CRON_SECRET` | Protects `/api/cron/*` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Banking slips in Cloudflare R2 (or any S3-compatible store); region `auto` for R2. Unset = files on disk |
| `UPLOAD_DIR` | Where slips are kept when no bucket is set (default `.data/uploads`; `/data/uploads` in the Docker image — mount a volume there) — back it up |
