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
| SMS | OTP, order updates, marketing (consented) | `MESSAGING_PROVIDER` (Clickatell, BulkSMS, SMSPortal) |
| Email | Tax invoices, statements, newsletters | `SMTP_URL` (Amazon SES af-south-1, Everlytic, Postmark), `EMAIL_FROM` |
| App push | Oranje Club PWA | Web Push (VAPID) — roadmap |
| WhatsApp | Utility only, neutral wording | Meta's policy bans drug/medical products — `TRANSACTIONAL_CHANNEL=WHATSAPP` only after review |

Without providers configured, messages and emails are written to `MessageLog` so every notification is visible in the
demo.

## ID verification

Local checks first (Luhn, real date, 18+). For live verification at sign-up: **VerifyNow** (SA ID check R2.99,
real-time Home Affairs + photo R29.90) with **Smile ID** as fallback. Record the result as `AgeCheck = VERIFIED`. The POS
can read the Smart ID card's PDF417 barcode (DOB + ID number) with a camera scanner.

## Accounting

Per-store ledgers in **Sage Business Cloud** or **Xero**: post a daily summary journal per store (net sales, VAT,
tenders, COGS, Guilders) from `DailyStoreStat`. Invoices already carry structured data for SARS e-invoicing (VAT
modernisation, phased from 2030).

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `SESSION_SECRET` | 32+ random bytes; signs invoice links, hashes ID numbers |
| `APP_URL` | Public base URL (links in emails) |
| `DEMO_MODE` | `true` enables demo logins and OTP codes on screen — **must be false in production** |
| `SMTP_URL`, `EMAIL_FROM` | Email |
| `MESSAGING_PROVIDER`, `TRANSACTIONAL_CHANNEL` | SMS/WhatsApp adapters |
| `NEXT_PUBLIC_TAP_PROVIDER`, `HALO_API_URL`, `HALO_API_KEY` | Tap on glass |
| `ONLINE_GATEWAY` | Online payments adapter |
| `CRON_SECRET` | Protects `/api/cron/*` |
