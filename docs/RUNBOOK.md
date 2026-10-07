# Runbook

## Environments

| | Local | Staging | Production |
|---|---|---|---|
| Database | Postgres 16 (`docker compose up db` or local cluster) | Postgres on the staging server | Postgres 16 on our own server in South Africa, WAL archiving + nightly dumps |
| Files (banking slips) | `.data/uploads` on disk | R2 bucket `…-staging` | Cloudflare R2 bucket (EU jurisdiction), or `UPLOAD_DIR` on the server |
| Data | `npm run db:seed` demo network | Anonymised copy or seed | Real. Never seed it (the seed truncates every table, so it refuses a database with users it didn't create itself unless given `--wipe=<database name>`, and refuses `NODE_ENV=production`) |
| `DEMO_MODE` | true | true (clearly labelled) | **false**. With it off, a production server won't serve (every request answers 500 and the log says why) without an https `APP_URL` and a 32+ character `CRON_SECRET`, and warns about missing email, alerts, messaging and file storage; with it on, it refuses live payment keys the same way |
| `SESSION_SECRET` | any | 32+ random characters | 32+ random characters (`openssl rand -base64 48`): a production server won't serve without one |

## First deploy

Hosting: our own server in South Africa runs the app and Postgres; Cloudflare sits in front (DNS, TLS, WAF and bot
protection, caching of `/_next/static`) through a Cloudflare Tunnel, so the server has no open inbound ports. Keep it
that way: the app trusts Cloudflare's `cf-connecting-ip` for its per-connection limits, which is only safe while nothing
but the tunnel can reach it. Files go to Cloudflare R2. The app itself doesn't run on Cloudflare Workers (it's a Node server with Postgres, SMTP and long
reports) and Postgres can't live on Cloudflare.

1. Server: Docker, Postgres 16 on the server itself (listening on 127.0.0.1 only), a `cloudflared` tunnel to
   `http://localhost:3000`, and `/srv/herbal-holland/.env` made from `.env.example` with every production value
   ([INTEGRATIONS.md](INTEGRATIONS.md#environment-variables)): `DEMO_MODE=false` from the start, `APP_URL` the shop's
   https address, `SESSION_SECRET` (`openssl rand -base64 48`), `CRON_SECRET` (`openssl rand -hex 32`),
   `DATABASE_URL=postgresql://…@127.0.0.1:5432/…` with a generated password. Never publish Postgres or the app on a
   public interface: Docker's port rules bypass the host firewall. `docker-compose.prod.yml` uses the server's own
   network, so the app listens on 127.0.0.1:3000 and reaches Postgres at 127.0.0.1; the plain `docker-compose.yml` is
   a local demo (it seeds demo data and turns demo mode on) and must not run on the server. Cloudflare: proxied DNS
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
2. R2: create a bucket with the **EU jurisdiction** (R2 has no South African location, so record the cross-border
   transfer in the POPIA register), an API token limited to that bucket (Object Read & Write), and set `S3_ENDPOINT`
   (`https://<account-id>.eu.r2.cloudflarestorage.com`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
   Without them slips are stored on the server under `UPLOAD_DIR` (the image's `/data/uploads` volume); include it in backups.
3. From a checkout of the release on the server: `docker compose -f docker-compose.prod.yml build`, then the
   migrations: `docker compose -f docker-compose.prod.yml run --rm migrate`.
4. Start the app: `docker compose -f docker-compose.prod.yml up -d app` (restarts with the server; behind the
   tunnel). `GET /api/health` is the liveness check (the container's own health check uses it); it should answer 200
   and the log shows no `[config]` warnings you didn't expect.
5. Create the first HQ admin: `docker compose -f docker-compose.prod.yml run --rm migrate npx tsx scripts/create-admin.ts --email you@herbalholland.co.za --name "Your Name"`
   (the franchisor company too, if there's none yet). It prints a temporary password once; they choose their own at
   first sign-in, and everyone after them is added from HQ → Team. `--company "…(Pty) Ltd"` sets the franchisor's
   legal name; its other details (registration and VAT numbers, address, phone, email, directors) are edited on a
   store it owns: create the distribution centre (step 7), then HQ → Stores → the DC → Owner. Tax invoices, the
   legal pages and emails print them.
6. HQ → Compliance: confirm `thcMode`, channel matrix and store licences with counsel.
7. HQ → Stores: onboard DCs and stores (ranging template, fees, licences); Catalogue: products, variants, batches with COAs
   (HQ → Catalogue → Import loads the range from a spreadsheet, with the warehouse's opening stock, after a dry run).
   After any bulk import (catalogue, members, opening stock) run `ANALYZE;`. Autovacuum is slow to gather statistics
   on small tables, and without them the planner scans the whole network for single-store queries.
8. Pair POS devices per store (`/pos/pair`), create staff with PINs, designate dispensers.
9. Configure the scheduler with `Authorization: Bearer $CRON_SECRET`: `POST /api/cron/frequent` every 15 min,
   `POST /api/cron/daily` at 02:00 SAST, `POST /api/cron/staff-push` every 5 min and `POST /api/cron/operations` at
   03:00 SAST (see [Scheduled jobs](#scheduled-jobs-apicron)). Run it on the server itself, calling
   `http://localhost:3000`, not through Cloudflare: Cloudflare cuts requests at 100 s, and the nightly books run at
   1,000 stores takes about 2½ minutes. SAST is UTC+2 with no daylight saving, so in a UTC crontab
   (`/etc/cron.d/herbal-holland`, the secret in a root-only file):
   ```
   */15 * * * *  root  curl -fsS -m 1500 -X POST -H "Authorization: Bearer $(cat /etc/herbal-holland/cron-secret)" http://localhost:3000/api/cron/frequent   >/dev/null
   */5  * * * *  root  curl -fsS -m 300  -X POST -H "Authorization: Bearer $(cat /etc/herbal-holland/cron-secret)" http://localhost:3000/api/cron/staff-push >/dev/null
   0    0 * * *  root  curl -fsS -m 2700 -X POST -H "Authorization: Bearer $(cat /etc/herbal-holland/cron-secret)" http://localhost:3000/api/cron/daily      >/dev/null
   0    1 * * *  root  curl -fsS -m 1500 -X POST -H "Authorization: Bearer $(cat /etc/herbal-holland/cron-secret)" http://localhost:3000/api/cron/operations >/dev/null
   ```
   Check it works: run each line once by hand (a JSON summary, HTTP 200), then point an uptime monitor at
   `GET /api/health/jobs`, which answers 503 when a job hasn't succeeded in time (a dead scheduler, a wrong
   `CRON_SECRET`, or a step that keeps failing).

## Peach Payments go-live (online payments)

How it works: [INTEGRATIONS.md → Online payments](INTEGRATIONS.md#online-payments-peach-payments-chosen-and-yoco).

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
     (`/hq/messages`, channel SMS; open the row to read the text as sent).
   - Leave Peach's page without paying → **Payment cancelled** → Try again opens the same page.
   - Cancel the paid order in the back office: it's refunded (`pending` or `succeeded`; the refund id is on the order),
     and `payment.refunded` appears in the audit log once Peach confirms.
3. **Stuck on "Waiting for payment confirmation…"?** The app log shows why:
   - 401: the wrong `PEACH_PAYMENT_RESPONSE_HASH_KEY`, or a webhook from the other environment;
   - 503: the key isn't set;
   - 200 `{"action":"repeat"}`: a redelivery of an event already handled (each event id is kept in `PaymentEvent` for
     90 days), which is normal and needs no action;
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
Vantax (Pty) Ltd if online). See the acceptable-use note in INTEGRATIONS.md. Don't take live payments without it.

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
   domain). Live keys become available when Yoco approves it; live payments must start on that domain.
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

- Before every release: a fresh dump (`pg_dump -Fc`) or a server snapshot. Migrations only go forward (there are no
  down migrations): to undo one, restore the dump. Then `docker compose -f docker-compose.prod.yml build`,
  `… run --rm migrate`, `… up -d app`.
- Migrations (`prisma migrate deploy`) run before the new app version starts. Schema changes take table locks: apply
  them outside trading hours (after 22:00 SAST). Tills keep selling offline and sync afterwards. A load test showed a
  migration during peak posting stalls tills behind the lock. Once the tables hold real data: start hand-edited
  migrations with `SET lock_timeout = '5s';` (a migration that can't get its lock fails fast instead of queueing every
  till behind it), put `CREATE INDEX CONCURRENTLY` in a migration file of its own (it can't run inside a transaction),
  and add a column with a default in two steps on the big tables (`Sale`, `SaleLine`, `StockMovement`, `JournalLine`).
- Capacity (1,000-store dataset: 998 stores, 175k members, 425k sales; one app instance, 10 DB connections):
  POS posting p50 ≈ 170 ms, p95 ≈ 440 ms, ≈ 45 sales/s. `e2e/crawl.mjs` (every page as every role, production build):
  storefront ≈ 50–130 ms (home ≈ 90 ms, store finder ≈ 140 ms), HQ console and store back office p50 ≈ 60 ms.
  Network-wide HQ reports over 30 days are mostly < 1 s; slowest: age checks ≈ 2.5 s (reads raw sales; give it a
  rollup if it matters), dispensing register ≈ 1.5 s, franchise statements ≈ 1.3 s. Re-run `scripts/bench.ts`,
  `e2e/crawl.mjs` and the e2e journeys against a production-sized copy before big releases.

## Launch day

1. HQ → Founding Members: confirm when the list closes (SAST). The shop trades normally while it's open. Stores
   that haven't opened are **opening soon** (HQ → Stores; members can pick them as home store) and switch to
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
hardware below is optional and set up per device under **Shift → This till** (settings stay on that device; nothing is
stored on the server).

**Receipt printer (ESC/POS).** Any 58 mm or 80 mm ESC/POS receipt printer with Bluetooth LE or USB: tested layouts
for 32 columns (58 mm) and 42 / 48 columns (80 mm). Known-good families: Xprinter XP-58/80 BLE models, Sunmi and
GOOJPRT 58 mm portables, Epson TM-m30 / TM-T20 (USB), Bixolon SPP-R200/R310 (USB; the Bluetooth models are classic
SPP, see below). The till speaks Web Bluetooth (BLE GATT) and Web USB, so it needs **Chrome, Edge or Samsung Internet
on Android, ChromeOS, Windows, macOS or Linux** over https. Not supported: iPhone/iPad (print through AirPrint from the
print dialog), Firefox, and classic-Bluetooth "SPP" printers (Web Bluetooth can't reach them, so use their USB port or
a BLE model). Pairing: turn the printer on → **Shift → This till → Receipt printer & drawer → Pair Bluetooth printer**
(or **Pair USB printer**; on Android use an OTG cable) → pick it in the browser's chooser → choose the paper width →
**Test print** (prints a test page with accents, bold, double height and a QR; check nothing is cut off, and if the right
column wraps, choose a narrower width). Windows USB: if "Couldn't claim the printer's USB interface" appears, the
vendor driver holds the port. Swap it for WinUSB with Zadig, or use Bluetooth. The printer is remembered on the
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
camera button next to search, or "Scan member card") uses the browser's BarcodeDetector (Chrome/Edge/Samsung
Internet on Android, Chrome on ChromeOS and macOS), with a viewfinder and a torch toggle where the camera has one;
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
manager's PIN). The till shows an orange outline and the banner **TRAINING: nothing is real**; a five-step tour
walks a new cashier through search/scan, the member, the basket, charging and the receipt. Everything runs on a
sandbox: practice sales are numbered `TRAINING 0001…`, never posted or queued, never move stock or award points;
member sign-ups and age checks are simulated on the till; receipts print (or open in the print dialog) with a
TRAINING watermark; the drawer stays shut; online orders, refunds, shift open/close and invoices are refused with a
message; the customer display carries a training banner. Practice receipts are listed under **Sales** for re-printing
and simulated refunds. Exiting needs a manager's PIN; start and end are audited (`pos.training_start` /
`pos.training_end`). Real sales queued before training started still sync.

**Quiet hours.** With no sale open and no touch for 3 minutes the Sell screen shows a calm dashboard, built from what the
till already caches: takings so far this shift, click & collect orders ready to hand over, low-stock lines, what's
waiting on the till (offline sales to sync, late orders, stale catalogue, no shift) and the store's next event.
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
browser (localStorage: a private window or cleared site data starts empty), so there's nothing to administer.

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
| Continuous | Liveness (`/api/health`), scheduler heartbeat (`/api/health/jobs`), error alerts (`ALERT_EMAIL`), disk and DB connections | Uptime monitor + server monitoring |
| Every 15 min | Release campaigns held for a legal send window; cancel unpaid online orders (stock released after `unpaidHoldMinutes`); retry failed invoice emails; number Founding Members once the list closes; drop alerts to watchers; email paid merch orders to the print partner | `/api/cron/frequent` |
| Every 5 min | Staff push notifications: new online orders (polled; nothing hooks the checkout), loss alerts about other people, HQ updates that need acknowledging | `/api/cron/staff-push` |
| Daily 03:00 | Staff push digests (lots entering the expiry window, cash due at the bank, low stock per store); scheduled report exports emailed as signed CSV links; pruning of old push-event keys and export files | `/api/cron/operations` |
| Daily (manager) | Work the **Today** list on the store overview: orders to pick or hand over, cycle counts due, cash to bank, open alerts, expiring lots, low stock, lapsing patient authorisations, HQ updates, supplier invoices due | Store → Overview |
| As delivered | Capture an outside supplier's invoice (photo or PDF, ≤ 8 MB) under Finance → Supplier invoices; mark paid as settled, query one that doesn't match. A stock order (from the DC or another store) is put on automatically when received (for what was counted in) and settles on the franchise statement, so there's nothing to capture or pay; orders received before this was automatic were put on by the `20261005130000_backfill_statement_invoices` migration | Store → Finance |
| Daily (DC) | Print partner's shipping emails → enter courier + tracking on each merch order (**Merch shipped**); chase anything "sent" for more than 7 working days; mark delivered merch orders delivered | Store back office → DC → Online orders |
| Daily 02:00 | Birthday points; cancel pay-in-store collections not collected within `collectHoldDays`; lapse expired tier floors; loss-prevention rules + the digest email to owners and area managers; load weekly My Deals (Mondays); reorder reminders; gift-voucher expiry; trade holds, licences and statements; POPIA purges (leads, resolved tickets, message texts after 12 months); stock-order invoices from a month that's over marked settled on its statement; the books' nightly posting and bank auto-match | `/api/cron/daily` |
| Daily | Cash-ups closed at every store; negative-stock and compliance-event reports reviewed | Reports |
| Daily (store) | Bank yesterday's cash by the next business day: Banking → tick the cash-ups → amount, reference and a photo of the stamped slip | Store → Banking |
| Daily (owner / area manager) | Check new deposits against the bank statement (Verify, or Query with a note); work the loss-prevention alerts: investigate, then resolve or dismiss with a note | Store → Banking / Loss prevention |
| Monthly (owner) | Approve last month's commission for payroll (people with open alerts are held until they're closed), download the CSV | Store → Commission |
| Weekly | Replenishment orders submitted/approved/shipped; expiry report actioned | Purchasing / Distribution |
| Weekly | Schedule the week's social posts (merch, store news, events, Learn); answer comments and DMs in Postiz or the apps, but never take orders there | HQ → Campaigns → Social |
| Monthly | Cycle counts per category; franchise statements emailed; NCC opt-out registry import into Suppression; VAT201 working per store | Stock takes / HQ Statements / Marketing |
| Quarterly | Access review (users, roles, devices); restore test from backup | HQ Team / DB |

## Documents & messages

**Emails.** Every email the platform sends (tax invoices and credit notes, order updates, franchise statements,
wholesale invoices, Z-reports, loss-prevention alerts, franchise-enquiry replies, campaigns) uses one layout in
`src/server/email-templates.ts`: cream page, white card, the mark and wordmark, an orange pill button, tabular figures,
and a footer whose legal line comes from the franchisor Company record (HQ → Stores → the distribution centre → Owner: legal name, registration
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
homed at their stores. Filter by channel, status (sent / failed / suppressed: no consent, do-not-contact list or
outside the CPA send window), kind (transactional / marketing), campaign, date and recipient (search by the full mobile
number, email address or member number; the list shows recipients masked). Open a row for the detail drawer with the
body as sent (`?msg=<id>` in the URL, so a link to a message can be shared with the team). The campaigns page and each
campaign's delivery log link straight to it. The list is always bounded by date (the last 30 days unless you widen it), and `MessageLog` is indexed on `createdAt`
and `channel, status, createdAt` for it.

**Menu board (in-store TV).** Open `https://<app>/menu/<store slug>` (e.g. `/menu/hatfield`) in a kiosk browser on the
TV or its stick: Chrome/Chromium `--kiosk --noerrdialogs --disable-session-crashed-bubble`, Android TV with Fully
Kiosk, or a Raspberry Pi in kiosk mode. Landscape (16:9) and portrait (9:16) both work; the page hides the cursor,
rotates categories every 12 s, refreshes stock and prices every 60 s (sold-out lines grey out with "Sold out"), reloads
its content from the server every 10 minutes, respects the device's reduced-motion setting, and asks for a screen wake
lock (HTTPS only; otherwise turn off the device's screen timeout). It shows the store's public range only: in MEDICAL
mode licensed medicines never appear (a dispensary panel points patients to the pharmacist), and member prices are shown
only on classes where the law allows incentives (`incentiveExcluded` in `@/lib/compliance`). Deals come from the store's
active promotions; drops and events from the launch programme. Nothing on the board needs a login.

## Scheduled jobs (`/api/cron`)

`POST` with `Authorization: Bearer $CRON_SECRET`; the response is a JSON summary of what each step did. Jobs live in
`src/server/jobs.ts`. Each job runs single-flight (a 45-minute lock), and every step runs on its own: a step that
fails is reported (`ALERT_EMAIL`), the rest still run, and the job then answers 500 naming the failed steps, so
`curl --fail` notices. A doubled run does nothing twice. Every run is recorded (`JobRun`), and `GET /api/health/jobs`
answers 503 when a job hasn't finished cleanly within its window (`frequent` 30 minutes, `staff-push` 15 minutes,
`daily` and `operations` 26 hours): point an uptime monitor at it.

A missed night is made up by the next one: the books post any store-day of the last 7 days that never posted (and
the points of all 7 days again, which is harmless), last month's franchise statements still unposted during the first
week of a month, and trade statements go out on the statement day or any of the six days after it to accounts that
haven't had theirs. Birthday points and the Monday My Deals refresh are only for their own day. For a longer gap,
re-post a period with `npx tsx scripts/ledger-backfill.ts 2026-10-01 2026-10-07` (in the `migrate` container on the
server: `docker compose -f docker-compose.prod.yml run --rm migrate npx tsx scripts/ledger-backfill.ts …`); it prints
what it queued and posted, and exits 1 if anything failed.

| Endpoint | When | What it does |
|---|---|---|
| `/api/cron/frequent` | every 15 min | Campaign send windows, unpaid orders, invoice retries, Founding numbers, drop alerts, merch orders, wishlist stock notes; the books: queued postings (`processLedgerQueue`) |
| `/api/cron/daily` | 02:00 SAST | Birthday points, uncollected orders, tier floors, loss-prevention rules and digest, lead purge, resolved support tickets deleted a year after they close, My Deals, reorder reminders, gift vouchers expired after three years (CPA s63), `settleStatementInvoices` (stock-order invoices from the DC or another store, from a month that's over, are marked settled on that month's franchise statement), sign-in housekeeping (`purgeAuthRecords`: expired sessions, sign-in codes after a day, rate-limit rows after two days, webhook receipts after 90); **trade**: `tradeEftExpiry` (EFT orders unpaid after `trade.eftHoldDays` are cancelled and the buyer told), `tradeOverdueHolds` (accounts on credit terms with an invoice open more than `trade.overdueGraceDays` past due go ON_HOLD with the reason "overdue", emailed; the hold lifts itself when a payment or credit clears what's past due), `tradeLicenceExpiry` (a reminder once per licence, 30 days before a required one lapses, unless a newer one is in; an approved account whose required licence has lapsed goes ON_HOLD with the reason "licence", emailed; verifying the renewal lifts it), `tradeStatements` (on `trade.statementDay`, last month's statement to every approved or held account with ledger activity, once per account and month; the receipt is the message-log row `trade-statement-<account>-<month>`); **POPIA**: message texts older than 12 months are blanked (`purgeMessageBodies`; the row stays); **the books** (`ledgerNightly`, near the end): yesterday's store-days and HQ-given points, and on the 1st last month's franchise statements, plus what a missed night in the week before left, queued and posted; then **bank auto-match** (`autoMatchAll`: unmatched statement lines from the last 90 days, each bank account on its own) |
| `/api/cron/staff-push` | every 5 min | Pushes to managers' and owners' phones (`src/server/staff-push.ts`): **new online orders** (polled, so an order shows up within 5 minutes; nothing hooks the checkout), **loss alerts** raised in the last day (never to the person they're about), **HQ updates that need acknowledging** (per store that hasn't). Each event is keyed in `StaffPushEvent`, so a poll never sends twice; dead subscriptions (404/410 from the push service) are pruned as they fail. |
| `/api/cron/operations` | 03:00 SAST | **Expiring lots** (once per lot as it enters the 30-day window), **cash due at the bank** (once per store per day, today or overdue), the **low-stock digest** (one push per store from the replenishment plan), **scheduled report exports** (every `ScheduledExport` due today: the report is re-run as the person who scheduled it, stored as a CSV under `exports/` and emailed to the staff recipients as a link signed for 30 days, `/api/exports/{id}?e=…&t=…`), and pruning (push-event keys older than 60 days; export CSVs and their `Upload` rows older than 37 days). |

Without `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` every push is only written to the message log (HQ → Messages,
`/hq/messages`, channel PUSH), which is how the demo runs. Staff turn notifications on per phone under Store → Settings → Notifications
(“Notify me on this phone”; on iPhone the back office must be on the Home Screen first). Thresholds for the Today list
and the digests are HQ settings under `operations` (`cycleCountDays`, `cycleCountByCategory`, `batchExpiryDays`,
`patientAuthDays`, `supplierInvoiceDays`).

## Trade (wholesale)

Businesses buy at ex-VAT trade prices online (courier from the DC, or click & collect at a store) and at any till.
Server side in `src/server/trade/*` (accounts, auth, orders, ledger, emails, jobs), rules in `src/lib/trade.ts`.

**Settings** (HQ → Settings → Trade, key `trade`): `minOrderCents` (R2,000 ex VAT), `deliveryCents` (R150 ex VAT,
flat) and `freeDeliveryOverCents` (R5,000 ex VAT), `collectHandlingCents` (R75 ex VAT on click & collect),
`eftHoldDays` (3), `overdueGraceDays` (7), `statementDay` (1), `termsVersion` ("trade-1"), and `bank` (bank, account
name, account number, branch code, printed on every pro forma; **fill these in before the first trade order**).
`TRADE_EMAIL` (else `FRANCHISE_EMAIL`, else franchise@herbalholland.com) is where new applications are announced.

**Licences.** Every application carries the licences its kind of business needs for the ranges it asks for (the
matrix: `src/lib/trade-licences.ts`, docs/COMPLIANCE.md), each with its number, expiry where it lapses, and the document (PDF, JPG
or PNG, ≤ 5 MB, stored under `trade-licences/` in R2/S3 or `UPLOAD_DIR`; back it up). Each new document emails the
trade team ("licence to check"). HQ → Trade shows **Licences to check** (oldest first; the accounts list has the same
tab). On the account's Overview, **View document**, check it against the issuer's register (SAPC, BHF PCNS, CIPC, SARS,
SAHPRA, the municipality), then **Verify** or **Not accepted** with the reason (emailed; the buyer uploads another
under Account › Licences). Renewals arrive the same way. Thirty days before a licence lapses the daily job reminds
the account; once one has lapsed, nothing can be ordered, shipped, collected or sold at a till for the account, and
the job puts it on hold (reason "licence"). Verifying the renewal lifts that hold and emails the account. An approved
account can't be switched to a kind, ranges or registration number whose licences it doesn't hold. Have it upload them
first (a buyer can send any licence; one not needed yet shows as "on file" on both sides until it's needed). A shop or
online shop with no registration number is a sole proprietor and gives its SARS tax registration instead of the CIPC
certificate; one that registers a company sends the certificate (typing the number), then the number goes on the account.

**Approving an account.** Applications arrive from the portal as PENDING accounts (`TA-…`) with their OWNER buyer and
licences; the applicant gets an acknowledgement and the trade team an email. HQ → Trade → Accounts: verify the
licences (as above; approval is refused until every required one is verified, and VAT numbers are format-checked, not
verified), then **Approve** with the terms: PREPAID (EFT before picking) or
ACCOUNT with a credit limit and payment days (default 30), the ranges it may buy (never THC), and optionally a TRADE price
list and a serving DC. The approval email carries the terms. **Hold** stops new on-account orders (EFT still works);
**Close** signs every buyer out for good (the balance stays due). Buyers sign in with a six-digit code emailed to
them (`/trade/login`, 12-hour sessions); an account's owner adds and removes buyers in the portal.

**Confirming an EFT.** An EFT order sits in PENDING_PAYMENT (nothing reserved) with a pro forma quoting the
reference `HH-TO-000123`. When the money shows on the bank statement, HQ → Trade → Orders → **Confirm payment** with the
bank reference: the order becomes PLACED, the stock is reserved and the PAYMENT lands on the account's ledger. Orders
unpaid after `eftHoldDays` are cancelled by the daily job and the buyer told; confirming a cancelled order isn't
possible (record the payment on the ledger instead and have them reorder).

**Shipping (courier).** The DC picks (`pick`), then **Ship** with the courier and tracking number; a line that can't
be filled ships short (`shortShip`) and is invoiced for what went. Shipping posts the WHOLESALE sale at the DC (FEFO
lots), numbers the tax invoice `TI-…`, raises the INVOICE on the ledger (due after the payment days on account; on
the day for EFT) and emails the buyer the news and the tax invoice.

**Click & collect.** The buyer chose a participating store; the store's phones get the same push as a new online
order. The store picks, marks it **Ready** (the buyer gets the six-digit collection code by email and text) and hands
it over with **Collect** after checking the collector's ID (18+) and the code. That posts the sale at the store with
the handling fee, and invoices and emails exactly like shipping. The money was collected by HQ (EFT to HQ, or the trade
ledger), so it shows under HQ-collected takings on the store's statement.

**Till trade sales.** Trade-sale mode on the till looks the account up (`tradeAccountLookup`: approved accounts, and
held ones for cash/card only; one whose licences aren't in order shows a **Licence** chip and can't be picked), prices the basket ex VAT with VAT per line and takes money as usual and/or **On
account** within the credit decision; the tax invoice goes to the account's billing email. Refunds put the on-account
part back as a credit note. No points, member prices, My Deals or gift vouchers; never offline.

### Trade sales at the till

A business buying at the counter: **Trade sale** (next to Find member on the Sell screen; it needs a connection, so
offline it is greyed out and a trade basket is never queued) → find the account by name, number (`TA-…`, however
typed) or VAT number → the basket goes into trade mode with a **TRADE SALE · account** banner (no member, points,
member prices or deals: a basket is retail or trade, never both). Lines are re-quoted by the server at the account's
trade prices ex VAT with VAT per line; a line the account may not buy (a range it isn't approved for, a licensed
medicine, a product off sale) says why and is removed before payment. The compliance sheet's member and patient rules
don't apply, but the usual 18+ counter check does (ID sighted / SA ID number). Payment: cash, card (tap, Yoco or a bank
terminal), PayShap, **EFT** (the bank reference from the proof of payment) and **On account**, offered only when the
account is APPROVED on ACCOUNT terms and the amount is within what it may still put on account (the credit decision,
re-checked when the sale posts). The receipt is a **tax invoice**: the account's buyer block (legal name, address,
VAT number), unit ex VAT · VAT · incl per line, "On account · due <date>" from the ledger invoice, no points. The tax
invoice is emailed to the account's billing address. Refunds (Sales tab): the part that was on account comes back as a
credit note on the ledger first; only the rest is paid out by the chosen money method (never On account or a voucher).
Z-report / X-report: a **Trade sales** section (count, ex VAT, VAT, incl) and **On account** as its own tender line
(not cash, not card), so the cash-up is unchanged. Trade click & collect orders at the store appear on the Orders board
tagged **Trade · TO-…** with the account name: PLACED/PICKING ones are packed and marked ready in the back office; a
READY one is handed over at the till with the buyer's 6-digit collection code (it must match the order; the TO number
isn't a fallback) and the ID (18+) tick, which posts the WHOLESALE sale at the store with the handling fee on the open
shift. Training mode may look accounts up and practise a trade sale (nothing posts); handovers are refused.

**Ledger and statements.** HQ → Trade → Account → Ledger: record payments (bank reference; name the order or
invoice it settles so the ageing is exact), issue credit notes (`TC-…`, with a note) and adjustments (always with a
note). Statements go out on the statement day for the previous month; **Send statement** resends one by hand
(`emailTradeStatement(accountId, "YYYY-MM", { force: true })`). Ageing is current / 30 / 60 / 90+ days past due after
credits are applied (to the item they name first, then oldest due first).

**HQ console (how-to).** `/hq/trade` is the overview: applications waiting, licences to check, open orders (to pick at the DC,
ready to collect), EFTs to confirm, accounts on hold, the balance outstanding and overdue (FIFO ageing), links to the Trade sales
and Trade aged balances reports and to the settings. `/hq/trade/accounts` lists accounts by status (All / Pending /
Licences to check / Approved / On hold / Closed; search by number, name, VAT number or email; sortable incl. balance). An account's page
has four tabs: **Overview** (licences: view, verify, not accepted; approve with terms, or save terms; business and delivery details; hold / lift the hold;
close by typing CLOSE), **Ledger & statements** (record a payment, credit note, adjustment; the month's statement with
**Email statement**), **Orders**, **Buyers** (add, remove). **Place an order** (approved accounts) captures a phone
order: search the trade range at the account's DC, add whole cases, courier or click & collect at a store, EFT or on
account. The account gets the same emails as a portal order. `/hq/trade/orders` has views Open / Pending EFT / To pick
/ Ready for collection / In transit (shipped in the last 7 days) / Done / Cancelled / All; an order's page confirms the
EFT (bank reference), picks and ships (courier, tracking, short lines) or cancels (reason). Area managers see their
region's orders and accounts read-only; the HQ team acts. Settings: `/hq/settings` → Trade card (HQ administrator).

**Store back office (how-to).** Store → **Trade orders** (`/store/<code>/trade`): the click & collect trade orders at
this store (To fulfil / Done / Cancelled); the Today list and the Online orders page point here while any are open.
An order's page shows the lines with what's on hand, the collection code (never read it out), then **Start picking** →
**Packed and ready for collection** (the buyer is emailed and texted the code) → **Hand over**: tick that the collector's
ID was seen (18+), type the six-digit code they give (it must match), note any short line. The WHOLESALE sale posts at
the store with the handling fee, the tax invoice is numbered and emailed, and the sale number and invoice link show on
the page. Any staff member at the store can pick, ready and hand over; a manager or owner cancels (with a reason).

### Trade portal

The buyer-facing side lives at `/trade` (`src/app/trade/*`, components in `src/components/trade/*`), on the shop's
dark look: the landing page (indexable, Organization JSON-LD), `/trade/apply` (the application form; field errors
come from `validateTradeApplication`, and success says "We'll be in touch within one business day"), `/trade/terms` (the
terms applicants accept, `settings.trade.termsVersion`, placeholder wording marked for counsel) and `/trade/login`
(a 6-digit code by email; in DEMO_MODE the form shows the code with "Fill it in"). Signed in (`hh_trade`, 12 hours):
`/trade/range` (the account's DC, searchable, by category, paginated; a PENDING account browses without prices, an
account on hold sees why ordering is paused), `/trade/cart` (kept on the account as `TradeCart`, shared by its buyers on
any device, changed under a row lock; whole cases, re-quoted by the WHOLESALE engine every time; codec in
`src/lib/trade-cart.ts`), `/trade/checkout` (courier to the account's
delivery or billing address, or click & collect with a per-store stock check from `collectStoresFor`; EFT or on
account within `creditDecision`), `/trade/orders` and `/trade/orders/[id]` (pro forma with the bank details and
`HH-TO-…` reference, collection code with "bring your ID (18+)", courier and tracking, the signed tax-invoice link,
"order again"), `/trade/account` (terms, credit, ageing, details and buyers; owners edit) and `/trade/statements`
(`tradeStatementFor`, printable, "email me this statement"). Everything but the landing, application and terms
pages is `noindex` and disallowed in `robots.txt`; the sitemap lists only those three.

Journey test: `BASE_URL=… DATABASE_URL=… SESSION_SECRET=… DEMO_MODE=true node e2e/trade.mjs [outdir]` (applies,
approves in SQL, orders by collection on account and by courier with EFT, checks the tracker, account and
statements, cleans up). `e2e/crawl.mjs` crawls the portal as a throwaway trade buyer too.

## Reorder reminders, gift vouchers, wishlists and addresses (the shop's member features)

**Reorder reminders** (`ReorderReminder`, `src/server/shop/reminders.ts`). A member sets "Remind me to reorder" on a
product page (every 14–90 days, by SMS, email or app notification). The **daily job** (`/api/cron/daily` →
`reminders`) sends each due reminder one message with a one-tap link (`/r/<id>/<token>`) that puts the item in the
bag, then moves the reminder on by its interval. Nothing is charged: there is no card on file until Peach approves
tokenisation, at which point this becomes a real subscription. Members manage them at `/club/reminders`; a product
taken off sale stops its reminders on the next run (`stopped` in the job's summary). Reminders are transactional
(the member asked for exactly this) and go out whatever the marketing consents say (see COMPLIANCE.md).

**Gift vouchers** (`GiftVoucher`, `VoucherRedemption`, `src/server/shop/vouchers.ts`). Bought at `/gift` for R200,
R500 or R1,000: the purchase is an ordinary online order for the virtual **Gift voucher** product (slug
`gift-voucher`, category `gift-vouchers`, status DRAFT so it is never listed; created on first use). It sits with the
franchisor's warehouse and goes through the normal pay page; when it is paid (`markOrderPaid`) the order completes on
the spot with no picking: the voucher is issued (three years, CPA s63) and emailed to the buyer and, if given, the
recipient, and the buyer gets an SMS with the code. Unpaid voucher orders lapse with every other unpaid order
(`unpaidHoldMinutes`), and the daily job cancels vouchers still pending after two days. Redemption online: the member
enters the code in the bag or at checkout; the balance pays what points leave, before online payment; a fully covered
order is placed as paid (`paymentRef VOUCHER:<code>`). A pay-in-store order doesn't carry a voucher at checkout; the
member pays with it at the counter instead. Cancelling an order puts the money back on the voucher (`voucher.release`
in the audit log). Balance check: `/gift?check=CODE` (public, by code) or `/club/vouchers`.

*At the till.* **Gift voucher** is a tender on the payment sheet (online only: disabled with "needs a connection"
when the till is offline). The cashier types the code or scans it (the code from the email or card, or the QR of the
balance-check link; scanning it anywhere on the till opens payment with the voucher looked up); `POST /api/pos/vouchers`
returns the balance and expiry, or the plain-English reason it can't pay (`voucherProblem`). The amount defaults to
min(balance, still due) and can be lowered with the amount field, never raised; the tender row is `{ method: "VOUCHER",
amountCents, reference: code }` and vouchers split with cash, card, PayShap and points like any other tender. Posting
(`postPosSale`) checks every voucher tender first (`checkVoucherTenders`: on record, active, unexpired, enough balance;
the error names the voucher and the shortfall) and redeems each inside the sale's transaction (`redeemVoucherTx` with
`saleId`); a balance that moved meanwhile stops the sale and nothing is posted. A pay-in-store order handed over at the
till may be paid with a voucher the same way (`advanceOrder`: the row carries both `orderId` and `saleId`). **A queued
(offline) sale never carries a VOUCHER tender**: the till refuses to queue one (the operator removes the voucher payment
and re-tenders), `SaleBody` refuses it in the request, and `postPosSale` refuses it in the sync path; a queued sale the
server refused stays in the outbox with the reason until a manager discards it (manager PIN, audited as
`pos.outbox_discard`) after ringing it up again. The receipt's tender line reads "Gift voucher HH-…" with what's left on
the voucher; the Z-report and shift summaries carry a "Gift vouchers" line; the customer display names the tender.

*Refunds go back onto the voucher.* `allocateRefund` (`src/lib/vouchers.ts`): a refund returns to the voucher first,
up to what that voucher paid on the sale less what earlier refunds already put back (a voucher is never cashed out),
and only the remainder goes to the tender the operator chooses (with several vouchers on a sale, in tender order:
`allocateRefundAcross`). `refundSale` applies it to every credit note, at the till and for online returns: the credit
note gets a negative `VOUCHER` payment row per voucher (the code in `reference`) and `restoreVoucherTx` puts the balance
back (a used-up voucher is ACTIVE again unless it has expired), writes a negative `VoucherRedemption` row against the
credit note (`saleId`, plus the order id when there is one) and audits `voucher.refund`. Online returns
(`returns.refundReturn`) split the same way first, so only the money part goes through the gateway or by hand
(`refundOrderAmount`); a return covered entirely by the voucher records `refundRef = VOUCHER`, and the member's message
says what went back onto the voucher. The refund sheet on the till shows "R… goes back onto gift voucher HH-…" and only
the remainder as cash/card.

*Ledger conventions.* A `VoucherRedemption` row is positive when money is taken (an online order: `orderId`; a till
sale: `saleId`; a counter voucher at handover: both) and negative when a refund puts it back. The order-level sums
(`voucherCentsOf`, `voucherTenderOf`, `redemptionsOf`) count only positive, unreversed rows, so what an order took from
vouchers (and so what is still due in money on it) never changes because of a return; the voucher's own rows net to
its balance movement. `voucherTenderOf` puts the voucher part of an online order on the handover sale as a `VOUCHER`
tender (it used to be `ONLINE` with provider `VOUCHER`; the migration converted those rows), so finance sees one
"Gift voucher" tender in every Payment-row view (Z-report, cash-ups, invoices, the refunds report). Cash-ups and banking
treat only CASH as cash. In the daily rollups a voucher lands in `onlineCents` with online payments (`paymentColumn`):
money collected by HQ (the voucher was paid for online and its liability is HQ's) and settled to the store on the
monthly statement ("Online sales and gift vouchers collected by HQ"); the tender reports label that column
"Online & gift vouchers". Reports: voucher liability = the sum of `balanceCents` where status is ACTIVE; VAT is
accounted for at redemption (the sale the voucher pays for), not at issue. Audit actions: `voucher.purchase`,
`voucher.issue`, `voucher.redeem`, `voucher.release`, `voucher.refund`.

**Wishlists** (`Wishlist`). The heart on cards and product pages. The **frequent job** (`wishlists`) notes when the
whole network runs out of a wished-for variant and when stock returns, which shows as "Back in stock" on
`/club/wishlist` for two weeks. It sends nothing; "Notify me" (StockAlert) does that.

**Saved addresses** (`Address`, up to five per member). Offered as chips at checkout; the address an order ships to is
saved (or updated) automatically; managed at `/club/addresses`. Personal information under POPIA: deleted when HQ
erases the member.

**Delivery estimates** (`settings.ecommerce.deliveryDays`, `src/lib/delivery.ts`): courier working days by province
(defaults GP 1–2, WC/KZN/FS/MP/NW 2–3, EC/LP 3–4, NC 3–5), counted from the next working day after the same-day
cut-off; weekends and public holidays are skipped. Shown at checkout, on product pages and on the order tracker.
Change them in the `ecommerce` setting (the HQ → Online orders form leaves the key alone; edit the JSON value or
extend the form).

## Store-opening checklist (HQ → Stores → store)

Onboarding a store seeds its opening checklist from the template in `src/lib/opening.ts`: Legal & licences (lease,
CIPC, VAT, SAHPRA/pharmacy licence where THC is licensed, POPIA register), Set-up (fit-out, internet, Yoco, tills,
printers, catalogue, Google Business Profile, photos, opening stock), People (staff, PINs, dispenser, training) and
Launch (opening date, press, site facts, soft opening). Due dates count back from the store's opening day (Status →
Opened) and move with it while the store is still opening soon; tasks are ticked off with a note by the HQ team (area
managers see them). The stores list shows each store's progress (`done/total`, overdue in red); a store that predates
the feature gets a checklist from **Start the opening checklist** on its page. Audit actions: `store.checklist_seed`,
`store.task_done`, `store.task_reopen`.

## Incidents

**Alerts.** Server errors are logged with `[error]` (method, path without its query string, route, digest and
stack): page and route errors, unexpected errors behind the till API and the back-office, books and trade actions,
and every failed step of a scheduled job. With `ALERT_EMAIL` set (and `SMTP_URL`), they're also emailed there,
without email addresses or long numbers: one email per distinct error an hour, and no more than 20 an hour in all,
so an outage can't flood the inbox (`src/server/alerts.ts`). Errors a person sees as a message (a wrong PIN, a field
to fix) aren't alerts. The app can't report its own absence: add an external uptime check on `GET /api/health`
(every minute, alert after two failures), which also catches the tunnel or the database being down, and one on
`GET /api/health/jobs` (every 15 minutes), which fails when a scheduled job hasn't succeeded in time.

**POS offline (power/network).** Tills keep selling (cash, or card on a Yoco machine or bank terminal) and queue sales
locally; tap on glass, PayShap, points and gift vouchers are disabled until connectivity returns. Do not clear browser
storage on a till with queued sales. Queued sales sync automatically (idempotent); check the queue badge before closing
the shift.

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

**Suspected data breach (POPIA s22).** Contain: sign everyone out by deleting their rows from `Session` (sessions are
random tokens stored hashed; changing `SESSION_SECRET` signs nobody out), and rotate the provider keys that may have
leaked. Rotate `SESSION_SECRET` only if the key itself leaked, and know what that breaks: every signed link already
sent stops working (tax-invoice, unsubscribe, export, share and reminder links), and the stored ID-number hashes stop
matching, so the duplicate-ID check won't recognise existing members. Then assess scope from `AuditLog`, notify the
Information Regulator and affected people as soon as reasonably possible, and document everything.

**Wrong price or promotion live.** HQ → Pricing/Promotions → end or edit; tills pick up changes on the next bootstrap
refresh; refunds via POS → Sales history.

## Backups & recovery

Postgres WAL archiving (point-in-time recovery ≥ 7 days) plus a nightly encrypted `pg_dump` copied off the server to
R2 and kept 35 days; files on disk (when `S3_BUCKET` isn't set) are copied with it. Quarterly restore drill into
staging. Target RPO 5 minutes, RTO 1 hour. On the server:

- WAL: in `postgresql.conf`, `archive_mode = on` and
  `archive_command = 'test ! -f /var/backups/pg/wal/%f && cp %p /var/backups/pg/wal/%f'`, plus a weekly base backup
  (`pg_basebackup -D /var/backups/pg/base/$(date +%F) -Ft -z -X stream`); delete base backups and WAL older than the
  oldest base backup you keep.
- Nightly dump (cron, after the 02:00 jobs): `pg_dump -Fc "$DATABASE_URL" | gpg --batch --symmetric --cipher-algo
  AES256 --passphrase-file /etc/herbal-holland/backup-passphrase -o /var/backups/pg/hh-$(date +%F).dump.gpg`, then copy it
  to a separate R2 bucket for backups (EU jurisdiction, a lifecycle rule deleting objects after 35 days) with `rclone`
  or the AWS CLI pointed at the R2 endpoint. Keep the passphrase off the server too: without it the dumps are useless.
- Files on disk: the app's `uploads` volume (`docker volume ls`), e.g. `docker run --rm -v <volume>:/data:ro -v
  /var/backups:/backup busybox tar czf /backup/uploads-$(date +%F).tgz -C /data .`, copied with the dump.
- Restore: `gpg -d hh-….dump.gpg > hh.dump && pg_restore --no-owner -d <empty database> hh.dump`, then point
  `DATABASE_URL` at it. The backups hold every member's details and patient authorisations: record the R2 copy as a
  cross-border transfer in the POPIA register, like the files. The stock ledger and loyalty ledger are append-only, so balances can be
rebuilt from movements if ever required (see the reconciliation queries in `prisma/seed.ts` comments / reports).

## Exceptions to review (HQ → Audit log)

| Action | Meaning | What to do |
|---|---|---|
| `compliance.offline_exception` | An offline till sale broke a compliance rule the till couldn't check, including a member number that didn't match a member (members only) | Review with the store manager; find the member if you can; retrain if needed |
| `sale.tender_variance` | Payments didn't match the total on a synced sale | Reconcile against the terminal report |
| `drop.limit_after_payment` | A card was charged before a drop limit tripped (race with an online order); the sale stands | Decide whether to contact the member; no refund needed unless they ask |
| `payment.review` | A Peach or Yoco payment didn't fit its order: another amount, another checkout (payment), or paid after the order was cancelled. The order was **not** marked paid | Find the payment in the Peach Dashboard (or the Yoco portal); refund it there (or sort it out with the member) and note what you did |
| `auth.lockout` | 8 wrong passwords in a row (sign-in or till pairing): password sign-in is locked for 15 minutes | If it wasn't them, reset their password (HQ → Team), which clears the lock and signs them out everywhere; otherwise it lifts by itself |
| `pos.pin_lockout` | 5 wrong PINs: that person can't use any till for 5 minutes | A manager can reset the PIN (Store → Team), which clears the lock and signs them out of every till |
| `pos.pin_disabled` | Ten wrong PINs in a day: that person's PIN is switched off on every till until a manager sets a new one | Store → Team → Reset PIN (it switches the PIN back on); if it wasn't them, find out who was trying |
| `auth.failed` | A wrong password for an existing account (sign-in, till pairing or the change-password form) | Nothing on its own; a run of them across accounts from one place is someone guessing; the connection is paused after 30 in 15 minutes |
| `member.collision` | Someone tried an ID number or email already linked to another member; after three a day the answer stops saying so | A run from one phone or member is probing who's a member: look at the member and the store |
| `otp.ceiling` | Sign-in codes by SMS paused at the network's hourly ceiling (`OTP_SMS_HOURLY_MAX`, default 500) | During normal trade (a launch, a drop): raise the ceiling. Otherwise it's SMS pumping: check the message log for the numbers |
| `promotion.after_payment` / `offer.used_after_payment` | A paid (or offline) till sale carried a promotion that had just run out, or a My Deal already used on another purchase; the sale stands | Usually nothing; repeated cases at one store are worth a look |
| `sale.offline_price` / `sale.points_overdraw` | An offline sale charged less than the server's price for its lines, or spent points the member no longer had | Feeds the `OFFLINE_VARIANCE` loss rule; review a pattern with the store manager |
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
| Suspicious refund | A card sale refunded in cash, or two of: someone else's sale, within 30 min, just before the shift closed | Check with the member and the terminal report; card sales go back to the card |
| High refund rate | A person's refund rate is 3× the norm for their role across the network (5+ in 30 days) | Review their refunds |
| Own sales refunded | 10%+ of a person's own sales refunded this month (5+) | Can inflate commission, so their commission is held until the alert is closed |
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
2. Reply from the ticket (canned replies are starting points, edit them). The member gets it by email (by SMS when
   they have no email address), and the ticket moves to *Waiting for member*; their reply brings it back to *Open*.
3. Resolve when it's sorted (a closing note goes to the member). A member can reopen a resolved ticket by replying
   within 30 days; after that they open a new one.
4. Store managers and owners see the tickets about orders their store fulfilled (Store → Support) and work them the
   same way; everything else is HQ's. Area managers see their region's stores' tickets.
5. Watch the *Overdue* chip on HQ → Support. Anything that can't be answered within the day gets a holding reply
   ("We're looking into it"). That meets the first-reply SLA and tells the member when to expect an answer.

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
| **Refund** | Store manager or owner, or HQ | The amount is worked out for you: each returned unit's share of its line (what was actually paid), plus the delivery fee when the whole order has come back for a reason that's ours (not for a change of mind); never more than was paid in money, and points come back as points. Tick *back on the shelf* only for sealed, sellable units (never faulty or damaged goods) |

The refund goes back the way the order was paid: **Peach Payments or Yoco** refund by amount against the order's
payment (Yoco with an idempotency key per return; Peach as a running total per order, so a retry never refunds twice).
The return is claimed before the gateway is called, so two people pressing Refund at once refund it once ("RT-… is
already being refunded"); a claim left by a crashed attempt can be taken over after 10 minutes;
**pay-in-store or simulated payments** are refunded by hand (EFT, or at the till) and recorded with the reference. The
credit note (`<store>-RT-000123`) posts at the fulfilling store as a refund sale (stock back on the shelf where ticked,
points reversed, rollups adjusted), and the tax credit note is emailed. A gateway refund that later fails arrives as
`payment.refund_failed` in the audit log: refund the member by hand and note it. If the money moved but the credit
note didn't post (a crash half-way), pressing Refund again posts only the credit note.

## Accounting (the books)

Every company keeps its books at `/books/<company>`: owners and their accountants for their company, HQ admins for
HQ's books (and read-only for any franchisee's), area managers read-only in their region. Store staff have no books.

**Set-up at go-live (per company).** Owners open the books from the store sidebar (Money → Books), HQ from
HQ → Money → Books, accountants land on them when they sign in.
- Settings → VAT and financial year: the VAT category SARS gave the company (A, B, C, D or F; none if it isn't a VAT vendor)
  and the month its financial year ends.
- Settings → Accountants → Add an accountant (they get a temporary password and choose their own at first sign-in).
- Settings → Opening balances: download the template, fill in the trial balance from the old system at the day before
  go-live (account code, debit, credit; on control accounts the supplier, trade account or franchisee; a store code to
  split by store) and import it with "Balances at" that day. Stock must equal the opening stock take; at HQ include the
  Rewards points and gift vouchers members held.
- Banking: add the bank account(s). The first one carries the "Bank" account that deposits and payments post to.

**Every day: nothing to do.** Store trading posts nightly (one journal per store per day). Everything else (stock
orders, supplier invoices and payments, deposits, expenses, online payments, vouchers, points, trade payments,
statement payments) posts within 15 minutes, from the queue (`/api/cron/frequent`).
- A change to a past day (a till sale that synced late, a refund) posts only the difference.
- A posting that fails stays queued with its reason and is emailed to `ALERT_EMAIL`. HQ's books → Month end →
  "Postings that failed" lists them with Retry. Fix the cause (usually the source data), then retry.

**Month end (by the 7th).**
1. Banking: import the month's bank statements. Most lines match by themselves (deposits, payouts, supplier and
   statement payments). Match or allocate the rest (bank charges, card payouts net of fees, transfers), then check
   that the reconciliation shows no difference.
2. Record statement payments as they arrive: HQ → Statements → the month and the store → Payments → Record payment
   (a payment recorded by mistake: Delete, which reverses its postings).
3. Month end → choose the month → every check agrees:
   - trial balance zero;
   - each store's Herbal Holland account vs its statement;
   - HQ vs franchisee current accounts;
   - vouchers, points and trade debtors vs their registers;
   - stock vs valuation;
   - nothing failed in the queue;
   - no unmatched bank lines.
   A red check names the store or account and the difference.
4. Approve or delete draft journals (accruals, depreciation, the payroll journal from the payroll provider).
5. Close the month ("Close anyway" if a check still disagrees; correct it in an open month). The first close posts
   what's still queued for up to a minute; if postings are still waiting it leaves the month open and says how many,
   and the 15-minute job finishes them: close it once they're through. Nothing can post into it
   any more: a late change lands in the first open month, flagged late. Reopen opens the last closed month again, one
   month at a time, for the owner (or an HQ admin for HQ's books); both are audited.

**VAT period end (category A/B: every second month; C: monthly; D: every six months; F: every four months).** The books → VAT → the period:
- check the VAT201 working against the invoices;
- "Close this VAT period" (it moves the period's output and input VAT into "VAT due to / from SARS");
- file on eFiling;
- allocate the SARS payment or refund line on the bank statement to "VAT due to / from SARS".

**Year end.** Close the last month of the financial year; retained earnings are carried forward automatically (they
are computed, not posted). Give the auditor or tax practitioner the trial balance, general ledger and journals
exports (Books → Reports, CSV) and the management pack.

**Not in the books:** payroll (post the provider's monthly journal as a manual journal), income tax and provisional
tax, eFiling, a fixed-asset register (post depreciation as a recurring manual journal).

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
