# Architecture

## Shape: a modular monolith

One Next.js 16 application, one PostgreSQL database, one codebase. Every surface — storefront, Herbal Holland Rewards, POS,
store back office, HQ console, reports, menu boards — shares the same domain layer, so a sale, a stock movement or a
loyalty point means exactly the same thing everywhere.

```
src/
  lib/          Pure, isomorphic rules (unit-tested): money/VAT, SA rules (ID, phones, holidays, CPA windows),
                compliance, FEFO, promotions, price rules, loyalty, routing, replenishment, RFM, franchise statement,
                today (the manager's list), opening (store-opening checklist), cohorts, forecast (14-day velocity)
  server/       Domain services (server-only): db, auth, scope, settings, audit, inventory, pricing, sales,
                orders, stock-orders, replenishment, finance, loyalty, customers, compliance, marketing,
                messaging, email, invoices, payments, dashboard, support, returns, reviews, uploads, reports/*, today, staff-push, supplier-invoices,
                store-tasks, exports (scheduled CSV exports)
  components/   Design system: ui/*, charts/*, brand/*, product/*, admin/* (+ per-surface folders)
  app/          Routes: (shop), club, pos, store/[code], hq, menu, invoice, batch, api/*
prisma/         schema.prisma, seed.ts (+ seed-data.ts)
```

Why a monolith: one team, strong consistency requirements (money and stock), and a data volume a well-indexed
Postgres handles comfortably. Services are separated by module, not by network hop; a module can be extracted later
(the POS sync API and the campaign worker are the natural first candidates) without changing its interface.

## Tenancy & access

| Role | Scope | Sees |
|---|---|---|
| HQ_ADMIN / HQ_STAFF | Network | Everything; HQ_ADMIN changes network settings |
| AREA_MANAGER | Region | Their region's stores, customers, orders |
| OWNER | Company | Every store their franchise company owns |
| MANAGER / BUDTENDER | Store | Their store (budtenders read-only in the back office; sell at the POS) |
| ACCOUNTANT | Company | Their company's books (`/books`) only — no store, POS or HQ pages (scope `NONE`) |

`src/server/scope.ts` turns a user into a scope and every query into a scoped `where`. Pages *and* server actions re-check
access (`storeForUser`), so a crafted request can't reach another franchisee's data. Other franchisees' retail prices
are never exposed (competition-law hygiene). For defence in depth at 1,000 owners, Postgres row-level security keyed on a
per-request `app.store_ids` setting can be layered under the same scopes.

Analytics follow the same scopes (`tests/integration/scope.test.ts` pins them down):

- **Store** — a manager's dashboard, reports and CSVs cover their store only; `?stores=company` is ignored for them.
- **Owner** — lands on *All my stores* (`/store/{code}?stores=company`) when they own more than one: consolidated KPIs, a
  store comparison with drill-down into each store and CSV export. Every report takes the same toggle.
- **HQ** — the network overview drills region → stores (`/hq/reports/sales-by-store?stores=region:XX`) → store
  (`/store/{code}`, the store's own dashboard) → day → hour; categories drill to their products. Area managers get the
  same console limited to their region, whatever the URL asks for. Every CSV export is audited (`report.export`).
- **Trade** — the trade sales report (HQ and area managers) covers WHOLESALE sales at the stores in scope; a store's own
  "Trade sales at this store" covers trade orders collected there and trade sales rung up at its tills. Trade aged
  balances read HQ's trade ledger: the whole network for HQ, and for a region the accounts that buy there or are served
  by a DC there.

## Core flows

**POS sale** (`postPosSale` → `postSaleTx`): re-price server-side (store shelf price → price lists → markdowns →
promotions; offline sales keep the price the customer paid), evaluate compliance (licences, age, patient authorisation,
dispenser, limits), then in one transaction: create the sale, take stock FEFO per line (row-locked `SELECT … FOR UPDATE`,
FIFO cost from the lots), record tenders, redeem/earn points, update customer stats and tier, and increment the daily
rollups. The tax invoice is emailed after commit. Refunds are negative sales that return units to the same batches.

**Offline POS:** the client caches a bootstrap (catalogue, prices, promotions, settings, staff) and prices with the same
pure libraries. Offline sales (cash only) get device-local receipt numbers (`STORE-<device prefix><seq>`) and a client
UUID, queue in an outbox, and sync to an idempotent endpoint (the UUID is the sale id). Compliance exceptions found on
sync are written to the audit log rather than rejecting a sale that already happened.

**Online order:** checkout prices with the national online price, checks compliance for the fulfilment channel, and
routes (`src/lib/routing.ts`): click & collect → the chosen store if it has everything; same-day → nearest capable store
within 30 km; courier → a DC, else ship-from-store. Open orders reserve stock (available = on hand − open orders).
Handover (collect) or dispatch (delivery) posts the order as an ONLINE sale **at the fulfilling store**, which is the
merchant of record; HQ's commission and the online takings it collected are settled on the franchise statement.

**Purchasing:** stores order from their DC (wholesale) or from another store (network). Shipping moves batches out FEFO;
receiving books the same batches in at the agreed cost; discrepancies are kept; the tax invoice is emailed.

**Stock control:** every change is an immutable `StockMovement` (receive, sale, refund, online, adjust with reason code,
count, transfer in/out). `StockLevel` per store × variant × batch is the running balance, reconcilable to the ledger at
any time. Stock takes snapshot lots, collect (blind) counts and post COUNT variances on approval.

**Member support, returns, reviews and search** (`src/lib/support.ts`, `src/lib/returns.ts`, `src/lib/search.ts`;
`src/server/support.ts`, `src/server/returns.ts`, `src/server/reviews.ts`, `src/server/shop/search.ts`, `src/server/uploads.ts`):

- `SupportTicket` (number `ST-…`, who's asking — a member id or a guest's name/email/phone — subject, category, the order
  code and its store, status OPEN → WAITING_MEMBER ⇄ OPEN → RESOLVED, priority, assignee, the SLA deadlines
  `firstResponseDueAt`/`resolveDueAt` set in SAST business days) and `SupportMessage` (MEMBER / STAFF / SYSTEM, an
  optional photo `Upload`). HQ sees the network, area managers their region's stores' tickets, store managers the
  tickets about orders their store fulfilled. Tickets have no relation to `Customer`: they outlive an anonymised member
  and are purged a year after they close.
- `ReturnRequest` (number `RT-…`, order, member, the fulfilling store, reason, `items` [{ variantId, qty }], note,
  photos, status REQUESTED → APPROVED → COLLECTION_BOOKED → RECEIVED → REFUNDED, or DECLINED, courier/waybill, the refund
  amount and reference). The refund runs `refundOrderAmount()` (`src/server/orders.ts`: Yoco/Peach refund by amount,
  idempotent per return; manual for in-store or simulated payments) and then `refundSale()` for the credit note at the
  store — units back into the same lots where staff tick it, points reversed, rollups adjusted.
- `Review` gains `photoUploadIds`, `hidden` (+ reason, moderator, time): hidden reviews never show or count.
- `Upload` rows hold members' photos (JPEG/PNG by their bytes, ≤ 5 MB), stored through `src/server/storage.ts` and
  served by `/media/[id]` after an access check (public for a live review's photo; the member and the staff in scope
  for a return's or a ticket's).
- Search: `pg_trgm` with GIN trigram indexes on `Product.name`, `Product.tagline` and `Variant.name`; the database
  returns similarity for typos (`similarProducts`), the pure parser and ranking (`src/lib/search.ts`) understand
  measures ("600mg", "30ml", "3.5g") and class words (oil, cream, coffee…), rank exact > prefix > words > similar >
  text, and offer "Did you mean…" when the best hit was found by similarity alone. Always bounded to the classes the
  shopper may see.

**Trade (wholesale) channel** (`src/lib/trade.ts`, `src/server/trade/*`, `src/server/pricing.ts` `tradeQuote`/`tradeRange`,
`src/server/sales.ts` `postTradeSale`): businesses — pharmacies, independent retailers, cafés, practices — buy at ex-VAT
trade prices, never the franchise stores and never THC.

- Models: `TradeAccount` (number `TA-…`, legal and trading name, VAT/registration numbers, billing and delivery
  addresses, status PENDING → APPROVED ⇄ ON_HOLD → CLOSED, terms PREPAID or ACCOUNT with `creditLimitCents` and
  `paymentDays`, the `classes` it may buy, an optional TRADE `priceListId` and `dcId`), `TradeBuyer` (the people who
  order: OWNER or BUYER, sign in with a code emailed to them — `Otp.email`, `Session.tradeBuyerId`, cookie `hh_trade`),
  `TradeOrder` (number `TO-…`, the fulfilling `storeId`, `fulfilment` COURIER from the DC or COLLECT at a retail store,
  status PENDING_PAYMENT → PLACED → PICKING → SHIPPED | READY → COLLECTED, or CANCELLED; `payMethod` EFT or ACCOUNT;
  ex-VAT `subtotalCents`, `deliveryCents`, `handlingCents`, `vatCents`, inclusive `totalCents`; `collectionCode`;
  `invoiceNumber` `TI-…` and `saleId` once posted; `events`), `TradeOrderLine` (qty in case multiples, net `unitCents`
  ex VAT, `vatCents`, `shippedQty` and the batches that went), `TradeLedgerEntry` (INVOICE +, PAYMENT −, CREDIT_NOTE −,
  ADJUSTMENT ±; `dueAt` on invoices; `tradeOrderId`/`saleId` say what an entry is for). `Sale.tradeAccountId` and
  `channel: WHOLESALE` mark every trade sale; `PriceList.kind = TRADE` holds ex-VAT prices with quantity breaks;
  `Variant.caseQty` is the case pack; `DailyStoreStat.accountCents` rolls up on-account tenders.
- Pricing: `quote({ channel: "WHOLESALE", tradeAccountId })` prices from the account's TRADE list, else the live TRADE
  lists by priority, else `Variant.wholesaleCents` — ex VAT, VAT 15% per line rounded half up to the cent, totals = ex +
  VAT. Tiers, member and zone/channel lists, markdowns, My Deals and shelf prices never apply; promotions only when
  their channels include WHOLESALE (rounded to the cent per unit so an order line carries the net unit price).
  `tradeRange(storeId, account, { q, category, page })` is the paginated catalogue the portal shows.
- Orders (`placeTradeOrder`): approved account, classes allowed (∩ the store's licences), whole cases, the minimum
  order, courier from the account's DC (or the default warehouse) or click & collect at an ACTIVE retail store with
  `clickCollect` (`collectStoresFor` lists them, the account's province first, with the basket's availability per
  store). EFT → PENDING_PAYMENT with a pro forma (reference `HH-TO-…`, bank details, `trade.eftHoldDays`), nothing
  reserved until HQ confirms the payment (`confirmTradePayment`: a PAYMENT on the ledger). ACCOUNT → PLACED at once
  within the credit limit (balance + open on-account orders + this order ≤ limit) with the stock reserved at the store
  (`inventory.availability` subtracts PLACED/PICKING/READY trade lines like open online orders). `advanceTradeOrder`
  picks, makes ready (collection code by email and text), ships or hands over (ID checked): the WHOLESALE `Sale` posts
  at the fulfilling store through `postSaleTx` — FEFO lots for what shipped (short lines keep `shippedQty`), one ACCOUNT
  or EFT tender, the account's buyer block for the full tax invoice, the `TI-…` number as the sale number, courier or
  handling as the sale's extra, and the ledger INVOICE (due after `paymentDays` on account; due on the day for EFT so it
  nets against the payment). HQ collected the money for online trade orders, so their EFT/ACCOUNT tenders roll up in
  `DailyStoreStat.onlineCents` (settled to the store on its statement, like gift vouchers); till trade sales keep
  their real columns. A new collect order pushes to the store's phones like a consumer online order.
- Till (`postPosSale` with `trade: { tradeAccountId }`): the same WHOLESALE quote at the till's store, the trade basket
  rule, money tenders as usual plus ACCOUNT within the credit decision (ledger INVOICE at posting); no member, points,
  My Deals or gift vouchers, never offline. `refundSale` on a trade sale puts the on-account part back as a CREDIT_NOTE
  (numbered as the refund) before any money moves.
- Ledger (`src/server/trade/ledger.ts`): balance = Σ cents; ageing settles credits that name an order or sale against
  that item first, then FIFO by due date; `recordTradePayment`, `issueCreditNote`, `adjustTradeLedger`, monthly
  statements (`tradeStatementFor`, `emailTradeStatement`, once per account and month). Jobs (`daily`): lapsed EFT
  orders, overdue holds (`ON_HOLD` with reason "overdue", lifted by itself when settled), statements on the statement day.

## Accounting (the general ledger)

Every company keeps its own books in the platform: HQ (the franchisor, with the DCs as its stores) and each franchisee
company (its stores as a dimension). Code: `src/lib/ledger.ts` (chart template, line arithmetic, months, financial
years, SARS VAT periods), `src/server/ledger/core.ts` (posting), `sources/` (the rules per source), `access.ts`,
`reports.ts`, `checks.ts`, `bank.ts`, `admin.ts`; screens under `/books/[companyId]`.

- **Model.**
  - `LedgerAccount`: a company's chart, created from the template on first use. System accounts carry a `key` the
    rules post to, so renaming them is safe.
  - `Journal` + `JournalLine`: amounts are signed (debit +, credit −) and balance to the cent. A line carries
    `storeId` and, on control accounts, `partyId` (supplier, trade account or franchisee company). A line holds at
    most R20m (a 32-bit column): `writeJournal` stores a bigger amount as several lines on the same account.
  - `LedgerBalance`: running totals per company × account × store × month, kept in the posting transaction. Reports
    at 1,000 stores read these, not millions of lines.
- **Posting is a sync, never an edit.**
  - Each automatic source ("store-day" for a store's trading day, "stock-receive", "supplier-invoice", "deposit",
    "statement", …) has a handler that says what the source should show now, in every company it touches.
  - `syncPosting` posts only the difference from what's already posted: the first posting, a correction after a
    late till sale, or the reversal of a deleted deposit.
  - Posting into a closed month lands in the first open month, flagged late.
  - Business code only calls `queuePosting(t, source, id)` (or `queueStoreDay`) inside its own transaction. The
    queue (`LedgerQueue`) is drained every 15 minutes and nightly, and a failure stays queued with its reason.
  - `ledgerBackfill(from, to)` queues and posts every source with activity in a range (each rule set's `BACKFILL`
    lister): the demo seed posts its history this way; idempotent, so re-posting a period posts nothing new.
  - Measured on 1,000 stores: the heaviest night (a trading day, its online orders and the month's 1,000 franchise
    statements; 5,231 postings) takes about 2.5 minutes.
- **Store trading posts per day, not per sale.** The day's sales, VAT and tenders come from `DailyStoreStat`, the same
  rollup the franchise statement reads, so the two agree to the cent. Stock comes from that day's `StockMovement`
  costs, plus `revalueCents` — what a lot's value moved by beyond qty × cost when receiving re-averaged its cost — so
  the stock account equals the stock valuation to the cent.
- **Between HQ and franchisees.**
  - Everything HQ collects or funds for a store moves a franchisee's "Herbal Holland current account" (`hq`) and
    HQ's mirror "Franchisee current accounts" (`franchisees`, per company and store): online payments, gift
    vouchers, trade on account, points, wholesale stock, network trades, fees, and statement payments.
  - For each store and month the movement equals the franchise statement's net.
- **Never posted.**
  - Retained earnings are computed per financial year (`Company.yearEndMonth`).
  - Manual journals are drafts until approved (an accountant drafts, the owner approves).
  - A posted manual journal is corrected by its reversal; an automatic one by correcting its source.
- **Controls.**
  - Month close (`Company.booksLockedThrough`).
  - VAT periods closed into "VAT due to / from SARS".
  - Reconciliation checks per company and month, shown at month end: trial balance zero, statements vs current
    accounts, HQ vs franchisee mirrors, gift vouchers and points vs their registers, trade debtors vs the trade
    ledger, stock vs valuation, the posting queue, unmatched bank lines.
  - Bank statements (FNB, Absa, Standard Bank, Nedbank, Capitec, OFX or a mapped CSV) are imported, matched to
    postings, and the rest allocated.
- **Not in the platform:** payroll (import the provider's monthly journal), income tax, eFiling, a fixed-asset
  register (depreciation by recurring journal).

## Scale to 1,000 stores

| Concern | Approach |
|---|---|
| Reporting load | Daily rollups (`DailyStoreStat`, `DailyVariantStat`) are incremented inside the posting transaction with `INSERT … ON CONFLICT DO UPDATE`, so network dashboards and most reports never scan raw sales. Raw queries are always bounded by store(s) and dates. A sale rolls up under its channel — `POS`, `ONLINE`, or `WHOLESALE` for trade sales (the trade portal's orders, fulfilled by a DC or collected at a store, and trade sales rung up at a till) — with each tender in its own column: `accountCents` holds trade sales on account (invoiced on HQ's trade ledger, not money), so finance derives money taken (`moneyCents`) and what HQ collected for a store (`hqCollectedCents` = online, vouchers, trade) from the same rows (`src/server/finance.ts`). The trade reports — sales by account, product and month, and the FIFO aged balances (`src/lib/trade-ageing.ts`) — read `Sale` and `TradeLedgerEntry` directly: trade volume is a fraction of retail and the queries stay bounded by stores and dates. `DailyVariantStat` has no channel column (product figures are per store and day across channels). |
| Big tables | `Sale`, `SaleLine`, `Payment`, `StockMovement`, `LoyaltyEntry`, `MessageLog`, `AuditLog` are append-only and indexed by store/date; partition them by month (Postgres declarative partitioning) once they pass ~100M rows. `MessageLog` is the exception today — it indexes only `campaignId` and `customerId` — so the message log screen (HQ → Messages, always date-bounded) needs `@@index([createdAt])` and `@@index([channel, status, createdAt])` added in a migration before the table passes a few million rows. |
| Read traffic | Stateless app servers scale horizontally; send reports and the menu boards to a read replica. |
| Hot rows | Stock rows are per store × SKU × batch; loyalty balances per customer; rollup rows per store × day — contention stays local to one store. Counters are only used for low-volume sequences (POs, members). |
| Background work | Campaign sends, scheduled jobs (`/api/cron/frequent`, `/api/cron/daily`, `/api/cron/staff-push`, `/api/cron/operations` — `src/server/jobs.ts`), statement emails, invoice emails, staff pushes and scheduled exports run outside the request path; at scale move them to a Postgres-backed queue (e.g. pg-boss/Graphile Worker) or SQS with a worker process built from the same codebase. |
| Operations models | `StaffPushSubscription` (a staff phone's Web Push subscription) and `StaffPushEvent` (sent-event keys, so polls never notify twice); `SupplierInvoice` (a store's supplier invoice with its `Upload`, paid/queried; a stock order's — from a DC or another store — is put on when it's received, with no upload and `onStatement`, and settled by the daily job once its month's statement is drawn up); `StoreTask` (one line of a store's opening checklist); `ScheduledExport` (a report to email as a signed CSV link weekly or monthly). Plain id columns, no relations, so they append to the schema without touching the core models. |
| Segments over millions of members | Denormalised customer stats (visits, lifetime, first/last purchase, points, tier) are updated on every purchase, so RFM segments are indexed range queries. |
| Catalogue sync to devices | Bootstrap payload per store (a few hundred SKUs); move to delta sync (updatedAt watermark) if the range grows past a few thousand SKUs. |

## Security

- Staff passwords and PINs: scrypt with its parameters stored beside the hash (`scrypt$N$r$p$salt$hash`, N=2^14, r=8,
  p=5, async), upgraded on the next sign-in when the cost rises; an unknown email costs the same work as a wrong
  password. Sessions are random 256-bit tokens stored as SHA-256 hashes in httpOnly/SameSite cookies; staff and trade
  sessions also end after 12 hours unused. One password policy (`src/lib/password.ts`: 10+ characters, not a common
  password, not the person's name or email). A password someone else sets is temporary: random (`temporaryPassword`),
  it must be replaced at first sign-in and stops working after 72 hours; until it's replaced it is no sign-in at all.
- Lockouts and rate limits live in the database, so they hold across servers (`src/server/lockout.ts`,
  `src/server/throttle.ts` — the `Throttle` table, counted under an advisory lock): 8 wrong passwords lock the account's
  password sign-in for 15 minutes (sign-in, till pairing and the change-password form); 30 failures from one connection
  in 15 minutes pause sign-in from it; 5 wrong PINs lock every till for 5 minutes, and 10 in a day switch the PIN off
  until a manager sets a new one (`User.pinDisabledAt`). Each is audited (`auth.failed`, `auth.lockout`,
  `pos.pin_lockout`, `pos.pin_disabled`). Demo sign-in (DEMO_MODE) works only for accounts that still have the demo
  password, so a real account can't be impersonated even if the flag is left on.
- Customers and trade buyers: one-time codes (`src/server/otp.ts`, hashed, 10-minute expiry) under an advisory lock:
  5 codes per address per 10 minutes, 5 tries per code, 10 wrong tries an hour lock the address for the hour; 30 codes
  per connection an hour; a network-wide SMS ceiling (`OTP_SMS_HOURLY_MAX`, audited `otp.ceiling`). The reply is the
  same whether or not an email belongs to a trade buyer, and an "already linked to another member" answer (ID number
  or email) is limited to three a day per person (`member.collision`), so membership can't be probed.
- Client IPs come from Cloudflare (`cf-connecting-ip`; the origin is reachable only through the Cloudflare Tunnel), else
  the hop our own proxy appended (`src/lib/client-ip.ts`), and are stored only as keyed hashes.
- Content-Security-Policy with a per-request nonce (`src/proxy.ts`, `src/lib/csp.ts`): a script runs only when it
  carries the nonce Next stamps on its own scripts, or is the one hashed inline snippet; 'strict-dynamic' trusts what
  those load. An injected `<script>` never runs. `Cross-Origin-Opener-Policy: same-origin`, HSTS, frame, content-type,
  referrer and permissions headers on every response; `poweredByHeader` off.
- Cookie-authenticated route handlers (the till API, push renewals, sign-out) refuse cross-site requests
  (`src/lib/same-origin.ts`: Sec-Fetch-Site, else Origin vs Host) and take JSON only.
- `SESSION_SECRET` signs invoice, export, opt-out and share links and keys the IP and ID-number hashes: a production
  server refuses to start without one of 32+ characters (`src/instrumentation.ts`), and warns when `DEMO_MODE` is on.
  Tokens are compared in constant time with a length check first (`safeEqual`).
- Decisions two people (or a retry) could make at once are taken once: the record is claimed first (compare-and-set on
  its status) or row-locked — order moves and cancellation refunds, sale refunds, return refunds through a gateway
  (claimed before the gateway is called), stock orders and takes, trade orders, credit and payments, deposits, points,
  My Deals, merch production orders, campaign sends. Checkout and till sales lock the member, then the promotion,
  then the stock (`src/server/locks.ts`, always that order) and re-check patient grams, drop limits, welcome gifts and
  promotion caps, and the last unit, under those locks. Gateway webhooks are de-duplicated by event id
  (`PaymentEvent`); a payment that arrives for a cancelled order goes to `payment.review`. Cron jobs run single-flight.
- Offline till sales are accepted only from the last 7 days; their prices, points overdraws and anything they couldn't
  check are audited and fed to the `OFFLINE_VARIANCE` loss rule. A sale already paid when a limit trips posts and is
  flagged (`drop.limit_after_payment`, `promotion.after_payment`, `offer.used_after_payment`) rather than leaving the
  customer charged without a sale.
- Scope: back-office pages outside the person's stores (or region) show a not-found inside their own shell; network
  exports go only to the HQ team, region exports only to people who see the whole region; tickets are assigned only
  within the team; area managers link only their region's promotions and see only their region's trade licence files;
  shelf prices are the franchisee's to set (HQ can't change them).
- Files: uploads are type-checked by their bytes; photos lose EXIF/GPS, XMP, IPTC and PNG text before storage; files
  are served only through the app with a scope check. Product images fetched by URL resolve to public addresses only,
  with no redirects and a 5MB cap. Scheduled export links need a signed-in recipient who can still run the report.
- Gift voucher codes are random (Web Crypto) and masked (`HH-••••-••••-1234`) in logs, audits, texts and receipts.
- Redirect targets (`next=`) are same-site paths only (`safePath`). Simulated payments work only with `DEMO_MODE` or
  outside production. Invoices: public links are HMAC-signed per sale and show no customer phone or email.
- Every sensitive action is written to `AuditLog` (who, what, where, data); HQ → Audit log reads it in plain English.
- POPIA: minimal personal data; SA ID numbers are stored only as an HMAC plus last 4 digits; clinical conditions are
  never stored; consent is a ledger; exports and anonymisation are available per customer (anonymising also deletes
  their review photos). Patient registers are shown only to roles with patient-data access or to dispensers. The daily
  job deletes expired sessions, sign-in codes after a day (they hold phone numbers and emails), rate-limit rows after two
  days and webhook receipts after 90.
- Dependencies: `npm audit` clean; patched transitive versions pinned in `package.json` `overrides`.

## Hosting (recommended)

South African region for latency and POPIA s72 simplicity: AWS af-south-1 (Cape Town) or Azure South Africa North.
Containers (the provided Dockerfile builds a standalone Next.js server) behind a load balancer; managed Postgres with
PITR backups and a read replica; SMTP via an SA-region email service; object storage for patient authorisation scans and
COA PDFs; a scheduler hitting the cron endpoints. See [RUNBOOK.md](RUNBOOK.md).
