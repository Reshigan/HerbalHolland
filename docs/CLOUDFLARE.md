# The platform on Cloudflare

shop.herbalholland.com runs entirely on Cloudflare: the Next.js app on **Workers** (through OpenNext), the database on
**D1** (SQLite), files on **R2**, PDFs and Studio cards through **Browser Rendering**, the scheduled jobs on **Cron
Triggers**, email through Microsoft Graph (HTTPS). Nothing runs on a server of ours. `wrangler.jsonc` declares it all.

## Bindings

| Binding | What | Code |
|---|---|---|
| `DB` | D1 database `herbal-holland` | `db` from `@/server/db` (Prisma, `@prisma/adapter-d1`) |
| `FILES` | R2 bucket `herbal-holland-files` | `putObject` / `getObject` in `@/server/storage` |
| `BROWSER` | Browser Rendering | `@/server/pdf` (`@cloudflare/puppeteer`) and the Studio cards |
| `ASSETS` | the static files OpenNext emits | handled by OpenNext |

Inside a request, `getCloudflareContext().env` (from `@opennextjs/cloudflare`) gives the bindings; `next dev` gets local
ones through wrangler's platform proxy (`initOpenNextCloudflareForDev()` in `next.config.ts`), so local development uses a
local D1 under `.wrangler/state`, a local R2 and a local browser. Secrets (`SESSION_SECRET`, `CRON_SECRET`, `MS_*`,
payment keys…) are Worker secrets (`wrangler secret put`), read as `process.env.*` as before (nodejs_compat).

## The database: D1

- The Prisma schema is SQLite. D1 limits that shape the code: **no transactions** (Prisma runs the statements of
  `tx()` one by one, so every multi-row write must be safe to repeat and to stop halfway: insert the parent first,
  key children by ids chosen up front, never rely on rollback), **100 bound parameters per statement** (Prisma chunks its
  own `in:` lists at 98; raw SQL with a list of ids must chunk by hand: `chunk(ids, 90)` from `@/lib/chunk`),
  **100 columns per table**, **2 MB per row**, **30 s per query**, 10 GB per database.
- **One client per request**: `db` builds its Prisma client per request context (workerd gives every request its own I/O
  context; a client shared across requests makes one request await another's promises, which the runtime cancels as
  hung). Never cache a client, a query promise or a Prisma result across requests at module scope.
- **Id lists in Prisma queries** that can exceed 90 ids (`in: [...]` on variants, customers, orders, batches) go through
  `inBatches` from `@/lib/json-list` (findMany) or raw SQL with `json_each` (counts, sums, groupBy): Prisma does not
  split them and D1 refuses the statement.
- **List columns are JSON**: what was `String[]` / `RegClass[]` is now `Json` holding a JSON array (`@default("[]")`).
  Read with `asList(row.field)` (`@/lib/json-list`), write plain arrays. Filters `has`, `hasSome`, `hasEvery`, `isEmpty`
  no longer exist: filter in code after a bounded query, or in raw SQL with `EXISTS (SELECT 1 FROM json_each(col) WHERE
  value = ?)`.
- **Timestamps** are ISO-8601 UTC text as Prisma writes it (`2026-10-21T07:01:26.322+00:00`; bind `Date` objects in raw
  SQL, never a `Z` string, which sorts differently); `@db.Date` columns are now plain `DateTime` at midnight UTC. Raw
  rows differ by driver: D1 gives numbers and parses ISO-looking text into Dates, the local driver gives BigInt for
  integer expressions (the local client converts them to numbers) and text for date expressions, so readers accept both. In raw SQL use the helpers in `@/server/sql`: `sast(col)` (SAST wall clock, `datetime(col,'+2 hours')`),
  `sastDay(col)`, `sastHour(col)`. SAST is UTC+2 all year.
- **Raw INSERTs bind every timestamp** (`createdAt`, `updatedAt`, `queuedAt`…): the table default `CURRENT_TIMESTAMP` writes
  `YYYY-MM-DD HH:MM:SS`, which sorts before Prisma's ISO text and breaks every `>=` comparison with it.
- **Raw SQL is SQLite**: `strftime`/`date` instead of `date_trunc`/`extract`, `||` for concatenation, `json_each` instead
  of `unnest`/`= ANY`, `INSERT … ON CONFLICT DO UPDATE` works, `FOR UPDATE`/`SKIP LOCKED`/advisory locks do not exist
  (D1 serialises writes per database anyway; `@/server/locks` keeps its table-based lease), `::int` casts become
  `cast(x as integer)`, `ILIKE` becomes `LIKE` (case-insensitive for ASCII by default), `generate_series` becomes a
  recursive CTE, `COALESCE`/`SUM`/`CASE` are the same. No `pg_trgm`: member and product search use `LIKE '%q%'` on the
  indexed name columns (a LIKE pattern is at most 50 bytes).
- Migrations are plain SQL in `migrations/` (`NNNN_name.sql`), applied with `npm run db:migrate` (local) and
  `npm run db:migrate:prod`. After a schema change: `npm run generate`, then `npm run db:diff > migrations/NNNN_x.sql`
  and review it (the script quotes the `'[]'` defaults of the JSON list columns, which Prisma writes unquoted; a raw
  INSERT that leaves such a column out would otherwise store an empty value).
- Node-side tools (the seed, `scripts/*.ts`, vitest) open the SQLite file `DATABASE_URL` names (`file:…`) through
  `@prisma/adapter-better-sqlite3`; for a running `next dev` that is the local D1 file under
  `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`. Against the live D1 from a laptop, scripts use
  `PrismaD1Http` with a Cloudflare API token.

## Everything else that changed from the server days

- Files: R2 through the binding. No `UPLOAD_DIR`, no S3 keys.
- PDFs and the Studio's card pictures: Browser Rendering (`env.BROWSER`), not Playwright or sharp.
- Email: Microsoft Graph only (`MS_*`). No SMTP.
- Apple Wallet passes: signed with WebCrypto, no `openssl`.
- Jobs: Cron Triggers call the four `/api/cron/<job>` routes with `CRON_SECRET` (`worker.ts`); nothing to install.
- Start-up checks (`instrumentation.ts`) run on the first request instead of at boot.
- CPU time per request is capped at 5 minutes; long reports stream, month end and exports run as jobs.

## Sharding (phase 2: when the network passes about 50 stores)

One D1 database holds 10 GB; the demo network writes about 0.2 MB per store per trading day, so one database carries
roughly 50 stores for a year. Beyond that the data is split by what owns it, with the same code and the same client:

- **The hub** (`DB`): everything network-wide: companies, regions, the store directory, users, settings, the catalogue
  (products, variants, batches, price lists, promotions), members and their loyalty, online orders, trade, campaigns
  and the Studio, announcements, the rollups (`DailyStoreStat`, `DailyVariantStat`), the audit log.
- **One database per store** (`DB_<code>`, bindings added to `wrangler.jsonc` by `npm run shards`, 5,000 fit on a
  Worker): the store's sales and sale lines, stock levels, movements and stock takes, shifts and cash-ups, devices,
  loss alerts, commission runs, display feeds.
- **One database per company** (`DB_BOOKS_<id>`): the ledger (journals, postings, balances, bank statements).

`@/server/db` grows `storeDb(storeId)` and `booksDb(companyId)`; `db` stays the hub. Writes that cross a boundary go
through an outbox row in the writer's own database and a Queue consumer that applies them to the other side
idempotently, the way `LedgerQueue` already carries postings: a sale posts its loyalty points and its rollup deltas as
outbox rows, the consumer applies them to the hub. Reads that cross a boundary (HQ reports, a member's purchases across
stores) read the hub's rollups and outbox-fed tables, never the shards, as the reporting rules already require. Moving
a store to its own database is a job: copy its rows, flip its routing row in the hub, drop the copies.

