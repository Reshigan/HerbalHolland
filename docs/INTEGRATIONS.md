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

## Print partner — made-to-order merch (`src/server/pod.ts`, `merch.ts`)

Merch is printed on demand in South Africa and couriered, white-label, straight to the customer: no stock, no minimums.
Recommended partner: **OTC Printing, Oudtshoorn** (info@otcprinting.co.za · 082 443 4737) — DTG and transfers from one
piece, Vic Bay heavyweight SA-made tees, hoodies, sweatshirts, caps and totes; white-label packaging; courier at cost
(Aramex ≈ R100 per parcel, or The Courier Guy/Pudo); 5–7 working days; in-house designers at R200/hour. Runner-up:
**Merchbox, Durban** (48–72 h turnaround, The Courier Guy R130/Pudo R120, relaxed content policy; white-label and
custom-platform intake to confirm). Neither embroiders — for embroidered caps or bucket hats, PI Printers
(weprintall.store, Johannesburg) or Lucani (Cape Town) make them from one piece.

No South African print-on-demand partner has an API, so the platform works by email:

1. A paid order with merch → the frequent job emails the partner a **production order** (`POD_EMAIL`): recipient,
   items (our product code, blank, size, quantity) and, per placement, technique, size and a link to our 300 dpi print
   file (`/merch/print/*.png`). Every production order is also kept in HQ → Messages.
2. The partner prints, packs white-label and couriers to the customer, then emails back the courier and tracking number.
3. The distribution centre opens the order and enters it (**Merch shipped**): the customer is texted their tracking, and a
   merch-only order goes out for delivery (the sale posts at the partner's price, booked to the DC).
4. On delivery the DC marks the order delivered, as for any courier order.

Setup: agree the price list and each blank with the partner, confirm in writing that they'll print for a CBD brand
(designs carry the brand and heritage motifs only), approve a printed sample of every piece, then set the partner's
product code and price on each variant (HQ → Catalogue → Print partner code / Cost) and `POD_EMAIL` /
`POD_PARTNER_NAME`. The merch courier fee (HQ → Online orders) is charged on top of the price, never waived.

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
| `POD_EMAIL`, `POD_PARTNER_NAME` | Print partner's order inbox and name (made-to-order merch); unset = production orders only logged |
| `CRON_SECRET` | Protects `/api/cron/*` |
