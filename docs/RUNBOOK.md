# Runbook

## Environments

| | Local | Staging | Production |
|---|---|---|---|
| Database | Postgres 16 (`docker compose up db` or local cluster) | Postgres on the staging server | Postgres 16 on our own server in South Africa, WAL archiving + nightly dumps |
| Files (banking slips) | `.data/uploads` on disk | R2 bucket `…-staging` | Cloudflare R2 bucket (EU jurisdiction), or `UPLOAD_DIR` on the server |
| Data | `npm run db:seed` demo network | Anonymised copy or seed | Real — never seed (the seed truncates every table and refuses to run with `NODE_ENV=production` unless `--force`) |
| `DEMO_MODE` | true | true (clearly labelled) | **false** |

## First deploy

Hosting: our own server in South Africa runs the app and Postgres; Cloudflare sits in front (DNS, TLS, WAF and bot
protection, caching of `/_next/static`) through a Cloudflare Tunnel, so the server has no open inbound ports. Files go
to Cloudflare R2. The app itself doesn't run on Cloudflare Workers (it's a Node server with Postgres, SMTP and long
reports) and Postgres can't live on Cloudflare.

1. Server: Docker + Postgres 16 (or `docker compose up -d db`), a `cloudflared` tunnel to `http://localhost:3000`, and
   the environment variables in [INTEGRATIONS.md](INTEGRATIONS.md#environment-variables). Cloudflare: proxied DNS
   record for the tunnel, SSL "Full (strict)", WAF managed rules on, a cache rule for `/_next/static/*`.
   herbalholland.com (the corporate site) is not this app: it's its own Cloudflare Worker, `herbalholland-com`
   (`sites/herbalholland.com`: static pages plus `/api/enquiry`, D1 database `herbalholland-com-eu`, EU jurisdiction). Already set
   up in the Cloudflare account: the Worker's custom domain, a redirect rule www → herbalholland.com, Always Use HTTPS,
   TLS ≥ 1.2 (1.3 on), SSL Full (strict), HSTS (1 year, include subdomains, no preload; the site's `_headers` sends
   the same, so keep them in step), Email Routing forwarding hello@, franchise@, press@ and careers@ to the team. To
   release a change: `npx tsx sites/herbalholland.com/build.ts`, then from `sites/herbalholland.com`
   `npx wrangler@4 d1 migrations apply herbalholland-com-eu --remote && npx wrangler@4 deploy`. For a change the owner
   should see first: `npx wrangler@4 versions upload --preview-alias preview` (→ `https://preview-herbalholland-com.<account>.workers.dev`,
   same database and email as live, so don't send test enquiries), then `npx wrangler@4 versions deploy <version-id>`
   to make that exact version live. The early-access list (`early_access` in the same database; the Worker deletes
   sign-ups after 12 months): export it for the launch message with `npx wrangler@4 d1 execute herbalholland-com-eu
   --remote --json --command "SELECT first_name, email, mobile, province, source, created_at FROM early_access ORDER BY id"`,
   send only through the platform's consent-checked messaging (every message with an opt-out), and delete anyone who
   asks with `DELETE FROM early_access WHERE email = ? OR mobile = ?`. Rebuild and deploy on or
   after a press release's date (the site is static), and set `facts.ts` `shop.url` when the shop opens. Once the
   platform is live, give the Worker `APP_ENQUIRY_URL` (`https://herbalholland.co.za/api/site/enquiries`) and
   `APP_ENQUIRY_SECRET` (= the app's `SITE_ENQUIRY_SECRET`) with `wrangler secret put`, so enquiries land in HQ →
   Franchise leads instead of email.
2. R2: create a bucket with the **EU jurisdiction** (R2 has no South African location — record the cross-border
   transfer in the POPIA register), an API token limited to that bucket (Object Read & Write), and set `S3_ENDPOINT`
   (`https://<account-id>.eu.r2.cloudflarestorage.com`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
   Without them slips are stored on the server under `UPLOAD_DIR` (the image's `/data/uploads` volume) — include it in backups.
3. Build the image: `docker build -t herbal-holland .`; run migrations: `docker compose run --rm migrate`.
4. Start the app (`node server.js`, port 3000, behind the tunnel); health check `GET /api/health`.
5. Create the first HQ admin (SQL or a one-off script) and set `DEMO_MODE=false`.
6. HQ → Compliance: confirm `thcMode`, channel matrix and store licences with counsel.
7. HQ → Stores: onboard DCs and stores (ranging template, fees, licences); Catalogue: products, variants, batches with COAs
   (HQ → Catalogue → Import loads the range from a spreadsheet, with the warehouse's opening stock, after a dry run).
   After any bulk import (catalogue, members, opening stock) run `ANALYZE;` — autovacuum is slow to gather statistics
   on small tables, and without them the planner scans the whole network for single-store queries.
8. Pair POS devices per store (`/pos/pair`), create staff with PINs, designate dispensers.
9. Configure the scheduler with `Authorization: Bearer $CRON_SECRET`: `POST /api/cron/frequent` every 15 min,
   `POST /api/cron/daily` at 02:00 SAST, `POST /api/cron/staff-push` every 5 min and `POST /api/cron/operations` at
   03:00 SAST (see [Scheduled jobs](#scheduled-jobs-apicron)). Run it on the server itself (cron or a systemd timer
   calling `http://localhost:3000`), not through Cloudflare: Cloudflare cuts requests at 100 s, and the daily job at
   1,000 stores takes about 30 s for the loss-prevention rules alone.

## Peach Payments go-live (online payments)

How it works: [INTEGRATIONS.md → Online payments](INTEGRATIONS.md#online-payments--peach-payments-chosen-and-yoco).

**Before anything else:** Peach's **written approval** of the business and product mix for Vantax (Pty) Ltd. Peach
restricts CBD, drug stores and pharmacies (prior written approval) and doesn't permit cannabis dispensaries. Describe
the business honestly and ask explicitly about licensed medicinal THC on click & collect. THC orders are paid in store
(the app enforces it: no online payment for baskets with licensed products). Don't take live payments without
the approval.

1. **Set up the sandbox** (staging, or production before launch):
   - HQ company record (the `FRANCHISOR` company): legal name **Vantax (Pty) Ltd**. The pay page names it as the payee.
   - Sandbox Dashboard → **Peach Orchestration**: copy the secret API key (`snd_…`) into `PEACH_API_KEY`.
   - Set `PEACH_ENV=test` and `ONLINE_GATEWAY=PEACH`. If the account has more than one business profile, also set
     `PEACH_PROFILE_ID=pro_…`.
   - `APP_URL` must be the public HTTPS address: Peach sends members back to it.
   - Hash key: `curl -H "api-key: $PEACH_API_KEY" https://app.sandbox-next.peachpayments.com/api/account/<merchant_id>/business_profile/<profile_id>`,
     then copy `payment_response_hash_key` into `PEACH_PAYMENT_RESPONSE_HASH_KEY`. Both ids are in the Dashboard, and on
     any payment (`…/api/payments/list?limit=1`). Peach support can also give you the key.
   - Profile: keep `redirect_to_merchant_with_http_post` off, so members come back with a GET.
   - Payment methods: switch on only methods Peach can refund (cards, Apple Pay, Google Pay, PayShap…), not Peach EFT,
     Capitec Pay or ZeroPay. The app refunds a paid order before cancelling it, so an unrefundable order can't be
     cancelled in the app.
   - Webhook: Dashboard → Peach Orchestration → Webhooks → **+ Add webhook URL** →
     `https://herbalholland.co.za/api/payments/peach` (payment succeeded / failed, refund succeeded / failed).
   - Cloudflare: a WAF custom rule that skips bot protection and challenges for `POST /api/payments/peach` (the route
     checks Peach's signature itself). A challenged webhook never lands.
   - Restart the app.
2. **Test it with a sandbox card** (the playground's **Test credentials**):
   - A courier order → Peach's page → pay → the order page says **Payment received**.
   - HQ → Audit log has `order.pay_online` by Peach Payments, and the member's "order received" SMS is in HQ → Messages
     (`/hq/messages`, channel SMS — open the row to read the text as sent).
   - Leave Peach's page without paying → **Payment cancelled** → Try again opens the same page.
   - Cancel the paid order in the back office: it's refunded (`pending` or `succeeded`; the refund id is on the order),
     and `payment.refunded` appears in the audit log once Peach confirms.
3. **Stuck on "Waiting for payment confirmation…"?** The app log shows why:
   - 401: the wrong `PEACH_PAYMENT_RESPONSE_HASH_KEY`, or a webhook from the other environment;
   - 503: the key isn't set;
   - nothing at all: Cloudflare, or a wrong URL.

   Meanwhile, if the member opens the pay page again, the app asks Peach for the payment's status and confirms the
   order.
4. **Go live**, only once the written approval is in: repeat step 1 in the live Dashboard (`prd_…` key, profile, hash key,
   webhook). Set `PEACH_ENV=live` together with the three Peach values, then restart. Remove any sandbox webhook that
   points at production.
5. **Live smoke test:** a small real order paid by card on a phone → Payment received. Cancel it from the store back
   office → refunded. Check the refund in the Peach Dashboard, and `payment.refunded` in the audit log.
6. **From then on, daily:** match Peach's settlements to orders (merchant reference = order code, payment id = the
   order's payment reference). Use Dashboard → Reporting.

## Yoco go-live (in-store card machines; online only with `ONLINE_GATEWAY=YOCO`)

How it works: [INTEGRATIONS.md → Yoco Checkout API](INTEGRATIONS.md#yoco-checkout-api-built-kept-but-yocos-policy-bans-cbd).
Online payments go through Peach (above): steps 1–4 apply only if the shop is switched back to Yoco online. First,
Yoco's **written approval** of the business and product mix for every account (each store's own account in store, and
Vantax (Pty) Ltd if online) — see the acceptable-use note in INTEGRATIONS.md. Don't take live payments without it.

1. **Test mode** (staging, or production before launch):
   - HQ company record (the `FRANCHISOR` company): legal name **Vantax (Pty) Ltd**. The pay page names it as the payee.
   - Yoco app → Checkout API integration → **How to connect** → Test keys. Set `YOCO_SECRET_KEY=sk_test_…` and
     `ONLINE_GATEWAY=YOCO`. `APP_URL` must be the public HTTPS address (Yoco sends members back to it).
   - Register the webhook with the same test key and keep the `secret` it returns (shown once) as
     `YOCO_WEBHOOK_SECRET`, then restart the app:
     `curl -X POST https://payments.yoco.com/api/webhooks -H "Authorization: Bearer $YOCO_SECRET_KEY" -H "Content-Type: application/json" -d '{"name":"herbal-holland","url":"https://herbalholland.co.za/api/payments/yoco"}'`
   - Cloudflare: a WAF custom rule that skips bot protection and challenges for `POST /api/payments/yoco` (the route
     checks Yoco's signature itself). A challenged webhook never lands.
   - Walk through it with Yoco's test card (same Yoco page): a courier order → Yoco's page → paid → the order page says
     **Payment received**, HQ → Audit log has `order.pay_online` by Yoco, and the member's "order received" SMS is in
     HQ → Messages (`/hq/messages`, channel SMS). Cancel on Yoco's page → **Payment cancelled** → Try again opens the same checkout. Cancel a
     test-paid order in the back office: it's cancelled with "Yoco test payment: nothing to refund" (Yoco can't refund
     test payments).
   - Stuck on "Waiting for payment confirmation…"? The app log shows why: 400 = wrong `YOCO_WEBHOOK_SECRET` (or the
     server clock is more than 5 minutes out), 503 = secret not set, nothing at all = Cloudflare or a wrong URL.
2. **Verify the domain:** Yoco app → Checkout API → How to connect → **Verified Domains** → Add domain (the shop's
   domain). Live keys unlock when Yoco approves it; live payments must start on that domain.
3. **Live:** `YOCO_SECRET_KEY=sk_live_…`; register the webhook again with the live key → the new `YOCO_WEBHOOK_SECRET`;
   restart. Remove test webhooks that point at production (`GET` then `DELETE https://payments.yoco.com/api/webhooks/{id}`).
4. **Live smoke test:** a small real order (Yoco's minimum is R2.00) paid by card on a phone → Payment received. Cancel
   it from the store back office → refunded (`succeeded` or `pending`; the refund id is on the order). Check the refund
   in the Yoco portal, and `payment.refunded` in the audit log once Yoco confirms it.
5. **Tills:** `NEXT_PUBLIC_TAP_PROVIDER=YOCO` in the app's runtime environment (not at image build), restart; each till
   picks it up on its next refresh (Shift → Card payments: "Yoco card machine"). Cashiers charge the amount on the Yoco
   machine first, then key in the reference the machine shows (last 4 optional). This works with the till offline.
6. From then on, daily: match Yoco's payouts to orders (externalId = order code, checkout id = the order's payment
   reference) and each store's Yoco settlement to its Z-reports' card total.

## Releases

- Migrations (`prisma migrate deploy`) run before the new app version starts. Schema changes take table locks: apply
  them outside trading hours (after 22:00 SAST) — tills keep selling offline and sync afterwards. A load test showed a
  migration during peak posting stalls tills behind the lock.
- Capacity (1,000-store dataset — 998 stores, 175k members, 425k sales — one app instance, 10 DB connections):
  POS posting p50 ≈ 170 ms, p95 ≈ 440 ms, ≈ 45 sales/s. `e2e/crawl.mjs` (every page as every role, production build):
  storefront ≈ 50–130 ms (home ≈ 90 ms, store finder ≈ 140 ms), HQ console and store back office p50 ≈ 60 ms.
  Network-wide HQ reports over 30 days are mostly < 1 s; slowest: age checks ≈ 2.5 s (reads raw sales — give it a
  rollup if it matters), dispensing register ≈ 1.5 s, franchise statements ≈ 1.3 s. Re-run `scripts/bench.ts`,
  `e2e/crawl.mjs` and the e2e journeys against a production-sized copy before big releases.

## Launch day

1. HQ → Founding Members: confirm when the list closes (SAST). The shop trades normally while it's open. Stores
   that haven't opened are **opening soon** (HQ → Stores) — members can pick them as home store — and switch to
   trading on the morning they open.
2. When the list closes the scheduler numbers the first `foundingCap` places (or press "Assign founding numbers
   now"); spot-check a Founding Member's card shows the number and Sprout.
3. HQ → Drops / Events: first drop and opening weekends scheduled inside CPA send windows; stock allocated. At the
   door, the till checks guests in by scanning the ticket QR in their Rewards card (or typing `HHRSVP:` + code); the
   event's door list (CSV) is the paper fallback.
4. HQ → Rewards: My Deals on; welcome-gift promotion live (first purchase only).
5. Pair and install the tills: on each till (Chrome on Android), open `/pos/pair` → **Install the till app** (it then
   opens full-screen from the home screen and keeps its shell offline) → pair to the store. Managers and owners add
   the back office to their phones from the side menu ("Install app"); members get the Rewards nudge on their card.
6. Watch the till member-attach rate, sign-ups per hour and SMS spend in the first 48 hours.

## Till hardware

Every till works on a tablet or phone with nothing attached: receipts open in the browser's print dialog (receipt-styled,
80 mm page), the camera or a keyboard-wedge scanner reads codes, and the customer display is a browser window. The
hardware below is optional and set up per device under **Shift → This till** (settings stay on that device — nothing is
stored on the server).

**Receipt printer (ESC/POS).** Any 58 mm or 80 mm ESC/POS receipt printer with Bluetooth LE or USB: tested layouts
for 32 columns (58 mm) and 42 / 48 columns (80 mm). Known-good families: Xprinter XP-58/80 BLE models, Sunmi and
GOOJPRT 58 mm portables, Epson TM-m30 / TM-T20 (USB), Bixolon SPP-R200/R310 (USB; the Bluetooth models are classic
SPP — see below). The till speaks Web Bluetooth (BLE GATT) and Web USB, so it needs **Chrome, Edge or Samsung Internet
on Android, ChromeOS, Windows, macOS or Linux** over https. Not supported: iPhone/iPad (print through AirPrint from the
print dialog), Firefox, and classic-Bluetooth "SPP" printers (Web Bluetooth can't reach them — use their USB port or
a BLE model). Pairing: turn the printer on → **Shift → This till → Receipt printer & drawer → Pair Bluetooth printer**
(or **Pair USB printer**; on Android use an OTG cable) → pick it in the browser's chooser → choose the paper width →
**Test print** (prints a test page with accents, bold, double height and a QR — check nothing is cut off; if the right
column wraps, choose a narrower width). Windows USB: if "Couldn't claim the printer's USB interface" appears, the
vendor driver holds the port — swap it for WinUSB with Zadig, or use Bluetooth. The printer is remembered on the
device; after a reboot the till reconnects on the first print (Bluetooth may need **Reconnect**, one tap). "Print
automatically after each sale" prints with the sale; it only applies once a printer is paired, so tablets without one
keep the Print button. What prints: the store, legal entity and VAT number, every line with VAT, tenders, change,
points earned/redeemed, the member's name with a masked number, a QR + link to the signed invoice page, the licence
reference and licensed-medicine wording where a line is a licensed medicine (and the s18A line for CBD supplements),
and the "Adults 18+" footer. Refunds print as credit notes. Z- and X-reports print through the same printer.
Receipts are never queued: the sale data syncs when the till is offline, the paper prints locally at once.

**Cash drawer.** A drawer wired to the printer's DK/RJ11 port. **Open the drawer on cash** pulses it on cash sales and
cash refunds (pin 2 by default; pick pin 5 if nothing happens). **Open drawer** outside a sale asks for a manager's
PIN and is written to the audit log as `pos.drawer_open` (queued on the till and posted on the next sync when offline).
There is no drawer without a printer: the till says so.

**Scanners.** Keyboard-wedge USB or Bluetooth scanners work on every screen with no set-up (scan anywhere; the till
recognises product barcodes, member card QRs, event tickets, collection QRs and batch codes). Camera scanning (the
camera button next to search, or "Scan member card") uses the browser's BarcodeDetector — Chrome/Edge/Samsung
Internet on Android, Chrome on ChromeOS and macOS — with a viewfinder and a torch toggle where the camera has one;
browsers without it get a plain "not supported" note pointing at the alternatives. EAN-13, EAN-8, UPC, Code 128,
Code 39 and QR. A batch code (the code on the pack, or its lab-certificate QR) opens the batch: status (recalled / on
hold / expired shown in red or amber), dates, potency, lab and how many of that lot are on the shelf here.

**Customer display.** **Shift → This till → Customer display → Open on this device** opens `/pos/display` in a window
you can drag to a second monitor (or a tab on the same tablet); it follows the till through the browser with no
set-up. For a screen on another device (a tablet facing the customer), tick **Send to a separate screen** and open the
link/QR it shows on that device: the display polls the till's snapshot every 2 seconds through the server (kept in
memory for 3 minutes, keyed by the paired till and a pairing key; "New link" revokes the old one). The display shows
the lines, total, deals applied, the member's first name and points, "tap to pay", change and points earned, then
cycles brand messages (today's deals, never on medicines; the next event). It never shows phone numbers, member
numbers, or the names of licensed medicines ("Dispensed medicine"). Tap the display for full screen. Runs on any
browser. Note for HA deployments: the separate-screen feed is held in the app instance's memory, so run one instance
per store front or use sticky sessions; the same-device window needs no server at all.

**Training mode.** A manager starts it under **Shift → This till → Training mode** (a cashier's tap asks for a
manager's PIN). The till shows an orange outline and the banner **TRAINING — nothing is real**; a five-step tour
walks a new cashier through search/scan, the member, the basket, charging and the receipt. Everything runs on a
sandbox: practice sales are numbered `TRAINING 0001…`, never posted or queued, never move stock or award points;
member sign-ups and age checks are simulated on the till; receipts print (or open in the print dialog) with a
TRAINING watermark; the drawer stays shut; online orders, refunds, shift open/close and invoices are refused with a
message; the customer display carries a training banner. Practice receipts are listed under **Sales** for re-printing
and simulated refunds. Exiting needs a manager's PIN; start and end are audited (`pos.training_start` /
`pos.training_end`). Real sales queued before training started still sync.

**Quiet hours.** With no sale open and no touch for 3 minutes the Sell screen shows a calm dashboard — takings so far
this shift, click & collect orders ready to hand over, low-stock lines, what's waiting on the till (offline sales to
sync, late orders, stale catalogue, no shift) and the store's next event — built from what the till already caches.
Any tap or scan returns to selling. Nothing moves when the device prefers reduced motion. `?idleMs=5000` on the
till's URL shortens the wait for testing.

## Back office and HQ console: working faster

**Keyboard shortcuts** (store back office and HQ console; they pause while you type in a field):

| Keys | What happens |
|---|---|
| `⌘K` / `Ctrl+K` (or the **Jump to…** button under the logo) | Command palette: every section of the sidebar plus your recent pages; type to filter, `↑` `↓` `Enter` |
| `/` | Focus the search box on the page (opens the palette on pages without one) |
| `g` then `o` / `i` / `r` | Go to Online orders / Stock on hand (HQ: Catalogue) / Reports |
| `g` then `h` / `m` | Overview / Members |
| `?` | The cheat sheet |
| `Esc` | Close a dialog, drawer or inline edit |

Recent pages are remembered per person in the browser (localStorage), never on the server.

**Saved views.** On the lists with filters (online orders, stock on hand, members, the HQ catalogue, stores, audit log
and messages), set the filters, sort and search you want, then **Save this view** and name it. Saved views appear as
chips above the list and are links back to the same filters; `×` removes one. They're kept per person and page in the
browser (localStorage — a private window or cleared site data starts empty), so there's nothing to administer.

**Tables.** Column headings with an arrow sort the list (the URL carries the sort, so a sorted, filtered list can be
bookmarked or shared); a click anywhere on a row opens it; wide lists scroll sideways on a phone with the first column
pinned; the header row stays visible while you scroll.

**Editing in place.** On Stock on hand, click a shelf price or the reorder · par cell to change it there (Enter saves,
Esc cancels; empty shelf price = follow the list price). On the HQ catalogue, click an RRP (or the price range of a
multi-variant product) to change it. Under Settings, a changed day of trading hours gets its own Save button; Team →
Reset PIN opens a small inline form. Every inline save goes through the same server action, checks and audit entry as
the full form.

**Role overviews.** The store overview leads with what the person acts on: managers see the Today list, then today's
takings against the same day last week, orders to fulfil, stock to count and who's on shift; owners, area managers and
HQ see takings today, gross margin, cash to bank (with anything overdue), open online orders and open loss-prevention
alerts, then the Today list. The HQ overview leads with network (or region) sales today and month to date, stores
trading today, open orders, alerts, new franchise leads and last month's statements still to email; an area manager
gets their stores ranked with an exceptions column (overdue cash-ups, alerts, negative stock, stores with no sale yet).

## Routine operations

| When | Task | Where |
|---|---|---|
| Continuous | Health check, error rate, p95 latency, DB connections | Load balancer + APM |
| Every 15 min | Release campaigns held for a legal send window; cancel unpaid online orders (stock released after `unpaidHoldMinutes`); retry failed invoice emails; number Founding Members once the list closes; drop alerts to watchers; email paid merch orders to the print partner | `/api/cron/frequent` |
| Every 5 min | Staff push notifications: new online orders (polled — nothing hooks the checkout), loss alerts about other people, HQ updates that need acknowledging | `/api/cron/staff-push` |
| Daily 03:00 | Staff push digests (lots entering the expiry window, cash due at the bank, low stock per store); scheduled report exports emailed as signed CSV links; pruning of old push-event keys and export files | `/api/cron/operations` |
| Daily (manager) | Work the **Today** list on the store overview: orders to pick or hand over, cycle counts due, cash to bank, open alerts, expiring lots, low stock, lapsing patient authorisations, HQ updates, supplier invoices due | Store → Overview |
| As delivered | Capture the supplier's invoice (photo or PDF, ≤ 8 MB) on the received stock order, or under Finance → Supplier invoices; mark paid as settled, query one that doesn't match | Store → Purchasing / Finance |
| Daily (DC) | Print partner's shipping emails → enter courier + tracking on each merch order (**Merch shipped**); chase anything "sent" for more than 7 working days; mark delivered merch orders delivered | Store back office → DC → Online orders |
| Daily 02:00 | Birthday points; cancel pay-in-store collections not collected within `collectHoldDays`; lapse expired tier floors; loss-prevention rules + the digest email to owners and area managers; load weekly My Deals (Mondays) | `/api/cron/daily` |
| Daily | Cash-ups closed at every store; negative-stock and compliance-event reports reviewed | Reports |
| Daily (store) | Bank yesterday's cash by the next business day: Banking → tick the cash-ups → amount, reference and a photo of the stamped slip | Store → Banking |
| Daily (owner / area manager) | Check new deposits against the bank statement (Verify, or Query with a note); work the loss-prevention alerts — investigate, then resolve or dismiss with a note | Store → Banking / Loss prevention |
| Monthly (owner) | Approve last month's commission for payroll (people with open alerts are held until they're closed), download the CSV | Store → Commission |
| Weekly | Replenishment orders submitted/approved/shipped; expiry report actioned | Purchasing / Distribution |
| Weekly | Schedule the week's social posts (merch, store news, events, Learn); answer comments and DMs in Postiz or the apps — never take orders there | HQ → Campaigns → Social |
| Monthly | Cycle counts per category; franchise statements emailed; NCC opt-out registry import into Suppression; VAT201 working per store | Stock takes / HQ Statements / Marketing |
| Quarterly | Access review (users, roles, devices); restore test from backup | HQ Team / DB |

## Documents & messages

**Emails.** Every email the platform sends (tax invoices and credit notes, order updates, franchise statements,
wholesale invoices, Z-reports, loss-prevention alerts, franchise-enquiry replies, campaigns) uses one layout in
`src/server/email-templates.ts`: cream page, white card, the mark and wordmark, an orange pill button, tabular figures,
and a footer whose legal line comes from the franchisor Company record (HQ → Settings → Company: legal name, registration
and VAT numbers, address). Every email has a plain-text twin, and campaign emails alone carry the unsubscribe link and
`List-Unsubscribe` headers. To preview them without a mail server: `npx tsx scripts/preview-emails.ts` writes each
template with sample data to `test-results/emails/index.html`; `npx vitest run tests/email.test.ts` checks subjects,
buttons, escaping, text alternatives and the 102 KB Gmail limit. With `SMTP_URL` unset (demos, staging) nothing is
sent: every email is written to the message log, so HQ → Messages (`/hq/messages`) is the place to read what a member would have got.
`EMAIL_FROM` sets the sender; keep it on a domain with SPF/DKIM for the ESP.

**Texts.** Order updates, sign-in codes and recall notices go by SMS (`MESSAGING_PROVIDER=smsportal`; without it they're
only logged). Copy rules in `src/lib/sms.ts`: "Herbal Holland:" first, the order code next, one GSM-7 segment where
possible, links as `APP_URL` paths without the scheme, and "Reply STOP" on marketing only (`senderFooter` in
`marketing.ts` adds it; order texts never carry it). Set `SMS_SENDER_ID` to the alphanumeric sender the provider approved.

**Tax invoices.** Every sale is emailed as a tax invoice (SARS: abridged up to R5,000, full above) with a signed link to
the hosted copy (`/invoice/<sale id>?t=…`, also under Rewards → Invoices). The hosted invoice shows batch numbers per
line, VAT per rate, the payment and its reference, and a QR back to the order. Print it on A4, save it as a PDF (the
print dialog's "Save as PDF") or print it on 80 mm till paper with the "Print receipt" button. A walk-in customer can
have it emailed from the till (receipt → Email invoice). Failed sends are retried by `/api/cron/frequent` for three days.

**Statements and Z-reports.** Store → Money → Franchise statement (and HQ → Statements → a store) shows the month as a
document: parties, credits and debits netted to one amount, how the fees were worked out. Print or save as PDF from the
page; "Email to owner" sends it to the owner company's email. The till prints the Z-report at shift close (80 mm) and
emails it to the store; the same report is in Store → Money → Cash-ups → shift → Z-report, printable on A4 or as a PDF.
Paper follows the printer: on a receipt printer the document prints as a slip, on A4 as a sheet.

**Message log (HQ → Messages, `/hq/messages`).** Every SMS, email, push and WhatsApp message the platform sent or
logged (`MessageLog`): order updates, sign-in codes (logged masked), tax invoices, statements, Z-reports, loss-prevention
and staff notifications, campaign sends. HQ admin and the HQ team see the network; area managers see messages to members
homed at their stores. Filter by channel, status (sent / failed / suppressed — no consent, do-not-contact list or
outside the CPA send window), kind (transactional / marketing), campaign, date and recipient (search by the full mobile
number, email address or member number — the list shows recipients masked). Open a row for the detail drawer with the
body as sent (`?msg=<id>` in the URL, so a link to a message can be shared with the team). The campaigns page and each
campaign's delivery log link straight to it. The list is always bounded by date (the last 30 days unless you widen it).
At network scale `MessageLog` wants an index on `createdAt` (and `channel, status, createdAt`) — see the schema note in
[ARCHITECTURE.md](ARCHITECTURE.md) before the table passes a few million rows.

**Menu board (in-store TV).** Open `https://<app>/menu/<store slug>` (e.g. `/menu/hatfield`) in a kiosk browser on the
TV or its stick — Chrome/Chromium `--kiosk --noerrdialogs --disable-session-crashed-bubble`, Android TV with Fully
Kiosk, or a Raspberry Pi in kiosk mode. Landscape (16:9) and portrait (9:16) both work; the page hides the cursor,
rotates categories every 12 s, refreshes stock and prices every 60 s (sold-out lines grey out with "Sold out"), reloads
its content from the server every 10 minutes, respects the device's reduced-motion setting, and asks for a screen wake
lock (HTTPS only — otherwise turn off the device's screen timeout). It shows the store's public range only: in MEDICAL
mode licensed medicines never appear (a dispensary panel points patients to the pharmacist), and member prices are shown
only on classes where the law allows incentives (`incentiveExcluded` in `@/lib/compliance`). Deals come from the store's
active promotions; drops and events from the launch programme. Nothing on the board needs a login.

## Scheduled jobs (`/api/cron`)

Every job is idempotent and bounded, so a missed or doubled run is harmless. `POST` with `Authorization: Bearer
$CRON_SECRET`; the response is a JSON summary of what each step did. Jobs live in `src/server/jobs.ts`.

| Endpoint | When | What it does |
|---|---|---|
| `/api/cron/frequent` | every 15 min | Campaign send windows, unpaid orders, invoice retries, Founding numbers, drop alerts, merch orders |
| `/api/cron/daily` | 02:00 SAST | Birthday points, uncollected orders, tier floors, loss-prevention rules and digest, lead purge, My Deals |
| `/api/cron/staff-push` | every 5 min | Pushes to managers' and owners' phones (`src/server/staff-push.ts`): **new online orders** (polled, so an order shows up within 5 minutes — nothing hooks the checkout), **loss alerts** raised in the last day (never to the person they're about), **HQ updates that need acknowledging** (per store that hasn't). Each event is keyed in `StaffPushEvent`, so a poll never sends twice; dead subscriptions (404/410 from the push service) are pruned as they fail. |
| `/api/cron/operations` | 03:00 SAST | **Expiring lots** (once per lot as it enters the 30-day window), **cash due at the bank** (once per store per day, today or overdue), the **low-stock digest** (one push per store from the replenishment plan), **scheduled report exports** (every `ScheduledExport` due today: the report is re-run as the person who scheduled it, stored as a CSV under `exports/` and emailed to the staff recipients as a link signed for 30 days — `/api/exports/{id}?e=…&t=…`), and pruning (push-event keys older than 60 days; export `Upload` rows older than 37 days — set an R2 lifecycle rule on `exports/` to drop the objects). |

Without `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` every push is only written to the message log (HQ → Messages,
`/hq/messages`, channel PUSH) — that's how the demo runs. Staff turn notifications on per phone under Store → Settings → Notifications
(“Notify me on this phone”; on iPhone the back office must be on the Home Screen first). Thresholds for the Today list
and the digests are HQ settings under `operations` (`cycleCountDays`, `cycleCountByCategory`, `batchExpiryDays`,
`patientAuthDays`, `supplierInvoiceDays`).

## Store-opening checklist (HQ → Stores → store)

Onboarding a store seeds its opening checklist from the template in `src/lib/opening.ts` — Legal & licences (lease,
CIPC, VAT, SAHPRA/pharmacy licence where THC is licensed, POPIA register), Set-up (fit-out, internet, Yoco, tills,
printers, catalogue, Google Business Profile, photos, opening stock), People (staff, PINs, dispenser, training) and
Launch (opening date, press, site facts, soft opening). Due dates count back from the store's opening day (Status →
Opened) and move with it while the store is still opening soon; tasks are ticked off with a note by the HQ team (area
managers see them). The stores list shows each store's progress (`done/total`, overdue in red); a store that predates
the feature gets a checklist from **Start the opening checklist** on its page. Audit actions: `store.checklist_seed`,
`store.task_done`, `store.task_reopen`.

## Incidents

**POS offline (power/network).** Tills keep selling cash and queue sales locally; card and PayShap are disabled until
connectivity returns. Do not clear browser storage on a till with queued sales. Queued sales sync automatically
(idempotent); check the queue badge before closing the shift.

**Card acquiring down.** Use the External terminal tender (owner's bank device) or cash/PayShap. Record references.

**Online payments down (Peach).** Members see "We couldn't open Peach Payments' payment page", and unpaid orders are
released after `unpaidHoldMinutes` as usual. Peach retries webhooks we didn't answer with 2xx for 24 hours (1 min,
5 min, 10 min, 1 h, 6 h, 24 h), so payments made during an outage of ours still land. After that, replay the
deliveries from the Peach Dashboard. A payment that lands after its order was released is logged as `payment.review`
(see below).

**Online payments down (Yoco).** Members see "We couldn't open Yoco's payment page"; unpaid orders are released after
`unpaidHoldMinutes` as usual. Webhooks we didn't answer with 2xx are retried by Yoco (5 s, 5 min, 30 min, 2 h, 5 h,
10 h, 10 h), so payments made during an outage of ours still land. After 5 days without a successful delivery Yoco
switches the webhook off: register it again (Yoco go-live, step 1).

**Product recall.** HQ → Batches → Recall: the batch becomes unsellable everywhere immediately, stores receive an
announcement requiring acknowledgement, affected customers are listed and notified. Stores quarantine stock and write it
off with reason RECALL/DESTROYED (witnessed). Keep the recall report for SAHPRA.

**Suspected data breach (POPIA s22).** Contain (revoke sessions: delete from `Session`; rotate `SESSION_SECRET`,
provider keys), assess scope from `AuditLog`, notify the Information Regulator and affected people as soon as
reasonably possible, document everything.

**Wrong price or promotion live.** HQ → Pricing/Promotions → end or edit; tills pick up changes on the next bootstrap
refresh; refunds via POS → Sales history.

## Backups & recovery

Postgres WAL archiving (point-in-time recovery ≥ 7 days) plus a nightly encrypted `pg_dump` copied off the server to
R2 and kept 35 days; slips on disk (`UPLOAD_DIR`) are copied with it. Quarterly restore drill into staging. Target
RPO 5 minutes, RTO 1 hour. The stock ledger and loyalty ledger are append-only, so balances can be
rebuilt from movements if ever required (see the reconciliation queries in `prisma/seed.ts` comments / reports).

## Exceptions to review (HQ → Audit log)

| Action | Meaning | What to do |
|---|---|---|
| `compliance.offline_exception` | An offline till sale broke a compliance rule the till couldn't check — including a member number that didn't match a member (members only) | Review with the store manager; find the member if you can; retrain if needed |
| `sale.tender_variance` | Payments didn't match the total on a synced sale | Reconcile against the terminal report |
| `drop.limit_after_payment` | A card was charged before a drop limit tripped (race with an online order); the sale stands | Decide whether to contact the member; no refund needed unless they ask |
| `payment.review` | A Peach or Yoco payment didn't fit its order — another amount, another checkout (payment), or paid after the order was cancelled. The order was **not** marked paid | Find the payment in the Peach Dashboard (or the Yoco portal); refund it there (or sort it out with the member) and note what you did |
| `payment.refund_failed` | Peach or Yoco couldn't complete the refund of a cancelled order; the order shows paid again | Refund the member by hand (Peach Dashboard, Yoco portal or EFT) and note it |

## Loss prevention (Store / HQ → Loss prevention)

Rules run nightly (and at shift close / when a deposit is recorded). High severity is emailed at once to the store's
owner and area manager; the rest arrive in the daily digest. An alert is never shown to, or emailed to, the person it's
about. Thresholds: HQ → Loss prevention → Rules & thresholds.

| Alert | Raised when | What to do |
|---|---|---|
| Cash-up short | A shift is counted R50+ under expected (high from R500) | Recount with the manager; check the Z-report and refunds; note the outcome |
| Repeated cash shortages | The same person closes 3 shifts short in 30 days | Go through the cash-ups with them; consider two-person closes |
| Cash not banked in time | Cash-ups past the next-business-day deadline (high after 3 days) | Bank today; check the safe count |
| Deposit short | A deposit is R50+ under its cash-ups | Query the deposit; the manager explains and banks the difference |
| Suspicious refund | A card sale refunded in cash, or two of: someone else's sale, within 30 min, just before the shift closed | Check with the member and the terminal report — card sales go back to the card |
| High refund rate | A person's refund rate is 3× the norm for their role across the network (5+ in 30 days) | Review their refunds |
| Own sales refunded | 10%+ of a person's own sales refunded this month (5+) | Can inflate commission — their commission is held until the alert is closed |
| Stock write-offs | A week's damaged, theft, lost, expired and count losses are 2.5× the store's norm (R500+) | Check the adjustments and who made them; recount |
| Sales on own member card | Staff rang up a sale on their own member card | Staff purchases are rung up by someone else |
| One card, many sales | One member card on 4+ of one person's sales in a day | Check for points skimming |
| Unusual offline selling | A week's offline share is 3× the store's norm (10+ sales) | Check the connection first, then the tills |
| Sales outside trading hours | Sales more than 30 minutes outside the store's hours | Check who and why |
| Compliance exception | An offline sale broke a compliance rule | As for `compliance.offline_exception` above |

## Member support (HQ → Support, Store → Support)

Members and visitors ask for help at `/support` (no sign-in and no 18+ gate needed; a signed-in member's details are
filled in, a visitor gives an email address and ticks the consent line). Every request is a ticket (`ST-000123`) with a
conversation; members follow theirs under Rewards → Help. Guests are limited to 3 tickets an hour per connection and 5
a day per email address; members to 10 a day. Every reply, assignment, priority change and resolution is audited
(`support.*`).

| SLA | Clock | Shown as |
|---|---|---|
| First reply within **1 business day** | Starts when the ticket arrives (08:00 on the next business day if it arrives on a weekend or public holiday, SAST) | "First reply due in 3 h" → **overdue** in red once missed; the queue's *Overdue* chip |
| Resolved within **5 business days** | Same start; **pauses while the ticket waits for the member** (our reply is out) and stops when it's resolved | "Resolve due in 2 d" → overdue in red |

Working the inbox, daily:

1. **HQ → Support → Unassigned**: assign each new ticket (deliveries start at *High* priority). A reply assigns it to you
   if nobody has it yet.
2. Reply from the ticket (canned replies are starting points, edit them). The member gets it by email — by SMS when
   they have no email address — and the ticket moves to *Waiting for member*; their reply brings it back to *Open*.
3. Resolve when it's sorted (a closing note goes to the member). A member can reopen a resolved ticket by replying
   within 30 days; after that they open a new one.
4. Store managers and owners see the tickets about orders their store fulfilled (Store → Support) and work them the
   same way; everything else is HQ's. Area managers see their region's stores' tickets.
5. Watch the *Overdue* chip on HQ → Support. Anything that can't be answered within the day gets a holding reply
   ("We're looking into it") — that meets the first-reply SLA and tells the member when to expect an answer.

POPIA: the ticket holds the member's name, email and phone; the audit log keeps numbers and categories only; guests'
IP addresses are kept as a keyed hash; resolved tickets and their messages are deleted a year after they close by the
daily job (`support.purge`). A member's photo sent with a message is served only to them and to staff who may see the
ticket (`/media/[id]`).

## Returns (HQ → Returns, Store → Returns)

A member starts a return from the order (Rewards → Orders → the order → **Return or report a problem**): a reason, the
items, a note and up to three photos. The rules are in `src/lib/returns.ts` and the policy at `/legal/returns`:
faulty, damaged or wrong within 6 months of delivery (CPA s56); a change of mind within 7 days of delivery (ECTA s44),
never for made-to-order merch or licensed medicines, and sealed consumables only. Every step tells the member by email
(SMS without an email address) and is audited (`return.*`).

| Step | Who | What happens |
|---|---|---|
| **Requested** | Member | `RT-000123`; the units are spoken for (they can't go into a second request) |
| **Approve** / **Decline** | Store manager or owner, or HQ | Decline needs a reason the member reads. Faulty goods within 6 months and change-of-mind within 7 days are the member's rights: decline only outside them (opened consumables, made-to-order merch, outside the window) |
| **Book collection** | Store / HQ | **Manual for now:** book the collection with the courier (portal or phone), then record the courier and waybill; the member gets both. Faulty, damaged or wrong goods: at our cost. Change of mind: the member's delivery fee covers the collection (the direct cost of the return, ECTA s44(3)) |
| **Received** | Store / HQ | When the parcel arrives (or the member drops it off) |
| **Refund** | Store manager or owner, or HQ | The amount is worked out for you: each returned unit's share of its line (what was actually paid), plus the delivery fee when the whole order has come back for a reason that's ours (not for a change of mind); never more than was paid in money — points come back as points. Tick *back on the shelf* only for sealed, sellable units (never faulty or damaged goods) |

The refund goes back the way the order was paid: **Peach Payments or Yoco** refund by amount against the order's
payment (Yoco with an idempotency key per return; Peach as a running total per order, so a retry never refunds twice);
**pay-in-store or simulated payments** are refunded by hand (EFT, or at the till) and recorded with the reference. The
credit note (`<store>-RT-000123`) posts at the fulfilling store as a refund sale — stock back on the shelf where ticked,
points reversed, rollups adjusted — and the tax credit note is emailed. A gateway refund that later fails arrives as
`payment.refund_failed` in the audit log: refund the member by hand and note it. If the money moved but the credit
note didn't post (a crash half-way), pressing Refund again posts only the credit note.

## Data reconciliation checks

```sql
-- Stock levels equal the ledger
SELECT count(*) FROM "StockLevel" sl LEFT JOIN (SELECT "storeId","variantId","batchId", sum(qty) q FROM "StockMovement" GROUP BY 1,2,3) m
  USING ("storeId","variantId","batchId") WHERE coalesce(m.q,0) <> sl."onHand";
-- Rollups equal sales
SELECT (SELECT sum("grossCents") FROM "DailyStoreStat") = (SELECT sum("totalCents") FROM "Sale");
-- Loyalty balances equal the ledger
SELECT count(*) FROM "Customer" c LEFT JOIN (SELECT "customerId", sum(points) p FROM "LoyaltyEntry" GROUP BY 1) l
  ON l."customerId" = c.id WHERE coalesce(l.p,0) <> c.points;
-- Instant Rewards savings: never on medicines (s18A), never on walk-ins, rollups equal sales
SELECT coalesce(sum(sl."memberSavingsCents"),0) FROM "SaleLine" sl JOIN "Variant" v ON v.id = sl."variantId"
  JOIN "Product" p ON p.id = v."productId" WHERE p."regClass" = 'THC';
SELECT coalesce(sum("memberSavingsCents"),0) FROM "Sale" WHERE "customerId" IS NULL;
SELECT (SELECT sum("memberSavingsCents") FROM "DailyStoreStat") = (SELECT sum("memberSavingsCents") FROM "Sale");
```
All should return 0 / true.
