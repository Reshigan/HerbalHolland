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

## Scale to 1,000 stores

| Concern | Approach |
|---|---|
| Reporting load | Daily rollups (`DailyStoreStat`, `DailyVariantStat`) are incremented inside the posting transaction with `INSERT … ON CONFLICT DO UPDATE`, so network dashboards and most reports never scan raw sales. Raw queries are always bounded by store(s) and dates. A sale rolls up under its channel — `POS`, `ONLINE`, or `WHOLESALE` for trade sales (the trade portal's orders, fulfilled by a DC or collected at a store, and trade sales rung up at a till) — with each tender in its own column: `accountCents` holds trade sales on account (invoiced on HQ's trade ledger, not money), so finance derives money taken (`moneyCents`) and what HQ collected for a store (`hqCollectedCents` = online, vouchers, trade) from the same rows (`src/server/finance.ts`). The trade reports — sales by account, product and month, and the FIFO aged balances (`src/lib/trade-ageing.ts`) — read `Sale` and `TradeLedgerEntry` directly: trade volume is a fraction of retail and the queries stay bounded by stores and dates. `DailyVariantStat` has no channel column (product figures are per store and day across channels). |
| Big tables | `Sale`, `SaleLine`, `Payment`, `StockMovement`, `LoyaltyEntry`, `MessageLog`, `AuditLog` are append-only and indexed by store/date; partition them by month (Postgres declarative partitioning) once they pass ~100M rows. `MessageLog` is the exception today — it indexes only `campaignId` and `customerId` — so the message log screen (HQ → Messages, always date-bounded) needs `@@index([createdAt])` and `@@index([channel, status, createdAt])` added in a migration before the table passes a few million rows. |
| Read traffic | Stateless app servers scale horizontally; send reports and the menu boards to a read replica. |
| Hot rows | Stock rows are per store × SKU × batch; loyalty balances per customer; rollup rows per store × day — contention stays local to one store. Counters are only used for low-volume sequences (POs, members). |
| Background work | Campaign sends, scheduled jobs (`/api/cron/frequent`, `/api/cron/daily`, `/api/cron/staff-push`, `/api/cron/operations` — `src/server/jobs.ts`), statement emails, invoice emails, staff pushes and scheduled exports run outside the request path; at scale move them to a Postgres-backed queue (e.g. pg-boss/Graphile Worker) or SQS with a worker process built from the same codebase. |
| Operations models | `StaffPushSubscription` (a staff phone's Web Push subscription) and `StaffPushEvent` (sent-event keys, so polls never notify twice); `SupplierInvoice` (a store's supplier invoice with its `Upload`, paid/queried); `StoreTask` (one line of a store's opening checklist); `ScheduledExport` (a report to email as a signed CSV link weekly or monthly). Plain id columns, no relations, so they append to the schema without touching the core models. |
| Segments over millions of members | Denormalised customer stats (visits, lifetime, first/last purchase, points, tier) are updated on every purchase, so RFM segments are indexed range queries. |
| Catalogue sync to devices | Bootstrap payload per store (a few hundred SKUs); move to delta sync (updatedAt watermark) if the range grows past a few thousand SKUs. |

## Security

- Staff: scrypt-hashed passwords; sessions are random 256-bit tokens stored as SHA-256 hashes, httpOnly/SameSite cookies.
  Wrong passwords (sign-in and till pairing) and PINs are counted on the account in the database (`src/server/lockout.ts`):
  8 wrong passwords lock password sign-in for 15 minutes, 5 wrong PINs lock every till for 5; each lock is audited
  (`auth.lockout`, `pos.pin_lockout`) and a reset by a manager or HQ clears it. An unknown email costs the same scrypt
  work as a wrong password. A temporary password is no sign-in at all until it's replaced (`getStaff`). A till's PIN
  session is never a back-office sign-in, and a PIN reset signs the person out of every till.
  POS: long-lived device pairing cookie + short staff PIN session (per device); PINs are scrypt-hashed. POS JSON
  endpoints accept `application/json` only, so no cross-site form can post to them.
- Customers and trade buyers: one-time codes (`src/server/otp.ts`, hashed, 10-minute expiry) under a Postgres advisory
  lock: 5 codes per address per 10 minutes, 5 tries per code, 10 wrong tries per hour locks the address for the hour.
- `SESSION_SECRET` signs invoice, export, opt-out and share links and keys the IP and ID-number hashes: a production
  server refuses to start without one of 32+ characters (`src/instrumentation.ts`), and warns when `DEMO_MODE` is on.
- Money and stock changes that two people (or a retry) could make at once claim the record first (compare-and-set on
  its status, or a row lock): order moves and cancellation refunds, refunds of a sale, stock orders, stock takes, trade
  credit and payments, points redemptions, campaign sends. Cron jobs run single-flight (`pg_try_advisory_xact_lock`).
- Offline till sales are accepted only from the last 7 days; their prices and any points overdraw are audited and fed
  to the `OFFLINE_VARIANCE` loss rule.
- Files: uploads are type-checked by their bytes; photos lose EXIF/GPS, XMP, IPTC and PNG text before storage; files
  are served only through the app with a scope check. Product images fetched by URL resolve to public addresses only,
  with no redirects and a 5MB cap. Scheduled export links need a signed-in recipient who can still run the report.
- Gift voucher codes are random (Web Crypto) and masked (`HH-••••-••••-1234`) in logs, audits, texts and receipts.
- Redirect targets (`next=`) are same-site paths only (`safePath`).
- Simulated payments work only with `DEMO_MODE` or outside production.
- Invoices: public links are HMAC-signed per sale and show no customer phone or email.
- Security headers (HSTS, frame, content-type, referrer, permissions policy) on every response; `poweredByHeader` off.
- Every sensitive action is written to `AuditLog` (who, what, where, data).
- POPIA: minimal personal data; SA ID numbers are stored only as an HMAC plus last 4 digits; clinical conditions are
  never stored; consent is a ledger; exports and anonymisation are available per customer (anonymising also deletes
  their review photos). Patient registers are shown only to roles with patient-data access or to dispensers.
- Dependencies: `npm audit` clean; patched transitive versions pinned in `package.json` `overrides`.

## Hosting (recommended)

South African region for latency and POPIA s72 simplicity: AWS af-south-1 (Cape Town) or Azure South Africa North.
Containers (the provided Dockerfile builds a standalone Next.js server) behind a load balancer; managed Postgres with
PITR backups and a read replica; SMTP via an SA-region email service; object storage for patient authorisation scans and
COA PDFs; a scheduler hitting the cron endpoints. See [RUNBOOK.md](RUNBOOK.md).
