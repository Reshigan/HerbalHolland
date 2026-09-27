# Runbook

## Environments

| | Local | Staging | Production |
|---|---|---|---|
| Database | Postgres 16 (`docker compose up db` or local cluster) | Managed Postgres (SA region) | Managed Postgres, PITR, read replica |
| Data | `npm run db:seed` demo network | Anonymised copy or seed | Real — never seed (the seed truncates every table and refuses to run with `NODE_ENV=production` unless `--force`) |
| `DEMO_MODE` | true | true (clearly labelled) | **false** |

## First deploy

1. Provision Postgres (AWS af-south-1 / Azure South Africa North) and set the environment variables in
   [INTEGRATIONS.md](INTEGRATIONS.md#environment-variables).
2. Build the image: `docker build -t herbal-holland .`
3. Run migrations with the build stage: `docker compose run --rm migrate` (or `npx prisma migrate deploy` in CI/CD).
4. Start app containers (`node server.js`, port 3000) behind a TLS load balancer; health check `GET /api/health`.
5. Create the first HQ admin (SQL or a one-off script) and set `DEMO_MODE=false`.
6. HQ → Compliance: confirm `thcMode`, channel matrix and store licences with counsel.
7. HQ → Stores: onboard DCs and stores (ranging template, fees, licences); Catalogue: products, variants, batches with COAs.
8. Pair POS devices per store (`/pos/pair`), create staff with PINs, designate dispensers.
9. Configure the scheduler: `POST /api/cron/campaigns` every 15 min with `Authorization: Bearer $CRON_SECRET`.

## Routine operations

| When | Task | Where |
|---|---|---|
| Continuous | Health check, error rate, p95 latency, DB connections | Load balancer + APM |
| Every 15 min | Release scheduled campaigns | `/api/cron/campaigns` |
| Daily | Cash-ups closed at every store; negative-stock and compliance-event reports reviewed | Reports |
| Weekly | Replenishment orders submitted/approved/shipped; expiry report actioned | Purchasing / Distribution |
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

Managed Postgres point-in-time recovery (≥ 7 days) plus daily snapshots retained 35 days; quarterly restore drill into
staging. Target RPO 5 minutes, RTO 1 hour. The stock ledger and loyalty ledger are append-only, so balances can be
rebuilt from movements if ever required (see the reconciliation queries in `prisma/seed.ts` comments / reports).

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
```
All three should return 0 / true.
