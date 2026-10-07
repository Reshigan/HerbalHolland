# Integrations

Adapters are thin and swappable; the demo runs on simulators. Research, fees and acceptable-use quotes:
[research/PAYMENTS-LOGISTICS-RESEARCH.md](research/PAYMENTS-LOGISTICS-RESEARCH.md).

## Card present: the till's card tender (`src/server/payments.ts`, `NEXT_PUBLIC_TAP_PROVIDER`)

| Option | Status | Notes |
|---|---|---|
| **Yoco card machine, stand-alone** (chosen) | **Built** (`YOCO`) | The store's own Yoco machine next to the till. The payment sheet's **Card · Yoco** tells the cashier to charge the amount on the machine, then takes the machine's reference (required) and the card's last 4 (optional), and records `Payment { method: CARD, provider: "YOCO", reference, cardLast4 }` (`cardMachineTender` in `src/components/pos/lib/rules.ts`). The machine has its own connection, so it works while the till is **offline**: the sale queues and syncs like a cash sale. Each store is merchant of record on its own Yoco account. |
| **Yoco Payment SDK till app** (next) | Planned | An Android till app that drives the Yoco machine itself (`YocoSDK.charge(amountInCents, …)` → `PaymentResult` with `transactionId` / `clientTransactionId`), so nobody keys references and the amount can't be mistyped. Yoco gives SDK integration keys to a limited number of partners: apply through Yoco's SDK integration form; needs a Yoco merchant account and a paired machine. |
| Halo Dot Halo.Link | Adapter slot `HALO_APPLINK` (kept) | PCI MPoC-certified SoftPOS. Backend creates a session per transaction with **that store's merchant ID** (`/consumer/applink` or `/consumer/intentTransaction`), the POS hands off to Halo.Go and receives the result. Android 11+ with Google services; no developer options. Tap on glass needs a connection. |
| External terminal | Built (`EXTERNAL`); the default in production | Any bank/fintech device the owner already has; the POS records the approval code. |
| Simulated | The default in demos and development | `NEXT_PUBLIC_TAP_PROVIDER=SIMULATED`: the full tap-on-glass UI flow for training and demos. |

Set `NEXT_PUBLIC_TAP_PROVIDER` in the app's runtime environment (the server reads it and sends it to the tills). Don't
set it where the image is built: Next freezes `NEXT_PUBLIC_` values that exist at build time.

**Acceptable use: clear it with the payment provider in writing before go-live.** In store the owner has chosen Yoco
card machines. Online the owner has chosen **Peach Payments**, because Yoco's policy bans CBD (see Online payments
below). Our research ([research/PAYMENTS-LOGISTICS-RESEARCH.md](research/PAYMENTS-LOGISTICS-RESEARCH.md)) found that
Yoco's published prohibited-business list names cannabis and CBD products, and card-not-present sales by drug stores
and pharmacies. Peach lists CBD, drug stores and pharmacies as restricted, needing its prior written approval, and
doesn't permit cannabis products and dispensaries. Describe the business honestly (**SAHPRA-licensed medical dispensary
+ CBD/wellness retail; licensed THC is collect-only, never couriered**) and get written approval for each account
before taking live payments: Peach for Vantax (Pty) Ltd online, and Yoco for every store's account in store. Never
mis-code the MCC. For reference: PayFast allows CBD only via EFT; Paystack bans drugs and paraphernalia.

Env: `NEXT_PUBLIC_TAP_PROVIDER`; for Halo also `HALO_API_URL`, `HALO_API_KEY` and `HALO_MERCHANT_ID` (or a store's own `HALO_MERCHANT_ID_<STORECODE>`, which wins).

## Online payments: Peach Payments (chosen) and Yoco

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

### Peach Payments: Peach Orchestration, Hosted Checkout (chosen; waiting for Peach's written approval)

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
   it's set up). Audit entries carry ids, amounts, mode, card scheme + last 4 and reasons only: no keys, signatures or
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
`sk_live_…` keys become available once a domain is verified there (**Verified Domains**), and live payments must start on a
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
| SMS | OTP, order updates, marketing (consented) | `MESSAGING_PROVIDER=smsportal`, **built** (REST v3 `BulkMessages`, Basic auth, ≤ 500 per call). Other gateways (Clickatell, BulkSMS) slot into `deliver()` in `messaging.ts` |
| Email | Tax invoices, statements, campaigns | `SMTP_URL` (Amazon SES af-south-1, Everlytic, Postmark; pooled connections), `EMAIL_FROM`. Campaign emails carry a signed unsubscribe link and `List-Unsubscribe` one-click headers (RFC 8058) → `/api/unsubscribe` |
| App push | Rewards PWA: drop alerts, campaigns (consented) | Web Push, **built** (`web-push`, VAPID: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`; generate keys with `npx web-push generate-vapid-keys`). Without keys pushes are only logged. iPhones need the app on the Home Screen (iOS 16.4+). When a browser rotates a subscription, the Rewards service worker re-subscribes and saves it (`/api/push/renew`); dead subscriptions are pruned on send |
| WhatsApp | Utility only, neutral wording | Meta's policy bans drug/medical products, so `TRANSACTIONAL_CHANNEL=WHATSAPP` only after review |

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

The books are kept in the platform (`/books`; ARCHITECTURE → Accounting), so there is no outside ledger to sync.
- **Bank statements** arrive as files; there is no live bank feed. The import reads the CSV downloads of FNB, Absa,
  Standard Bank, Nedbank and Capitec (online banking → the account → download or export the transactions as CSV),
  OFX/QFX, or any CSV once its columns are named. Each file is kept in storage (`putObject`: R2/S3 or `UPLOAD_DIR`)
  under `bank-statements/<company>/<month>/` and served only through the app, to that company's books users.
- **For an outside accountant or auditor:** every report downloads as CSV (trial balance, general ledger, journals,
  ageing, VAT), and the management pack and reconciliations print to PDF. The company's accountant can also sign in
  with their own login (role Accountant, one company only).
- **SARS:** the VAT201 working per period is copied into eFiling; filing stays with the vendor. Invoices already carry
  structured data for SARS e-invoicing (VAT modernisation, phased from 2030).

## Merch (`src/lib/merch.ts`; made to order: `src/server/pod.ts`, `merch.ts`)

The merch range (Windmill Tee, Sunset Hoodie, Heritage Crewneck, Windmill Cap, Sunset Bucket Hat, Windmill Beanie and
Windmill Tote) is held in stock and sold like the rest of the range: received, counted and ranged to the stores, then
delivered to the member's door or collected in store. Upmarket by design: every logo is embroidered, and only the big
back graphics and the tote are printed (DTF). `scripts/merch-export.tsx` renders the embroidery and print files.

The platform can also sell a variant made to order: give it a merch partner code (HQ → Catalogue) and it carries no
stock and ships by courier only, with the merch courier fee on top. Nothing in the range uses it today. Partners have
no API, so the platform works by email:

1. A paid order with a made-to-order variant → the frequent job emails the partner a **production order** (`POD_EMAIL`): recipient,
   items (our product code, blank, size, quantity) and, per placement, embroidery or DTF, where it goes, its size and
   links to our files (the vector PDF for digitising and DTF, and a 300 dpi PNG). Also kept in HQ → Messages.
2. The partner makes it, packs white-label and couriers to the customer, then emails back the courier and tracking.
3. The distribution centre enters it on the order (**Merch shipped**): the customer is texted their tracking, and an
   order of only made-to-order items goes out for delivery (the sale posts at the partner's price, booked to the DC).
4. On delivery the DC marks the order delivered, as for any courier order.

Before selling anything made to order, get the partner's terms in writing (that it makes merch for a CBD and hemp
wellness brand, per-piece prices, white-label packing, tracking by email), then set the variant's partner code and
cost (HQ → Catalogue), `POD_EMAIL` / `POD_PARTNER_NAME` and the merch courier fee (HQ → Online orders).

## Social posting with Postiz, and the Campaign Studio (`src/server/social.ts`, `src/server/studio.ts`)

HQ → Marketing → **Studio** lays a whole campaign out from one day, its day T. The playbooks are in
`src/lib/studio-playbooks/`, one file per pack: the launch's six campaigns (`launch.ts`: brand launch, online shop
launch, store opening, Founding Members, hiring, merch drop), a product launch (`new-online.ts`), a month of Google
posts for one store (`google.ts`), the gift email (`gifts.ts`) and the month packs (`festive.ts`, `january.ts`,
`february.ts`, `march.ts`). Every post comes with its brand card, checked for the channel it goes on (`screenDraft`:
the copy rules, the platforms' rules, lengths, public holidays). HQ approves, then **Schedule what's approved** queues
them in the platform, and the `frequent` job (every 15 minutes) releases each at its time: a social post goes to
[Postiz](https://postiz.com) with its card, to publish straight away, and an email, SMS or push becomes a Campaign to
the members who said yes (held for the next legal send window when needed). **Pause releases** holds a whole campaign
until it's resumed; **Take back** returns a queued post to draft. A post more than six hours late (paused, or the
scheduler stopped) isn't sent: it fails, to be given a new time. HQ → Marketing → **Social** still posts one-off
captions with the brand pictures in `public/social`. Postiz is open source and free when self-hosted, with no limit on
channels or posts. Without it, social posts wait in the Studio to be posted by hand (copy the words, download the card).

**Laying a campaign out** (`layout`, `spreadFeed` and `firstDayT` in `src/lib/studio.ts`; `createPlan` in
`src/server/studio.ts`):

- **Day T falls on the pack's weekday.** Each playbook names its weekday and why: a Tuesday for the brand launch, the
  shop launch, a store opening and a product launch; a Friday for hiring (applications close at the end of a working
  week); a Sunday for the Founding Members list (it closes at midnight); a Thursday for a merch drop; a Monday for a
  Google month. Any other day is refused, with the reason. The month packs and the gift email are written for their
  own dates and can't be laid out once those have passed. A post whose day has already gone is left out.
- **Pinned posts never move.** A post whose words name its day ("today", "tonight", "tomorrow", "7 days to go", "last
  call") is pinned. If that day is a public holiday, or a Sunday for an email, SMS or push, the Studio refuses day T
  and names the post; `firstDayT` finds the first day T a pack can start on. Any other post moves off a public holiday
  to the next day that allows it, and members' messages move off Sundays (CPA Regulation 4), each with a note.
- **One feed post a day, across every campaign.** A feed post that lands on a day another campaign already posts on
  moves up to three days later, at the same time and never onto a public holiday; with no room, it keeps its day and
  is marked "Shares its day with another post: move one". A pinned post stays where it is (opening day has its
  morning and its evening) and notes any other campaign's post that day. LinkedIn-only posts don't count.
- **Product launches** (New online): name the product by its page address (slug) or a SKU. Its name, its facts
  (`productFacts`: the pack size, the CBD a pack and a day, its allergens), its category and its link fill the copy,
  and the email and push go to the members who chose its interest (`interestFor`). Licensed medicines are refused:
  they're never marketed.
- **Products going live are announced on their own** (`announceProducts`): a new or draft product saved as Active, on
  its page or by the catalogue import, with "Announce it" ticked (the default), is laid out as drafts on the first free
  Tuesday in `NEW_ONLINE_DAYS` (the second and fourth Tuesdays the content plan keeps; the calendar test holds the
  limits on each) a week or more away, one product a Tuesday, in name order. A product gets one launch
  (`StudioPlan.productId`); skipping every post of a launch frees its Tuesday. When the plan has no Tuesday left, the
  notice says to lay it out by hand. The next content plan adds its Tuesdays.

**The launch** (`createLaunch`; HQ → Marketing → Studio → The launch): three days in order, the brand, the shop and
the doors, and the stores that open. The brand launches at least 14 days before the shop, and the doors open at least
33 days after it (`LAUNCH_GAPS`), so every store is revealed once the shop is open; the brand's posts stop when the
shop opens. Stores opening on the same day share their big moments: the shared posts (the invitations, _The Windmill_,
No. 2, the windows, the countdown, and opening week on the feed, by email and on the WhatsApp Channel) go out once, from the
first store's campaign, naming every town. The stores take turns with their own feed posts (the reveal, promise,
neighbourhood, team and thank-you), a week apart: the second store's go 7 days after the first's, off public holidays,
so each town gets its moment. Each store's members' messages and Google posts keep their days.

**Audiences.** A store's email, SMS and push go to that store's members, and a network campaign's to every member,
unless the post names an audience: then its Campaign goes to that segment, network-wide (`ALL`, a tier, an interest or
an RFM segment). The shared opening-week email and _The Windmill_, No. 2 are `ALL`, so every member hears once however
many stores open, and a merch drop's email goes to the members who chose merch. Each post shows who it goes to ("To:
All members", "To: Into Merch & apparel", "To: First-access list").

**LinkedIn.** A social post goes to LinkedIn only when its playbook says so, and the post shows it: **LinkedIn too**
(`also`) goes to every connected account, LinkedIn included; **LinkedIn only** (`only`) goes to the LinkedIn page
alone, and fails at its time if no LinkedIn page is connected in Postiz. Every other social post skips LinkedIn.

**Briefs, and posting by hand.** Many social posts carry a brief, shown as **Shoot:**: the photo or Reel that makes
the post, with adults over 25 who've signed a release. Until someone shoots it, the card goes out. **I'll post it by
hand** keeps a post out of Postiz (copy the words, post it with the photo or video, then **Mark posted** with its
link); **Send the card through Postiz** puts it back. A post can switch while it's a draft, approved or failed.

**The first-access list** (`src/server/early-access.ts`, `src/lib/early-access.ts`): the people who asked
herbalholland.com to hear the day the online shop opens. The day before, HQ pastes the site's D1 export into the
Studio's **First-access list** card ([RUNBOOK.md](RUNBOOK.md) has the command): the `--json` output of
`wrangler d1 execute`, a plain JSON array, or a CSV with a header row. Emails are kept lower-case and mobiles as +27; a
row with neither is left out, and anyone already on the list is skipped. The online shop launch is its only use: on
opening day an SMS at 09:00 goes to those who gave only a mobile, and an email at 09:05 to those who gave an email (the
`early-access` audience, which only email and SMS can have), so each person hears once, inside the legal send times
and with an opt-out. The do-not-contact list applies, and anyone who has joined Rewards by then hears with the members
instead. Every sign-up is deleted as its message goes (POPIA: kept no longer than its purpose), and **Delete the
list** clears it by hand. Until then, a member's POPIA export and erasure (`src/server/popia.ts`) include any sign-up
with their mobile or email.

**Setting up Postiz:**

1. Run Postiz with its Docker Compose file on the server, behind HTTPS on its own subdomain (e.g.
   `https://social.herbalholland.co.za`): it brings PostgreSQL, Redis and Temporal (with Temporal's own PostgreSQL and
   Elasticsearch); Postiz tested it on 2 CPUs and 2 GB of memory. Set `API_LIMIT=500` in its environment: the
   default (30 public API calls an hour) is less than a launch day needs (an upload and a post per card, and the
   read-back every 15 minutes).
2. Connect the accounts, all set to adults 18+:
   - **Facebook, Instagram (a professional account) and Threads**: one Meta developer app owned by HQ, with the
     marketing team added to the app's roles. That gives standard access to HQ's own Page and accounts, so no App
     Review is needed. Its keys go in Postiz's environment (Postiz docs → Providers).
   - **Bluesky**: an app password. **Telegram**: a channel, and a bot from @BotFather made its admin.
   - **LinkedIn page**: the Community Management API needs LinkedIn's approval. Until then, mark each LinkedIn-only
     post **I'll post it by hand** (or it fails at its time) and post the LinkedIn-too ones on LinkedIn by hand as well.
   - **X** charges for API posts ($0.015 a post, $0.20 with a link), so it's left to by-hand posting.
   - TikTok, Pinterest and YouTube keep API posts private until an audit, and TikTok bans cannabis content: not used.
3. Postiz → Settings → Public API: copy the key. Set `POSTIZ_URL` (`https://social.herbalholland.co.za/api/public/v1`;
   Postiz cloud: `https://api.postiz.com/public/v1`) and `POSTIZ_API_KEY`.
4. For the Social page's pictures only, `APP_URL` must be public HTTPS (Postiz fetches `${APP_URL}/social/<picture>.jpg`).
   Studio cards are uploaded with the post.

The same job (`syncStudio`) reads back how each released post went: published (with its link) or failed (with Postiz's
reason), and marks members' messages out once their campaign has sent. Postiz only gets a post at its time, so the
Studio is where a post is changed, held or taken back; once released, delete it in Postiz if it must come down. Meta
rejects cannabis and CBD ads, so this is organic posting only, with no boosting.

**WhatsApp and Google** are never posted through an API: WhatsApp's Business Messaging Policy (the app and the API
alike) bans promoting or facilitating drugs and medical products whatever the licences, and Google's posts bar offers
of regulated products. The Studio keeps them to store, brand and event news, posted by hand (the brand's WhatsApp
Channel on a number that isn't a store's line; each store's Google Business Profile). Store service chats start from
the QR maker's "WhatsApp the store" codes.

**AI drafting (optional).** With `WORKERS_AI_ACCOUNT_ID` and `WORKERS_AI_TOKEN` (a Cloudflare API token with Workers AI
read and edit), any Studio post can be rewritten in the brand's voice through Cloudflare Workers AI: a free daily
allowance (10,000 neurons, about a thousand captions), and Cloudflare doesn't train on prompts. It only sees the draft
and the brand rules, never a member's details; the suggestion is screened like any draft and a person decides.
`WORKERS_AI_MODEL` picks another model (`@cf/meta/llama-3.3-70b-instruct-fp8-fast` by default).

## Wallet passes: Apple Wallet and Google Wallet (`src/lib/wallet.ts`, `src/server/shop/wallet.ts`)

The Rewards card as a wallet pass: member number as the till's QR code, tier, points and first name, and nothing else
personal. The buttons appear under the card on `/club` only once a wallet is configured; until then the routes answer
404 with a plain "isn't set up yet" message and the card page shows no buttons.

- **Apple Wallet:** `GET /club/wallet/apple.pkpass` builds `pass.json` (a `storeCard`), the icons (drawn from the app
  icon), `manifest.json` (SHA-1 of every file) and a PKCS#7 detached signature, zipped (stored, no compression) as a
  `.pkpass`. Signing uses the **openssl CLI** (`openssl smime -sign … -outform DER`): Node's `crypto` has no CMS
  signer, so `openssl` must be on the server (it is in the Docker image's Debian base). Needs, from the Apple
  Developer account: a Pass Type ID (`pass.co.za.herbalholland.rewards`), the Team ID, the pass certificate and its
  private key (PEM), and Apple's WWDR G4 intermediate certificate (PEM). Passes are built on request and never stored;
  there is no pass-update web service yet (the pass shows the balance as it was when added; members re-add it, or the
  Rewards app has the live figure).
- **Google Wallet:** `GET /club/wallet/google` redirects to `https://pay.google.com/gp/v/save/<jwt>`: a "Save to
  Google Wallet" JWT (RS256, signed with the issuer's service-account key using `node:crypto`) carrying a generic
  class and the member's generic object, so nothing has to be created in the Google Pay & Wallet Console ahead of
  time beyond the issuer account. Needs the Issuer ID and a service account (JSON key) added to the issuer with
  developer access; the site's origin must be listed for the save button (the JWT's `origins` is `APP_URL`).

| Variable | What it is |
|---|---|
| `WALLET_APPLE_PASS_TYPE_ID` | The Pass Type ID (e.g. `pass.co.za.herbalholland.rewards`) |
| `WALLET_APPLE_TEAM_ID` | The Apple Developer Team ID |
| `WALLET_APPLE_CERT_PEM` | The pass certificate (PEM; `\n` for newlines is accepted) |
| `WALLET_APPLE_KEY_PEM` | Its private key (PEM, unencrypted) |
| `WALLET_APPLE_WWDR_PEM` | Apple's WWDR intermediate certificate (PEM) |
| `WALLET_GOOGLE_ISSUER_ID` | Google Wallet issuer id (a number) |
| `WALLET_GOOGLE_SERVICE_ACCOUNT_JSON` | The service account's JSON key, as one line |

Both builders are pure (`src/lib/wallet.ts`, tests in `tests/wallet.test.ts`): `applePassJson`, `appleManifest`,
`zipStore`, `googleGenericObject`, `googleSaveJwtClaims`, `signJwtRS256`.

## Product photos: the catalogue import (`image_urls`)

Product photos come in through HQ → Catalogue → Import, in the `image_urls` column: `https://` addresses separated
by `|`, up to six per product (the first is the main picture). After the import commits, each address is fetched
(15 s timeout, 5 MB at most, JPG/PNG/WebP by its bytes, never by its name), kept through `@/server/storage` (R2/S3 or
`UPLOAD_DIR`, under `products/<productId>/`) and recorded as an `Upload` plus a `ProductImage` row. The same bytes
already on the product are skipped, so re-importing a file never doubles a gallery; failures are listed in the
import's result and audited as `catalogue.import_images` (`data.failed`). Only public hosts are fetched (no IP
literals, no `localhost`). Photos are served to everyone at `/media/<uploadId>` (a week's cache) and appear on cards,
the product page gallery, the bag and orders, Open Graph and the product's JSON-LD `image`; products without photos
keep the generated art. Removing or reordering photos is an HQ job (delete the `ProductImage` row or change
`sortOrder`); there is no member-facing upload.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `DATABASE_POOL_MAX` | Connections per app instance (default 10); keep instances × pool under the database's limit (or use PgBouncer) |
| `SESSION_SECRET` | 32+ random bytes; signs invoice links, hashes ID numbers |
| `APP_URL` | The shop's public https address: every link in emails and texts, and the payment return URLs (a production server won't serve without it) |
| `SITE_ENQUIRY_SECRET` | The bearer secret for `POST /api/site/enquiries`, which files a franchise enquiry as an HQ → Franchise lead. herbalholland.com no longer takes franchise enquiries, so its Worker sends none; the enquiries it already handed over stay in HQ → Franchise leads. Unset, the endpoint refuses everything. The Worker's own secret is `IP_SALT`, which keys the IP hashes behind its rate limits (`sites/herbalholland.com/wrangler.jsonc`) |
| `FRANCHISE_EMAIL` | Where new franchise enquiries are emailed (default `franchise@herbalholland.com`) |
| `SUPPORT_EMAIL` | The address members are told to write to when a support request can't go through the form (default `hello@herbalholland.com`; the franchisor company's email is shown on `/support`) |
| `DEMO_MODE` | `true` enables demo logins and OTP codes on screen. It **must be false in production**: with it off a production server won't serve without an https `APP_URL` and a 32+ character `CRON_SECRET`; with it on it won't serve with live payment keys (`src/lib/env-check.ts`) |
| `CONTENT_REVIEWER` | `Name\|Job title\|Registration` (e.g. `Jane Doe\|Pharmacist\|SAPC P12345`): shown as "Reviewed by" on Learn guides and as `Article.reviewedBy`. Unset = no reviewer shown ([SEO.md](SEO.md)) |
| `ORG_SAME_AS` | Comma-separated official profile URLs for the `Organization.sameAs` schema on the home page; empty until the profiles exist |
| `SMTP_URL`, `EMAIL_FROM` | Email |
| `MESSAGING_PROVIDER`, `SMSPORTAL_CLIENT_ID`, `SMSPORTAL_API_SECRET`, `SMS_SENDER_ID`, `TRANSACTIONAL_CHANNEL` | SMS/WhatsApp adapters |
| `OTP_SMS_HOURLY_MAX` | Sign-in codes by SMS across the network per hour (default 500); over it, codes pause and `otp.ceiling` is audited once an hour |
| `NEXT_PUBLIC_TAP_PROVIDER` | The till's card tender: `SIMULATED` (the default in demos and development) \| `YOCO` (stand-alone Yoco machine) \| `HALO_APPLINK` \| `EXTERNAL` (the default in production). Runtime environment only (see Card present) |
| `HALO_API_URL`, `HALO_API_KEY`, `HALO_MERCHANT_ID` | Halo Dot tap on glass (`HALO_APPLINK`); `HALO_MERCHANT_ID_<STORECODE>` gives one store its own merchant id |
| `ONLINE_GATEWAY` | Online payments: `SIMULATED` (default: demo pay page) \| `PEACH` (Peach Payments, chosen) \| `YOCO` |
| `PEACH_ENV` | Peach Payments environment: `test` (default: the sandbox, `https://app.sandbox-next.peachpayments.com/api`) \| `live` (`https://app.next.peachpayments.com/api`) |
| `PEACH_API_KEY` | Peach Orchestration secret API key (`snd_…` sandbox, `prd_…` live; Dashboard → Peach Orchestration), sent in the `api-key` header. Server only |
| `PEACH_PROFILE_ID` | Peach business profile (`pro_…`) for payments. Optional: needed only if the account has more than one profile |
| `PEACH_PAYMENT_RESPONSE_HASH_KEY` | The business profile's `payment_response_hash_key`, which signs the webhook (`/api/payments/peach`, `x-webhook-signature-512`). Unset: the webhook answers 503 |
| `YOCO_SECRET_KEY` | Yoco Checkout API secret key: `sk_test_…` while testing, `sk_live_…` once a domain is verified. Server only |
| `YOCO_WEBHOOK_SECRET` | The `whsec_…` secret Yoco returned when the webhook (`/api/payments/yoco`) was registered with that same mode's key. Unset: the webhook answers 503 |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | Rewards app push (VAPID) |
| `POD_EMAIL`, `POD_PARTNER_NAME` | Merch partner's order inbox and name, for a variant made to order (none in the range today); unset = production orders only logged |
| `POSTIZ_URL`, `POSTIZ_API_KEY` | Postiz public API for social posts; unset = posts only recorded |
| `WORKERS_AI_ACCOUNT_ID`, `WORKERS_AI_TOKEN`, `WORKERS_AI_MODEL` | Optional: Studio rewrites in the brand's voice through Cloudflare Workers AI (free allowance); unset = no AI |
| `CRON_SECRET` | Protects `/api/cron/*`: 32+ random characters (`openssl rand -hex 32`) |
| `ALERT_EMAIL` | Ops inbox for server errors and failed scheduled-job steps (by SMTP, throttled: one per distinct error an hour, at most 20 an hour; addresses and long numbers left out); unset = errors are only logged |
| `TRADE_EMAIL` | Where trade applications and licences to check go (default: `FRANCHISE_EMAIL`) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Uploaded files (banking slips, licence documents, photos, report exports) in Cloudflare R2 (or any S3-compatible store); region `auto` for R2. Unset = files on disk |
| `UPLOAD_DIR` | Where slips are kept when no bucket is set (default `.data/uploads`; `/data/uploads` in the Docker image, so mount a volume there). Back it up |
| `WALLET_APPLE_PASS_TYPE_ID`, `WALLET_APPLE_TEAM_ID`, `WALLET_APPLE_CERT_PEM`, `WALLET_APPLE_KEY_PEM`, `WALLET_APPLE_WWDR_PEM` | Apple Wallet pass for the Rewards card (see Wallet passes); all five, or the button stays hidden |
| `WALLET_GOOGLE_ISSUER_ID`, `WALLET_GOOGLE_SERVICE_ACCOUNT_JSON` | Google Wallet pass for the Rewards card; both, or the button stays hidden |
