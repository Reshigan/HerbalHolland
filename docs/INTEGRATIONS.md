# Integrations

Adapters are thin and swappable; the demo runs on simulators. Research, fees and acceptable-use quotes:
[research/PAYMENTS-LOGISTICS-RESEARCH.md](research/PAYMENTS-LOGISTICS-RESEARCH.md).

## Card present — tap on glass (`src/server/payments.ts`)

| Option | Status | Notes |
|---|---|---|
| **Halo Dot Halo.Link** (recommended) | Adapter slot `HALO_APPLINK` | PCI MPoC-certified SoftPOS. Backend creates a session per transaction with **that store's merchant ID** (`/consumer/applink` or `/consumer/intentTransaction`), the POS hands off to Halo.Go and receives the result. Fits multi-owner networks. Android 11+ with Google services; no developer options. |
| External terminal | Built | Any bank/fintech device the owner already has; the POS records the reference. |
| Simulated | Default | `NEXT_PUBLIC_TAP_PROVIDER=SIMULATED` — full UI flow for training and demos. |

**Acceptable use:** Yoco prohibits cannabis and CBD; Peach restricts CBD (prior approval) and prohibits cannabis
dispensaries; PayFast allows CBD only via EFT; Paystack bans drugs and paraphernalia. Onboard every store as its own
merchant with an honest description of a **SAHPRA-licensed medical dispensary + CBD/wellness retail** and written
approval. Never mis-code the MCC.

Env: `HALO_API_URL`, `HALO_API_KEY`, per-store merchant IDs (store settings, roadmap field).

## Online payments

Slot: `ONLINE_GATEWAY` = `SIMULATED` | `PAYFAST` | `PAYSTACK` | `PEACH` | `OZOW`. Recommended: bank rails first
(instant EFT, **PayShap Request** via Ozow/Stitch/Peach), cards only with written approval. Each franchisee is merchant
of record; split payments (PayFast split / Paystack subaccounts) can route the store's share directly. Webhooks call
`markOrderPaid(orderId, reference)`.

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
| App push | Rewards PWA: drop alerts, campaigns (consented) | Web Push — **built** (`web-push`, VAPID: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`; generate keys with `npx web-push generate-vapid-keys`). Without keys pushes are only logged. iPhones need the app on the Home Screen (iOS 16.4+) |
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
- **Beanies and bucket hats** (designed, held back): Lucani doesn't make them. GetCapped (Johannesburg) embroiders them
  from one piece with embroidery included, but has no white-label programme — ask before adding them.
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
print); embroidery at quantity 1 with no per-order setup or reseller minimum; digitising cost per design and who owns
the stitch file; per-piece prices at 1, 5 and 10 units for the tee, hoodie, crewneck, cap and tote; their thread
chart (a sew-out of the closest match to Sunset 500 #F5913C); which blanks (black and orange in stock, heavier
options, a crewneck and a tote); white-label details (plain packaging, no partner invoice inside, our insert, return
address); email ordering and tracking replies; courier rates; payment terms; misprint/reprint policy; and an opt-out
from promotional photography. Then approve a paid sample set, set each variant's partner code and cost (HQ →
Catalogue), and set `POD_EMAIL` / `POD_PARTNER_NAME` and the merch courier fee (HQ → Online orders).

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `DATABASE_POOL_MAX` | Connections per app instance (default 10); keep instances × pool under the database's limit (or use PgBouncer) |
| `SESSION_SECRET` | 32+ random bytes; signs invoice links, hashes ID numbers |
| `APP_URL` | Public base URL (links in emails) |
| `DEMO_MODE` | `true` enables demo logins and OTP codes on screen — **must be false in production** |
| `SMTP_URL`, `EMAIL_FROM` | Email |
| `MESSAGING_PROVIDER`, `SMSPORTAL_CLIENT_ID`, `SMSPORTAL_API_SECRET`, `SMS_SENDER_ID`, `TRANSACTIONAL_CHANNEL` | SMS/WhatsApp adapters |
| `NEXT_PUBLIC_TAP_PROVIDER`, `HALO_API_URL`, `HALO_API_KEY` | Tap on glass |
| `ONLINE_GATEWAY` | Online payments adapter |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | Rewards app push (VAPID) |
| `POD_EMAIL`, `POD_PARTNER_NAME` | Merch partner's order inbox and name (made-to-order merch); unset = production orders only logged |
| `CRON_SECRET` | Protects `/api/cron/*` |
