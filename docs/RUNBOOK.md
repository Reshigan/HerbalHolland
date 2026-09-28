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
   `npx wrangler@4 d1 migrations apply herbalholland-com-eu --remote && npx wrangler@4 deploy`. Rebuild and deploy on or
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
7. HQ → Stores: onboard DCs and stores (ranging template, fees, licences); Catalogue: products, variants, batches with COAs.
   After any bulk import (catalogue, members, opening stock) run `ANALYZE;` — autovacuum is slow to gather statistics
   on small tables, and without them the planner scans the whole network for single-store queries.
8. Pair POS devices per store (`/pos/pair`), create staff with PINs, designate dispensers.
9. Configure the scheduler with `Authorization: Bearer $CRON_SECRET`: `POST /api/cron/frequent` every 15 min and
   `POST /api/cron/daily` at 02:00 SAST. Run it on the server itself (cron or a systemd timer calling
   `http://localhost:3000`), not through Cloudflare: Cloudflare cuts requests at 100 s, and the daily job at 1,000
   stores takes about 30 s for the loss-prevention rules alone.

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
