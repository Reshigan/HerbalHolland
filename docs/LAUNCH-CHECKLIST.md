# Launch checklist

Tick every line before the first store trades on the platform, except the last section (after the first month).

## Launch phase (HQ → Settings → Launch phase)
A fresh database starts in step 1 (the demo seed starts at step 3); the shop, its header and checkout follow the setting at once (audited):
- [ ] **1. Brand site**: herbalholland.com, social and Rewards sign-ups live; shop.herbalholland.com shows the range (no bag, no checkout; "Online shopping opens soon") and the stores as opening soon
- [ ] **2. Online shopping**: courier delivery from the distribution centre only; click & collect and same-day stay off, whatever the stores' flags say (online payments live first, see Money)
- [ ] **3. Stores open**: everything on; each store trades once its status is ACTIVE (Stores → status), which also puts it on the store finder and in click & collect

## Legal & compliance
- [ ] Counsel sign-off: MEDICAL-mode flows, class × channel matrix, storefront visibility of licensed products, claims library
- [ ] SAHPRA licence details captured per store (`licences`, `licenceRef`); dispensers designated and trained
- [ ] Patient-authorisation intake procedure and document storage agreed
- [ ] CBD master data validated (≤ 600 mg/pack, ≤ 20 mg/day, approved claims, COAs per batch)
- [ ] Information Officer (Reshigan Govender) registered with the Information Regulator; privacy notice published (PAIA manual: done, herbalholland.com/paia; add the registration number and address to `sites/herbalholland.com/facts.ts`)
- [ ] Counsel signs off the membership terms (`/legal/terms`), privacy notice, returns and delivery policies and the trade terms (`/trade/terms`); then HQ → Compliance → "Counsel has signed off the legal texts" (the review notes disappear from the pages). Bump `TERMS_VERSION` for any change after launch
- [ ] Franchisor company record complete (HQ → Stores → the distribution centre → Owner): legal name, registration and VAT numbers, physical address, phone, email (the privacy contact) and directors: tax invoices, the legal pages and emails print them
- [ ] Mailboxes: every address the platform and the sites publish receives mail (the franchisor email, `EMAIL_FROM`, `SUPPORT_EMAIL`, `FRANCHISE_EMAIL`, `TRADE_EMAIL`); SPF, DKIM and DMARC set for the sending domain, and a test email from each kind of message lands outside spam
- [ ] Returns & refunds (`/legal/returns`) and delivery (`/legal/delivery`) policies: drafted (CPA s56, ECTA s44 cooling-off and s46, delivery only to the member named on the order, fees and cut-off from HQ → Online orders); counsel to review, above all the ECTA s42 exclusions line marked "For counsel" (made-to-order merch; opened food, drink, supplements and skin care) and the failed-delivery terms (two attempts, redelivery at the courier fee, goods refunded without the delivery fee); confirm the attempts with the courier
- [ ] HQ → Compliance: **Members only** on; tills trained on signing up walk-ins (key terms read, box ticked) and on member numbers while offline
- [ ] NCC direct-marketing registration done; first opt-out registry import loaded
- [ ] Franchise agreements reference the separate marketing fund and statement settlement

## Money
- [ ] Each store onboarded with Yoco for its card machine (honest description, written approval for the product mix); tills on `NEXT_PUBLIC_TAP_PROVIDER=YOCO`, cashiers trained to key in the machine's reference
- [ ] Online payments on Peach Payments (Vantax (Pty) Ltd): Peach's written approval for the product mix (CBD is restricted; licensed THC is always paid in store, and the app enforces it), only refundable payment methods on, live key, hash key and webhook set, a live payment and a refund tested ([RUNBOOK → Peach Payments go-live](RUNBOOK.md#peach-payments-go-live-online-payments))
- [ ] VAT numbers per franchisee captured (non-vendors marked); invoice templates checked against SARS requirements
- [ ] PayShap: each store's ShapID from its bank entered under Store → Settings (the till offers PayShap only where one is set), and one test payment received
- [ ] Royalty / levy / e-commerce commission rates confirmed per store; first statement dry-run reconciled
- [ ] Books per company (HQ and every franchisee), [RUNBOOK → Accounting](RUNBOOK.md#accounting-the-books): VAT category (A, B, C, D or F) and year end set, the accountant added, opening balances imported at the day before go-live (stock = opening stock take), bank accounts added
- [ ] Trade: the bank account EFT payments go to (printed on pro formas) set in HQ → Settings → Trade; `TRADE_EMAIL` set; the trade terms signed off (above)

## Stock
- [ ] Catalogue, variants, barcodes (GS1 600-prefix) and RRPs loaded; ranging by format. The loader is ready: HQ → Catalogue → Import (CSV template, dry-run preview, create or update by SKU, every product checked against its class's rules)
- [ ] Warehouse opening stock loaded with the import (stock, batch and expiry columns; received at HQ cost) and checked against a physical count
- [ ] Opening stock counted per store (full blind stock take) and approved
- [ ] DC replenishment cadence and lead times set; par/reorder levels reviewed

## Merch (held in stock)
- [ ] Thread approved against Sunset 500 for each stitched design; a sample of every piece approved (placements, wash test, hoodie colour, the beanie's 40 mm cuff mark)
- [ ] Every piece and size received with its SKU, barcode and cost in HQ → Catalogue (no merch partner code, so it sells from stock)
- [ ] Merch ranged to the stores for click & collect, and their opening stock counted in
- [ ] Stitch files and artwork owned by Herbal Holland, whoever embroiders and prints them

## Devices & people
- [ ] Android devices (11+, Google services, no developer options) paired per till; printers tested; barcode scanners tested
- [ ] Till hardware per counter ([RUNBOOK → Till hardware](RUNBOOK.md#till-hardware)): BLE/USB receipt printer paired and a test page printed on the right paper width, drawer pulse confirmed on a cash sale, scanner (keyboard-wedge or camera) checked on a member QR and a batch code, customer display window or separate screen paired, a manager has run training mode with each new cashier
- [ ] Staff accounts with PINs; managers with passwords; area managers assigned to regions
- [ ] Training: POS (sale, split tenders, offline, refunds), handover with ID checks, stock takes, receiving, recalls

## Customer channels
- [ ] SMS and email providers live (Microsoft 365 `MS_*`, `MESSAGING_PROVIDER`); sender footer details correct
- [ ] Storefront content (Learn articles, store pages, hours) reviewed; age gate on
- [ ] Herbal Holland Rewards rules and liability policy approved by finance
- [ ] Instagram, Facebook, Threads, Bluesky and Telegram connected (their secrets on the Worker), and TikTok, YouTube, LinkedIn, X and Pinterest signed in from HQ → Marketing → Social (docs/INTEGRATIONS.md → Connecting the networks); TikTok's audit, Google's verification and Pinterest's standard access applied for; a test post sent from the Social page and taken down
- [ ] Social profiles say "adults 18+"; the team briefed: brand, merch, stores, events and Learn only; no products for sale, prices or orders taken in DMs

## Platform
- [ ] Go-live done in the runbook's order ([RUNBOOK → First deploy](RUNBOOK.md#first-deploy), [CLOUDFLARE.md](CLOUDFLARE.md)) on a Workers Paid plan: the API token (Workers Scripts, D1, R2, Browser Rendering on the account; Workers Routes and DNS on the herbalholland.com zone, which is in the same account) and the repository secrets `CLOUDFLARE_API_TOKEN`, `SHOP_SESSION_SECRET`, `SHOP_CRON_SECRET` and `BACKUP_PASSPHRASE` set; a merge to main ran `deploy-shop.yml` green (database and buckets created, migrated, deployed, `/api/health` ok)
- [ ] `DEMO_MODE=false` and `APP_URL=https://shop.herbalholland.com` in `wrangler.jsonc` `vars` (they are); every other secret the code reads set with `wrangler secret put` or `wrangler secret bulk` from a secrets-only file (`MS_*`, `SMSPORTAL_*`, `WEB_PUSH_PRIVATE_KEY`, the payment keys when they come); `wrangler tail` after the first request shows no `[config]` warnings you didn't expect
- [ ] D1 database `herbal-holland` (primary location Western Europe, `placement: smart` on the Worker): migrations applied by the deploy; Time Travel confirmed (`npx wrangler d1 time-travel info herbal-holland` prints a bookmark); the placeholder `database_id` still in git (the deploy writes the real one in)
- [ ] R2 buckets `herbal-holland-files` and `herbal-holland-backups` (EU jurisdiction, made by the deploy, recorded in the POPIA register), `FILES` bound with `jurisdiction: eu`; a slip uploaded and served back; a lifecycle rule on the backups bucket (35 days). Scheduled report CSVs need none: the exports job deletes them
- [ ] `shop.herbalholland.com` is the Worker's custom domain (made by the deploy; `workers_dev` off, so there is no other address); herbalholland.co.za and www redirect to it (301, path and query kept); SSL Full (strict), WAF managed rules on
- [ ] Browser Rendering enabled on the account: a tax invoice PDF and a Studio card (`/hq/marketing/studio/card/<id>` returns a PNG) render on the live Worker
- [ ] Cron Triggers visible under the Worker → Settings → Triggers (all four), each run once by hand and `/api/health/jobs` answering 200
- [ ] The shop is only reached through Cloudflare (a custom domain on the Worker; no other origin): the per-IP
      limits on sign-in and SMS codes trust `cf-connecting-ip`. Per-IP limits bucket IPv6 by /64. Still on the list: a
      bot check (Cloudflare Turnstile) on the SMS code step for members and trade, so the hourly network-wide SMS
      ceiling can't be spent by a script
- [ ] Dependencies current: `npm audit --omit=dev` clean on the deployed commit (Next 16.3.8 fixed six advisories, among
      them cache poisoning and SSRF in image optimisation; keep it patched)
- [ ] Backups: the nightly `wrangler d1 export` GitHub Action (`backup-d1.yml`) run once by hand, its object in `herbal-holland-backups` decrypted with `BACKUP_PASSPHRASE` ([RUNBOOK → Backups & recovery](RUNBOOK.md#backups--recovery)), and verified with a restore into a scratch database
- [ ] Monitoring, alerting and on-call rota in place; runbook shared: `ALERT_EMAIL` set (errors and failed jobs), Workers observability on, external uptime checks on `/api/health` and `/api/health/jobs`
- [ ] First HQ admin created with `scripts/create-admin.ts` and the launch network with `scripts/launch-network.ts` against the live D1 ([RUNBOOK → First deploy](RUNBOOK.md#first-deploy), steps 4 and 5); the smoke checks of step 7 done (health, login, a till paired, the four cron routes with `CRON_SECRET`, a Studio card image)
- [ ] Load test: peak-hour POS posting, month-end reports and the books (HQ's and a franchisee's reports and month-end
      checks) against a production-sized dataset (`SEED_STORES=1000`, which posts its last week to the books;
      `scripts/bench.ts --write`). The nightly books job on the heaviest night at 1,000 stores (a trading day plus the
      month's franchise statements) took about 2.5 minutes in testing.
- [ ] End-to-end journeys green against staging (`e2e/checkout.mjs`, `pos.mjs`, `backoffice.mjs`, `hq.mjs`, `shop.mjs`,
      `trade.mjs`, `accounting.mjs`, and `crawl.mjs`), and the checkout and till journeys on the real devices (Android
      till, phone, tablet)

## After the first month
- [ ] A first month end in every company's books with every check green (Books → Month end)
- [ ] First franchise statements reconciled against the books; first VAT201 working checked by the accountant
