# Launch checklist

Tick every line before the first store trades on the platform, except the last section (after the first month).

## Legal & compliance
- [ ] Counsel sign-off: MEDICAL-mode flows, class × channel matrix, storefront visibility of licensed products, claims library
- [ ] SAHPRA licence details captured per store (`licences`, `licenceRef`); dispensers designated and trained
- [ ] Patient-authorisation intake procedure and document storage agreed
- [ ] CBD master data validated (≤ 600 mg/pack, ≤ 20 mg/day, approved claims, COAs per batch)
- [ ] Information Officer (Reshigan Govender) registered with the Information Regulator; privacy notice published (PAIA manual: done, herbalholland.com/paia; add the registration number and address to `sites/herbalholland.com/facts.ts`)
- [ ] Counsel signs off the membership terms (`/legal/terms`), privacy notice, returns and delivery policies and the trade terms (`/trade/terms`); then HQ → Compliance → "Counsel has signed off the legal texts" (the review notes disappear from the pages). Bump `TERMS_VERSION` for any change after launch
- [ ] Franchisor company record complete (HQ → Stores → the distribution centre → Owner): legal name, registration and VAT numbers, physical address, phone, email (the privacy contact) and directors — tax invoices, the legal pages and emails print them
- [ ] Mailboxes: every address the platform and the sites publish receives mail (the franchisor email, `EMAIL_FROM`, `SUPPORT_EMAIL`, `FRANCHISE_EMAIL`, `TRADE_EMAIL`); SPF, DKIM and DMARC set for the sending domain, and a test email from each kind of message lands outside spam
- [ ] Returns & refunds (`/legal/returns`) and delivery (`/legal/delivery`) policies: drafted (CPA s56, ECTA s44 cooling-off and s46, delivery only to the member named on the order, fees and cut-off from HQ → Online orders) — counsel to review, above all the ECTA s42 exclusions line marked "For counsel" (made-to-order merch; opened food, drink, supplements and skin care) and the failed-delivery terms (two attempts, redelivery at the courier fee, goods refunded without the delivery fee); confirm the attempts with the courier
- [ ] HQ → Compliance: **Members only** on; tills trained on signing up walk-ins (key terms read, box ticked) and on member numbers while offline
- [ ] NCC direct-marketing registration done; first opt-out registry import loaded
- [ ] Franchise agreements reference the separate marketing fund and statement settlement

## Money
- [ ] Each store onboarded with Yoco for its card machine (honest description, written approval for the product mix); tills on `NEXT_PUBLIC_TAP_PROVIDER=YOCO`, cashiers trained to key in the machine's reference
- [ ] Online payments on Peach Payments (Vantax (Pty) Ltd): Peach's written approval for the product mix (CBD is restricted; licensed THC is always paid in store — the app enforces it), only refundable payment methods on, live key, hash key and webhook set, a live payment and a refund tested ([RUNBOOK → Peach Payments go-live](RUNBOOK.md#peach-payments-go-live-online-payments))
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

## Merch (made to order)
- [ ] Merch partner agreed (Lucani trade account; OneOff as fallback): prices at 1/5/10 units, digitising, blanks, courier rates, white-label packing, payment terms
- [ ] Partner confirms in writing that it makes merch for a CBD/wellness brand; stitch files and any partner-made artwork owned by (or released to) Herbal Holland
- [ ] Each stitched design digitised once; thread sew-out approved against Sunset 500; sample of every piece approved (placements, wash test, hoodie blank colour)
- [ ] Lucani adds the beanie and bucket hat (Captivity blanks, no minimum); cuff sample approved (40 mm, outer layer only) — else GetCapped with blind shipping confirmed in writing
- [ ] Variant costs and merch partner codes set in HQ → Catalogue; `POD_EMAIL` and the merch courier fee set
- [ ] DC team trained on **Merch shipped** (tracking from the partner's email) and on chasing late orders

## Devices & people
- [ ] Android devices (11+, Google services, no developer options) paired per till; printers tested; barcode scanners tested
- [ ] Till hardware per counter ([RUNBOOK → Till hardware](RUNBOOK.md#till-hardware)): BLE/USB receipt printer paired and a test page printed on the right paper width, drawer pulse confirmed on a cash sale, scanner (keyboard-wedge or camera) checked on a member QR and a batch code, customer display window or separate screen paired, a manager has run training mode with each new cashier
- [ ] Staff accounts with PINs; managers with passwords; area managers assigned to regions
- [ ] Training: POS (sale, split tenders, offline, refunds), handover with ID checks, stock takes, receiving, recalls

## Customer channels
- [ ] SMS and email providers live (`SMTP_URL`, `MESSAGING_PROVIDER`); sender footer details correct
- [ ] Storefront content (Learn articles, store pages, hours) reviewed; age gate on
- [ ] Herbal Holland Rewards rules and liability policy approved by finance
- [ ] Postiz running with Instagram, Facebook, LinkedIn, X and Threads connected; `POSTIZ_URL` / `POSTIZ_API_KEY` set; a test post scheduled and deleted
- [ ] Social profiles say "adults 18+"; the team briefed: brand, merch, stores, events and Learn only — no products for sale, prices or orders taken in DMs

## Platform
- [ ] Deployed with `docker-compose.prod.yml` and `.env` from `.env.example` ([RUNBOOK → First deploy](RUNBOOK.md#first-deploy)): `DEMO_MODE=false` from the start, strong `SESSION_SECRET`, `CRON_SECRET` 32+ characters, `APP_URL` the https shop address; the start-up log has no `[config]` warnings you didn't expect; Postgres and the app listen on 127.0.0.1 only
- [ ] Migrations applied; backups (WAL + nightly encrypted dump to R2 + the uploads volume) running and verified with a restore test
- [ ] Scheduler running on the server (all four jobs, [RUNBOOK → First deploy](RUNBOOK.md#first-deploy) step 9), each run once by hand
- [ ] Monitoring, alerting and on-call rota in place; runbook shared: `ALERT_EMAIL` set (server errors and failed jobs), external uptime checks on `/api/health` and `/api/health/jobs`
- [ ] R2: a lifecycle rule on `exports/` (scheduled report CSVs, 37 days) and the backups bucket (35 days)
- [ ] First HQ admin created with `scripts/create-admin.ts` ([RUNBOOK → First deploy](RUNBOOK.md#first-deploy), step 5)
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
