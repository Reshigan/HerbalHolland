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

**Acceptable use — clear this with Yoco in writing before go-live.** The owner has chosen Yoco, online and in store.
Our research ([research/PAYMENTS-LOGISTICS-RESEARCH.md](research/PAYMENTS-LOGISTICS-RESEARCH.md)) found that Yoco's
published prohibited-business list names cannabis and CBD products, and card-not-present sales by drug stores and
pharmacies. Describe the business honestly (**SAHPRA-licensed medical dispensary + CBD/wellness retail; licensed THC
is collect-only, never couriered**) and get Yoco's written approval for each account — Vantax (Pty) Ltd online and
every store's account in store — before taking live payments. Never mis-code the MCC. For reference: Peach restricts CBD (prior
approval) and prohibits cannabis dispensaries; PayFast allows CBD only via EFT; Paystack bans drugs and paraphernalia.

Env: `NEXT_PUBLIC_TAP_PROVIDER`; for Halo also `HALO_API_URL`, `HALO_API_KEY` and per-store merchant IDs (roadmap field).

## Online payments — Yoco Checkout API (built)

`ONLINE_GATEWAY=YOCO` (`SIMULATED`, the default, keeps the demo pay page for demos and tests). One Yoco account for the
online shop: **Vantax (Pty) Ltd is the merchant**, and the pay page names the HQ company record (the `FRANCHISOR`
company's legal name) as the payee. The sale still posts at the fulfilling location on dispatch (the distribution
centre at launch) with an `ONLINE` payment, provider `YOCO`, reference = the Yoco checkout id.

1. **Checkout** places the order (`PENDING_PAYMENT`, stock reserved for `unpaidHoldMinutes`) and sends the member to
   `/checkout/pay/[orderId]`.
2. **Pay page** (`payWithYoco` in `src/app/(shop)/checkout/pay/[orderId]/actions.ts` → `yocoCheckoutFor` in
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
| `DEMO_MODE` | `true` enables demo logins and OTP codes on screen — **must be false in production** |
| `SMTP_URL`, `EMAIL_FROM` | Email |
| `MESSAGING_PROVIDER`, `SMSPORTAL_CLIENT_ID`, `SMSPORTAL_API_SECRET`, `SMS_SENDER_ID`, `TRANSACTIONAL_CHANNEL` | SMS/WhatsApp adapters |
| `NEXT_PUBLIC_TAP_PROVIDER` | The till's card tender: `SIMULATED` (default) \| `YOCO` (stand-alone Yoco machine) \| `HALO_APPLINK` \| `EXTERNAL`. Runtime environment only (see Card present) |
| `HALO_API_URL`, `HALO_API_KEY` | Halo Dot tap on glass (`HALO_APPLINK`) |
| `ONLINE_GATEWAY` | Online payments: `SIMULATED` (default: demo pay page) \| `YOCO` |
| `YOCO_SECRET_KEY` | Yoco Checkout API secret key: `sk_test_…` while testing, `sk_live_…` once a domain is verified. Server only |
| `YOCO_WEBHOOK_SECRET` | The `whsec_…` secret Yoco returned when the webhook (`/api/payments/yoco`) was registered with that same mode's key. Unset: the webhook answers 503 |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | Rewards app push (VAPID) |
| `POD_EMAIL`, `POD_PARTNER_NAME` | Merch partner's order inbox and name (made-to-order merch); unset = production orders only logged |
| `POSTIZ_URL`, `POSTIZ_API_KEY` | Postiz public API for social posts; unset = posts only recorded |
| `CRON_SECRET` | Protects `/api/cron/*` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | Banking slips in Cloudflare R2 (or any S3-compatible store); region `auto` for R2. Unset = files on disk |
| `UPLOAD_DIR` | Where slips are kept when no bucket is set (default `.data/uploads`; `/data/uploads` in the Docker image — mount a volume there) — back it up |
