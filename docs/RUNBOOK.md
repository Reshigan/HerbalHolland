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
   to make that exact version live. Rebuild and deploy on or
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
9. Configure the scheduler with `Authorization: Bearer $CRON_SECRET`: `POST /api/cron/frequent` every 15 min and
   `POST /api/cron/daily` at 02:00 SAST. Run it on the server itself (cron or a systemd timer calling
   `http://localhost:3000`), not through Cloudflare: Cloudflare cuts requests at 100 s, and the daily job at 1,000
   stores takes about 30 s for the loss-prevention rules alone.

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
   - HQ → Audit log has `order.pay_online` by Peach Payments, and the member's "order received" SMS is in HQ → Messages.
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
     HQ → Messages. Cancel on Yoco's page → **Payment cancelled** → Try again opens the same checkout. Cancel a
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
5. Watch the till member-attach rate, sign-ups per hour and SMS spend in the first 48 hours.

## Routine operations

| When | Task | Where |
|---|---|---|
| Continuous | Health check, error rate, p95 latency, DB connections | Load balancer + APM |
| Every 15 min | Release campaigns held for a legal send window; cancel unpaid online orders (stock released after `unpaidHoldMinutes`); retry failed invoice emails; number Founding Members once the list closes; drop alerts to watchers; email paid merch orders to the print partner | `/api/cron/frequent` |
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
