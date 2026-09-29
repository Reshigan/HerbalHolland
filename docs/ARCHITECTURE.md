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

## Scale to 1,000 stores

| Concern | Approach |
|---|---|
| Reporting load | Daily rollups (`DailyStoreStat`, `DailyVariantStat`) are incremented inside the posting transaction with `INSERT … ON CONFLICT DO UPDATE`, so network dashboards and most reports never scan raw sales. Raw queries are always bounded by store(s) and dates. |
| Big tables | `Sale`, `SaleLine`, `Payment`, `StockMovement`, `LoyaltyEntry`, `MessageLog`, `AuditLog` are append-only and indexed by store/date; partition them by month (Postgres declarative partitioning) once they pass ~100M rows. `MessageLog` is the exception today — it indexes only `campaignId` and `customerId` — so the message log screen (HQ → Messages, always date-bounded) needs `@@index([createdAt])` and `@@index([channel, status, createdAt])` added in a migration before the table passes a few million rows. |
| Read traffic | Stateless app servers scale horizontally; send reports and the menu boards to a read replica. |
| Hot rows | Stock rows are per store × SKU × batch; loyalty balances per customer; rollup rows per store × day — contention stays local to one store. Counters are only used for low-volume sequences (POs, members). |
| Background work | Campaign sends, scheduled jobs (`/api/cron/frequent`, `/api/cron/daily`, `/api/cron/staff-push`, `/api/cron/operations` — `src/server/jobs.ts`), statement emails, invoice emails, staff pushes and scheduled exports run outside the request path; at scale move them to a Postgres-backed queue (e.g. pg-boss/Graphile Worker) or SQS with a worker process built from the same codebase. |
| Operations models | `StaffPushSubscription` (a staff phone's Web Push subscription) and `StaffPushEvent` (sent-event keys, so polls never notify twice); `SupplierInvoice` (a store's supplier invoice with its `Upload`, paid/queried); `StoreTask` (one line of a store's opening checklist); `ScheduledExport` (a report to email as a signed CSV link weekly or monthly). Plain id columns, no relations, so they append to the schema without touching the core models. |
| Segments over millions of members | Denormalised customer stats (visits, lifetime, first/last purchase, points, tier) are updated on every purchase, so RFM segments are indexed range queries. |
| Catalogue sync to devices | Bootstrap payload per store (a few hundred SKUs); move to delta sync (updatedAt watermark) if the range grows past a few thousand SKUs. |

## Security

- Staff: scrypt-hashed passwords; sessions are random 256-bit tokens stored as SHA-256 hashes, httpOnly/SameSite cookies;
  login throttling. POS: long-lived device pairing cookie + short staff PIN session (per device); PINs are scrypt-hashed.
- Customers: phone OTP (hashed, 10-minute expiry, attempt-limited, rate-limited), 30-day sessions.
- Invoices: public links are HMAC-signed per sale.
- Security headers (HSTS, frame, content-type, referrer, permissions policy) on every response; `poweredByHeader` off.
- Every sensitive action is written to `AuditLog` (who, what, where, data).
- POPIA: minimal personal data; SA ID numbers are stored only as an HMAC plus last 4 digits; clinical conditions are
  never stored; consent is a ledger; exports and anonymisation are available per customer.

## Hosting (recommended)

South African region for latency and POPIA s72 simplicity: AWS af-south-1 (Cape Town) or Azure South Africa North.
Containers (the provided Dockerfile builds a standalone Next.js server) behind a load balancer; managed Postgres with
PITR backups and a read replica; SMTP via an SA-region email service; object storage for patient authorisation scans and
COA PDFs; a scheduler hitting the cron endpoints. See [RUNBOOK.md](RUNBOOK.md).
